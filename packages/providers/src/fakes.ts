import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { stat } from 'fs/promises';
import { promisify } from 'util';
import {
  AnimationPlan,
  AnimationPlanSchema,
  MedicationEvidence,
  MedicationEvidenceSchema,
  Script,
  ScriptSchema,
} from '@yva/shared';
import {
  ImageProvider,
  ImageResult,
  ProviderError,
  StructuredRequest,
  TextProvider,
  TokenUsage,
  TtsProvider,
  TtsResult,
  UploadRequest,
  YouTubeChannelInfo,
  YouTubeClient,
  YouTubeVideoStatus,
} from './types';

const execFileAsync = promisify(execFile);

/**
 * TEST-MODE providers.
 *
 * These exist so the full pipeline — including FFmpeg rendering, artifact
 * validation, QC, and upload orchestration — can be exercised end-to-end
 * without paid API keys and without any chance of touching a real YouTube
 * channel. Every artifact they produce is a REAL file (real speech audio via
 * espeak-ng, real PNGs, real MP4s) and is labelled producer="fake-test".
 *
 * They are only reachable when TEST_MODE=true; the registry refuses to
 * construct them otherwise.
 */

export const FAKE_PRODUCER = 'fake-test';

/** Markers the pipeline uses to embed upstream JSON in prompts. */
export const EVIDENCE_MARKER = 'EVIDENCE_JSON';
export const SCRIPT_MARKER = 'SCRIPT_JSON';

function extractMarked(user: string, marker: string): string | null {
  const match = user.match(new RegExp(`<${marker}>([\\s\\S]*?)</${marker}>`));
  return match ? match[1]!.trim() : null;
}

function sentences(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const parts = clean.split(/(?<=[.!?])\s+/).slice(0, max);
  return parts.join(' ');
}

/**
 * Deterministic script builder. Content is honestly derived from the real
 * FDA/NIH evidence bundle embedded in the prompt: it quotes and condenses
 * label sections rather than inventing anything, and cites the exact source
 * ids it drew from. It is intentionally dry — its job is to exercise the
 * pipeline, not to ship.
 */
function buildFakeScript(evidence: MedicationEvidence): Script {
  const name = evidence.genericName;
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const s = evidence.labelSections;

  const sectionDefs: { key: string; heading: string; visual: string }[] = [
    { key: 'indications_and_usage', heading: `What ${cap} is for`, visual: 'A friendly body map highlighting the condition treated' },
    { key: 'mechanism_of_action', heading: `How ${cap} works in your body`, visual: 'Cartoon cells with locks and keys showing the drug binding' },
    { key: 'dosage_and_administration', heading: `How ${cap} is taken`, visual: 'A calendar and pill bottle with gentle reminder icons' },
    { key: 'adverse_reactions', heading: 'Side effects to know about', visual: 'Soft warning signposts along a road' },
    { key: 'drug_interactions', heading: `What ${cap} does not mix well with`, visual: 'Two puzzle pieces that do not fit together' },
  ];

  const sections = sectionDefs
    .filter((d) => s[d.key])
    .map((d, i) => {
      const text = sentences(s[d.key]!, 4);
      return {
        id: `sec_${i + 1}`,
        heading: d.heading,
        narration: `${text}`,
        // Claim text mirrors the narration exactly so the citation policy's
        // statistic-coverage check holds for label text containing numbers.
        claims: [{ text, sourceIds: [`label_${d.key}`] }],
        visualIdea: d.visual,
      };
    });

  if (sections.length < 4) {
    // Pad from any remaining populated sections so schema minimums hold.
    for (const [key, text] of Object.entries(s)) {
      if (sections.length >= 4) break;
      if (sections.some((sec) => sec.claims[0]!.sourceIds[0] === `label_${key}`)) continue;
      const padText = sentences(text, 3);
      sections.push({
        id: `sec_${sections.length + 1}`,
        heading: `More about ${cap}: ${key.replace(/_/g, ' ')}`,
        narration: padText,
        claims: [{ text: padText, sourceIds: [`label_${key}`] }],
        visualIdea: 'Simple illustrated card with key point',
      });
    }
  }

  const script: Script = {
    title: `${cap}: How It Works, Explained Simply [TEST RENDER]`,
    description:
      `Test-mode render exercising the MedExplained pipeline for ${name}. ` +
      `All statements are condensed verbatim from the FDA label and NIH sources cited in production metadata. Not for publication.`,
    tags: [name, 'medication', 'test'],
    hook: `Millions of people take ${name} — but what does it actually do inside your body? Let's walk through it together, step by step.`,
    sections,
    outro: `That's the story of ${name}. Understanding your medication is a big step toward taking it safely.`,
    disclaimer:
      'This video is for education only and is not medical advice. Always talk with your doctor or pharmacist before starting, stopping, or changing any medication.',
    estimatedDurationSec: 60 + sections.length * 45,
  };
  return ScriptSchema.parse(script);
}

