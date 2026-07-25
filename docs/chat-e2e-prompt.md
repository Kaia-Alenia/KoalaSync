# E2E-verschlüsselter In-Page-Chat für KoalaSync

## Auftrag

Baue einen privacy-first, Ende-zu-Ende-verschlüsselten Text-Chat, der direkt auf der
Streaming-Seite neben dem Video sitzt. Neuer Branch von `main`, Vorschlag
`feature/chat-e2e`.

### Harte Anforderungen

1. **Der Server darf Nachrichten nie lesen können.** Schlüssel nur clientseitig, der
   Relay sieht ausschließlich Ciphertext.
2. **Der Server speichert keine Nachrichten.** Reines Live-Relay, kein RAM-Backlog,
   keine History. Wer zu spät kommt, verpasst den bisherigen Chat. Das ist gewollt.
3. **Chat läuft auf der Streaming-Seite**, nicht im Extension-Popup.
4. **Themes werden respektiert** (3 Paletten x light/dark).
5. **Keine Read Receipts.** Bewusst gestrichen.
6. **Volle Abwärtskompatibilität**: alte Extensions müssen weiter normal joinen können.

### Bedrohungsmodell (bestimmt alle Krypto-Entscheidungen)

Das hier ist eine Video-Sync-Extension mit optionalem, flüchtigem Chat, **keine
sicherheitskritische Messenger-App**. Ziel ist: ein bösartiger Betreiber eines
Custom-Relays soll nicht einfach mitlesen können. Ob etwas mit sehr viel Aufwand
theoretisch knackbar wäre, ist egal.

Daraus folgt, und das ist bindend:
- **Usability und Performance haben Vorrang** vor kryptografischer Maximalhärte.
- Raum-Passwörter sind kurz, zufällig generiert (z.B. `0XUK3C`) und ständig neu. Wer
  eines knackt, kann trollen (`play`/`pause` senden). Nervig, nicht kritisch. Deshalb
  nutzt der Server bewusst simples SHA256/HMAC statt bcrypt. **Diese Linie beibehalten,
  nicht "verbessern".**
- Der globale `SERVER_SALT` ist bekannt und kein Issue. Räume sind flüchtig, es gibt
  keine Datenbank.

### Explizite Nicht-Ziele

- Kein Chat-Tab im Popup. Nicht als Fallback, nicht übergangsweise.
- Keine serverseitige `chatHistory` in irgendeiner Form.
- **Die Auth nicht anfassen.** Das Klartext-Passwort an den Relay ist bewusst so und
  wird nicht umgebaut (Begründung unten).
- `website/` Theme-Redesign auf `main` nicht anfassen.

---

## Krypto-Design (entschieden, nicht neu diskutieren)

### Woher der Schlüssel kommt

Das Raum-Passwort ist **unbrauchbar** als Schlüsselmaterial: der Client sendet es im
Klartext an den Relay (`join_room` -> `payload.password`, `server/index.js:349`), der
Server HMACt es erst selbst (`hashPassword`, Zeile 52-55). Der Server könnte jeden
daraus abgeleiteten Schlüssel mitberechnen.

Es zu ändern würde auch nichts bringen: Raum-Passwörter haben ~31 Bit Entropie
(6 Zeichen A-Z0-9). Ein bösartiger Server könnte sie offline durchprobieren und den
Chat-Schlüssel ableiten.

**Lösung: ein eigenes, zufälliges Secret im URL-Fragment.** Fragmente werden nie an
einen Server gesendet, und das Secret hat volle Entropie per Konstruktion. Der
Einladungslink transportiert bereits heute das Passwort im Fragment, der Mechanismus
existiert also schon.

### Primitive

- **16 zufällige Bytes** (128 Bit), base64url, 22 Zeichen. Beispiel:
  `R5Ti1nxp0crfAFHf3gVncw`
- Ableitung: **HKDF-SHA256**(secret, salt=roomId) -> AES-256-GCM-Key.
  **Kein PBKDF2, kein Stretching.** Slow KDFs existieren nur, um schwache
  Menschen-Passwörter zu strecken. Das Secret ist zufällig mit voller Entropie, HKDF
  ist ein einziger HMAC (Mikrosekunden). Das ist dieselbe Logik wie sha256-statt-bcrypt
  beim Server.
- **Key genau einmal pro Raum ableiten und den `CryptoKey` cachen.** Nicht pro
  Nachricht neu ableiten oder importieren.
