import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type SpotlightCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** @deprecated unused — kept for call-site compatibility */
  spotlightColor?: string;
};

/** Matte panel wrapper (spotlight gloss removed). */
export function SpotlightCard({
  children,
  className,
  spotlightColor: _spotlightColor,
  ...props
}: SpotlightCardProps) {
  return (
    <div className={cn("relative", className)} {...props}>
      {children}
    </div>
  );
}
