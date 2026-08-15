export type DiscordWidgetMember = {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  status: "online" | "idle" | "dnd" | string;
  avatar_url?: string;
  game?: { name: string };
  deaf?: boolean;
  mute?: boolean;
  self_deaf?: boolean;
  self_mute?: boolean;
  suppress?: boolean;
  channel_id?: string;
};

export type DiscordWidgetChannel = {
  id: string;
  name: string;
  position: number;
};

export type DiscordWidgetPayload = {
  id: string;
  name: string;
  instant_invite?: string;
  presence_count: number;
  members: DiscordWidgetMember[];
  channels?: DiscordWidgetChannel[];
};

export type DiscordWidgetErrorCode =
  | "widget_disabled"
  | "rate_limited"
  | "fetch_failed"
  | "offline"
  | "invalid_input";

export class DiscordWidgetFetchError extends Error {
  code: DiscordWidgetErrorCode;
  status?: number;

  constructor(
    message: string,
    code: DiscordWidgetErrorCode,
    status?: number,
  ) {
    super(message);
    this.name = "DiscordWidgetFetchError";
    this.code = code;
    this.status = status;
  }
}
