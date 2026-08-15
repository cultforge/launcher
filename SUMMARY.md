# CultForge — Product Summary

CultForge is a desktop launcher for Minecraft built around **builds**, **content**, and **guilds**. It is designed for players who run more than one setup, care about clean installs, and want community features without abandoning the comfort of a modern launcher.

This document is written for the public website: what CultForge is, how it works at a high level, and what you can do with it.

---

## What is CultForge?

CultForge is a Minecraft launcher and content hub. Instead of treating every install as a loose folder of mods, it organizes play around **Builds** — tailored client setups that combine:

- A Minecraft version  
- A loader (Forge, Fabric, NeoForge, Quilt, or Vanilla)  
- Mods, resource packs, shaders, and configuration  
- Optional guild / server metadata  

Builds are how you play. The Store is how you find content. Guilds are how groups share managed setups. Your profile, friends, and chat sit on top so the launcher feels like a home base — not only a download button.

CultForge is for:

- Solo players juggling multiple modpacks or performance profiles  
- Friends who want shared guild builds without chaotic zip swapping  
- Creators and communities publishing curated content  
- Anyone who wants Modrinth browsing, install progress, and instance tools in one place  

---

## How it works (at a glance)

### 1. Sign in

You sign in with Google or GitHub through CultForge’s account flow. After the first successful login, CultForge can keep a **cached profile** so local play and your library still work if remote services are briefly unavailable. Remote actions (guild sync, live friends, etc.) pause until the service is reachable again.

Your CultForge identity (name / handle) is used for the offline player name when launching Minecraft. CultForge does **not** replace Microsoft account login for Minecraft’s own online multiplayer identity; launch is oriented around your CultForge profile and local game files.

### 2. Discover your builds

On first run and afterward, CultForge looks at your local Minecraft versions and CultForge instance folders. Each playable setup becomes a **Build** you can switch, configure, and launch.

Guild-managed builds can also appear when you belong to a guild that publishes releases. Those installs stay aligned with the guild’s published content.

### 3. Play from Home or Builds

Pick a build, hit **Play**. CultForge prepares the instance folder, applies your memory / resolution / fullscreen preferences, starts the game, and can tuck the launcher into the system tray while you play. When the game exits, CultForge returns and can record session playtime for that build.

### 4. Add content from the Store

The **Store** browses Modrinth. Search mods, resource packs, shaders, and more; filter by loader and Minecraft version; open a project; choose a compatible version; install into a local (non–guild-locked) build. Dependencies are resolved into a single install job. Progress shows up in the **Transfer Center** (Downloads).

### 5. Stay with your community

**Guilds** give you news, events, rankings, chat, Discord, servers, and managed builds. **Friends** and **profiles** keep social context next to the play button. Notifications, DMs, and global chat round out the day-to-day loop.

---

## Core concepts

### Builds

A **Build** is a CultForge-managed client instance: game version, loader, mods, packs, shaders, configs, and launcher settings. Player worlds and saves are personal to your machine; remote “build releases” are about shared client content, not shipping someone else’s worlds.

Each build has:

- Identity (name, Minecraft version, loader)  
- Content (mods, packs, shaders, worlds as scanned locally)  
- Settings (memory, resolution, fullscreen, GPU preference, JVM options, tray behavior)  
- Notes (private to that build)  
- Play history / playtime for that instance  

### Local vs guild-managed

| | Local builds | Guild-managed builds |
|--|--|--|
| Who owns content | You | Guild release / manifest |
| Store installs | Allowed (with a valid install path) | Blocked — content comes from the guild |
| Edit / duplicate | Supported | Restricted / protected |
| Sync | Optional personal workflow | Sync / repair against guild release |

### Transfer Center

Store installs and similar jobs flow through a **Transfer Center**: active downloads, completed installs, and issues. You see progress, cancel in-flight work, and clear finished items when you are done.

---

## Features by area

### Home

- Continue / play the active build  
- Switch between builds quickly  
- Recent activity and quick actions (open folder, settings, export, duplicate, and related shortcuts)  
- Featured Modrinth content to discover addons  
- Live system feel (performance overview where shown)  
- Lobby music controls in the launcher chrome  

### Builds

