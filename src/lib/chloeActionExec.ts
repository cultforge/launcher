import { toast } from "sonner";
import { getClientOrigin, sidecarFetch, unlinkOAuthProvider } from "./client";
import {
  createBuildBackup,
  openInstanceSubdir,
} from "./buildMeta";
import { navigateCultforgeDeepLink } from "./deepLinks";
import { launchMinecraft } from "./launchMinecraft";
import { openInstanceFolder } from "./localContent";
import { logger } from "./logger";
import { useBuildStore, type BuildInstance } from "../stores/build";
import {
  useSettingsUiStore,
  type SettingsCategory,
} from "../stores/settingsUi";
import { useNavigationStore, type PrimaryTab } from "../typlibs";
import {
  inferChloeActionType,
  type ChloePendingAction,
} from "./chloeActionsApi";

export type ChloeActionExecResult = {
  ok: boolean;
  message: string;
  detail?: unknown;
  /** True when the launcher navigated away — caller should close Chloe. */
  closeDrawer?: boolean;
};

function payloadString(
  action: ChloePendingAction,
  keys: string[],
): string {
  for (const key of keys) {
    const value = action.payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function findBuild(buildId: string): BuildInstance | null {
  const id = buildId.trim();
  if (!id) return null;
  const builds = useBuildStore.getState().builds;
  return (
    builds.find((b) => b.id === id) ||
    builds.find((b) => b.id.toLowerCase() === id.toLowerCase()) ||
    null
  );
}

function openHomeSide(side: string, message: string): ChloeActionExecResult {
  const nav = useNavigationStore.getState();
  nav.setPrimaryTab("Home" as PrimaryTab);
  nav.setSideItem(side);
  return { ok: true, message, closeDrawer: true };
}

function openSettingsFromAction(action: ChloePendingAction): ChloeActionExecResult {
  const nav = useNavigationStore.getState();
  nav.setPrimaryTab("Home" as PrimaryTab);
  nav.setSideItem("Settings");

  const section = (
    payloadString(action, ["side", "panel", "section", "category"]) || ""
  ).toLowerCase();
  const map: Record<string, SettingsCategory> = {
    general: "general",
    appearance: "appearance",
    audio: "audio",
    notifications: "notifications",
    paths: "paths",
    assistant: "general",
    chloe: "general",
  };
  if (section && map[section]) {
    useSettingsUiStore.getState().setCategory(map[section]);
  }

  return {
    ok: true,
    message: section ? `Opened Settings → ${section}` : "Opened Settings",
    closeDrawer: true,
  };
}

function openPrimary(tab: PrimaryTab, side?: string): ChloeActionExecResult {
  const nav = useNavigationStore.getState();
  nav.setPrimaryTab(tab);
  if (side) nav.setSideItem(side);
  return { ok: true, message: `Opened ${tab}`, closeDrawer: true };
}

async function sidecarChloeRequest(
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string" ? data.message : `Sidecar ${path} failed`,
    );
  }
  return data;
}

function resolveType(action: ChloePendingAction): string {
  let type = (action.type || "unknown").replace(/[\s-]+/g, "_");
  if (type === "open_launcher") {
    const target = payloadString(action, ["target", "page", "screen", "destination"]);
    if (target) type = inferChloeActionType(target) || "open_launcher";
  }
  if (type === "unknown" || type === "launcher" || type === "launcher_nav") {
    type = inferChloeActionType(
      [action.type, action.title, action.description, action.deepLink || ""].join(
        " ",
      ),
    );
  }
  if (type === "unknown") {
    const target = payloadString(action, [
      "target",
      "page",
      "screen",
      "route",
      "destination",
    ]).toLowerCase();
    if (target) type = inferChloeActionType(target);
  }
  return type.replace(/[\s-]+/g, "_");
}

/**
 * Run a confirmed Chloe action locally.
 * Only known safe types execute; unknown types may still follow a deep link.
 */
