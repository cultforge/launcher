import { useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { CHAT_STICKERS } from "../../lib/chatStickers";
import { useSettingsStore } from "../../stores/settings";

const EMOJI = [
  "😀",
  "😂",
  "🥲",
  "😍",
  "😎",
  "🤔",
  "😭",
  "🔥",
  "✨",
  "💚",
  "👍",
  "👎",
  "🎉",
  "⚔️",
  "🛡️",
  "🌙",
  "⚒️",
  "💎",
  "🍀",
  "👀",
];

export type MentionCandidate = {
  id: string;
  name: string;
};

export function ChatComposer({
  value,
  onChange,
  onSend,
  onSendSticker,
  disabled,
  placeholder,
  mentionCandidates = [],
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onSendSticker: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  mentionCandidates?: MentionCandidate[];
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<"none" | "emoji" | "sticker">("none");
  const mentionsOn = useSettingsStore(
    (s) => s.settings.experimentalChatMentions,
  );
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const insertAt = (chunk: string) => {
    const el = areaRef.current;
    if (!el) {
      onChange(value + chunk);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + chunk + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + chunk.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertEmoji = (emoji: string) => insertAt(emoji);

  const onDraftChange = (next: string) => {
    onChange(next);
    if (!mentionsOn || !mentionCandidates.length) {
      setMentionQuery(null);
      return;
    }
    const el = areaRef.current;
    const caret = el?.selectionStart ?? next.length;
    const before = next.slice(0, caret);
    const match = before.match(/@([\w.-]*)$/);
    setMentionQuery(match ? match[1] ?? "" : null);
  };

  const filteredMentions =
    mentionQuery == null
      ? []
      : mentionCandidates
          .filter((c) =>
            c.name.toLowerCase().includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 8);

  const applyMention = (c: MentionCandidate) => {
    const el = areaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const replaced = before.replace(/@([\w.-]*)$/, `@${c.name} `);
    onChange(replaced + after);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = replaced.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-white/8 p-3">
      {panel !== "none" && (
        <div className="rounded-xl border border-white/10 bg-black/40 p-2 max-h-40 overflow-y-auto">
          {panel === "emoji" ? (
            <div className="grid grid-cols-8 gap-1">
              {EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="h-8 rounded-lg text-[16px] hover:bg-white/8 cursor-pointer"
                  onClick={() => insertEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-1.5">
              {CHAT_STICKERS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.label}
                  className="rounded-lg hover:bg-white/8 p-1 cursor-pointer"
                  onClick={() => {
                    onSendSticker(s.id);
                    setPanel("none");
                  }}
                >
                  <img src={s.svg} alt={s.label} className="h-10 w-10 mx-auto" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {filteredMentions.length > 0 ? (
        <div className="rounded-xl border border-primary-base/25 bg-black/50 p-1.5 max-h-36 overflow-y-auto">
          {filteredMentions.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => applyMention(c)}
              className="w-full text-left rounded-lg px-2.5 py-1.5 text-[12px] text-text-primary hover:bg-primary-base/15 cursor-pointer"
            >
              @{c.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPanel((p) => (p === "emoji" ? "none" : "emoji"))}
          className={cn(
            "h-10 w-10 shrink-0 rounded-xl border border-white/10 text-[16px] cursor-pointer",
            panel === "emoji" ? "bg-primary-base/15" : "bg-black/30 hover:bg-white/6",
          )}
          title="Emoji"
        >
          ☺
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPanel((p) => (p === "sticker" ? "none" : "sticker"))}
          className={cn(
            "h-10 w-10 shrink-0 rounded-xl border border-white/10 text-[11px] font-semibold text-text-secondary cursor-pointer",
            panel === "sticker" ? "bg-primary-base/15" : "bg-black/30 hover:bg-white/6",
          )}
          title="Stickers"
        >
          ★
        </button>
        <textarea
          ref={areaRef}
          value={value}
          disabled={disabled}
          rows={1}
          placeholder={
            placeholder ??
            (mentionsOn ? "Write a message… (@ to mention)" : "Write a message…")
          }
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
            if (e.key === "Escape") setMentionQuery(null);
          }}
          className="flex-1 min-h-10 max-h-28 resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary-base/40 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={onSend}
          className="cf-btn-primary h-10 rounded-xl px-4 text-[12px] font-semibold cursor-pointer disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

/** Highlight @Name tokens for display. */
export function highlightMentions(text: string): string {
  return text.replace(
    /(^|[\s])(@[\w.-]+)/g,
    "$1**$2**",
  );
}
