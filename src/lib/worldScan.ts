import type { ScannerWorldResult } from "./localContent";

export type WorldGameMode =
  | "Survival"
  | "Creative"
  | "Hardcore"
  | "Adventure"
  | "Spectator";

export type WorldDifficulty = "Peaceful" | "Easy" | "Normal" | "Hard";

export type { ScannerWorldResult };

export type ParsedWorldScan = {
  path?: string;
  name?: string;
  seed?: string;
  spawn?: string;
  gameMode?: WorldGameMode;
  difficulty?: WorldDifficulty;
  cheats?: boolean;
  mcVersion?: string;
  lastPlayedMs?: number;
  iconDataUrl?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function nbtScalar(value: unknown): unknown {
  const rec = asRecord(value);
  if (!rec) return value;
  const keys = Object.keys(rec);
  if (keys.length !== 1) return value;
  const tagged = [
    "Byte",
    "Short",
    "Int",
    "Long",
    "Float",
    "Double",
    "String",
  ];
  if (tagged.includes(keys[0])) return rec[keys[0]];
  return value;
}

function nbtInt(value: unknown): number | null {
  const scalar = nbtScalar(value);
  if (typeof scalar === "number" && Number.isFinite(scalar)) {
    return Math.trunc(scalar);
  }
  if (typeof scalar === "boolean") return scalar ? 1 : 0;
  if (typeof scalar === "string" && /^-?\d+$/.test(scalar.trim())) {
    const parsed = Number(scalar);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nbtBool(value: unknown): boolean | null {
  const n = nbtInt(value);
  if (n === null) {
    const scalar = nbtScalar(value);
    if (typeof scalar === "boolean") return scalar;
    return null;
  }
  return n !== 0;
}

function nbtSeed(value: unknown): string | null {
  const scalar = nbtScalar(value);
  if (typeof scalar === "string" && /^-?\d+$/.test(scalar.trim())) {
    return scalar.trim();
  }
  if (typeof scalar === "number" && Number.isFinite(scalar)) {
    if (Number.isSafeInteger(scalar)) return String(scalar);
    return String(Math.trunc(scalar));
  }
  if (typeof scalar === "bigint") return scalar.toString();
  return null;
}

function nbtString(value: unknown): string | null {
  const scalar = nbtScalar(value);
  if (typeof scalar === "string" && scalar.trim()) return scalar.trim();
  return null;
}

export function scannerImageToDataUrl(
  image: string | null | undefined,
): string | undefined {
  if (!image) return undefined;
  const trimmed = image.trim();
  if (!trimmed) return undefined;
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("https:") ||
    trimmed.startsWith("http:")
  ) {
    return trimmed;
  }
  return `data:image/png;base64,${trimmed}`;
}

function levelData(levelDat: unknown): Record<string, unknown> | null {
  const root = asRecord(levelDat);
  if (!root) return null;
  if (typeof root.error === "string") return null;
  return asRecord(root.Data) ?? root;
}

function gameModeFromNbt(
  gameType: number | null,
  hardcore: boolean | null,
): WorldGameMode | undefined {
  if (hardcore) return "Hardcore";
  if (gameType === null) return undefined;
  switch (gameType) {
    case 0:
      return "Survival";
    case 1:
      return "Creative";
    case 2:
      return "Adventure";
    case 3:
      return "Spectator";
    default:
      return undefined;
  }
}

function difficultyFromNbt(value: number | null): WorldDifficulty | undefined {
  switch (value) {
    case 0:
      return "Peaceful";
    case 1:
      return "Easy";
    case 2:
      return "Normal";
    case 3:
      return "Hard";
    default:
      return undefined;
  }
}

export function parseWorldScan(
  result: ScannerWorldResult | null | undefined,
): ParsedWorldScan | null {
  if (!result || typeof result !== "object") return null;
  const data = levelData(result.level_dat);
  const worldGen = data ? asRecord(data.WorldGenSettings) : null;
  const version = data ? asRecord(data.Version) : null;
  const seed =
    nbtSeed(worldGen?.seed) ?? nbtSeed(data?.RandomSeed) ?? undefined;
  const spawnX = data ? nbtInt(data.SpawnX) : null;
  const spawnY = data ? nbtInt(data.SpawnY) : null;
  const spawnZ = data ? nbtInt(data.SpawnZ) : null;
  const spawn =
    spawnX !== null && spawnY !== null && spawnZ !== null
      ? `${spawnX}, ${spawnY}, ${spawnZ}`
      : undefined;
  const lastPlayed = data ? nbtInt(data.LastPlayed) : null;

  return {
    path: typeof result.path === "string" ? result.path : undefined,
    name:
      nbtString(data?.LevelName) ||
      (typeof result.name === "string" ? result.name : undefined),
    seed,
    spawn,
    gameMode: gameModeFromNbt(
      data ? nbtInt(data.GameType) : null,
      data ? nbtBool(data.hardcore) : null,
    ),
    difficulty: difficultyFromNbt(data ? nbtInt(data.Difficulty) : null),
    cheats: data ? (nbtBool(data.allowCommands) ?? undefined) : undefined,
    mcVersion: nbtString(version?.Name) ?? undefined,
    lastPlayedMs:
      lastPlayed && lastPlayed > 0 ? lastPlayed : undefined,
    iconDataUrl: scannerImageToDataUrl(result.image),
  };
}

export function normalizeFsPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
