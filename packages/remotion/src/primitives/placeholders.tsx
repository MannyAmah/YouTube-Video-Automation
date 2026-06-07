// Placeholder PK/PD primitives (PLAN §5.3, walking-skeleton milestone).
// Simple line-art SVG stand-ins driven through the REAL motion_spec framework.
// validated:false → they render watermarked and can only ship UNLISTED. The
// commissioned illustrator later swaps these for RN-validated art behind the
// SAME registry contract, with no pipeline change (Milestone 2).

import { interpolate } from 'remotion';
import { z } from 'zod';
import { registerModule } from '../modules/registry';

const INK = '#1a1a1a';
const stroke = { stroke: INK, strokeWidth: 3, fill: 'none' as const };

type P = { params: unknown; frame: number; fps: number };

// ── Absorption: a drug dot crossing the gut membrane into blood ──────────
const Absorption: React.FC<P> = ({ frame, fps }) => {
  const x = interpolate(frame, [0, fps * 4], [120, 1500], { extrapolateRight: 'clamp' });
  return (
    <svg viewBox="0 0 1920 1080" width="100%" height="100%">
      <line x1="760" y1="120" x2="760" y2="960" {...stroke} strokeDasharray="14 12" />
      <text x="600" y="90" fontFamily="sans-serif" fontSize="34" fill={INK}>gut lumen</text>
      <text x="900" y="90" fontFamily="sans-serif" fontSize="34" fill={INK}>bloodstream</text>
      <circle cx={x} cy="540" r="34" {...stroke} />
    </svg>
  );
};

// ── CYP450 first-pass: liver enzyme transforming a molecule ──────────────
const Cyp450: React.FC<P> = ({ frame, fps }) => {
  const t = interpolate(frame, [0, fps * 4], [0, 1], { extrapolateRight: 'clamp' });
  const r = interpolate(t, [0, 1], [34, 18]);
  return (
    <svg viewBox="0 0 1920 1080" width="100%" height="100%">
      <polygon points="860,420 1060,420 1160,540 1060,660 860,660 760,540" {...stroke} />
      <text x="840" y="560" fontFamily="sans-serif" fontSize="40" fill={INK}>CYP450</text>
      <circle cx={interpolate(t, [0, 1], [300, 760])} cy="540" r="34" {...stroke} />
      <circle cx={interpolate(t, [0, 1], [1160, 1620])} cy="540" r={r} {...stroke} />
    </svg>
  );
};

// ── Receptor docking: ligand into a receptor pocket (agonist|antagonist) ─
const ReceptorDocking: React.FC<P> = ({ params, frame, fps }) => {
  const mode = (params as { mode?: string })?.mode ?? 'agonist';
  const x = interpolate(frame, [0, fps * 3], [1500, 980], { extrapolateRight: 'clamp' });
  return (
    <svg viewBox="0 0 1920 1080" width="100%" height="100%">
      <path d="M820,360 q140,-120 280,0 v360 h-280 z" {...stroke} />
      <circle cx={x} cy="500" r="40" {...stroke} />
      <text x="780" y="820" fontFamily="sans-serif" fontSize="36" fill={INK}>
        receptor — {mode}
      </text>
    </svg>
  );
};

// ── Renal clearance: kidney filtering drug out to urine ──────────────────
const RenalClearance: React.FC<P> = ({ frame, fps }) => {
  const drop = interpolate(frame % (fps * 2), [0, fps * 2], [620, 980]);
  return (
    <svg viewBox="0 0 1920 1080" width="100%" height="100%">
      <path d="M820,300 q220,40 220,260 q0,220 -220,260 q-120,-260 0,-520 z" {...stroke} />
      <text x="700" y="560" fontFamily="sans-serif" fontSize="40" fill={INK}>kidney</text>
      <circle cx="980" cy={drop} r="20" {...stroke} />
      <text x="900" y="1030" fontFamily="sans-serif" fontSize="32" fill={INK}>cleared</text>
    </svg>
  );
};

// ── register all four as PLACEHOLDER modules (validated:false) ────────────
registerModule({ key: 'absorption', covers: 'ADME: absorption across a membrane', paramsSchema: z.object({}).passthrough(), validated: false, Component: Absorption });
registerModule({ key: 'cyp450_metabolism', covers: 'ADME: hepatic first-pass / CYP450 metabolism', paramsSchema: z.object({}).passthrough(), validated: false, Component: Cyp450 });
registerModule({ key: 'receptor_docking', covers: 'target interaction: receptor agonist/antagonist', paramsSchema: z.object({ mode: z.enum(['agonist', 'antagonist']).default('agonist') }).passthrough(), validated: false, Component: ReceptorDocking });
registerModule({ key: 'renal_clearance', covers: 'ADME: renal clearance', paramsSchema: z.object({}).passthrough(), validated: false, Component: RenalClearance });

export const PLACEHOLDER_MODULE_KEYS = ['absorption', 'cyp450_metabolism', 'receptor_docking', 'renal_clearance'] as const;
