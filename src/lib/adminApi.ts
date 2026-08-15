import { ClientHttpError, detailFromBody, sidecarFetch, getClientOrigin } from "./client";

export type AdminCatalogEntry = {
  method: string;
  path: string;
  mutate: boolean;
};

export type AdminCatalogAuth = {
  reads?: string[];
  mutates?: string[];
  step_up_url?: string;
};

export type AdminWhoami = {
  admin: boolean;
  capability_active?: boolean;
  roles?: string[];
  step_up_method?: string;
  session_age_minutes?: number;
  step_up_session_max_minutes?: number;
  session_fresh_enough?: boolean;
  [key: string]: unknown;
};

export type AdminStepUpHints = {
  stepUpMethod: string | null;
  sessionAgeMinutes: number | null;
  stepUpSessionMaxMinutes: number;
  sessionFreshEnough: boolean;
};

export type AdminLocalStatus = {
  capability_active: boolean;
  capability_expires_at: number | null;
};

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function pickAdminFlag(obj: Record<string, unknown> | null): boolean {
  if (!obj) return false;
  if (typeof obj.admin === "boolean") return obj.admin;
  const data = asRecord(obj.data);
  if (data && typeof data.admin === "boolean") return data.admin;
  return false;
}

function parseLocalStatus(raw: unknown): AdminLocalStatus {
  const obj = asRecord(raw);
  return {
    capability_active: Boolean(obj?.capability_active),
    capability_expires_at:
      typeof obj?.capability_expires_at === "number"
        ? obj.capability_expires_at
        : null,
  };
}

async function parseSidecarJson(res: Response): Promise<unknown> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && typeof data === "object" ? detailFromBody(data) : "") ||
      `Admin request failed (${res.status})`;
    throw new ClientHttpError(res.status, message, data);
  }
  if (
    data &&
    typeof data === "object" &&
    typeof (data as { code?: unknown }).code === "number" &&
    (data as { code: number }).code >= 400
  ) {
    const code = (data as { code: number }).code;
    const message = detailFromBody(data) || `Admin request failed (${code})`;
    throw new ClientHttpError(code, message, data);
  }
  return data;
}

function parseStepUpHints(data: Record<string, unknown>): AdminStepUpHints {
  return {
    stepUpMethod:
      typeof data.step_up_method === "string" ? data.step_up_method : null,
    sessionAgeMinutes:
      typeof data.session_age_minutes === "number"
        ? data.session_age_minutes
        : null,
    stepUpSessionMaxMinutes:
      typeof data.step_up_session_max_minutes === "number"
        ? data.step_up_session_max_minutes
        : 10,
    sessionFreshEnough: data.session_fresh_enough === true,
  };
}

/** GET /admin/whoami — platform admin gate (no capability JWT in response). */
export async function fetchAdminWhoami(): Promise<{
  whoami: AdminWhoami;
  local: AdminLocalStatus;
  hints: AdminStepUpHints;
}> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/admin/whoami`, { method: "GET" });
  const raw = await parseSidecarJson(res);
  const obj = asRecord(raw) ?? {};
  const data = asRecord(obj.data) ?? obj;
  const local = parseLocalStatus(obj.local);
  const hints = parseStepUpHints(data);
  return {
    whoami: {
      admin: pickAdminFlag(obj),
      ...data,
      capability_active: local.capability_active,
    },
    local,
    hints,
  };
}

/** POST /admin/step-up — empty body; recent OAuth session only (Bearer sKEY). */
export async function adminStepUp(): Promise<AdminLocalStatus> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/admin/step-up`, {
    method: "POST",
  });
  const raw = await parseSidecarJson(res);
  const obj = asRecord(raw) ?? {};
  return parseLocalStatus(obj.local);
}

/** GET /admin/catalog — staff command map for launcher binding. */
export async function fetchAdminCatalog(): Promise<{
  entries: AdminCatalogEntry[];
  auth: AdminCatalogAuth;
}> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/admin/catalog`, { method: "GET" });
  const raw = await parseSidecarJson(res);
  const obj = asRecord(raw) ?? {};
  const data = obj.data;
  const entries: AdminCatalogEntry[] = Array.isArray(data)
    ? data
        .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === "object"))
        .map((e) => ({
          method: String(e.method ?? "GET").toUpperCase(),
          path: String(e.path ?? ""),
          mutate: Boolean(e.mutate),
        }))
        .filter((e) => e.path.startsWith("/v1/admin/"))
    : [];
  const authRaw = asRecord(obj.auth) ?? {};
  return {
    entries,
    auth: {
      reads: Array.isArray(authRaw.reads)
        ? authRaw.reads.map(String)
        : undefined,
      mutates: Array.isArray(authRaw.mutates)
        ? authRaw.mutates.map(String)
        : undefined,
      step_up_url:
        typeof authRaw.step_up_url === "string"
          ? authRaw.step_up_url
          : undefined,
    },
  };
}

/** POST /admin/request — catalog-guarded proxy (future tool binding). */
export async function adminRequest(opts: {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const origin = await getClientOrigin();
  const res = await sidecarFetch(`${origin}/admin/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: opts.method.toUpperCase(),
      path: opts.path,
      query: opts.query,
      body: opts.body,
    }),
  });
  return parseSidecarJson(res);
}

/** GET list helper — wraps adminRequest for read endpoints. */
export async function adminGetList(
  path: string,
  query?: Record<string, string>,
): Promise<unknown> {
  return adminRequest({ method: "GET", path, query });
}

/** GET detail helper — resolves templated paths with params. */
export async function adminGetDetail(
  pathTemplate: string,
  params: Record<string, string>,
  query?: Record<string, string>,
): Promise<unknown> {
  let path = pathTemplate;
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`{${key}}`, encodeURIComponent(value));
  }
  return adminRequest({ method: "GET", path, query });
}

export { extractRows, extractTotal, extractTimeSeries, extractPieSlices } from "./adminParse";
