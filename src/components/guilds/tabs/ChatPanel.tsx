import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useGuildStore } from "../../../stores/guilds";
import type { ChatMessage } from "../../../data/guilds";
import type { GuildChannel } from "../../../lib/guildChat";
import { cn } from "../../../lib/cn";
import { CfSelect } from "../../ui/CfSelect";
import { ChatComposer, highlightMentions } from "../../chat/ChatComposer";
import { ChatMarkdown } from "../../chat/ChatMarkdown";
import { stickerToken } from "../../../lib/chatStickers";

const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_CHANNELS: GuildChannel[] = [];

export function ChatPanel() {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const messages = useGuildStore(
    (s) => s.chatByGuild[guildId] ?? EMPTY_MESSAGES,
  );
  const channels = useGuildStore(
    (s) => s.channelsByGuild[guildId] ?? EMPTY_CHANNELS,
  );
  const members = useGuildStore((s) => s.members);
  const activeChannelId = useGuildStore(
    (s) => s.activeChannelByGuild[guildId],
  );
  const chatStatus = useGuildStore((s) => s.chatStatusByGuild[guildId]);
  const sendChat = useGuildStore((s) => s.sendChat);
  const setActiveChannel = useGuildStore((s) => s.setActiveChannel);
  const hydrateGuildChat = useGuildStore((s) => s.hydrateGuildChat);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const mentionCandidates = useMemo(
    () =>
      members
        .filter((m) => m.guildId === guildId)
        .map((m) => ({ id: m.userId, name: m.name })),
    [members, guildId],
  );

  useEffect(() => {
    if (!guildId) return;
    void hydrateGuildChat(guildId);
  }, [guildId, hydrateGuildChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, guildId, activeChannelId]);

  const activeChannel =
    channels.find((c) => c.id === activeChannelId) ?? channels[0];
  const channelLabel = activeChannel?.name
    ? `#${activeChannel.name}`
    : "# guild-chat";

  const onSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const result = await sendChat(guildId, draft);
      if (result.ok) {
        setDraft("");
      } else {
        toast.error(result.message);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="cf-panel flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/6">
      <div className="px-4 py-3 border-b border-white/6 bg-black/25 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-text-primary truncate">
            {channelLabel}
          </div>
          <div className="text-[10px] text-text-disabled mt-0.5">
            {chatStatus?.loading
              ? "Loading…"
              : `${messages.length} messages · synced`}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {channels.length > 1 && (
            <CfSelect
              value={activeChannelId ?? ""}
              onChange={(next) => {
                if (next) setActiveChannel(guildId, next);
              }}
              className="max-w-36"
              options={channels.map((c) => ({
                value: c.id,
                label: `#${c.name}`,
              }))}
              aria-label="Chat channel"
            />
          )}
          <span className="text-[10px] px-2 py-1 rounded-md border border-white/12 text-text-muted bg-white/4">
            Live
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-hidden p-4 flex flex-col gap-3">
        {chatStatus?.error && messages.length === 0 && (
          <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-3 text-[12px] text-text-muted">
            {chatStatus.error}
          </div>
        )}
        {!chatStatus?.loading &&
          !chatStatus?.error &&
          messages.length === 0 && (
            <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-3 text-[12px] text-text-muted">
              No messages yet. Say hello.
            </div>
          )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const stacked = prev && prev.author === m.author;
          return (
            <div
              key={m.id}
              className={cn("flex gap-3", stacked && "-mt-1")}
            >
              {stacked ? (
                <div className="w-9 shrink-0" />
              ) : (
                <div
                  className={cn(
                    "h-9 w-9 rounded-xl shrink-0 flex items-center justify-center text-[10px] font-bold",
                    m.role === "Leader"
                      ? "bg-primary-base/20 text-primary-base border border-primary-base/30"
                      : m.role === "Officer"
                        ? "bg-white/8 text-text-secondary border border-white/10"
                        : "bg-white/4 text-text-muted border border-white/6",
                  )}
                >
                  {m.author.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {!stacked && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-[13px] font-semibold text-text-primary">
                      {m.author}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-text-disabled">
                      {m.role}
                    </span>
                    <span className="text-[10px] text-text-disabled">
                      {m.time}
                    </span>
                  </div>
                )}
                <div className="text-[13px] text-text-secondary leading-relaxed">
                  <ChatMarkdown source={highlightMentions(m.text)} />
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <ChatComposer
        value={draft}
        onChange={setDraft}
        disabled={sending || Boolean(chatStatus?.loading)}
        placeholder={`Message ${channelLabel}…`}
        mentionCandidates={mentionCandidates}
        onSend={() => void onSend()}
        onSendSticker={(id) => {
          void sendChat(guildId, stickerToken(id)).then((result) => {
            if (!result.ok) toast.error(result.message);
          });
        }}
      />
    </div>
  );
}
