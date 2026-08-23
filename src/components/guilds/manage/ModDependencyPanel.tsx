import { useEffect, useMemo, useState } from "react";
import { getModrinthProject, getModrinthVersion } from "../../../lib/modrinth";
import type { ModrinthPickWithOptional } from "./ModrinthCatalogPicker";
import { cn } from "../../../lib/cn";

type DepNode = {
  id: string;
  label: string;
  version?: string;
  requiredBy: string[];
  missing: boolean;
  conflict?: string;
};

type Props = {
  selected: ModrinthPickWithOptional[];
  gameVersion?: string;
  loader?: string;
  className?: string;
};

export function ModDependencyPanel({
  selected,
  gameVersion,
  loader,
  className,
}: Props) {
  const [nodes, setNodes] = useState<DepNode[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => selected.map((s) => s.projectId).sort().join(","),
    [selected],
  );

  useEffect(() => {
    if (selected.length === 0) {
      setNodes([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);

    void (async () => {
      const byId = new Map<string, ModrinthPickWithOptional>();
      for (const row of selected) byId.set(row.projectId, row);

      const required = new Map<string, { label: string; requiredBy: Set<string> }>();
      const conflicts: Array<{ mod: string; dep: string; reason: string }> = [];

      for (const pick of selected) {
        try {
          const version = await getModrinthVersion(pick.versionId);
          for (const dep of version.dependencies ?? []) {
            const depId = dep.project_id?.trim();
            if (!depId) continue;
            if (dep.dependency_type === "incompatible") {
              conflicts.push({
                mod: pick.name,
                dep: depId,
                reason: "incompatible",
              });
              continue;
            }
            if (dep.dependency_type !== "required") continue;
            const hit = required.get(depId) ?? {
              label: depId,
              requiredBy: new Set<string>(),
            };
            hit.requiredBy.add(pick.name);
            required.set(depId, hit);
          }
        } catch {
          /* skip broken version row */
        }
      }

      const resolved: DepNode[] = [];
      for (const [depId, meta] of required) {
        let label = meta.label;
        try {
          const project = await getModrinthProject(depId);
          label = project.title || project.slug || depId;
        } catch {
          /* keep id */
        }
        const inPack = byId.has(depId);
        resolved.push({
          id: depId,
          label,
          requiredBy: [...meta.requiredBy],
          missing: !inPack,
        });
      }

      for (const c of conflicts) {
        resolved.push({
          id: `${c.mod}:${c.dep}`,
          label: `${c.mod} ↔ ${c.dep}`,
          requiredBy: [c.mod],
          missing: true,
          conflict: c.reason,
        });
      }

      resolved.sort((a, b) => {
        if (a.missing !== b.missing) return a.missing ? -1 : 1;
        return a.label.localeCompare(b.label);
      });

      if (!cancelled) setNodes(resolved);
    })()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setNodes([]);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIds, gameVersion, loader, selected]);

  const missingCount = nodes.filter((n) => n.missing && !n.conflict).length;
  const conflictCount = nodes.filter((n) => n.conflict).length;

  return (
    <div
      className={cn(
        "rounded-xl border border-border-subtle bg-black/15 p-3 flex flex-col gap-2 min-h-0",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Dependency tree
          </p>
          <p className="text-[10px] text-text-disabled">
            Required Modrinth deps for mods in your pack
            {gameVersion ? ` · MC ${gameVersion}` : ""}
            {loader ? ` · ${loader}` : ""}
          </p>
        </div>
        {busy ? (
          <span className="text-[10px] text-text-muted">Scanning…</span>
        ) : (
          <span className="text-[10px] text-text-muted tabular-nums">
            {missingCount > 0 ? `${missingCount} missing` : "OK"}
            {conflictCount > 0 ? ` · ${conflictCount} conflict` : ""}
          </span>
        )}
      </div>

      {error ? (
        <p className="text-[11px] text-amber-200/90">{error}</p>
      ) : nodes.length === 0 ? (
        <p className="text-[11px] text-text-muted py-2">
          {selected.length === 0
            ? "Add mods to inspect dependencies."
            : busy
              ? "Loading dependency graph…"
              : "No required dependencies reported by Modrinth for selected versions."}
        </p>
      ) : (
        <ul className="scrollbar-cultforge max-h-40 overflow-y-auto flex flex-col gap-1">
          {nodes.map((node) => (
            <li
              key={node.id}
              className={cn(
                "rounded-lg px-2 py-1.5 text-[11px] border",
                node.conflict
                  ? "border-state-error/30 bg-state-error/8 text-state-error"
                  : node.missing
                    ? "border-amber-400/25 bg-amber-400/8 text-amber-100/90"
                    : "border-white/6 bg-white/3 text-text-secondary",
              )}
            >
              <div className="font-medium text-text-primary truncate">
                {node.label}
              </div>
              <div className="text-[10px] text-text-muted truncate">
                {node.conflict
                  ? `Conflict (${node.conflict})`
                  : node.missing
                    ? `Missing · required by ${node.requiredBy.join(", ")}`
                    : `Satisfied · required by ${node.requiredBy.join(", ")}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
