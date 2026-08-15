import { send, sendMutate } from "./client";
import { logger } from "./logger";

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown> | null, keys: string[]): string {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const obj = asRecord(raw);
  if (!obj) return [];
  for (const key of ["data", "actions", "pending", "items", "results"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    const nested = asRecord(value);
    if (nested) {
      for (const inner of ["actions", "pending", "items", "data"]) {
        if (Array.isArray(nested[inner])) return nested[inner] as unknown[];
      }
    }
  }
  return [];
}

const TYPE_KEYS = [
  "type",
  "kind",
  "action",
  "action_type",
  "actionType",
  "op",
  "opcode",
  "command",
  "intent",
  "capability",
  "tool",
  "tool_name",
  "toolName",
  "target",
  "destination",
  "page",
  "screen",
  "route",
  "path",
  "nav",
  "launcher_action",
  "launcherAction",
] as const;

export type ChloePendingAction = {
  id: string;
  type: string;
  title: string;
  description: string;
  deepLink: string | null;
  payload: Record<string, unknown>;
  createdAt: string | null;
  expiresAt: string | null;
  raw: unknown;
};

/** Infer launcher op from free-text title/description when API omits type. */
export function inferChloeActionType(text: string): string {
  const t = text.toLowerCase();
  if (!t.trim()) return "unknown";

  if (/\bopen_launcher\b/.test(t)) return "open_launcher";
  if (/\blist_local_builds\b|\binstalled builds?\b/.test(t)) {
    return "list_local_builds";
  }
  if (/\blist_local_mods\b|\binstalled mods?\b/.test(t)) {
    return "list_local_mods";
  }
  if (
    /\bsettings?\b/.test(t) ||
    /open\s+(the\s+)?(cultforge\s+)?launcher\s+to\s+settings/.test(t)
  ) {
    return "open_settings";
  }
  if (/\bdiscord\b/.test(t)) return "open_discord";
  if (/\bstore\b/.test(t) || /\bmodrinth\b/.test(t)) return "open_store";
  if (/\bbuilds?\b/.test(t) || /\blibrary\b/.test(t)) return "open_builds";
  if (/\bguilds?\b/.test(t)) return "open_guilds";
  if (/\bmods?\b/.test(t) && !/\bmodrinth\b/.test(t)) return "open_mods";
  if (/\bdownloads?\b/.test(t)) return "open_downloads";
  if (/\bfriends?\b/.test(t)) return "open_friends";
  if (/\blaunch\b|\bplay\b/.test(t) && /\bminecraft\b|\bbuild\b/.test(t)) {
    return "launch_build";
  }
  if (/\bbackup\b/.test(t)) return "create_backup";
  if (/\bunlink\b/.test(t) && /\boauth|discord|google|github|microsoft\b/.test(t)) {
    return "unlink_oauth";
  }
  if (/cultforge:\/\//.test(t)) return "deep_link";
  return "unknown";
}

function collectPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const nested =
    asRecord(obj.payload) ||
    asRecord(obj.params) ||
    asRecord(obj.args) ||
    asRecord(obj.data) ||
    asRecord(obj.launcher) ||
    asRecord(obj.local) ||
    asRecord(obj.nav) ||
    asRecord(obj.action_payload) ||
    {};

  // Keep useful top-level hints inside payload for the executor.
  const out: Record<string, unknown> = { ...nested };
  for (const key of [
    "build_id",
    "buildId",
    "instance_id",
    "provider",
    "subdir",
    "folder",
    "side",
    "panel",
    "section",
    "category",
    "deep_link",
    "deeplink",
    "href",
    "url",
    "target",
    "page",
    "route",
    "mod",
    "key",
  ]) {
    if (out[key] == null && obj[key] != null) out[key] = obj[key];
  }
  return out;
}

function normalizeAction(row: unknown): ChloePendingAction | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = pickString(obj, ["id", "action_id", "actionId"]);
  if (!id) return null;

  const nestedPayload = collectPayload(obj);

  let type =
    pickString(obj, ["tool", ...TYPE_KEYS]) ||
    pickString(nestedPayload, ["tool", ...TYPE_KEYS]) ||
    "";

  // `name` is often the human title — only treat as type if it looks like a code.
  if (!type) {
    const maybeName = pickString(obj, ["name"]);
    if (maybeName && /^[a-z0-9_.:/-]+$/i.test(maybeName) && !/\s/.test(maybeName)) {
      type = maybeName;
    }
  }

  const deepLink =
    pickString(obj, [
      "deep_link",
      "deeplink",
      "deepLink",
      "href",
      "url",
      "link",
    ]) ||
    pickString(nestedPayload, [
      "deep_link",
      "deeplink",
      "deepLink",
      "href",
      "url",
      "link",
    ]) ||
    null;

  const title =
    pickString(obj, ["title", "summary", "label", "heading", "name"]) ||
    pickString(nestedPayload, ["title", "summary", "label"]) ||
    humanizeType(type || "pending action");

  const description =
    pickString(obj, [
      "description",
      "detail",
      "details",
      "message",
      "body",
      "prompt",
      "reason",
    ]) ||
    pickString(nestedPayload, ["description", "detail", "message", "body"]) ||
    "";

  if (
    !type ||
    type.toLowerCase() === "unknown" ||
    type.toLowerCase() === "launcher"
  ) {
    type = inferChloeActionType(
      [type, title, description, deepLink || ""].join(" "),
    );
  }
  if (type.toLowerCase() === "open_launcher") {
    const target = pickString(nestedPayload, ["target", "page", "screen"]) || "";
    if (target) {
      type = inferChloeActionType(target) || "open_launcher";
    }
  }

  const normalized: ChloePendingAction = {
    id,
    type: type.toLowerCase().replace(/[\s-]+/g, "_"),
    title,
    description,
    deepLink,
    payload: nestedPayload,
    createdAt:
      pickString(obj, ["created_at", "createdAt", "created"]) || null,
    expiresAt:
      pickString(obj, ["expires_at", "expiresAt", "expires"]) || null,
    raw: row,
  };

  if (normalized.type === "unknown") {
    logger.debug(
      `Chloe action untyped id=${id} keys=${Object.keys(obj).join(",")}`,
    );
  }

  return normalized;
}

