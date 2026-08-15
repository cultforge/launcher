import { MemoryStick, Cpu, HardDrive, Zap } from "lucide-react";
import { PerformanceResult, useNavigationStore } from "../typlibs";
import { Chip, ProgressBar } from "@heroui/react";
import { ResponsiveLine } from "@nivo/line";
import { useEffect, useMemo } from "react";
import { cn } from "../lib/cn";
import { useBuildStore } from "../stores/build";
import { useBuildUiStore } from "../stores/buildUi";
import { useSystemMetricsStore } from "../stores/systemMetrics";
import { toast } from "sonner";

function calculateScore(
  ramUsage: number,
  ramTotal: number,
  configuredLimit: number,
  minRamRequired: number,
  ramPercent: number,
): PerformanceResult {
  var x = "[stop-color:var(--color-primary-base)]";
  var y = "bg-linear-to-r from-primary-muted to-primary-base";
  var r = "GOOD";

  if (ramTotal <= 0 || configuredLimit <= 0 || minRamRequired <= 0) {
    return { score: 1, beamX: x, beamY: y, rate: r };
  }
  const available = Math.max(0, ramTotal - ramUsage);
  let fitScore = 0;
  let allocationScore = 0;
  const allocationPercent = (configuredLimit / ramTotal) * 100;
  const systemReserve = Math.max(2, ramTotal * 0.15);
  const safeAvailable = Math.max(0, available - systemReserve);
  let minimumScore = 0;
  let penalty = 0;

  if (allocationPercent <= 55) allocationScore = 15;
  else if (allocationPercent <= 70) allocationScore = 12;
  else if (allocationPercent <= 80) allocationScore = 8;
  else if (allocationPercent <= 90) allocationScore = 3;
  else allocationScore = 0;

  if (safeAvailable >= minRamRequired) fitScore = 40;
  else if (available >= minRamRequired) fitScore = 28;
  else if (available >= minRamRequired * 0.75) fitScore = 14;
  else fitScore = 4;

  if (configuredLimit >= minRamRequired) minimumScore = 25;
  else if (configuredLimit >= minRamRequired * 0.85) minimumScore = 15;
  else minimumScore = 5;

  if (ramPercent > 90) penalty += 20;
  else if (ramPercent > 80) penalty += 10;
  else if (ramPercent > 70) penalty += 4;

  let LaunchScore = fitScore + allocationScore + minimumScore - penalty;
  LaunchScore = Math.max(1, Math.min(100, LaunchScore));

  if (LaunchScore >= 85) {
    r = "EXCELLENT";
    x = "[stop-color:var(--color-primary-base)]";
    y = "bg-linear-to-r from-primary-muted to-primary-base";
  } else if (LaunchScore >= 70) {
    r = "GOOD";
    x = "[stop-color:var(--color-primary-soft)]";
    y = "bg-linear-to-r from-primary-muted to-primary-base";
  } else if (LaunchScore >= 50) {
    r = "FAIR";
    x = "[stop-color:var(--color-state-warning)]";
    y = "bg-linear-to-r from-state-warning to-accent-gamma";
  } else if (LaunchScore >= 20) {
    r = "POOR";
    x = "[stop-color:var(--color-accent-gamma)]";
    y = "bg-linear-to-r from-accent-gamma to-state-error";
  } else {
    r = "TERRIBLE";
    x = "[stop-color:var(--color-state-error)]";
    y = "bg-linear-to-r from-state-error to-state-error";
  }

  return { score: Math.round(LaunchScore), beamX: x, beamY: y, rate: r };
}

