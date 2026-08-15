import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Lock, Minimize2, Move, Unlock, X } from "lucide-react";
import { Icon } from "./ico";
import { AppIcons } from "./icons";
import {
  lobbyAudioGetSnapshot,
  lobbyAudioSeek,
  lobbyAudioSubscribe,
} from "../lib/lobbyAudio";
import { activeLyricIndex } from "../lib/lrc";
import { useLobbyMusicStore } from "../stores/lobbyMusic";
import { cn } from "../lib/cn";

const FULL_SIZE = { width: 380, height: 390 };
const COMPACT_SIZE = { width: 320, height: 170 };
const VIEWPORT_MARGIN = 16;

function constrainPosition(
  position: { x: number; y: number },
  size: { width: number; height: number },
) {
  return {
    x: Math.min(
      Math.max(VIEWPORT_MARGIN, position.x),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - size.width - VIEWPORT_MARGIN),
    ),
    y: Math.min(
      Math.max(VIEWPORT_MARGIN, position.y),
      Math.max(VIEWPORT_MARGIN, window.innerHeight - size.height - 82),
    ),
  };
}

export function LyricsWidget() {
  const open = useLobbyMusicStore((s) => s.lyricsOpen);
  const close = useLobbyMusicStore((s) => s.closeLyrics);
  const mode = useLobbyMusicStore((s) => s.lyricsMode);
  const setMode = useLobbyMusicStore((s) => s.setLyricsMode);
  const offset = useLobbyMusicStore((s) => s.lyricsOffset);
  const setOffset = useLobbyMusicStore((s) => s.setLyricsOffset);
  const locked = useLobbyMusicStore((s) => s.lyricsLocked);
  const toggleLocked = useLobbyMusicStore((s) => s.toggleLyricsLocked);
  const savedPosition = useLobbyMusicStore((s) => s.lyricsPosition);
  const setSavedPosition = useLobbyMusicStore((s) => s.setLyricsPosition);
  const playing = useLobbyMusicStore((s) => s.playing);
  const togglePlaying = useLobbyMusicStore((s) => s.togglePlaying);
  const audio = useSyncExternalStore(
    lobbyAudioSubscribe,
    lobbyAudioGetSnapshot,
    lobbyAudioGetSnapshot,
  );
  const lines = audio.lyricLines;
  const size = mode === "compact" ? COMPACT_SIZE : FULL_SIZE;
  const defaultPosition = {
    x: window.innerWidth - size.width - 24,
    y: window.innerHeight - size.height - 92,
  };
  const [position, setPosition] = useState(() =>
    constrainPosition(savedPosition ?? defaultPosition, size),
  );
  const dragRef = useRef<{
    pointerX: number;
    pointerY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open]);

  useEffect(() => {
    const onResize = () => {
      setPosition((current) => {
        const next = constrainPosition(current, size);
        setSavedPosition(next);
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setSavedPosition, size.height, size.width]);

  useEffect(() => {
    setPosition((current) => constrainPosition(current, size));
  }, [size.height, size.width]);

  const activeIndex = audio.lyricsAvailable
    ? activeLyricIndex(lines, audio.currentTime, offset)
    : -1;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (locked || event.button !== 0) return;
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition(
      constrainPosition(
        {
          x:
            dragRef.current.originX +
            event.clientX -
            dragRef.current.pointerX,
          y:
            dragRef.current.originY +
            event.clientY -
            dragRef.current.pointerY,
        },
        size,
      ),
    );
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setSavedPosition(position);
  };

  if (!open) return null;

  const currentLine = activeIndex >= 0 ? lines[activeIndex] : null;

  return createPortal(
    <aside
      aria-label="Lobby lyrics"
      className="fixed z-240 cf-panel rounded-2xl border border-border-strong overflow-hidden flex flex-col"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
    >
      <div
        className={cn(
          "px-3 py-2.5 border-b border-border-subtle flex items-center gap-2 shrink-0",
          locked ? "cursor-default" : "cursor-move",
        )}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={finishDrag}
      >
        {locked ? (
          <Lock size={12} className="text-text-disabled" />
        ) : (
          <Move size={12} className="text-text-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-text-primary font-semibold truncate">
            {audio.metadata.title}
          </div>
          <div className="text-[8px] text-text-muted truncate">
            {audio.metadata.artist} · {audio.metadata.album}
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggleLocked()}
          onPointerDown={(event) => event.stopPropagation()}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary cursor-pointer"
          aria-label={locked ? "Unlock lyrics position" : "Lock lyrics position"}
        >
          {locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "full" ? "compact" : "full")}
          onPointerDown={(event) => event.stopPropagation()}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary cursor-pointer"
          aria-label={mode === "full" ? "Compact lyrics" : "Expand lyrics"}
        >
          <Minimize2 size={12} />
        </button>
        <button
          type="button"
          onClick={close}
          onPointerDown={(event) => event.stopPropagation()}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary cursor-pointer"
          aria-label="Close lyrics"
        >
          <X size={12} />
        </button>
      </div>

      {mode === "compact" ? (
        <div className="flex-1 min-h-0 px-4 py-3 flex flex-col items-center justify-center text-center">
          <p className="text-[13px] text-primary-base font-semibold leading-snug">
            {audio.lyricsAvailable
              ? currentLine?.text || "Instrumental"
              : "Instrumental lobby ambience"}
          </p>
          <p className="text-[9px] text-text-muted mt-1.5">
            {audio.lyricsAvailable
              ? lines[activeIndex + 1]?.text || audio.metadata.artist
              : "Waiting for CultForge lobby lyrics"}
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scroll-hidden px-3 py-4">
          {!audio.lyricsAvailable ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div className="text-[12px] text-text-primary font-semibold">
                Instrumental lobby ambience
              </div>
              <p className="text-[10px] text-text-muted leading-relaxed mt-2">
                The procedural fallback has no timeline. Lobby lyrics load from
                CultForge <span className="font-mono text-text-secondary">/v1/music</span>{" "}
                when online.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {lines.map((line, index) => {
                const active = index === activeIndex;
                const distance = Math.abs(index - activeIndex);
                return (
                  <button
                    key={`${line.time}-${line.text}`}
                    ref={active ? activeRef : undefined}
                    type="button"
                    onClick={() => lobbyAudioSeek(line.time - offset)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-center cursor-pointer transition-all",
                      active
                        ? "text-[13px] text-primary-base font-semibold bg-primary-base/8"
                        : distance <= 2
                          ? "text-[11px] text-text-secondary"
                          : "text-[10px] text-text-disabled opacity-60",
                    )}
                  >
                    {line.text}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="px-3 py-2 border-t border-border-subtle flex items-center gap-2 shrink-0 bg-bg-surface">
        <button
          type="button"
          onClick={togglePlaying}
          className="p-1.5 rounded-md text-primary-base hover:bg-primary-base/10 cursor-pointer"
          aria-label={playing ? "Pause lobby music" : "Play lobby music"}
        >
          <Icon icon={playing ? AppIcons.Pause : AppIcons.Play} size={12} />
        </button>
        <span className="text-[8px] uppercase tracking-wider text-text-disabled">
          Sync
        </span>
        <button
          type="button"
          onClick={() => setOffset(offset - 0.25)}
          className="px-1.5 py-1 rounded border border-border-subtle text-[9px] text-text-muted cursor-pointer"
        >
          −
        </button>
        <span className="w-11 text-center text-[9px] text-text-secondary tabular-nums">
          {offset > 0 ? "+" : ""}
          {offset.toFixed(2)}s
        </span>
        <button
          type="button"
          onClick={() => setOffset(offset + 0.25)}
          className="px-1.5 py-1 rounded border border-border-subtle text-[9px] text-text-muted cursor-pointer"
        >
          +
        </button>
        <span className="ml-auto text-[8px] text-text-disabled">
          {audio.lyricsAvailable ? "Synced" : "No timeline"}
        </span>
      </div>
    </aside>,
    document.body,
  );
}