- Pro Nachricht: **zufälliger 12-Byte-IV**, dem Ciphertext vorangestellt.
- Alles über **WebCrypto**, keine Fremdabhängigkeit.

### AAD: senderId gegen Umetikettierung binden (Pflicht)

`senderId` wird vom Server gestempelt und liegt damit **außerhalb** des Ciphertexts.
Ohne Gegenmaßnahme kann ein bösartiger Relay Alices Ciphertext als Bob weiterreichen.
Das ist exakt der Angreifer, gegen den dieses Feature gebaut wird.

Deshalb: **AES-GCM mit AAD** verschlüsseln.
```
AAD = `${roomId}|${senderId}`     // senderId = eigene peerId beim Verschlüsseln,
                                  // envelope.senderId beim Entschlüsseln
```
Etikettiert der Server um, schlägt die Auth-Tag-Prüfung fehl und die Nachricht wird
verworfen. Kostet null Performance und bindet die Nachricht zusätzlich an den Raum
(kein Cross-Room-Replay).

Bewusst **nicht** abgedeckt und akzeptiert: Nachrichtenlängen und Timing bleiben für den
Server sichtbar (kein Padding). Ein Relay kann eine Nachricht innerhalb desselben Raums
erneut abspielen. Für das Bedrohungsmodell irrelevant.

### Sanitization wandert auf den Client (Pflicht)

Der Server sieht nur noch Ciphertext und **kann Text nicht mehr prüfen**. Die Bedrohung
verschwindet dadurch nicht, sie verschiebt sich: entschlüsselter Text stammt von einem
**Peer, der den Key besitzt**.

- Entschlüsselter Text ist **untrusted input**. Vor dem Rendern zwingend durch
  `escapeChatHtml`/`formatChatText` (escapen, dann Markdown). Niemals rohes `innerHTML`.
- Die Längengrenze (500 Codepoints) muss der **Client** durchsetzen, vor dem
  Verschlüsseln. Der Server kann nur noch Bytes zählen.
- **Bestehende Schranke beachten:** `maxHttpBufferSize: 4096` (`server/index.js:142`)
  gilt global pro Socket-Nachricht. Nachgerechnet: 500 Codepoints als 4-Byte-Emoji
  ergeben 2000 B Klartext, +16 B GCM-Tag +12 B IV = 2028 B, base64 = 2704 Zeichen,
  socket.io-Frame = **2731 B**. Passt, Headroom 1365 B. Bei 700 Codepoints wären es
  3799 B. Wer die Zeichengrenze anhebt, muss diese Rechnung neu machen, sonst reißt das
  Limit.

---

## Link-Format und Abwärtskompatibilität (entschieden)

### Warum das alte Format nicht erweiterbar ist

Aktuell (`popup.js:559-563`):
```
offiziell:  #join:<roomId>:<password>
custom:     #join:<roomId>:<password>:1:<encodedUrl>
```

Der Extension-Parser (`popup.js:1294-1313`) nimmt `roomId` von vorne, das Paar
`(flag, url)` von hinten, und **alles dazwischen ist das Passwort** (`parts.join(':')`).
Es gibt keine Position, die er verwirft. Verifiziert durch Ausführen der echten Parser
gegen echte Links:

| Link | Alte Extension | Alte Website |
|---|---|---|
| `#join:SILENT-EAGLE-90:30PXPD:1:wss%3A%2F%2F…` (Kontrolle) | `password:"30PXPD"` OK | `serverFlag:"1"` OK |
| Key inline: `…:30PXPD:<KEY>:1:wss%3A%2F%2F…` | `password:"30PXPD:R5Ti1nxp…"` **korrumpiert** | `serverFlag:"R5Ti…"`, `serverUrl:"1"` -> **falscher Server** |

Zwei verschiedene, irreführende Fehler aus derselben Zeile. Deshalb: neues Präfix.

### Neues Format

```
#j2:r=<roomId>&p=<password>&k=<key>[&u=<encodedRelayUrl>]
```

- `URLSearchParams`, kein positionales Parsen. Behebt nebenbei einen bestehenden Bug:
  heute zerschießt ein Doppelpunkt im Passwort den Website-Parser (`parts[2]`), während
  der Extension-Parser (`parts.join(':')`) damit klarkommt.
- **`s=1` entfällt.** Es existierte nur wegen des positionalen Parsens. Mit benannten
  Parametern gilt: `u` vorhanden bedeutet Custom Relay.
