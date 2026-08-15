# CultForge — Website Content (`cultforge.com`)

Copy-ready content for the public marketing site. Use section headings as page blocks or routes. Tone: confident, clear, player-first — not engineering jargon.

**Tagline options (pick one for hero):**

- **Forge your world.** One launcher for builds, content, and guilds.
- **Your builds. Verified content. One place to play.**
- **The Minecraft launcher for people who run more than one life.**

**Meta description (SEO):**

> CultForge is a desktop Minecraft launcher for managing multiple builds, installing from Modrinth with verified content, guild-managed clients, and community tools — free to use.

---

## Hero

### Headline

**Forge your world.**

### Subheadline

CultForge is a desktop launcher that turns Minecraft into something you can actually manage: multiple **builds**, a built-in **Store**, **guild** releases, and friends — without living inside a pile of folders.

### Primary CTA

**Download CultForge** (Windows)

### Secondary CTA

See how it works

### Trust line (below CTAs)

Free to use · Modrinth-powered Store · Your worlds stay on your machine · EULA-aware client tooling

### Hero note (small print)

CultForge helps you launch and manage client setups. You still need a valid Minecraft license and a local game version where required. CultForge account sign-in uses Google or GitHub — not a replacement for Minecraft’s own online identity.

---

## Problem → promise (above the fold follow-up)

### Headline

Stop treating every modpack like a mystery folder.

### Body

Most launchers get you into the game once. CultForge is built for the whole loop: **discover** content, **install** it into the right build, **configure** RAM and graphics, **play**, and **stay aligned** with your guild — with progress you can see and files you can trust.

---

## What is CultForge?

CultForge is three things in one app:

1. **Build manager** — Separate instances for Forge, Fabric, NeoForge, Quilt, or Vanilla. Each build has its own mods, packs, shaders, config, notes, and playtime.
2. **Content hub** — Browse and install from **Modrinth** inside the launcher. Dependencies resolve automatically. Every install is verified before it lands in your build.
3. **Community layer** — **Guilds** publish managed client releases. **Friends**, profiles, chat, and notifications sit next to the Play button.

---

## Flagship: Content-addressed delivery

*Use this as a dedicated section on the homepage and a full page at `/content` or `/how-it-works#verified`.*

### Headline

**Content-addressed. Verified. Yours.**

### Subheadline

CultForge treats mods, packs, and guild files as **content with identity** — not anonymous downloads. Every piece has a fingerprint. The launcher checks it before install.

### What that means for you

| You get | What happens |
|--------|----------------|
| **Integrity** | Store and guild installs are checked against expected hashes before files are copied into your build. Corrupted or tampered downloads fail loudly — they don’t silently break your pack. |
| **Smart cache** | Identical content is stored once on disk and reused across builds. Less waste, faster repeat installs. |
| **Manifest-driven guild builds** | Guild releases ship as structured manifests: paths, sizes, and hashes — not “trust this zip.” Members sync to the same verified set. |
| **Clear separation** | Remote **build releases** describe client content. Your **worlds and saves** stay local — CultForge doesn’t treat player worlds as catalog cargo. |

### One paragraph (short)

When CultForge downloads a mod or guild file, it already knows what that file **should** be. After download, it compares reality to the manifest. Only then does it install into `mods`, `resourcepacks`, `shaderpacks`, or `datapacks`. That’s content-addressed delivery: **identity first, install second.**

### Visual callout (3 columns for landing page)

**1. Resolve**  
Pick a project and version in the Store, or accept a guild release. CultForge builds an install plan — including required dependencies.

**2. Verify**  
Files land in a content-addressed cache, checked against SHA-512 (and related metadata from the catalog).

**3. Install**  
Verified artifacts copy into the correct folders for your active build. Progress lives in the **Transfer Center**.

### Roadmap callout (honest, forward-looking)

**Sharing, same philosophy.**  
Today you share through Modrinth, guild releases, and export pack. Next, CultForge is designing **peer-assisted sharing** — two players exchanging packs or build slices through CultForge, with the same manifest and hash rules, so the surface feels native but delivery can happen directly between clients when it makes sense. Sign up for updates if you want early access to sharing betas.

*Do not promise a ship date on the live site unless product confirms one.*

---

## How it works

### Step 1 — Sign in

Use **Google** or **GitHub** for your CultForge account. After first login, a cached profile keeps local builds usable if services hiccup — remote guild sync and live friends pause until you’re back online.

### Step 2 — Your builds appear

CultForge discovers local Minecraft versions and CultForge instance folders. Each becomes a **Build** you can rename, configure, and launch. Guild-managed builds show up when your guild publishes releases.

