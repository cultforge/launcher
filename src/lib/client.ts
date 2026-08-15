import { invoke } from "@tauri-apps/api/core";

let cachedOrigin: string | null = null;
let cachedLoopbackSecret: string | null = null;

export const LOOPBACK_HEADER = "X-CultForge-Loopback-Secret";
export const LOOPBACK_QUERY = "cf_loopback";

type SidecarInfo = {
  port: number;
  loopbackSecret: string;
};

async function bootstrapSidecarInfo(): Promise<SidecarInfo | null> {
  try {
    return await invoke<SidecarInfo>("get_sidecar_info");
  } catch {
    try {
      const port = await invoke<number>("get_port");
      let loopbackSecret = "";
      try {
        loopbackSecret = await invoke<string>("get_loopback_secret");
      } catch {
        /* older binary */
      }
      return { port, loopbackSecret };
    } catch {
      return null;
    }
  }
}

export async function getLoopbackSecret(): Promise<string> {
  if (cachedLoopbackSecret) return cachedLoopbackSecret;
  const info = await bootstrapSidecarInfo();
  if (info?.loopbackSecret) cachedLoopbackSecret = info.loopbackSecret;
  if (info?.port && !cachedOrigin) {
    cachedOrigin = `http://127.0.0.1:${info.port}`;
  }
  return info?.loopbackSecret ?? "";
}

export async function sidecarHeaders(extra?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extra);
  const secret = await getLoopbackSecret();
  if (secret) headers.set(LOOPBACK_HEADER, secret);
  return headers;
}

/** Fetch the local sidecar with per-launch loopback secret attached. */
export async function sidecarFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const secret = await getLoopbackSecret();
  let target = url;
  if (secret) {
    const parsed = new URL(url);
    parsed.searchParams.set(LOOPBACK_QUERY, secret);
    target = parsed.toString();
  }
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  // GET/HEAD: query param only — avoids CORS preflight on startup ping/health.
  if (secret && method !== "GET" && method !== "HEAD") {
    headers.set(LOOPBACK_HEADER, secret);
  }
  return fetch(target, { ...init, headers });
}

/** Append loopback query param for <img> / WebSocket URLs that cannot set headers. */
export async function appendLoopbackQuery(url: string): Promise<string> {
  const secret = await getLoopbackSecret();
  if (!secret) return url;
  const parsed = new URL(url);
  parsed.searchParams.set(LOOPBACK_QUERY, secret);
  return parsed.toString();
}

export async function getClientOrigin(): Promise<string> {
  if (cachedOrigin) return cachedOrigin;
  const info = await bootstrapSidecarInfo();
  if (info?.port) {
    cachedOrigin = `http://127.0.0.1:${info.port}`;
    if (info.loopbackSecret) cachedLoopbackSecret = info.loopbackSecret;
    return cachedOrigin;
  }
  // Browser-only dev fallback — do not cache; Tauri invoke may succeed later.
  return "http://127.0.0.1:8000";
}

export async function ping(signal?: AbortSignal): Promise<boolean> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/ping`, { method: "GET", signal });
  if (!res.ok) return false;
  const data = await res.json();
  return data?.status === "ok";
}

export type ClientHealth = {
  local: boolean;
  remote: boolean;
  version?: string;
  remote_error?: string;
};

export async function health(signal?: AbortSignal): Promise<ClientHealth> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/health`, { method: "GET", signal });
  if (!res.ok) {
    return { local: false, remote: false };
  }
  return (await res.json()) as ClientHealth;
}

export type SystemMetrics = {
  ts: number;
  cpu_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  disk_used_gb: number;
  disk_total_gb: number;
  disk_read_mbs: number;
  disk_write_mbs: number;
  net_up_kbs: number;
  net_down_kbs: number;
  gpu_percent: number | null;
  vram_used_gb: number | null;
  vram_total_gb: number | null;
};

