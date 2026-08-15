import { ClientHttpError, send, sendMutate } from "./client";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
} from "./apiCache";

export class GuildFormsError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "GuildFormsError";
    this.status = status;
  }
}

export type GuildForm = {
  id: string;
  guildId: string;
  title: string;
  description?: string | null;
  fields: unknown[];
  isOpen: boolean;
  submissionCount: number;
  mySubmissionId?: string | null;
};

function wrap(prefix: string, err: unknown): GuildFormsError {
  if (err instanceof ClientHttpError) {
    return new GuildFormsError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof GuildFormsError) return err;
  return new GuildFormsError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapList(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function unwrapOne(data: unknown, keys: string[]): unknown {
  const obj = asRecord(data);
  if (!obj) return data;
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  return data;
}

export function formFromApiRecord(raw: unknown): GuildForm | null {
  const obj = asRecord(raw);
  if (!obj || typeof obj.id !== "string") return null;
  return {
    id: obj.id,
    guildId: String(obj.guild_id ?? ""),
    title: String(obj.title ?? "Form"),
    description: typeof obj.description === "string" ? obj.description : null,
    fields: Array.isArray(obj.fields) ? obj.fields : [],
    isOpen: obj.is_open !== false,
    submissionCount:
      typeof obj.submission_count === "number" ? obj.submission_count : 0,
    mySubmissionId:
      typeof obj.my_submission_id === "string" ? obj.my_submission_id : null,
  };
}

export async function fetchGuildForms(guildId: string): Promise<GuildForm[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.guildForms(guildId),
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "list_guild_forms", {
          guild_id: guildId,
        });
        return unwrapList(raw, ["data", "forms"])
          .map(formFromApiRecord)
          .filter((x): x is GuildForm => Boolean(x));
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not list forms", err);
  }
}

export async function createGuildForm(
  guildId: string,
  input: {
    title: string;
    description?: string;
    fields?: unknown[];
    isOpen?: boolean;
  },
): Promise<GuildForm> {
  try {
    const data = await sendMutate(
      "guilds",
      "create_guild_form",
      {
        guild_id: guildId,
        title: input.title,
        description: input.description,
        fields: input.fields ?? [],
        is_open: input.isOpen ?? true,
      },
      "POST",
    );
    await invalidateApiCache(CacheKeys.guildForms(guildId));
    const form = formFromApiRecord(unwrapOne(data, ["data", "form"]));
    if (!form) throw new GuildFormsError("Create form response malformed", 502);
    return form;
  } catch (err) {
    throw wrap("Could not create form", err);
  }
}

export async function submitGuildForm(
  guildId: string,
  formId: string,
  answers: Record<string, unknown>,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "submit_guild_form_answers",
      { guild_id: guildId, form_id: formId, answers },
      "POST",
    );
    await invalidateApiCache(CacheKeys.guildForms(guildId));
  } catch (err) {
    throw wrap("Could not submit form", err);
  }
}

export async function fetchFormSubmissions(
  guildId: string,
  formId: string,
): Promise<unknown[]> {
  try {
    const raw = await send<unknown>(
      "guilds",
      "list_form_submissions_(editors)",
      { guild_id: guildId, form_id: formId },
    );
    return unwrapList(raw, ["data", "submissions"]);
  } catch (err) {
    throw wrap("Could not list submissions", err);
  }
}
