import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { promisify } from 'util';
import type { Env } from '@yva/shared';

const execFileAsync = promisify(execFile);

/** Resolve the Python interpreter and animator directory. */
export function animatorPaths(env: Env): { python: string; dir: string } {
  const dir =
    env.ANIMATOR_DIR ||
    resolve(__dirname, '../../../../services/animator');
  const python =
    env.ANIMATOR_PYTHON ||
    (existsSync(join(dir, '.venv/bin/python')) ? join(dir, '.venv/bin/python') : 'python3');
  return { python, dir };
}

export interface AnimatorScene {
  id: string;
  type: string;
  params: Record<string, unknown>;
  target_seconds: number;
}

export interface AnimatorManifestScene {
  id: string;
  file: string;
  ok: boolean;
  duration: number;
  type: string | null;
}

export interface AnimatorManifest {
  scenes: AnimatorManifestScene[];
  ok: boolean;
}

/**
 * Render an animation plan to per-scene 1080p silent clips via the Python
 * Manim engine. Returns the manifest (per-scene file + duration + ok).
 */
export async function renderAnimationScenes(
  env: Env,
  scenes: AnimatorScene[],
  outDir: string,
  molDir: string,
  fps = 30,
): Promise<AnimatorManifest> {
  const { python, dir } = animatorPaths(env);
  await mkdir(outDir, { recursive: true });
  await mkdir(molDir, { recursive: true });
  const plan = { fps, width: 1920, height: 1080, mol_dir: molDir, scenes };
  const planPath = join(outDir, 'plan.json');
  await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf8');

  try {
    await execFileAsync(python, [join(dir, 'render.py'), planPath, outDir], {
      cwd: dir,
      timeout: 60 * 60 * 1000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, PYTHONPATH: dir },
    });
  } catch (err) {
    // render.py exits non-zero if any scene failed; the manifest still tells
    // us which succeeded. Only treat a missing manifest as fatal.
    const manifestPath = join(outDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`Animator failed: ${(err as Error).message}`);
    }
  }

  const manifestRaw = await readFile(join(outDir, 'manifest.json'), 'utf8');
  return JSON.parse(manifestRaw) as AnimatorManifest;
}