- Das Präfix darf `#join:` **nicht als Teilstring enthalten**, sonst greift
  `includes('#join:')` in alten Extensions doch.

Beispiele:
```
offiziell: …/join.html#j2:r=SAPPHIRE-DUCK-49&p=0XUK3C&k=R5Ti1nxp0crfAFHf3gVncw
custom:    …/join.html#j2:r=SILENT-EAGLE-90&p=30PXPD&k=R5Ti1nxp0crfAFHf3gVncw
                          &u=wss%3A%2F%2Fsync.shik3i.net
```

### Warum das alte Extensions nicht bricht

**Die Website ist der Hauptpfad, nicht die Extension.** `website/app.js:452-458` parst
das Fragment selbst, prüft via `document.documentElement.dataset.koalasyncInstalled`
(gesetzt von `bridge.js:9`), ob die Extension da ist, und dispatcht dann automatisch
(`app.js:515-526`, "AUTO-TRIGGER JOIN") ein `KOALASYNC_JOIN_REQUEST` mit fertig
geparsten, **strukturierten Feldern**. `bridge.js` reicht es als `WEB_JOIN_REQUEST` an
den background weiter. In diesem Pfad liest die Extension die URL nie an.

Altes `bridge.js` destrukturiert nur, was es kennt:
```js
const { roomId, password, useCustomServer, serverUrl } = e.detail;
```
Ein zusätzliches `chatKey` fällt dort stillschweigend auf den Boden.

**Daraus folgt die Deploy-Reihenfolge: Website zuerst.** Sie ist die einzige Stelle, die
das neue Format kennen muss, und sie ist sofort deploybar. Die Extension darf beliebig
hinterherhinken (Store-Review, Update-Zyklen der Nutzer).

| Kombination | Ergebnis |
|---|---|
| Neue Website + neue Ext | Join + Chat |
| Neue Website + alte Ext | Join normal, kein Chat, `chatKey` ignoriert |
| Neue Ext + alter `#join:`-Link | Join, kein Key, Chat aus. Legacy-Parser bleibt erhalten |
| Alte Website + neuer Link | Präfix unbekannt, Join-Seite tot. **Existiert nach dem Website-Deploy nicht mehr** |

`checkInviteLink()` (`popup.js:1289`) ist nur der Komfort-Pfad "Popup auf der Join-Seite
öffnen und Felder vorausfüllen". Bei `#j2:` greift er in alten Extensions nicht mehr,
das Feld bleibt leer statt falsch befüllt. Die neue Extension muss dort **beide**
Formate parsen (`#j2:` und Legacy `#join:`).

**`history.replaceState` auf das Legacy-Format: nicht tun.** Naheliegende Idee, um das
Autofill alter Extensions zu retten, aber ein Eigentor: es entfernt `k` aus der
Adressleiste. Nutzer kopieren die URL aus der Adressleiste, um sie weiterzuteilen. Der
weitergegebene Link joint dann zwar, hat aber stillschweigend keinen Chat mehr. Der
Fragment-Inhalt muss unangetastet bleiben.

### Lebenszyklus des Keys

- **Erzeugt wird er vom Raum-Ersteller**, einmal, beim Anlegen des Raums. Er lebt im
  background neben `roomId`/`password` und geht in den Invite-Link.
- **Er darf niemals in einem Relay-Payload landen.** Nicht in `join_room`, nirgends.
  Dafür einen Test schreiben, der alle ausgehenden Events gegen den Key prüft.
- **Krypto gehört in den background**, nicht in den content script. Der Key wird damit
  gar nicht erst in den Kontext einer fremden Seite ausgeliefert. Das Overlay schickt
  Klartext an den background und bekommt Klartext zurück, verschlüsselt wird
  ausschließlich dort.
- **Kanten, die korrekt fallen müssen:**
  - Raum-Ersteller hat eine **alte** Extension: es existiert kein Key, niemand chattet.
    Korrektes Verhalten, kein Fehlerfall.
  - Ein Peer mit **alter** Extension teilt den Invite aus seinem eigenen Popup: der Link
    trägt keinen Key. Wer darüber joint, chattet nicht, während die anderen chatten.
  - Jemand tippt Raum und Passwort **manuell**: kein Key, kein Chat.
  - Relay **ohne** Chat-Capability: Chat-UI gar nicht erst anzeigen.

---

## Vorgeschichte

