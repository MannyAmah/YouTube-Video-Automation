import { describe, expect, it } from 'vitest';
import { reviewQc, reviewScript } from '../src/policy';
import type { MedicationEvidence, QcReport, Script } from '../src/schemas';

const evidence: MedicationEvidence = {
  genericName: 'testdrug',
  brandNames: ['TestBrand'],
  rxcui: '123',
  drugClass: 'Test Class',
  manufacturers: ['Test Pharma'],
  labelSections: { indications_and_usage: 'Treats testitis.' },
  sources: [
    {
      id: 'label_indications_and_usage',
      type: 'openfda_label',
      title: 'FDA label',
      url: 'https://api.fda.gov/drug/label.json?search=test',
      excerpt: 'Treats testitis. In trials, 12% of patients reported headaches.',
      retrievedAt: new Date().toISOString(),
    },
  ],
};

function makeScript(overrides: Partial<Script> = {}): Script {
  const section = {
    id: 'sec_1',
    heading: 'What it does',
    narration: 'Testdrug helps with testitis.',
    claims: [{ text: 'Testdrug helps with testitis.', sourceIds: ['label_indications_and_usage'] }],
    visualIdea: 'A friendly cell',
  };
  return {
    title: 'Testdrug explained simply',
    description: 'An educational explainer.',
    tags: ['testdrug'],
    hook: 'What does testdrug actually do?',
    sections: [section, { ...section, id: 'sec_2' }, { ...section, id: 'sec_3' }, { ...section, id: 'sec_4' }],
    outro: 'Thanks for watching.',
    disclaimer:
      'This video is for education only. Always talk to your doctor or pharmacist about your medications.',
    estimatedDurationSec: 400,
    ...overrides,
  };
}

describe('reviewScript', () => {
  it('passes a fully cited script', () => {
    const result = reviewScript(makeScript(), evidence);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails a claim citing an unknown source', () => {
    const script = makeScript();
    script.sections[0]!.claims[0]!.sourceIds = ['made_up_source'];
    const result = reviewScript(script, evidence);
    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('unknown source');
  });

  it('fails an uncited statistic in narration (the v1 fabrication bug)', () => {
    const script = makeScript();
    script.sections[1]!.narration = 'About 90% of people feel better right away.';
    const result = reviewScript(script, evidence);
    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('90%');
  });

  it('allows a statistic that is covered by a cited claim', () => {
    const script = makeScript();
    script.sections[1]!.narration = 'In trials, 12% of patients reported headaches.';
    script.sections[1]!.claims = [
      {
        text: 'In trials, 12% of patients reported headaches.',
        sourceIds: ['label_indications_and_usage'],
      },
    ];
    expect(reviewScript(script, evidence).ok).toBe(true);
  });

  it('fails banned absolute-safety phrasing', () => {
    const script = makeScript({ hook: 'Testdrug is completely safe for everyone!' });
    const result = reviewScript(script, evidence);
    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('completely safe');
  });

  it('fails a weak disclaimer', () => {
    const script = makeScript({ disclaimer: 'This is a really great video about medications ok.' });
    expect(reviewScript(script, evidence).ok).toBe(false);
  });
});

describe('nextPublishSlot', () => {
  it('picks the next slot today, then rolls to tomorrow morning', async () => {
    const { nextPublishSlot } = await import('../src/policy');
    const morning = new Date('2026-07-27T08:00:00Z');
    expect(nextPublishSlot(morning).toISOString()).toBe('2026-07-27T13:00:00.000Z');
    const midday = new Date('2026-07-27T13:00:00Z'); // exactly at slot → next one
    expect(nextPublishSlot(midday).toISOString()).toBe('2026-07-27T17:30:00.000Z');
    const night = new Date('2026-07-27T23:00:00Z');
    expect(nextPublishSlot(night).toISOString()).toBe('2026-07-28T13:00:00.000Z');
  });
});

describe('reviewQc', () => {
  const goodQc: QcReport = {
    passed: true,
    checks: [{ name: 'file_exists', passed: true, detail: 'ok' }],
    videoDurationSec: 400,
    videoWidth: 1920,
    videoHeight: 1080,
    hasAudioStream: true,
    fileBytes: 20_000_000,
    checksumSha256: 'a'.repeat(64),
  };

  it('passes a valid report near target duration', () => {
    expect(reviewQc(goodQc, 420).ok).toBe(true);
  });

  it('fails wrong resolution', () => {
    expect(reviewQc({ ...goodQc, videoWidth: 1280, videoHeight: 720 }, 420).ok).toBe(false);
  });

  it('fails missing audio', () => {
    expect(reviewQc({ ...goodQc, hasAudioStream: false }, 420).ok).toBe(false);
  });

  it('fails duration far outside target', () => {
    expect(reviewQc({ ...goodQc, videoDurationSec: 60 }, 420).ok).toBe(false);
  });
});

describe('chunkScript', () => {
  it('covers the entire script narration across scenes (no dropped words)', async () => {
    const { chunkScript } = await import('../src/schemas');
    const script = makeScript();
    const chunks = chunkScript(script, 40);
    const chunkWords = chunks.map((c: { narration: string }) => c.narration).join(' ').split(/\s+/).filter(Boolean).length;
    const scriptWords = [script.hook, ...script.sections.map((s) => s.narration), script.outro, script.disclaimer]
      .join(' ').split(/\s+/).filter(Boolean).length;
    // Every word of hook + sections + outro + disclaimer is present.
    expect(chunkWords).toBe(scriptWords);
    expect(chunks[0].sectionId).toBe('hook');
    expect(chunks[chunks.length - 1].sectionId).toBe('disclaimer');
  });
});
