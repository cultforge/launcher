#!/usr/bin/env node
/**
 * Phase 1+ — download companion binaries allowed by Phase 0 compat.
 *
 * Usage:
 *   node scripts/fetch-companions.mjs
 *   node scripts/fetch-companions.mjs --only scanner
 *   node scripts/fetch-companions.mjs --platform windows-x86_64
 *
 * Writes into src-tauri/resources/ using the install name (scanner.exe / scanner).
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, copyFile, chmod } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const COMPAT_PATH = path.join(ROOT, "src", "data", "companions.compat.json");
const PACKAGE_PATH = path.join(ROOT, "package.json");
const RES_DIR = path.join(ROOT, "src-tauri", "resources");

const COMPANION_IDS = ["scanner", "client", "ctfgbroker"];

function parseArgs(argv) {
  const out = { only: null, platform: null, launcher: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--only") out.only = argv[++i];
    else if (a === "--platform") out.platform = argv[++i];
    else if (a === "--launcher") out.launcher = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function detectPlatform() {
  const { platform, arch } = process;
  if (platform === "win32") return "windows-x86_64";
  if (platform === "linux") return "linux-x86_64";
  if (platform === "darwin") {
    return arch === "arm64" ? "macos-arm64" : "macos-x86_64";
  }
  throw new Error(`Unsupported host platform: ${platform}/${arch}`);
}

function normalizeSemver(version) {
  return String(version).trim().replace(/^v/i, "");
}

function parseTriple(tag) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(tag).trim().replace(/^v/i, ""));
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmpSemver(a, b) {
  const pa = parseTriple(a);
  const pb = parseTriple(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function getCompatForLauncher(doc, launcherVersion) {
  const key = normalizeSemver(launcherVersion);
  if (doc.by_launcher[key]) return doc.by_launcher[key];
  const versions = Object.keys(doc.by_launcher).sort((a, b) => {
    const c = cmpSemver(a, b);
    return c ?? a.localeCompare(b);
  });
  let floor = null;
  for (const v of versions) {
    const c = cmpSemver(v, key);
    if (c == null) continue;
    if (c <= 0) floor = v;
  }
  return floor ? doc.by_launcher[floor] : null;
}

function installName(companionId, assetName) {
  if (companionId === "scanner") {
    return assetName.endsWith(".exe") ? "scanner.exe" : "scanner";
  }
  if (companionId === "client") {
    return assetName.endsWith(".exe") ? "client.exe" : "client";
  }
  if (companionId === "ctfgbroker") {
    return assetName.endsWith(".exe") ? "ctfgbroker.exe" : "ctfgbroker";
  }
  return assetName;
}

function tagAllowed(entry, tag) {
  const want = String(tag).trim();
  if (!want || entry.status !== "active") return false;
  if (entry.tag && normalizeSemver(entry.tag) === normalizeSemver(want)) {
    return true;
  }
  if (entry.min_tag) {
    const lo = cmpSemver(want, entry.min_tag);
    if (lo == null || lo < 0) return false;
  }
  if (entry.max_tag) {
    const hi = cmpSemver(want, entry.max_tag);
    if (hi == null || hi > 0) return false;
  }
  return Boolean(entry.min_tag || entry.max_tag);
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "CultForge-Companions-Fetch",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  if (!res.body) throw new Error(`Empty body from ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/fetch-companions.mjs [--only scanner] [--platform <id>] [--launcher <semver>]`);
    process.exit(0);
  }

  const pkg = JSON.parse(await readFile(PACKAGE_PATH, "utf8"));
  const doc = JSON.parse(await readFile(COMPAT_PATH, "utf8"));
  const launcher = args.launcher || pkg.version;
  const platform = args.platform || detectPlatform();
  const row = getCompatForLauncher(doc, launcher);
  if (!row) {
    throw new Error(`No companions.compat entry for launcher ${launcher}`);
  }

  const want = args.only
    ? [args.only]
    : COMPANION_IDS.filter((id) => row.companions[id]?.status === "active");

  await mkdir(RES_DIR, { recursive: true });
  console.log(`Companions fetch · launcher=${launcher} · platform=${platform}`);

  let fetched = 0;
  for (const id of want) {
    const entry = row.companions[id];
    if (!entry) throw new Error(`Unknown companion id: ${id}`);
    if (entry.status !== "active") {
      console.log(`  skip ${id} (status=${entry.status})`);
      continue;
    }
    if (!entry.repo || !entry.tag) {
      throw new Error(`${id} is active but missing repo/tag in compat`);
    }
    if (!tagAllowed(entry, entry.tag)) {
      throw new Error(`${id} tag ${entry.tag} not allowed by compat for ${launcher}`);
    }
    const asset = entry.assets?.[platform];
    if (!asset) {
      throw new Error(`${id} has no asset for platform ${platform}`);
    }
    const url = `https://github.com/${entry.repo}/releases/download/${entry.tag}/${asset}`;
    const name = installName(id, asset);
    const dest = path.join(RES_DIR, name);
    console.log(`  ${id} ← ${url}`);
    await download(url, dest);
    if (process.platform !== "win32") {
      await chmod(dest, 0o755);
    }
    // Dev resolution: also place next to workspace root for scanner/client lookup.
    const rootCopy = path.join(ROOT, name);
    await copyFile(dest, rootCopy);
    if (process.platform !== "win32") {
      await chmod(rootCopy, 0o755);
    }
    console.log(`  wrote ${path.relative(ROOT, dest)} (+ workspace ${name})`);
    fetched += 1;
  }

  if (fetched === 0) {
    console.log("No active companions to fetch.");
  } else {
    console.log(`Done: ${fetched} companion(s).`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