export async function fetchSystemMetrics(
  signal?: AbortSignal,
): Promise<SystemMetrics> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/system/metrics`, {
    method: "GET",
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      body || `System metrics failed (${res.status})`,
    );
  }
  return (await res.json()) as SystemMetrics;
}

type WaitForClientOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  onAttempt?: (attempt: number, elapsedMs: number) => void;
};

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Startup cancelled", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function waitForClient(
  options: number | WaitForClientOptions = 15000,
): Promise<void> {
  const config =
    typeof options === "number" ? { timeoutMs: options } : options;
  const timeoutMs = config.timeoutMs ?? 15000;
  const start = Date.now();
  let attempt = 0;
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    if (config.signal?.aborted) {
      throw new DOMException("Startup cancelled", "AbortError");
    }
    attempt += 1;
    config.onAttempt?.(attempt, Date.now() - start);
    try {
      if (await ping(config.signal)) return;
    } catch (e) {
      lastErr = e;
    }
    await wait(400, config.signal);
  }
  throw new Error(
    lastErr instanceof Error
      ? lastErr.message
      : "Timed out waiting for local client",
  );
}

export class ClientHttpError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ClientHttpError";
    this.status = status;
    this.body = body;
  }
}

export function detailFromBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const obj = body as Record<string, unknown>;
  // Prefer human message over opaque error codes (e.g. dispatch_failed).
  for (const key of ["message", "detail", "error"]) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** True for 401/403 (or matching message text) that require re-auth. */
export function isUnauthorizedError(error: unknown): boolean {
  if (error instanceof ClientHttpError) {
    return error.status === 401 || error.status === 403;
  }
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    return (
      lower.includes("unauthorized") ||
      lower.includes("session expired") ||
      lower.includes("device not authorised") ||
      lower.includes("device not authorized") ||
      /\b401\b/.test(lower) ||
      /\b403\b/.test(lower)
    );
  }
  return false;
}

/**
 * Hard auth failures must clear keyring / force re-login.
 * Soft failures (network, 5xx, remote_unavailable) must keep the session.
 */
export function isHardAuthError(error: unknown): boolean {
  return isUnauthorizedError(error);
}

/** Remote/network outages — keep keyring and fall back to cached profile. */
export function isSoftRemoteError(error: unknown): boolean {
  if (isHardAuthError(error)) return false;

  if (error instanceof ClientHttpError) {
    if (error.status >= 500) return true;
    if (error.status === 0 || error.status === 408 || error.status === 429) {
      return true;
    }
    const detail = detailFromBody(error.body).toLowerCase();
    if (
      detail.includes("remote_unavailable") ||
      detail.includes("remote cultforge") ||
      detail.includes("offline")
    ) {
      return true;
    }
    // Non-auth 4xx from profile are soft for hydrate (keep keyring).
    if (error.status >= 400 && error.status < 500) return true;
  }

  if (error instanceof TypeError) return true; // fetch failed / network

  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    return (
      lower.includes("remote_unavailable") ||
      lower.includes("failed to fetch") ||
      lower.includes("network") ||
      lower.includes("timeout") ||
      lower.includes("timed out") ||
      lower.includes("econnrefused") ||
      lower.includes("offline") ||
      lower.includes("remote cultforge")
    );
  }

  return true;
}

export function isForbiddenError(error: unknown): boolean {
  if (error instanceof ClientHttpError) return error.status === 403;
  if (error instanceof Error) {
    return (
      /\b403\b/.test(error.message) ||
      error.message.toLowerCase().includes("device not authorised") ||
      error.message.toLowerCase().includes("access denied")
    );
  }
  return false;
}

/**
 * Map remote auth failures to launcher copy.
 * - 403 → device / fingerprint / scope denial
 * - 401 → expired or revoked session
 */
export function authFailureMessage(error: unknown): string {
  const status =
    error instanceof ClientHttpError
      ? error.status
      : error instanceof Error && /\b403\b/.test(error.message)
        ? 403
        : error instanceof Error && /\b401\b/.test(error.message)
          ? 401
          : 0;

  const detail =
    (error instanceof ClientHttpError
      ? detailFromBody(error.body) || error.message
      : error instanceof Error
        ? error.message
        : "") || "";
  const lower = detail.toLowerCase();

  if (
    status === 403 ||
    lower.includes("access denied") ||
    lower.includes("fingerprint") ||
    lower.includes("requires nothing but yet") ||
    lower.includes("invalid token scope")
  ) {
    return "Device not authorised. Sign in again from this device.";
  }

  if (
    status === 401 ||
    lower.includes("session expired") ||
    lower.includes("unauthorized") ||
    lower.includes("please login") ||
    lower.includes("please log in")
  ) {
    return "Session expired. Sign in again.";
  }

  if (detail && !detail.startsWith("Request failed")) {
    return detail;
  }

  return "Sign in again to continue.";
}

export async function send<T = unknown>(
  module: string,
  command: string,
  params: Record<string, string> = {},
): Promise<T> {
  return sendRequest<T>(module, command, params, "GET");
}

/** POST/PATCH/PUT/DELETE dispatch with JSON body (guilds update, invites, etc.). */
export async function sendMutate<T = unknown>(
  module: string,
  command: string,
  body: Record<string, unknown> = {},
  method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST",
): Promise<T> {
  return sendRequest<T>(module, command, body, method);
}

async function sendRequest<T = unknown>(
  module: string,
  command: string,
  payload: Record<string, unknown>,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
): Promise<T> {
  const origin = await getClientOrigin();
  const upper = method.toUpperCase();
  let url = `${origin}/send/${module}/${command}`;
  const init: RequestInit = { method: upper };

  if (upper === "GET" || upper === "DELETE") {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) continue;
      qs.set(key, String(value));
    }
    const q = qs.toString();
    if (q) url += `?${q}`;
  } else {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(payload);
  }

  const res = await sidecarFetch(url, init);
  const data = await res.json().catch(() => ({}));

  // Purposeful OAuth (etc.) redirects — body carries Location; never treat as failure.
  if (
    data &&
    typeof data === "object" &&
    (data as { redirect?: unknown }).redirect === true
  ) {
    return data as T;
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object"
        ? detailFromBody(data)
        : "") || `Request failed (${res.status})`;
    throw new ClientHttpError(res.status, message, data);
  }
  if (
    data &&
    typeof data === "object" &&
    typeof (data as { code?: unknown }).code === "number" &&
    (data as { code: number }).code >= 400
  ) {
    const code = (data as { code: number }).code;
    const message = detailFromBody(data) || `Request failed (${code})`;
    throw new ClientHttpError(code, message, data);
  }
  return data as T;
}

export type OAuthProvider = "google" | "github" | "discord" | "microsoft";

export type OAuthStartResult = {
  url?: string;
  location?: string;
  redirect?: boolean | string;
  status?: number;
  error?: string;
  message?: string;
};

function pickOAuthUrl(data: OAuthStartResult): string | null {
  if (typeof data.location === "string" && data.location) return data.location;
  if (typeof data.url === "string" && data.url) return data.url;
  if (typeof data.redirect === "string" && data.redirect.startsWith("http")) {
    return data.redirect;
  }
  return null;
}

function requireOAuthUrl(data: OAuthStartResult, action: string): string {
  if (data.error === "remote_unavailable" || data.error) {
    throw new Error(
      data.message || "Remote CultForge APIs are offline. Try again later.",
    );
  }
  const url = pickOAuthUrl(data);
  if (!url) {
    throw new Error(`${action} did not return a redirect URL.`);
  }
  return url;
}

export type LinkedOAuthProvider = {
  provider: string;
  linked: boolean;
  label?: string;
  email?: string | null;
  username?: string | null;
};

function asProviderList(data: unknown): LinkedOAuthProvider[] {
  if (Array.isArray(data)) {
    return data.map((entry) => {
      if (typeof entry === "string") {
        return { provider: entry, linked: true };
      }
      const obj =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
      const provider = String(obj.provider ?? obj.name ?? obj.id ?? "unknown");
      const linked =
        typeof obj.linked === "boolean"
          ? obj.linked
          : typeof obj.connected === "boolean"
            ? obj.connected
            : true;
      return {
        provider,
        linked,
        label: typeof obj.label === "string" ? obj.label : undefined,
        email: typeof obj.email === "string" ? obj.email : null,
        username:
          typeof obj.username === "string"
            ? obj.username
            : typeof obj.login === "string"
              ? obj.login
              : null,
      };
    });
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["providers", "linked", "accounts", "items", "data"]) {
      if (Array.isArray(obj[key])) return asProviderList(obj[key]);
    }
    const entries = Object.entries(obj).filter(
      ([k, v]) =>
        typeof v === "boolean" &&
        ["google", "github", "discord", "microsoft"].includes(k),
    );
    if (entries.length) {
      return entries.map(([provider, linked]) => ({
        provider,
        linked: Boolean(linked),
      }));
    }
  }
  return [];
}

/** Start sign-in OAuth (`ct_oauth`); returns the browser URL to open. */
export async function startOAuth(provider: OAuthProvider): Promise<string> {
  const origin = await getClientOrigin();
  const redirectUri = `${origin}/auth/callback`;
  const data = await send<OAuthStartResult>("auth", "ct_oauth", {
    provider,
    redirect_uri: redirectUri,
  });
  return requireOAuthUrl(data, "OAuth start");
}

/** List linked OAuth providers for the current session (`list_oauth_providers`). */
export async function listOAuthProviders(): Promise<LinkedOAuthProvider[]> {
  const data = await send<unknown>("auth", "list_oauth_providers");
  return asProviderList(data);
}

/**
 * Start OAuth while signed in to attach a provider (`link_oauth_provider`).
 * Returns the browser URL to open.
 */
export async function linkOAuthProvider(
  provider: OAuthProvider,
): Promise<string> {
  const origin = await getClientOrigin();
  const redirectUri = `${origin}/auth/callback`;
  const data = await send<OAuthStartResult>("auth", "link_oauth_provider", {
    provider,
    redirect_uri: redirectUri,
  });
  return requireOAuthUrl(data, "Account link");
}

/** Detach a provider from the current account (`unlink_oauth_provider`). */
export async function unlinkOAuthProvider(provider: string): Promise<unknown> {
  return send("auth", "unlink_oauth_provider", { provider });
}

export async function openOAuthUrl(url: string): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

/** GET /v1/profile/me via sidecar dispatch (get_my_profile). */
export async function fetchMyProfile(): Promise<unknown> {
  return send("api", "get_my_profile");
}

/** GET /v1/friends via sidecar dispatch (get_my_friends). */
export async function fetchMyFriends(): Promise<unknown> {
  return send("api", "get_my_friends");
}

export type SessionStatus = {
  status: boolean;
  has_session?: boolean;
};

export async function fetchSessionStatus(
  signal?: AbortSignal,
): Promise<SessionStatus> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/auth/session`, { method: "GET", signal });
  if (!res.ok) {
    return { status: false, has_session: false };
  }
  return (await res.json()) as SessionStatus;
}