### Step 3 — Add content

Open the **Store**, search Modrinth, filter by loader and Minecraft version, and install into a local build. Watch the **Transfer Center** for progress. Guild builds sync from your guild hub instead.

### Step 4 — Play

Hit **Play**. CultForge applies memory, resolution, fullscreen, and GPU preferences, launches Minecraft against your instance folder, and can minimize to the tray while you play. Session playtime accrues per build.

---

## Features (grid copy)

Use as 2×3 or 3×3 cards on `/features`.

### Builds

**Multiple lives, one launcher.**  
Forge 1.12 and NeoForge 1.20? Separate builds, separate configs. Duplicate, export, back up, open folder — without guessing which directory is which.

### Store

**Modrinth inside the app.**  
Search mods, resource packs, and shaders. Tabbed project pages, version picker matched to your build, dependency-aware installs.

### Transfer Center

**See every download.**  
Active, completed, and failed jobs in one place. No mystery progress bars on completed work.

### Guilds

**Ship a client, not a Google Drive link.**  
Managed releases, sync/repair, news, events, rankings, chat, and officer tools — for communities that care about everyone running the same verified set.

### Configuration

**Tune before you launch.**  
RAM, resolution up to your display, fullscreen, dedicated GPU preference, JVM args, tray-on-launch, and options.txt for power users.

### Performance

**Know your machine.**  
Live health telemetry and sensible optimize suggestions — RAM and JVM defaults grounded in what CultForge can see locally.

### Notes & backups

**Remember and recover.**  
Private markdown notes per build. Local snapshot backups with restore — your safety net when config experiments go wrong.

### Social

**Friends where you play.**  
Profiles, presence, DMs, notifications, and global chat — community without leaving the launcher.

### Comfort

**Lobby music, themes, tray.**  
Optional lobby audio, collapsible context bar, dark forge-themed UI, and minimize-while-playing when you want the desktop back.

---

## Guilds (dedicated section)

### Headline

**Run your server like a guild, not a group chat.**

### Body

Guilds in CultForge are more than a name tag. Officers publish **managed builds** with manifests members can install and sync. Rankings, events, news, Discord, and roster tools live in one hub. Store installs into guild-managed builds stay blocked so nobody accidentally forks the client.

**For members:** Install once, sync when the guild updates, play when status is Ready.  
**For staff:** Publish releases, push hotfixes, audit changes, transfer leadership when you need to hand off.

### CTA

Explore guilds in the launcher

---

## Store (dedicated section)

### Headline

**Modrinth, without the tab shuffle.**

### Body

Search, filter by loader and version, read project details with overview / about / versions / gallery, and install into the build you choose. CultForge resolves dependencies, verifies hashes, and places files in the right folders — mods, packs, shaders, datapacks.

**Install to** is always explicit. **No matching versions** tells you when your build’s loader doesn’t match the project — so you’re not guessing why Iris won’t install on Forge.

---

## Builds deep dive (optional `/builds` page)

### Headline

**Everything about the instance you’re playing — in one cockpit.**

| Tab | What you do |
|-----|-------------|
| Overview | Play, stats, quick actions |
| Mods | Enable / disable, filters |
| Packs & shaders | Toggle, open folder, add from disk |
| Worlds | See what’s on disk |
| Notes | Private markdown notes |
| Configuration | RAM, resolution, GPU, JVM, options.txt |
| Performance | Telemetry + optimize |
| Backups | Snapshot, restore, delete |

---

## Comparison vs old site messaging

*Internal reference — do not publish this table verbatim.*

| Old `cultforge.com` | Updated message |
|---------------------|-----------------|
| “Coming soon” | Beta / available for Windows (adjust per release) |
| Lite vs Community Edition split | Single CultForge app; social/guild features included |
| Microsoft OAuth / credentials never leave machine | Google/GitHub CultForge account; offline play name from profile; honest Minecraft license note |
| “One-click thousands of modpacks” | Modrinth browse + dependency-aware install; no fake modpack CDN |
| “Decentralized chat” (vague) | Global chat, guild chat, DMs — describe what exists |
| Linux-only download hero | Lead with Windows; Linux if/when shipped |
| “Instant launch” hype | Fast native launch with clear prerequisites |

---

## FAQ

**Is CultForge free?**  
Yes. CultForge is free to download and use. Third-party content follows its own licenses (Modrinth projects, guild releases, etc.).

**Does CultForge include Minecraft?**  
No. You need a valid Minecraft license and compatible local game files where required.

