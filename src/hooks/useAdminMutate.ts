import { useCallback, useState } from "react";
import { toast } from "sonner";
import { adminRequest, type AdminCatalogEntry } from "../lib/adminApi";
import { resolvePathTemplate } from "../lib/adminCatalog";
import { ClientHttpError } from "../lib/client";
import { useAdminSessionStore } from "../stores/adminSession";

type MutateArgs = {
  entry: AdminCatalogEntry;
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};

function adminErrorMessage(err: unknown, capabilityActive: boolean): string {
  if (!(err instanceof ClientHttpError)) {
    return err instanceof Error ? err.message : "Admin request failed";
  }
  const msg = err.message.toLowerCase();
  if (err.status === 403) {
    if (!capabilityActive || msg.includes("step-up") || msg.includes("capability")) {
      return "Admin step-up required. Use Re-step-up in the top bar.";
    }
    if (msg.includes("catalog") || msg.includes("not in staff")) {
      return "This action is not in the staff catalog. Check API Explorer for the path.";
    }
    return err.message || "Permission denied (403).";
  }
  if (err.status === 401) {
    return "Admin capability expired. Step up again.";
  }
  return err.message || `Admin request failed (${err.status}).`;
}

export function useAdminMutate(onSuccess?: () => void) {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const [busy, setBusy] = useState(false);

  const mutate = useCallback(
    async ({ entry, pathParams, query, body }: MutateArgs) => {
      if (!capabilityActive) {
        toast.error("Admin capability required. Step up first.");
        return null;
      }

      setBusy(true);
      try {
        const path = pathParams
          ? resolvePathTemplate(entry.path, pathParams)
          : entry.path;
        const result = await adminRequest({
          method: entry.method,
          path,
          query,
          body,
        });
        toast.success("Action completed successfully");
        onSuccess?.();
        return result;
      } catch (err) {
        if (err instanceof ClientHttpError && err.status === 401) {
          handleUnauthorized();
        }
        toast.error(adminErrorMessage(err, capabilityActive));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [capabilityActive, handleUnauthorized, onSuccess],
  );

  return { mutate, busy, capabilityActive };
}
