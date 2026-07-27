import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class MediaToolError extends Error {
  constructor(tool: string, message: string) {
    super(`[${tool}] ${message}`);
    this.name = 'MediaToolError';
  }
}

export async function runFfmpeg(args: string[], timeoutMs = 1_800_000): Promise<void> {
  try {
    await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new MediaToolError('ffmpeg', (e.stderr || e.message || 'unknown error').slice(0, 2000));
  }
}

export interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  sample_rate?: string;
  channels?: number;
}

export interface ProbeResult {
  format: { duration?: string; size?: string; format_name?: string; bit_rate?: string };
  streams: ProbeStream[];
}

export async function probe(filePath: string, timeoutMs = 60_000): Promise<ProbeResult> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as ProbeResult;
    if (!parsed.format || !Array.isArray(parsed.streams)) {
      throw new MediaToolError('ffprobe', `Unrecognized probe output for ${filePath}`);
    }
    return parsed;
  } catch (err) {
    if (err instanceof MediaToolError) throw err;
    const e = err as { stderr?: string; message?: string };
    throw new MediaToolError('ffprobe', (e.stderr || e.message || 'probe failed').slice(0, 1000));
  }
}

export async function audioDurationSec(filePath: string): Promise<number> {
  const result = await probe(filePath);
  const duration = Number(result.format.duration ?? NaN);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new MediaToolError('ffprobe', `No valid duration for audio ${filePath}`);
  }
  return duration;
}

/** Escape a string for use inside an ffmpeg drawtext text= expression. */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '')
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

export const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
export const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
