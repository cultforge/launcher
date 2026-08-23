/**
 * Lobby theme: CultForge `/v1/music` catalog, then local /audio/lobby.mp3,
 * then a procedural pad. AnalyserNode drives the header spectrum bars.
 */

import { fetchLobbyTheme, type LobbyTrackMetadata } from "./lobbyMusicApi";
import { loadLrc, type LyricLine } from "./lrc";
import { logger } from "./logger";

export type { LobbyTrackMetadata };

type EngineState = {
  ctx: AudioContext;
  master: GainNode;
  analyser: AnalyserNode;
  stopNodes: () => void;
  usingFile: boolean;
};

export type LobbyAudioSnapshot = {
  source: "idle" | "file" | "procedural";
  playing: boolean;
  currentTime: number;
  duration: number;
  metadata: LobbyTrackMetadata;
  lyricsAvailable: boolean;
  lyricLines: LyricLine[];
};

let engine: EngineState | null = null;
let engineInflight: Promise<EngineState> | null = null;
let fileEl: HTMLAudioElement | null = null;
let playing = false;
let ticker: number | null = null;
let lastVolume = 0.35;
let lastMuted = false;
let lyricLines: LyricLine[] = [];
let metadata: LobbyTrackMetadata = {
  id: "lobby",
  title: "Already Dreaming",
  artist: "CultForge",
  album: "CultForge",
  lyrics: "",
};
let snapshot: LobbyAudioSnapshot = {
  source: "idle",
  playing: false,
  currentTime: 0,
  duration: 0,
  metadata,
  lyricsAvailable: false,
  lyricLines: [],
};
const subscribers = new Set<() => void>();
const freqBuffer = new Uint8Array(128);

function updateSnapshot() {
  const source = !engine
    ? "idle"
    : engine.usingFile
      ? "file"
      : "procedural";
  snapshot = {
    source,
    playing,
    currentTime:
      source === "file" && fileEl
        ? fileEl.currentTime
        : engine?.ctx.currentTime ?? 0,
    duration:
      source === "file" && fileEl && Number.isFinite(fileEl.duration)
        ? fileEl.duration
        : 0,
    metadata,
    lyricsAvailable: lyricLines.length > 0,
    lyricLines,
  };
  subscribers.forEach((listener) => listener());
}

function startTicker() {
  if (ticker !== null) return;
  ticker = window.setInterval(updateSnapshot, 120);
}

function stopTicker() {
  if (ticker === null) return;
  window.clearInterval(ticker);
  ticker = null;
}

async function tryLoadLocalFallback(): Promise<string | null> {
  try {
    const res = await fetch("/audio/lobby.mp3", { method: "HEAD" });
    if (!res.ok) return null;
  } catch {
    return null;
  }
  try {
    const metaRes = await fetch("/audio/lobby.json");
    if (metaRes.ok) {
      metadata = (await metaRes.json()) as LobbyTrackMetadata;
    }
  } catch {
    /* keep remote/default metadata */
  }
  try {
    const doc = await loadLrc(metadata.lyrics || "/audio/lobby.lrc");
    lyricLines = doc.lines;
  } catch {
    lyricLines = [];
  }
  return "/audio/lobby.mp3";
}

function applyFileVolume(volume: number, muted: boolean) {
  lastVolume = volume;
  lastMuted = muted;
  if (!fileEl) return;
  fileEl.muted = muted;
  fileEl.volume = muted ? 0 : Math.min(1, Math.max(0.05, volume));
}

