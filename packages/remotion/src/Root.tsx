// Remotion root — registers compositions. Phase 0 has one placeholder scene
// proving the motion_spec → module render path. Real video assembly (VO + beats
// + captions stitched from the script) lands in Phase 2.

import { Composition } from 'remotion';
import { MechanismScene } from './MechanismScene.js';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MechanismScene"
      component={MechanismScene as React.FC<Record<string, unknown>>}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        spec: {
          module: 'placeholder',
          params: {},
          durationSec: 10,
          keyframes: [{ t: 0, state: 'start', easing: 'ease-in-out' }],
          beatIndex: 0,
        },
      }}
    />
  );
};
