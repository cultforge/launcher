import { useEffect, useMemo, useState } from "react";
import { ModalShell } from "../../modals/ModalShell";
import type { AdminAction } from "../../../lib/adminActionRegistry";
import type { ActionField } from "../../../lib/adminActionSchemas";
import {
  actionPathParams,
  buildActionBody,
  prefillFromRow,
  validateActionForm,
} from "../../../lib/adminActionRegistry";
import { isFieldVisible } from "../../../lib/adminActionSchemas";
import { userDisplayName } from "../../../lib/adminFormatters";
import { useAdminMutate } from "../../../hooks/useAdminMutate";
import { AdminUserPicker } from "./AdminUserPicker";
import { CfSelect } from "../../ui/CfSelect";

type Props = {
  open: boolean;
  action: AdminAction | null;
  row?: Record<string, unknown> | null;
  onClose: () => void;
  onSuccess?: () => void;
};

const DEFAULT_TAB = "General";

function groupFieldsByTab(fields: ActionField[]): { tab: string; fields: ActionField[] }[] {
  const map = new Map<string, ActionField[]>();
  for (const field of fields) {
    const tab = field.tab ?? DEFAULT_TAB;
    if (!map.has(tab)) map.set(tab, []);
    map.get(tab)!.push(field);
  }
  return [...map.entries()].map(([tab, tabFields]) => ({ tab, fields: tabFields }));
}

export function AdminActionDialog({
  open,
  action,
  row,
  onClose,
  onSuccess,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { mutate, busy, capabilityActive } = useAdminMutate(() => {
    onSuccess?.();
    onClose();
  });

  useEffect(() => {
    if (open && action) {
      setConfirmText("");
      setFormError(null);
      setValues(row ? prefillFromRow(action, row) : prefillDefaults(action));
      const visible = action.fields.filter((f) =>
        isFieldVisible(f, row ? prefillFromRow(action, row) : prefillDefaults(action)),
      );
      const tabs = groupFieldsByTab(visible);
      setActiveTab(tabs[0]?.tab ?? DEFAULT_TAB);
    }
  }, [open, action?.id, row]);

  const visibleFields = (action?.fields ?? []).filter((f) =>
    isFieldVisible(f, values),
  );
  const tabGroups = useMemo(
    () => groupFieldsByTab(visibleFields),
    [visibleFields],
  );

  if (!action) return null;

  const isGlobal = action.global || !row;
  const displayName = row ? userDisplayName(row) : null;
  const needsConfirm = action.severity === "danger";
  const confirmOk = !needsConfirm || confirmText.toLowerCase() === "confirm";
  const useTabs = tabGroups.length > 1;
  const activeFields =
    tabGroups.find((g) => g.tab === activeTab)?.fields ?? visibleFields;

  const handleSubmit = async () => {
    const validationError = validateActionForm(action, values);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    let pathParams: Record<string, string> | undefined;
    if (!isGlobal && row) {
      const params = actionPathParams(action, row);
      if (params === null) {
        setFormError("Could not resolve target ID for this action.");
        return;
      }
      pathParams = params;
    }

    const body = buildActionBody(action, values, row);
    setFormError(null);
    await mutate({ entry: action.entry, pathParams, body });
  };

  const btnClass =
    action.severity === "danger"
      ? "rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-50 bg-state-error/90 text-white hover:bg-state-error"
      : "cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-50";

  const compactNumbers = activeFields.every(
    (f) => f.type === "number" || f.type === "select" || f.type === "text",
  );

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={action.label}
      wide
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-text-muted cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !confirmOk || !capabilityActive}
            onClick={() => void handleSubmit()}
            className={btnClass}
          >
            {busy ? "Working…" : action.label}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!capabilityActive ? (
          <div className="rounded-lg border border-state-warning/30 bg-state-warning/8 px-3 py-2 text-[12px] text-state-warning">
            Admin capability required. Use Re-step-up in the top bar first.
          </div>
        ) : null}

        {displayName && !isGlobal ? (
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-2.5 flex items-center justify-between gap-3">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                Target
              </div>
              <div className="font-sora text-[13px] font-semibold text-text-primary">
                {displayName}
              </div>
            </div>
            {row?.username ? (
              <div className="text-[11px] text-text-muted">@{String(row.username)}</div>
            ) : null}
          </div>
        ) : null}

        {action.description && visibleFields.length > 0 ? (
          <p className="text-[11px] text-text-muted leading-relaxed px-0.5">
            {action.description}
          </p>
        ) : visibleFields.length === 0 ? (
          <p className="text-[12px] text-text-secondary leading-relaxed">
            {action.description}
          </p>
        ) : null}

        {useTabs ? (
          <div className="flex gap-1 border-b border-white/8 pb-px">
            {tabGroups.map(({ tab }) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide cursor-pointer border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? "border-primary-base text-primary-base"
                    : "border-transparent text-text-muted hover:text-text-secondary"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        ) : null}

        {visibleFields.length > 0 ? (
          <div
            className={
              compactNumbers && activeFields.length >= 2
                ? "grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3"
                : "flex flex-col gap-3"
            }
          >
            {activeFields.map((field) => (
              <FieldInput
                key={field.name}
                field={field}
                value={values[field.name] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
                compact={compactNumbers && field.type !== "textarea" && field.type !== "radio"}
              />
            ))}
          </div>
        ) : null}

        {formError ? (
          <p className="text-[12px] text-state-error">{formError}</p>
        ) : null}

        {needsConfirm ? (
          <div className="rounded-lg border border-state-error/20 bg-state-error/5 px-3 py-3">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-state-error">
              Type CONFIRM to proceed
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRM"
              className="mt-1.5 w-full rounded-lg border border-state-error/30 bg-black/20 px-3 py-2 text-[12px] text-text-primary outline-none"
            />
          </div>
        ) : null}

        <details className="text-[10px] text-text-disabled pt-1">
          <summary className="cursor-pointer hover:text-text-muted">
            Developer details
          </summary>
          <code className="mt-2 block rounded bg-black/40 px-2 py-1 font-mono">
            {action.entry.method} {action.entry.path}
          </code>
        </details>
      </div>
    </ModalShell>
  );
}

function prefillDefaults(action: AdminAction): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of action.fields) {
    if (field.defaultValue) values[field.name] = field.defaultValue;
  }
  return values;
}

