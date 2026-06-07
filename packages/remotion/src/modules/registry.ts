// Mechanism-module registry — the parametric library's index (PLAN §5.3).
// A module = VALIDATED vector art (illustrator) + a parametrized React/Remotion
// component (engineer). One module serves a whole drug CLASS, not one drug, so
// coverage compounds. Each module declares the params it accepts; motion_spec
// is validated against this before render (deterministic accuracy guard, §5.2).
//
// Phase 0: the registry contract + a single placeholder. Phase 1 adds the
// universal PK/PD primitives (PLAN §5.3) — ADME path (absorption, CYP450
// first-pass, distribution, renal clearance) + target-interaction archetypes
// (receptor agonist/antagonist, enzyme inhibition, transporter/ion-channel
// blockade, signal cascade) — once the illustrator delivers and Emmanuel (RN)
// validates the assets. These primitives span ~every drug's story.

import type { ComponentType } from 'react';
import { z } from 'zod';

export interface MechanismModule {
  key: string;
  /** Human description + the drug classes / mechanisms it covers. */
  covers: string;
  /** Zod schema for this module's allowed params — the accuracy gate. */
  paramsSchema: z.ZodTypeAny;
  /** Whether an RN has validated the underlying art (gates production use). */
  validated: boolean;
  Component: ComponentType<{ params: unknown; frame: number; fps: number }>;
}

export const MODULE_REGISTRY: Record<string, MechanismModule> = {};

export function registerModule(m: MechanismModule): void {
  MODULE_REGISTRY[m.key] = m;
}
