import { useEffect, useState } from "react";
import {
  entityVisual,
  type VisualEntityKind,
} from "../lib/entityVisuals";
import { resolveGuildMediaDisplayUrl } from "../lib/guildMedia";
import { cn } from "../lib/cn";

export function EntityImage({
  kind,
  entityId,
  source,
  alt,
  className,
}: {
  kind: VisualEntityKind;
  entityId: string;
  source?: string | null;
  alt: string;
  className?: string;
}) {
  const visual = entityVisual(kind, entityId, source);
  const [displaySrc, setDisplaySrc] = useState<string | null>(visual.src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setDisplaySrc(visual.src);
    if (kind === "guild" && visual.src) {
      void resolveGuildMediaDisplayUrl(visual.src).then((url) => {
        if (!cancelled) setDisplaySrc(url);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [kind, visual.src]);

  return (
    <span
      className={cn("relative block overflow-hidden bg-cover bg-center", className)}
      style={{ backgroundImage: visual.fallback }}
    >
      {displaySrc && !failed && (
        <img
          src={displaySrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      )}
    </span>
  );
}
