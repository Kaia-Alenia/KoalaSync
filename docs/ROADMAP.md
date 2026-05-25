# KoalaSync Roadmap

This document tracks planned features, improvements, and their implementation details.

---

## Antworten auf offene Fragen

### 1. Graceful Shutdown
**Korrektur:** Der Server hat bereits Graceful Shutdown implementiert (`server/index.js:481-499`). Bei SIGTERM/SIGINT wird allen Clients eine Neustart-Nachricht gesendet, der HTTP-Server geschlossen und nach 5s erzwungen beendet. **Kein Handlungsbedarf.**

### 2. `/health` Endpoint Rate Limiting
Ja, sollte rate-limitiert werden. Aktuell ist `/` ein offener GET-Endpoint. Ein Angreifer könnte diesen endlos pollen. Lösung: Einfacher IP-basierter Rate-Limiter (ähnlich wie bei WebSocket-Connections) mit 60 Requests/Minute pro IP.

### 3. `setInterval(refreshLogs, 5000)` Last
5 Sekunden ist technisch wenig Last (~0.2 IPC calls/sec). Aber es ist **architektonisch unsauber** — der Interval läuft auch wenn der Dev-Tab nicht sichtbar ist. Besser: Nur pollen wenn Dev-Tab aktiv, oder auf `chrome.runtime.onMessage` umstellen (Push statt Poll).

### 4. `startInterpolation()` Memory Leak
**Ja, echtes Problem.** Wenn das Popup geschlossen wird, läuft `interpolationInterval` weiter im Service Worker Kontext. Bei jedem Popup-Öffnen wird ein neuer Interval erstellt (`if (interpolationInterval) return;` schützt nur vor Duplikaten innerhalb derselben Instanz). Über Zeit summieren sich verwaiste Intervals. Fix: `window.addEventListener('unload')` oder Popup-Lifecycle-Listener.

### 5. `<video>`-Element dynamisch entfernt (SPA-Navigation)
Der `MutationObserver` (`content.js:523-532`) erkennt DOM-Änderungen und ruft `checkVideo()` auf. Was passieren sollte:
- **Video entfernt:** Event-Listener cleanen, `lastVideoSrc` zurücksetzen, Heartbeat pausieren (kein Video = nichts zu syncen)
- **Neues Video erscheint:** `setupListeners()` aufrufen, neue Event-Listener attachen, Heartbeat fortsetzen
- **Aktueller Stand:** `checkVideo()` erkennt neue Videos, aber wenn das Video komplett verschwindet, laufen die alten Listener ins Leere und `sendHeartbeat()` returned early (`if (!video) return;`). **Verbesserung:** Explizites Cleanup wenn kein Video mehr gefunden wird.

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

## Phase 1: UI/UX Quick Wins (nächstes Release)

### 1.1 Toast-Benachrichtigungssystem

**Ziel:** Zentrales Toast-System für Success/Error/Info/Warning Nachrichten. Ersetzt `showError()` mit Shake-Animation.

**Dateien:** `extension/popup.html`, `extension/popup.js`

**Implementierung:**

1. **HTML-Struktur** (in `popup.html`, nach `<body>`):
```html
<div id="toast-container" style="position:fixed; top:0; left:0; right:0; z-index:9999; display:flex; flex-direction:column; align-items:center; pointer-events:none;"></div>
```

2. **CSS** (in `<style>` in `popup.html`):
```css
.toast {
    pointer-events: auto;
    padding: 10px 16px;
    margin-bottom: 6px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    max-width: 280px;
    text-align: center;
    animation: toastSlideIn 0.3s ease-out, toastFadeOut 0.3s ease-in 2.7s forwards;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.toast-success { background: var(--success); color: white; }
.toast-error { background: var(--error); color: white; }
.toast-info { background: var(--accent); color: white; }
.toast-warning { background: #f59e0b; color: white; }

@keyframes toastSlideIn {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
}
@keyframes toastFadeOut {
    from { opacity: 1; }
    to { opacity: 0; transform: translateY(-10px); }
}
```

