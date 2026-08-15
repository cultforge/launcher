import { useLauncherLogsStore, type LogLevel } from "../stores/launcherLogs";

function push(level: LogLevel, message: string, stack?: string) {
  useLauncherLogsStore.getState().push({ level, message, source: "ui", stack });
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = {
  debug: (message: string) => push("DEBUG", message),
  info: (message: string) => push("INFO", message),
  success: (message: string) => push("SUCCESS", message),
  warn: (message: string) => push("WARNING", message),
  error: (message: string) => push("ERROR", message),
  critical: (message: string) => push("CRITICAL", message),
  exception: (message: string, error?: unknown) =>
    push(
      "EXCEPTION",
      message,
      error instanceof Error ? error.stack : error ? stringify(error) : undefined,
    ),
};

let consoleMirrored = false;

/** Mirror console.log/info/warn/error into the launcher log buffer (best-effort). */
export function installConsoleMirror() {
  if (consoleMirrored) return;
  consoleMirrored = true;

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const forward = (level: LogLevel, args: unknown[]) => {
    try {
      push(level, args.map(stringify).join(" "));
    } catch {
      // Never let log mirroring break the app.
    }
  };

  console.log = (...args: unknown[]) => {
    original.log(...args);
    forward("DEBUG", args);
  };
  console.info = (...args: unknown[]) => {
    original.info(...args);
    forward("INFO", args);
  };
  console.warn = (...args: unknown[]) => {
    original.warn(...args);
    forward("WARNING", args);
  };
  console.error = (...args: unknown[]) => {
    original.error(...args);
    forward("ERROR", args);
  };
}
