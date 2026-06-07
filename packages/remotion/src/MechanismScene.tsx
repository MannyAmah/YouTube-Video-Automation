// MechanismScene — renders one motion_spec by looking up its validated module
// and driving it from keyframes (PLAN §5). This is the parametrization
// framework's render entry point: the diagram is the module's geometry, NOT a
// pan over a generated still. A motion_spec referencing an unknown or
// unvalidated module is a hard error — we never render a "bad frame".

import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { MotionSpec } from '@vitalis/shared';
import { MODULE_REGISTRY } from './modules/registry';

export const MechanismScene: React.FC<{ spec: unknown }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const parsed = MotionSpec.safeParse(spec);
  if (!parsed.success) {
    throw new Error(`invalid motion_spec: ${parsed.error.message}`);
  }
  const { module: moduleKey, params } = parsed.data;

  const mod = MODULE_REGISTRY[moduleKey];
  if (!mod) throw new Error(`unknown mechanism module: '${moduleKey}'`);

  // §5.2 guard, reconciled with the walking-skeleton (founder direction 2026-06-07):
  // a non-validated PLACEHOLDER module renders, but is visibly watermarked and may
  // NEVER reach a public publish — the publish stage refuses public when any asset
  // is unvalidated. So placeholder art can only ship UNLISTED. Validated modules
  // render clean.
  const checkedParams = mod.paramsSchema.parse(params);
  const { Component } = mod;

  return (
    <AbsoluteFill style={{ backgroundColor: '#fbfbf9' }}>
      <Component params={checkedParams} frame={frame} fps={fps} />
      {!mod.validated && (
        <AbsoluteFill
          style={{
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingBottom: 24,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontFamily: 'sans-serif',
              fontSize: 22,
              color: '#b00020',
              opacity: 0.55,
              letterSpacing: 1,
            }}
          >
            PLACEHOLDER · not RN-validated · unlisted-only
          </span>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
