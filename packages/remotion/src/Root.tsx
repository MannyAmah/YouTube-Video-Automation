// Remotion root — registers compositions. The walking skeleton renders
// `DrugStoryVideo` from a sample storyboard using PLACEHOLDER primitives through
// the real motion_spec framework (PLAN §9 Milestone 1). Importing the
// placeholders module registers the four PK/PD primitive modules.

import { Composition } from 'remotion';
import { DrugStoryVideo } from './DrugStoryVideo';
import { SAMPLE_STORYBOARD, sampleDurationSec } from './sample';
import './primitives/placeholders'; // side-effect: registers placeholder modules

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DrugStoryVideo"
      component={DrugStoryVideo as React.FC<Record<string, unknown>>}
      durationInFrames={Math.round(sampleDurationSec * FPS)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ input: SAMPLE_STORYBOARD }}
    />
  );
};