function FieldInput({
  field,
  value,
  onChange,
  compact,
}: {
  field: ActionField;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const inputClass =
    "mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] text-text-primary outline-none focus:border-primary-base/40";

  const spanClass = compact ? "" : "col-span-full";

  return (
    <div className={spanClass}>
      <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {field.label}
        {field.required ? " *" : ""}
      </label>

      {field.type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={inputClass}
        />
      ) : field.type === "select" && field.options ? (
        <CfSelect
          value={value || field.defaultValue || ""}
          onChange={onChange}
          placeholder="Select…"
          options={[
            { value: "", label: "Select…" },
            ...field.options.map((o) => ({ value: o.value, label: o.label })),
          ]}
          aria-label={field.label}
        />
      ) : field.type === "radio" && field.options ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {field.options.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-black/20 px-3 py-2 cursor-pointer hover:bg-white/5"
            >
              <input
                type="radio"
                name={field.name}
                value={o.value}
                checked={(value || field.defaultValue) === o.value}
                onChange={() => onChange(o.value)}
                className="accent-primary-base"
              />
              <span className="text-[12px] text-text-primary">{o.label}</span>
            </label>
          ))}
        </div>
      ) : field.type === "checkbox" ? (
        <label className="mt-1.5 flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={value === "true" || value === "on"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="accent-primary-base"
          />
          <span className="text-[12px] text-text-secondary">
            {field.placeholder ?? "Enabled"}
          </span>
        </label>
      ) : field.type === "user-picker" ? (
        <AdminUserPicker
          value={value}
          onChange={onChange}
          multiple={field.name === "user_ids"}
          placeholder={field.placeholder ?? "Select user…"}
          allowManual={field.name === "to"}
        />
      ) : field.type === "boolean" ? (
        <CfSelect
          value={value || "false"}
          onChange={onChange}
          options={[
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]}
          aria-label={field.label}
        />
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}
