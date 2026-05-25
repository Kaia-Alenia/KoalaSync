# KoalaSync Roadmap

This document tracks planned features, improvements, and their implementation details.

---

## Antworten auf offenen Fragen

### 1. Graceful Shutdown
**Korrektur:** Der Server hat bereits Graceful Shutdown implementiert (`server/index.js:481-499`). Bei SIGTERM/SIGINT wird allen Clients eine Neustart-Nachricht gesendet, der HTTP-Server geschlossen und nach 5s erzwungen beendet. **Kein Handlungsbedarf.**

### 6. Service Worker Fallback bei Room-State Verlust
Manifest V3 suspendiert den Service Worker nach ~30s Inaktivität. `chrome.alarms` weckt ihn auf, aber:
- **Problem:** Wenn der SW neu startet, sind alle Variablen (`currentRoom`, `socket`, `isNamespaceJoined`) weg
- **Aktueller Stand:** `chrome.storage.session` persistiert `currentRoom`, `peerId`, `eventQueue` — der SW stellt diese beim Start wieder her (`restoreSession()`)
- **Lücke:** Der WebSocket muss neu aufgebaut werden. Das passiert automatisch via `connect()`, aber es gibt eine **Zeitlücke** von 2-5 Sekunden in der Events verloren gehen können. **Verbesserung:** Queue-Events während Reconnect, visualisiere "Reconnecting..." im Popup.

### 7. Tests für Extensions
Stimmt, sind aufwändig. Praktische Ansätze:
- **Unit Tests:** `jest` + `jest-chrome` (mockt `chrome.*` APIs) — testet `popup.js` Logik, Server-Logik
- **Integration Tests:** `puppeteer` mit `--load-extension` Flag — testet Extension im echten Browser
- **Server Tests:** `supertest` + `socket.io-client` — testet WebSocket-Flows
- **Aufwand:** ~400-600 LOC für sinnvolle Testabdeckung der Kernlogik

---

## Zukünftige Features

Neue Features werden nur nach expliziter Freigabe hinzugefügt.
