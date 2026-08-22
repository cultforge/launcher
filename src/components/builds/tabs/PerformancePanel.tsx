import { useEffect, useMemo } from "react";
import { ResponsiveLine } from "@nivo/line";
import { Cpu, MemoryStick, Network } from "lucide-react";
import PerformanceChart from "../../../widgets/performance";
import { useBuildStore } from "../../../stores/build";
import {
  useSystemMetricsStore,
  type TelemetryPoint,
} from "../../../stores/systemMetrics";
import { cn } from "../../../lib/cn";

const EMERALD = "var(--color-primary-base)";
const AMBER = "var(--color-accent-gamma)";

const chartTheme = {
  text: { fill: "var(--color-text-secondary)", fontSize: 10 },
  axis: {
    ticks: { text: { fill: "var(--color-text-muted)", fontSize: 9 } },
    domain: { line: { stroke: "var(--color-border-subtle)" } },
  },
  grid: { line: { stroke: "rgba(255,255,255,0.06)" } },
  crosshair: { line: { stroke: EMERALD, strokeWidth: 1, strokeOpacity: 0.5 } },
  tooltip: {
    container: {
      background: "var(--color-bg-card)",
      border: "1px solid var(--color-border-strong)",
      borderRadius: 8,
      fontSize: 11,
      color: "var(--color-text-primary)",
    },
  },
};

function formatAge(secondsAgo: number): string {
  if (secondsAgo <= 0) return "now";
  if (secondsAgo < 60) return `-${secondsAgo}s`;
  return `-${Math.round(secondsAgo / 60)}m`;
}

