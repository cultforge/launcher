import { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import { useChloeStore } from "../../stores/chloe";
import { useSettingsStore } from "../../stores/settings";
import { Icon } from "../ico";
import { AppIcons } from "../icons";
import { cn } from "../../lib/cn";
import { ChatMarkdown } from "./ChatMarkdown";
import { TextShimmer } from "../magic/text-shimmer";

function quotaLabel(
  quota: ReturnType<typeof useChloeStore.getState>["quota"],
  provider: string,
): string {
  if (provider === "gemini") return "Gemini (local keyring)";
  if (provider === "openai") return "OpenAI-compatible (local keyring)";
  if (!quota) return "Quota unknown";
  if (quota.remaining != null && quota.limit != null) {
    return `${quota.remaining}/${quota.limit} web searches left`;
  }
  if (quota.used != null && quota.limit != null) {
    return `${quota.used}/${quota.limit} web searches used`;
  }
  if (quota.remaining != null) return `${quota.remaining} web searches left`;
  return "Web search quota loaded";
}

function ChloeAvatar({
  className,
  glow,
  iconUrl,
  accent,
}: {
  className?: string;
  glow?: boolean;
  iconUrl: string;
  accent: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full border border-white/12 bg-[#111419]",
        glow && "cf-chloe-glow",
        className,
      )}
    >
      {!failed ? (
        <img
          src={iconUrl}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-[10px] font-bold"
          style={{ color: accent }}
        >
          C
        </span>
      )}
    </span>
  );
}

