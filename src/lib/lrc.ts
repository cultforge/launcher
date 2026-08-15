export type LyricLine = {
  time: number;
  text: string;
};

export type LyricDocument = {
  lines: LyricLine[];
  metadata: Record<string, string>;
};

const timestampPattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const metadataPattern = /^\[([a-z]+):(.+)\]$/i;

export function parseLrc(source: string): LyricDocument {
  const lines: LyricLine[] = [];
  const metadata: Record<string, string> = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const metadataMatch = trimmed.match(metadataPattern);
    if (metadataMatch && !timestampPattern.test(trimmed)) {
      metadata[metadataMatch[1].toLowerCase()] = metadataMatch[2].trim();
      timestampPattern.lastIndex = 0;
      continue;
    }
    timestampPattern.lastIndex = 0;

    const timestamps = [...trimmed.matchAll(timestampPattern)];
    if (timestamps.length === 0) continue;
    const text = trimmed.replace(timestampPattern, "").trim();
    for (const match of timestamps) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      lines.push({ time: minutes * 60 + seconds + fraction, text });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return { lines, metadata };
}

export async function loadLrc(path: string): Promise<LyricDocument> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load lyrics: ${response.status}`);
  return parseLrc(await response.text());
}

function parseClock(value: string): number | null {
  const match = value.trim().match(/^(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?$/);
  if (!match) return null;
  const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
  return Number(match[1]) * 60 + Number(match[2]) + fraction;
}

/** Normalize `/v1/music` lyric rows (`time` / `line` / `timestamp`). */
export function lyricsFromCatalog(rows: unknown[]): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of rows) {
    if (typeof row === "string" && row.trim()) {
      lines.push({ time: lines.length ? lines[lines.length - 1].time : 0, text: row.trim() });
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    const text = String(obj.line ?? obj.text ?? obj.lyric ?? "").trim();
    if (!text) continue;
    let time =
      typeof obj.time === "number" && Number.isFinite(obj.time)
        ? obj.time
        : null;
    if (time == null && typeof obj.timestamp === "string") {
      time = parseClock(obj.timestamp);
    }
    lines.push({ time: time ?? 0, text });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

export function activeLyricIndex(
  lines: LyricLine[],
  currentTime: number,
  offsetSeconds = 0,
) {
  const adjusted = currentTime + offsetSeconds;
  let active = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time > adjusted) break;
    active = index;
  }
  return active;
}
