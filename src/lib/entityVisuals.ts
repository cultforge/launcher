export type VisualEntityKind =
  | "build"
  | "guild"
  | "server"
  | "player"
  | "mod"
  | "shader"
  | "resource-pack"
  | "world"
  | "backup";

const LOCAL_ARTWORK: Record<string, string> = {
  "build:eclipse": "/art/ironvale-cover.webp",
  "build:aether-network": "/art/aether-cover.webp",
  "build:vanilla-plus": "/art/ashen-cover.webp",
  "guild:iron": "/art/ironvale-cover.webp",
  "guild:aether": "/art/aether-cover.webp",
  "guild:ashen": "/art/ashen-cover.webp",
  "server:s1": "/art/ironvale-cover.webp",
  "server:s2": "/art/ironvale-cover.webp",
  "server:s3": "/art/aether-cover.webp",
  "server:s4": "/art/ashen-cover.webp",
};

const FALLBACKS: Record<VisualEntityKind, string> = {
  build: "linear-gradient(135deg,#0b1826,#25355f 48%,#0b101a)",
  guild: "linear-gradient(135deg,#10182b,#29225a 48%,#0a0d16)",
  server: "linear-gradient(135deg,#0b1b20,#17414c 48%,#091015)",
  player: "linear-gradient(135deg,#151a28,#34304e 48%,#0c0f17)",
  mod: "linear-gradient(135deg,#15221a,#2d5a3a 48%,#0b120d)",
  shader: "linear-gradient(135deg,#23192c,#644b71 48%,#100c14)",
  "resource-pack": "linear-gradient(135deg,#291e13,#76542d 48%,#130f0a)",
  world: "linear-gradient(135deg,#10221c,#2a694c 48%,#09130f)",
  backup: "linear-gradient(135deg,#17202b,#3c5067 48%,#0b1016)",
};

function imageUrl(value?: string | null): string | null {
  if (!value) return null;
  if (
    value.startsWith("/") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:")
  ) {
    return value;
  }
  const match = value.match(/^url\((['"]?)(.*?)\1\)$/);
  return match?.[2] ?? null;
}

export type EntityVisual = {
  src: string | null;
  fallback: string;
};

export function entityVisual(
  kind: VisualEntityKind,
  id: string,
  remoteOrFallback?: string | null,
): EntityVisual {
  return {
    src: LOCAL_ARTWORK[`${kind}:${id}`] ?? imageUrl(remoteOrFallback),
    fallback:
      remoteOrFallback?.startsWith("linear-gradient") ||
      remoteOrFallback?.startsWith("radial-gradient")
        ? remoteOrFallback
        : FALLBACKS[kind],
  };
}

export function entityBackground(
  kind: VisualEntityKind,
  id: string,
  remoteOrFallback?: string | null,
): string {
  const visual = entityVisual(kind, id, remoteOrFallback);
  return visual.src ? `url("${visual.src}")` : visual.fallback;
}
