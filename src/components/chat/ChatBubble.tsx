import { cn } from "../../lib/cn";
import { parseStickerId, stickerById } from "../../lib/chatStickers";
import { ChatMarkdown } from "./ChatMarkdown";
import { highlightMentions } from "./ChatComposer";

export function ChatBubble({
  mine,
  name,
  time,
  content,
}: {
  mine: boolean;
  name?: string;
  time: string;
  content: string;
}) {
  const stickerId = parseStickerId(content);
  const sticker = stickerId ? stickerById(stickerId) : undefined;
  const displaySource = sticker ? content : highlightMentions(content);

  return (
    <div className={cn("flex flex-col gap-0.5 max-w-[75%]", mine ? "self-end items-end" : "self-start items-start")}>
      <div className="text-[10px] text-text-disabled px-1">
        {mine ? time : `${name ?? "Player"} · ${time}`}
      </div>
      {sticker ? (
        <img
          src={sticker.svg}
          alt={sticker.label}
          className="h-24 w-24 rounded-2xl"
        />
      ) : (
        <div
          className={cn(
            "rounded-2xl px-3 py-2",
            mine
              ? "bg-primary-base/20 text-text-primary rounded-br-md"
              : "bg-black/30 text-text-secondary rounded-bl-md",
          )}
        >
          <ChatMarkdown
            source={displaySource}
            className={mine ? "text-text-primary [&_a]:text-primary-base" : ""}
          />
        </div>
      )}
    </div>
  );
}
