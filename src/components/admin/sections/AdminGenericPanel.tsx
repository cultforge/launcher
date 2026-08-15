import { dynamicSectionMeta } from "../../../lib/adminCatalog";
import { useAdminSectionPanel } from "../../../hooks/useAdminSectionPanel";
import { inferColumns } from "../../../lib/adminParse";
import { AdminActionDialog } from "../shared/AdminActionDialog";
import { AdminEntityDrawer } from "../shared/AdminEntityDrawer";
import { AdminErrorBanner } from "../shared/AdminErrorBanner";
import { AdminFilterBar } from "../shared/AdminFilterBar";
import { AdminGlobalActions } from "../shared/AdminGlobalActions";
import { AdminLoadingSkeleton } from "../shared/AdminLoadingSkeleton";
import { AdminPageHeader } from "../shared/AdminPageHeader";
import { AdminRecordTable } from "../shared/AdminRecordTable";
import { AdminSummaryStrip } from "../shared/AdminSummaryStrip";

type Props = {
  sectionId: string;
};

export function AdminGenericPanel({ sectionId }: Props) {
  const meta = dynamicSectionMeta(sectionId);
  const panel = useAdminSectionPanel(sectionId);

  const columns =
    panel.columns.length > 0
      ? panel.columns
      : inferColumns(panel.rows).map((id) => ({
          id,
          label: id.replace(/_/g, " "),
          sortable: true,
        }));

  const title = meta?.label ?? sectionId;

  return (
    <div>
      <AdminPageHeader
        breadcrumb={`Staff console / ${title}`}
        title={title}
        subtitle={`Manage ${title.toLowerCase()} records. Use setup actions above or row menus to make changes.`}
        actions={
          <AdminGlobalActions
            actions={panel.globalActions}
            onAction={panel.openGlobalAction}
          />
        }
      />

      <AdminSummaryStrip items={[{ label: "Records", value: panel.rows.length }]} />

      <AdminFilterBar
        search={panel.search}
        onSearchChange={panel.setSearch}
        searchPlaceholder={`Search ${title.toLowerCase()}…`}
      />

      {panel.error ? (
        <AdminErrorBanner message={panel.error} onRetry={() => void panel.refetch()} />
      ) : panel.loading ? (
        <AdminLoadingSkeleton />
      ) : (
        <AdminRecordTable
          rows={panel.rows}
          columns={columns}
          sectionId={sectionId}
          actions={panel.rowActions}
          onRowClick={panel.openDrawer}
          onAction={panel.openAction}
        />
      )}

      <AdminEntityDrawer
        open={panel.drawerOpen}
        record={panel.selectedRow}
        detail={panel.detail}
        actions={panel.rowActions}
        onAction={panel.openAction}
        onClose={() => panel.setDrawerOpen(false)}
      />

      <AdminActionDialog
        open={Boolean(panel.pendingAction)}
        action={panel.pendingAction}
        row={panel.actionRow}
        onClose={panel.closeAction}
        onSuccess={() => void panel.refetch()}
      />
    </div>
  );
}
