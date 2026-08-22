/** Parse codes embedded in cultforge:// or https://cultforge.com/agent/link URLs.
 * Those links are for cf-agent on the host PC — the launcher does not approve
 * codes; it generates pairing codes via POST /v1/agents/pairing. */

export function parseAgentLinkCode(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  const tryUrl = (value: string): string | null => {
    try {
      const u = new URL(value);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      const path = `${u.hostname}${u.pathname}`.toLowerCase();
      const fromQuery =
        u.searchParams.get("code") ||
        u.searchParams.get("user_code") ||
        u.searchParams.get("userCode");
      if (fromQuery?.trim()) return fromQuery.trim().toUpperCase();

      const isCultforgeHost =
        host === "cultforge.com" ||
        host.endsWith(".cultforge.com");
      const isAgentPath =
        /\/agent\/link/i.test(u.pathname) ||
        path.includes("agent/link") ||
        (u.protocol === "cultforge:" &&
          (host === "agent" || u.pathname.toLowerCase().includes("agent")));
      if ((isCultforgeHost || u.protocol === "cultforge:") && isAgentPath) {
        const last = u.pathname.split("/").filter(Boolean).pop();
        if (last && /^[A-Za-z0-9_-]{4,16}$/.test(last)) {
          return last.toUpperCase();
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  if (raw.includes("://") || raw.includes("cultforge.com")) {
    const fromUrl = tryUrl(raw.includes("://") ? raw : `https://${raw}`);
    if (fromUrl) return fromUrl;
  }

  if (/^[A-Za-z0-9_-]{4,16}$/.test(raw)) return raw.toUpperCase();
  return null;
}

export function isAgentLinkUrl(input: string | null | undefined): boolean {
  return Boolean(parseAgentLinkCode(input));
}
