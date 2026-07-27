import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { QcReport, QcReportSchema } from '@yva/shared';
import { probe } from './ffmpeg';

/**
 * Artifact validation — the gate between "a file exists" and "this file may
 * be uploaded". Checks are exhaustive on purpose: v1 shipped .placeholder
 * files to the upload queue; v2 makes that structurally impossible.
 */

export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export interface VideoExpectations {
  width: number;
  height: number;
  minDurationSec: number;
  maxDurationSec: number;
  minBytes: number;
}

export const LONGFORM_EXPECTATIONS: VideoExpectations = {
  width: 1920,
  height: 1080,
  minDurationSec: 120,
  maxDurationSec: 1200,
  minBytes: 1_000_000,
};

export async function validateVideo(
  filePath: string,
  expect: VideoExpectations,
): Promise<QcReport> {
  const checks: QcReport['checks'] = [];
  const push = (name: string, passed: boolean, detail: string) =>
    checks.push({ name, passed, detail });

  const info = await stat(filePath).catch(() => null);
  push('file_exists', info !== null && info.isFile(), info ? `${info.size} bytes` : 'missing');
  if (!info) {
    throw new Error(`validateVideo: file missing: ${filePath}`);
  }
  push('file_size', info.size >= expect.minBytes, `${info.size} >= ${expect.minBytes}`);

  const probed = await probe(filePath);
  const container = probed.format.format_name ?? '';
  push('container_mp4', container.includes('mp4'), `format=${container}`);

  const video = probed.streams.find((s) => s.codec_type === 'video');
  const audio = probed.streams.find((s) => s.codec_type === 'audio');
  push('has_video_stream', Boolean(video), video?.codec_name ?? 'none');
  push('has_audio_stream', Boolean(audio), audio?.codec_name ?? 'none');
  push('video_codec_h264', video?.codec_name === 'h264', video?.codec_name ?? 'none');
  push('audio_codec_aac', audio?.codec_name === 'aac', audio?.codec_name ?? 'none');

  const width = video?.width ?? 0;
  const height = video?.height ?? 0;
  push(
    'resolution',
    width === expect.width && height === expect.height,
    `${width}x${height} (expected ${expect.width}x${expect.height})`,
  );

  const duration = Number(probed.format.duration ?? 0);
  push(
    'duration_range',
    duration >= expect.minDurationSec && duration <= expect.maxDurationSec,
    `${duration.toFixed(1)}s (expected ${expect.minDurationSec}-${expect.maxDurationSec}s)`,
  );

  const checksum = await sha256File(filePath);

  const report: QcReport = {
    passed: checks.every((c) => c.passed),
    checks,
    videoDurationSec: duration,
    videoWidth: width,
    videoHeight: height,
    hasAudioStream: Boolean(audio),
    fileBytes: info.size,
    checksumSha256: checksum,
  };
  return QcReportSchema.parse(report);
}

export interface ImageExpectations {
  minWidth: number;
  minHeight: number;
  minBytes: number;
  maxBytes?: number;
}

export async function validateImage(
  filePath: string,
  expect: ImageExpectations,
): Promise<{ width: number; height: number; bytes: number; checksumSha256: string }> {
  const info = await stat(filePath).catch(() => null);
  if (!info || !info.isFile()) throw new Error(`Image missing: ${filePath}`);
  if (info.size < expect.minBytes) {
    throw new Error(`Image too small: ${filePath} (${info.size} bytes)`);
  }
  if (expect.maxBytes && info.size > expect.maxBytes) {
    throw new Error(`Image too large: ${filePath} (${info.size} bytes > ${expect.maxBytes})`);
  }
  const probed = await probe(filePath);
  const stream = probed.streams.find((s) => (s.width ?? 0) > 0);
  const width = stream?.width ?? 0;
  const height = stream?.height ?? 0;
  if (width < expect.minWidth || height < expect.minHeight) {
    throw new Error(
      `Image ${filePath} is ${width}x${height}, expected at least ${expect.minWidth}x${expect.minHeight}`,
    );
  }
  return { width, height, bytes: info.size, checksumSha256: await sha256File(filePath) };
}

export async function validateAudio(
  filePath: string,
  minDurationSec = 0.5,
): Promise<{ durationSec: number; bytes: number; checksumSha256: string }> {
  const info = await stat(filePath).catch(() => null);
  if (!info || !info.isFile()) throw new Error(`Audio missing: ${filePath}`);
  const probed = await probe(filePath);
  const audio = probed.streams.find((s) => s.codec_type === 'audio');
  if (!audio) throw new Error(`No audio stream in ${filePath}`);
  const duration = Number(probed.format.duration ?? 0);
  if (duration < minDurationSec) {
    throw new Error(`Audio ${filePath} too short: ${duration.toFixed(2)}s`);
  }
  return { durationSec: duration, bytes: info.size, checksumSha256: await sha256File(filePath) };
}
