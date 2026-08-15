import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseDiscordGuildSource } from "../lib/discordWidget";
import { fetchDiscordWidget } from "../lib/discordWidgetClient";
import type { DiscordWidgetPayload } from "../types/discordWidget";
import { DiscordWidgetFetchError } from "../types/discordWidget";

const BASE_INTERVAL_MS = 45_000;
const MAX_BACKOFF_MS = 180_000;

type UseDiscordWidgetState = {
  data: DiscordWidgetPayload | null;
  loading: boolean;
  error: string | null;
  errorCode: DiscordWidgetFetchError["code"] | "invalid_input" | null;
  lastUpdated: Date | null;
  guildId: string | null;
  refresh: () => void;
};

export function useDiscordWidget(source: string | undefined): UseDiscordWidgetState {
  const parsed = useMemo(
    () =>
      source?.trim()
        ? parseDiscordGuildSource(source)
        : { ok: false as const, error: "No Discord source configured." },
    [source],
  );

  const guildId = parsed.ok ? parsed.guildId : null;
  const invalidMessage = parsed.ok ? null : parsed.error;
  const [data, setData] = useState<DiscordWidgetPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(invalidMessage);
  const [errorCode, setErrorCode] = useState<
    UseDiscordWidgetState["errorCode"]
  >(parsed.ok ? null : "invalid_input");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const backoffRef = useRef(BASE_INTERVAL_MS);
  const failuresRef = useRef(0);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!guildId) {
      setData(null);
      setLoading(false);
      setError(invalidMessage);
      setErrorCode(invalidMessage ? "invalid_input" : null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const payload = await fetchDiscordWidget(guildId);
      if (requestId !== requestIdRef.current) return;
      setData(payload);
      setError(null);
      setErrorCode(null);
      setLastUpdated(new Date());
      failuresRef.current = 0;
      backoffRef.current = BASE_INTERVAL_MS;
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;

      failuresRef.current += 1;
      backoffRef.current = Math.min(
        BASE_INTERVAL_MS * 2 ** failuresRef.current,
        MAX_BACKOFF_MS,
      );

      if (err instanceof DiscordWidgetFetchError) {
        setError(err.message);
        setErrorCode(err.code);
      } else if (err instanceof Error) {
        setError(err.message);
        setErrorCode("fetch_failed");
      } else {
        setError("Could not load Discord widget.");
        setErrorCode("fetch_failed");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [guildId, invalidMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!guildId) {
      setError(invalidMessage);
      setErrorCode(invalidMessage ? "invalid_input" : null);
    }
  }, [guildId, invalidMessage]);

  useEffect(() => {
    if (!guildId) return;

    let timer: number | undefined;

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (document.visibilityState !== "visible") {
          schedule();
          return;
        }
        await load();
        schedule();
      }, backoffRef.current);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void load();
        schedule();
      } else {
        window.clearTimeout(timer);
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      requestIdRef.current += 1;
    };
  }, [guildId, load]);

  return {
    data,
    loading,
    error,
    errorCode,
    lastUpdated,
    guildId,
    refresh: () => {
      void load();
    },
  };
}
