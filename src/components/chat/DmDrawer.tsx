import { useEffect, useMemo, useRef } from "react";
import { useDmStore } from "../../stores/dm";
import { currentUserId } from "../../userstore";
import { cn } from "../../lib/cn";
import { dmSnippet, stickerToken } from "../../lib/chatStickers";
import { ChatBubble } from "./ChatBubble";
import { ChatComposer } from "./ChatComposer";
import { ModalShell } from "../modals/ModalShell";
import { useFriendsRosterStore } from "../../stores/friendsRoster";

function isMine(senderId: string, receiverId: string, peerId: string | null) {
  const me = currentUserId();
  if (senderId === "me") return true;
  if (me && senderId === me) return true;
  if (peerId && receiverId === peerId && senderId !== peerId) return true;
  return false;
}

export function DmDrawer() {
  const open = useDmStore((s) => s.open);
  const setOpen = useDmStore((s) => s.setOpen);
  const conversations = useDmStore((s) => s.conversations);
  const activePeerId = useDmStore((s) => s.activePeerId);
  const messages = useDmStore((s) => s.messages);
  const draft = useDmStore((s) => s.draft);
  const setDraft = useDmStore((s) => s.setDraft);
  const openPeer = useDmStore((s) => s.openPeer);
  const send = useDmStore((s) => s.send);
  const loading = useDmStore((s) => s.loading);
  const error = useDmStore((s) => s.error);
  const sendAlert = useDmStore((s) => s.sendAlert);
  const clearSendAlert = useDmStore((s) => s.clearSendAlert);
  const friends = useFriendsRosterStore((s) => s.friends);
  const bottomRef = useRef<HTMLDivElement>(null);

  const mentionCandidates = useMemo(() => {
    const fromFriends = friends.map((f) => ({
      id: f.id,
      name: f.name || f.id,
    }));
    const fromConvos = conversations.map((c) => ({
      id: c.peer.id,
      name: c.peer.name || c.peer.id,
    }));
    const map = new Map<string, { id: string; name: string }>();
    for (const row of [...fromFriends, ...fromConvos]) {
      if (!map.has(row.id)) map.set(row.id, row);
    }
    return [...map.values()];
  }, [friends, conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activePeerId]);

  if (!open) return null;

  const active = conversations.find((c) => c.peerId === activePeerId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <button
        type="button"
        aria-label="Close DMs"
        className="flex-1 cursor-pointer"
        onClick={() => setOpen(false)}
      />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-bg-app shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div>
            <h2 className="font-sora text-[15px] font-bold text-text-primary">
              Direct messages
            </h2>
            <p className="text-[11px] text-text-muted">
              Synced with CultForge · mark-read on open
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-white/12 px-2.5 py-1.5 text-[11px] text-text-secondary cursor-pointer"
          >
            Close
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)]">
          <nav className="overflow-y-auto border-r border-white/8 p-2">
            {conversations.length === 0 && (
              <p className="px-2 py-4 text-[11px] text-text-muted">
                No conversations yet.
              </p>
            )}
            {conversations.map((c) => (
              <button
                key={c.peerId}
                type="button"
                onClick={() => void openPeer(c.peerId)}
                className={cn(
                  "mb-1 w-full rounded-lg px-2.5 py-2 text-left cursor-pointer",
                  activePeerId === c.peerId
                    ? "bg-primary-base/12 text-primary-base"
                    : "hover:bg-white/4 text-text-secondary",
                )}
              >
                <div className="truncate text-[12px] font-semibold">
                  {c.peer.name}
                </div>
                <div className="truncate text-[10px] text-text-disabled">
                  {c.lastMessage?.content
                    ? dmSnippet(c.lastMessage.content)
                    : "No messages"}
                </div>
              </button>
            ))}
          </nav>

          <section className="flex min-h-0 flex-col">
            <div className="border-b border-white/6 px-4 py-2 text-[12px] font-semibold text-text-primary">
              {active?.peer.name ??
                (activePeerId ? `Chat · ${activePeerId}` : "Select a conversation")}
            </div>
            <div className="flex-1 overflow-y-auto scroll-hidden p-4 flex flex-col gap-2">
              {loading && (
                <p className="text-[12px] text-text-muted">Loading…</p>
              )}
              {error && !sendAlert && (
                <p className="text-[12px] text-state-error">{error}</p>
              )}
              {messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  mine={isMine(m.senderId, m.receiverId, activePeerId)}
                  name={m.senderName ?? m.senderId}
                  time={new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  content={m.content}
                />
              ))}
              <div ref={bottomRef} />
            </div>
            <ChatComposer
              value={draft}
              onChange={setDraft}
              disabled={!activePeerId}
              mentionCandidates={mentionCandidates}
              onSend={() => void send()}
              onSendSticker={(id) => void send(stickerToken(id))}
            />
          </section>
        </div>
      </aside>
      <ModalShell
        open={!!sendAlert}
        title={sendAlert?.title ?? "Could not send DM"}
        onClose={clearSendAlert}
        footer={
          <button
            type="button"
            onClick={clearSendAlert}
            className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer"
          >
            OK
          </button>
        }
      >
        <p className="text-[13px] leading-relaxed text-text-secondary">
          {sendAlert?.message}
        </p>
      </ModalShell>
    </div>
  );
}
