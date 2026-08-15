const SNOWFLAKE = /^\d{17,20}$/;
const WIDGET_JSON_PATH =
  /discord(?:app)?\.com\/api\/guilds\/(\d{17,20})\/widget\.json/i;
const WIDGET_IFRAME = /discord(?:app)?\.com\/widget/i;

export type ParseDiscordGuildSourceResult =
  | { ok: true; guildId: string }
  | { ok: false; error: string };

export function discordWidgetApiUrl(guildId: string): string {
  return `https://discord.com/api/guilds/${guildId}/widget.json`;
}

export function parseDiscordGuildSource(
  input: string,
): ParseDiscordGuildSourceResult {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return { ok: false, error: "Enter a guild ID or Discord widget URL." };
  }

  if (SNOWFLAKE.test(trimmed)) {
    return { ok: true, guildId: trimmed };
  }

  const jsonMatch = trimmed.match(WIDGET_JSON_PATH);
  if (jsonMatch?.[1]) {
    return { ok: true, guildId: jsonMatch[1] };
  }

  if (WIDGET_IFRAME.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const id = url.searchParams.get("id");
      if (id && SNOWFLAKE.test(id)) {
        return { ok: true, guildId: id };
      }
    } catch {
      return { ok: false, error: "Invalid Discord widget URL." };
    }
  }

  try {
    const url = new URL(trimmed);
    const pathMatch = url.pathname.match(/\/guilds\/(\d{17,20})/);
    if (pathMatch?.[1]) {
      return { ok: true, guildId: pathMatch[1] };
    }
  } catch {
    // fall through
  }

  return {
    ok: false,
    error: "Use a guild ID, widget iframe URL, or widget.json API URL.",
  };
}

export function hasDiscordSource(source: string | undefined): boolean {
  if (!source?.trim()) return false;
  return parseDiscordGuildSource(source).ok;
}
