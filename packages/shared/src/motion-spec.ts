// motion_spec — the contract between the Storyboard agent and the Remotion
// parametric library (PLAN §5). This is the load-bearing interface of the
// visual moat: the Storyboard agent emits motion_spec; the parametrization
// framework (Phase 1 software deliverable, §9) renders it from VALIDATED
// library assets. Accuracy lives in the asset, not in per-render inference.
//
// A `module` names a validated mechanism module (e.g. "receptor_agonism").
// `params` are schema-checked against that module's allowed parameters — an
// out-of-range param is a hard error, not a silent bad frame (§5.2 guardrail).

import { z } from 'zod';

export const Keyframe = z.object({
  /** seconds from scene start */
  t: z.number().min(0),
  /** named state the module knows how to animate to (module-defined) */
  state: z.string(),
  easing: z.enum(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']).default('ease-in-out'),
});

export const MotionSpec = z.object({
  /** Validated mechanism module key from the library registry. */
  module: z.string(),
  /** Module-specific parameters; validated against the module's own schema. */
  params: z.record(z.unknown()).default({}),
  /** Scene duration in seconds. */
  durationSec: z.number().positive(),
  /** Ordered keyframes driving the parametric animation. */
  keyframes: z.array(Keyframe).min(1),
  /** Camera moves over the (parametric, not raster) scene. */
  camera: z
    .object({
      from: z.tuple([z.number(), z.number(), z.number()]).optional(), // x,y,zoom
      to: z.tuple([z.number(), z.number(), z.number()]).optional(),
    })
    .optional(),
  /** Optional non-anatomical background ref (Flux/Ideogram only — never the diagram). */
  backgroundAssetId: z.string().optional(),
  /** Caption/VO sync handle back to the script beat. */
  beatIndex: z.number().int().nonnegative(),
});

export type MotionSpec = z.infer<typeof MotionSpec>;
export type Keyframe = z.infer<typeof Keyframe>;
