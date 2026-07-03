# KoalaSync — Marketing Copy Kit

Ready-to-paste copy for product listings, launch pages, directory submissions, and anywhere else you keep re-typing the same pitch. Three lengths, one consistent message. Pick the one that fits the field limit.

---

## 1. One-Sentence Pitch

> KoalaSync is a privacy-first browser extension that synchronizes video playback across almost any website so you can watch with friends in real time — no accounts, no tracking, and your video never passes through anyone's server but the original site's.

**Shorter alternative** (for tight tagline fields):

> Private, universal watch parties on any website — no accounts, no tracking, no media proxying.

---

## 2. Three-Sentence Overview

> KoalaSync is a lightweight browser extension that keeps you and your friends perfectly in sync on YouTube, Netflix, Twitch, Prime Video, Jellyfin, Emby, and almost any other site with an HTML5 video player — press play once and everyone stays together. It's built privacy-first: no accounts, no telemetry, and the official relay server runs entirely in volatile RAM with zero persistence, so nothing about your sessions is ever stored. Open source under the MIT license and fully self-hostable with a single Docker command, KoalaSync is a transparent watch-party tool that works everywhere and respects your data sovereignty.

---

## 3. Full Description

### Watch together — on any site, on your terms.

Counting down "3, 2, 1, play" over voice chat doesn't scale past two people. KoalaSync fixes that with a tiny browser extension that synchronizes play, pause, and seeking across everyone in the room, on almost any website with a `<video>` element. Create a room, share a link, press play — that's it.

### What makes KoalaSync different

Most watch-party tools fall into one of two traps: they only work on a short allowlist of sites (site-specific extensions that need a separate build for every platform), or they route your video through their own player and servers. KoalaSync was built around three principles that break that mold.

**Universal by design.** If the site has an HTML5 `<video>` element, KoalaSync can usually sync it. YouTube, Netflix, Twitch, Prime Video, Disney+, Jellyfin, Emby, and countless niche sites work out of the box — no per-site integration to wait for, no extension swap when your friends want to switch services.

**Your video never touches our servers.** KoalaSync only relays tiny timing messages — play, pause, seek position, readiness — over a hand-rolled WebSocket protocol. The actual video keeps streaming directly from the original site to each viewer's browser. KoalaSync never proxies, transcodes, uploads, or redistributes a single frame, which also means there is no legal gray zone around redistribution.

**Privacy is the default, not an upgrade.** No accounts, no emails, no telemetry, no analytics, no behavior profiling. The official relay server runs entirely in volatile RAM and keeps zero persistent state — when the room closes, the data is gone. Pick a nickname or let KoalaSync generate one for you and you're in.

### Built for people who actually want to read the code

KoalaSync is MIT-licensed open source, built by a solo developer. Audit it, fork it, change it. The extension is dependency-free with a direct Socket.IO wire implementation — no opaque libraries, no framework bloat, no surprise third-party SDKs. Want full sovereignty? Self-host your own relay with a single Docker command and keep all watch-party coordination traffic inside your own infrastructure. The official public relay is there when you don't care, self-hosting is there when you do.

### Little touches you'll notice

- **Episode Auto-Sync** pauses the room when someone loads the next episode and resumes only when everyone is ready — no spoilers, no one left behind on the previous cliffhanger.
- **Smart Audio Compressor** tames the modern "whisper dialogue, deafening explosion" mix with one click. Three presets or full manual control over threshold, ratio, attack, and release.
- **One-click invite links** auto-configure the server and room for your friends — they just click the link and they're in. No fumbling with server URLs or room IDs.
- **Dual-heartbeat architecture** kills ghost rooms and stale connections before they desync your session.
- **15 languages** fully translated and switchable in real time from the settings panel — English, German, French, Spanish, Portuguese (Brazil + European), Russian, Italian, Polish, Turkish, Dutch, Japanese, Korean, Chinese, Ukrainian.

### Install and start in under a minute

Install KoalaSync from the Chrome Web Store or Firefox Add-ons, click "Create Room," share the invite link, and pick a video. The official relay is ready out of the box — no setup required unless you want to self-host.

- Website: https://sync.koalastuff.net
- GitHub: https://github.com/Shik3i/KoalaSync

---

## Bonus: Taglines (for hero headlines, social bios, meta descriptions)

- Watch together. Anywhere. Privately.
- The watch-party tool that works on every site and tracks none of them.
- Sync play, pause, and seek on any video — no accounts, no logs, no lock-in.
- Self-hostable, open-source watch parties for the post-"3, 2, 1, play" era.
- Press play once. Stay together anywhere.