function LiveChart({
  title,
  subtitle,
  unit,
  series,
  colors,
  yMax,
  height = 148,
}: {
  title: string;
  subtitle?: string;
  unit: string;
  series: { id: string; data: { x: string; y: number }[] }[];
  colors: string[];
  yMax?: number;
  height?: number;
}) {
  const empty = series.every((s) => s.data.length === 0);

  return (
    <div className="cf-panel flex min-h-0 flex-col gap-2 rounded-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[11px] font-semibold text-text-primary">{title}</h4>
          {subtitle ? (
            <p className="mt-0.5 text-[10px] text-text-muted truncate">{subtitle}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-[9px] uppercase tracking-wider text-text-disabled">
          {unit}
        </span>
      </div>
      <div className="relative w-full" style={{ height }}>
        {empty ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/8 text-[11px] text-text-muted">
            Waiting for live stats…
          </div>
        ) : (
          <ResponsiveLine
            data={series}
            margin={{ top: 8, right: 12, bottom: 24, left: 36 }}
            xScale={{ type: "point" }}
            yScale={{
              type: "linear",
              min: 0,
              max: yMax ?? "auto",
              stacked: false,
              nice: true,
            }}
            curve="monotoneX"
            enableGridX={false}
            enablePoints={false}
            enableArea
            areaOpacity={0.18}
            axisBottom={{
              tickSize: 0,
              tickPadding: 8,
              tickValues: series[0]?.data
                .filter((_, i, arr) => i === 0 || i === arr.length - 1 || i === Math.floor(arr.length / 2))
                .map((d) => d.x),
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 8,
              tickValues: 4,
            }}
            colors={colors}
            lineWidth={2}
            theme={chartTheme}
            animate={false}
            useMesh
            enableSlices="x"
            legends={
              series.length > 1
                ? [
                    {
                      anchor: "bottom-right",
                      direction: "row",
                      translateY: 22,
                      itemWidth: 56,
                      itemHeight: 12,
                      symbolSize: 8,
                      itemTextColor: "var(--color-text-secondary)",
                    },
                  ]
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

function buildSeries(
  history: TelemetryPoint[],
  pollMs: number,
  id: string,
  pick: (p: TelemetryPoint) => number,
) {
  const len = history.length;
  return {
    id,
    data: history.map((p, i) => ({
      x: formatAge(Math.round(((len - 1 - i) * pollMs) / 1000)),
      y: Number(pick(p).toFixed(2)),
    })),
  };
}

export function PerformancePanel() {
  const history = useSystemMetricsStore((s) => s.history);
  const latestMetrics = useSystemMetricsStore((s) => s.latest);
  const status = useSystemMetricsStore((s) => s.status);
  const error = useSystemMetricsStore((s) => s.error);
  const startPolling = useSystemMetricsStore((s) => s.startPolling);
  const stopPolling = useSystemMetricsStore((s) => s.stopPolling);
  const config = useBuildStore((s) => s.active().config);

  const POLL_MS = 2000;

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const latest = history[history.length - 1];
  const ramTotal = latestMetrics?.ram_total_gb ?? 0;
  const gpuAvailable = latest?.gpuAvailable ?? false;

  const ramSeries = useMemo(
    () => [buildSeries(history, POLL_MS, "System RAM", (p) => p.ram)],
    [history],
  );
  const cpuSeries = useMemo(
    () => [buildSeries(history, POLL_MS, "CPU", (p) => p.cpu)],
    [history],
  );
  const netSeries = useMemo(() => {
    const hasActivity = history.some((p) => p.netDown > 1 || p.netUp > 1);
    if (!hasActivity) return [];
    return [
      buildSeries(history, POLL_MS, "Download", (p) => p.netDown),
      buildSeries(history, POLL_MS, "Upload", (p) => p.netUp),
    ];
  }, [history]);

  const gpuSeries = useMemo(() => {
    if (!gpuAvailable) return [];
    return [buildSeries(history, POLL_MS, "GPU", (p) => p.gpu)];
  }, [history, gpuAvailable]);

  const heapPct =
    ramTotal > 0
      ? Math.min(100, Math.round((config.memoryMaxGb / ramTotal) * 100))
      : 0;

  const footer =
    status === "live"
      ? "Live stats from your PC — updates every few seconds."
      : status === "error"
        ? `Stats unavailable${error ? `: ${error}` : "."}`
        : "Connecting to local stats…";

  const vramNote =
    latest && latest.vramAvailable
      ? `${latest.vram.toFixed(1)} GB video memory in use`
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-stretch">
        <div className="lg:col-span-4 min-h-0">
          <PerformanceChart variant="compact" />
        </div>
        <div className="lg:col-span-8 flex flex-col gap-3">
          <LiveChart
            title="Memory"
            subtitle={
              latest
                ? `${latest.ram.toFixed(1)} GB in use · game set to ${config.memoryMinGb}–${config.memoryMaxGb} GB`
                : "System memory while the launcher is open"
            }
            unit="GB"
            series={ramSeries}
            colors={[EMERALD]}
            yMax={ramTotal > 0 ? Math.ceil(ramTotal * 1.05) : undefined}
            height={160}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <LiveChart
          title="Processor"
          subtitle={latest ? `${latest.cpu.toFixed(0)}% right now` : undefined}
          unit="%"
          series={cpuSeries}
          colors={[EMERALD]}
          yMax={100}
        />
        {gpuSeries.length > 0 ? (
          <LiveChart
            title="Graphics"
            subtitle={vramNote}
            unit="%"
            series={gpuSeries}
            colors={[AMBER]}
            yMax={100}
          />
        ) : netSeries.length > 0 ? (
          <LiveChart
            title="Network"
            subtitle="Launcher traffic"
            unit="KB/s"
            series={netSeries}
            colors={[EMERALD, "var(--color-text-muted)"]}
          />
        ) : (
          <div className="cf-panel flex flex-col justify-center rounded-xl px-4 py-6 text-center">
            <Network size={20} className="mx-auto mb-2 text-text-disabled" />
            <p className="text-[12px] text-text-secondary">Network activity</p>
            <p className="mt-1 text-[10px] text-text-muted">
              Quiet right now — charts appear when traffic picks up.
            </p>
          </div>
        )}
      </div>

      {netSeries.length > 0 && gpuSeries.length > 0 ? (
        <LiveChart
          title="Network"
          subtitle="Launcher traffic"
          unit="KB/s"
          series={netSeries}
          colors={[EMERALD, "var(--color-text-muted)"]}
          height={120}
        />
      ) : null}

      <section className="cf-panel rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <MemoryStick size={14} className="text-primary-base" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Memory for Minecraft
          </span>
        </div>
        <div className="flex-1 min-w-[140px] h-2 rounded-full bg-white/6 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full bg-linear-to-r from-primary-muted to-primary-base transition-all",
            )}
            style={{ width: `${heapPct}%` }}
          />
        </div>
        <span className="text-[11px] text-text-secondary tabular-nums shrink-0">
          {config.memoryMinGb}–{config.memoryMaxGb} GB
          {ramTotal > 0 ? ` of ${ramTotal.toFixed(0)} GB on this PC` : ""}
        </span>
      </section>

      <p className="text-[10px] text-text-disabled px-0.5">{footer}</p>
    </div>
  );
}
