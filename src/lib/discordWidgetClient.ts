import { getClientOrigin, sidecarFetch } from "./client";
import type { DiscordWidgetPayload } from "../types/discordWidget";
import { DiscordWidgetFetchError } from "../types/discordWidget";

type ErrorBody = {
  error?: string;
  message?: string;
};

function mapErrorCode(value: string | undefined): DiscordWidgetFetchError["code"] {
  if (value === "widget_disabled") return "widget_disabled";
  if (value === "rate_limited") return "rate_limited";
  return "fetch_failed";
}

export async function fetchDiscordWidget(
  guildId: string,
  signal?: AbortSignal,
): Promise<DiscordWidgetPayload> {
  let origin: string;
  try {
    origin = await getClientOrigin();
  } catch {
    throw new DiscordWidgetFetchError(
      "Local CultForge client is unavailable.",
      "offline",
    );
  }

  let response: Response;
  try {
    response = await sidecarFetch(`${origin}/discord/widget/${guildId}`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new DiscordWidgetFetchError(
      "Could not reach the local CultForge client.",
      "offline",
    );
  }

  let body: DiscordWidgetPayload | ErrorBody;
  try {
    body = (await response.json()) as DiscordWidgetPayload | ErrorBody;
  } catch {
    throw new DiscordWidgetFetchError(
      "Discord widget response was invalid.",
      "fetch_failed",
      response.status,
    );
  }

  if (!response.ok) {
    const errorBody = body as ErrorBody;
    throw new DiscordWidgetFetchError(
      errorBody.message ?? "Could not load Discord widget.",
      mapErrorCode(errorBody.error),
      response.status,
    );
  }

  return body as DiscordWidgetPayload;
}
