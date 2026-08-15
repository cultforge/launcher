import { invoke } from "@tauri-apps/api/core";
import type { BuildInstance } from "../stores/build";
import { useSystemMetricsStore } from "../stores/systemMetrics";
import { listLocalContent, type LocalFile } from "./localContent";
import { logger } from "./logger";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type ContentSnapshot = {
  capturedAt: number;
  mods: LocalFile[];
  resourcepacks: LocalFile[];
  shaderpacks: LocalFile[];
  datapacks: LocalFile[];
};

export type SessionLogEntry = {
  name: string;
  path: string;
  modifiedMs: number;
  tail: string;
};

export type SystemSnapshot = {
  os: string;
  arch: string;
  family: string;
  hostname: string | null;
  appVersion: string;
};

/** Snapshot instance content at launch for crash reports. */
export async function snapshotInstanceContent(
  gameDir: string,
): Promise<ContentSnapshot> {
  const empty: ContentSnapshot = {
    capturedAt: Date.now(),
    mods: [],
    resourcepacks: [],
    shaderpacks: [],
    datapacks: [],
  };
  if (!gameDir.trim()) return empty;
  try {
    const content = await listLocalContent(gameDir);
    if (!content) return empty;
    return {
      capturedAt: Date.now(),
      mods: content.mods ?? [],
      resourcepacks: content.resourcepacks ?? [],
      shaderpacks: content.shaderpacks ?? [],
      datapacks: content.datapacks ?? [],
    };
  } catch (err) {
    logger.warn(
      `Content snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return empty;
  }
}

export async function readInstanceLogTail(
  gameDir: string,
  which: "latest" | "launch",
  maxBytes = 48_000,
): Promise<string> {
  if (!isTauri() || !gameDir.trim()) return "";
  try {
    return await invoke<string>("read_instance_log_tail", {
      gameDir,
      which,
      maxBytes,
    });
  } catch {
    return "";
  }
}

export async function listInstanceSessionLogs(
  gameDir: string,
  startedMs: number,
): Promise<SessionLogEntry[]> {
  if (!isTauri() || !gameDir.trim()) return [];
  try {
    return await invoke<SessionLogEntry[]>("list_instance_session_logs", {
      gameDir,
      startedMs,
      maxBytes: 48_000,
    });
  } catch {
    return [];
  }
}

async function readSystemSnapshot(): Promise<SystemSnapshot | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<SystemSnapshot>("system_snapshot");
  } catch {
    return null;
  }
}

function formatFileList(label: string, files: LocalFile[]): string {
  const lines = [`## ${label} (${files.length})`];
  if (files.length === 0) {
    lines.push("- (none)");
    return lines.join("\n");
  }
  for (const f of files) {
    const enabled = f.enabled === false ? "disabled" : "enabled";
    lines.push(
      `- \`${f.fileName || f.name}\` — ${f.sizeMb.toFixed(2)} MB — ${enabled}`,
    );
  }
  return lines.join("\n");
}

export type CrashReportInput = {
  build: BuildInstance;
  gameDir: string;
  versionId: string;
  playerName: string;
  exitCode: number | null;
  startedMs: number | null;
  snapshot: ContentSnapshot | null;
  /** When false, only write a report if logs clearly show a fatal crash. */
  force?: boolean;
};

/** Prefer lines near the end of the session blob (fatal signals usually land last). */
function recentLogSlice(blob: string, maxLines = 120): string {
  const lines = blob.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}

function crashInsights(
  blob: string,
  exitCode: number | null,
  durationMs: number | null,
  sessionLogNames: string[],
): string[] {
  const insights: string[] = [];
  const recent = recentLogSlice(blob);
  const haystack = `${recent}\n${blob}`;

  if (/OutOfMemoryError|Java heap space|GC overhead|Metaspace/i.test(haystack)) {
    insights.push(
      "Out of memory — raise this build’s max RAM in Configuration.",
    );
  }
  if (
    /UnsupportedClassVersionError|class file version|has been compiled by a more recent Java/i.test(
      haystack,
    )
  ) {
    insights.push(
      "Wrong Java major version for this build — install/select Java 17 or 21 to match the loader.",
    );
  }
  if (
    /java\.lang\.module\.ResolutionException|InaccessibleObjectException|--add-opens/i.test(
      haystack,
    )
  ) {
    insights.push(
      "Java module / access error — this version likely needs a different Java (17 or 21) or JVM opens flags.",
    );
  }
  if (
    /Mixin(?:Apply|ApplyError|Exception)|IncompatibleClassChangeError|NoSuchMethodError|NoSuchFieldError|ClassNotFoundException|AbstractMethodError/i.test(
      haystack,
    )
  ) {
    insights.push(
      "Mod conflict or missing class — disable recently added mods and retry.",
    );
  }
  if (
    /DuplicateModsFoundException|Found multiple jars|ModResolutionException|missing or required dependency/i.test(
      haystack,
    )
  ) {
    insights.push(
      "Loader dependency / duplicate mod resolution failed — check Mods for duplicates or missing deps.",
    );
  }
  if (
    /GLFW error|Failed to create window|Could not find a valid GLFW context|lwjgl/i.test(
      haystack,
    )
  ) {
    insights.push(
      "Graphics / GLFW window failure — update GPU drivers or try windowed mode.",
    );
  }
  if (
    /Could not reserve enough space|Failed to create the Java Virtual Machine|Invalid maximum heap size/i.test(
      haystack,
    )
  ) {
    insights.push(
      "JVM failed to start — lower max RAM or free system memory, then relaunch.",
    );
  }
  if (/exit code -1073741819|STATUS_ACCESS_VIOLATION|EXCEPTION_ACCESS_VIOLATION/i.test(haystack)) {
    insights.push(
      "Native access violation — often GPU drivers, overlay software, or a bad native mod.",
    );
  }
  if (
    /#@!@# Game crashed/i.test(haystack) ||
    /---- Minecraft Crash Report ----/i.test(haystack)
  ) {
    insights.push(
      "Minecraft wrote a native crash report — see crash-reports/ in the instance folder.",
    );
  }
  if (
    sessionLogNames.some((name) =>
      /crash-|hs_err|hserr/i.test(name),
    )
  ) {
    insights.push(
      `Session captured crash artifacts: ${sessionLogNames
        .filter((n) => /crash-|hs_err|hserr/i.test(n))
        .slice(0, 4)
        .join(", ")}.`,
    );
  }
  if (
    durationMs != null &&
    durationMs < 10_000 &&
    exitCode != null &&
    exitCode !== 0
  ) {
    insights.push(
      "Exited within 10s with a non-zero code — likely a bootstrap / classpath failure.",
    );
  } else if (
    durationMs != null &&
    durationMs < 45_000 &&
    exitCode != null &&
    exitCode !== 0 &&
    /Exception|Error/i.test(recent)
  ) {
    insights.push(
      "Short session with errors in the late log — check the most recent Exception stack below.",
    );
  }
  if (exitCode != null && exitCode !== 0) {
    insights.push(`Process exit code was ${exitCode}.`);
  }
  if (insights.length === 0) {
    insights.push("No specific pattern matched. Check the session logs below.");
  }
  return [...new Set(insights)];
}

/** True when the log tail shows a real bootstrap/game fatal, not a normal quit. */
export function logsIndicateFatalCrash(latest: string, launch: string): boolean {
  const tail = [latest, launch]
    .flatMap((text) => text.split(/\r?\n/).slice(-80))
    .join("\n");
  const cleaned = tail
    .split("\n")
    .filter(
      (line) =>
        !/If this message is the only thing/i.test(line) &&
        !/ask for further help on the Forge forums/i.test(line) &&
        !/safely ignore this message/i.test(line),
    )
    .join("\n");

  return (
    /---- Minecraft Crash Report ----/i.test(cleaned) ||
    /Exception in thread "main"/i.test(cleaned) ||
    /java\.lang\.module\.ResolutionException/i.test(cleaned) ||
    /InaccessibleObjectException/i.test(cleaned) ||
    /Failed to start Minecraft/i.test(cleaned) ||
    /#@!@# Game crashed/i.test(cleaned) ||
    /BootstrapLauncher.*(?:Error|Exception)/i.test(cleaned) ||
    /OutOfMemoryError|Java heap space/i.test(cleaned) ||
    /Could not create the Java Virtual Machine/i.test(cleaned) ||
    /DuplicateModsFoundException|ModResolutionException/i.test(cleaned) ||
    /Failed to create window|GLFW error/i.test(cleaned)
  );
}

/**
 * Decide whether a session exit should be treated as a crash.
 * Forge/Windows often exits with code 1 on a normal window close.
 */
export function isCrashExit(opts: {
  exitCode: number | null;
  startedMs: number | null;
  latestLog: string;
  launchLog: string;
  intentionalStop?: boolean;
}): boolean {
  if (opts.intentionalStop) return false;
  if (logsIndicateFatalCrash(opts.latestLog, opts.launchLog)) return true;

  const durationMs =
    opts.startedMs != null ? Math.max(0, Date.now() - opts.startedMs) : null;
  if (
    durationMs != null &&
    durationMs < 10_000 &&
    opts.exitCode != null &&
    opts.exitCode !== 0
  ) {
    return true;
  }
  return false;
}

export async function generateCrashReport(
  input: CrashReportInput,
): Promise<string | null> {
  if (!isTauri() || !input.gameDir.trim()) return null;

  const startedMs = input.startedMs ?? 0;
  const sessionLogs = startedMs
    ? await listInstanceSessionLogs(input.gameDir, startedMs)
    : [];

  const launchEntry = sessionLogs.find((l) =>
    l.name.toLowerCase().includes("cultforge-launch"),
  );
  const latestEntry = sessionLogs.find((l) =>
    l.name.toLowerCase().includes("latest.log"),
  );

  const [latestFallback, launchFallback] = await Promise.all([
    latestEntry
      ? Promise.resolve(latestEntry.tail)
      : readInstanceLogTail(input.gameDir, "latest"),
    launchEntry
      ? Promise.resolve(launchEntry.tail)
      : readInstanceLogTail(input.gameDir, "launch"),
  ]);

  const latest = latestEntry?.tail ?? latestFallback;
  const launch = launchEntry?.tail ?? launchFallback;
  const combined =
    sessionLogs.map((l) => l.tail).join("\n") || `${latest}\n${launch}`;

  const crashed =
    input.force === true ||
    isCrashExit({
      exitCode: input.exitCode,
      startedMs: input.startedMs,
      latestLog: combined,
      launchLog: launch,
    });

  if (!crashed) {
    return null;
  }

  const snapshot =
    input.snapshot ?? (await snapshotInstanceContent(input.gameDir));
  const sys = await readSystemSnapshot();
  const metrics = useSystemMetricsStore.getState().latest;
  const when = new Date();
  const stamp = when
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const filename = `cultforge-${stamp}.md`;

  const durationSec =
    input.startedMs != null
      ? Math.max(0, Math.round((Date.now() - input.startedMs) / 1000))
      : null;
  const durationMs =
    input.startedMs != null ? Math.max(0, Date.now() - input.startedMs) : null;
  const sessionLogNames = sessionLogs.map((l) => l.name);
  const insights = crashInsights(
    combined,
    input.exitCode,
    durationMs,
    sessionLogNames,
  );
  const javaLine =
    launch
      .split(/\r?\n/)
      .find(
        (line) =>
          /^java=/i.test(line) || /openjdk version|java version/i.test(line),
      ) ?? "";

  const logSections =
    sessionLogs.length > 0
      ? sessionLogs
          .map(
            (l) =>
              `## ${l.name} (mtime ${new Date(l.modifiedMs).toISOString()})\n\`\`\`\n${l.tail.trim() || "(empty)"}\n\`\`\`\n`,
          )
          .join("\n")
      : [
          `## cultforge-launch.log (tail)`,
          "```",
          launch.trim() || "(empty)",
          "```",
          ``,
          `## latest.log (tail)`,
          "```",
          latest.trim() || "(empty)",
          "```",
          ``,
        ].join("\n");

  const body = [
    `# CultForge crash / session report`,
    ``,
    `- Generated: ${when.toISOString()}`,
    `- Build: ${input.build.name} (\`${input.build.id}\`)`,
    `- Version: \`${input.versionId}\``,
    `- Loader: ${input.build.loader} · MC ${input.build.mc}`,
    `- Player (offline): ${input.playerName}`,
    `- Exit code: ${input.exitCode ?? "unknown"}`,
    `- Session started: ${input.startedMs ? new Date(input.startedMs).toISOString() : "unknown"}`,
    `- Session duration: ${durationSec != null ? `${durationSec}s` : "unknown"}`,
    `- Session log files matched: ${sessionLogNames.length > 0 ? sessionLogNames.join(", ") : "latest/launch fallback only"}`,
    `- Instance: \`${input.gameDir}\``,
    `- Managed: ${input.build.managed ? "yes" : "no"}`,
    ``,
    `## Insights`,
    ...insights.map((line) => `- ${line}`),
    ``,
    `## System state`,
    `- OS: ${sys?.os ?? "unknown"} ${sys?.arch ?? ""} (${sys?.family ?? ""})`,
    `- Host: ${sys?.hostname ?? "unknown"}`,
    `- CultForge: ${sys?.appVersion ?? "unknown"}`,
    `- Java: ${javaLine || "see launch log"}`,
    `- RAM (build): ${input.build.config.memoryMinGb}–${input.build.config.memoryMaxGb} GB`,
    `- Resolution: ${input.build.config.resolution} · fullscreen=${input.build.config.fullscreen} · dedicatedGpu=${input.build.config.dedicatedGpu}`,
    `- Wrapper: ${input.build.config.wrapper?.trim() || "(none)"}`,
    `- JVM args: ${input.build.config.jvmArgs?.trim() || "(default)"}`,
    metrics
      ? `- Live metrics at report: CPU ${metrics.cpu_percent.toFixed(0)}% · RAM ${metrics.ram_used_gb.toFixed(1)}/${metrics.ram_total_gb.toFixed(1)} GB · GPU ${metrics.gpu_percent ?? "n/a"}% · VRAM ${metrics.vram_used_gb ?? "n/a"}/${metrics.vram_total_gb ?? "n/a"} GB`
      : `- Live metrics: unavailable`,
    ``,
    formatFileList("Mods", snapshot.mods),
    ``,
    formatFileList("Resource packs", snapshot.resourcepacks),
    ``,
    formatFileList("Shader packs", snapshot.shaderpacks),
    ``,
    formatFileList("Datapacks", snapshot.datapacks),
    ``,
    `## Build config`,
    "```json",
    JSON.stringify(input.build.config, null, 2),
    "```",
    ``,
    `## Session logs`,
    `Files under logs/ and crash-reports/ with mtime at/after session start (minus a short grace window).`,
    ``,
    logSections,
  ].join("\n");

  try {
    const path = await invoke<string>("write_crash_report", {
      gameDir: input.gameDir,
      filename,
      body,
    });
    logger.error(`Crash report written: ${path}`);
    return path;
  } catch (err) {
    logger.exception("Failed to write crash report", err);
    return null;
  }
}

export async function pushLaunchLogTail(gameDir: string): Promise<void> {
  const launch = await readInstanceLogTail(gameDir, "launch", 12_000);
  if (!launch.trim()) return;
  const lines = launch.trim().split(/\r?\n/).slice(-40);
  for (const line of lines) {
    if (!line.trim()) continue;
    const lower = line.toLowerCase();
    if (lower.includes("exception") || lower.includes("error")) {
      logger.error(`[mc] ${line}`);
    } else if (lower.includes("warn")) {
      logger.warn(`[mc] ${line}`);
    } else {
      logger.info(`[mc] ${line}`);
    }
  }
}
