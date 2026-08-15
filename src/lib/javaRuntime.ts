import { invoke } from "@tauri-apps/api/core";
import type { BuildInstance } from "../stores/build";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type JavaRuntimeInfo = {
  path: string;
  version: string | null;
  major: number | null;
  source: string;
  managed: boolean;
};

export const JAVA_LTS_MAJORS = ["8", "11", "17", "21"] as const;

export function parseJavaMajor(
  hint: string | null | undefined,
): number | null {
  if (!hint) return null;
  const stripped = hint
    .trim()
    .toLowerCase()
    .replace(/^java\s*/i, "")
    .replace(/^jdk\s*/i, "")
    .replace(/^jre\s*/i, "")
    .trim();
  if (
    stripped.startsWith("1.8") ||
    stripped === "8" ||
    stripped.startsWith("8.") ||
    stripped.startsWith("8+")
  ) {
    return 8;
  }
  const digits = stripped.match(/^(\d+)/)?.[1];
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 8 || n > 25) return null;
  return n;
}

/** Official launcher mapping: 1.20.5+ → 21, 1.18–1.20.4 → 17, older → 8. */
export function javaMajorFromMinecraft(
  mc: string | null | undefined,
): number {
  const match = (mc || "").match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return 21;
  const minor = Number(match[2]);
  const patch = Number(match[3] || 0);
  if (minor >= 21) return 21;
  if (minor === 20) return patch >= 5 ? 21 : 17;
  if (minor >= 17) return 17;
  return 8;
}

export function javaMajorFromBuild(
  build: Pick<BuildInstance, "java" | "mc" | "version">,
  fallbackHint?: string,
): number {
  const fromBuild = parseJavaMajor(
    build.java && build.java !== "—" ? build.java : "",
  );
  if (fromBuild) return fromBuild;
  const fromFallback = parseJavaMajor(fallbackHint);
  if (fromFallback) return fromFallback;
  return javaMajorFromMinecraft(build.mc || build.version);
}

export async function listJavaRuntimes(): Promise<JavaRuntimeInfo[]> {
  if (!isTauri()) return [];
  return invoke<JavaRuntimeInfo[]>("list_java_runtimes");
}

export async function ensureJava(
  javaHint?: string | null,
  downloadIfMissing = true,
): Promise<JavaRuntimeInfo> {
  if (!isTauri()) {
    throw new Error("Java install requires the CultForge desktop app");
  }
  return invoke<JavaRuntimeInfo>("ensure_java", {
    javaHint: javaHint ?? null,
    downloadIfMissing,
  });
}

export async function ensureJavaForBuild(
  build: Pick<BuildInstance, "java" | "mc" | "version">,
  fallbackHint?: string,
): Promise<JavaRuntimeInfo> {
  const major = javaMajorFromBuild(build, fallbackHint);
  return ensureJava(String(major), true);
}