export default function PerformanceChart({
  variant = "default",
}: {
  variant?: "default" | "hero" | "compact";
}) {
  const latest = useSystemMetricsStore((s) => s.latest);
  const history = useSystemMetricsStore((s) => s.history);
  const status = useSystemMetricsStore((s) => s.status);
  const startPolling = useSystemMetricsStore((s) => s.startPolling);
  const stopPolling = useSystemMetricsStore((s) => s.stopPolling);
  const config = useBuildStore((s) => s.active().config);
  const setConfig = useBuildStore((s) => s.setConfig);
  const activeId = useBuildStore((s) => s.activeId);
  const setActiveTab = useBuildUiStore((s) => s.setActiveTab);
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const ramUsage = latest?.ram_used_gb ?? 0;
  const ramTotal = latest?.ram_total_gb ?? 0;
  const cpuUsage = Math.round(latest?.cpu_percent ?? 0);
  const configuredLimit = config.memoryMaxGb;
  const minRamRequired = config.memoryMinGb;
  const diskUsage = latest?.disk_used_gb ?? 0;
  const diskTotal = latest?.disk_total_gb ?? 0;

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const gapLength = circumference * 0.25;
  const ramPercent = ramTotal > 0 ? (ramUsage / ramTotal) * 100 : 0;
  const result = calculateScore(
    ramUsage,
    ramTotal,
    configuredLimit,
    minRamRequired,
    ramPercent,
  );
  const score = status === "idle" && !latest ? 0 : result.score;
  const beamX = result.beamX;
  const rate = !latest ? "—" : result.rate;
  const filledOffset = circumference - arcLength * (score / 100);
  const diskPercent = diskTotal > 0 ? (diskUsage / diskTotal) * 100 : 0;

  const lineData = useMemo(
    () => [
      {
        id: "RAM",
        data: history.map((h, i) => ({ x: i, y: h.ram })),
      },
      {
        id: "CPU",
        data: history.map((h, i) => ({ x: i, y: h.cpu / 10 })),
      },
    ],
    [history],
  );

  const isHero = variant === "hero";
  const isCompact = variant === "compact";
  const arcMint =
    rate === "EXCELLENT"
      ? "[stop-color:var(--color-accent-gamma)]"
      : beamX;

  const svgSize = isCompact ? 100 : isHero ? 140 : 160;
  const scoreText = isCompact
    ? "text-2xl font-bold text-[#F2F3FF] font-sans"
    : isHero
      ? "text-3xl font-bold text-[#F2F3FF] font-sans"
      : "text-4xl font-bold text-[#F2F3FF] font-sans";

  const ramLabel = latest
    ? `${ramUsage.toFixed(1)}/${ramTotal.toFixed(0)} GB`
    : "—";
  const cpuLabel = latest ? `${cpuUsage}%` : "—";
  const diskLabel = latest
    ? `${diskUsage.toFixed(0)}/${diskTotal.toFixed(0)} GB`
    : "—";

  return (
    <div
      className={
        isCompact
          ? "flex flex-col gap-2 p-3 cf-panel w-full h-full rounded-xl relative overflow-hidden"
          : isHero
            ? "flex flex-col gap-2.5 p-3 cf-panel w-full h-full rounded-xl relative overflow-hidden min-h-55"
            : "m-0.5 flex flex-col gap-3 p-3.5 cf-panel w-full h-max rounded-xl max-w-60 relative overflow-hidden"
      }
    >
      <div className="relative z-10 flex flex-row justify-between items-center gap-4">
        <label className="uppercase font-inter text-[#F2F3FF] font-semibold text-[10px] tracking-wider">
          Health
        </label>
        <button
          type="button"
          onClick={() => {
            setPrimaryTab("Builds");
            setActiveTab("Configuration");
          }}
          className="capitalize font-inter font-normal text-text-muted text-[10px] cursor-pointer hover:text-text-secondary bg-transparent border-0 p-0"
        >
          {status === "error" && !latest ? "Offline" : "Configure"}
        </button>
      </div>

      <div
        className={
          isCompact
            ? "relative z-10 flex justify-center items-center py-0"
            : isHero
              ? "relative z-10 flex justify-center items-center py-1 flex-1 min-h-25"
              : "relative z-10 flex justify-center items-center py-2"
        }
      >
        <svg
          width={svgSize}
          height={svgSize}
          viewBox="0 0 160 160"
          className="rotate-135"
        >
          <defs>
            <linearGradient
              id="beam-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" className={arcMint} />
              <stop offset="100%" className={arcMint} />
            </linearGradient>
          </defs>
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            className="stroke-white/10"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${gapLength}`}
          />
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="url(#beam-gradient)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={filledOffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pt-2">
          <span className={scoreText}>{latest ? score : "—"}</span>
          <Chip size="sm" variant="soft" color="warning" className="mt-0.5">
            <Chip.Label className="text-[9px]">{rate}</Chip.Label>
          </Chip>
        </div>
      </div>

      {!isCompact && (
      <div
        className={
          isHero
            ? "relative z-10 h-14 cf-panel-inset rounded-lg"
            : "relative z-10 h-18 cf-panel-inset rounded-lg -mx-0.5"
        }
      >
        <ResponsiveLine
          data={lineData}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: 0, max: 12 }}
          enableGridX={false}
          enableGridY={false}
          enablePoints={false}
          axisBottom={null}
          axisLeft={null}
          colors={[
            "var(--color-primary-base)",
            "var(--color-text-muted)",
          ]}
          lineWidth={1.5}
          animate={false}
        />
      </div>
      )}

      <div className={cn("relative z-10 flex flex-col", isCompact ? "gap-1.5" : "gap-2")}>
        <ProgressBar
          value={ramPercent}
          minValue={0}
          maxValue={100}
          className="w-full gap-0.5"
          size="sm"
        >
          <div className="flex justify-between items-center text-[10px] mb-0.5">
            <span className="flex items-center gap-1.5 text-text-secondary/75">
              <MemoryStick size={12} /> RAM
            </span>
            <ProgressBar.Output className="text-text-secondary font-medium text-[10px]">
              {ramLabel}
            </ProgressBar.Output>
          </div>
          <ProgressBar.Track className="cf-panel-inset h-1 rounded-full overflow-hidden">
            <ProgressBar.Fill className="bg-linear-to-r from-primary-muted to-primary-base rounded-full" />
          </ProgressBar.Track>
        </ProgressBar>

        <ProgressBar
          value={cpuUsage}
          minValue={0}
          maxValue={100}
          className="w-full gap-0.5"
          size="sm"
        >
          <div className="flex justify-between items-center text-[10px] mb-0.5">
            <span className="flex items-center gap-1.5 text-text-secondary/75">
              <Cpu size={12} /> CPU
            </span>
            <ProgressBar.Output className="text-text-secondary font-medium text-[10px]">
              {cpuLabel}
            </ProgressBar.Output>
          </div>
          <ProgressBar.Track className="cf-panel-inset h-1 rounded-full overflow-hidden">
            <ProgressBar.Fill className="bg-linear-to-r from-accent-delta to-accent-epsilon rounded-full opacity-80" />
          </ProgressBar.Track>
        </ProgressBar>

        <ProgressBar
          value={diskPercent}
          minValue={0}
          maxValue={100}
          className="w-full gap-0.5"
          size="sm"
        >
          <div className="flex justify-between items-center text-[10px] mb-0.5">
            <span className="flex items-center gap-1.5 text-text-secondary/75">
              <HardDrive size={12} /> Disk
            </span>
            <ProgressBar.Output className="text-text-secondary font-medium text-[10px]">
              {diskLabel}
            </ProgressBar.Output>
          </div>
          <ProgressBar.Track className="cf-panel-inset h-1 rounded-full overflow-hidden">
            <ProgressBar.Fill className="bg-white/35 rounded-full" />
          </ProgressBar.Track>
        </ProgressBar>
      </div>

      <button
        type="button"
        onClick={() => {
          if (!latest || ramTotal <= 0) {
            toast.message("No live metrics yet", {
              description: "Wait for system telemetry, then try again.",
            });
            return;
          }
          const maxGb = Math.max(
            2,
            Math.round(Math.min(ramTotal * 0.55, ramTotal - Math.max(2, ramTotal * 0.15))),
          );
          const minGb = Math.max(2, Math.round(maxGb * 0.5));
          setConfig(activeId, {
            ...config,
            memoryMinGb: minGb,
            memoryMaxGb: maxGb,
          });
          toast.success("RAM optimized", {
            description: `${minGb}–${maxGb} GB for this build`,
          });
        }}
        className={
          isCompact
            ? "relative z-10 w-full flex items-center justify-center gap-1 cf-panel-inset hover:bg-white/6 text-text-secondary py-1.5 rounded-lg text-[9px] font-semibold group cursor-pointer border border-white/8 active:scale-95"
            : isHero
              ? "relative z-10 w-full flex items-center justify-center gap-1.5 cf-panel-inset hover:bg-white/6 text-text-secondary py-2 rounded-lg text-[10px] font-semibold group cursor-pointer border border-white/8 active:scale-95"
              : "relative z-10 mt-1 w-full flex items-center justify-center gap-2 cf-panel-inset hover:bg-white/6 text-text-secondary py-3 rounded-lg text-xs font-semibold group cursor-pointer border border-white/8 active:scale-95"
        }
      >
        <Zap
          size={isCompact ? 12 : isHero ? 14 : 16}
          className="text-text-secondary group-hover:scale-110 transition-transform"
        />
        OPTIMIZE
      </button>
    </div>
  );
}