export type UserSearchScope = "username" | "user_id" | "prefix";

export async function searchCultUser(
  query: string,
  scope: UserSearchScope = "username",
  limit = 20,
): Promise<unknown> {
  const params: Record<string, string> = { query, scope };
  if (scope === "prefix") params.limit = String(limit);
  return send("api", "cult_user_search", params);
}

export type CreateAccountPayload = {
  username: string;
  password: string;
  email: string;
  handle_name: string;
  avatar_url: string;
};

export async function createAccount(
  payload: CreateAccountPayload,
): Promise<unknown> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/auth/create_account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message ?? "")
        : "") || `Create account failed (${res.status})`;
    throw new Error(message);
  }
  if (
    data &&
    typeof data === "object" &&
    "status" in data &&
    (data as { status?: unknown }).status === false
  ) {
    throw new Error(
      String((data as { message?: unknown }).message ?? "Create account failed"),
    );
  }
  return data;
}

export async function updateHandle(new_handle_name: string): Promise<unknown> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/auth/update_handle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_handle_name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message ?? "")
        : "") || `Update handle failed (${res.status})`;
    throw new ClientHttpError(res.status, message, data);
  }
  if (
    data &&
    typeof data === "object" &&
    "status" in data &&
    (data as { status?: unknown }).status === false
  ) {
    const code =
      typeof (data as { code?: unknown }).code === "number"
        ? (data as { code: number }).code
        : 400;
    throw new ClientHttpError(
      code,
      String((data as { message?: unknown }).message ?? "Update handle failed"),
      data,
    );
  }
  return data;
}

