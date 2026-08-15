import { cn } from "../../lib/cn";

type TextShimmerProps = {
  children: string;
  className?: string;
};

export function TextShimmer({ children, className }: TextShimmerProps) {
  return (
    <span
      className={cn(
        "inline-block bg-clip-text text-transparent bg-size-[200%_100%] animate-[cf-shimmer_3s_linear_infinite]",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--color-text-muted) 0%, var(--color-text-primary) 40%, var(--color-primary-base) 50%, var(--color-text-primary) 60%, var(--color-text-muted) 100%)",
      }}
    >
      {children}
    </span>
  );
}
