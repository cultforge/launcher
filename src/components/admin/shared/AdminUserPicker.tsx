import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { entriesForSection, pickListEndpoint } from "../../../lib/adminCatalog";
import { extractRows } from "../../../lib/adminParse";
import { userDisplayName } from "../../../lib/adminFormatters";
import { adminRequest } from "../../../lib/adminApi";
import { useAdminSessionStore } from "../../../stores/adminSession";

type Props = {
  value: string;
  onChange: (value: string) => void;
  multiple?: boolean;
  placeholder?: string;
  allowManual?: boolean;
};

export function AdminUserPicker({
  value,
  onChange,
  multiple = false,
  placeholder = "Search users…",
  allowManual = true,
}: Props) {
  const groupedCatalog = useAdminSessionStore((s) => s.groupedCatalog);
  const usersEndpoint = useMemo(() => {
    if (!groupedCatalog) return null;
    const entries = entriesForSection(groupedCatalog, "users");
    return pickListEndpoint("users", entries);
  }, [groupedCatalog]);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const fetchUsers = useCallback(async () => {
    if (!usersEndpoint?.path) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const q = debouncedQuery;
      const result = await adminRequest({
        method: "GET",
        path: usersEndpoint.path,
        query: q ? { q, limit: "30" } : { limit: "30" },
      });
      if (id !== requestId.current) return;
      setUsers(extractRows(result));
    } catch {
      if (id !== requestId.current) return;
      setUsers([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [usersEndpoint?.path, debouncedQuery]);

  useEffect(() => {
    if (open || !allowManual) void fetchUsers();
  }, [fetchUsers, open, allowManual]);

  const selectedIds = useMemo(
    () => value.split(",").map((s) => s.trim()).filter(Boolean),
    [value],
  );

  const toggleUser = (id: string) => {
    if (multiple) {
      const set = new Set(selectedIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      onChange([...set].join(","));
    } else {
      onChange(id);
      setOpen(false);
      setQuery("");
    }
  };

  const selectedLabels = useMemo(() => {
    return selectedIds.map((id) => {
      const u = users.find((r) => String(r.id) === id);
      return u ? userDisplayName(u) : id;
    });
  }, [selectedIds, users]);

  if (allowManual && !multiple) {
    return (
      <div className="mt-1.5 flex flex-col gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] text-text-primary outline-none focus:border-primary-base/40"
        />
        <details className="text-[10px] text-text-muted" onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open) setOpen(true);
        }}>
          <summary className="cursor-pointer hover:text-text-secondary">
            Or pick from user list
          </summary>
          <UserList
            filtered={users}
            loading={loading}
            query={query}
            onQueryChange={setQuery}
            selectedIds={selectedIds}
            onToggle={toggleUser}
            multiple={multiple}
          />
        </details>
      </div>
    );
  }

  return (
    <div className="mt-1.5 relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) void fetchUsers();
        }}
        className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-left text-[12px] text-text-primary outline-none focus:border-primary-base/40"
      >
        {selectedLabels.length ? selectedLabels.join(", ") : placeholder}
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/12 bg-[#0d0d0f] shadow-xl max-h-56 overflow-hidden">
          <UserList
            filtered={users}
            loading={loading}
            query={query}
            onQueryChange={setQuery}
            selectedIds={selectedIds}
            onToggle={toggleUser}
            multiple={multiple}
          />
        </div>
      ) : null}
    </div>
  );
}

function UserList({
  filtered,
  loading,
  query,
  onQueryChange,
  selectedIds,
  onToggle,
  multiple,
}: {
  filtered: Record<string, unknown>[];
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  selectedIds: string[];
  onToggle: (id: string) => void;
  multiple: boolean;
}) {
  return (
    <div className="p-2">
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search by username, email, or ID…"
        className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-text-primary outline-none mb-2"
        autoFocus
      />
      <div className="max-h-40 overflow-y-auto scroll-hidden">
        {loading ? (
          <p className="px-2 py-3 text-[11px] text-text-muted">Searching users…</p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-text-muted">
            {query.trim() ? "No users match your search" : "Type to search users"}
          </p>
        ) : (
          filtered.map((u) => {
            const id = String(u.id ?? "");
            const selected = selectedIds.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggle(id)}
                className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] cursor-pointer ${
                  selected ? "bg-primary-base/15 text-primary-base" : "hover:bg-white/6 text-text-secondary"
                }`}
              >
                {multiple ? (
                  <span className={`w-3.5 h-3.5 rounded border shrink-0 ${selected ? "bg-primary-base border-primary-base" : "border-white/20"}`} />
                ) : null}
                <span className="truncate">
                  {userDisplayName(u)}
                  {u.username ? (
                    <span className="text-text-muted ml-1">@{String(u.username)}</span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
