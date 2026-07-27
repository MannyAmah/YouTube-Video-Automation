import { describe, expect, it } from 'vitest';
import { gatherEvidence } from '../src/evidence';
import { normalizeMedication } from '../src/rxnorm';

/**
 * Live integration tests against the real FDA/NIH public APIs (no keys).
 * These prove the research adapter works against reality, which is the
 * whole point of the evidence-first design.
 */
describe('FDA/NIH research (live)', () => {
  it('normalizes a brand name to its ingredient', async () => {
    const result = await normalizeMedication('glucophage');
    expect(result.name.toLowerCase()).toContain('metformin');
  }, 60_000);

  it('gathers a complete evidence bundle for metformin', async () => {
    const evidence = await gatherEvidence('metformin');
    expect(evidence.genericName.toLowerCase()).toContain('metformin');
    expect(evidence.sources.length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(evidence.labelSections)).toContain('indications_and_usage');
    for (const source of evidence.sources) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.excerpt.length).toBeGreaterThan(0);
    }
    // The bundle is restricted to FDA/NIH domains.
    for (const source of evidence.sources) {
      expect(source.url).toMatch(/fda\.gov|nih\.gov|nlm\.nih\.gov|medlineplus\.gov/);
    }
  }, 120_000);

  it('fails loudly for an unknown medication', async () => {
    await expect(gatherEvidence('notarealdrugxyzzy')).rejects.toThrow();
  }, 60_000);
});