The Builds area is the main cockpit for one instance at a time.

**Overview**

- Hero presentation of the active build  
- Play / running state  
- At-a-glance stats (version, loader, mods, playtime, location)  
- Screenshots / media when available  
- Quick actions: edit settings, open folder, export pack, duplicate, backup entry points  

**Mods**

- List installed mods from the instance  
- Enable / disable  
- Filter (all / enabled / disabled; updates when available)  
- Respect guild locks on managed builds  

**Resource packs & shaders**

- Browse packs and shader packs for the active build  
- Toggle / select what the game should use  
- Open the packs folder and add packs from disk (local builds)  

**Worlds**

- See scanned worlds under the instance  
- Lightweight world tools (e.g. seed / folder-oriented actions where provided)  

**Notes**

- Private notes per build  
- Markdown-friendly writing with preview so setup quirks and reminders stay readable  

**Configuration**

- Memory min / max  
- Resolution presets up to your display’s supported range  
- Fullscreen  
- Dedicated GPU preference (where the OS allows)  
- JVM arguments and optional launch wrapper  
- Close / minimize launcher on launch  
- Advanced options.txt editing for local builds (read-only when guild-managed)  

**Performance**

- Live telemetry (CPU / memory / related health) while you use the launcher  
- Shortcuts into configuration and practical optimize suggestions (RAM / JVM defaults grounded in your machine)  

**Backups**

- Create local snapshots of an instance  
- Restore or delete snapshots from the Backups view  
- Keep a short rolling history so recovery stays manageable  

**Library**

- Cross-build view of mods, packs, shaders, datapacks, and worlds so you can see what lives where without opening every instance  

### Store (Modrinth)

- Search and filter Modrinth projects (mods, packs, shaders, and related types)  
- Loader and Minecraft version filters  
- Project detail with overview, about, versions, and gallery-style navigation  
- Install into a chosen build with a clear “install to” target  
- Compatible version selection (and “show all” when you need to override filters)  
- Dependency-aware install planning  
- Integrity-minded download and install into the correct instance folders  

### Downloads / Transfer Center

- Session queue of Store (and related) jobs  
- Active / completed / issues filters  
- Hero progress while work is in flight  
- Cancel, clear completed, and open downloads from the header or home shortcuts  

### Guilds

- Switch between guilds you belong to  
- Hub: overview, news, events, rankings, chat, Discord, servers, builds, members  
- Managed build catalog: install / update / sync guild releases  
- Rankings (e.g. weekly XP, raid kills, playtime — as configured by the guild)  
- Events with RSVP-style participation where enabled  
- Officer / leader **Manage** tools: news, events, rankings, servers, builds, forms, hotfixes, Discord, roster, audit  
- Leadership transfer for guild ownership handoff  

Related community surfaces:

- Activity feed  
- Find players  
- Forums  
- Servers browse (featured / guild-oriented listings)  

### Friends & profile

- Friends roster with presence when online services are available  
- Cached roster fallback when offline  
- Player profiles: overview, stats, rankings, activity  
- DMs and notification drawer  

### Discord

- Personal Discord widget / guild source from settings  
- Guild Discord surfaces inside the guild hub  

### Settings

- Appearance and themes  
- General launcher preferences  
- Audio / lobby music (volume, mute, play on launch, lyrics widget behavior)  
- Notifications  
- Paths and Java default hint  
- Linked accounts  
- Sign out / account controls  

### Launcher chrome & comfort

- Context bar with version, lobby music / spectrum, download or idle status, and quick links  
- Collapsible context bar so content pages keep full focus  
- System tray minimize while Minecraft runs (global and per-build options)  
- Crash awareness: when a session fails badly, CultForge can capture logs and a content snapshot into a crash report under the instance  

### Discover & Updates

- Discover: launcher / community news-style feed  
- Updates: pending launcher, build, or content updates with filters and status  

---

## Launch experience

1. Select a build that has a real install location and a linked Minecraft version available locally.  
2. CultForge applies configuration (memory, window size, fullscreen, GPU preference, JVM args, wrapper).  
3. The game starts against the CultForge instance folder as the game directory.  
4. Optionally, CultForge minimizes to the tray and pauses lobby music / heavy idle work.  
5. On exit, the window returns; playtime can update for that build; crashes can produce a report.  