**Does CultForge log into Minecraft online for me?**  
Launch uses your CultForge profile for the offline session name. It is not a full Microsoft account login replacement for Minecraft’s online services.

**Where do mods come from?**  
The in-launcher Store browses **Modrinth**. Guild builds come from your guild’s published manifests.

**What is content-addressed delivery?**  
Every file in an install plan has an expected hash. CultForge verifies downloaded bytes against that hash before installing. Same idea powers guild sync and future sharing features.

**Are my worlds uploaded to CultForge?**  
Player worlds and saves stay on your machine. Remote builds and guild releases describe **client content**, not your personal saves.

**Can I use CultForge offline?**  
After first sign-in, cached profile mode keeps local builds and library usable when remote services are down. Guild sync and live social features need connectivity.

**Windows only?**  
The current desktop release targets **Windows**. Other platforms may follow — check the download page for what’s available today.

**Is peer-to-peer sharing available?**  
Export pack, Modrinth, and guild releases are available now. Direct player-to-player sharing with content-addressed integrity is on the roadmap — join updates if you want beta access.

**How do guild invites work?**  
Use guild invite links (e.g. `invite.cultforge.com/...`) or codes from your officers inside the launcher.

---

## Download page

### Headline

**Download CultForge**

### Body

Native desktop app. No browser extension required. Install, sign in, and your builds appear.

**System requirements (adjust per release):**

- Windows 10/11 (64-bit)  
- A supported Java installation for your Minecraft version  
- Disk space for builds, content cache, and backups  
- Internet for Store, guild sync, and account sign-in  

### Post-download steps

1. Install CultForge  
2. Sign in with Google or GitHub  
3. Confirm your handle  
4. Open **Builds** or **Store** and go  

### Agreements block (keep legal, simplify marketing)

- End User License Agreement  
- Privacy Policy  
- Telemetry (optional crash logs — disable in Settings if offered)  

*Replace old copy that overclaims Microsoft credential handling with accurate Google/GitHub + local launch language.*

---

## Footer

**CultForge** — Forge your world.

Links: Features · Content-addressed delivery · Guilds · Download · FAQ · Privacy · Terms · Discord (if public)

**Domains (product):**

- `cultforge.com` — marketing & download  
- `api.cultforge.com` — account & services  
- `guilds.cultforge.com` — guild assets  
- `invite.cultforge.com` — guild invites  

---

## Social / press blurbs

**Tweet-length:**  
CultForge — manage multiple Minecraft builds, install verified mods from Modrinth, and sync guild clients. Content-addressed installs. Forge your world.

**Discord announcement:**  
CultForge beta: builds, Modrinth Store, Transfer Center, guild manifests with hash verification, friends & profiles. Windows download at cultforge.com.

---

## Developer notes

*Optional `/about` or docs footer — keep technical detail here only.*

- CultForge desktop is a **native application** with a modern UI shell; performance-critical paths (download, verify, install, launch) use a **native layer built on Rust**.  
- Catalog and social services are backed by CultForge APIs (`api.cultforge.com`).  
- Store discovery integrates **Modrinth’s public API**.  
- **Content-addressed cache** and **SHA-512 verification** are part of the install pipeline today; peer-assisted sharing extends the same manifest model.  
- Do not publish internal repo layout, signing keys, or unreleased API contracts on the marketing site.  

---

## Page map (suggested IA)

| Route | Source section |
|-------|----------------|
| `/` | Hero, problem→promise, content-addressed teaser, feature grid, guilds teaser, CTA |
| `/features` | Full feature grid + Builds table |
| `/content` or `/verified` | Content-addressed delivery (full) |
| `/guilds` | Guilds section |
| `/store` | Store section |
| `/download` | Download page |
| `/faq` | FAQ |
| `/privacy` | Legal (existing) |
| `/terms` | Legal (existing) |

---

## Changelog vs previous site

When replacing `cultforge.com`:

1. Remove **“Coming soon”** unless truly pre-release — use **Beta** or **Download** with accurate platform.  
2. Replace **Lite / Community Edition** split with one product story.  
3. Lead with **Builds + Store + Guilds + verified content**, not generic “optimized engine.”  
4. Add **content-addressed delivery** as a differentiator — concrete, not buzzwords.  
5. Fix auth story: **Google/GitHub** CultForge account, not Microsoft OAuth for the launcher.  
6. Keep **EULA / license** honesty; drop oversold “thousands of modpacks one-click” unless true.  

---

*This file is website copy source — not legal text. Run Privacy/Terms/EULA past counsel before publish.*
