// DrugStoryVideo — assembles a full video from a storyboard (PLAN §3.1 ⑥).
// Title card → one scene per beat (MechanismScene driven by its motion_spec, with
// a caption) → disclaimer card. This is the render target of the walking skeleton:
// real composition, placeholder primitive assets, real motion_spec contract.
//
// The narration track (ElevenLabs) and forced-aligned captions are wired in
// Phase 2; here captions come straight from the storyboard beats so the skeleton
// renders without external audio services.

import { AbsoluteFill, Series, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { MotionSpec } from '@vitalis/shared';
import { MechanismScene } from './MechanismScene';

export const StoryboardInput = z.object({
  title: z.string(),
  drug: z.string(),
  disclaimer: z.string().min(1), // fail-closed: no disclaimer, schema rejects
  beats: z
    .array(z.object({ caption: z.string(), spec: MotionSpec }))
    .min(1),
});
export type StoryboardInput = z.infer<typeof StoryboardInput>;

const Card: React.FC<{ children: React.ReactNode; small?: boolean }> = ({ children, small }) => (
  <AbsoluteFill
    style={{
      backgroundColor: '#fbfbf9',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 120,
      textAlign: 'center',
      fontFamily: 'sans-serif',
      color: '#1a1a1a',
      fontSize: small ? 40 : 72,
      lineHeight: 1.3,
    }}
  >
    {children}
  </AbsoluteFill>
);

const Caption: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 64 }}>
    <span
      style={{
        fontFamily: 'sans-serif',
        fontSize: 44,
        color: '#1a1a1a',
        background: 'rgba(251,251,249,0.85)',
        padding: '12px 28px',
        borderRadius: 8,
        maxWidth: 1500,
        textAlign: 'center',
      }}
    >
      {text}
    </span>
  </AbsoluteFill>
);

export const DrugStoryVideo: React.FC<{ input: unknown }> = ({ input }) => {
  const { fps } = useVideoConfig();
  const data = StoryboardInput.parse(input);
  const sec = (s: number) => Math.round(s * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: '#fbfbf9' }}>
      <Series>
        <Series.Sequence durationInFrames={sec(3)}>
          <Card>
            {data.title}
            <div style={{ fontSize: 36, marginTop: 24, opacity: 0.7 }}>{data.drug}</div>
          </Card>
        </Series.Sequence>

        {data.beats.map((beat, i) => (
          <Series.Sequence key={i} durationInFrames={sec(beat.spec.durationSec)}>
            <MechanismScene spec={beat.spec} />
            <Caption text={beat.caption} />
          </Series.Sequence>
        ))}

        <Series.Sequence durationInFrames={sec(4)}>
          <Card small>{data.disclaimer}</Card>
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