3. **JavaScript** (in `popup.js`):
```javascript
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}
```

4. **Integration:**
   - `showError(msg)` ersetzen durch `showToast(msg, 'error')`
   - Peer joined/left: `showToast(\`${username} joined\`, 'success')`
   - Play/Pause/Seek empfangen: `showToast(\`${username} ▶ Play\`, 'info', 2000)`
   - Force Sync: `showToast('Force Sync initiated', 'warning')`
   - Connection status: `showToast('Connected', 'success')`

**Aufwand:** ~80 LOC
**Nutzen:** 9/10 — Sofort spürbare UX-Verbesserung

---

### 1.2 Tab-Sortierung (Target Tab Dropdown)

**Ziel:** Target Tab Dropdown sortieren: (1) Aktiver Tab zuerst, (2) Matches, (3) Rest alphabetisch.

**Dateien:** `extension/popup.js` — Funktion `populateTabs()`

**Implementierung:**

In `populateTabs()` nach dem Filtern (ca. Zeile 455):

```javascript
// Sortierung: 1. Aktueller Tab, 2. Matches, 3. Rest
const currentTabId = currentTargetTabId ? parseInt(currentTargetTabId) : null;

options.sort((a, b) => {
    const aId = parseInt(a.value);
    const bId = parseInt(b.value);
    
    // 1. Aktiver Tab zuerst
    if (aId === currentTabId) return -1;
    if (bId === currentTabId) return 1;
    
    // 2. Matches vor Nicht-Matches
    const aMatch = a.textContent.includes('⭐');
    const bMatch = b.textContent.includes('⭐');
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    
    // 3. Alphabetisch innerhalb der Gruppen
    return a.textContent.localeCompare(b.textContent);
});
```

**Aufwand:** ~15 LOC
**Nutzen:** 7/10 — Intuitivere Tab-Auswahl

---

### 1.3 Copy-to-Clipboard Feedback (Invite Link)

**Ziel:** Besseres visuelles Feedback beim Kopieren des Invite-Links.

**Dateien:** `extension/popup.js` — `elements.copyInvite` Event Listener

**Implementierung:**

Bestehenden Handler (Zeile 893-897) ersetzen:

```javascript
elements.copyInvite.addEventListener('click', () => {
    navigator.clipboard.writeText(elements.inviteLink.value).then(() => {
        const original = elements.copyInvite.textContent;
        elements.copyInvite.textContent = '✓';
        elements.copyInvite.style.background = 'var(--success)';
        elements.copyInvite.style.color = 'white';
        showToast('Invite link copied!', 'success', 2000);
        setTimeout(() => {
            elements.copyInvite.textContent = original;
            elements.copyInvite.style.background = '';
            elements.copyInvite.style.color = '';
        }, 2000);
    });
});
```

**Aufwand:** ~10 LOC
**Nutzen:** 6/10 — Kleines aber feines Detail

---

### 1.4 Last Action Card mit targetTime

**Ziel:** Bei Seek/Force Sync die `targetTime` in der Last Action Card anzeigen.

**Dateien:** `extension/popup.js` — Funktion `updateLastActionUI()`

**Implementierung:**

In `updateLastActionUI()` nach dem Header (ca. Zeile 179):

```javascript
// targetTime für Seek/Force Sync anzeigen
if (state.targetTime !== undefined && state.action === 'seek') {
    const timeInfo = document.createElement('div');
    timeInfo.style.cssText = 'font-size:9px; color:var(--text-muted); margin-top:4px;';
    timeInfo.textContent = `Target: ${formatTime(state.targetTime)}`;
    elements.lastActionCard.appendChild(timeInfo);
}

if (state.targetTime !== undefined && state.action.includes('force_sync')) {
    const timeInfo = document.createElement('div');
    timeInfo.style.cssText = 'font-size:9px; color:var(--text-muted); margin-top:4px;';
    timeInfo.textContent = `Sync to: ${formatTime(state.targetTime)}`;
    elements.lastActionCard.appendChild(timeInfo);
}
```

