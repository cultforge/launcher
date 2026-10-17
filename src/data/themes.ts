export type ThemeTokens = {
  bgApp: string;
  bgSurface: string;
  bgCard: string;
  bgElevated: string;
  bgOverlay: string;
  bgGlass: string;
  primaryBase: string;
  primaryMuted: string;
  primarySoft: string;
  primaryDeep: string;
  primaryVivid: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  borderSubtle: string;
  borderStrong: string;
};

export type LauncherTheme = {
  id: string;
  name: string;
  builtin: boolean;
  tokens: ThemeTokens;
};

const baseText = {
  textPrimary: "#f4f7fb",
  textSecondary: "#a8b4c4",
  textMuted: "#6e7a8a",
  textDisabled: "#4a5563",
  borderSubtle: "#ffffff0f",
  borderStrong: "#ffffff1a",
};

function darkTheme(
  id: string,
  name: string,
  primary: {
    base: string;
    muted: string;
    soft: string;
    deep: string;
    vivid: string;
    accent: string;
  },
  surfaces: [string, string, string, string, string, string] = [
    "#000000",
    "#050505",
    "#0a0a0a",
    "#0f0f0f",
    "#141414",
    "#050505",
  ],
): LauncherTheme {
  return {
    id,
    name,
    builtin: true,
    tokens: {
      bgApp: surfaces[0],
      bgSurface: surfaces[1],
      bgCard: surfaces[2],
      bgElevated: surfaces[3],
      bgOverlay: surfaces[4],
      bgGlass: surfaces[5],
      primaryBase: primary.base,
      primaryMuted: primary.muted,
      primarySoft: primary.soft,
      primaryDeep: primary.deep,
      primaryVivid: primary.vivid,
      accent: primary.accent,
      success: "#25d16f",
      warning: "#eab64d",
      error: "#eb5d62",
      info: "#4ab7ff",
      ...baseText,
    },
  };
}

export const BUILTIN_THEMES: LauncherTheme[] = [
  darkTheme("oled-forge", "OLED Forge", {
    base: "#1ee396",
    muted: "#0f8a5c",
    soft: "#4af0b4",
    deep: "#0a5742",
    vivid: "#74f7cb",
    accent: "#d4a84a",
  }),
  darkTheme(
    "void-violet",
    "Void Violet",
    {
      base: "#9b7cff",
      muted: "#6046b8",
      soft: "#b9a6ff",
      deep: "#392577",
      vivid: "#d1c5ff",
      accent: "#61d8ff",
    },
    ["#030207", "#07050d", "#0d0a16", "#131020", "#1a1629", "#07050d"],
  ),
  darkTheme(
    "ember",
    "Ember",
    {
      base: "#ff7a45",
      muted: "#a34324",
      soft: "#ff9e75",
      deep: "#672511",
      vivid: "#ffc0a3",
      accent: "#ffc857",
    },
    ["#050201", "#0a0503", "#110906", "#190d09", "#21120c", "#0a0503"],
  ),
  darkTheme(
    "arctic",
    "Arctic",
    {
      base: "#53cfff",
      muted: "#287f9f",
      soft: "#83dcff",
      deep: "#164e64",
      vivid: "#b5ebff",
      accent: "#8b9fff",
    },
    ["#010405", "#03090c", "#071015", "#0a1720", "#0e202b", "#03090c"],
  ),
  darkTheme(
    "crimson",
    "Crimson",
    {
      base: "#ff5470",
      muted: "#a72f47",
      soft: "#ff8297",
      deep: "#68182b",
      vivid: "#ffb0bf",
      accent: "#b890ff",
    },
    ["#050102", "#0a0305", "#12070a", "#1a0b10", "#231017", "#0a0305"],
  ),
  darkTheme(
    "ancient-gold",
    "Ancient Gold",
    {
      base: "#d9ae52",
      muted: "#8b6926",
      soft: "#ebca7d",
      deep: "#594115",
      vivid: "#ffe1a0",
      accent: "#66d6a9",
    },
    ["#040301", "#080702", "#0e0c05", "#151207", "#1d190b", "#080702"],
  ),
  {
    id: "zeniths-arcana",
    name: "Zenith's Arcana",
    builtin: true,
    tokens: {
      bgApp: "#040301",
      bgSurface: "#080702",
      bgCard: "#0e0c05",
      bgElevated: "#151207",
      bgOverlay: "#1d190b",
      bgGlass: "#080702",
      primaryBase: "#bda7ec",
      primaryMuted: "#a178a9",
      primarySoft: "#7f67d5",
      primaryDeep: "#594115",
      primaryVivid: "#ffe1a0",
      accent: "#66d6a9",
      success: "#25d16f",
      warning: "#864e0e",
      error: "#eb5d62",
      info: "#4ab7ff",
      ...baseText,
    },
  },
];

export const BUILTIN_THEMES_ALL: LauncherTheme[] = [...BUILTIN_THEMES];

export const DEFAULT_THEME_ID = BUILTIN_THEMES[0].id;
export const MAX_CUSTOM_THEMES = 13;

const tokenCssVariables: Record<keyof ThemeTokens, string> = {
  bgApp: "--color-bg-app",
  bgSurface: "--color-bg-surface",
  bgCard: "--color-bg-card",
  bgElevated: "--color-bg-elevated",
  bgOverlay: "--color-bg-overlay",
  bgGlass: "--color-bg-glass",
  primaryBase: "--color-primary-base",
  primaryMuted: "--color-primary-muted",
  primarySoft: "--color-primary-soft",
  primaryDeep: "--color-primary-dvivd",
  primaryVivid: "--color-primary-vivid",
  accent: "--color-accent-alpha",
  success: "--color-state-success",
  warning: "--color-state-warning",
  error: "--color-state-error",
  info: "--color-state-info",
  textPrimary: "--color-text-primary",
  textSecondary: "--color-text-secondary",
  textMuted: "--color-text-muted",
  textDisabled: "--color-text-disabled",
  borderSubtle: "--color-border-subtle",
  borderStrong: "--color-border-strong",
};

export function applyThemeTokens(tokens: ThemeTokens) {
  const root = document.documentElement;
  for (const [key, variable] of Object.entries(tokenCssVariables) as [
    keyof ThemeTokens,
    string,
  ][]) {
    root.style.setProperty(variable, tokens[key]);
  }
  root.style.setProperty("--accent", tokens.primaryBase);
  root.style.setProperty("--background", tokens.bgApp);
  root.style.setProperty("--foreground", tokens.textPrimary);
  root.style.setProperty("--muted", tokens.bgElevated);
  root.style.setProperty("--muted-foreground", tokens.textMuted);
  root.style.setProperty("--border", tokens.borderStrong);
  root.style.setProperty("--success", tokens.success);
  root.style.setProperty(
    "--color-glow-primary",
    `color-mix(in srgb, ${tokens.primaryBase} 28%, transparent)`,
  );
  root.dataset.theme = tokens.primaryBase;
}

export function cloneTheme(
  source: LauncherTheme,
  id: string,
  name: string,
): LauncherTheme {
  return {
    id,
    name,
    builtin: false,
    tokens: { ...source.tokens },
  };
}

export function isThemeTokens(value: unknown): value is ThemeTokens {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Object.keys(tokenCssVariables).every(
    (key) => typeof candidate[key] === "string",
  );
}
