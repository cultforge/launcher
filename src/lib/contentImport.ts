import { toast } from "sonner";
import {
  importContentUrlNative,
  importInstanceFiles,
  importWorldNative,
  pickContentFiles,
  type ImportFilesResult,
  type ImportWorldResult,
} from "./buildMeta";
import { scanWorldFolder } from "./localContent";
import { parseWorldScan } from "./worldScan";
import { useBuildStore } from "../stores/build";
import { useLibraryContentStore } from "../stores/libraryContent";
import { logger } from "./logger";

export type ContentImportKind =
  | "mods"
  | "resourcepacks"
  | "shaderpacks"
  | "datapacks";

export type WorldImportResult = ImportWorldResult & {
  warnings: string[];
  mcVersion?: string;
};

function activeBuildOrThrow() {
  const build = useBuildStore.getState().active();
  if (!build?.id || build.id === "none") {
    throw new Error("Select a build first.");
  }
  if (build.managed) {
    throw new Error("Guild-managed builds cannot import local content here.");
  }
  if (!build.location?.trim()) {
    throw new Error("This build has no instance folder yet.");
  }
  return build;
}

async function rescanActive(location: string) {
  await useLibraryContentStore.getState().scan(location);
}

function toastReroutes(result: ImportFilesResult) {
  if (!result.reroutes.length) return;
  const first = result.reroutes[0];
  const more =
    result.reroutes.length > 1
      ? ` (+${result.reroutes.length - 1} more)`
      : "";
  toast.message(`Routed “${first.name}” to ${first.toKind}`, {
    description: `Detected as ${first.toKind} instead of ${first.fromKind}.${more}`,
  });
}

function worldCompatWarnings(
  worldMc: string | undefined,
  buildMc: string,
  buildLoader: string,
): string[] {
  const warnings: string[] = [];
  const buildVersion = (buildMc || "").trim();
  const reported = (worldMc || "").trim();
  if (reported && buildVersion && reported !== buildVersion) {
    warnings.push(
      `World reports Minecraft ${reported}; active build is ${buildLoader || "unknown"} ${buildVersion}.`,
    );
  } else if (!reported && buildVersion) {
    warnings.push(
      `Could not read world version from level.dat; active build is ${buildVersion}.`,
    );
  }
  return warnings;
}

async function finalizeWorldImport(
  imported: ImportWorldResult,
): Promise<WorldImportResult> {
  const build = useBuildStore.getState().active();
  const warnings: string[] = [];
  let mcVersion: string | undefined;

  try {
    const scanned = await scanWorldFolder(imported.worldPath);
    const parsed = parseWorldScan(scanned);
    mcVersion = parsed?.mcVersion;
    warnings.push(
      ...worldCompatWarnings(mcVersion, build.mc, build.loader),
    );
  } catch (err) {
    logger.warn(
      `World scan after import failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    warnings.push("Imported, but scanner could not read world metadata.");
  }

  if (build.location) {
    await rescanActive(build.location);
  }

  return { ...imported, warnings, mcVersion };
}

export async function importWorldFromFolder(): Promise<WorldImportResult> {
  const build = activeBuildOrThrow();
  const paths = await pickContentFiles("worlds-folder");
  if (!paths.length) {
    throw new Error("cancelled");
  }
  const imported = await importWorldNative(build.id, paths[0], "folder");
  return finalizeWorldImport(imported);
}

export async function importWorldFromZip(): Promise<WorldImportResult> {
  const build = activeBuildOrThrow();
  const paths = await pickContentFiles("worlds");
  if (!paths.length) {
    throw new Error("cancelled");
  }
  const imported = await importWorldNative(build.id, paths[0], "zip");
  return finalizeWorldImport(imported);
}

export async function importWorldFromUrl(
  url: string,
): Promise<WorldImportResult> {
  const build = activeBuildOrThrow();
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Enter a https:// URL.");
  const imported = await importWorldNative(build.id, trimmed, "url");
  return finalizeWorldImport(imported);
}

export async function importContentFiles(
  kind: ContentImportKind,
): Promise<number> {
  const build = activeBuildOrThrow();
  const paths = await pickContentFiles(kind);
  if (!paths.length) {
    throw new Error("cancelled");
  }
  const result = await importInstanceFiles(build.id, kind, paths);
  toastReroutes(result);
  if (build.location) await rescanActive(build.location);
  return result.imported;
}

export async function importContentFromUrl(
  kind: ContentImportKind,
  url: string,
): Promise<string> {
  const build = activeBuildOrThrow();
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Enter a https:// URL.");
  const result = await importContentUrlNative(build.id, kind, trimmed);
  toastReroutes(result);
  if (build.location) await rescanActive(build.location);
  return kind;
}

export function toastWorldImport(result: WorldImportResult) {
  if (result.warnings.length) {
    toast.message(`Imported “${result.worldName}”`, {
      description: result.warnings.join(" "),
    });
  } else {
    toast.success(`Imported “${result.worldName}”`, {
      description: result.mcVersion
        ? `Compatible with Minecraft ${result.mcVersion}.`
        : "World added to this build’s saves.",
    });
  }
}

export function isImportCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === "cancelled";
}