interface FakeScene {
  id: string;
  sectionId: string;
  narration: string;
  primitive: string;
  params: Record<string, unknown>;
  caption: string;
}

function buildFakeAnimationPlan(script: Script): AnimationPlan {
  // Deterministic plan exercising several primitives — enough to drive the
  // real Manim engine end-to-end in test mode.
  const scenes: FakeScene[] = [
    {
      id: 'scene_1',
      sectionId: 'hook',
      narration: script.hook,
      primitive: 'title_card',
      params: { title: script.title.replace(/\s*\[TEST RENDER\]\s*/, ''), subtitle: 'explained simply' },
      caption: '',
    },
  ];
  script.sections.forEach((section, i) => {
    scenes.push({
      id: `scene_${i + 2}`,
      sectionId: section.id,
      narration: section.narration,
      primitive: 'concept_card',
      params: { headline: section.heading, sublines: [] },
      caption: section.heading.slice(0, 78),
    });
  });
  scenes.push({
    id: `scene_${script.sections.length + 2}`,
    sectionId: 'outro',
    narration: `${script.outro} ${script.disclaimer}`,
    primitive: 'outro_card',
    params: { line1: 'Education only —', line2: 'talk to your doctor or pharmacist.' },
    caption: '',
  });

  return AnimationPlanSchema.parse({
    scenes,
    thumbnailPrompt: `Bold friendly illustration about ${script.title}`,
    thumbnailTitleText: script.title.replace(/\s*\[TEST RENDER\]\s*/, '').slice(0, 38),
  });
}

export class FakeTextProvider implements TextProvider {
  readonly name = FAKE_PRODUCER;

  async generateStructured<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: TokenUsage }> {
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    const evidenceJson = extractMarked(req.user, EVIDENCE_MARKER);
    const scriptJson = extractMarked(req.user, SCRIPT_MARKER);

    let candidate: unknown;
    if (req.schemaDescription.includes('AnimationPlan')) {
      if (!scriptJson) throw new ProviderError(this.name, 'No <SCRIPT_JSON> in prompt', false);
      candidate = buildFakeAnimationPlan(ScriptSchema.parse(JSON.parse(scriptJson)));
    } else if (req.schemaDescription.includes('Script')) {
      if (!evidenceJson) throw new ProviderError(this.name, 'No <EVIDENCE_JSON> in prompt', false);
      candidate = buildFakeScript(MedicationEvidenceSchema.parse(JSON.parse(evidenceJson)));
    } else {
      throw new ProviderError(
        this.name,
        `Fake text provider cannot satisfy schema: ${req.schemaDescription.slice(0, 80)}`,
        false,
      );
    }
    const parsed = req.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new ProviderError(this.name, `Fake output failed schema: ${parsed.error.message}`, false);
    }
    return { data: parsed.data, usage };
  }
}

/** Real offline speech via espeak-ng, converted to mp3 with ffmpeg. */
export class FakeTtsProvider implements TtsProvider {
  readonly name = FAKE_PRODUCER;

