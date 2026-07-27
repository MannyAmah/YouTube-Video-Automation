import { mkdir, rm, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import {
  audioDurationSec,
  escapeDrawtext,
  FONT_BOLD,
  runFfmpeg,
} from './ffmpeg';

/**
 * Long-form 16:9 renderer.
 *
 * Each scene = one generated illustration + one narration audio segment.
 * The scene clip applies a slow Ken Burns zoom, an optional burned-in
 * caption, and the scene's narration. Clips are then concatenated with a
 * uniform codec profile into the final 1920x1080/30fps H.264 + AAC MP4.
 */

export interface RenderScene {
  imagePath: string;
  audioPath: string;
  caption: string;
}

export interface RenderOptions {
  scenes: RenderScene[];
  outPath: string;
  workDir: string;
  fps?: number;
}

export interface RenderResult {
  durationSec: number;
  sceneDurations: number[];
}

const FPS = 30;
const TAIL_PAD_SEC = 0.5;

export async function renderLongform(options: RenderOptions): Promise<RenderResult> {
  const fps = options.fps ?? FPS;
  if (options.scenes.length === 0) throw new Error('renderLongform: no scenes');
  await mkdir(options.workDir, { recursive: true });

  const clipPaths: string[] = [];
  const sceneDurations: number[] = [];

  for (let i = 0; i < options.scenes.length; i++) {
    const scene = options.scenes[i]!;
    const narrationSec = await audioDurationSec(scene.audioPath);
    const durationSec = narrationSec + TAIL_PAD_SEC;
    const frames = Math.ceil(durationSec * fps);
    const clipPath = join(options.workDir, `clip_${String(i).padStart(3, '0')}.mp4`);

    const filters = [
      // Fill the frame from any input aspect ratio.
      `scale=2112:1188:force_original_aspect_ratio=increase`,
      `crop=2112:1188`,
      // Slow push-in: ~6% zoom over the scene.
      `zoompan=z='1+0.06*on/${frames}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=${fps}`,
      `format=yuv420p`,
    ];
    if (scene.caption.trim().length > 0) {
      const caption = escapeDrawtext(scene.caption.trim());
      filters.push(
        `drawtext=fontfile=${FONT_BOLD}:text='${caption}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=h-170:box=1:boxcolor=black@0.45:boxborderw=22`,
      );
    }
    // Gentle fade in/out between scenes.
    filters.push(`fade=t=in:st=0:d=0.4`, `fade=t=out:st=${Math.max(0, durationSec - 0.4)}:d=0.4`);

    await runFfmpeg([
      '-loop', '1',
      '-i', scene.imagePath,
      '-i', scene.audioPath,
      '-vf', filters.join(','),
      '-t', durationSec.toFixed(3),
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '20',
      '-r', String(fps),
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ar', '44100',
      '-ac', '2',
      '-af', `apad=pad_dur=${TAIL_PAD_SEC}`,
      '-shortest',
      clipPath,
    ]);

    clipPaths.push(clipPath);
    sceneDurations.push(durationSec);
  }

  // Concat with stream copy — all clips share an identical codec profile.
  const listPath = join(options.workDir, 'concat.txt');
  await writeFile(
    listPath,
    // Absolute paths: the concat demuxer resolves relative entries against
    // the list file's own directory, which breaks with a relative workDir.
    clipPaths.map((p) => `file '${resolve(p).replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8',
  );
  await runFfmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-r', String(fps),
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    options.outPath,
  ]);

  // Clean intermediate clips (keep workDir for debugging on failure only).
  await Promise.all(clipPaths.map((p) => rm(p, { force: true })));
  await rm(listPath, { force: true });

  return {
    durationSec: sceneDurations.reduce((a, b) => a + b, 0),
    sceneDurations,
  };
}