export async function executeChloeAction(
  action: ChloePendingAction,
): Promise<ChloeActionExecResult> {
  const type = resolveType(action);
  logger.debug(`Chloe execute type=${type} id=${action.id} title=${action.title}`);

  if (action.deepLink?.toLowerCase().startsWith("cultforge://")) {
    const navigated = navigateCultforgeDeepLink(action.deepLink);
    if (navigated) {
      return {
        ok: true,
        message: `Navigated ${action.deepLink}`,
        closeDrawer: true,
      };
    }
  }

  switch (type) {
    case "nav":
    case "navigate":
    case "deep_link":
    case "deeplink":
    case "open_link": {
      const href =
        action.deepLink ||
        payloadString(action, ["deep_link", "deeplink", "href", "url", "link"]);
      if (!href) {
        return { ok: false, message: "Missing deep link for navigation action" };
      }
      if (!navigateCultforgeDeepLink(href)) {
        return { ok: false, message: `Unsupported deep link: ${href}` };
      }
      return { ok: true, message: `Navigated ${href}`, closeDrawer: true };
    }

    case "open_launcher": {
      const target =
        payloadString(action, ["target", "page", "screen", "destination"]) || "home";
      const href =
        action.deepLink ||
        payloadString(action, ["deep_link", "deeplink", "href"]) ||
        `cultforge://nav/${target}`;
      if (navigateCultforgeDeepLink(href)) {
        return { ok: true, message: `Opened ${href}`, closeDrawer: true };
      }
      const inferred = inferChloeActionType(target);
      if (inferred === "open_settings") return openSettingsFromAction(action);
      if (inferred === "open_discord") return openHomeSide("Discord", "Opened Discord");
      if (inferred === "open_store") return openPrimary("Store");
      if (inferred === "open_builds") return openPrimary("Builds", "Library");
      if (inferred === "open_guilds") return openPrimary("Guilds", "Guilds");
      if (inferred === "open_mods") return openPrimary("Mods");
      if (inferred === "open_downloads") return openHomeSide("Downloads", "Opened Downloads");
      if (inferred === "open_friends") return openHomeSide("Friends", "Opened Friends");
      useNavigationStore.getState().setPrimaryTab("Home" as PrimaryTab);
      useNavigationStore.getState().setSideItem("Home");
      return { ok: true, message: "Opened Home", closeDrawer: true };
    }

    case "set_launcher_pref": {
      const key = payloadString(action, ["key"]) || "telemetry_opt_out";
      const value = action.payload.value ?? true;
      await sidecarChloeRequest("/chloe/prefs", {
        method: "POST",
        body: JSON.stringify({ key, value }),
      });
      return { ok: true, message: `Set ${key}=${String(value)}` };
    }

    case "read_launcher_activity": {
      const data = await sidecarChloeRequest("/chloe/prefs");
      const prefs =
        data.data && typeof data.data === "object"
          ? (data.data as Record<string, unknown>)
          : data;
      const last = (prefs as { last_played?: unknown }).last_played;
      let label = "No last-played session yet";
      if (last && typeof last === "object") {
        const row = last as Record<string, unknown>;
        label = String(
          row.label || row.build_name || row.build || row.build_id || "session",
        );
      } else if (typeof last === "string" && last.trim()) {
        label = last.trim();
      }
      return { ok: true, message: `Last launcher session: ${label}`, detail: prefs };
    }

    case "list_local_builds": {
      const data = await sidecarChloeRequest("/chloe/inventory");
      const inv =
        data.data && typeof data.data === "object"
          ? (data.data as Record<string, unknown>)
          : data;
      const builds = Array.isArray(inv.installed_builds)
        ? inv.installed_builds
        : [];
      if (builds.length === 0) {
        return {
          ok: true,
          message: "No local builds recorded yet.",
          detail: inv,
        };
      }
      const names = builds
        .slice(0, 20)
        .map((row) => {
          if (row && typeof row === "object") {
            const rec = row as Record<string, unknown>;
            return String(rec.name || rec.id || "").trim();
          }
          return String(row).trim();
        })
        .filter(Boolean);
      const more =
        builds.length > 20 ? ` (+${builds.length - 20} more)` : "";
      return {
        ok: true,
        message: `Installed locally: ${names.join(", ")}${more}`,
        detail: inv,
      };
    }

    case "list_local_mods": {
      const data = await sidecarChloeRequest("/chloe/inventory");
      const inv =
        data.data && typeof data.data === "object"
          ? (data.data as Record<string, unknown>)
          : data;
      const needle = payloadString(action, ["mod", "slug", "name"]).toLowerCase();
      const mods = Array.isArray(inv.installed_mods)
        ? inv.installed_mods.map((m) => String(m).trim()).filter(Boolean)
        : [];
      if (needle) {
        const hit = mods.filter(
          (m) => m.toLowerCase().includes(needle) || needle.includes(m.toLowerCase()),
        );
        return {
          ok: true,
          message: hit.length
            ? `${needle} is installed locally (${hit.slice(0, 8).join(", ")}).`
            : `${needle} is not in the local inventory snapshot.`,
          detail: inv,
        };
      }
      if (mods.length === 0) {
        return { ok: true, message: "No local mods recorded yet.", detail: inv };
      }
      const more = mods.length > 20 ? ` (+${mods.length - 20} more)` : "";
      return {
        ok: true,
        message: `Local mods: ${mods.slice(0, 20).join(", ")}${more}`,
        detail: inv,
      };
    }

    case "open_settings":
    case "settings":
    case "launcher_settings":
    case "open_launcher_settings":
      return openSettingsFromAction(action);

    case "open_discord":
    case "discord":
      return openHomeSide("Discord", "Opened Discord");

    case "open_downloads":
    case "downloads":
      return openHomeSide("Downloads", "Opened Downloads");

    case "open_friends":
    case "friends":
      return openHomeSide("Friends", "Opened Friends");

    case "open_store":
    case "store":
      return openPrimary("Store");

    case "open_builds":
    case "builds":
    case "library":
      return openPrimary("Builds", "Library");

    case "open_guilds":
    case "guilds":
      return openPrimary("Guilds", "Guilds");

    case "open_mods":
    case "mods":
      return openPrimary("Mods");

    case "launch":
    case "launch_build":
    case "launch_minecraft":
    case "play": {
      const buildId = payloadString(action, [
        "build_id",
        "buildId",
        "id",
        "instance_id",
      ]);
      const build = findBuild(buildId);
      if (!build) {
        return {
          ok: false,
          message: buildId
            ? `Build not found: ${buildId}`
            : "Missing build_id for launch",
        };
      }
      const started = await launchMinecraft(build);
      return started
        ? { ok: true, message: `Launching ${build.name}` }
        : { ok: false, message: `Could not launch ${build.name}` };
    }

    case "open_folder":
    case "open_instance":
    case "open_instance_folder": {
      const buildId = payloadString(action, [
        "build_id",
        "buildId",
        "id",
        "instance_id",
      ]);
      const subdir = payloadString(action, ["subdir", "folder", "path"]) || "";
      const build = findBuild(buildId);
      if (!build) {
        return {
          ok: false,
          message: buildId
            ? `Build not found: ${buildId}`
            : "Missing build_id for open folder",
        };
      }
      if (subdir) {
        await openInstanceSubdir(build.id, subdir);
        return { ok: true, message: `Opened ${build.name}/${subdir}` };
      }
      if (build.location) {
        await openInstanceFolder(build.location);
        return { ok: true, message: `Opened ${build.name} folder` };
      }
      return { ok: false, message: "Build has no local folder" };
    }

    case "backup":
    case "create_backup":
    case "backup_build": {
      const buildId = payloadString(action, [
        "build_id",
        "buildId",
        "id",
        "instance_id",
      ]);
      const worldsOnly =
        action.payload.worlds_only === true ||
        action.payload.worldsOnly === true;
      if (!buildId) {
        return { ok: false, message: "Missing build_id for backup" };
      }
      const info = await createBuildBackup(buildId, worldsOnly);
      return {
        ok: true,
        message: `Backup created: ${info.id}`,
        detail: info,
      };
    }

    case "unlink_oauth":
    case "unlink_provider": {
      const provider = payloadString(action, ["provider", "name"]);
      if (!provider) {
        return { ok: false, message: "Missing OAuth provider to unlink" };
      }
      await unlinkOAuthProvider(provider);
      return { ok: true, message: `Unlinked ${provider}` };
    }

    case "ack":
    case "acknowledge":
    case "noop":
    case "confirm_only":
      return { ok: true, message: "Acknowledged" };

    default: {
      if (action.deepLink) {
        return {
          ok: false,
          message: `Unsupported deep link for type ${type}`,
        };
      }
      logger.debug(
        `Chloe no executor for type=${type} raw=${JSON.stringify(action.raw).slice(0, 500)}`,
      );
      return {
        ok: true,
        message: `Confirmed ${type || "action"} (no local executor)`,
        detail: { type, acknowledged: true },
      };
    }
  }
}

export function toastChloeActionResult(
  action: ChloePendingAction,
  result: ChloeActionExecResult,
): void {
  if (result.ok) {
    toast.success(action.title, { description: result.message });
  } else {
    toast.error(action.title, { description: result.message });
  }
}