**Aufwand:** ~15 LOC
**Nutzen:** 7/10 — Mehr Kontext bei Sync-Actions

---

### 1.5 Verbesserte Empty States

**Ziel:** Aussagekräftigere Empty States mit Icons und Hilfetexten.

**Dateien:** `extension/popup.html`, `extension/popup.js`

**Implementierung:**

Ersetze generische "No peers connected" / "No activity yet" Texte:

```javascript
// In updatePeerList() und updateHistory():
const emptyStates = {
    peers: {
        icon: '👥',
        title: 'No peers yet',
        hint: 'Share your invite link to get started'
    },
    history: {
        icon: '📋',
        title: 'No activity yet',
        hint: 'Play, pause, or seek to see history'
    },
    logs: {
        icon: '📝',
        title: 'No logs',
        hint: 'Connection events will appear here'
    },
    rooms: {
        icon: '🔍',
        title: 'No active rooms',
        hint: 'Create a room or refresh to find public ones'
    }
};

// Render-Funktion:
function renderEmpty(container, type) {
    const state = emptyStates[type];
    container.innerHTML = `
        <div style="text-align:center; padding:16px 8px; color:var(--text-muted);">
            <div style="font-size:24px; margin-bottom:6px;">${state.icon}</div>
            <div style="font-size:12px; font-weight:600; margin-bottom:4px;">${state.title}</div>
            <div style="font-size:10px; opacity:0.7;">${state.hint}</div>
        </div>
    `;
}
```

**Aufwand:** ~40 LOC
**Nutzen:** 7/10 — Professionellerer Look

---

### 1.6 Onboarding Tour

**Ziel:** Beim ersten Start kurze Erklärung der 4 Tabs mit Tooltips.

**Dateien:** `extension/popup.html`, `extension/popup.js`, `extension/background.js`

**Implementierung:**

1. **Storage-Flag** (in `background.js` beim ersten Start):
```javascript
// In restoreSession() oder init():
const data = await chrome.storage.sync.get(['onboardingComplete']);
if (!data.onboardingComplete) {
    chrome.runtime.sendMessage({ type: 'SHOW_ONBOARDING' });
}
```

2. **Onboarding-Overlay** (in `popup.html`, am Ende von `<body>`):
```html
<div id="onboarding-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:1000; display:flex; align-items:center; justify-content:center;">
    <div id="onboarding-card" style="background:var(--card); padding:24px; border-radius:16px; max-width:280px; text-align:center;">
        <div id="onboarding-icon" style="font-size:48px; margin-bottom:12px;">👋</div>
        <h2 id="onboarding-title" style="color:var(--accent); margin:0 0 8px;">Welcome to KoalaSync!</h2>
        <p id="onboarding-text" style="color:var(--text-muted); font-size:13px; margin:0 0 16px;">Let's get you started.</p>
        <div style="display:flex; gap:8px; justify-content:center;">
            <button id="onboarding-skip" class="secondary" style="width:auto; padding:8px 16px;">Skip</button>
            <button id="onboarding-next" class="primary" style="width:auto; padding:8px 16px;">Next</button>
        </div>
        <div id="onboarding-dots" style="margin-top:12px; display:flex; gap:6px; justify-content:center;"></div>
    </div>
</div>
```

