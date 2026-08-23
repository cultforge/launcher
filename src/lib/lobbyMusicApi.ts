import { send } from "./client";
import { lyricsFromCatalog, type LyricLine } from "./lrc";

export type LobbyTrackMetadata = {
  id: string;
  title: string;
  artist: string;
  album: string;
  lyrics: string;
};

const PUBLIC_LOBBY = "https://api.cultforge.com/v1/music/lobby";
const PUBLIC_CATALOG = "https://api.cultforge.com/v1/music";

export type LobbyTheme = {
  audioUrl: string;
  metadata: LobbyTrackMetadata;
  lyrics: LyricLine[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown> | null, keys: string[]): string {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseTrack(raw: unknown): LobbyTheme | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  let audioUrl = pickString(obj, [
    "audio_static_url",
    "audioStaticUrl",
    "audio_url",
    "audioUrl",
    "url",
  ]);
  if (!audioUrl) return null;
  const versionKey = pickString(obj, [
    "updated_at",
    "updatedAt",
    "version",
    "revision",
    "etag",
    "content_hash",
    "contentHash",
  ]);
  if (versionKey) {
    const sep = audioUrl.includes("?") ? "&" : "?";
    audioUrl = `${audioUrl}${sep}v=${encodeURIComponent(versionKey)}`;
  }
  const lyricsRaw = obj.lyrics;
  return {
    audioUrl,
    metadata: {
      id: pickString(obj, ["id"]) || "lobby",
      title: pickString(obj, ["title"]) || "Already Dreaming",
      artist: pickString(obj, ["artist", "info"]) || "CultForge",
      album: pickString(obj, ["album"]) || "CultForge",
      lyrics: pickString(obj, ["lyrics_url", "lyrics_static_url"]) || "",
    },
    lyrics: lyricsFromCatalog(Array.isArray(lyricsRaw) ? lyricsRaw : []),
  };
}

async function lyricsFallback(): Promise<LyricLine[]> {
  try {
    const raw = await send<unknown>(
      "api",
      "cultforge_lobby_lyrics_(timestamp_+_line)",
    );
    const obj = asRecord(raw);
    const rows = Array.isArray(obj?.data)
      ? obj.data
      : Array.isArray(raw)
        ? raw
        : [];
    return lyricsFromCatalog(rows);
  } catch {
    try {
      const res = await fetch("https://api.cultforge.com/v1/music/lobby/lyrics");
      if (!res.ok) return [];
      const raw: unknown = await res.json();
      const obj = asRecord(raw);
      const rows = Array.isArray(obj?.data)
        ? obj.data
        : Array.isArray(raw)
          ? raw
          : [];
      return lyricsFromCatalog(rows);
    } catch {
      return [];
    }
  }
}

async function parseResponse(raw: unknown): Promise<LobbyTheme | null> {
  const obj = asRecord(raw);
  const track =
    parseTrack(obj?.data) ||
    parseTrack(obj?.lobby) ||
    parseTrack(obj);
  if (track) {
    if (track.lyrics.length === 0) {
      track.lyrics = await lyricsFallback();
    }
    return track;
  }
  const tracks = obj?.tracks;
  if (Array.isArray(tracks)) {
    for (const row of tracks) {
      const parsed = parseTrack(row);
      if (parsed) {
        if (parsed.lyrics.length === 0) {
          parsed.lyrics = await lyricsFallback();
        }
        return parsed;
      }
    }
  }
  return null;
}

/** Public CultForge lobby theme (audio + timestamped lyrics). */
export async function fetchLobbyTheme(): Promise<LobbyTheme | null> {
  try {
    const { getClientOrigin, sidecarFetch } = await import("./client");
    const origin = await getClientOrigin();
    const res = await sidecarFetch(`${origin}/music/lobby`);
    if (res.ok) {
      const track = await parseResponse(await res.json());
      if (track) return track;
    }
  } catch {
    /* public catalog next */
  }

  try {
    const res = await fetch(PUBLIC_LOBBY);
    if (res.ok) {
      const track = await parseResponse(await res.json());
      if (track) return track;
    }
  } catch {
    /* sidecar dispatch next */
  }

  try {
    const track = await parseResponse(
      await send<unknown>("api", "cultforge_lobby_theme_(audio_urls_+_lyrics)"),
    );
    if (track) return track;
  } catch {
    /* catalog next */
  }

  try {
    const track = await parseResponse(
      await send<unknown>("api", "public_cultforge_music_catalog_(lobby_theme)"),
    );
    if (track) return track;
  } catch {
    /* public catalog last */
  }

  try {
    const res = await fetch(PUBLIC_CATALOG);
    if (res.ok) return parseResponse(await res.json());
  } catch {
    /* offline */
  }

  return null;
}
