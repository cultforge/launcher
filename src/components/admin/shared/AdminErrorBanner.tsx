type Props = {
  message: string;
  onRetry?: () => void;
};

export function AdminErrorBanner({ message, onRetry }: Props) {
  return (
    <div className="rounded-xl border border-state-error/30 bg-state-error/8 px-4 py-3 flex items-center gap-3">
      <p className="flex-1 text-[12px] text-state-error">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-secondary hover:text-white cursor-pointer"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
