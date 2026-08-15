import logoAbstract from "../assets/logo-abstract.svg";
import logoDisc from "../assets/logo-disc.svg";
import logoThin from "../assets/logo-thin.svg";

export const LOGO_VARIANTS = ["disc", "abstract", "thin"] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];
export type LogoMode = "auto" | LogoVariant;

export const LOGO_VARIANT_LABELS: Record<LogoVariant, string> = {
  disc: "Disc",
  abstract: "Abstract",
  thin: "Thin",
};

export const LOGO_ASSETS: Record<LogoVariant, string> = {
  disc: logoDisc,
  abstract: logoAbstract,
  thin: logoThin,
};

export type ShellVariant =
  | "current"
  | "v1"
  | "v2"
  | "v3"
  | "v4"
  | "v5"
  | "v6"
  | "v7";

export const SHELL_VARIANTS: ShellVariant[] = [
  "current",
  "v1",
  "v2",
  "v3",
  "v4",
  "v5",
  "v6",
  "v7",
];

export type ShellVariantMeta = {
  id: ShellVariant;
  name: string;
  headerDescription: string;
  sideNavDescription: string;
  density: "compact" | "standard" | "spacious";
  compactPreferred: boolean;
};

export const SHELL_VARIANT_META: Record<ShellVariant, ShellVariantMeta> = {
  current: {
    id: "current",
    name: "Current",
    headerDescription: "The original CultForge pill navigation.",
    sideNavDescription: "The original grouped launcher rail.",
    density: "standard",
    compactPreferred: false,
  },
  v1: {
    id: "v1",
    name: "Underline",
    headerDescription: "Flat tabs with a precise active underline.",
    sideNavDescription: "Dense rows with a quiet filled selection.",
    density: "compact",
    compactPreferred: false,
  },
  v2: {
    id: "v2",
    name: "Segmented",
    headerDescription: "A framed, segmented command strip.",
    sideNavDescription: "Outlined rows with strong grouping.",
    density: "standard",
    compactPreferred: false,
  },
  v3: {
    id: "v3",
    name: "Minimal",
    headerDescription: "Open navigation with minimal chrome.",
    sideNavDescription: "An icon-focused rail for maximum space.",
    density: "compact",
    compactPreferred: true,
  },
  v4: {
    id: "v4",
    name: "Framed",
    headerDescription: "A full-width shell with luminous edge accents.",
    sideNavDescription: "An airy rail with a clear active marker.",
    density: "spacious",
    compactPreferred: false,
  },
  v5: {
    id: "v5",
    name: "Tactical",
    headerDescription: "Clipped geometry and technical framing.",
    sideNavDescription: "Angled selections in a compact framed panel.",
    density: "standard",
    compactPreferred: false,
  },
  v6: {
    id: "v6",
    name: "Angled",
    headerDescription: "A diagonal brand divide with flat navigation.",
    sideNavDescription: "A sharp, high-contrast utility rail.",
    density: "standard",
    compactPreferred: false,
  },
  v7: {
    id: "v7",
    name: "Floating",
    headerDescription: "Rounded floating groups on a soft shell.",
    sideNavDescription: "A floating icon rail with rounded controls.",
    density: "spacious",
    compactPreferred: true,
  },
};
