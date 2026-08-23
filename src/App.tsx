import { AppLayout, AuthLayout } from "./components/layout";
import "./cultkit.css";
import { useEffect, useState } from "react";
import { LogicalSize } from "@tauri-apps/api/window";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Splash from "./components/splash";
import { startAuthEventBridge } from "./lib/authEvents";
import { startLocalContentPipeline } from "./lib/bootScan";
import { health, waitForClient } from "./lib/client";
import { startClientLogStream } from "./lib/clientLogSocket";
import {
  handleContentHref,
  isCultforgeDeepLink,
  navigateCultforgeDeepLink,
} from "./lib/deepLinks";
import { logger } from "./lib/logger";
import {
  listenNativeDownloadProgress,
  type NativeDownloadProgress,
} from "./lib/nativeDownloads";
import { Toaster, toast } from "sonner";
import { useThemeStore } from "./stores/theme";
import { useLobbyMusicStore } from "./stores/lobbyMusic";
import { useNotificationsStore } from "./stores/notifications";
import { useSettingsStore } from "./stores/settings";
import { useContextDockStore } from "./stores/contextDock";
import { useDownloadStore } from "./typlibs";
import { useAppStore } from "./userstore";
import type { StartupPhase } from "./types/startup";
import { startLaunchLifecycle } from "./lib/launchLifecycle";
import {
  lobbyAudioStart,
  lobbyAudioUnlock,
  reloadLobbyAudio,
} from "./lib/lobbyAudio";
import { LyricsWidget } from "./components/LyricsWidget";

