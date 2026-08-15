import { create } from "zustand";
import {
  applyThemeTokens,
  BUILTIN_THEMES,
  cloneTheme,
  DEFAULT_THEME_ID,
  isThemeTokens,
  MAX_CUSTOM_THEMES,
  type LauncherTheme,
  type ThemeTokens,
} from "../data/themes";
import {
  LOGO_VARIANTS,
  SHELL_VARIANTS,
  type LogoMode,
  type LogoVariant,
  type ShellVariant,
} from "../data/branding";
import { getPreference, setPreference } from "../lib/persistentStore";

type PersistedThemeState = {
  version: 1 | 2;
  activeThemeId: string;
  customThemes: LauncherTheme[];
  editingId: string | null;
  logoMode?: LogoMode;
  logoAssignments?: Record<string, LogoVariant>;
  headerVariant?: ShellVariant;
  sideNavVariant?: ShellVariant;
};

type ThemeStore = {
  hydrated: boolean;
  activeThemeId: string;
  customThemes: LauncherTheme[];
  editingId: string | null;
  logoMode: LogoMode;
  logoAssignments: Record<string, LogoVariant>;
  headerVariant: ShellVariant;
  sideNavVariant: ShellVariant;
  headerPreview: ShellVariant | null;
  sideNavPreview: ShellVariant | null;
  hydrate: () => Promise<void>;
  themes: () => LauncherTheme[];
  activeTheme: () => LauncherTheme;
  setActiveTheme: (id: string) => void;
  previewTokens: (tokens: ThemeTokens) => void;
  restoreActiveTheme: () => void;
  createCustomTheme: (sourceId: string, name?: string) => string | null;
  updateCustomTheme: (
    id: string,
    patch: { name?: string; tokens?: ThemeTokens },
  ) => void;
  deleteCustomTheme: (id: string) => void;
  importCustomTheme: (value: unknown) => string | null;
  setEditingId: (id: string | null) => void;
  setLogoMode: (mode: LogoMode) => void;
  resolvedLogoVariant: () => LogoVariant;
  previewHeaderVariant: (variant: ShellVariant) => void;
  previewSideNavVariant: (variant: ShellVariant) => void;
  commitShellVariants: () => void;
  cancelShellPreview: () => void;
};

const persistenceKey = "themes";
let persistenceQueue: Promise<void> = Promise.resolve();

function allThemes(customThemes: LauncherTheme[]) {
  return [...BUILTIN_THEMES, ...customThemes];
}

function validCustomThemes(value: unknown): LauncherTheme[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((theme): theme is LauncherTheme => {
      if (!theme || typeof theme !== "object") return false;
      const candidate = theme as LauncherTheme;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        isThemeTokens(candidate.tokens)
      );
    })
    .slice(0, MAX_CUSTOM_THEMES)
    .map((theme) => ({ ...theme, builtin: false }));
}

function persist(get: () => ThemeStore) {
  const state = get();
  const value: PersistedThemeState = {
    version: 2,
    activeThemeId: state.activeThemeId,
    customThemes: state.customThemes,
    editingId: state.editingId,
    logoMode: state.logoMode,
    logoAssignments: state.logoAssignments,
    headerVariant: state.headerVariant,
    sideNavVariant: state.sideNavVariant,
  };
  persistenceQueue = persistenceQueue
    .catch(() => undefined)
    .then(() => setPreference(persistenceKey, value))
    .catch(() => undefined);
}

