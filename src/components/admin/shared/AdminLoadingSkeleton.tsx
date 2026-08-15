type Props = {
  rows?: number;
};

export function AdminLoadingSkeleton({ rows = 5 }: Props) {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-lg bg-white/5 border border-white/5"
        />
      ))}
    </div>
  );
}
