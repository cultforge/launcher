import { useEffect, useRef } from "react";
import { ListMusic, Volume2, VolumeX } from "lucide-react";
import { Icon } from "./ico";
import { AppIcons } from "./icons";
import { useLobbyMusicStore } from "../stores/lobbyMusic";
import { useThemeStore } from "../stores/theme";
import { useLaunchStore } from "../stores/launch";
import {
  lobbyAudioGetLevels,
  lobbyAudioSetVolume,
  lobbyAudioStart,
  lobbyAudioStop,
} from "../lib/lobbyAudio";
import { cn } from "../lib/cn";

const BAR_COUNT = 28;

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function LobbyMusicControls() {
  const playing = useLobbyMusicStore((s) => s.playing);
  const muted = useLobbyMusicStore((s) => s.muted);
  const volume = useLobbyMusicStore((s) => s.volume);
  const togglePlaying = useLobbyMusicStore((s) => s.togglePlaying);
  const toggleMuted = useLobbyMusicStore((s) => s.toggleMuted);
  const setVolume = useLobbyMusicStore((s) => s.setVolume);
  const lyricsOpen = useLobbyMusicStore((s) => s.lyricsOpen);
  const toggleLyrics = useLobbyMusicStore((s) => s.toggleLyrics);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const visualIdle = useLaunchStore((s) => s.visualIdle);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (playing && !visualIdle && !muted) {
      lobbyAudioStart(volume, muted).catch(() => {
        /* keep playing=true — gesture unlock retries */
      });
    } else {
      lobbyAudioStop();
    }
  }, [playing, visualIdle, muted]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    lobbyAudioSetVolume(volume, muted, playing && !muted);
  }, [volume, muted, playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!playing || visualIdle) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const rootStyles = getComputedStyle(document.documentElement);
    const primary = rootStyles.getPropertyValue("--color-primary-base").trim();
    const primarySoft = rootStyles
      .getPropertyValue("--color-primary-soft")
      .trim();

    const draw = () => {
      if (useLaunchStore.getState().visualIdle) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const levels = lobbyAudioGetLevels(BAR_COUNT, playing && !muted);
      const gap = 2;
      const barW = (cssW - gap * (BAR_COUNT - 1)) / BAR_COUNT;

      for (let i = 0; i < BAR_COUNT; i++) {
        const h = Math.max(2, levels[i] * cssH * 0.92);
        const x = i * (barW + gap);
        const y = (cssH - h) / 2;
        const g = ctx.createLinearGradient(0, y + h, 0, y);
        g.addColorStop(0, withAlpha(primary, 0.25));
        g.addColorStop(0.55, withAlpha(primary, 0.75));
        g.addColorStop(1, withAlpha(primarySoft, 0.95));
        ctx.fillStyle = g;
        const radius = Math.min(2, barW / 2);
        roundRect(ctx, x, y, barW, h, radius);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, muted, activeThemeId, visualIdle]);

  return (
    <div className="flex items-center gap-2 shrink-0 min-w-0">
      <button
        type="button"
        onClick={togglePlaying}
        className={cn(
          "p-1.5 rounded-md cursor-pointer transition-colors",
          playing
            ? "text-primary-base hover:bg-primary-base/10"
            : "text-text-secondary hover:text-text-primary hover:bg-white/4",
        )}
        title={playing ? "Pause lobby music" : "Play lobby music"}
        aria-label={playing ? "Pause lobby music" : "Play lobby music"}
      >
        <Icon icon={playing ? AppIcons.Pause : AppIcons.Play} size={14} />
      </button>

      <canvas
        ref={canvasRef}
        className="h-7 w-30 sm:w-37 rounded-md"
        aria-hidden
      />

      <button
        type="button"
        onClick={toggleLyrics}
        className={cn(
          "p-1.5 rounded-md cursor-pointer transition-colors",
          lyricsOpen
            ? "text-primary-base bg-primary-base/10"
            : "text-text-secondary hover:text-text-primary hover:bg-white/4",
        )}
        title={lyricsOpen ? "Hide lyrics" : "Show lyrics"}
        aria-label={lyricsOpen ? "Hide lyrics" : "Show lyrics"}
        aria-pressed={lyricsOpen}
      >
        <ListMusic size={14} />
      </button>

      <button
        type="button"
        onClick={toggleMuted}
        className={cn(
          "p-1.5 rounded-md cursor-pointer transition-colors",
          muted
            ? "text-text-muted hover:text-text-secondary"
            : "text-text-secondary hover:text-text-primary hover:bg-white/4",
        )}
        title={muted ? "Unmute" : "Mute"}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        disabled={!playing}
        className="hidden md:block w-16 accent-primary-base cursor-pointer disabled:opacity-40"
        aria-label="Lobby music volume"
      />
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
