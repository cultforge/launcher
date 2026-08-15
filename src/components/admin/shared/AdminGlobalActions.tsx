import type { AdminAction } from "../../../lib/adminActionRegistry";
import { useAdminSessionStore } from "../../../stores/adminSession";

type Props = {
  actions: AdminAction[];
  onAction: (action: AdminAction) => void;
};

export function AdminGlobalActions({ actions, onAction }: Props) {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);

  if (!actions.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={!capabilityActive}
          title={
            capabilityActive
              ? action.description
              : "Step up to unlock admin actions"
          }
          onClick={() => onAction(action)}
          className={`rounded-lg px-3.5 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            action.severity === "danger"
              ? "border border-state-error/35 text-state-error hover:bg-state-error/10"
              : action.severity === "warning"
                ? "border border-state-warning/35 text-state-warning hover:bg-state-warning/10"
                : "cf-btn-primary"
          }`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