3. **JavaScript** (in `popup.js`):
```javascript
const onboardingSteps = [
    { icon: '🏠', title: 'Room Tab', text: 'Create or join a room to sync with friends. Share the invite link!' },
    { icon: '🎬', title: 'Sync Tab', text: 'Select your video tab and control playback. Force Sync fixes drift.' },
    { icon: '⚙️', title: 'Settings', text: 'Customize your username, filter noise tabs, and toggle auto-sync.' },
    { icon: '🔧', title: 'Dev Tab', text: 'Debug connection status, video state, and view action history.' }
];

let onboardingStep = 0;

function showOnboarding() {
    const overlay = document.getElementById('onboarding-overlay');
    overlay.style.display = 'flex';
    renderOnboardingStep();
}

function renderOnboardingStep() {
    const step = onboardingSteps[onboardingStep];
    document.getElementById('onboarding-icon').textContent = step.icon;
    document.getElementById('onboarding-title').textContent = step.title;
    document.getElementById('onboarding-text').textContent = step.text;
    
    // Dots
    const dots = document.getElementById('onboarding-dots');
    dots.innerHTML = onboardingSteps.map((_, i) => 
        `<div style="width:8px; height:8px; border-radius:50%; background:${i === onboardingStep ? 'var(--accent)' : '#475569'};"></div>`
    ).join('');
    
    document.getElementById('onboarding-next').textContent = 
        onboardingStep === onboardingSteps.length - 1 ? 'Done!' : 'Next';
}

document.getElementById('onboarding-next').addEventListener('click', () => {
    onboardingStep++;
    if (onboardingStep >= onboardingSteps.length) {
        completeOnboarding();
    } else {
        renderOnboardingStep();
    }
});

document.getElementById('onboarding-skip').addEventListener('click', completeOnboarding);

function completeOnboarding() {
    document.getElementById('onboarding-overlay').style.display = 'none';
    chrome.storage.sync.set({ onboardingComplete: true });
}

// In init():
chrome.storage.sync.get(['onboardingComplete'], (data) => {
    if (!data.onboardingComplete) showOnboarding();
});
```

**Aufwand:** ~120 LOC
**Nutzen:** 8/10 — Reduziert Abbruchrate neuer Nutzer

---

### 1.7 Browser Notifications + Toasts für Sync-Events

**Ziel:** System-Benachrichtigungen bei Peer-Events (opt-in) UND Toast-Nachrichten für alle Sync-Events.

**Dateien:** `extension/popup.html`, `extension/popup.js`, `extension/background.js`, `extension/manifest.base.json`

**Implementierung:**

1. **Permission** (in `manifest.base.json`):
```json
"permissions": ["storage", "tabs", "scripting", "alarms", "notifications"]
```

2. **Settings Toggle** (in `popup.html`, Settings Tab):
```html
<div class="form-group" style="display: flex; align-items: center; justify-content: space-between; background: var(--card); padding: 10px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #334155;">
    <label style="margin-bottom: 0;">Browser Notifications</label>
    <input type="checkbox" id="browserNotifications" style="width: auto;">
</div>
```

3. **Background.js — Notification Handler:**
```javascript
function notifyPeerEvent(event, data) {
    chrome.storage.sync.get(['browserNotifications'], (settings) => {
        if (!settings.browserNotifications) return;
        
        const notifications = {
            'joined': { title: 'Peer Joined', body: `${data.username || data.peerId} joined the room` },
            'left': { title: 'Peer Left', body: `${data.username || data.peerId} left the room` },
            'play': { title: 'Playback Started', body: `${data.senderId} pressed Play` },
            'pause': { title: 'Playback Paused', body: `${data.senderId} pressed Pause` },
            'force_sync': { title: 'Force Sync', body: `${data.senderId} initiated Force Sync` }
        };
        
        const config = notifications[event];
        if (!config) return;
        
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: config.title,
            message: config.body,
            priority: 1
        });
    });
}
```

4. **Popup.js — Toasts für alle Events:**
```javascript
// In chrome.runtime.onMessage.addListener():
if (msg.type === 'PEER_UPDATE') {
    updatePeerList(msg.peers);
    // Detect join/leave durch Vergleich mit vorheriger Liste
    detectPeerChanges(msg.peers);
}

function detectPeerChanges(newPeers) {
    const oldIds = new Set(lastKnownPeers.map(p => p.peerId || p));
    const newIds = new Set(newPeers.map(p => p.peerId || p));
    
    // Neue Peers
    for (const peer of newPeers) {
        const id = peer.peerId || peer;
        if (!oldIds.has(id)) {
            const name = peer.username || id.substring(0, 4);
            showToast(`${name} joined the room`, 'success');
        }
    }
    
    // Verlassene Peers
    for (const oldPeer of lastKnownPeers) {
        const id = oldPeer.peerId || oldPeer;
        if (!newIds.has(id)) {
            const name = oldPeer.username || id.substring(0, 4);
            showToast(`${name} left the room`, 'info');
        }
    }
    
    lastKnownPeers = newPeers;
}
```

