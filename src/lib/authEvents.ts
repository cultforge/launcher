import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAppStore } from "../userstore";
import type { OAuthCallbackPayload } from "../userstore";

let started = false;
let unlisten: UnlistenFn | null = null;

function coerceCallback(raw: unknown): OAuthCallbackPayload {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pick = (key: string): string | undefined =>
    typeof obj[key] === "string" ? (obj[key] as string) : undefined;
  return {
    status: Boolean(obj.status ?? true),
    message: pick("message"),
    // Tokens are intentionally omitted from WS — sidecar holds the JWT.
    token: pick("token"),
    token_kind: pick("token_kind"),
    avatar_url: pick("avatar_url") ?? pick("avatarUrl"),
    email: pick("email"),
    name: pick("name"),
    username: pick("username"),
    handle_name: pick("handle_name") ?? pick("handleName"),
    handle: pick("handle"),
    user_id: pick("user_id") ?? pick("userId"),
    provider: pick("provider"),
  };
}

/** Forward WS / Tauri oauth completion into the auth store (idempotent). */
export function startAuthEventBridge() {
  if (started) return;
  started = true;

  void listen<unknown>("oauth-complete", (event) => {
    void useAppStore
      .getState()
      .applyOAuthCallback(coerceCallback(event.payload));
  }).then((fn) => {
    unlisten = fn;
  });
}

export function stopAuthEventBridge() {
  unlisten?.();
  unlisten = null;
  started = false;
}

export function handleOAuthWsMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  if ((payload as { type?: unknown }).type !== "oauth_callback") return false;
  void useAppStore.getState().applyOAuthCallback(coerceCallback(payload));
  return true;
}
