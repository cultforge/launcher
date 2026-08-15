import { getClientOrigin, send, sendMutate, sidecarFetch } from "./client";
import { getPreference, setPreference } from "./persistentStore";

/** Fallback from api.cultforge.com/manifest.json `&.bots` when live fetch fails. */
export const CHLOE_BOT_FALLBACK = {
  key: "chloe",
  userId: "cf_CH0E0001",
  handleName: "Chloe",
  username: "chloe@cultforge.bot",
  avatarUrl: "https://api.cultforge.com/v1/profile/cf_CH0E0001/avatar",
  iconUrl: "https://api.cultforge.com/static/bots/chloe/icon.jpg",
  themeUrl: "https://api.cultforge.com/static/bots/chloe/theme.json",
  systemPromptUrl:
    "https://api.cultforge.com/static/bots/chloe/system_prompt.md",
  accent: "#FFD23F",
} as const;

/** Mutable brand used by the Chloe drawer (refreshed from `/v1/bots/chloe`). */
export let CHLOE_BOT: ChloeBotProfile = { ...CHLOE_BOT_FALLBACK };

const PROMPT_CACHE_KEY = "chloe.systemPrompt.cache";

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapData(raw: unknown): Record<string, unknown> | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  return asRecord(obj.data) ?? obj;
}

function pickString(obj: Record<string, unknown> | null, keys: string[]): string {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function pickNumber(
  obj: Record<string, unknown> | null,
  keys: string[],
): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export type ChloeQuota = {
  used: number | null;
  limit: number | null;
  remaining: number | null;
  raw: unknown;
};

export type ChloeChatReply = {
  reply: string;
  raw: unknown;
  actionId: string | null;
  needsConfirm: boolean;
  tool: string | null;
  risk: string | null;
  launcherOnline: boolean | null;
};

export type ChloeSystemPrompt = {
  key: string;
  version: number | null;
  format: string;
  etag: string | null;
  prompt: string;
};

export type ChloeBotProfile = {
  key: string;
  userId: string;
  handleName: string;
  username: string;
  avatarUrl: string;
  iconUrl: string;
  themeUrl: string;
  systemPromptUrl: string;
  accent: string;
};

type PromptCache = {
  etag: string | null;
  prompt: string;
  fetchedAt: number;
};

let promptMemory: ChloeSystemPrompt | null = null;

/** GET /v1/chloe/quota */
export async function fetchChloeQuota(): Promise<ChloeQuota> {
  const raw = await send<unknown>("api", "your_chloe_web-search_quota");
  const nested = unwrapData(raw);
  return {
    used: pickNumber(nested, ["used", "used_today", "search_used"]),
    limit: pickNumber(nested, ["limit", "daily_limit", "search_limit"]),
    remaining: pickNumber(nested, [
      "remaining",
      "left",
      "searches_remaining",
    ]),
    raw,
  };
}

/**
 * Official Chloe system prompt for launcher-side LLMs (Gemini / OpenAI key).
 * Prefer `chloe_system_prompt_…`, fall back to bots/{key}/system-prompt.
 */
export async function fetchChloeSystemPrompt(
  force = false,
): Promise<ChloeSystemPrompt> {
  if (!force && promptMemory?.prompt) return promptMemory;

  const cached = await getPreference<PromptCache>(PROMPT_CACHE_KEY);
  if (
    !force &&
    cached?.prompt &&
    Date.now() - (cached.fetchedAt || 0) < 6 * 60 * 60 * 1000
  ) {
    promptMemory = {
      key: "chloe",
      version: null,
      format: "markdown",
      etag: cached.etag,
      prompt: cached.prompt,
    };
    return promptMemory;
  }

  let raw: unknown;
  try {
    raw = await send<unknown>(
      "api",
      "chloe_system_prompt_for_launcher_llm_(e.g._user_gemini_key)",
    );
  } catch {
    raw = await send<unknown>(
      "api",
      "bot_system_prompt_for_launcher_llm_adapters",
      { key: "chloe" },
    );
  }

  const nested = unwrapData(raw);
  const prompt = pickString(nested, ["prompt", "system_prompt", "content"]);
  if (!prompt) {
    if (cached?.prompt) {
      promptMemory = {
        key: "chloe",
        version: null,
        format: "markdown",
        etag: cached.etag,
        prompt: cached.prompt,
      };
      return promptMemory;
    }
    throw new Error("Chloe system prompt unavailable");
  }

  const result: ChloeSystemPrompt = {
    key: pickString(nested, ["key"]) || "chloe",
    version: pickNumber(nested, ["version"]),
    format: pickString(nested, ["format"]) || "markdown",
    etag: pickString(nested, ["etag"]) || null,
    prompt,
  };
  promptMemory = result;
  await setPreference(PROMPT_CACHE_KEY, {
    etag: result.etag,
    prompt: result.prompt,
    fetchedAt: Date.now(),
  } satisfies PromptCache);
  return result;
}

/** GET /v1/chloe/tools via sidecar proxy (launcher LLM adapters). */
export async function fetchChloeToolsCatalog(): Promise<unknown> {
  try {
    return await send<unknown>(
      "api",
      "chloe_deterministic_tool_catalog_for_launcher_plug-in_/_gemini_tools",
    );
  } catch {
    /* loopback proxy next */
  }
  try {
    const origin = await getClientOrigin();
    const res = await sidecarFetch(`${origin}/chloe/tools`);
    if (res.ok) return res.json();
  } catch {
    /* unavailable */
  }
  return null;
}

/** GET /v1/bots/chloe — refresh icon/handle branding. */
export async function fetchChloeBotProfile(): Promise<ChloeBotProfile> {
  let nested: Record<string, unknown> | null = null;
  try {
    const raw = await send<unknown>("api", "get_one_platform_bot_by_registry_key", {
      key: "chloe",
    });
    nested = unwrapData(raw);
  } catch {
    nested = null;
  }

  let accent: string = CHLOE_BOT_FALLBACK.accent;
  let themeIcon = "";
  try {
    const themeRaw = await send<unknown>(
      "api",
      "bot_ui_theme_(static/bots/{key}/theme.json)",
      { key: "chloe" },
    );
    const theme = unwrapData(themeRaw);
    const palette = asRecord(theme?.palette);
    const primary = pickString(palette, ["primary", "gold"]);
    if (primary) accent = primary;
    const urls = asRecord(theme?.urls);
    themeIcon = pickString(urls, ["icon", "avatar"]);
  } catch {
    // theme optional
  }

  const profile: ChloeBotProfile = {
    key: pickString(nested, ["key"]) || CHLOE_BOT_FALLBACK.key,
    userId: pickString(nested, ["user_id"]) || CHLOE_BOT_FALLBACK.userId,
    handleName:
      pickString(nested, ["handle_name", "display_name"]) ||
      CHLOE_BOT_FALLBACK.handleName,
    username: pickString(nested, ["username"]) || CHLOE_BOT_FALLBACK.username,
    avatarUrl:
      pickString(nested, ["avatar_url", "icon_url"]) ||
      CHLOE_BOT_FALLBACK.avatarUrl,
    iconUrl:
      themeIcon ||
      pickString(nested, ["icon_url", "avatar_url"]) ||
      CHLOE_BOT_FALLBACK.iconUrl,
    themeUrl: pickString(nested, ["theme_url"]) || CHLOE_BOT_FALLBACK.themeUrl,
    systemPromptUrl:
      pickString(nested, ["system_prompt_url"]) ||
      CHLOE_BOT_FALLBACK.systemPromptUrl,
    accent,
  };

  CHLOE_BOT = profile;
  return profile;
}

function friendlyChloeChatError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (
    lower.includes("dispatch_failed") ||
    lower.includes("readtimeout") ||
    lower.includes("read timeout") ||
    lower.includes("timed out") ||
    lower.includes("timeout")
  ) {
    return new Error(
      "Chloe timed out talking to CultForge. Try again in a moment.",
    );
  }
  if (message === "dispatch_failed" || lower === "dispatch_failed") {
    return new Error(
      "Chloe request failed on the CultForge side. Try again shortly.",
    );
  }
  return err instanceof Error ? err : new Error(message);
}

