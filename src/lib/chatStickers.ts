export const STICKER_TOKEN_RE = /^\[\[sticker:([a-z0-9-]+)\]\]$/i;

export type ChatSticker = {
  id: string;
  label: string;
  svg: string;
};

function svgData(inner: string, bg: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${inner}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`.replace(
    bg,
    bg,
  );
}

export const CHAT_STICKERS: ChatSticker[] = [
  {
    id: "anvil",
    label: "Anvil",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#122018"/><rect x="22" y="18" width="52" height="14" rx="3" fill="#3dcf8e"/><rect x="30" y="32" width="36" height="10" fill="#2a9d6a"/><rect x="38" y="42" width="20" height="22" fill="#1e7a52"/><rect x="24" y="64" width="48" height="12" rx="2" fill="#3dcf8e"/>`,
      "",
    ),
  },
  {
    id: "ember",
    label: "Ember",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#1a120c"/><path d="M48 16c8 14 22 22 22 38a22 22 0 1 1-44 0c0-16 14-24 22-38z" fill="#f59e0b"/><path d="M48 30c5 9 14 14 14 26a14 14 0 1 1-28 0c0-12 9-17 14-26z" fill="#fb7185"/>`,
      "",
    ),
  },
  {
    id: "pickaxe",
    label: "Pickaxe",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#14181c"/><path d="M28 30h40l-8 10H36z" fill="#94a3b8"/><rect x="44" y="38" width="8" height="40" rx="2" fill="#c4a574"/><circle cx="48" cy="28" r="6" fill="#3dcf8e"/>`,
      "",
    ),
  },
  {
    id: "gem",
    label: "Emerald",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#0c1814"/><path d="M48 14l22 18-22 50L26 32z" fill="#3dcf8e"/><path d="M48 14l22 18H26z" fill="#6ee7b7"/><path d="M48 82L26 32h44z" fill="#059669"/>`,
      "",
    ),
  },
  {
    id: "forge",
    label: "Forge",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#16120e"/><rect x="20" y="48" width="56" height="28" rx="4" fill="#3f3f46"/><rect x="28" y="28" width="40" height="24" rx="4" fill="#f97316"/><rect x="36" y="20" width="24" height="12" fill="#fb923c"/>`,
      "",
    ),
  },
  {
    id: "spark",
    label: "Spark",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#101418"/><path d="M48 12l8 28h28L64 56l8 28-24-16-24 16 8-28L12 40h28z" fill="#3dcf8e"/>`,
      "",
    ),
  },
  {
    id: "shield",
    label: "Shield",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#12161c"/><path d="M48 16l28 10v22c0 18-12 32-28 38-16-6-28-20-28-38V26z" fill="#3dcf8e"/><path d="M48 26l18 6v16c0 12-8 22-18 26-10-4-18-14-18-26V32z" fill="#0f1720"/>`,
      "",
    ),
  },
  {
    id: "heart",
    label: "Heart",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#180c12"/><path d="M48 78s-26-16-26-34a14 14 0 0 1 26-8 14 14 0 0 1 26 8c0 18-26 34-26 34z" fill="#fb7185"/>`,
      "",
    ),
  },
  {
    id: "skull",
    label: "Skull",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#121212"/><ellipse cx="48" cy="42" rx="24" ry="22" fill="#e5e7eb"/><rect x="36" y="60" width="24" height="14" rx="2" fill="#e5e7eb"/><circle cx="40" cy="42" r="5" fill="#111"/><circle cx="56" cy="42" r="5" fill="#111"/>`,
      "",
    ),
  },
  {
    id: "wave",
    label: "Wave",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#0c141c"/><path d="M12 58c10-16 18-16 28 0s18 16 28 0 18-16 28 0v22H12z" fill="#38bdf8"/>`,
      "",
    ),
  },
  {
    id: "moon",
    label: "Moon",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#0b1020"/><circle cx="48" cy="48" r="22" fill="#e2e8f0"/><circle cx="58" cy="42" r="16" fill="#0b1020"/>`,
      "",
    ),
  },
  {
    id: "check",
    label: "Check",
    svg: svgData(
      `<rect width="96" height="96" rx="20" fill="#0c1814"/><circle cx="48" cy="48" r="26" fill="#3dcf8e"/><path d="M34 50l10 10 20-22" fill="none" stroke="#052e1c" stroke-width="6" stroke-linecap="round"/>`,
      "",
    ),
  },
];

export function stickerToken(id: string): string {
  return `[[sticker:${id}]]`;
}

export function parseStickerId(content: string): string | null {
  const m = content.trim().match(STICKER_TOKEN_RE);
  return m?.[1]?.toLowerCase() ?? null;
}

export function stickerById(id: string): ChatSticker | undefined {
  return CHAT_STICKERS.find((s) => s.id === id);
}

export function dmSnippet(content: string): string {
  if (parseStickerId(content)) return "Sticker";
  return content;
}
