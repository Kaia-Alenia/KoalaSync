# Privacy Policy

KoalaSync is built with a **Privacy-First** architecture. We believe that your browsing habits and watch history are your business, not ours.

## 1. Zero External Requests
The KoalaSync extension and its official marketing website are designed to be completely self-contained.
- **No CDNs**: We do not load scripts or styles from external Content Delivery Networks.
- **No Google Fonts**: We use a modern system font stack to avoid tracking by third-party font services.
- **No Analytics**: There are no tracking pixels, telemetry, or analytics scripts (like Google Analytics or Mixpanel) in the codebase.

## 2. Data Sovereignty
- **Self-Hostable**: You can host your own relay server using our Docker image, giving you 100% control over your data.
- **Memory-Only State**: The relay server stores all room data in RAM. Nothing is written to a database or disk. When a room is empty, it is purged immediately.
- **No Logs**: The official relay server (`sync.shik3i.net`) does not log user IP addresses or room activity.

## 3. Extension Permissions
KoalaSync requires the following permissions to function:
- `storage`: To remember your username and server preferences locally.
- `tabs` & `scripting`: To detect video elements on pages you visit so they can be synchronized.
- `<all_urls>`: Necessary because KoalaSync works on any website with a `<video>` tag.

## 4. Zero Data Collection
We do not collect, store, or sell any personal information. Your `peerId` and `username` are stored only on your local device and transmitted only to the relay server you choose to connect to.

---

**KoalaSync is and always will be Open Source.** You are encouraged to audit the code yourself on [GitHub](https://github.com/Shik3i/KoalaSync).
