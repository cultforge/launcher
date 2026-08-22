import { toast } from "sonner";

export async function copyText(
  text: string,
  successMessage = "Copied!",
): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
    return true;
  } catch {
    toast.error("Could not copy — select and copy manually");
    return false;
  }
}

export function truncateMiddle(id: string, head = 8, tail = 6): string {
  const s = id.trim();
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
