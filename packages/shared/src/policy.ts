import type { MedicationEvidence, QcReport, Script } from './schemas';

/**
 * Automated editorial policy.
 *
 * In autonomous mode these functions ARE the reviewer, so they must be
 * strict: a script that fails any check bounces back to SCRIPTING (with the
 * failure reasons fed to the model) or the run fails after max revisions.
 */

export interface PolicyResult {
  ok: boolean;
  failures: string[];
}

const BANNED_PHRASES = [
  // Absolute safety/efficacy promises are never acceptable in health content.
  'completely safe',
  'no side effects at all',
  'guaranteed to work',
  'cures everything',
  'miracle drug',
  '100% safe',
  'never causes',
  // Anti-adherence framing.
  'stop taking your medication',
  "don't listen to your doctor",
];

const REQUIRED_DISCLAIMER_TERMS = ['education', 'doctor', 'pharmacist'];

/**
 * Script review policy — every check must pass before a script may proceed
 * to storyboarding.
 */
/** Average spoken words per second (measured on ElevenLabs narration). */
export const NARRATION_WPS = 2.8;

export function scriptWordCount(script: Script): number {
  return [script.hook, ...script.sections.map((s) => s.narration), script.outro]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * The animation plan must reproduce (near) the full script narration — a
 * plan that silently drops content produces a video far shorter than the
 * script. Returns ok=false with the shortfall when coverage is too low.
 */
export function planCoversScript(
  planNarrationWords: number,
  script: Script,
  minRatio = 0.85,
): PolicyResult {
  const scriptWords = scriptWordCount(script);
  const ratio = scriptWords === 0 ? 1 : planNarrationWords / scriptWords;
  if (ratio < minRatio) {
    return {
      ok: false,
      failures: [
        `Animation plan narration is only ${planNarrationWords} words vs the script's ${scriptWords} ` +
          `(${Math.round(ratio * 100)}%). Include the FULL narration — every sentence of the hook, ` +
          `each section, and the outro — split across scenes verbatim, dropping nothing.`,
      ],
    };
  }
  return { ok: true, failures: [] };
}

export function reviewScript(
  script: Script,
  evidence: MedicationEvidence,
  targetDurationSec?: number,
): PolicyResult {
  const failures: string[] = [];

  // 0. Length: a script far shorter than target wastes the video slot and
  // fails QC after paid media generation — catch it here, before any spend.
  if (targetDurationSec) {
    const words = scriptWordCount(script);
    const estimatedSec = words / NARRATION_WPS;
    const minSec = targetDurationSec * 0.65;
    if (estimatedSec < minSec) {
      const neededWords = Math.ceil(minSec * NARRATION_WPS);
      failures.push(
        `Script too short: ~${Math.round(estimatedSec)}s of narration (${words} words) for a ${targetDurationSec}s target. ` +
          `Expand every section with more explanation, metaphors, and examples to at least ${neededWords} words total.`,
      );
    }
  }
  const sourceIds = new Set(evidence.sources.map((s) => s.id));

  // 1. Citation coverage: every claim's sources must exist in the ledger.
  let claimCount = 0;
  for (const section of script.sections) {
    claimCount += section.claims.length;
    for (const claim of section.claims) {
      for (const id of claim.sourceIds) {
        if (!sourceIds.has(id)) {
          failures.push(
            `Section "${section.heading}": claim "${claim.text.slice(0, 60)}" cites unknown source "${id}".`,
          );
        }
      }
    }
  }

  // 2. Claim density: a factual medication video with almost no mapped
  // claims means the model skipped the citation contract.
  if (claimCount < script.sections.length) {
    failures.push(
      `Only ${claimCount} cited claims across ${script.sections.length} sections — every section must map its factual statements to sources.`,
    );
  }

  // 3. Banned phrasing.
  const fullText = [
    script.hook,
    ...script.sections.map((s) => s.narration),
    script.outro,
    script.title,
    script.description,
  ]
    .join(' ')
    .toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (fullText.includes(phrase)) {
      failures.push(`Banned phrase present: "${phrase}".`);
    }
  }

  // 4. Disclaimer must exist and cover the required ground.
  const disclaimer = script.disclaimer.toLowerCase();
  for (const term of REQUIRED_DISCLAIMER_TERMS) {
    if (!disclaimer.includes(term)) {
      failures.push(`Disclaimer must mention "${term}".`);
    }
  }

  // 5. Numeric statistics in narration must be backed by a claim entry.
  // Any percentage or "X in Y" pattern must appear inside a cited claim.
  const statPattern = /\b\d+(?:\.\d+)?\s*(?:%|percent)|\b\d+\s+in\s+\d+\b/gi;
  const citedText = script.sections
    .flatMap((s) => s.claims.map((c) => c.text))
    .join(' ')
    .toLowerCase();
  for (const section of script.sections) {
    const stats = section.narration.match(statPattern) ?? [];
    for (const stat of stats) {
      if (!citedText.includes(stat.toLowerCase())) {
        failures.push(
          `Section "${section.heading}" uses statistic "${stat}" that is not covered by a cited claim.`,
        );
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

/** Upload/publish gate used by autonomous mode in place of a human. */
export function reviewQc(qc: QcReport, targetDurationSec: number): PolicyResult {
  const failures: string[] = [];
  if (!qc.passed) failures.push('QC report is marked failed.');
  for (const check of qc.checks) {
    if (!check.passed) failures.push(`QC check failed: ${check.name} — ${check.detail}`);
  }
  if (qc.videoWidth !== 1920 || qc.videoHeight !== 1080) {
    failures.push(`Video is ${qc.videoWidth}x${qc.videoHeight}, expected 1920x1080.`);
  }
  if (!qc.hasAudioStream) failures.push('Video has no audio stream.');
  // Duration tolerance: within 40% of target (narration pacing varies).
  const min = targetDurationSec * 0.6;
  const max = targetDurationSec * 1.4;
  if (qc.videoDurationSec < min || qc.videoDurationSec > max) {
    failures.push(
      `Duration ${Math.round(qc.videoDurationSec)}s outside acceptable range ${Math.round(min)}–${Math.round(max)}s.`,
    );
  }
  return { ok: failures.length === 0, failures };
}

/** Maximum automatic script revision attempts before the run fails. */
export const MAX_SCRIPT_REVISIONS = 4;

/**
 * Daily publish slots (UTC) — morning, afternoon, evening in US Eastern
 * (9:00 AM, 1:30 PM, 6:00 PM ET during daylight time).
 */
export const PUBLISH_SLOTS_UTC: readonly { hour: number; minute: number }[] = [
  { hour: 13, minute: 0 },
  { hour: 17, minute: 30 },
  { hour: 22, minute: 0 },
];

/** Earliest publish slot strictly after `after` (looks ahead day by day). */
export function nextPublishSlot(after: Date): Date {
  for (let day = 0; day < 8; day++) {
    for (const slot of PUBLISH_SLOTS_UTC) {
      const candidate = new Date(after);
      candidate.setUTCDate(candidate.getUTCDate() + day);
      candidate.setUTCHours(slot.hour, slot.minute, 0, 0);
      if (candidate.getTime() > after.getTime()) return candidate;
    }
  }
  throw new Error('nextPublishSlot: no slot found within 8 days');
}
