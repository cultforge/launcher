import type { AdminCatalogEntry } from "./adminApi";
import type { AdminSectionId } from "./adminCatalog";
import { resolvePathTemplate, rowIdFromRecord } from "./adminCatalog";
import {
  matchActionSchema,
  isFieldVisible,
  type ActionField,
  type ActionSeverity,
} from "./adminActionSchemas";

export type { ActionField, ActionSeverity };

export type AdminAction = {
  id: string;
  label: string;
  description: string;
  severity: ActionSeverity;
  entry: AdminCatalogEntry;
  pathParam: string | null;
  fields: ActionField[];
  when?: (row: Record<string, unknown>) => boolean;
  global: boolean;
  bodyMapper?: AdminActionBodyMapper;
  validate?: (formValues: Record<string, string>) => string | null;
  prefill?: (row: Record<string, unknown>) => Record<string, string>;
};

export type AdminActionBodyMapper = (
  formValues: Record<string, string>,
  row?: Record<string, unknown> | null,
) => Record<string, unknown>;

function pathSuffix(path: string): string {
  const parts = path.replace(/\{[^}]+\}/g, "").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function pathParamKeys(path: string): string[] {
  const matches = path.matchAll(/\{(\w+)\}/g);
  return [...matches].map((m) => m[1]);
}

function hasPathParams(path: string): boolean {
  return path.includes("{");
}

function isGlobalEntry(entry: AdminCatalogEntry, schemaGlobal?: boolean): boolean {
  if (schemaGlobal !== undefined) return schemaGlobal;
  if (!entry.mutate) return false;
  if (!hasPathParams(entry.path)) return true;
  const suffix = pathSuffix(entry.path);
  if (["notifications", "mail", "rate-limits", "updates", "reports"].includes(suffix)) {
    return entry.method === "POST" && !hasPathParams(entry.path);
  }
  return false;
}

function inferAction(
  entry: AdminCatalogEntry,
  sectionId: AdminSectionId | string,
): AdminAction | null {
  const schema = matchActionSchema(entry);
  if (!schema) return null;

  const suffix = pathSuffix(entry.path);
  const params = pathParamKeys(entry.path);

  return {
    id: `${sectionId}.${suffix}.${entry.method}`,
    label: schema.label,
    description: schema.description,
    severity: schema.severity ?? (entry.method === "DELETE" ? "danger" : "neutral"),
    entry,
    pathParam: params[0] ?? null,
    fields: schema.fields,
    when: schema.when,
    global: isGlobalEntry(entry, schema.global),
    bodyMapper: schema.bodyMapper,
    validate: schema.validate,
    prefill: schema.prefill,
  };
}

export function buildActionsFromCatalog(
  sectionId: AdminSectionId | string,
  entries: AdminCatalogEntry[],
): AdminAction[] {
  return entries
    .filter((e) => e.mutate)
    .map((e) => inferAction(e, sectionId))
    .filter((a): a is AdminAction => a !== null);
}

export function splitActions(actions: AdminAction[]): {
  rowActions: AdminAction[];
  globalActions: AdminAction[];
} {
  const globalActions = actions.filter((a) => a.global);
  const rowActions = actions.filter((a) => !a.global);
  return { rowActions, globalActions };
}

export function resolveActionsForRow(
  actions: AdminAction[],
  row: Record<string, unknown>,
): AdminAction[] {
  return actions.filter((a) => {
    if (a.global) return false;
    if (a.when && !a.when(row)) return false;
    return actionPathParams(a, row) !== null;
  });
}

export function actionPathParams(
  action: AdminAction,
  row: Record<string, unknown>,
): Record<string, string> | null {
  const keys = pathParamKeys(action.entry.path);
  if (!keys.length) return {};

  const params: Record<string, string> = {};
  for (const key of keys) {
    const val =
      row[key] ??
      (key === "id" ? rowIdFromRecord(row) : null) ??
      (key === "user_id" ? row.id ?? row.user_id : null) ??
      (key === "session_id" ? row.id ?? row.session_id : null) ??
      (key === "code" ? row.code ?? row.invite_code : null);
    if (val === null || val === undefined || val === "") return null;
    params[key] = String(val);
  }
  return params;
}

export function buildActionBody(
  action: AdminAction,
  formValues: Record<string, string>,
  row?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  const method = action.entry.method.toUpperCase();

  if (action.bodyMapper) {
    return action.bodyMapper(formValues, row);
  }

  if (action.fields.length === 0) {
    if (["POST", "PUT", "PATCH"].includes(method)) return {};
    return undefined;
  }

  const body: Record<string, unknown> = {};
  for (const field of action.fields) {
    if (!isFieldVisible(field, formValues)) continue;
    const val = formValues[field.name]?.trim();
    if (!val && field.type !== "checkbox") continue;
    if (field.type === "number") {
      body[field.name] = Number(val);
    } else if (field.type === "boolean" || field.type === "checkbox") {
      body[field.name] = val === "true" || val === "on";
    } else if (field.type === "multiselect" || field.type === "user-picker") {
      body[field.name] = val.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      body[field.name] = val;
    }
  }

  if (Object.keys(body).length === 0 && ["POST", "PUT", "PATCH"].includes(method)) {
    return {};
  }
  return Object.keys(body).length ? body : undefined;
}

export function validateActionForm(
  action: AdminAction,
  formValues: Record<string, string>,
): string | null {
  if (action.validate) {
    const custom = action.validate(formValues);
    if (custom) return custom;
  }

  for (const field of action.fields) {
    if (!isFieldVisible(field, formValues)) continue;
    if (field.required && !formValues[field.name]?.trim()) {
      if (field.type === "checkbox") continue;
      return `${field.label} is required.`;
    }
  }
  return null;
}

export function resolveActionPath(
  action: AdminAction,
  row: Record<string, unknown>,
): string | null {
  const params = actionPathParams(action, row);
  if (params === null) return null;
  if (!hasPathParams(action.entry.path)) return action.entry.path;
  return resolvePathTemplate(action.entry.path, params);
}

export function findRowUpdateAction(
  actions: AdminAction[],
  row: Record<string, unknown>,
): AdminAction | null {
  const candidates = actions.filter(
    (a) =>
      !a.global &&
      ["PATCH", "PUT"].includes(a.entry.method) &&
      actionPathParams(a, row) !== null,
  );
  return candidates[0] ?? null;
}

export function prefillFromRow(
  action: AdminAction,
  row: Record<string, unknown>,
): Record<string, string> {
  if (action.prefill) {
    return { ...action.prefill(row) };
  }

  const values: Record<string, string> = {};
  for (const field of action.fields) {
    const rowVal = row[field.name];
    if (rowVal !== null && rowVal !== undefined) {
      values[field.name] = String(rowVal);
    } else if (field.defaultValue) {
      values[field.name] = field.defaultValue;
    }
  }
  return values;
}