function App() {
  const appWindow = getCurrentWindow();
  const [phase, setPhase] = useState<StartupPhase>("restoring-preferences");
  const [elapsedMs, setElapsedMs] = useState(0);
  const authStatus = useAppStore((s) => s.authStatus);
  const currentUser = useAppStore((s) => s.currentUser);

  useEffect(() => startLaunchLifecycle(), []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !isCultforgeDeepLink(href)) return;
      event.preventDefault();
      navigateCultforgeDeepLink(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // OS protocol handler: cultforge://… (installer-registered + single-instance forward)
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const applyUrls = (urls: string[]) => {
      for (const url of urls) {
        if (!url) continue;
        if (handleContentHref(url)) {
          logger.info(`Deep link: ${url}`);
          continue;
        }
        if (!isCultforgeDeepLink(url)) continue;
        logger.info(`Deep link: ${url}`);
        navigateCultforgeDeepLink(url);
      }
    };

    void (async () => {
      try {
        const { getCurrent, onOpenUrl } =
          await import("@tauri-apps/plugin-deep-link");
        if (cancelled) return;
        const initial = await getCurrent();
        if (initial?.length) applyUrls(initial);
        unlisten = await onOpenUrl((urls) => applyUrls(urls));
      } catch (e) {
        // Browser / missing plugin in non-Tauri contexts
        logger.debug(
          `Deep link plugin unavailable: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let lastUi = 0;
    let pending: NativeDownloadProgress | null = null;
    let timer: number | undefined;
    const apply = (event: NativeDownloadProgress, force = false) => {
      const terminal =
        event.phase === "done" ||
        event.phase === "error" ||
        event.phase === "cancelled" ||
        event.phase === "queued";
      const now = Date.now();
      if (!force && !terminal && now - lastUi < 120) {
        pending = event;
        if (timer == null) {
          timer = window.setTimeout(() => {
            timer = undefined;
            if (pending) apply(pending, true);
          }, 120);
        }
        return;
      }
      lastUi = now;
      pending = null;
      if (timer != null) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      useDownloadStore.getState().applyNativeProgress(event);
      if (event.phase === "done") {
        logger.success(`Download complete: ${event.name}`);
      } else if (event.phase === "error") {
        logger.error(
          `Download failed: ${event.name}${event.error ? ` — ${event.error}` : ""}`,
        );
      } else if (event.phase === "cancelled") {
        logger.warn(`Download cancelled: ${event.name}`);
      }
    };
    listenNativeDownloadProgress((event) => {
      apply(event);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (timer != null) window.clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    startAuthEventBridge();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setElapsedMs(Date.now() - startedAt),
      250,
    );

    const beginLobbyBeforeReady = async () => {
      const onLaunch = useSettingsStore.getState().settings.lobbyMusicOnLaunch;
      if (!onLaunch) {
        // Stale prefs defaulted this to false; still start unless explicitly muted.
        logger.info("Lobby music on launch is off — starting anyway (pause anytime)");
      }
      const lobby = useLobbyMusicStore.getState();
      lobby.setPlaying(true);
      // Fire-and-forget: do not block first paint on audio decode.
      void lobbyAudioStart(lobby.volume, lobby.muted).catch((err) => {
        logger.warn(
          `Lobby music start: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    };

    const unlockLobby = () => {
      void lobbyAudioUnlock();
    };
    window.addEventListener("pointerdown", unlockLobby);
    window.addEventListener("keydown", unlockLobby);

    (async () => {
      try {
        logger.info("Boot: restoring preferences");
        setPhase("restoring-preferences");
        await Promise.all([
          useThemeStore.getState().hydrate(),
          useLobbyMusicStore.getState().hydrate(),
          useNotificationsStore.getState().hydrate(),
          useSettingsStore.getState().hydrate(),
          useContextDockStore.getState().hydrate(),
        ]);
        if (cancelled) return;

        logger.info("Boot: starting services");
        setPhase("starting-services");
        await appWindow.setMinSize(new LogicalSize(1380, 800));
        if (cancelled) return;

        // Local scan + cache does not depend on the FastAPI client.
        startLocalContentPipeline();

        logger.info("Boot: connecting to local client");
        setPhase("connecting-services");
        await waitForClient({
          timeoutMs: 20000,
          signal: controller.signal,
          onAttempt: () => {
            if (!cancelled) setPhase("connecting-services");
          },
        });
        if (cancelled) return;

        useAppStore.getState().setClientReady(true);
        startClientLogStream();
        logger.success("Local client ready");
        const themeReload = reloadLobbyAudio();
        try {
          const status = await health(controller.signal);
          if (!status.remote) {
            logger.warn(
              status.remote_error ||
                "Degraded mode: remote CultForge APIs are offline",
            );
            toast.message("Degraded mode", {
              description:
                status.remote_error ||
                "Local client is up; remote CultForge APIs are offline.",
            });
          } else {
            logger.info("Remote health check OK");
          }
        } catch {
          // /health optional; /ping already succeeded
        }

        if (!cancelled) setPhase("signing-in");
        await useAppStore.getState().hydrateSession();
        await themeReload;

        if (!cancelled) {
          window.clearInterval(timer);
          await beginLobbyBeforeReady();
          if (cancelled) return;
          setPhase("ready");
          logger.success("Launcher UI ready");
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        logger.warn(
          `Client ping failed, continuing with offline shell: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        if (!cancelled) {
          useAppStore.getState().setClientReady(false);
          startLocalContentPipeline();
          setPhase("offline");
          await useAppStore.getState().hydrateSession();
          await reloadLobbyAudio();
          await beginLobbyBeforeReady();
          if (cancelled) return;
          window.clearInterval(timer);
          setPhase("ready");
          toast.message("Offline mode", {
            description:
              "Local client unreachable. Opening with cached profile and local builds when available.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", unlockLobby);
      window.removeEventListener("keydown", unlockLobby);
    };
  }, []);

  if (phase !== "ready") {
    return <Splash phase={phase} elapsedMs={elapsedMs} />;
  }

  const showShell =
    authStatus === "authenticated" && currentUser !== null;

  return (
    <>
      <Toaster
        theme="dark"
        position="top-right"
        offset={{ top: "72px", right: "16px" }}
        toastOptions={{
          className: "cf-toast",
          duration: 4500,
        }}
      />
      {showShell ? <AppLayout /> : <AuthLayout />}
      <LyricsWidget />
    </>
  );
}

export default App;
