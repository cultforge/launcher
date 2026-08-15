type Kpi = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "success" | "warning" | "danger";
};

type Props = {
  items: Kpi[];
};

export function AdminSummaryStrip({ items }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      {items.map((item) => {
        const accentBorder =
          item.accent === "success"
            ? "border-state-success/25"
            : item.accent === "warning"
              ? "border-state-warning/25"
              : item.accent === "danger"
                ? "border-state-error/25"
                : "border-white/10";

        return (
          <div
            key={item.label}
            className={`cf-panel rounded-xl border ${accentBorder} px-4 py-3`}
          >
            <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
              {item.label}
            </div>
            <div className="mt-1 font-sora text-[20px] font-bold text-text-primary leading-none tabular-nums">
              {item.value}
            </div>
            {item.hint ? (
              <div className="mt-1 text-[10px] text-text-muted">{item.hint}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
