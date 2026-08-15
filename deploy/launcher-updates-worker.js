/**
 * Optional Cloudflare Worker: proxy CultForge launcher updater feed.
 *
 * Route suggestion:
 *   api.cultforge.com/v1/launcher/*
 *
 * Deploy when the Cloudflare token has Worker write access, or paste into the
 * tunnel origin as an equivalent reverse-proxy of the GitHub latest.json URL.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (
      url.pathname === "/v1/launcher/updates/latest.json" ||
      url.pathname === "/launcher/latest.json"
    ) {
      const upstream =
        "https://github.com/cultforge/launcher/releases/latest/download/latest.json";
      const res = await fetch(upstream, {
        headers: {
          Accept: "application/json",
          "User-Agent": "CultForge-Updater-Proxy",
        },
        redirect: "follow",
      });
      const body = await res.arrayBuffer();
      return new Response(body, {
        status: res.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
};