Vorgängerbranch `feature/soonTMChat` (Stand `c706513`) ist **verworfen**, bleibt als
Referenz liegen. Gründe:

- Chat lag nur im Popup. Ein Chrome-Popup schließt beim Fokusverlust, man kann nicht
  gleichzeitig Video schauen und chatten. Strukturell unbrauchbar.
- Der Server speicherte bis zu 500 Klartext-Nachrichten pro Raum und schickte jedem
  Joiner das Backlog.
- Verifizierter Folgebug: wer einen Raum mit >120 Nachrichten Historie betrat, wurde
  **rausgeworfen**. `renderChatHistory()` feuerte eine ungebündelte `chat_read`-Quittung
  pro Nachricht und riss `CHAT_READ_RATE_LIMIT` (120/10s). Reproduziert bei
  `CHAT_HISTORY_LIMIT=200`, dokumentiert erlaubt sind 500.

**Lehre: kein ungebündeltes Event-pro-Nachricht-Muster. Jedes Client-Verhalten gegen die
Rate-Limits gegenrechnen, bevor es eingebaut wird.**

### Wiederverwendbar (per `git checkout feature/soonTMChat -- <pfad>`, kritisch prüfen)

| Datei | Was | Einschränkung |
|---|---|---|
| `extension/chat.js` | `escapeChatHtml`, `formatChatText`, `insertEmoji`, `createTypingTracker`, `createRemoteTypingTracker` | reine Funktionen, storage-frei, getestet. `createReceiptTracker` weglassen |
| `extension/chat.test.mjs` | Unit-Tests | Receipt-Tests weg |
| `extension/locales/*.json` | `CHAT_*`-Keys, 15 Sprachen | Receipt-Keys weg, neue Keys für Overlay nötig |
| `server/chat.js` | `sanitizeChatUsername`, `canKickPeer` | `sanitizeChatText`/`createChatMessage` greifen auf Klartext zu, bei E2E unmöglich. `parseChatHistoryLimit`, `appendChatHistory`, `canRelayReadReceipt` entfallen |
| `server/rate-limiter.js` | `checkChatMessageRate` (10/10s) | `checkChatReadRate` entfällt |
| `shared/constants.js` | `CAPABILITIES.CHAT`, Event-Namen | **muss neu hinzu.** main kennt nur `HOST_CONTROL` und `CO_HOST` (`shared/constants.js:78`, `server/index.js:174`) |

**Server-Design, das überleben soll:** Der Server vergab Message-ID, `senderId` und
`timestamp` selbst und ignorierte Client-Angaben (Spoofing-Schutz). Bleibt richtig, auch
wenn der Text jetzt Ciphertext ist.

---

## Technische Randbedingungen

### Overlay-Kontext

- `content.js` wird **programmatisch** injiziert:
  `chrome.scripting.executeScript({ target: {tabId}, files: ['content.js'] })`
  (`background.js:1775`). Nicht über `manifest.content_scripts`, dort steht nur
  `bridge.js` für `https://sync.koalastuff.net/*`.
- `host_permissions: ["<all_urls>"]`, MV3.
- Das Overlay lebt im DOM fremder Seiten (Netflix, YouTube, Emby, Jellyfin).
  **Shadow DOM ist Pflicht**, sonst bluten fremde Styles rein und umgekehrt.
- Die Theme-Variablen aus `popup.html` existieren im Page-Kontext **nicht** und müssen
  in den Shadow Root injiziert werden.
- **Risiko, vorab prüfen:** Netflix-Vollbild ist ein eigener Fullscreen-Element-Kontext.
  Ein Overlay im normalen DOM verschwindet dort möglicherweise. Das kann die
  Positionierung grundlegend beeinflussen.

### Performance auf der Host-Seite

Das Video ist das Produkt, der Chat ist Beiwerk. Ein Overlay, das die Wiedergabe ruckeln
lässt, ist schlechter als kein Overlay.

- Nur im **Ziel-Tab** injizieren (`currentTabId` im background), nicht auf jeder Seite.
- `position: fixed`, eigener Compositing-Layer, **kein Eingriff in das Layout der
  Host-Seite**. Kein Layout-Thrashing, keine erzwungenen Reflows während der Wiedergabe.
- Nachrichtenliste beim Rendern nicht unbegrenzt wachsen lassen (DOM-Knoten deckeln).

### Firefox