5. **Toast für Play/Pause/Seek:**
```javascript
// In onMessage für ACTION_UPDATE:
if (msg.type === 'ACTION_UPDATE') {
    const state = msg.state;
    if (state && state.senderId !== 'You') {
        const actionNames = {
            'play': '▶ Play',
            'pause': '⏸ Pause',
            'seek': '⏩ Seek',
            'force_sync_prepare': '⚡ Force Sync',
            'force_sync_execute': '⚡ Force Play'
        };
        const action = actionNames[state.action] || state.action;
        showToast(`${state.senderId} ${action}`, 'info', 2000);
    }
    // ... existing updateLastActionUI call
}
```

**Aufwand:** ~150 LOC
**Nutzen:** 9/10 — Kritisch für UX, Nutzer wissen was passiert

---

## Phase 2: Quality of Life Fixes

### 2.1 Interpolation Cleanup (Memory Leak Fix)

**Ziel:** `interpolationInterval` beim Popup-Schließen bereinigen.

**Dateien:** `extension/popup.js`

**Implementierung:**
```javascript
// In init() oder am Ende der Datei:
window.addEventListener('unload', () => {
    stopInterpolation();
});

// Oder für Browser Extensions spezifisch:
chrome.runtime.onSuspend.addListener(() => {
    stopInterpolation();
});
```

**Aufwand:** ~5 LOC
**Nutzen:** 8/10 — Verhindert Memory Leak

---

### 2.2 Dev-Tab Logs nur bei Sichtbarkeit pollen

**Ziel:** `refreshLogs` nur ausführen wenn Dev-Tab sichtbar.

**Dateien:** `extension/popup.js`

**Implementierung:**
```javascript
// Ersetze setInterval(refreshLogs, 5000) durch:
let isDevTabVisible = false;

elements.tabs.forEach(btn => {
    btn.addEventListener('click', () => {
        // ... existing tab switch logic
        isDevTabVisible = btn.dataset.tab === 'tab-dev';
        if (isDevTabVisible) refreshLogs();
    });
});

// Poll nur wenn sichtbar
setInterval(() => {
    if (isDevTabVisible) refreshLogs();
}, 5000);
```

**Aufwand:** ~10 LOC
**Nutzen:** 5/10 — Kleine Optimierung

---

### 2.3 content.js: Explizites Video-Cleanup

**Ziel:** Wenn `<video>`-Element entfernt wird, Listener cleanen und Heartbeat pausieren.

**Dateien:** `extension/content.js`

**Implementierung:**

In `checkVideo()` (ca. Zeile 507):

```javascript
function checkVideo() {
    lastMutate = Date.now();
    const video = findVideo();
    
    // Video removed — cleanup
    if (!video && lastVideoSrc) {
        reportLog('Video element removed from page', 'warn');
        lastVideoSrc = null;
        // Heartbeat returns early automatically (if (!video) return)
        return;
    }
    
    if (!video) return;

    const currentSrc = video.currentSrc || video.src;

    if (!video.dataset.koalaAttached || (lastVideoSrc && currentSrc && lastVideoSrc !== currentSrc)) {
        if (lastVideoSrc && currentSrc && lastVideoSrc !== currentSrc) {
            checkEpisodeTransition();
        }
        setupListeners();
    }
}
```

**Aufwand:** ~10 LOC
**Nutzen:** 7/10 — Saubereres Verhalten bei SPA-Navigation

---

### 2.4 `/health` Endpoint Rate Limiting

**Ziel:** Den offenen `/` Endpoint gegen IP-basiertes Rate Limiting schützen (60 req/min pro IP).

