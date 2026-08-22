import { formatGb, type TelemetrySample, type TelemetryView } from "../../../lib/cultAgentTelemetry";

function pct(
  used: number | null,
  total: number | null,
  fallback: number | null,
): number | null {
  if (used != null && total && total > 0) {
    return Math.min(100, Math.max(0, (used / total) * 100));
  }
  if (fallback != null) return Math.min(100, Math.max(0, fallback));
  return null;
}

function Meter({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | null;
  detail?: string;
}) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="flex-1 min-w-36">
      <div className="flex justify-between gap-2 text-[10px] text-text-muted mb-1.5">
        <span>{label}</span>
        <span className="tabular-nums text-text-secondary">
          {detail ?? (value == null ? "—" : `${Math.round(v)}%`)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/8 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary-base"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

function Sparkline({
  title,
  series,
}: {
  title: string;
  series: { name: string; values: number[] }[];
}) {
  const ready = series.filter((s) => s.values.length >= 2);
  if (!ready.length) return null;

  const w = 360;
  const h = 88;
  const pad = 6;

  return (
    <div className="cf-panel rounded-xl border border-white/8 bg-black/25 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
        {title}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24">
        {ready.map((s, si) => {
          const pts = s.values.map((n, i) => {
            const x = pad + (i / Math.max(s.values.length - 1, 1)) * (w - pad * 2);
            const y = pad + (1 - Math.min(100, Math.max(0, n)) / 100) * (h - pad * 2);
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          });
          return (
            <path
              key={s.name}
              d={pts.join(" ")}
              fill="none"
              stroke={
                si === 0
                  ? "var(--color-primary-base)"
                  : "var(--color-state-info, #7dd3fc)"
              }
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="mt-1 flex gap-3 text-[10px] text-text-muted">
        {ready.map((s, si) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background:
                  si === 0
                    ? "var(--color-primary-base)"
                    : "var(--color-state-info, #7dd3fc)",
              }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

type Props = {
  view: TelemetryView;
  history: TelemetrySample[];
};

export function TelemetryCharts({ view, history }: Props) {
  const ramPct = pct(view.ramUsedGb, view.ramTotalGb, view.ramPct);
  const diskPct = pct(view.diskUsedGb, view.diskTotalGb, view.diskPct);
  const ramDetail =
    view.ramUsedGb != null
      ? `${formatGb(view.ramUsedGb)} / ${formatGb(view.ramTotalGb)}`
      : ramPct != null
        ? `${Math.round(ramPct)}%`
        : undefined;
  const diskDetail =
    view.diskUsedGb != null
      ? `${formatGb(view.diskUsedGb)} / ${formatGb(view.diskTotalGb)}`
      : diskPct != null
        ? `${Math.round(diskPct)}%`
        : undefined;

  const cpuSeries = history
    .map((s) => s.cpuPct)
    .filter((n): n is number => n != null);
  const ramSeries = history
    .map((s) => pct(s.ramUsedGb, s.ramTotalGb, s.ramPct))
    .filter((n): n is number => n != null);

  return (
    <div className="flex flex-col gap-3">
      <div className="cf-panel rounded-xl border border-white/8 bg-black/25 px-4 py-4 flex flex-col gap-4">
        <Meter
          label="CPU"
          value={view.cpuPct}
          detail={view.cpuPct != null ? `${Math.round(view.cpuPct)}%` : undefined}
        />
        <Meter label="RAM" value={ramPct} detail={ramDetail} />
        <Meter label="Disk" value={diskPct} detail={diskDetail} />
      </div>
      <Sparkline
        title="Last few minutes"
        series={[
          { name: "CPU", values: cpuSeries },
          { name: "RAM", values: ramSeries },
        ]}
      />
    </div>
  );
}
