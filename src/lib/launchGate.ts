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

/** Guild-managed builds may launch after level-1 play sync; block only while mid-sync. */
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
    // drift / error / unknown: Play still allowed — level-1 sync repairs then launches.
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
