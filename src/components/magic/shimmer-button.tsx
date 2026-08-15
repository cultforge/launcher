import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type ShimmerButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  shimmerColor?: string;
  background?: string;
};

export function ShimmerButton({
  children,
  className,
  shimmerColor = "var(--color-primary-soft)",
  background = "color-mix(in srgb, var(--color-primary-base) 12%, transparent)",
  ...props
}: ShimmerButtonProps) {
  return (
    <button
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-lg border border-primary-base/30 px-4 py-2 text-primary-soft font-semibold cursor-pointer transition-transform active:scale-95",
        className,
      )}
      style={{
        background,
        backgroundImage: `linear-gradient(110deg, transparent 25%, color-mix(in srgb, ${shimmerColor} 20%, transparent) 50%, transparent 75%)`,
        backgroundSize: "200% 100%",
        animation: "cf-shimmer 2.4s linear infinite",
      }}
      {...props}
    >
      {children}
    </button>
  );
}