`scripts/build-extension.cjs:199` baut ein eigenes **Firefox-Target**, und `bridge.js`
enthält bereits Firefox-spezifisches `cloneInto`-Handling für CustomEvent-Details
(isolierte Welten in FF MV3). Overlay, Shadow DOM und WebCrypto müssen dort ebenfalls
laufen. Neue Website-zu-Extension-Felder (`chatKey`) gehen durch dieselbe
`cloneInto`-Stelle.

### Theme-System (aus `main`, verbindlich)

- `extension/theme-init.js` setzt auf `<html>`: `data-theme` (`light`/`dark`),
  `data-palette` (`eucalyptus`/`cyber`/`graphite`), Klasse `theme-light`.
- Quelle: `chrome.storage.local`, Keys `themeMode` und `themePalette`, plus
  `chrome.storage.onChanged` für Live-Updates. Das Overlay nutzt denselben Mechanismus
  im Shadow Root.
- **Kein `prefers-color-scheme`** für Theme-Farben. Das System ist explizit, nur der
  Modus `system` liest die OS-Präferenz und das erledigt `theme-init.js`.
- Tokens: `--bg`, `--card`, `--surface-alt`, `--surface-deep`, `--accent`, `--text`,
  `--text-muted`, `--border-soft`, `--border-strong`, `--text-on-green`.
  Text auf `--accent` immer `--text-on-green`, nie `white`.
- Getönte `oklch`-Schatten sind pro Palette hartcodiert und brauchen
  `html[data-palette=...]`-Overrides. Neutrale Schwarz-Alpha-Schatten sind
  palettenunabhängig und der einfachere Weg.
- Bekannte Alt-Last, nicht Aufgabe dieses Branches: `--text-on-green` auf `--accent`
  erreicht in eucalyptus/light 3.76 und cyber/dark 4.24, unter WCAG AA.

### Qualitäts-Gates

- `npm run lint`, `npx vitest run`, `npm run verify` müssen grün sein.
- i18n: alle 15 Sprachen in `extension/locales/`, `en` ist Baseline-Fallback. Keine
  hartcodierten UI-Strings, `getMessage(key, { placeholder })` aus `i18n.js`.
- Bei einem Release-Tag: Eintrag in `docs/CHANGELOG.md`.
- Keine Em-Dashes in nutzersichtbaren Texten.

---

## Offene Punkte (mit dem Nutzer klären, nicht selbst entscheiden)

1. **Overlay-Positionierung**: fest andockbar rechts/links, oder frei verschiebbar?
   Position pro Seite in `chrome.storage.local` merken? Verhalten im Vollbild?
2. **Peers ohne Key**: Chat-UI ganz ausblenden mit Hinweis, oder anzeigen und
   Nachrichten als "nicht lesbar" markieren? (Die Fälle, in denen das eintritt, stehen
   oben unter Lebenszyklus.)
3. **Metadaten**: Username bleibt heute für den Server sichtbar (er sanitized ihn).
   Mitverschlüsseln? Typing-Indikatoren verraten dem Server, wer wann aktiv ist.
   Behalten, verschlüsseln oder streichen?
4. **Kick-Funktion**: `canKickPeer` existiert (Host/Controller-Rechte). Behalten?
5. **Nachrichtenlängen-Limit**: 500 Codepoints beibehalten, oder angesichts des
   4096-B-Frames anders wählen?

---

## Vorgehen

1. Offene Punkte klären.
2. Krypto- und Linkformat-Design in `docs/CHAT.md` festhalten. Das bestehende Dokument
   beschreibt das verworfene Konzept und wird neu geschrieben. Chat-Events in
   `docs/PROTOCOL.md` ergänzen.
3. Website-Parser (`#j2:`, Legacy `#join:` weiter unterstützen) und Bridge-Feld
   `chatKey` zuerst, weil davon die Abwärtskompatibilität hängt.
4. Dann Relay (reines Relay ohne Storage), dann Krypto im background, dann Overlay, dann
   i18n, dann Tests.
5. **Verifizieren, nicht annehmen:**
   - Overlay auf mindestens zwei echten Seiten in allen 6 Theme-Kombinationen, nicht nur
     in einer isolierten HTML-Datei.
   - Chrome **und** Firefox-Build.
   - Ein Test, der beweist, dass der Key in keinem ausgehenden Relay-Payload vorkommt.
   - Ein Test, der eine umetikettierte Nachricht (fremde `senderId`) als ungültig
     zurückweist (AAD-Bindung).
   - Alte Extension gegen neue Website: Join funktioniert weiter, Chat ist stumm.