export type UpdateAvatarPayload = {
  /** http(s) URL; null/empty with no base64 clears the picture. */
  avatar_url?: string | null;
  /** Raw or data-URL base64 (png/jpeg/webp, max 512 KiB decoded). */
  avatar_base64?: string | null;
  content_type?: string | null;
};

/** Set profile picture via file upload (base64), external URL, or clear. */
export async function updateMyAvatar(
  payload: UpdateAvatarPayload | string | null,
): Promise<unknown> {
  const body: UpdateAvatarPayload =
    payload === null || typeof payload === "string"
      ? { avatar_url: payload }
      : payload;

  // Send only the active mode — remote validator rejects mixed payloads.
  const json: Record<string, string | null> = {};
  const b64 = (body.avatar_base64 || "").trim();
  if (b64) {
    json.avatar_base64 = b64;
    if (body.content_type) json.content_type = body.content_type;
  } else if (body.avatar_url != null && String(body.avatar_url).trim()) {
    json.avatar_url = String(body.avatar_url).trim();
  } else {
    json.avatar_url = null;
  }

  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/auth/update_avatar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      detailFromBody(data) || `Update avatar failed (${res.status})`;
    throw new ClientHttpError(res.status, message, data);
  }
  if (
    data &&
    typeof data === "object" &&
    "status" in data &&
    (data as { status?: unknown }).status === false
  ) {
    const code =
      typeof (data as { code?: unknown }).code === "number"
        ? (data as { code: number }).code
        : 400;
    throw new ClientHttpError(
      code,
      String(
        (data as { message?: unknown }).message ?? "Update avatar failed",
      ),
      data,
    );
  }
  return data;
}

