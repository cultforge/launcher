import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AdminClient,
  extractAdminRows,
  isAdminCapabilityError,
  unwrapAdminData,
} from "../../../lib/adminClient";
import { useAdminSessionStore } from "../../../stores/adminSession";
import {
  OpsButton,
  OpsConfirmDialog,
  OpsDrawer,
  OpsEmpty,
  OpsError,
  OpsInput,
  OpsPageHeader,
  OpsTable,
  OpsToolbar,
  OpsStatusPill,
  type OpsColumn,
} from "../ui/ops";

type GuildRow = Record<string, unknown> & { id: string };

export function GuildsView() {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<GuildRow[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    title: string;
    body: string;
    confirmText: string;
    run: () => Promise<void>;
  }>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const raw = await AdminClient.listGuilds({ q, limit: 100 });
      setRows(
        extractAdminRows(raw).map((r) => ({
          ...r,
          id: String(r.id ?? r.guild_id ?? ""),
        })) as GuildRow[],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load guilds");
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    setDetailId(id);
    try {
      const raw = await AdminClient.getGuild(id);
      const data = unwrapAdminData(raw);
      setDetail(
        (data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : { id }) ?? { id },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    if (!capabilityActive) {
      toast.error("Step up required");
      return;
    }
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      setConfirm(null);
      await load();
      if (detailId) await open(detailId);
    } catch (err) {
      if (isAdminCapabilityError(err)) handleUnauthorized();
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const columns: OpsColumn<GuildRow>[] = [
    {
      key: "name",
      header: "Guild",
      render: (r) => (
        <div>
          <div className="font-medium text-text-primary">
            {String(r.name ?? r.slug ?? r.id)}
          </div>
          <div className="font-mono text-[10px] text-text-disabled">{r.id}</div>
        </div>
      ),
    },
    {
      key: "listed",
      header: "Listed",
      render: (r) =>
        r.is_listed === false ? (
          <OpsStatusPill state="warn" label="Unlisted" />
        ) : (
          <OpsStatusPill state="ok" label="Listed" />
        ),
    },
  ];

  return (
    <div>
      <OpsPageHeader
        title="Guilds"
        subtitle="Search guilds, inspect detail, unlist or flip listing flags."
      />
      <OpsToolbar>
        <OpsInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search guilds"
          className="w-52"
          onKeyDown={(e) => e.key === "Enter" && void load()}
        />
        <OpsButton variant="primary" onClick={() => void load()}>
          Search
        </OpsButton>
      </OpsToolbar>
      {error ? <OpsError message={error} onRetry={() => void load()} /> : null}
      <OpsTable
        columns={columns}
        rows={rows.filter((r) => r.id)}
        onRowClick={(r) => void open(r.id)}
        empty="No guilds"
      />
      <OpsDrawer
        open={Boolean(detailId)}
        title="Guild detail"
        onClose={() => {
          setDetailId(null);
          setDetail(null);
        }}
      >
        {!detail ? (
          <OpsEmpty title="Loading…" />
        ) : (
          <div className="space-y-3">
            <div className="font-sora text-[15px] font-bold">
              {String(detail.name ?? detailId)}
            </div>
            <div className="font-mono text-[11px] text-text-muted">{detailId}</div>
            <div className="flex flex-wrap gap-2">
              <OpsButton
                variant="danger"
                disabled={!capabilityActive}
                onClick={() =>
                  setConfirm({
                    title: "Unlist guild",
                    body: "Force-unlist this guild from discovery.",
                    confirmText: "unlist",
                    run: () =>
                      run(() => AdminClient.unlistGuild(detailId!), "Unlisted"),
                  })
                }
              >
                Unlist
              </OpsButton>
              <OpsButton
                disabled={!capabilityActive}
                onClick={() =>
                  void run(
                    () =>
                      AdminClient.setGuildFlags(detailId!, {
                        is_listed: true,
                      }),
                    "Listed",
                  )
                }
              >
                Set listed
              </OpsButton>
              <OpsButton
                disabled={!capabilityActive}
                onClick={() =>
                  void run(
                    () =>
                      AdminClient.setGuildFlags(detailId!, {
                        is_listed: false,
                      }),
                    "Unlisted flag",
                  )
                }
              >
                Set unlisted
              </OpsButton>
            </div>
          </div>
        )}
      </OpsDrawer>
      <OpsConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        body={confirm?.body ?? ""}
        confirmText={confirm?.confirmText}
        danger
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void confirm?.run()}
      />
    </div>
  );
}
