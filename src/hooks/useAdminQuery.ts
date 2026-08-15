import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest } from "../lib/adminApi";
import { ClientHttpError } from "../lib/client";
import { useAdminSessionStore } from "../stores/adminSession";

type UseAdminQueryOptions = {
  method?: string;
  path: string | null;
  query?: Record<string, string>;
  enabled?: boolean;
};

export function useAdminQuery<T = unknown>({
  method = "GET",
  path,
  query,
  enabled = true,
}: UseAdminQueryOptions) {
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const queryKey = query ? JSON.stringify(query) : "";

  const refetch = useCallback(async () => {
    if (!path || !enabled) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await adminRequest({ method, path, query });
      if (id !== requestId.current) return;
      setData(result as T);
    } catch (err) {
      if (id !== requestId.current) return;
      if (err instanceof ClientHttpError && err.status === 401) {
        handleUnauthorized();
      }
      setError(err instanceof Error ? err.message : "Request failed");
      setData(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [method, path, queryKey, enabled, handleUnauthorized]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, error, loading, refetch };
}
