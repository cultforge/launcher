import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AdminChartCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: Props) {
  return (
    <div className={`cf-panel rounded-xl border border-white/10 p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-sora text-[13px] font-semibold text-text-primary">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 text-[10px] text-text-muted">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="min-h-[180px]">{children}</div>
    </div>
  );
}