function humanizeType(type: string): string {
  const cleaned = type.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "Pending action";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function actionFromRealtimeFrame(
  frame: unknown,
): ChloePendingAction | null {
  const obj = asRecord(frame);
  if (!obj) return null;
  const payload = asRecord(obj.payload) ?? obj;
  let id =
    pickString(payload, ["action_id", "id", "actionId"]) ||
    pickString(obj, ["action_id", "id", "actionId"]);
  const frameType = String(obj.type ?? payload.type ?? "");
  if (!id && frameType === "chloe.action.local") {
    id = `local-${Date.now()}`;
  }
  if (!id) return null;
  return normalizeAction({
    ...payload,
    id,
    action_id: id,
    tool: payload.tool ?? obj.tool,
    args: payload.args ?? obj.args ?? payload,
    summary: payload.summary ?? obj.summary,
    expires_at: payload.expires_at ?? obj.expires_at,
  });
}

/** GET /v1/chloe/actions/pending */
export async function listChloePendingActions(): Promise<ChloePendingAction[]> {
  const raw = await send<unknown>("api", "list_your_pending_chloe_actions");
  return unwrapList(raw)
    .map(normalizeAction)
    .filter((row): row is ChloePendingAction => Boolean(row));
}

export type ChloeConfirmResult = {
  raw: unknown;
  executeLocal: boolean | null;
  tool: string | null;
  args: Record<string, unknown>;
  reply: string | null;
};

/** POST /v1/chloe/actions/{action_id}/confirm */
export async function confirmChloeAction(
  actionId: string,
): Promise<ChloeConfirmResult> {
  const raw = await sendMutate(
    "api",
    "confirm_a_pending_chloe_action",
    { action_id: actionId, id: actionId },
    "POST",
  );
  const obj = asRecord(raw);
  const nested = asRecord(obj?.data) ?? asRecord(obj?.action) ?? obj;
  const executeRaw = obj?.execute_local ?? obj?.executeLocal ?? nested?.execute_local;
  const args =
    asRecord(obj?.args) ||
    asRecord(nested?.args) ||
    asRecord(nested?.args_json) ||
    {};
  const tool =
    pickString(obj, ["tool"]) ||
    pickString(nested, ["tool", "action_type", "type"]) ||
    null;
  const reply =
    pickString(obj, ["reply", "message"]) ||
    pickString(nested, ["reply", "message"]) ||
    null;
  return {
    raw,
    executeLocal:
      typeof executeRaw === "boolean" ? executeRaw : executeRaw == null ? null : Boolean(executeRaw),
    tool,
    args,
    reply,
  };
}

/** POST /v1/chloe/actions/{action_id}/deny */
export async function denyChloeAction(actionId: string): Promise<unknown> {
  return sendMutate(
    "api",
    "deny_a_pending_chloe_action",
    { action_id: actionId, id: actionId },
    "POST",
  );
}

/**
 * POST /v1/chloe/actions/{action_id}/result
 * Multi-key body for schema compatibility until OpenAPI requestBody is published.
 */
export async function reportChloeActionResult(
  actionId: string,
  result: {
    ok: boolean;
    message?: string;
    detail?: unknown;
  },
): Promise<unknown> {
  const message = (result.message || (result.ok ? "ok" : "failed")).trim();
  return sendMutate(
    "api",
    "report_launcher-local_execution_result_for_a_chloe_action",
    {
      action_id: actionId,
      id: actionId,
      ok: result.ok,
      success: result.ok,
      status: result.ok ? "ok" : "error",
      message,
      error: result.ok ? null : message,
      detail: result.detail ?? null,
      data: result.detail ?? null,
      result: {
        ok: result.ok,
        message,
        detail: result.detail ?? null,
      },
    },
    "POST",
  );
}
