import { useState } from "react";
import { ModalShell } from "./ModalShell";
import { useAdminSessionStore } from "../../stores/adminSession";
import { useAppStore } from "../../userstore";

type AdminStepUpModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

function formatSessionAge(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return "unknown";
  if (minutes < 1) return "under a minute";
  return `${minutes.toFixed(minutes < 10 ? 1 : 0)} min`;
}

export function AdminStepUpModal({
  open,
  onClose,
  onSuccess,
}: AdminStepUpModalProps) {
  const stepUp = useAdminSessionStore((s) => s.stepUp);
  const stepUpError = useAdminSessionStore((s) => s.stepUpError);
  const stepUpHints = useAdminSessionStore((s) => s.stepUpHints);
  const refreshWhoami = useAdminSessionStore((s) => s.refreshWhoami);
  const signOut = useAppStore((s) => s.signOut);
  const [busy, setBusy] = useState(false);

  const maxMinutes = stepUpHints?.stepUpSessionMaxMinutes ?? 10;
  const sessionAge = stepUpHints?.sessionAgeMinutes ?? null;
  const sessionFreshEnough = stepUpHints?.sessionFreshEnough ?? false;

  const onConfirm = async () => {
    setBusy(true);
    try {
      const ok = await stepUp();
      if (ok) onSuccess();
    } finally {
      setBusy(false);
    }
  };

  const onSignOutAndRetry = async () => {
    setBusy(true);
    try {
      await signOut();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} title="Platform admin step-up">
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-text-muted leading-relaxed">
          Confirm with your current OAuth session to unlock mutating admin tools.
          The capability token stays in the sidecar only (~15 minutes).
        </p>

        {stepUpHints ? (
          <div className="rounded-lg border border-border-subtle bg-black/20 px-3 py-2.5 text-[12px] text-text-secondary">
            <div>
              Session age:{" "}
              <span className="text-text-primary">
                {formatSessionAge(sessionAge)}
              </span>
              {" · "}
              limit: {maxMinutes} min
            </div>
            {stepUpHints.stepUpMethod ? (
              <div className="mt-1 text-[11px] text-text-muted">
                Step-up method: {stepUpHints.stepUpMethod}
              </div>
            ) : null}
          </div>
        ) : null}

        {!sessionFreshEnough ? (
          <div className="rounded-lg border border-state-warning/30 bg-state-warning/10 px-3 py-2 text-[12px] text-state-warning leading-relaxed">
            Your session is too old for admin step-up. Sign out, sign in again
            with Google or GitHub, then open Admin and confirm right away.
          </div>
        ) : null}

        {stepUpError ? (
          <div className="rounded-lg border border-state-danger/30 bg-state-danger/10 px-3 py-2 text-[12px] text-state-danger leading-relaxed">
            {stepUpError}
            <p className="mt-2 text-[11px] text-state-warning">
              If step-up keeps failing, sign out, sign in via OAuth again, then
              try Admin immediately.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          disabled={busy || !sessionFreshEnough}
          onClick={() => void onConfirm()}
          className="w-full rounded-lg border border-primary-base/35 bg-primary-base/12 px-3 py-2.5 text-[12px] font-semibold text-primary-base hover:bg-primary-base/18 disabled:opacity-50"
        >
          {busy ? "Confirming…" : "Confirm with current session"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void onSignOutAndRetry()}
          className="w-full rounded-lg border border-border-subtle px-3 py-2 text-[12px] text-text-muted hover:text-text-secondary hover:border-white/20 disabled:opacity-50"
        >
          Sign out and sign in again
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void refreshWhoami()}
          className="text-[11px] text-text-disabled hover:text-text-muted self-center"
        >
          Refresh session status
        </button>
      </div>
    </ModalShell>
  );
}
