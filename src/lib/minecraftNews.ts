import type { NewsStory } from "../data/news";
import { thumbForCategory } from "../data/news";
import { logger } from "./logger";

const MOJANG_CONTENT_BASE = "https://launchercontent.mojang.com";

type MojangImage = {
  title?: string | null;
  url?: string | null;
  dimensions?: { width?: number; height?: number } | null;
};

type MojangNewsEntry = {
  title?: string;
  tag?: string;
  category?: string;
  date?: string;
  text?: string;
  id?: string;
  newsPageUrl?: string | null;
  readMoreLink?: string | null;
  playPageUri?: string | null;
  /** Legacy field — often absent on current launchercontent feed. */
  image?: MojangImage | null;
  newsPageImage?: MojangImage | null;
  playPageImage?: MojangImage | null;
};

type MojangNewsPayload = {
  entries?: MojangNewsEntry[];
  version?: string;
};

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Resolve relative Mojang launchercontent paths to absolute https URLs. */
export function resolveMojangContentUrl(url?: string | null): string | null {
  const raw = (url || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `${MOJANG_CONTENT_BASE}${raw}`;
  return `${MOJANG_CONTENT_BASE}/${raw.replace(/^\.\//, "")}`;
}

function coverCss(url?: string | null): string {
  const absolute = resolveMojangContentUrl(url);
  if (!absolute) return thumbForCategory("Launcher");
  const safe = absolute.replace(/"/g, '\\"');
  return `center / cover no-repeat url("${safe}")`;
}

function pickCover(entry: MojangNewsEntry): string | null {
  return (
    resolveMojangContentUrl(entry.newsPageImage?.url) ||
    resolveMojangContentUrl(entry.playPageImage?.url) ||
    resolveMojangContentUrl(entry.image?.url)
  );
}

function storyFromMojang(entry: MojangNewsEntry, index: number): NewsStory | null {
  const title = (entry.title ?? "").trim();
  if (!title) return null;
  const link =
    entry.newsPageUrl ||
    entry.readMoreLink ||
    entry.playPageUri ||
    undefined;
  const cover = pickCover(entry);
  const dek = (entry.text ?? entry.tag ?? "Official Minecraft news").trim();
  const id = `mc:${entry.id || link || title}:${index}`;
  return {
    id,
    title,
    dek,
    category: "Minecraft",
    date: formatWhen(entry.date),
    readMin: Math.max(1, Math.round(dek.split(/\s+/).length / 180) || 1),
    thumb: coverCss(cover),
    slides: [title, dek],
    kind: "minecraft_official",
    bodyPreview: dek,
    coverUrl: cover,
    shareUrl: link,
    channel: entry.category ?? entry.tag ?? "Minecraft",
    publishedAt: entry.date,
  };
}

/** Mojang launcher news.json (official Minecraft / Java launcher feed). */
export async function fetchMinecraftOfficialNews(
  limit = 24,
): Promise<NewsStory[]> {
  try {
    const res = await fetch(`${MOJANG_CONTENT_BASE}/news.json`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Mojang news HTTP ${res.status}`);
    }
    const raw = (await res.json()) as MojangNewsPayload;
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    return entries
      .map(storyFromMojang)
      .filter((x): x is NewsStory => Boolean(x))
      .slice(0, limit);
  } catch (err) {
    logger.warn(
      `Minecraft official news failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return [];
  }
}

/**
 * Extra open feeds (best-effort). Failures are soft — Discover still works.
 */
export async function fetchOpenMinecraftNews(limit = 12): Promise<NewsStory[]> {
  const stories: NewsStory[] = [];
  try {
    const res = await fetch(
      "https://www.minecraft.net/en-us/feeds/community-content/news",
      { method: "GET" },
    );
    if (res.ok) {
      const xml = await res.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(
        0,
        limit,
      );
      for (const [, block] of items) {
        const title =
          block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i)?.[1] ||
          block.match(/<title>(.*?)<\/title>/i)?.[1] ||
          "";
        const link =
          block.match(/<link>(.*?)<\/link>/i)?.[1]?.trim() || undefined;
        const desc =
          block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1] ||
          block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ||
          "";
        const pub =
          block.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1] || undefined;
        const media =
          block.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1] ||
          block.match(/<enclosure[^>]+url=["']([^"']+)["']/i)?.[1] ||
          null;
        const clean = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (!title.trim()) continue;
        const cover = resolveMojangContentUrl(media) || media;
        stories.push({
          id: `mcnet:${link || title}`,
          title: title.trim(),
          dek: clean.slice(0, 220) || "Minecraft.net community news",
          category: "Minecraft",
          date: formatWhen(pub ? new Date(pub).toISOString() : null),
          readMin: 2,
          thumb: cover
            ? `center / cover no-repeat url("${cover.replace(/"/g, '\\"')}")`
            : thumbForCategory("Launcher"),
          slides: [title.trim(), clean.slice(0, 280)],
          kind: "minecraft_net",
          bodyPreview: clean.slice(0, 1200),
          coverUrl: cover,
          shareUrl: link,
          channel: "Minecraft.net",
          publishedAt: pub ? new Date(pub).toISOString() : undefined,
        });
      }
    }
  } catch (err) {
    logger.warn(
      `Minecraft.net feed failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return stories;
}
