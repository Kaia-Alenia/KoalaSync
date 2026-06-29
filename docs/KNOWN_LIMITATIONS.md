# Known Limitations & Accepted Non-Issues (NOFIX)

This file records design decisions that are **intentional** and **out of scope** for
KoalaSync's threat model. They are frequently re-discovered by reviewers, linters, and
AI agents and re-reported as "bugs" or "vulnerabilities." They are not. Please read the
threat model below before flagging any of them.

> **For reviewers & agents:** Do **not** re-report the NOFIX items below. They are
> deliberate. If you think the *threat model itself* should change (e.g. KoalaSync
> starts handling accounts, payments, or sensitive data), raise **that** discussion
> first — these items only stand because the threat model holds.

---

## Threat model

KoalaSync is a **privacy-preserving watch-party sync tool**, not a security product.

- **Rooms are ephemeral.** They exist for a few hours and are auto-reaped. There are no
  accounts, no persistent storage, no money, and no sensitive content on the relay.
- **The relay is a dumb, stateless message bus.** It forwards play/pause/seek between
  peers who *chose* to watch together and joined via an invite link shared out-of-band.
- **Participants are invited.** Anyone in a room was let in. The social contract is
  "we're watching a video together," not "mutually distrusting parties."

### What we DO defend against
- **Accidental disruption** — the entire point of Host Control Mode.
- **Spam / DoS** that degrades the relay for everyone — rate limits, 4 KB payload cap,
  server-side gating, lazy-cached health responses.
- **Resource exhaustion / memory leaks** — bounded maps, periodic cleanup, room/peer reaping.
- **Crashes from malformed input** — strict sanitization and clamping of every field.
- **Genuine boundary breaches** — admin-metrics auth (constant-time), CORS, WSS upgrade,
  invite-hash isolation, strict CSP. Reports here are very welcome (see `SECURITY.md`).

### What we explicitly DO NOT defend against
A **determined participant who modifies their own client to misbehave inside a room they
were invited to.** The worst they achieve is sending playback commands or seizing the
"host" role in a temporary room they could already disrupt by other means. That is a
**social** problem, solved socially: kick them, or start a new room. Engineering real
identity/auth to prevent it would destroy the account-less, frictionless, privacy-first
design — a bad trade for an ad-hoc movie night.

---

## NOFIX entries

### NOFIX-1 — `peerId` is unauthenticated; a crafted client can impersonate or seize the host
**Flag:** `peerId` is client-asserted and broadcast to every peer (in `ROOM_DATA` /
`PEER_STATUS`). A modified client can join with the host's `peerId`, dedupe-kick the real
host, and become host — controlling or locking `host-only` mode.

**Why NOFIX:** Requires a *modified client* + an *invited* participant + a `peerId` that is
only meaningful inside that one *temporary* room. The payoff is sending play/pause or
locking a room the attacker is already in — pure trolling, instantly reversible (kick /
new room). Cryptographic per-user identity is wildly disproportionate for an ad-hoc,
account-less, ephemeral watch party. **Out of threat model.**
Do **not** "fix" with accounts, signed peerIds, or per-user tokens — that breaks the
core design.

### NOFIX-2 — Room-password comparison is not constant-time
**Flag:** room password hashes are compared with `!==` (`server/index.js`), so the compare
is theoretically timing-attackable.

**Why NOFIX:** The compared value is an **HMAC-SHA256 hash that never leaves the server** —
an attacker cannot observe it to mount a timing attack. Even a hypothetical success only
lets someone join a *temporary* room to send playback commands. Not worth defending.
(The admin-metrics bearer token — a real boundary — **does** use `crypto.timingSafeEqual`.
That is the line we actually guard.)

### NOFIX-3 — `OFFICIAL_SERVER_TOKEN` is public in the repo
**Flag:** the connection token in `shared/constants.js` is committed, so anyone can connect.

**Why NOFIX:** It is a **coarse filter** to keep random scanners off the relay, **not
authentication**. The relay is a public message bus by design; rate limits and per-room
behavior are the real protections.

### NOFIX-4 — Room IDs are enumerable via `GET_ROOMS`
**Flag:** any connected client can list all room IDs (and whether each has a password).

**Why NOFIX:** This is the intended **"Public Rooms"** feature. Rooms wanting privacy set a
password; listing the IDs of password-less rooms only lets someone join a watch party —
the same as being handed the invite link.

### NOFIX-5 — A pause/seek can only be reverted, not prevented
**Flag:** in `host-only` mode a guest's pause still fires locally before the extension can
react, so there is a brief flicker before snap-back.

**Why NOFIX:** A content script cannot intercept a `<video>` event before the element
acts. Reacting (snap-back) is the only option and is by design; the ~½s flicker is
acceptable. Not a bug.

---

## Not NOFIX — just deferred (may be revisited)

These are *not* accepted-forever; they are scoped out of v1 and tracked separately
(see the host-control-mode design docs in `docs/`):

- **Host grace on a long disconnect (EC-10).** A brief reconnect/second-tab keeps the host
  (handled), but a long real disconnect still falls back to `everyone`. A ~30s host-reserve
  grace could be added later.
- **Intent-classifier / snap-back tuning.** Thresholds are first-pass; real-device testing
  may adjust them.
