import { appendLoopbackQuery, getClientOrigin } from "./client";

/** In-memory resolved display URLs so remounts skip async origin lookup. */
const resolvedUrlCache = new Map<string, string>();

/**
 * Rewrite CultForge-hosted guild media URLs through the local sidecar proxy.
 * Covers icons, banners, news/event covers, and inline markdown media.
 *
 * URLs are stable (no Date.now cache-bust) so the browser + sidecar disk
 * cache can reuse icon/banner bytes across navigation.
 * Pass `cacheBust` only after an upload/update to force refresh.
 */
export async function resolveGuildMediaDisplayUrl(
  url: string | null | undefined,
  cacheBust?: string | number,
): Promise<string | null> {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("linear-gradient") ||
    trimmed.startsWith("radial-gradient")
  ) {
    return trimmed;
  }

  const match = trimmed.match(
    /^https?:\/\/(?:www\.)?guilds\.cultforge\.com\/v1\/guilds\/(.+?)(?:\?.*)?$/i,
  );
  if (!match) return trimmed;

  let path = match[1];
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep raw */
  }
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const cacheKey = cacheBust != null ? `${encodedPath}?v=${cacheBust}` : encodedPath;

  const hit = resolvedUrlCache.get(cacheKey);
  if (hit) return hit;

  const origin = await getClientOrigin();
  const display =
    cacheBust != null
      ? `${origin}/media/guilds/${encodedPath}?fresh=1&v=${encodeURIComponent(String(cacheBust))}`
      : `${origin}/media/guilds/${encodedPath}`;

  const secured = await appendLoopbackQuery(display);
  resolvedUrlCache.set(cacheKey, secured);
  // Drop any non-bust entry for the same path so next default resolve stays fresh after upload.
  if (cacheBust != null) {
    resolvedUrlCache.delete(encodedPath);
  }
  return secured;
}

/** Clear in-memory display URL cache (e.g. after branding upload). */
export function clearGuildMediaDisplayCache(pathPrefix?: string): void {
  if (!pathPrefix) {
    resolvedUrlCache.clear();
    return;
  }
  const needle = pathPrefix.split("/").map(encodeURIComponent).join("/");
  for (const key of resolvedUrlCache.keys()) {
    if (key === needle || key.startsWith(`${needle}?`) || key.startsWith(`${needle}/`)) {
      resolvedUrlCache.delete(key);
    }
  }
}
