import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type GlareCardProps = {
  children: ReactNode;
  className?: string;
};

/** Matte card wrapper (specular glare removed). */
export function GlareCard({ children, className }: GlareCardProps) {
  return <div className={cn("relative", className)}>{children}</div>;
}
