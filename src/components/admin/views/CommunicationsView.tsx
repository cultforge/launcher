import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AdminClient,
  extractAdminRows,
  isAdminCapabilityError,
} from "../../../lib/adminClient";
import { useAdminSessionStore } from "../../../stores/adminSession";
import {
  OpsButton,
  OpsEmpty,
  OpsError,
  OpsInput,
  OpsPageHeader,
  OpsTable,
  OpsTextarea,
  OpsToolbar,
  type OpsColumn,
} from "../ui/ops";

type NotifRow = Record<string, unknown> & { id: string };

export function CommunicationsView() {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [notifUser, setNotifUser] = useState("");

  const [mailTo, setMailTo] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const raw = await AdminClient.listNotificationsRecent();
      setRows(
        extractAdminRows(raw).map((r, i) => ({
          ...r,
          id: String(r.id ?? `${r.created_at ?? i}`),
        })) as NotifRow[],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sendNotif = async () => {
    if (!capabilityActive) {
      toast.error("Step up required");
      return;
    }
    setBusy(true);
    try {
      await AdminClient.sendNotification({
        title: notifTitle,
        kind: "admin.notice",
        body: notifBody,
        ...(notifUser.trim()
          ? { user_ids: [notifUser.trim()] }
          : { all_active: true }),
      });
      toast.success("Notification sent");
      setNotifTitle("");
      setNotifBody("");
      await load();
    } catch (err) {
      if (isAdminCapabilityError(err)) handleUnauthorized();
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const sendMail = async () => {
    if (!capabilityActive) {
      toast.error("Step up required");
      return;
    }
    setBusy(true);
    try {
      await AdminClient.sendMail({
        to: mailTo,
        subject: mailSubject,
        body_text: mailBody,
      });
      toast.success("Mail queued");
      setMailTo("");
      setMailSubject("");
      setMailBody("");
    } catch (err) {
      if (isAdminCapabilityError(err)) handleUnauthorized();
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const columns: OpsColumn<NotifRow>[] = [
    {
      key: "when",
      header: "When",
      render: (r) => (
        <span className="font-mono text-[10px]">
          {String(r.created_at ?? r.ts ?? "—")}
        </span>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (r) => String(r.title ?? r.subject ?? "—"),
    },
    {
      key: "target",
      header: "Target",
      render: (r) => (
        <span className="font-mono text-[10px]">
          {String(r.user_id ?? r.target ?? "broadcast")}
        </span>
      ),
    },
  ];

  return (
    <div>
      <OpsPageHeader
        title="Communications"
        subtitle="Recent notifications plus send notification / mail."
        actions={
          <OpsButton onClick={() => void load()}>Reload</OpsButton>
        }
      />
      {error ? <OpsError message={error} onRetry={() => void load()} /> : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Send notification
          </div>
          <p className="text-[11px] text-text-disabled">
            Leave recipient empty to broadcast to all active users.
          </p>
          <OpsInput
            placeholder="Title"
            value={notifTitle}
            onChange={(e) => setNotifTitle(e.target.value)}
            className="w-full"
          />
          <OpsInput
            placeholder="Recipient username or user id (optional)"
            value={notifUser}
            onChange={(e) => setNotifUser(e.target.value)}
            className="w-full"
          />
          <OpsTextarea
            placeholder="Message body"
            value={notifBody}
            onChange={(e) => setNotifBody(e.target.value)}
            rows={4}
            className="w-full"
          />
          <OpsButton
            variant="primary"
            disabled={!capabilityActive || busy || !notifTitle}
            onClick={() => void sendNotif()}
          >
            Send notification
          </OpsButton>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Send mail
          </div>
          <OpsInput
            placeholder="To"
            value={mailTo}
            onChange={(e) => setMailTo(e.target.value)}
            className="w-full"
          />
          <OpsInput
            placeholder="Subject"
            value={mailSubject}
            onChange={(e) => setMailSubject(e.target.value)}
            className="w-full"
          />
          <OpsTextarea
            placeholder="Body"
            value={mailBody}
            onChange={(e) => setMailBody(e.target.value)}
            rows={3}
            className="w-full"
          />
          <OpsButton
            variant="primary"
            disabled={!capabilityActive || busy || !mailTo || !mailSubject}
            onClick={() => void sendMail()}
          >
            Send mail
          </OpsButton>
        </div>
      </div>

      <OpsToolbar>
        <span className="text-[11px] text-text-muted">Recent notifications</span>
      </OpsToolbar>
      {rows.length ? (
        <OpsTable columns={columns} rows={rows} empty="None" />
      ) : (
        <OpsEmpty title="No recent notifications" />
      )}
    </div>
  );
}