export async function applySessionToken(token: string): Promise<void> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Failed to apply session (${res.status})`);
  }
}

export type OAuthPendingStatus = {
  status: boolean;
  has_session?: boolean;
  has_register?: boolean;
  ready?: boolean;
  oauth?: {
    status: boolean;
    message?: string;
    token_kind?: string;
    avatar_url?: string;
    email?: string;
    name?: string;
    username?: string;
    handle_name?: string;
    handle?: string;
    user_id?: string;
    provider?: string;
  };
};

/** Poll while waiting for browser OAuth (WS fallback). */
export async function fetchOAuthPending(
  signal?: AbortSignal,
): Promise<OAuthPendingStatus> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/auth/oauth/pending`, {
    method: "GET",
    signal,
  });
  if (!res.ok) {
    return { status: false, ready: false };
  }
  return (await res.json()) as OAuthPendingStatus;
}

export async function logout(): Promise<unknown> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/logout`);
  return res.json();
}

export type DeleteAccountPayload = {
  confirm: boolean;
  delete_owned_guilds?: boolean;
  password?: string | null;
};

export async function deleteAccount(
  payload: DeleteAccountPayload = { confirm: true },
): Promise<unknown> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/auth/delete_account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirm: payload.confirm,
      delete_owned_guilds: payload.delete_owned_guilds ?? false,
      password: payload.password ?? null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message ?? "")
        : "") || `Delete account failed (${res.status})`;
    throw new ClientHttpError(res.status, message, data);
  }
  if (
    data &&
    typeof data === "object" &&
    "status" in data &&
    (data as { status?: unknown }).status === false
  ) {
    throw new Error(
      String((data as { message?: unknown }).message ?? "Delete account failed"),
    );
  }
  return data;
}

/** Best-effort extract of session JWT from create_account / oauth payloads. */
export function extractSessionToken(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  for (const key of ["token", "access_token", "session_token"]) {
    const value = obj[key];
    if (typeof value === "string" && value.split(".").length >= 3) return value;
  }
  if (obj.data && typeof obj.data === "object") {
    const nested = extractSessionToken(obj.data);
    if (nested) return nested;
  }
  if (obj.payload && typeof obj.payload === "object") {
    return extractSessionToken(obj.payload);
  }
  return null;
}
