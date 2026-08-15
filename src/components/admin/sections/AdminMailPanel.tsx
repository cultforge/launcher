import { useMemo } from "react";
import { useAdminSectionPanel } from "../../../hooks/useAdminSectionPanel";
import { AdminActionDialog } from "../shared/AdminActionDialog";
import { AdminGlobalActions } from "../shared/AdminGlobalActions";
import { AdminPageHeader } from "../shared/AdminPageHeader";

export function AdminMailPanel() {
  const panel = useAdminSectionPanel("mail");

  const sendAction = useMemo(
    () => panel.globalActions.find((a) => a.entry.path === "/v1/admin/mail") ?? panel.globalActions[0],
    [panel.globalActions],
  );

  return (
    <div>
      <AdminPageHeader
        breadcrumb="Staff console / Mail"
        title="Mail"
        subtitle="Send transactional emails to users by ID or email address."
        actions={
          <AdminGlobalActions
            actions={panel.globalActions}
            onAction={panel.openGlobalAction}
          />
        }
      />

      <div className="cf-panel rounded-xl border border-white/10 p-8 max-w-xl">
        <h3 className="font-sora text-[15px] font-semibold text-text-primary">
          Send email
        </h3>
        <p className="mt-2 text-[12px] text-text-muted leading-relaxed">
          CultForge admin mail sends plain-text transactional messages. The
          recipient can be a user ID or a direct email address. Delivery status
          is logged to the audit trail.
        </p>
        {sendAction ? (
          <button
            type="button"
            onClick={() => panel.openGlobalAction(sendAction)}
            className="cf-btn-primary mt-5 rounded-lg px-5 py-2.5 text-[11px] font-semibold cursor-pointer"
          >
            Compose email
          </button>
        ) : (
          <p className="mt-4 text-[12px] text-state-warning">
            Mail send endpoint not found in staff catalog.
          </p>
        )}
      </div>

      <AdminActionDialog
        open={Boolean(panel.pendingAction)}
        action={panel.pendingAction}
        row={panel.actionRow}
        onClose={panel.closeAction}
        onSuccess={() => panel.closeAction()}
      />
    </div>
  );
}
