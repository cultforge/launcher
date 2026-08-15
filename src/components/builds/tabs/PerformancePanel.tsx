import { useEffect, useMemo } from "react";
import { ResponsiveLine } from "@nivo/line";
import { Cpu, HardDrive, MemoryStick, Network, Gauge } from "lucide-react";
import PerformanceChart from "../../../widgets/performance";
import { useBuildStore } from "../../../stores/build";
import {
  useSystemMetricsStore,
  type TelemetryPoint,
} from "../../../stores/systemMetrics";
import { cn } from "../../../lib/cn";

const EMERALD = "var(--color-primary-base)";
const MUTED = "var(--color-text-muted)";
const SOFT = "var(--color-text-secondary)";

const chartTheme = {
  text: { fill: "var(--color-text-secondary)", fontSize: 10 },
  axis: {
    ticks: { text: { fill: "var(--color-text-muted)", fontSize: 9 } },
    domain: { line: { stroke: "var(--color-border-subtle)" } },
  },
  grid: { line: { stroke: "var(--color-border-subtle)" } },
  crosshair: { line: { stroke: EMERALD, strokeWidth: 1 } },
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

function MetricChart({
  title,
  unit,
  series,
  colors,
  yMax,
}: {
  title: string;
  unit: string;
  series: { id: string; data: { x: number; y: number }[] }[];
  colors: string[];
  yMax?: number;
}) {
  return (
    <div className="cf-panel rounded-xl p-2.5 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-baseline justify-between px-0.5 gap-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary truncate">
          {title}
        </h4>
        <span className="text-[9px] text-text-disabled shrink-0">{unit}</span>
      </div>
      <div className="relative w-full h-27.5">
        <div className="absolute inset-0">
          <ResponsiveLine
            data={series}
            margin={{
              top: 6,
              right: 8,
              bottom: series.length > 1 ? 22 : 10,
              left: 32,
            }}
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
            areaOpacity={0.14}
            axisBottom={null}
            axisLeft={{
              tickSize: 0,
              tickPadding: 6,
              tickValues: 4,
            }}
            colors={colors}
            lineWidth={1.75}
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
                      translateY: 18,
                      itemWidth: 52,
                      itemHeight: 10,
                      symbolSize: 7,
                      itemTextColor: "var(--color-text-secondary)",
                    },
                  ]
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}

function KpiPill({
  icon: IconCmp,
  label,
  value,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0 px-2.5 py-1.5 rounded-lg border border-white/6 bg-white/2">
      <IconCmp size={12} className="text-primary-base shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className="text-[8px] uppercase tracking-[0.12em] text-text-muted">
          {label}
        </div>
        <div className="text-[12px] font-semibold text-text-primary tabular-nums truncate">
          {value}
        </div>
      </div>
    </div>
  );
}

export function PerformancePanel() {
  const history = useSystemMetricsStore((s) => s.history);
  const latestMetrics = useSystemMetricsStore((s) => s.latest);
  const status = useSystemMetricsStore((s) => s.status);
  const error = useSystemMetricsStore((s) => s.error);
  const startPolling = useSystemMetricsStore((s) => s.startPolling);
  const stopPolling = useSystemMetricsStore((s) => s.stopPolling);
  const config = useBuildStore((s) => s.active().config);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const latest = history[history.length - 1];
  const ramTotal = latestMetrics?.ram_total_gb ?? 0;
  const gpuAvailable = latest?.gpuAvailable ?? false;

  const toSeries = (id: string, pick: (p: TelemetryPoint) => number) => ({
    id,
    data: history.map((p, i) => ({ x: i, y: Number(pick(p).toFixed(2)) })),
  });

  const cpuSeries = useMemo(() => [toSeries("CPU", (p) => p.cpu)], [history]);
  const gpuSeries = useMemo(
    () => [
      toSeries("GPU %", (p) => p.gpu),
      toSeries("VRAM GB×10", (p) => p.vram * 10),
    ],
    [history],
  );
  const ramSeries = useMemo(() => [toSeries("RAM", (p) => p.ram)], [history]);
  const diskSeries = useMemo(
    () => [
      toSeries("Read", (p) => p.diskRead),
      toSeries("Write", (p) => p.diskWrite),
    ],
    [history],
  );
  const netSeries = useMemo(
    () => [
      toSeries("Down", (p) => p.netDown),
      toSeries("Up", (p) => p.netUp),
    ],
    [history],
  );

  const heapPct =
    ramTotal > 0
      ? Math.min(100, Math.round((config.memoryMaxGb / ramTotal) * 100))
      : 0;

  const footer =
    status === "live"
      ? "Live telemetry from local client."
      : status === "error"
        ? `Telemetry offline${error ? ` — ${error}` : "."}`
        : "Waiting for local client metrics…";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-stretch">
        <div className="lg:col-span-3 min-h-0 [&_.cf-panel]:max-w-none [&_.cf-panel]:m-0">
          <PerformanceChart variant="compact" />
        </div>
        <div className="lg:col-span-9 flex flex-col gap-2 justify-center">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-1.5">
            <KpiPill
              icon={Cpu}
              label="CPU"
              value={latest ? `${latest.cpu.toFixed(0)}%` : "—"}
            />
            <KpiPill
              icon={Gauge}
              label="GPU"
              value={
                latest && gpuAvailable ? `${latest.gpu.toFixed(0)}%` : "—"
              }
            />
            <KpiPill
              icon={MemoryStick}
              label="RAM"
              value={latest ? `${latest.ram.toFixed(1)} GB` : "—"}
            />
            <KpiPill
              icon={HardDrive}
              label="Disk"
              value={
                latest
                  ? `${latest.diskRead.toFixed(0)}/${latest.diskWrite.toFixed(0)}`
                  : "—"
              }
            />
            <KpiPill
              icon={Network}
              label="Net"
              value={latest ? `${latest.netDown.toFixed(0)}↓` : "—"}
            />
          </div>
          <section className="cf-panel rounded-lg px-3 py-2 flex items-center gap-3">
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted shrink-0">
              JVM heap
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full bg-linear-to-r from-primary-muted to-primary-base transition-all",
                )}
                style={{ width: `${heapPct}%` }}
              />
            </div>
            <span className="text-[10px] text-text-secondary tabular-nums shrink-0">
              {config.memoryMinGb}–{config.memoryMaxGb}
              {ramTotal > 0 ? ` / ${ramTotal.toFixed(0)} GB` : " GB"}
            </span>
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        <MetricChart
          title="CPU"
          unit="%"
          series={cpuSeries}
          colors={[EMERALD]}
          yMax={100}
        />
        <MetricChart
          title="GPU"
          unit="% · VRAM"
          series={gpuSeries}
          colors={[EMERALD, MUTED]}
          yMax={100}
        />
        <MetricChart
          title="RAM"
          unit="GB"
          series={ramSeries}
          colors={[EMERALD]}
          yMax={ramTotal > 0 ? Math.ceil(ramTotal) : undefined}
        />
        <MetricChart
          title="Disk"
          unit="MB/s"
          series={diskSeries}
          colors={[EMERALD, SOFT]}
        />
        <MetricChart
          title="Network"
          unit="KB/s"
          series={netSeries}
          colors={[EMERALD, MUTED]}
        />
      </div>

      <p className="text-[10px] text-text-disabled px-0.5">{footer}</p>
    </div>
  );
}
