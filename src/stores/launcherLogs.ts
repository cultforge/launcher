import { create } from "zustand";

export type LogLevel =
  | "DEBUG"
  | "INFO"
  | "SUCCESS"
  | "WARNING"
  | "ERROR"
  | "CRITICAL"
  | "EXCEPTION";

export type LogSource = "ui" | "client";

export type LogEntry = {
  id: string;
  ts: number;
  level: LogLevel;
  message: string;
  source: LogSource;
  stack?: string;
};

/** Frontend ring-buffer cap; oldest entries are dropped first. */
export const LOG_CAP = 2000;

let seq = 0;
function nextId() {
  seq += 1;
  return `log-${Date.now()}-${seq}`;
}

type LauncherLogsStore = {
  entries: LogEntry[];
  push: (entry: {
    level: LogLevel;
    message: string;
    source?: LogSource;
    ts?: number;
    stack?: string;
  }) => void;
  clear: () => void;
};

export const useLauncherLogsStore = create<LauncherLogsStore>((set) => ({
  entries: [],
  push: (entry) =>
    set((state) => {
      const next = [
        ...state.entries,
        {
          id: nextId(),
          ts: entry.ts ?? Date.now(),
          level: entry.level,
          message: entry.message,
          source: entry.source ?? "ui",
          stack: entry.stack,
        },
      ];
      // Front-trim: keep only the newest LOG_CAP entries.
      return {
        entries:
          next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next,
      };
    }),
  clear: () => set({ entries: [] }),
}));
