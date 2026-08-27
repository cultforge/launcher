import { create } from "zustand";
import { getPreference, setPreference } from "../lib/persistentStore";

export type LyricsWidgetPosition = { x: number; y: number };
export type LyricsDisplayMode = "full" | "compact";

type PersistedLobbyState = {
  volume: number;
  muted: boolean;
  /** Last user play/pause choice — restored across restarts. */
  playing?: boolean;
  lyricsOpen: boolean;
  lyricsMode: LyricsDisplayMode;
  lyricsOffset: number;
  lyricsLocked: boolean;
  lyricsPosition: LyricsWidgetPosition | null;
};

type LobbyMusicStore = {
  hydrated: boolean;
  playing: boolean;
  muted: boolean;
  volume: number; // 0–1
  lyricsOpen: boolean;
  lyricsMode: LyricsDisplayMode;
  lyricsOffset: number;
  lyricsLocked: boolean;
  lyricsPosition: LyricsWidgetPosition | null;
  hydrate: () => Promise<void>;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  setVolume: (volume: number) => void;
  toggleLyrics: () => void;
  closeLyrics: () => void;
  setLyricsMode: (mode: LyricsDisplayMode) => void;
  setLyricsOffset: (offset: number) => void;
  toggleLyricsLocked: () => void;
  setLyricsPosition: (position: LyricsWidgetPosition) => void;
};

const persistenceKey = "lobby-music";

function persist(get: () => LobbyMusicStore) {
  const state = get();
  const value: PersistedLobbyState = {
    volume: state.volume,
    muted: state.muted,
    playing: state.playing,
    lyricsOpen: state.lyricsOpen,
    lyricsMode: state.lyricsMode,
    lyricsOffset: state.lyricsOffset,
    lyricsLocked: state.lyricsLocked,
    lyricsPosition: state.lyricsPosition,
  };
  void setPreference(persistenceKey, value);
}

export const useLobbyMusicStore = create<LobbyMusicStore>((set, get) => ({
  hydrated: false,
  playing: false,
  muted: false,
  volume: 0.35,
  lyricsOpen: false,
  lyricsMode: "full",
  lyricsOffset: 0,
  lyricsLocked: false,
  lyricsPosition: null,
  hydrate: async () => {
    const saved = await getPreference<PersistedLobbyState>(persistenceKey);
    if (!saved) {
      set({ hydrated: true });
      return;
    }
    set({
      hydrated: true,
      volume:
        typeof saved.volume === "number"
          ? Math.min(1, Math.max(0, saved.volume))
          : 0.35,
      muted: Boolean(saved.muted),
      // Default to wanting music when the key was never saved; respect explicit pause.
      playing: typeof saved.playing === "boolean" ? saved.playing : true,
      lyricsOpen: Boolean(saved.lyricsOpen),
      lyricsMode: saved.lyricsMode === "compact" ? "compact" : "full",
      lyricsOffset:
        typeof saved.lyricsOffset === "number"
          ? Math.min(5, Math.max(-5, saved.lyricsOffset))
          : 0,
      lyricsLocked: Boolean(saved.lyricsLocked),
      lyricsPosition: saved.lyricsPosition ?? null,
    });
  },
  setPlaying: (playing) => {
    set({ playing });
    persist(get);
  },
  togglePlaying: () => {
    set({ playing: !get().playing });
    persist(get);
  },
  setMuted: (muted) => {
    set({ muted });
    persist(get);
  },
  toggleMuted: () => {
    set({ muted: !get().muted });
    persist(get);
  },
  setVolume: (volume) => {
    set({ volume: Math.min(1, Math.max(0, volume)) });
    persist(get);
  },
  toggleLyrics: () => {
    set({ lyricsOpen: !get().lyricsOpen });
    persist(get);
  },
  closeLyrics: () => {
    set({ lyricsOpen: false });
    persist(get);
  },
  setLyricsMode: (lyricsMode) => {
    set({ lyricsMode });
    persist(get);
  },
  setLyricsOffset: (lyricsOffset) => {
    set({ lyricsOffset: Math.min(5, Math.max(-5, lyricsOffset)) });
    persist(get);
  },
  toggleLyricsLocked: () => {
    set({ lyricsLocked: !get().lyricsLocked });
    persist(get);
  },
  setLyricsPosition: (lyricsPosition) => {
    set({ lyricsPosition });
    persist(get);
  },
}));
