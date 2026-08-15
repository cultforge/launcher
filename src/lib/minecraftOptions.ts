import type { OptionsEntry } from "./localContent";

/** Humanize camelCase / dotted Minecraft option keys. */
export function humanizeOptionKey(key: string): string {
  if (!key) return "Line";
  const spaced = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type OptionControlKind =
  | "toggle"
  | "int"
  | "float"
  | "enum"
  | "resourcePacks"
  | "shaderPack"
  | "text";

const KNOWN_ENUMS: Record<string, string[]> = {
  graphicsMode: ["fast", "fancy", "fabulous"],
  cloudStatus: ["true", "false", "fast"],
  particles: ["all", "decreased", "minimal"],
  ao: ["true", "false"],
  priorWorkPenalty: ["true", "false"],
  attackIndicator: ["off", "crosshair", "hotbar"],
  narrate: ["OFF", "ALL", "CHAT", "SYSTEM"],
  mainHand: ["left", "right"],
  chatVisibility: ["FULL", "SYSTEM", "HIDDEN"],
};

export function inferOptionControl(
  key: string,
  value: string,
): OptionControlKind {
  if (key === "resourcePacks") return "resourcePacks";
  if (key === "shaderPack") return "shaderPack";
  if (KNOWN_ENUMS[key]) return "enum";
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "false") return "toggle";
  if (/^-?\d+$/.test(value.trim())) return "int";
  if (/^-?\d+\.\d+$/.test(value.trim())) return "float";
  return "text";
}

export function enumOptionsForKey(key: string): string[] | null {
  return KNOWN_ENUMS[key] ?? null;
}

export function getOptionValue(
  entries: OptionsEntry[],
  key: string,
): string | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (e.kind === "entry" && e.key === key) return e.value;
  }
  return null;
}

export function parseResourcePacksList(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    /* fall through */
  }
  const out: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  }
  return out;
}

export function serializeResourcePacksList(packs: string[]): string {
  return `[${packs.map((p) => JSON.stringify(p)).join(",")}]`;
}

export function packOptionsEntry(fileName: string): string {
  const name = fileName.replace(/\.disabled$/i, "");
  if (name.includes("/") || name.includes("\\")) return name;
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip") || lower.endsWith(".jar")) {
    return `file/${name}`;
  }
  return name;
}

export function packEntryMatches(entry: string, fileName: string): boolean {
  const want = packOptionsEntry(fileName);
  if (entry === want) return true;
  const stem = fileName.replace(/\.disabled$/i, "");
  const stemNoExt = stem.includes(".")
    ? stem.slice(0, stem.lastIndexOf("."))
    : stem;
  return (
    entry === stem ||
    entry === stemNoExt ||
    entry === `file/${stem}` ||
    entry === `file/${stemNoExt}`
  );
}

export function isPackEnabledInOptions(
  entries: OptionsEntry[],
  fileName: string,
): boolean {
  const list = parseResourcePacksList(getOptionValue(entries, "resourcePacks"));
  return list.some((e) => packEntryMatches(e, fileName));
}

/** Normalize shaderPack value for comparison with library file names. */
export function normalizeShaderName(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(/\.disabled$/i, "").trim();
}

export function shaderMatchesActive(
  fileName: string,
  activeShader: string | null | undefined,
): boolean {
  const active = normalizeShaderName(activeShader);
  if (!active) return false;
  const stem = normalizeShaderName(fileName);
  const stemNoExt = stem.includes(".")
    ? stem.slice(0, stem.lastIndexOf("."))
    : stem;
  return (
    active === stem ||
    active === stemNoExt ||
    active === fileName ||
    active.toLowerCase() === stem.toLowerCase() ||
    active.toLowerCase() === stemNoExt.toLowerCase()
  );
}

export function setEntriesKey(
  entries: OptionsEntry[],
  key: string,
  value: string,
): OptionsEntry[] {
  const next = entries.map((e) => ({ ...e }));
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].kind === "entry" && next[i].key === key) {
      next[i] = { ...next[i], value };
      return next;
    }
  }
  next.push({ key, value, kind: "entry" });
  return next;
}
