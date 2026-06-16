KoalaSync: Private Watch Parties for Emby, Jellyfin, Plex, Netflix & YouTube

Tired of counting down "3, 2, 1, Play" over voice chat? KoalaSync keeps you and your friends perfectly in sync. Whether you are streaming from your own self-hosted media server like Emby, Jellyfin or Plex, or watching on a major platform like Netflix, Prime Video or YouTube — KoalaSync is designed for smooth, browser-based watch parties.


✨ CORE FEATURES
No account required. No tracking. Just create a room, invite your friends, and start watching together.

• Real-Time Video Sync: Play, pause, seek, and watch together with fast synchronized playback across everyone in your room.
• No Account Needed: Create a room and share the invite link. No emails, no passwords, no sign-ups. Pick a nickname or let KoalaSync generate one for you.
• Works Almost Everywhere: If the website uses a standard HTML5 video player, KoalaSync can usually sync it. Perfect for streaming sites, self-hosted media servers, and other websites.
• Smart Binge-Watching: When a new episode loads, KoalaSync automatically pauses the lobby until everyone is ready. No spoilers, no one left behind.
• Smart Audio Compressor: Tired of quiet dialogue and suddenly loud action scenes? Balance whispering, explosions, and music with a single click while you watch.
• One-Click Invites: Send a smart invite link to your friends. When they open it, KoalaSync automatically configures the room so they can join instantly.
• 13 Languages: Enjoy a native experience with a fully translated user interface.



🛡️ PRIVACY & SECURITY
KoalaSync is built for private watch parties without unnecessary data collection.

• No Tracking: Zero analytics, zero telemetry, and absolutely no behavior profiling.
• Anonymous by Design: No accounts needed. Rooms can be joined with a simple nickname.
• Ready Out of the Box: Install KoalaSync and start watching immediately using the official public relay server. No technical setup required.
• RAM-Only Public Server: The official relay server operates entirely in volatile RAM. No databases, no stored watch history, no persistent room data. Room data exists only temporarily and disappears when the room closes.
• Self-Hostable: Want full control? You can run your own private KoalaSync relay server via Docker in seconds. Self-hosting is optional and never required.



🚀 HOW IT WORKS
1. Install KoalaSync.
2. Click "Create Room" to start a private watch party.
3. Share the invite link with your friends.
4. Open your favorite streaming site or media server.
5. Select the active video tab.
6. Press play — everyone stays perfectly in sync.



⚙️ UNDER THE HOOD
KoalaSync is lightweight, transparent, and built with privacy in mind.

• On-Demand Relay: Playback state is synchronized through a custom WebSocket-based relay server. No persistent connection — the relay is only active while you're in a room. No background traffic, no idle connections.
• No Media Streaming: KoalaSync does not stream, proxy, upload, download, or redistribute any video content. Everyone watches from their own browser on the original website.
• Temporary Room State Only: The relay server only coordinates room state such as play, pause, seek position, active target, nickname, and readiness status.
• Docker Self-Hosting: The relay server can be self-hosted with Docker if you prefer to run your own private instance.
• Open Architecture: The project is designed to be inspectable, forkable, and easy to review.



💻 OPEN SOURCE
KoalaSync was built by a solo developer who needed a fast, secure way to watch movies with friends. The code is fully transparent under the MIT license: audit it, fork it, improve it, or self-host your own relay server.

Found a bug or have a feature idea? Open an issue on GitHub. Contributions and code reviews are always welcome.

• Website: https://sync.koalastuff.net
• GitHub: https://github.com/Shik3i/KoalaSync
