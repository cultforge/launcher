import type { BuildInstance } from "../stores/build";

export type LaunchGate = {
  ok: boolean;
  reason?: string;
};

function hasVersionHint(build: BuildInstance): boolean {
  if (build.versionPath?.trim()) return true;
  if (build.source === "local" && build.id && build.id !== "none") return true;
  const version = build.version?.trim();
  const mc = build.mc?.trim();
  if (version && version !== "—") return true;
  if (mc && mc !== "—") return true;
  return false;
}

/** Guild-managed builds may only launch when synced; all builds need a resolvable MC version. */
export function canLaunchBuild(build: BuildInstance): LaunchGate {
  if (build.id === "none") {
    return {
      ok: false,
      reason: "No Minecraft builds yet. Add one from Mojang in Builds → Add.",
    };
  }

  if (build.managed) {
    if (build.syncStatus === "syncing") {
      return { ok: false, reason: "Guild build is syncing to the guild manifest." };
    }
    if (build.syncStatus === "drift") {
      return {
        ok: false,
        reason: "Guild build is out of sync. Repair it from the guild Builds tab.",
      };
    }
    if (build.syncStatus === "error") {
      return {
        ok: false,
        reason: "Guild build sync failed. Repair it before launching.",
      };
    }
    if (build.syncStatus !== "synced") {
      return { ok: false, reason: "Guild build is not ready." };
    }
  }

  if (!hasVersionHint(build)) {
    return {
      ok: false,
      reason:
        "No Minecraft version linked. Add this version from Mojang, or install it under .minecraft/versions.",
    };
  }

  return { ok: true };
}