function ChloeGenerating({
  iconUrl,
  accent,
}: {
  iconUrl: string;
  accent: string;
}) {
  return (
    <div className="mr-2 flex max-w-[92%] items-start gap-2.5">
      <ChloeAvatar className="h-8 w-8" glow iconUrl={iconUrl} accent={accent} />
      <div
        className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-gradient-to-br from-[#FFD23F]/10 via-white/4 to-transparent px-3 py-2.5"
        style={{ borderColor: `${accent}33` }}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="cf-chloe-orb" aria-hidden />
          <span className="cf-chloe-orb cf-chloe-orb-delay" aria-hidden />
          <span className="cf-chloe-orb cf-chloe-orb-delay-2" aria-hidden />
          <TextShimmer className="text-[11px] font-medium">
            Generating…
          </TextShimmer>
        </div>
        <div className="cf-chloe-magic-bar" aria-hidden />
      </div>
    </div>
  );
}

function PendingActionsBar() {
  const pendingActions = useChloeStore((s) => s.pendingActions);
  const actionBusyId = useChloeStore((s) => s.actionBusyId);
  const confirmPendingAction = useChloeStore((s) => s.confirmPendingAction);
  const denyPendingAction = useChloeStore((s) => s.denyPendingAction);
  const accent = useChloeStore((s) => s.bot.accent);

  if (!pendingActions.length) return null;

  return (
    <div className="border-b border-white/8 bg-black/25 px-3 py-2.5">
      <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-text-disabled">
        Pending actions · confirm in launcher
      </p>
      <div className="flex flex-col gap-2">
        {pendingActions.map((action) => {
          const busy = actionBusyId === action.id;
          return (
            <article
              key={action.id}
              className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-white/4 px-3 py-2.5"
              style={{ borderColor: `${accent}40` }}
            >
              <div className="min-w-0">
                <h3 className="truncate text-[12px] font-semibold text-text-primary">
                  {action.title}
                </h3>
                {action.description ? (
                  <p className="mt-0.5 text-[10px] leading-relaxed text-text-muted [overflow-wrap:anywhere]">
                    {action.description}
                  </p>
                ) : null}
                <p className="mt-1 truncate text-[9px] text-text-disabled">
                  {action.type}
                  {action.deepLink ? ` · ${action.deepLink}` : ""}
                </p>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={Boolean(actionBusyId)}
                  onClick={() => void confirmPendingAction(action.id)}
                  className="cf-btn-primary rounded-md px-2.5 py-1 text-[10px] cursor-pointer disabled:opacity-50"
                >
                  {busy ? "Working…" : "Confirm"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(actionBusyId)}
                  onClick={() => void denyPendingAction(action.id)}
                  className="rounded-md border border-white/12 px-2.5 py-1 text-[10px] text-text-muted hover:text-white cursor-pointer disabled:opacity-50"
                >
                  Deny
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function ChloeDrawer() {
  const open = useChloeStore((s) => s.open);
  const setOpen = useChloeStore((s) => s.setOpen);
  const messages = useChloeStore((s) => s.messages);
  const draft = useChloeStore((s) => s.draft);
  const setDraft = useChloeStore((s) => s.setDraft);
  const webSearch = useChloeStore((s) => s.webSearch);
  const setWebSearch = useChloeStore((s) => s.setWebSearch);
  const busy = useChloeStore((s) => s.busy);
  const send = useChloeStore((s) => s.send);
  const quota = useChloeStore((s) => s.quota);
  const bot = useChloeStore((s) => s.bot);
  const pendingActions = useChloeStore((s) => s.pendingActions);
  const refreshPendingActions = useChloeStore((s) => s.refreshPendingActions);
  const assistantProvider = useSettingsStore((s) => s.settings.assistantProvider);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void refreshPendingActions();
    const timer = window.setInterval(() => {
      void refreshPendingActions();
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [open, refreshPendingActions]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open, busy, pendingActions.length]);

  const remaining =
    quota?.remaining != null
      ? quota.remaining
      : quota?.limit != null && quota.used != null
        ? Math.max(0, quota.limit - quota.used)
        : null;

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-80 bg-black/55" />
        <Drawer.Content className="fixed bottom-0 right-0 top-0 z-90 flex w-[min(440px,94vw)] flex-col outline-none">
          <div className="cf-glass flex h-full min-w-0 flex-col border-l border-white/10 bg-bg-elevated">
            <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <ChloeAvatar
                  className="h-10 w-10"
                  iconUrl={bot.iconUrl}
                  accent={bot.accent}
                />
                <div className="min-w-0">
                  <Drawer.Title className="font-sora text-[15px] font-bold text-text-primary">
                    {bot.handleName}
                  </Drawer.Title>
                  <Drawer.Description className="mt-0.5 truncate text-[10px] text-text-muted">
                    CultForge assistant · {quotaLabel(quota, assistantProvider)}
                  </Drawer.Description>
                </div>
              </div>
              <Drawer.Close
                aria-label="Close Chloe"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-text-muted hover:text-white cursor-pointer"
              >
                <Icon icon={AppIcons.Close} size={14} />
              </Drawer.Close>
            </header>

            <PendingActionsBar />

            <div
              role="log"
              aria-live="polite"
              className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto scroll-hidden p-3"
            >
              <div className="flex min-w-0 flex-col gap-2.5">
                {messages.map((message) => {
                  if (message.role === "system") {
                    return (
                      <article
                        key={message.id}
                        className="min-w-0 overflow-hidden rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 text-[11px] leading-relaxed text-text-muted [overflow-wrap:anywhere]"
                      >
                        <ChatMarkdown
                          source={message.body}
                          className="text-[11px] text-text-muted [&_a]:text-[#FFD23F]"
                        />
                      </article>
                    );
                  }

                  const mine = message.role === "user";
                  return (
                    <article
                      key={message.id}
                      className={cn(
                        "flex min-w-0 max-w-full gap-2.5",
                        mine ? "flex-row-reverse" : "flex-row",
                      )}
                    >
                      {!mine && (
                        <ChloeAvatar
                          className="mt-0.5 h-8 w-8"
                          iconUrl={bot.iconUrl}
                          accent={bot.accent}
                        />
                      )}
                      <div
                        className={cn(
                          "min-w-0 max-w-[calc(100%-2.75rem)] overflow-hidden rounded-xl px-3 py-2.5",
                          mine
                            ? "bg-primary-base/12 text-text-primary"
                            : message.failed
                              ? "border border-state-error/30 bg-state-error/8 text-state-error"
                              : "bg-white/4 text-text-secondary",
                        )}
                      >
                        <div className="mb-1 text-[8px] font-semibold uppercase tracking-wider text-text-disabled">
                          {mine ? "You" : bot.handleName}
                        </div>
                        <ChatMarkdown
                          source={message.body}
                          className={cn(
                            "text-[11px]",
                            mine
                              ? "text-text-primary [&_a]:text-primary-base"
                              : message.failed
                                ? "text-state-error [&_a]:text-state-error"
                                : "text-text-secondary [&_a]:text-[#FFD23F]",
                          )}
                        />
                      </div>
                    </article>
                  );
                })}
                {busy ? (
                  <ChloeGenerating iconUrl={bot.iconUrl} accent={bot.accent} />
                ) : null}
                <div ref={endRef} />
              </div>
            </div>

            <footer className="border-t border-white/8 p-3 flex flex-col gap-2">
              {assistantProvider === "cultforge" ? (
                <label className="flex items-center gap-2 text-[10px] text-text-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={webSearch}
                    onChange={(e) => setWebSearch(e.target.checked)}
                    disabled={busy || (remaining != null && remaining <= 0)}
                    className="accent-[var(--color-primary-base)]"
                  />
                  Use web search
                  {remaining != null ? ` (${remaining} left today)` : ""}
                </label>
              ) : (
                <p className="text-[10px] text-text-muted">
                  Using your local{" "}
                  {assistantProvider === "gemini" ? "Gemini" : "OpenAI"} key from
                  the OS keyring — not sent to CultForge. Official Chloe system
                  prompt is applied when online.
                </p>
              )}
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ask Chloe…"
                  disabled={busy}
                  className="min-h-14 flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-text-primary outline-none focus:border-primary-base/40 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={busy || !draft.trim()}
                  onClick={() => void send()}
                  className="cf-btn-primary self-end rounded-lg px-3.5 py-2 text-[11px] cursor-pointer disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </footer>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
