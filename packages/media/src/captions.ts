/** SRT caption generation from scene narration + rendered scene durations. */

export interface CaptionScene {
  narration: string;
  durationSec: number;
}

function formatTimestamp(totalSec: number): string {
  const ms = Math.round((totalSec % 1) * 1000);
  const s = Math.floor(totalSec) % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function chunkSentences(text: string, maxChars = 84): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 <= maxChars) {
      current = current ? `${current} ${sentence}` : sentence;
    } else {
      if (current) chunks.push(current);
      if (sentence.length <= maxChars) {
        current = sentence;
      } else {
        // Hard-wrap very long sentences on word boundaries.
        let rest = sentence;
        while (rest.length > maxChars) {
          const cut = rest.lastIndexOf(' ', maxChars);
          const idx = cut > 20 ? cut : maxChars;
          chunks.push(rest.slice(0, idx));
          rest = rest.slice(idx).trim();
        }
        current = rest;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.slice(0, maxChars)];
}

/** Build an SRT file: within each scene, time is split across text chunks
 * proportionally to chunk length — accurate enough for readable captions. */
export function buildSrt(scenes: CaptionScene[]): string {
  const entries: string[] = [];
  let cursor = 0;
  let index = 1;
  for (const scene of scenes) {
    const chunks = chunkSentences(scene.narration);
    const totalChars = chunks.reduce((a, c) => a + c.length, 0) || 1;
    let sceneCursor = cursor;
    for (const chunk of chunks) {
      const share = (chunk.length / totalChars) * scene.durationSec;
      const start = sceneCursor;
      const end = Math.min(sceneCursor + share, cursor + scene.durationSec);
      entries.push(`${index}\n${formatTimestamp(start)} --> ${formatTimestamp(end)}\n${chunk}\n`);
      sceneCursor = end;
      index++;
    }
    cursor += scene.durationSec;
  }
  return entries.join('\n');
}
