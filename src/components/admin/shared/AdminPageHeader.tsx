import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  actions?: ReactNode;
};

export function AdminPageHeader({ title, subtitle, breadcrumb, actions }: Props) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        {breadcrumb ? (
          <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted mb-1">
            {breadcrumb}
          </div>
        ) : null}
        <h2 className="font-sora text-[17px] font-bold text-text-primary tracking-tight">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-[12px] text-text-muted max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
