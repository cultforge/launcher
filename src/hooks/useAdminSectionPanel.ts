import { useMemo, useState } from "react";
import type { AdminSectionId } from "../lib/adminCatalog";
import {
  entriesForSection,
  pickDetailEndpoint,
  pickListEndpoint,
  rowIdFromRecord,
} from "../lib/adminCatalog";
import { extractRows } from "../lib/adminParse";
import {
  buildActionsFromCatalog,
  findRowUpdateAction,
  splitActions,
  type AdminAction,
} from "../lib/adminActionRegistry";
import { columnsForSection } from "../lib/adminColumnRegistry";
import { useAdminQuery } from "./useAdminQuery";
import { useAdminSessionStore } from "../stores/adminSession";
import { adminGetDetail } from "../lib/adminApi";

export function useAdminSectionPanel(sectionId: AdminSectionId | string) {
  const groupedCatalog = useAdminSessionStore((s) => s.groupedCatalog);
  const entries = groupedCatalog
    ? entriesForSection(groupedCatalog, sectionId)
    : [];

  const listEndpoint = useMemo(
    () => pickListEndpoint(sectionId, entries),
    [sectionId, entries],
  );
  const detailEndpoint = useMemo(
    () => pickDetailEndpoint(entries),
    [entries],
  );
  const allActions = useMemo(
    () => buildActionsFromCatalog(sectionId, entries),
    [sectionId, entries],
  );
  const { rowActions, globalActions } = useMemo(
    () => splitActions(allActions),
    [allActions],
  );
  const columns = useMemo(
    () => columnsForSection(sectionId as AdminSectionId),
    [sectionId],
  );

  const { data, error, loading, refetch } = useAdminQuery({
    path: listEndpoint?.path ?? null,
    enabled: Boolean(listEndpoint),
  });

  const rows = useMemo(() => extractRows(data), [data]);

  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(
    null,
  );
  const [detail, setDetail] = useState<unknown>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<AdminAction | null>(null);
  const [actionRow, setActionRow] = useState<Record<string, unknown> | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const openDrawer = async (row: Record<string, unknown>) => {
    if (sectionId === "rate-limits") {
      const updateAction = findRowUpdateAction(rowActions, row);
      if (updateAction) {
        openAction(updateAction, row);
        return;
      }
    }

    setSelectedRow(row);
    setDetail(null);
    setDrawerOpen(true);

    if (!detailEndpoint) return;
    const id = rowIdFromRecord(row);
    if (!id) return;
    const paramKey = detailEndpoint.path.match(/\{(\w+)\}/)?.[1] ?? "id";
    try {
      const d = await adminGetDetail(detailEndpoint.path, { [paramKey]: id });
      setDetail(d);
    } catch {
      /* optional */
    }
  };

  const openAction = (action: AdminAction, row: Record<string, unknown>) => {
    setPendingAction(action);
    setActionRow(row);
  };

  const openGlobalAction = (action: AdminAction) => {
    setPendingAction(action);
    setActionRow(null);
  };

  const closeAction = () => {
    setPendingAction(null);
    setActionRow(null);
  };

  return {
    sectionId,
    entries,
    listEndpoint,
    rows,
    columns,
    allActions,
    rowActions,
    globalActions,
    error,
    loading,
    refetch,
    search,
    setSearch,
    filter,
    setFilter,
    selectedRow,
    detail,
    drawerOpen,
    setDrawerOpen,
    openDrawer,
    pendingAction,
    actionRow,
    openAction,
    openGlobalAction,
    closeAction,
  };
}
