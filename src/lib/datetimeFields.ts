/** Local date/time field helpers for WebView-friendly scheduling inputs. */

export function toLocalDateValue(iso?: string) {
  const date = iso ? new Date(iso) : new Date(Date.now() + 60 * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function toLocalTimeValue(iso?: string) {
  const date = iso ? new Date(iso) : new Date(Date.now() + 60 * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(11, 16);
}

/** Combine YYYY-MM-DD + HH:mm into an ISO string in local time. */
export function combineLocalDateTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