Guild-managed builds may require a successful sync before Play is allowed.

---

## Content & safety principles (product-facing)

- **Builds are client setups**, not a vehicle for shipping other players’ worlds through the catalog.  
- **Guild-managed content is enforced** so members stay on the published set.  
- **Store installs verify and place files** into the right folders for the chosen build.  
- **Private notes stay on the build** — they are not guild-synced.  
- **Cached login** keeps local play usable when the network blips; it does not silently invent remote powers.  

---

## Who CultForge is for

- **Everyday players** who want one place for packs, shaders, and multiple Minecraft setups  
- **Power users** who care about RAM, resolution, GPU preference, and JVM tuning  
- **Guilds and servers** that need managed builds, news, events, and rankings  
- **Social players** who want friends, profiles, and chat beside the Play button  

---

## What CultForge is not (honest boundaries)

These help set expectations on the website:

- It is **not** a replacement for installing a base Minecraft version on your machine when one is required to launch.  
- It does **not** currently promise full Microsoft / Xbox online session login for Minecraft itself; launch uses your CultForge profile name in an offline-oriented session model.  
- It does **not** auto-download and install Java for you; you point CultForge at a suitable Java where needed.  
- Peer-to-peer “torrent-style” build sharing between two clients is **not** a shipped product surface today. Sharing today is through Store / Modrinth, export pack, and guild-managed releases.  
- Some community listings (servers, updates) continue to mature; treat them as living surfaces, not a finished public server directory promise.  

---

## Typical journeys

### “I just want to play my Forge pack”

Open Builds → select the pack → check Configuration if you need more RAM → Play.

### “I want Sodium / Iris / Create”

Open Store → search → open the project → pick a version that matches your build’s loader and Minecraft version → Install to that build → watch Transfer Center → Play.

### “My guild ships a client”

Join / open the guild → Builds → install or sync the managed release → Play when Ready. Store installs into that build stay blocked so the guild set stays clean.

### “I broke options.txt”

Open Builds → Configuration → edit or restore from a backup snapshot if you created one → Play again.

### “I need two copies of a build”

Use Duplicate: full clone for a complete copy, or a custom duplicate when you only want mods / packs / worlds / config subsets.

---

## Design & experience notes (website tone)

CultForge aims for:

- A dark, focused desktop UI with clear primary actions (Play, Install, Sync)  
- Separation between **browsing content** (Store) and **owning instances** (Builds)  
- Guild tools that feel like a small ops console without leaving the launcher  
- Comfort features (music, tray, themes) that do not get in the way of launching  

---

## Developer notes

_Non-sensitive implementation hints for the site’s tech / about page. Keep this section short and public-safe._

- CultForge is a **native desktop application** with a modern web UI shell.  
- Performance-sensitive work (downloads, hashing, install, launch, filesystem) runs in a **native layer built on top of Rust**.  
- Catalog, account, guild, and social data are served through CultForge’s backend services; the desktop app remains usable for local builds when those services are briefly unreachable (cached profile).  
- Content discovery for third-party projects integrates with **Modrinth**.  
- Exact frameworks, internal APIs, signing keys, infrastructure topology, and unpublished roadmaps are intentionally omitted from public marketing copy.  

---

## One-line pitch

**CultForge is the Minecraft launcher for people who run many builds, install content cleanly, and play with guilds — without living inside a pile of folders.**

---

## Short feature checklist (for landing page grids)

- Multi-build instance manager  
- One-click Play with per-build settings  
- Modrinth Store with dependency-aware installs  
- Transfer Center for download progress  
- Mods / packs / shaders / worlds management  
- Private build notes  
- Local backups & restore  
- Memory, resolution, fullscreen, GPU preference  
- Performance overview & optimize helpers  
- Guild hubs, managed builds, rankings, events  
- Friends, profiles, DMs, notifications  
- Lobby music & system tray idle  
- Themes & appearance settings  
- Offline-friendly cached session for local play  

---

*This summary describes CultForge as a product for website and onboarding use. Feature availability can vary by version; prefer “available in the current desktop app” language for shipping claims.*