async function tryLoadLobbyFile(force = false): Promise<boolean> {
  if (force && fileEl) {
    try {
      fileEl.pause();
    } catch {
      /* ignore */
    }
    fileEl.src = "";
    fileEl = null;
    if (engine) {
      engine.usingFile = false;
    }
  }
  let url = "";
  try {
    const theme = await fetchLobbyTheme();
    if (theme) {
      url = theme.audioUrl;
      metadata = theme.metadata;
      lyricLines = theme.lyrics;
    }
  } catch {
    /* local fallback */
  }
  if (!url) {
    url = (await tryLoadLocalFallback()) || "";
  }
  if (!url) return false;

  if (force) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}_cf=${Date.now()}`;
  }

  // Play through <audio> directly. createMediaElementSource() steals output
  // into Web Audio — lyrics still advance, but WebView2 stays silent.
  fileEl = new Audio(url);
  fileEl.loop = true;
  fileEl.preload = "auto";
  applyFileVolume(lastVolume, lastMuted);
  fileEl.addEventListener("error", () => {
    logger.warn(`Lobby audio failed to load: ${url}`);
  });
  try {
    fileEl.load();
  } catch {
    /* ignore */
  }
  logger.info(`Lobby track ready: ${metadata.title} (${url})`);
  return true;
}

function startProcedural(ctx: AudioContext, dest: AudioNode): () => void {
  const now = ctx.currentTime;

  const makePad = (freq: number, type: OscillatorType, gain: number, detune = 0) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 1.8);
    osc.connect(g);
    g.connect(dest);
    osc.start(now);
    return () => {
      try {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        osc.stop(ctx.currentTime + 0.5);
      } catch {
        /* already stopped */
      }
    };
  };

  // Soft drone + fifth + airy high partial
  const stops = [
    makePad(65.41, "sine", 0.22), // C2
    makePad(98.0, "sine", 0.14, 6), // G2 slightly detuned
    makePad(130.81, "triangle", 0.06, -4), // C3
    makePad(196.0, "sine", 0.04), // G3 shimmer
  ];

  // Filtered noise bed
  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 480;
  noiseFilter.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.035;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(dest);
  noise.start();

  // Slow filter swell on the noise
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain);
  lfoGain.connect(noiseFilter.frequency);
  lfo.start();

  stops.push(() => {
    try {
      noise.stop();
      lfo.stop();
    } catch {
      /* ignore */
    }
  });

  return () => stops.forEach((s) => s());
}

async function ensureEngine(): Promise<EngineState> {
  if (engine) return engine;
  if (engineInflight) return engineInflight;

  engineInflight = (async () => {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.78;

  master.connect(analyser);
  analyser.connect(ctx.destination);

  let stopNodes = () => {};
  let usingFile = false;

  try {
    usingFile = await tryLoadLobbyFile(false);
  } catch {
    usingFile = false;
  }

  if (!usingFile) {
    stopNodes = startProcedural(ctx, master);
  }

  engine = { ctx, master, analyser, stopNodes, usingFile };
  updateSnapshot();
  return engine;
  })();

  try {
    return await engineInflight;
  } finally {
    engineInflight = null;
  }
}

/** Buffer remote/local lobby audio during splash without starting playback. */
export async function prefetchLobbyAudio(): Promise<void> {
  try {
    await ensureEngine();
  } catch {
    /* autoplay / offline — start() will retry */
  }
}

/** Drop cached lobby file so the next prefetch picks up a new theme.mp3. */
export async function reloadLobbyAudio(): Promise<void> {
  await lobbyAudioStop();
  if (fileEl) {
    fileEl.src = "";
    fileEl = null;
  }
  if (engine) {
    try {
      engine.stopNodes();
    } catch {
      /* ignore */
    }
    try {
      await engine.ctx.close();
    } catch {
      /* ignore */
    }
    engine = null;
  }
  engineInflight = null;
  try {
    await tryLoadLobbyFile(true);
  } catch {
    /* offline — procedural fallback on next start */
  }
}

export async function lobbyAudioUnlock(): Promise<void> {
  try {
    if (engine?.ctx.state === "suspended") await engine.ctx.resume();
    if (!playing) return;
    applyFileVolume(lastVolume, lastMuted);
    if (fileEl) await fileEl.play().catch(() => undefined);
  } catch {
    /* autoplay still blocked */
  }
}

export async function lobbyAudioStart(volume: number, muted: boolean) {
  const e = await ensureEngine();
  if (e.ctx.state === "suspended") await e.ctx.resume();
  applyFileVolume(volume, muted);

  if (e.usingFile && fileEl) {
    try {
      await fileEl.play();
    } catch (err) {
      logger.debug(
        `Lobby autoplay blocked (${err instanceof Error ? err.message : String(err)}) — waiting for gesture`,
      );
    }
  }

  if (!e.usingFile) {
    const target = muted ? 0 : Math.max(0.02, volume * 0.55);
    const t = e.ctx.currentTime;
    e.master.gain.cancelScheduledValues(t);
    e.master.gain.value = target;
  }
  playing = true;
  updateSnapshot();
  startTicker();
}

export async function lobbyAudioStop() {
  playing = false;
  updateSnapshot();
  stopTicker();
  if (fileEl) {
    try {
      fileEl.pause();
      fileEl.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
  if (engine && !engine.usingFile) {
    const t = engine.ctx.currentTime;
    engine.master.gain.cancelScheduledValues(t);
    engine.master.gain.setValueAtTime(engine.master.gain.value, t);
    engine.master.gain.linearRampToValueAtTime(0, t + 0.4);
  }
}

export function lobbyAudioSetVolume(volume: number, muted: boolean, isPlaying: boolean) {
  applyFileVolume(volume, muted);
  if (!engine || !isPlaying || engine.usingFile) return;
  const target = muted ? 0 : Math.max(0.02, volume * 0.55);
  engine.master.gain.cancelScheduledValues(engine.ctx.currentTime);
  engine.master.gain.value = target;
}

/** Returns normalized 0–1 bar levels (count bars). */
export function lobbyAudioGetLevels(barCount: number, playing: boolean): number[] {
  const levels = new Array(barCount).fill(0);

  if (engine && playing && !engine.usingFile) {
    engine.analyser.getByteFrequencyData(freqBuffer);
    const binSize = Math.floor(freqBuffer.length / barCount);
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      const start = i * binSize;
      for (let j = 0; j < binSize; j++) sum += freqBuffer[start + j] ?? 0;
      const avg = sum / (binSize * 255);
      levels[i] = Math.min(1, Math.pow(avg, 0.65) * 1.35);
    }
    return levels;
  }

  if (engine?.usingFile && playing && fileEl && !fileEl.paused) {
    const t = fileEl.currentTime;
    for (let i = 0; i < barCount; i++) {
      levels[i] = Math.min(
        1,
        0.18 +
          0.22 * Math.abs(Math.sin(t * 2.1 + i * 0.35)) +
          0.12 * Math.abs(Math.sin(t * 3.4 + i * 0.7)),
      );
    }
    return levels;
  }

  // Idle breath when paused
  const t = Date.now() / 1000;
  for (let i = 0; i < barCount; i++) {
    const wave =
      0.12 +
      0.1 * Math.sin(t * 1.4 + i * 0.45) +
      0.06 * Math.sin(t * 2.1 + i * 0.9);
    levels[i] = Math.max(0.04, wave);
  }
  return levels;
}

export function lobbyAudioIsFileTrack(): boolean {
  return engine?.usingFile ?? false;
}

export function lobbyAudioGetSnapshot(): LobbyAudioSnapshot {
  return snapshot;
}

export function lobbyAudioSubscribe(listener: () => void) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

export function lobbyAudioSeek(time: number) {
  if (!fileEl || !Number.isFinite(fileEl.duration)) return;
  fileEl.currentTime = Math.min(fileEl.duration, Math.max(0, time));
  updateSnapshot();
}
