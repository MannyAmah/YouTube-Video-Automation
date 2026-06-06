// MechanismScene — renders one motion_spec by looking up its validated module
// and driving it from keyframes (PLAN §5). This is the parametrization
// framework's render entry point: the diagram is the module's geometry, NOT a
// pan over a generated still. A motion_spec referencing an unknown or
// unvalidated module is a hard error — we never render a "bad frame".

import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { MotionSpec } from '@vitalis/shared';
import { MODULE_REGISTRY } from './modules/registry.js';

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
  if (!mod.validated) throw new Error(`module '${moduleKey}' is not RN-validated; refusing to render (§5.2)`);

  const checkedParams = mod.paramsSchema.parse(params);
  const { Component } = mod;

  return (
    <AbsoluteFill style={{ backgroundColor: '#fbfbf9' }}>
      <Component params={checkedParams} frame={frame} fps={fps} />
    </AbsoluteFill>
  );
};