/** POST /v1/chloe/chat */
export async function sendChloeChat(opts: {
  message: string;
  web?: boolean;
}): Promise<ChloeChatReply> {
  const message = opts.message.trim();
  if (!message) throw new Error("Message cannot be empty");

  let raw: unknown;
  try {
    raw = await sendMutate(
      "api",
      "chat_with_chloe_(aiml_+_memory_+_optional_web)",
      {
        message,
        content: message,
        prompt: message,
        web: Boolean(opts.web),
        use_web: Boolean(opts.web),
        web_search: Boolean(opts.web),
      },
      "POST",
    );
  } catch (err) {
    throw friendlyChloeChatError(err);
  }

  const nested = unwrapData(raw) ?? asRecord(raw);
  const reply =
    pickString(nested, [
      "reply",
      "response",
      "content",
      "message",
      "text",
      "answer",
    ]) ||
    (typeof raw === "string" ? raw.trim() : "");

  if (!reply) {
    throw new Error("Chloe returned an empty response");
  }

  const boolish = (value: unknown): boolean | null => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lower = value.trim().toLowerCase();
      if (["1", "true", "yes"].includes(lower)) return true;
      if (["0", "false", "no"].includes(lower)) return false;
    }
    return null;
  };

  return {
    reply,
    raw,
    actionId:
      pickString(nested, ["action_id", "actionId"]) || null,
    needsConfirm: boolish(nested?.needs_confirm ?? nested?.needsConfirm) === true,
    tool: pickString(nested, ["tool"]) || null,
    risk: pickString(nested, ["risk"]) || null,
    launcherOnline: boolish(
      nested?.launcher_online ?? nested?.launcherOnline,
    ),
  };
}
