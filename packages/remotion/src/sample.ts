// Sample storyboard — what the Storyboard stage emits (PLAN §3.1 ④). Used to
// render the walking-skeleton video WITHOUT external services. Metoprolol is
// chosen to span 4 PK/PD primitives accurately: oral absorption → CYP2D6
// first-pass → β1-receptor ANTAGONISM → renal clearance.
//
// Captions here are illustrative standard pharmacology. In the live pipeline the
// Fact-Check stage (§6) verifies every claim and populates the claim ledger
// BEFORE render; this offline sample bypasses only the LLM stages (no creds), not
// the safety design.

import type { StoryboardInput } from './DrugStoryVideo';

const beat = (module: string, params: Record<string, unknown>, durationSec: number, caption: string, i: number) => ({
  caption,
  spec: {
    module,
    params,
    durationSec,
    keyframes: [{ t: 0, state: 'start', easing: 'ease-in-out' as const }],
    beatIndex: i,
  },
});

export const SAMPLE_STORYBOARD: StoryboardInput = {
  title: 'How Metoprolol Works',
  drug: 'Metoprolol · β1-selective beta-blocker',
  disclaimer:
    'Educational only — not medical advice. Talk to your clinician before changing any medication.',
  beats: [
    beat('absorption', {}, 4, 'Taken by mouth, metoprolol is absorbed from the gut into the bloodstream.', 0),
    beat('cyp450_metabolism', {}, 4, 'In the liver, CYP2D6 metabolizes much of the dose — a large first-pass effect.', 1),
    beat('receptor_docking', { mode: 'antagonist' }, 3, 'It blocks β1-adrenergic receptors on the heart, slowing rate and lowering blood pressure.', 2),
    beat('renal_clearance', {}, 3, 'The metabolites are then cleared by the kidneys.', 3),
  ],
};

/** Total composition seconds incl. 3s title + 4s disclaimer cards. */
export const sampleDurationSec =
  3 + SAMPLE_STORYBOARD.beats.reduce((s, b) => s + b.spec.durationSec, 0) + 4;
