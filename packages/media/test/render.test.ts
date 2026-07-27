import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderLongform } from '../src/render';
import { LONGFORM_EXPECTATIONS, validateVideo, validateAudio, validateImage } from '../src/validate';

const execFileAsync = promisify(execFile);

/**
 * Media integration test: renders a REAL two-scene MP4 from deterministic
 * fixtures (ffmpeg-generated images + espeak narration) and validates it
 * with ffprobe. This is the CI-proof that the render pipeline produces
 * uploadable video, not placeholders.
 */
describe('renderLongform + validateVideo', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'yva-render-'));
    for (const [name, color] of [
      ['scene1.png', 'steelblue'],
      ['scene2.png', 'seagreen'],
    ] as const) {
      await execFileAsync('ffmpeg', [
        '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=1920x1080:d=1`, '-frames:v', '1',
        join(dir, name),
      ]);
    }
    for (const [name, text] of [
      ['scene1.mp3', 'This is the first test scene narration for the render integration test. '.repeat(14)],
      ['scene2.mp3', 'And this is the second scene, which should follow the first seamlessly. '.repeat(14)],
    ] as const) {
      const wav = join(dir, `${name}.wav`);
      await execFileAsync('espeak-ng', ['-w', wav, '-s', '150', text]);
      await execFileAsync('ffmpeg', ['-y', '-i', wav, '-b:a', '128k', join(dir, name)]);
    }
  }, 120_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('renders a QC-passing 1080p MP4 with audio and captions timing', async () => {
    const outPath = join(dir, 'out.mp4');
    const result = await renderLongform({
      scenes: [
        { imagePath: join(dir, 'scene1.png'), audioPath: join(dir, 'scene1.mp3'), caption: 'Scene one' },
        { imagePath: join(dir, 'scene2.png'), audioPath: join(dir, 'scene2.mp3'), caption: '' },
      ],
      outPath,
      workDir: join(dir, 'work'),
    });

    expect(result.sceneDurations).toHaveLength(2);
    expect(result.durationSec).toBeGreaterThan(60);

    const report = await validateVideo(outPath, { ...LONGFORM_EXPECTATIONS, minDurationSec: 30 });
    const failed = report.checks.filter((c) => !c.passed);
    expect(failed, JSON.stringify(failed)).toEqual([]);
    expect(report.videoWidth).toBe(1920);
    expect(report.videoHeight).toBe(1080);
    expect(report.hasAudioStream).toBe(true);
    expect(report.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
  }, 300_000);

  it('validateVideo rejects a non-video file (the v1 placeholder bug)', async () => {
    const fake = join(dir, 'video.mp4.txt');
    await writeFile(fake, 'This is a placeholder describing where a video would be.');
    await expect(validateVideo(fake, LONGFORM_EXPECTATIONS)).rejects.toThrow();
  });

  it('validateAudio rejects an image and validateImage rejects audio', async () => {
    await expect(validateAudio(join(dir, 'scene1.png'))).rejects.toThrow();
    await expect(
      validateImage(join(dir, 'scene1.mp3'), { minWidth: 100, minHeight: 100, minBytes: 10 }),
    ).rejects.toThrow();
  });
});
