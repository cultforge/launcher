import { useEffect, useRef } from "react";
import { Drawer } from "vaul";
import { useGlobalChatStore } from "../../stores/globalChat";
import { EntityImage } from "../EntityImage";
import { Icon } from "../ico";
import { AppIcons } from "../icons";

function messageTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function GlobalChatDrawer() {
  const open = useGlobalChatStore((state) => state.open);
  const setOpen = useGlobalChatStore((state) => state.setOpen);
  const messages = useGlobalChatStore((state) => state.messages);
  const draft = useGlobalChatStore((state) => state.draft);
  const setDraft = useGlobalChatStore((state) => state.setDraft);
  const send = useGlobalChatStore((state) => state.send);
  const report = useGlobalChatStore((state) => state.report);
  const online = useGlobalChatStore((state) => state.online);
  const connect = useGlobalChatStore((state) => state.connect);
  const feedback = useGlobalChatStore((state) => state.feedback);
  const clearFeedback = useGlobalChatStore((state) => state.clearFeedback);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => connect(), [connect]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-80 bg-black/55 motion-reduce:transition-none" />
        <Drawer.Content className="fixed bottom-0 right-0 top-0 z-90 flex w-[min(440px,94vw)] flex-col outline-none motion-reduce:transition-none">
          <div className="cf-glass flex h-full flex-col border-l border-white/10 bg-bg-elevated">
            <header className="flex items-center justify-between border-b border-white/8 px-4 py-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <Drawer.Title className="font-sora text-[15px] font-bold text-text-primary">
                    Global Chat
                  </Drawer.Title>
                  <span className="rounded-full border border-state-warning/25 bg-state-warning/8 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-state-warning">
                    Offline
                  </span>
                </div>
                <Drawer.Description className="mt-0.5 text-[10px] text-text-muted">
                  Launcher-wide lounge · {online} simulated online
                </Drawer.Description>
              </div>
              <Drawer.Close
                aria-label="Close global chat"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-text-muted hover:text-white cursor-pointer"
              >
                <Icon icon={AppIcons.Close} size={14} />
              </Drawer.Close>
            </header>

            <div className="border-b border-border-subtle bg-primary-base/5 px-4 py-2 text-[9px] leading-relaxed text-text-muted">
              Messages sync with CultForge global chat (REST + live websocket).
            </div>

            <div
              role="log"
              aria-live="polite"
              aria-label="Global chat messages"
              className="min-h-0 flex-1 overflow-y-auto scroll-hidden p-3"
            >
              <div className="flex flex-col gap-1.5">
                {messages.map((message) => {
                  const own = message.author.id === "me";
                  return (
                    <article
                      key={message.id}
                      className={`group flex gap-2.5 rounded-xl p-2.5 ${
                        own ? "bg-primary-base/6" : "hover:bg-white/3"
                      }`}
                    >
                      <EntityImage
                        kind="player"
                        entityId={message.author.id}
                        source={message.author.avatarUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-lg border border-border-subtle"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-[11px] font-semibold text-text-primary">
                            {message.author.displayName}
                          </span>
                          {message.author.role !== "member" && (
                            <span className="text-[8px] uppercase tracking-wider text-primary-base">
                              {message.author.role}
                            </span>
                          )}
                          <time className="ml-auto shrink-0 text-[8px] text-text-disabled">
                            {messageTime(message.createdAt)}
                          </time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap wrap-break-words text-[10px] leading-relaxed text-text-secondary">
                          {message.body}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span
                            className={`text-[8px] ${
                              message.delivery === "failed"
                                ? "text-state-error"
                                : "text-text-disabled"
                            }`}
                          >
                            {message.delivery === "pending"
                              ? "Sending locally…"
                              : message.delivery === "failed"
                                ? "Local send failed"
                                : ""}
                          </span>
                          {message.moderation.reportable && !own && (
                            <button
                              type="button"
                              onClick={() => void report(message.id)}
                              className="text-[8px] text-text-disabled opacity-0 transition-opacity hover:text-state-warning group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                            >
                              Report
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
                <div ref={endRef} />
              </div>
            </div>

            {feedback && (
              <div
                role="status"
                className="flex items-center justify-between border-t border-state-warning/20 bg-state-warning/6 px-3 py-2 text-[9px] text-state-warning"
              >
                <span>{feedback}</span>
                <button type="button" onClick={clearFeedback} className="cursor-pointer">
                  Dismiss
                </button>
              </div>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
              className="border-t border-border-subtle p-3"
            >
              <label htmlFor="global-chat-composer" className="sr-only">
                Message global chat
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-border-strong bg-black/20 p-1.5 focus-within:border-primary-base/45">
                <input
                  ref={inputRef}
                  id="global-chat-composer"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, 500))}
                  placeholder="Message the launcher lounge…"
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[11px] text-text-primary outline-none placeholder:text-text-disabled"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="cf-btn-primary rounded-lg px-3 py-2 text-[9px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  Send
                </button>
              </div>
              <div className="mt-1.5 text-right text-[8px] text-text-disabled">
                {draft.length}/500
              </div>
            </form>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
