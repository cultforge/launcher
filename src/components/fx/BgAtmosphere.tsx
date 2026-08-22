import { useEffect, useRef } from "react";
import { useLaunchStore } from "../../stores/launch";
import { useNavigationStore } from "../../typlibs";

const SOURCE = "/bg/background.mp4";
const WATCHDOG_MS = 900;
const STALL_MS = 450;

/**
 * Full-bleed looping ambient video behind the OLED shell.
 * Keep it alive unless minimized / tray visual idle.
 */
export function BgAtmosphere() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reducedRef = useRef(false);
  const minimizedRef = useRef(false);
  const visualIdleRef = useRef(false);
  const lastTimeRef = useRef(0);
  const lastAdvanceRef = useRef(performance.now());
  const visualIdle = useLaunchStore((s) => s.visualIdle);
  const primaryTab = useNavigationStore((s) => s.primaryTab);
  const quietGuild = primaryTab === "Guilds";

  useEffect(() => {
    visualIdleRef.current = visualIdle;
    const v = videoRef.current;
    if (!v) return;
    if (visualIdle) {
      v.pause();
    } else if (!reducedRef.current && !minimizedRef.current) {
      void ensurePlaying(v);
    }
  }, [visualIdle]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;

    const onMq = () => {
      reducedRef.current = mq.matches;
      const v = videoRef.current;
      if (!v) return;
      if (mq.matches || visualIdleRef.current) v.pause();
      else void ensurePlaying(v);
    };
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        if (cancelled) return;
        const win = getCurrentWindow();
        const sync = async () => {
          try {
            minimizedRef.current =
              (await win.isMinimized()) || !(await win.isVisible());
          } catch {
            minimizedRef.current = document.hidden;
          }
        };
        await sync();
        const stopFocus = await win.onFocusChanged(() => {
          void sync().then(() => {
            if (!minimizedRef.current && !visualIdleRef.current) {
              kickRef.current?.();
            }
          });
        });
        unlisten = () => {
          stopFocus();
        };
      })
      .catch(() => {
        minimizedRef.current = document.hidden;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const kickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.playbackRate = 1;
    v.disablePictureInPicture = true;
    try {
      v.disableRemotePlayback = true;
    } catch {
      /* older webview */
    }

    const hold = () =>
      reducedRef.current || minimizedRef.current || visualIdleRef.current;

    const kick = () => {
      if (hold()) return;
      void ensurePlaying(v);
    };
    kickRef.current = kick;

    const onEnded = () => {
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
      lastTimeRef.current = 0;
      lastAdvanceRef.current = performance.now();
      kick();
    };

    const onPause = () => {
      if (hold()) return;
      if (v.duration && v.currentTime >= v.duration - 0.3) {
        try {
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      window.setTimeout(kick, 40);
    };

    const onStalled = () => kick();
    const onWaiting = () => window.setTimeout(kick, 120);
    const onPlaying = () => {
      lastTimeRef.current = v.currentTime;
      lastAdvanceRef.current = performance.now();
    };
    const onTimeUpdate = () => {
      if (v.currentTime !== lastTimeRef.current) {
        lastTimeRef.current = v.currentTime;
        lastAdvanceRef.current = performance.now();
      }
    };

    const onVisibility = () => {
      if (!document.hidden && !visualIdleRef.current) kick();
    };

    v.addEventListener("ended", onEnded);
    v.addEventListener("pause", onPause);
    v.addEventListener("stalled", onStalled);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("canplay", kick);
    v.addEventListener("canplaythrough", kick);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", kick);
    window.addEventListener("pointerdown", kick, { passive: true });

    kick();

    const watchdog = window.setInterval(() => {
      if (hold()) return;
      const now = performance.now();
      const frozen =
        !v.paused && !v.ended && now - lastAdvanceRef.current > STALL_MS;
      if (v.paused || v.ended || frozen) {
        if (frozen) {
          try {
            const next = v.currentTime + 0.05;
            if (v.duration && next >= v.duration - 0.05) v.currentTime = 0;
            else v.currentTime = next;
          } catch {
            /* ignore */
          }
        }
        kick();
      }
    }, WATCHDOG_MS);

    return () => {
      kickRef.current = null;
      window.clearInterval(watchdog);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("stalled", onStalled);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("canplay", kick);
      v.removeEventListener("canplaythrough", kick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", kick);
      window.removeEventListener("pointerdown", kick);
    };
  }, []);

  return (
    <div
      className="app-bg-layer"
      aria-hidden
      data-guild-quiet={quietGuild ? "true" : undefined}
    >
      <video
        ref={videoRef}
        className="app-bg-video is-active"
        src={SOURCE}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
      />
      <div className="app-bg-veil" />
    </div>
  );
}

async function ensurePlaying(v: HTMLVideoElement) {
  try {
    if (v.ended || (v.duration && v.currentTime >= v.duration - 0.05)) {
      v.currentTime = 0;
    }
    v.playbackRate = 1;
    if (v.paused || v.ended) await v.play();
  } catch {
    /* autoplay policy — retry on focus / pointer */
  }
}
