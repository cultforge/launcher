import { invoke } from "@tauri-apps/api/core";
import { getPreference, setPreference } from "./persistentStore";
import type { RemoteNotification } from "./cultApi";
import { useSettingsStore } from "../stores/settings";

const TOASTED_KEY = "experimental.toastedNotificationIds";
const MAX_TOASTED = 400;

let toasted = new Set<string>();
let toastedHydrated = false;
let pollTimer: number | null = null;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function hydrateToasted(): Promise<void> {
  if (toastedHydrated) return;
  toastedHydrated = true;
  const raw = await getPreference<string[]>(TOASTED_KEY);
  if (Array.isArray(raw)) {
    toasted = new Set(raw.filter((id) => typeof id === "string"));
  }
}

async function persistToasted(): Promise<void> {
  const ids = [...toasted];
  if (ids.length > MAX_TOASTED) {
    toasted = new Set(ids.slice(ids.length - MAX_TOASTED));
  }
  await setPreference(TOASTED_KEY, [...toasted]);
}

/** Mark ids so they never toast again (e.g. after in-app read). */
export async function rememberNotificationsToasted(
  ids: string[],
): Promise<void> {
  await hydrateToasted();
  let changed = false;
  for (const id of ids) {
    if (!id || toasted.has(id)) continue;
    toasted.add(id);
    changed = true;
  }
  if (changed) await persistToasted();
}

export async function showOsToast(opts: {
  title: string;
  body?: string;
  tag: string;
}): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("show_os_notification", {
      args: {
        title: opts.title,
        body: opts.body ?? "",
        tag: opts.tag,
      },
    });
  } catch {
    /* toast optional */
  }
}

/** Diff unread remotes and fire OS toasts for never-toasted ones. */
export async function toastNewNotifications(
  remotes: RemoteNotification[],
): Promise<void> {
  const enabled =
    useSettingsStore.getState().settings.experimentalOsToasts === true;
  if (!enabled) return;
  await hydrateToasted();
  const fresh: RemoteNotification[] = [];
  for (const n of remotes) {
    if (n.is_read) {
      if (!toasted.has(n.id)) toasted.add(n.id);
      continue;
    }
    if (toasted.has(n.id)) continue;
    fresh.push(n);
    toasted.add(n.id);
  }
  if (fresh.length) await persistToasted();
  for (const n of fresh) {
    await showOsToast({
      title: n.title || "CultForge",
      body: n.body?.trim() || "",
      tag: n.id,
    });
  }
}

export function startOsToastPolling(refresh: () => Promise<void>): () => void {
  if (pollTimer != null) window.clearInterval(pollTimer);
  const tick = () => {
    if (!useSettingsStore.getState().settings.experimentalOsToasts) return;
    void refresh();
  };
  pollTimer = window.setInterval(tick, 45_000);
  return () => {
    if (pollTimer != null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}
