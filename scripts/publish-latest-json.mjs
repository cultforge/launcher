#!/usr/bin/env node
/**
 * Build + upload multi-platform latest.json for a CultForge launcher release.
 *
 * Prefers signed updater artifacts (.sig present). Windows MSI is required.
 * Linux AppImage / macOS DMG are included when signed.
 *
 * Usage:
 *   node scripts/publish-latest-json.mjs --tag v2.4.1
 *   node scripts/publish-latest-json.mjs --tag v2.4.1 --dry-run
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = process.env.CULTFORGE_GITHUB_REPO || "cultforge/launcher";

function parseArgs(argv) {
  const out = { tag: null, dryRun: false, notes: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag") out.tag = argv[++i];
    else if (a === "--notes") out.notes = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function normalizeTag(tag) {
  const t = String(tag || "").trim();
  if (!t) throw new Error("--tag is required (e.g. v2.4.1)");
  return t.startsWith("v") ? t : `v${t}`;
}

function semverFromTag(tag) {
  return tag.replace(/^v/i, "");
}

function ghJson(args) {
  const out = execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

function downloadText(url) {
  const out = execFileSync(
    "gh",
    ["api", "-H", "Accept: application/octet-stream", url],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  return out.trim();
}

/**
 * Map release asset names → Tauri updater platform keys.
 * Prefer MSI on Windows, AppImage on Linux, .app.tar.gz on macOS
 * (DMG is install-only; updater needs the signed tar.gz).
 */
function pickPlatformArtifacts(assets) {
  const byName = new Map(assets.map((a) => [a.name, a]));
  const hasSig = (name) => byName.has(`${name}.sig`);
  const picks = [];

  const msi = assets.find(
    (a) => /\.msi$/i.test(a.name) && !/\.sig$/i.test(a.name),
  );
  if (msi && hasSig(msi.name)) {
    picks.push({ platform: "windows-x86_64", asset: msi.name });
  }

  const appImage = assets.find(
    (a) => /\.AppImage$/i.test(a.name) && !/\.sig$/i.test(a.name),
  );
  if (appImage && hasSig(appImage.name)) {
    picks.push({ platform: "linux-x86_64", asset: appImage.name });
  }

  const macTar =
    assets.find(
      (a) =>
        /\.app\.tar\.gz$/i.test(a.name) &&
        !/\.sig$/i.test(a.name) &&
        (/aarch64|arm64/i.test(a.name) || !/x64|x86_64|amd64/i.test(a.name)),
    ) ||
    assets.find(
      (a) => /\.app\.tar\.gz$/i.test(a.name) && !/\.sig$/i.test(a.name),
    );
  if (macTar && hasSig(macTar.name)) {
    const isX64 = /x64|x86_64|amd64/i.test(macTar.name);
    picks.push({
      platform: isX64 ? "darwin-x86_64" : "darwin-aarch64",
      asset: macTar.name,
    });
  }

  return picks;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: node scripts/publish-latest-json.mjs --tag v2.4.1 [--dry-run]",
    );
    process.exit(0);
  }

  const tag = normalizeTag(args.tag);
  const version = semverFromTag(tag);
  const release = ghJson([
    "release",
    "view",
    tag,
    "--repo",
    REPO,
    "--json",
    "assets,name,tagName,publishedAt,url",
  ]);

  const picks = pickPlatformArtifacts(release.assets || []);
  if (!picks.some((p) => p.platform === "windows-x86_64")) {
    throw new Error(
      `No signed Windows MSI (.msi + .msi.sig) on ${tag}. Refusing to publish latest.json.`,
    );
  }

  const platforms = {};
  for (const pick of picks) {
    const sigAsset = (release.assets || []).find(
      (a) => a.name === `${pick.asset}.sig`,
    );
    if (!sigAsset?.apiUrl && !sigAsset?.url) {
      throw new Error(`Missing signature API URL for ${pick.asset}.sig`);
    }
    // Prefer GitHub API asset content endpoint via gh.
    const apiUrl =
      sigAsset.apiUrl ||
      `repos/${REPO}/releases/assets/${sigAsset.id}`;
    const signature = downloadText(
      apiUrl.replace(/^https:\/\/api\.github\.com\//, ""),
    );
    platforms[pick.platform] = {
      signature,
      url: `https://github.com/${REPO}/releases/download/${tag}/${pick.asset}`,
    };
  }

  const latest = {
    version,
    notes: args.notes || release.name || `CultForge ${version}`,
    pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    platforms,
  };

  const outDir = path.join(ROOT, "dist-release");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "latest.json");
  const body = `${JSON.stringify(latest, null, 2)}\n`;
  await writeFile(outPath, body, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(
    `Platforms: ${Object.keys(platforms).sort().join(", ") || "(none)"}`,
  );

  if (args.dryRun) {
    console.log(body);
    console.log("Dry run — not uploading.");
    return;
  }

  execFileSync(
    "gh",
    ["release", "upload", tag, outPath, "--repo", REPO, "--clobber"],
    { stdio: "inherit" },
  );
  console.log(
    `Uploaded latest.json → https://github.com/${REPO}/releases/download/${tag}/latest.json`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
