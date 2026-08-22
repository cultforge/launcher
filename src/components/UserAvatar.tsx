import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { appendLoopbackQuery, getClientOrigin } from "../lib/client";

/** Encode user_id for remote api.cultforge.com path segments only. */
export function encodeProfileAvatarPath(userId: string): string {
  return encodeURIComponent(userId);
}

/**
 * Rewrite CultForge-hosted avatar URLs through the local sidecar proxy.
 * Direct api.cultforge.com <img> loads are often blocked by Cloudflare 1010.
 * user_id may contain '/' (e.g. cult__xxxx/1234) — keep it; proxy uses :path.
 */
export async function resolveAvatarDisplayUrl(
  url: string | null | undefined,
  cacheBust?: string | number,
): Promise<string | null> {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  const match = trimmed.match(
    /^https?:\/\/(?:www\.)?api\.cultforge\.com\/v1\/profile\/(.+)\/avatar(?:\?.*)?$/i,
  );
  if (match) {
    let userId = match[1];
    try {
      userId = decodeURIComponent(userId);
    } catch {
      /* keep raw */
    }
    // Drop a duplicated trailing /avatar if the path converter swallowed it.
    if (userId.endsWith("/avatar")) {
      userId = userId.slice(0, -"/avatar".length);
    }
    const origin = await getClientOrigin();
    const v = cacheBust ?? Date.now();
    // Keep slash-ids path-style for the sidecar :path route.
    return appendLoopbackQuery(
      `${origin}/media/avatar/${userId.split("/").map(encodeURIComponent).join("/")}?v=${v}`,
    );
  }

  // Already a sidecar proxy URL from OAuth callback — keep as-is (add bust).
  if (/\/media\/avatar\//i.test(trimmed)) {
    if (cacheBust == null) return trimmed;
    const sep = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${sep}v=${encodeURIComponent(String(cacheBust))}`;
  }

  return trimmed;
}

/** @deprecated prefer resolveAvatarDisplayUrl — kept for sync call sites. */
export function withAvatarCacheBust(
  url: string,
  version?: string | number,
): string {
  if (!url) return url;
  if (!url.includes("/v1/profile/") || !url.includes("/avatar")) return url;
  const sep = url.includes("?") ? "&" : "?";
  const v = version ?? Date.now();
  return `${url}${sep}v=${v}`;
}

/** Strip data-URL header → raw base64 for POST /v1/profile/avatar. */
export function toRawAvatarBase64(dataUrlOrBase64: string): {
  base64: string;
  contentType: string | null;
} {
  const raw = dataUrlOrBase64.trim();
  if (raw.toLowerCase().startsWith("data:")) {
    const comma = raw.indexOf(",");
    if (comma < 0) return { base64: raw, contentType: null };
    const header = raw.slice(0, comma);
    const base64 = raw.slice(comma + 1).trim();
    const mime = header.slice(5).split(";")[0]?.trim().toLowerCase() || null;
    return { base64, contentType: mime };
  }
  return { base64: raw, contentType: null };
}

type UserAvatarProps = {
  src?: string | null;
  name?: string;
  className?: string;
  imgClassName?: string;
};

/**
 * Profile avatar with sidecar proxy for api.cultforge.com URLs and
 * initials fallback when the image fails to load.
 */
export function UserAvatar({
  src,
  name = "?",
  className,
  imgClassName,
}: UserAvatarProps) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const initials = (name.trim() || "?").slice(0, 2).toUpperCase();

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setResolved(null);
    void resolveAvatarDisplayUrl(src).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const showImg = Boolean(resolved) && !failed;

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden bg-white/10 text-white font-bold shrink-0",
        className,
      )}
    >
      {showImg ? (
        <img
          src={resolved!}
          alt=""
          className={cn("h-full w-full object-cover", imgClassName)}
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-[10px] leading-none">{initials.slice(0, 1)}</span>
      )}
    </span>
  );
}
