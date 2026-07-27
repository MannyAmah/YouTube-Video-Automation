import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MedicationEvidence, reviewScript, ScriptSchema, StoryboardSchema } from '@yva/shared';
import { FakeTextProvider, FakeYouTubeClient } from '../src/fakes';

const evidence: MedicationEvidence = {
  genericName: 'examplomab',
  brandNames: ['Examplo'],
  rxcui: '999',
  drugClass: 'Example Class',
  manufacturers: ['Example Labs'],
  labelSections: {
    indications_and_usage: 'Examplomab is indicated for example disease. It reduces flare frequency. Use with diet. It is taken weekly.',
    mechanism_of_action: 'Examplomab binds the example receptor. This blocks signaling. Symptoms improve. The effect lasts days.',
    dosage_and_administration: 'Take once weekly. Swallow whole. Do not crush. Take with water.',
    adverse_reactions: 'Common reactions include headache. Some patients report nausea. Rash may occur. Serious reactions are rare.',
    drug_interactions: 'Avoid grapefruit juice. Tell your doctor about blood thinners. Interactions can change drug levels. Monitor closely.',
  },
  sources: [
    'indications_and_usage',
    'mechanism_of_action',
    'dosage_and_administration',
    'adverse_reactions',
    'drug_interactions',
  ].map((section) => ({
    id: `label_${section}`,
    type: 'openfda_label' as const,
    title: `FDA label — ${section}`,
    url: 'https://api.fda.gov/drug/label.json?search=examplomab',
    excerpt: 'excerpt',
    section,
    retrievedAt: new Date().toISOString(),
  })),
};

describe('FakeTextProvider', () => {
  const provider = new FakeTextProvider();

  it('builds a schema-valid script that passes the citation policy', async () => {
    const { data } = await provider.generateStructured({
      system: 'sys',
      user: `<EVIDENCE_JSON>${JSON.stringify(evidence)}</EVIDENCE_JSON>`,
      schema: ScriptSchema,
      schemaDescription: 'Script JSON: {...}',
    });
    const review = reviewScript(data, evidence);
    expect(review.failures).toEqual([]);
    expect(data.sections.length).toBeGreaterThanOrEqual(4);
  });

  it('builds a schema-valid storyboard from a script', async () => {
    const { data: script } = await provider.generateStructured({
      system: 'sys',
      user: `<EVIDENCE_JSON>${JSON.stringify(evidence)}</EVIDENCE_JSON>`,
      schema: ScriptSchema,
      schemaDescription: 'Script JSON: {...}',
    });
    const { data: storyboard } = await provider.generateStructured({
      system: 'sys',
      user: `<SCRIPT_JSON>${JSON.stringify(script)}</SCRIPT_JSON>`,
      schema: StoryboardSchema,
      schemaDescription: 'Storyboard JSON: {...}',
    });
    expect(storyboard.scenes.length).toBeGreaterThanOrEqual(6);
  });

  it('refuses prompts without embedded upstream JSON', async () => {
    await expect(
      provider.generateStructured({
        system: 'sys',
        user: 'no evidence here',
        schema: ScriptSchema,
        schemaDescription: 'Script JSON',
      }),
    ).rejects.toThrow();
  });
});

describe('FakeYouTubeClient upload preconditions', () => {
  let dir: string;
  const client = new FakeYouTubeClient();

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'yva-fakes-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const base = {
    title: 'T',
    description: 'D',
    tags: [],
    categoryId: '27',
    privacyStatus: 'private' as const,
    runId: 'run1',
  };

  it('rejects a missing file', async () => {
    await expect(client.uploadPrivate({ ...base, filePath: join(dir, 'nope.mp4') })).rejects.toThrow(
      /missing or too small/,
    );
  });

  it('rejects an undersized file (placeholder-shaped input)', async () => {
    const small = join(dir, 'small.mp4');
    await writeFile(small, 'tiny');
    await expect(client.uploadPrivate({ ...base, filePath: small })).rejects.toThrow();
  });

  it('accepts a plausible file, is idempotent per run, and starts private', async () => {
    const big = join(dir, 'video.mp4');
    await writeFile(big, Buffer.alloc(200_000, 1));
    const first = await client.uploadPrivate({ ...base, filePath: big });
    const second = await client.uploadPrivate({ ...base, filePath: big });
    expect(first.videoId).toBe(second.videoId);
    expect((await client.getVideoStatus(first.videoId)).privacyStatus).toBe('private');
    await client.setPrivacy(first.videoId, 'public');
    expect((await client.getVideoStatus(first.videoId)).privacyStatus).toBe('public');
  });
});
