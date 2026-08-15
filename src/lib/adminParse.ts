function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

function asArray(data: unknown): unknown[] | null {
  return Array.isArray(data) ? data : null;
}

export function extractRows(data: unknown): Record<string, unknown>[] {
  if (!data) return [];

  const direct = asArray(data);
  if (direct) {
    return direct.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row && typeof row === "object" && !Array.isArray(row)),
    );
  }

  const obj = asRecord(data);
  if (!obj) return [];

  for (const key of ["data", "items", "results", "rows", "entries", "records"]) {
    const nested = obj[key];
    const arr = asArray(nested);
    if (arr) {
      return arr.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row && typeof row === "object" && !Array.isArray(row)),
      );
    }
  }

  const nestedData = asRecord(obj.data);
  if (nestedData) {
    for (const key of ["items", "results", "rows"]) {
      const arr = asArray(nestedData[key]);
      if (arr) {
        return arr.filter(
          (row): row is Record<string, unknown> =>
            Boolean(row && typeof row === "object" && !Array.isArray(row)),
        );
      }
    }
  }

  return [];
}

export function extractTotal(data: unknown): number | null {
  const obj = asRecord(data);
  if (!obj) return null;

  for (const key of ["total", "count", "total_count"]) {
    const val = obj[key];
    if (typeof val === "number") return val;
  }

  const nested = asRecord(obj.data);
  if (nested) {
    for (const key of ["total", "count", "total_count"]) {
      const val = nested[key];
      if (typeof val === "number") return val;
    }
  }

  return null;
}

export type TimeSeriesPoint = { x: string; y: number };

export function extractTimeSeries(data: unknown): TimeSeriesPoint[] {
  const rows = extractRows(data);
  if (rows.length) {
    const points: TimeSeriesPoint[] = [];
    for (const row of rows) {
      const x =
        (typeof row.timestamp === "string" && row.timestamp) ||
        (typeof row.time === "string" && row.time) ||
        (typeof row.date === "string" && row.date) ||
        (typeof row.label === "string" && row.label) ||
        (typeof row.bucket === "string" && row.bucket) ||
        null;
      const y =
        typeof row.value === "number"
          ? row.value
          : typeof row.count === "number"
            ? row.count
            : typeof row.total === "number"
              ? row.total
              : null;
      if (x && y !== null) points.push({ x, y });
    }
    if (points.length) return points;
  }

  const obj = asRecord(data);
  if (!obj) return [];

  const series = asArray(obj.series) ?? asArray(asRecord(obj.data)?.series);
  if (series) {
    const points: TimeSeriesPoint[] = [];
    for (const item of series) {
      const row = asRecord(item);
      if (!row) continue;
      const x =
        (typeof row.x === "string" && row.x) ||
        (typeof row.timestamp === "string" && row.timestamp) ||
        null;
      const y = typeof row.y === "number" ? row.y : typeof row.value === "number" ? row.value : null;
      if (x && y !== null) points.push({ x, y });
    }
    if (points.length) return points;
  }

  return [];
}

export function extractPieSlices(
  data: unknown,
): { id: string; label: string; value: number }[] {
  const rows = extractRows(data);
  if (rows.length) {
    return rows
      .map((row, i) => {
        const label =
          (typeof row.label === "string" && row.label) ||
          (typeof row.name === "string" && row.name) ||
          (typeof row.type === "string" && row.type) ||
          (typeof row.status === "string" && row.status) ||
          `Item ${i + 1}`;
        const value =
          typeof row.value === "number"
            ? row.value
            : typeof row.count === "number"
              ? row.count
              : typeof row.total === "number"
                ? row.total
                : 0;
        return { id: label, label, value };
      })
      .filter((s) => s.value > 0);
  }

  const obj = asRecord(data);
  if (!obj) return [];

  const breakdown = asRecord(obj.breakdown) ?? asRecord(asRecord(obj.data)?.breakdown);
  if (breakdown) {
    return Object.entries(breakdown)
      .filter(([, v]) => typeof v === "number")
      .map(([label, value]) => ({
        id: label,
        label,
        value: value as number,
      }));
  }

  return [];
}

export function inferColumns(rows: Record<string, unknown>[]): string[] {
  if (!rows.length) return [];
  const keys = new Set<string>();
  for (const row of rows.slice(0, 20)) {
    for (const key of Object.keys(row)) {
      if (typeof row[key] !== "object" || row[key] === null) {
        keys.add(key);
      }
    }
  }
  const priority = [
    "id",
    "user_id",
    "username",
    "email",
    "name",
    "status",
    "action",
    "created_at",
    "updated_at",
  ];
  const sorted = [...keys].sort((a, b) => {
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });
  return sorted.slice(0, 8);
}

export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (value.length > 80) return `${value.slice(0, 77)}…`;
    return value;
  }
  return JSON.stringify(value);
}