  async synthesize(text: string, outPath: string): Promise<TtsResult> {
    const wavPath = `${outPath}.tmp.wav`;
    try {
      await execFileAsync('espeak-ng', ['-v', 'en-us+f3', '-s', '150', '-w', wavPath, text], {
        timeout: 120_000,
      });
      await execFileAsync(
        'ffmpeg',
        ['-y', '-i', wavPath, '-ar', '44100', '-b:a', '128k', outPath],
        { timeout: 120_000 },
      );
      const info = await stat(outPath);
      if (info.size < 1_000) throw new ProviderError(this.name, 'espeak produced no audio');
      return { bytes: info.size, mimeType: 'audio/mpeg', voice: 'espeak-en-us-f3', provider: this.name };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(this.name, `Fake TTS failed: ${(err as Error).message}`, false, err);
    } finally {
      await execFileAsync('rm', ['-f', wavPath]).catch(() => undefined);
    }
  }
}

const FAKE_BG_COLORS = ['0x2E4057', '0x4E6E58', '0x6D466B', '0x8A6552', '0x3D5A80', '0x5F5AA2'];

/** Real 1920x1080 PNG scene cards rendered with ffmpeg drawtext. */
export class FakeImageProvider implements ImageProvider {
  readonly name = FAKE_PRODUCER;

  async generate(prompt: string, outPath: string): Promise<ImageResult> {
    const hash = createHash('sha256').update(prompt).digest();
    const color = FAKE_BG_COLORS[hash[0]! % FAKE_BG_COLORS.length]!;
    const text = prompt.replace(/[^a-zA-Z0-9 ,.]/g, '').slice(0, 90);
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-f', 'lavfi',
          '-i', `color=c=${color}:s=1920x1080:d=1`,
          '-vf',
          `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${text.replace(/'/g, '')}':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=24`,
          '-frames:v', '1',
          outPath,
        ],
        { timeout: 60_000 },
      );
      const info = await stat(outPath);
      if (info.size < 5_000) throw new ProviderError(this.name, 'Fake image render too small');
      return { bytes: info.size, mimeType: 'image/png', provider: this.name };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(this.name, `Fake image failed: ${(err as Error).message}`, false, err);
    }
  }
}

/**
 * Fake YouTube client: validates preconditions exactly like the real client
 * but never touches the network. Upload ids are deterministic per run so
 * idempotency behaviour can be tested.
 */
export class FakeYouTubeClient implements YouTubeClient {
  readonly name = FAKE_PRODUCER;
  private readonly privacy = new Map<string, string>();

  async getChannelInfo(): Promise<YouTubeChannelInfo> {
    return { channelId: 'UC_TEST_CHANNEL', title: 'MedExplained (test mode)' };
  }

  async uploadPrivate(req: UploadRequest): Promise<{ videoId: string }> {
    const info = await stat(req.filePath).catch(() => null);
    if (!info || info.size < 100_000) {
      throw new ProviderError(this.name, `Upload precondition failed: ${req.filePath} missing or too small`, false);
    }
    if (!req.filePath.endsWith('.mp4')) {
      throw new ProviderError(this.name, 'Upload precondition failed: not an .mp4 path', false);
    }
    if (req.privacyStatus !== 'private') {
      throw new ProviderError(this.name, 'Uploads must be private', false);
    }
    const videoId = `TEST${createHash('sha256').update(req.runId).digest('hex').slice(0, 8)}`;
    this.privacy.set(videoId, 'private');
    return { videoId };
  }

  async setPrivacy(videoId: string, privacy: 'private' | 'public' | 'unlisted'): Promise<void> {
    if (!this.privacy.has(videoId) && !videoId.startsWith('TEST')) {
      throw new ProviderError(this.name, `Unknown test video ${videoId}`, false);
    }
    this.privacy.set(videoId, privacy);
  }

  async getVideoStatus(videoId: string): Promise<YouTubeVideoStatus> {
    return {
      videoId,
      uploadStatus: 'processed',
      privacyStatus: this.privacy.get(videoId) ?? 'private',
      processingStatus: 'succeeded',
    };
  }

  async setThumbnail(videoId: string, thumbnailPath: string): Promise<void> {
    const info = await stat(thumbnailPath).catch(() => null);
    if (!info || info.size < 5_000) {
      throw new ProviderError(this.name, `Thumbnail missing or too small: ${thumbnailPath}`, false);
    }
  }

  async getVideoStats(): Promise<Record<string, Record<string, number>>> {
    // No simulated analytics, ever — test mode simply has no stats.
    return {};
  }
}
