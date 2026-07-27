import { describe, expect, it } from 'vitest';
import { buildSrt } from '../src/captions';

describe('buildSrt', () => {
  it('produces sequential, monotonic entries covering every scene', () => {
    const srt = buildSrt([
      { narration: 'First sentence. Second sentence here.', durationSec: 10 },
      { narration: 'Third sentence in the next scene.', durationSec: 5 },
    ]);
    const blocks = srt.trim().split('\n\n');
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0]).toMatch(/^1\n00:00:00,000 --> /);

    const times = [...srt.matchAll(/(\d\d):(\d\d):(\d\d),(\d\d\d)/g)].map(
      (m) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000,
    );
    for (let i = 2; i < times.length; i += 2) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]! - 0.001);
    }
    // Last timestamp lands at the total duration.
    expect(times[times.length - 1]).toBeCloseTo(15, 1);
  });

  it('hard-wraps very long sentences', () => {
    const srt = buildSrt([{ narration: 'word '.repeat(60).trim() + '.', durationSec: 20 }]);
    for (const line of srt.split('\n')) {
      if (!line.includes('-->') && !/^\d+$/.test(line)) {
        expect(line.length).toBeLessThanOrEqual(90);
      }
    }
  });
});
