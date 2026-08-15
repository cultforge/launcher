type Props = {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
  accent?: "default" | "success" | "warning";
};

export function AdminStatCard({ label, value, hint, onClick, accent = "default" }: Props) {
  const accentClass =
    accent === "success"
      ? "border-state-success/25"
      : accent === "warning"
        ? "border-state-warning/25"
        : "border-white/10";

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`cf-panel rounded-xl border ${accentClass} p-4 text-left ${
        onClick ? "cursor-pointer hover:border-primary-base/30 transition-colors" : ""
      }`}
    >
      <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className="mt-1 font-sora text-[22px] font-bold text-text-primary leading-none">
        {value}
      </div>
      {hint ? (
        <div className="mt-1.5 text-[10px] text-text-muted">{hint}</div>
      ) : null}
    </Tag>
  );
}