function uniqueId() {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function randomLogoVariant(): LogoVariant {
  return LOGO_VARIANTS[Math.floor(Math.random() * LOGO_VARIANTS.length)];
}

function validLogoMode(value: unknown): LogoMode {
  return value === "auto" || LOGO_VARIANTS.includes(value as LogoVariant)
    ? (value as LogoMode)
    : "auto";
}

function validShellVariant(value: unknown): ShellVariant {
  return SHELL_VARIANTS.includes(value as ShellVariant)
    ? (value as ShellVariant)
    : "current";
}

function validAssignments(value: unknown): Record<string, LogoVariant> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, LogoVariant] =>
        typeof entry[0] === "string" &&
        LOGO_VARIANTS.includes(entry[1] as LogoVariant),
    ),
  );
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  hydrated: false,
  activeThemeId: DEFAULT_THEME_ID,
  customThemes: [],
  editingId: null,
  logoMode: "auto",
  logoAssignments: {},
  headerVariant: "current",
  sideNavVariant: "current",
  headerPreview: null,
  sideNavPreview: null,

  hydrate: async () => {
    const saved = await getPreference<PersistedThemeState>(persistenceKey);
    const customThemes = validCustomThemes(saved?.customThemes);
    const available = allThemes(customThemes);
    const activeThemeId = available.some((theme) => theme.id === saved?.activeThemeId)
      ? saved!.activeThemeId
      : DEFAULT_THEME_ID;
    const editingId = customThemes.some((theme) => theme.id === saved?.editingId)
      ? saved!.editingId
      : null;
    const logoMode = validLogoMode(saved?.logoMode);
    const logoAssignments = validAssignments(saved?.logoAssignments);
    if (!logoAssignments[activeThemeId]) {
      logoAssignments[activeThemeId] = randomLogoVariant();
    }
    set({
      customThemes,
      activeThemeId,
      editingId,
      logoMode,
      logoAssignments,
      headerVariant: validShellVariant(saved?.headerVariant),
      sideNavVariant: validShellVariant(saved?.sideNavVariant),
      headerPreview: null,
      sideNavPreview: null,
      hydrated: true,
    });
    applyThemeTokens(
      available.find((theme) => theme.id === activeThemeId)!.tokens,
    );
    persist(get);
  },

  themes: () => allThemes(get().customThemes),
  activeTheme: () =>
    allThemes(get().customThemes).find(
      (theme) => theme.id === get().activeThemeId,
    ) ?? BUILTIN_THEMES[0],

  setActiveTheme: (id) => {
    const theme = allThemes(get().customThemes).find((item) => item.id === id);
    if (!theme) return;
    set((state) => ({
      activeThemeId: id,
      logoAssignments: state.logoAssignments[id]
        ? state.logoAssignments
        : { ...state.logoAssignments, [id]: randomLogoVariant() },
    }));
    applyThemeTokens(theme.tokens);
    persist(get);
  },

  previewTokens: (tokens) => applyThemeTokens(tokens),
  restoreActiveTheme: () => applyThemeTokens(get().activeTheme().tokens),

  createCustomTheme: (sourceId, name) => {
    if (get().customThemes.length >= MAX_CUSTOM_THEMES) return null;
    const source =
      allThemes(get().customThemes).find((theme) => theme.id === sourceId) ??
      get().activeTheme();
    const id = uniqueId();
    const custom = cloneTheme(
      source,
      id,
      name?.trim() || `${source.name} Custom`,
    );
    set((state) => ({
      customThemes: [...state.customThemes, custom],
      editingId: id,
    }));
    persist(get);
    return id;
  },

  updateCustomTheme: (id, patch) => {
    set((state) => ({
      customThemes: state.customThemes.map((theme) =>
        theme.id === id
          ? {
              ...theme,
              name: patch.name?.trim() || theme.name,
              tokens: patch.tokens ? { ...patch.tokens } : theme.tokens,
            }
          : theme,
      ),
    }));
    if (get().activeThemeId === id) get().restoreActiveTheme();
    persist(get);
  },

  deleteCustomTheme: (id) => {
    const wasActive = get().activeThemeId === id;
    set((state) => ({
      customThemes: state.customThemes.filter((theme) => theme.id !== id),
      activeThemeId: wasActive ? DEFAULT_THEME_ID : state.activeThemeId,
      editingId: state.editingId === id ? null : state.editingId,
    }));
    get().restoreActiveTheme();
    persist(get);
  },

  importCustomTheme: (value) => {
    if (get().customThemes.length >= MAX_CUSTOM_THEMES) return null;
    if (!value || typeof value !== "object") return null;
    const imported = value as Partial<LauncherTheme>;
    if (typeof imported.name !== "string" || !isThemeTokens(imported.tokens)) {
      return null;
    }
    const id = uniqueId();
    const theme: LauncherTheme = {
      id,
      name: imported.name.trim() || "Imported Theme",
      builtin: false,
      tokens: { ...imported.tokens },
    };
    set((state) => ({
      customThemes: [...state.customThemes, theme],
      editingId: id,
    }));
    persist(get);
    return id;
  },

  setEditingId: (editingId) => {
    set({ editingId });
    persist(get);
  },

  setLogoMode: (logoMode) => {
    if (logoMode === "auto" && !get().logoAssignments[get().activeThemeId]) {
      set((state) => ({
        logoMode,
        logoAssignments: {
          ...state.logoAssignments,
          [state.activeThemeId]: randomLogoVariant(),
        },
      }));
    } else {
      set({ logoMode });
    }
    persist(get);
  },

  resolvedLogoVariant: () => {
    const state = get();
    if (state.logoMode !== "auto") return state.logoMode;
    return state.logoAssignments[state.activeThemeId] ?? "disc";
  },

  previewHeaderVariant: (headerPreview) => set({ headerPreview }),
  previewSideNavVariant: (sideNavPreview) => set({ sideNavPreview }),
  commitShellVariants: () => {
    set((state) => ({
      headerVariant: state.headerPreview ?? state.headerVariant,
      sideNavVariant: state.sideNavPreview ?? state.sideNavVariant,
      headerPreview: null,
      sideNavPreview: null,
    }));
    persist(get);
  },
  cancelShellPreview: () =>
    set({ headerPreview: null, sideNavPreview: null }),
}));
