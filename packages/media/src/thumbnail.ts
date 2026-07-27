import { escapeDrawtext, FONT_BOLD, runFfmpeg } from './ffmpeg';

/**
 * Compose a 1280x720 JPEG thumbnail (< 2MB, YouTube limit) from a generated
 * base illustration plus large, readable title text.
 */

function wrapTitle(text: string, maxPerLine = 16): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxPerLine) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

export async function composeThumbnail(
  baseImagePath: string,
  titleText: string,
  outPath: string,
): Promise<void> {
  const lines = wrapTitle(titleText.trim());
  const drawtexts = lines.map((line, i) => {
    const escaped = escapeDrawtext(line.toUpperCase());
    const y = 470 + i * 78;
    return `drawtext=fontfile=${FONT_BOLD}:text='${escaped}':fontcolor=white:fontsize=64:x=60:y=${y}:box=1:boxcolor=black@0.55:boxborderw=18`;
  });
  const filters = [
    'scale=1280:720:force_original_aspect_ratio=increase',
    'crop=1280:720',
    ...drawtexts,
  ];
  await runFfmpeg([
    '-i', baseImagePath,
    '-vf', filters.join(','),
    '-frames:v', '1',
    '-q:v', '3',
    outPath,
  ]);
}
