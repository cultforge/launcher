type Props = {
  title: string;
  description?: string;
  compact?: boolean;
};

export function AdminEmptyState({ title, description, compact }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-8" : "py-14"
      }`}
    >
      <div className="text-[12px] font-medium text-text-secondary">{title}</div>
      {description ? (
        <p className="mt-1 max-w-sm text-[10px] text-text-muted">{description}</p>
      ) : null}
    </div>
  );
}
