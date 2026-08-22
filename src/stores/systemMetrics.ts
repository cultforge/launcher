import { create } from "zustand";
import { fetchSystemMetrics, type SystemMetrics } from "../lib/client";

export type TelemetryPoint = {
  t: number;
  cpu: number;
  gpu: number;
  vram: number;
  ram: number;
  diskRead: number;
  diskWrite: number;
  netUp: number;
  netDown: number;
  gpuAvailable: boolean;
  vramAvailable: boolean;
};

const HISTORY_CAP = 36;
const POLL_MS = 2000;

type MetricsStatus = "idle" | "live" | "error";

type SystemMetricsStore = {
  latest: SystemMetrics | null;
  history: TelemetryPoint[];
  status: MetricsStatus;
  error: string | null;
  startPolling: () => void;
  stopPolling: () => void;
  forceStopPolling: () => void;
};

let pollTimer: number | null = null;
let subscribers = 0;
let inFlight = false;

function toPoint(
  metrics: SystemMetrics,
  previous: TelemetryPoint | null,
): TelemetryPoint {
  const gpuAvailable = metrics.gpu_percent != null;
  const vramAvailable = metrics.vram_used_gb != null;
  return {
    t: Math.round(metrics.ts * 1000),
    cpu: metrics.cpu_percent,
    gpu: gpuAvailable
      ? (metrics.gpu_percent as number)
      : (previous?.gpu ?? 0),
    vram: vramAvailable
      ? (metrics.vram_used_gb as number)
      : (previous?.vram ?? 0),
    ram: metrics.ram_used_gb,
    diskRead: metrics.disk_read_mbs,
    diskWrite: metrics.disk_write_mbs,
    netUp: metrics.net_up_kbs,
    netDown: metrics.net_down_kbs,
    gpuAvailable,
    vramAvailable,
  };
}

async function tick(get: () => SystemMetricsStore, set: (partial: Partial<SystemMetricsStore>) => void) {
  if (inFlight) return;
  inFlight = true;
  try {
    const metrics = await fetchSystemMetrics();
    const previous = get().history[get().history.length - 1] ?? null;
    const point = toPoint(metrics, previous);
    const history = [...get().history, point];
    set({
      latest: metrics,
      history:
        history.length > HISTORY_CAP
          ? history.slice(history.length - HISTORY_CAP)
          : history,
      status: "live",
      error: null,
    });
  } catch (e) {
    set({
      status: get().latest ? "live" : "error",
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    inFlight = false;
  }
}

export const useSystemMetricsStore = create<SystemMetricsStore>((set, get) => ({
  latest: null,
  history: [],
  status: "idle",
  error: null,

  startPolling: () => {
    subscribers += 1;
    if (pollTimer != null) return;
    void tick(get, set);
    pollTimer = window.setInterval(() => {
      void tick(get, set);
    }, POLL_MS);
  },

  stopPolling: () => {
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers > 0) return;
    if (pollTimer != null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  },

  forceStopPolling: () => {
    subscribers = 0;
    if (pollTimer != null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  },
}));
