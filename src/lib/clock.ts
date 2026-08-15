import { useSyncExternalStore } from "react";

type ClockListener = () => void;

const listeners = new Set<ClockListener>();
let snapshot = Date.now();
let timer: number | null = null;

function emitNow() {
  snapshot = Date.now();
  listeners.forEach((listener) => listener());
}

function clearTimer() {
  if (timer !== null && typeof window !== "undefined") {
    window.clearTimeout(timer);
  }
  timer = null;
}

function scheduleNextSecond() {
  clearTimer();
  if (!listeners.size || typeof window === "undefined") return;
  const delay = 1000 - (Date.now() % 1000) + 8;
  timer = window.setTimeout(() => {
    emitNow();
    scheduleNextSecond();
  }, delay);
}

function resynchronize() {
  if (
    typeof document !== "undefined" &&
    document.visibilityState === "hidden"
  ) {
    clearTimer();
    return;
  }
  emitNow();
  scheduleNextSecond();
}

function attachEnvironmentListeners() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  document.addEventListener("visibilitychange", resynchronize);
  window.addEventListener("focus", resynchronize);
}

function detachEnvironmentListeners() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  document.removeEventListener("visibilitychange", resynchronize);
  window.removeEventListener("focus", resynchronize);
}

export function clockSubscribe(listener: ClockListener) {
  const wasEmpty = listeners.size === 0;
  listeners.add(listener);
  if (wasEmpty) {
    attachEnvironmentListeners();
    resynchronize();
  }

  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearTimer();
      detachEnvironmentListeners();
    }
  };
}

export function clockGetSnapshot() {
  return snapshot;
}

export function useNow() {
  return useSyncExternalStore(
    clockSubscribe,
    clockGetSnapshot,
    clockGetSnapshot,
  );
}
