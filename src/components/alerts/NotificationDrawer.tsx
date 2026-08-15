import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { toast } from "sonner";
import { type AlertKind } from "../../data/alerts";
import { useNotificationsStore } from "../../stores/notifications";
import { useGuildStore } from "../../stores/guilds";
import { Icon } from "../ico";
import { AppIcons } from "../icons";
import { GuildIcon } from "../GuildIcon";
import { cn } from "../../lib/cn";

const GROUPS: AlertKind[] = ["Updates", "Social", "System"];

export function NotificationDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const items = useNotificationsStore((s) => s.items);
  const remotes = useNotificationsStore((s) => s.remotes);
  const pendingInvites = useNotificationsStore((s) => s.pendingInvites);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const isUnread = useNotificationsStore((s) => s.isUnread);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const acceptInvite = useNotificationsStore((s) => s.acceptInvite);
  const refresh = useNotificationsStore((s) => s.refresh);
  const hydrateMyGuilds = useGuildStore((s) => s.hydrateMyGuilds);
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const onAccept = async (code: string) => {
    setAccepting(code);
    try {
      const result = await acceptInvite(code);
      if (result.ok) {
        toast.success("Joined guild");
        void hydrateMyGuilds();
      } else {
        toast.error(result.message);
      }
    } finally {
      setAccepting(null);
    }
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-80 bg-black/50" />
        <Drawer.Content className="fixed right-0 top-0 bottom-0 z-90 w-[min(380px,92vw)] outline-none flex flex-col">
          <div className="h-full cf-glass border-l border-white/10 flex flex-col bg-bg-elevated">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/8">
              <div>
                <Drawer.Title className="font-sora text-[15px] font-bold text-text-primary">
                  Notifications
                </Drawer.Title>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {unreadCount} unread
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-[10px] font-semibold text-primary-base hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
                <Drawer.Close className="h-8 w-8 rounded-lg border border-white/10 text-text-muted hover:text-white cursor-pointer flex items-center justify-center">
                  <Icon icon={AppIcons.Close} size={14} />
                </Drawer.Close>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scroll-hidden p-3 flex flex-col gap-4">
              {pendingInvites.length > 0 && (
                <section className="flex flex-col gap-1.5">
                  <h3 className="px-1 text-[9px] uppercase tracking-[0.16em] text-text-disabled font-semibold">
                    Guild invites
                  </h3>
                  <div className="cf-panel rounded-xl p-1 flex flex-col">
                    {pendingInvites.map((invite) => (
                      <div
                        key={invite.code}
                        className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg"
                      >
                        <GuildIcon
                          src={invite.guild_icon_url}
                          name={invite.guild_name}
                          className="h-9 w-9 rounded-lg text-[10px] bg-primary-base/15 text-primary-base"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-medium text-text-primary truncate">
                            {invite.guild_name}
                          </div>
                          <p className="text-[11px] text-text-muted mt-0.5 truncate">
                            Curated invite · {invite.code}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={accepting === invite.code}
                          onClick={() => void onAccept(invite.code)}
                          className="shrink-0 rounded-md border border-primary-base/35 px-2.5 py-1.5 text-[10px] font-semibold text-primary-base hover:bg-primary-base/10 cursor-pointer disabled:opacity-50"
                        >
                          {accepting === invite.code ? "…" : "Accept"}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {GROUPS.map((group) => {
                const groupItems = items.filter((a) => a.kind === group);
                if (!groupItems.length) return null;
                return (
                  <section key={group} className="flex flex-col gap-1.5">
                    <h3 className="px-1 text-[9px] uppercase tracking-[0.16em] text-text-disabled font-semibold">
                      {group}
                    </h3>
                    <div className="cf-panel rounded-xl p-1 flex flex-col">
                      {groupItems.map((a) => {
                        const unread = isUnread(a.id);
                        const remote = remotes.find((n) => n.id === a.id);
                        const inviteCode =
                          remote?.kind === "invite.curated" &&
                          typeof remote.payload?.code === "string"
                            ? remote.payload.code
                            : null;
                        return (
                          <div
                            key={a.id}
                            className={cn(
                              "flex gap-3 px-2.5 py-2.5 rounded-lg transition-colors",
                              !unread && "opacity-75",
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => markRead(a.id)}
                              className="flex flex-1 min-w-0 gap-3 text-left hover:bg-white/4 rounded-lg cursor-pointer"
                            >
                              <div
                                className={cn(
                                  "mt-0.5 h-2 w-2 rounded-full shrink-0",
                                  unread
                                    ? "bg-primary-base"
                                    : "bg-transparent border border-white/20",
                                )}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span
                                    className={cn(
                                      "text-[12.5px] truncate",
                                      unread
                                        ? "font-medium text-text-primary"
                                        : "text-text-secondary",
                                    )}
                                  >
                                    {a.title}
                                  </span>
                                  <span className="text-[10px] text-text-disabled shrink-0">
                                    {a.time}
                                  </span>
                                </div>
                                {a.body ? (
                                  <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
                                    {a.body}
                                  </p>
                                ) : null}
                              </div>
                            </button>
                            {inviteCode ? (
                              <button
                                type="button"
                                disabled={accepting === inviteCode}
                                onClick={() => void onAccept(inviteCode)}
                                className="self-center shrink-0 rounded-md border border-primary-base/35 px-2 py-1 text-[10px] font-semibold text-primary-base cursor-pointer disabled:opacity-50"
                              >
                                Join
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {!items.length && !pendingInvites.length && (
                <div className="px-3 py-10 text-center text-[13px] text-text-muted">
                  No notifications yet.
                </div>
              )}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