**Dateien:** `server/index.js`

**Implementierung:**

In `server/index.js`, nach den bestehenden Rate-Limiting Maps (ca. Zeile 47):

```javascript
// Health Endpoint Rate Limiting
const healthCounts = new Map(); // ip -> { count, resetTime }

function checkHealthRate(ip) {
    const now = Date.now();
    const entry = healthCounts.get(ip) || { count: 0, resetTime: now + 60000 };
    if (now > entry.resetTime) { entry.count = 0; entry.resetTime = now + 60000; }
    entry.count++;
    healthCounts.set(ip, entry);
    return entry.count <= 60; // 60 requests per minute
}

// Cleanup health counts im bestehenden Cleanup-Interval (Zeile 89):
// Füge hinzu in der setInterval cleanup loop:
for (const [ip, entry] of healthCounts.entries()) {
    if (now > entry.resetTime) {
        healthCounts.delete(ip);
    }
}
```

Bestehenden `/` Endpoint (Zeile 19) ersetzen:

```javascript
app.get('/', (req, res) => {
    const clientIp = req.ip;
    if (!checkHealthRate(clientIp)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    res.json({ status: 'online', service: 'KoalaSync Relay', version: process.env.npm_package_version || 'unknown' });
});
```

Optional: Dedizierten `/health` Endpoint für Docker/Monitoring hinzufügen:

```javascript
app.get('/health', (req, res) => {
    const clientIp = req.ip;
    if (!checkHealthRate(clientIp)) {
        return res.status(429).json({ error: 'Rate limited' });
    }
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        rooms: rooms.size,
        connections: io.engine.clientsCount,
        timestamp: Date.now()
    });
});
```

**Aufwand:** ~25 LOC
**Nutzen:** 7/10 — Verhindert Missbrauch des offenen Endpoints

---

## Priorisierung

| Priority | Feature | Aufwand | Nutzen |
|----------|---------|---------|--------|
| 🔴 Hoch | Toast-Benachrichtigungen | ~80 LOC | 9/10 |
| 🔴 Hoch | Browser Notifications + Event Toasts | ~150 LOC | 9/10 |
| 🟡 Mittel | Onboarding Tour | ~120 LOC | 8/10 |
| 🟡 Mittel | Interpolation Cleanup | ~5 LOC | 8/10 |
| 🟡 Mittel | `/health` Rate Limiting | ~25 LOC | 7/10 |
| 🟡 Mittel | Verbesserte Empty States | ~40 LOC | 7/10 |
| 🟡 Mittel | Last Action Card mit targetTime | ~15 LOC | 7/10 |
| 🟡 Mittel | content.js Video Cleanup | ~10 LOC | 7/10 |
| 🟢 Niedrig | Tab-Sortierung | ~15 LOC | 7/10 |
| 🟢 Niedrig | Copy-to-Clipboard Feedback | ~10 LOC | 6/10 |
| 🟢 Niedrig | Dev-Tab Logs Sichtbarkeit | ~10 LOC | 5/10 |

**Gesamtaufwand Phase 1+2:** ~480 LOC
**Geschätzte Zeit:** 2-4 Tage

---

## Zukünftige Features (spätere Releases)

Diese Features wurden evaluiert aber sind nicht Teil der nächsten Release:

| Feature | Aufwand | Nutzen | Status |
|---------|---------|--------|--------|
| Chat im Room | ~400 LOC | 9/10 | Geplant v1.6 |
| Playback Speed Sync | ~150 LOC | 8/10 | Geplant v1.5 |
| Room Host/Owner | ~350 LOC | 8/10 | Geplant v1.6 |
| Auto-Reconnect mit State | ~250 LOC | 9/10 | Teilweise implementiert |
| Multi-Video Support | ~300 LOC | 7/10 | Geplant v2.0 |
| Volume Sync | ~120 LOC | 6/10 | Backlog |
| Stats Dashboard | ~200 LOC | 6/10 | Backlog |
| Custom Themes | ~80 LOC | 5/10 | Backlog |
