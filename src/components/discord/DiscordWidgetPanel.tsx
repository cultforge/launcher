import { Icon } from "../ico";
import { AppIcons } from "../icons";
import { cn } from "../../lib/cn";
import { hasDiscordSource, parseDiscordGuildSource } from "../../lib/discordWidget";
import { useDiscordWidget } from "../../hooks/useDiscordWidget";

type DiscordWidgetPanelProps = {
  title: string;
  source: string | undefined;
  emptyMessage: string;
  emptyAction?: { label: string; onClick: () => void };
};

function statusColor(status: string) {
  if (status === "online") return "bg-primary-base";
  if (status === "idle") return "bg-state-warning";
  if (status === "dnd") return "bg-state-error";
  return "bg-text-disabled";
}

function memberAvatar(member: {
  avatar_url?: string;
  avatar: string | null;
  id: string;
}) {
  if (member.avatar_url) return member.avatar_url;
  if (member.avatar) {
    return `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png?size=64`;
  }
  return `https://cdn.discordapp.com/embed/avatars/0.png`;
}

function formatUpdated(at: Date | null) {
  if (!at) return "Never";
  return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function DiscordWidgetPanel({
  title,
  source,
  emptyMessage,
  emptyAction,
}: DiscordWidgetPanelProps) {
  const configured = hasDiscordSource(source);
  const parsed = source?.trim()
    ? parseDiscordGuildSource(source)
    : { ok: false as const, error: "" };
  const { data, loading, error, errorCode, lastUpdated, refresh } =
    useDiscordWidget(source);

  return (
    <section className="cf-panel flex min-h-[min(720px,calc(100vh-220px))] flex-col overflow-hidden rounded-xl">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/3 text-[#5865F2]">
            <Icon icon={AppIcons.Discord} size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-sora text-[15px] font-bold text-text-primary">
              {data?.name ?? title}
            </h2>
            <p className="text-[10px] text-text-muted">
              {configured
                ? parsed.ok
                  ? `${data?.presence_count ?? "…"} online · guild ${parsed.guildId}`
                  : parsed.error
                : "Not configured"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {configured && (
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="text-[10px] font-semibold text-text-muted hover:text-white disabled:opacity-50 cursor-pointer"
            >
              Refresh
            </button>
          )}
          {data?.instant_invite && (
            <a
              href={data.instant_invite}
              target="_blank"
              rel="noopener noreferrer"
              className="cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold"
            >
              Join server
            </a>
          )}
        </div>
      </header>

      {!configured ? (
        <EmptyState message={emptyMessage} action={emptyAction} />
      ) : !parsed.ok ? (
        <EmptyState message={parsed.error} action={emptyAction} />
      ) : loading && !data ? (
        <LoadingState />
      ) : error && !data ? (
        <ErrorState error={error} errorCode={errorCode} onRetry={refresh} />
      ) : data ? (
        <>
          <div className="border-b border-white/6 px-4 py-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-muted">Members online</span>
              <span className="font-semibold tabular-nums text-text-primary">
                {data.presence_count}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scroll-hidden p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.members.map((member) => (
                <article
                  key={member.id}
                  className="flex items-center gap-3 rounded-xl border border-white/6 bg-black/20 px-3 py-2.5"
                >
                  <div className="relative shrink-0">
                    <img
                      src={memberAvatar(member)}
                      alt=""
                      className="h-10 w-10 rounded-full border border-white/8 object-cover"
                    />
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-elevated",
                        statusColor(member.status),
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-text-primary">
                      {member.username}
                    </div>
                    <div className="truncate text-[10px] text-text-muted">
                      {member.game?.name ??
                        (member.status === "online"
                          ? "Online"
                          : member.status === "idle"
                            ? "Idle"
                            : member.status === "dnd"
                              ? "Do not disturb"
                              : "Offline")}
                    </div>
                  </div>
                </article>
              ))}
              {data.members.length === 0 && (
                <p className="col-span-full py-8 text-center text-[12px] text-text-muted">
                  No members are visible in the widget right now.
                </p>
              )}
            </div>
          </div>
          <footer className="flex items-center justify-between border-t border-white/8 px-4 py-2 text-[9px] text-text-disabled">
            <span>Updated {formatUpdated(lastUpdated)}</span>
            {error && (
              <span className="text-state-warning truncate max-w-[60%]">
                {error}
              </span>
            )}
          </footer>
        </>
      ) : (
        <ErrorState
          error="Could not load Discord widget."
          errorCode={errorCode}
          onRetry={refresh}
        />
      )}
    </section>
  );
}

function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/3 text-[#5865F2]">
        <Icon icon={AppIcons.Discord} size={28} />
      </span>
      <p className="max-w-sm text-[13px] leading-relaxed text-text-muted">
        {message}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-14 animate-pulse rounded-xl border border-white/5 bg-white/3"
        />
      ))}
    </div>
  );
}

function ErrorState({
  error,
  errorCode,
  onRetry,
}: {
  error: string;
  errorCode: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="max-w-md text-[13px] leading-relaxed text-text-muted">
        {error}
      </p>
      {errorCode === "widget_disabled" && (
        <p className="max-w-md text-[11px] text-text-disabled">
          In Discord: Server Settings → Widget → Enable Server Widget.
        </p>
      )}
      {errorCode === "offline" && (
        <p className="max-w-md text-[11px] text-text-disabled">
          Start the local CultForge client to load live Discord data.
        </p>
      )}
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-white/12 px-4 py-2 text-[11px] font-semibold text-text-secondary hover:text-text-primary cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
