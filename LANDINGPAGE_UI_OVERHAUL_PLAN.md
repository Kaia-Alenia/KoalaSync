> **TEMPORÄR:** Diese Datei dient nur der gemeinsamen Planung des Landingpage-UI-Overhauls
> auf dem Branch `landingpage-ui-overhaul`. Sie ist **kein** Teil des finalen Features und
> **muss vor dem Öffnen des PRs wieder gelöscht werden**.

# Landingpage UI Overhaul — Hero Mockup

## Ausgangslage
Die Landingpage (`website/template.html`, `website/style.css`, `website/app.js`, kompiliert
via `website/build.cjs` nach `website/www/`) ist bereits sehr gut, soll aber **statisch und
backend-frei** bleiben. Einziger Fokus dieses Overhauls: das rechte Hero-Mockup
(`.hero-mockup-wrapper` / `.extension-mockup`, `template.html:304-579`).

**Heutiger Zustand:** Ein 1:1-Nachbau des Extension-Popups mit 4 Tabs (Room / Sync /
Settings / Status). Tab-Wechsel nur per Klick (`app.js:391-407`), keine Animationen, kein
Auto-Play, kein Bezug zu den eigentlichen Video-Tabs, die synchronisiert werden.

## Ziel
Ein dynamischeres, platzoptimiertes Hero-Visual, das das Kernversprechen von KoalaSync
("zwei Browser-Tabs synchron abspielen") direkt zeigt — mit echten Animationen, einem
automatischen Durchlauf beim ersten Sichtbarwerden und voller manueller Bedienbarkeit
danach. Auf Mobile (Bildschirmgröße) bleibt exakt das heutige, statische Popup-Mockup
erhalten — kein neues Mobile-Design nötig, kein zusätzlicher Wartungsaufwand dort.

## Getroffene Entscheidungen (aus Rückfrage-Runde)

1. **Layout:** Gestapelt/Layered — zwei Browser-Tab-Karten leicht versetzt im Hintergrund
   (Tiefeneffekt via `transform`/`box-shadow`), Extension-Popup öffnet sich als Overlay
   davor/darüber.
2. **Tab-Inhalt:** Abstraktes Video-Mock — Gradient-Placeholder als "Video", Play-Button,
   Fortschrittsbalken, Timestamp. Kein echtes Videomaterial, keine Marken/Logos, im
   bestehenden minimalistischen `mock-*`-Stil.
3. **Auto-Play-Verhalten:** Einmaliger Durchlauf beim Sichtbarwerden (IntersectionObserver),
   danach reiner manueller Modus. Kein Endlos-Loop im Hintergrund.
4. **Popup-Umfang:** Alle 4 Tabs (Room/Sync/Settings/Status) bleiben inhaltlich unverändert
   — nur in die neue Animations-/Overlay-Logik eingebettet, kein Content-Kahlschlag.

## Vorgeschlagenes Storyboard (einmaliger Auto-Durchlauf)

1. **Ausgangszustand:** Zwei Tab-Karten ("Tab A" / "Tab B") sichtbar, Video-Mocks pausiert,
   Fortschrittsbalken bei 0. Popup geschlossen, nur ein kleiner Launcher-Button sichtbar.
2. Popup öffnet sich (scale/slide-in) vor den Tab-Karten.
3. Simulierter Klick auf "Play" im Sync-Tab → beide Tab-Karten starten gleichzeitig
   (Fortschrittsbalken laufen synchron), begleitet von einem kurzen "Sync-Pulse"
   (Glow/Connection-Line) zwischen den beiden Karten.
4. Nach ein paar Sekunden: simulierter Klick auf "Pause" → beide Tabs pausieren synchron.
5. Popup schließt sich, Endzustand bleibt stehen (beide Tabs pausiert, synchron,
   "Synced"-Indikator dezent sichtbar) — kein Reset auf Ausgangszustand.
6. **Danach/parallel volle manuelle Steuerung:**
   - Klick auf eine Tab-Karte togglet deren eigenes Play/Pause *unabhängig* — spielt eine
     Karte allein, laufen die Fortschrittsbalken bewusst auseinander ("out of sync"), um den
     Schmerzpunkt zu illustrieren, den KoalaSync löst.
   - Klick auf Play/Pause im Popup synchronisiert immer beide Tabs.
   - Popup lässt sich jederzeit manuell öffnen/schließen, Tabs (Room/Sync/Settings/Status)
     bleiben wie heute klickbar.
   - Jede manuelle Interaktion während des Auto-Durchlaufs bricht diesen sofort ab und
     übergibt die volle Kontrolle.

## Technischer Ansatz (Vorschlag)

- **Keine neuen Dependencies** — reines Vanilla JS + CSS, passend zur "Zero-Dependency"-
  Philosophie des Projekts (siehe `website/README.md`).
- **Eine "Director"-Funktion** in `app.js`, die exakt dieselben Click-Handler wie die
  manuelle Bedienung aufruft (kein doppelter Code-Pfad zwischen Auto- und Manual-Modus).
- **IntersectionObserver** triggert den einmaligen Durchlauf beim ersten Sichtbarwerden.
- **`prefers-reduced-motion`**: Auto-Durchlauf und Cursor-Ripple-Indikatoren werden
  übersprungen, Endzustand wird direkt gesetzt (Pattern existiert bereits in
  `style.css:2915-2939`).
- **Kein DOM-Duplikat für Mobile:** Das Popup-Markup bleibt eine einzige Quelle. Der neue
  `.hero-mockup-dynamic`-Wrapper enthält die Tab-Karten + das Popup; unterhalb des
  bestehenden Breakpoints (768px, siehe `style.css:1913`) werden die Tab-Karten und
  Animationen per CSS ausgeblendet, das Popup fällt optisch auf das heutige, statische
  Erscheinungsbild zurück, JS initialisiert dort keine Animationen. Vermeidet doppelte
  i18n-Pflege der ~270 Zeilen Popup-Markup.
- **i18n-Vorsicht:** 15 Locale-Dateien unter `website/locales/*.json`. Neue sichtbare Texte
  (Tab-Labels etc.) nach Möglichkeit vermeiden oder wie bestehende Mock-Inhalte
  (z. B. "CoolUsername", "Stranger Things - S4E1") als nicht-lokalisierte Platzhalter
  behandeln, um Übersetzungsaufwand in 15 Sprachen zu vermeiden. Neue `{{MOCK_XX}}`-Keys nur
  falls wirklich nötig, dann mit Übersetzung in allen 15 Dateien.
- **Build:** Änderungen nur in den Source-Dateien (`template.html`, `style.css`, `app.js`),
  niemals in `website/www/**` (generiert via `website/build.cjs`).

## Detailentscheidungen (bei der Umsetzung getroffen)

- [x] Breakpoint Mobile-Fallback: bestehende 768px übernommen (`matchMedia('(min-width: 769px)')`
      im JS, `@media (max-width: 768px)` im CSS).
- [x] Auto-Durchlauf-Timing: Start ~1,4s nach 45% Sichtbarkeit (IntersectionObserver), dann
      Cursor → Launcher → Sync-Tab → Play (läuft ~3s synchron) → Pause → Popup schließt.
      Gesamtdauer ca. 10s.
- [x] Tab-Karten haben User-Badges passend zur Peer-Liste im Popup: "CoolUsername" (indigo)
      und "KoalaPC" (grün), gleicher Episodentitel "Stranger Things - S4E1".
- [x] Echter animierter Ghost-Mauszeiger (SVG-Cursor mit Klick-Ripple), kein reiner
      Ripple-Indikator — verkauft den Durchlauf deutlich besser.
- [x] Keine externe Referenz — eigener Stil, konsistent mit dem bestehenden `mock-*`-Design.
- [x] ~~Drift-Konzept~~ **Verworfen nach Feedback** — es stellte die Extension falsch dar
      (als bräuchte sie das offene Popup). Ersetzt durch das **Broadcast-Modell**: Play/
      Pause/Seek auf *irgendeinem* Video wird automatisch zum Peer gespiegelt (Puls wandert
      über die Verbindungslinie, Peer folgt ~260ms später, Engine gleicht die Zeit an). Der
      Status-Chip bleibt grün "In sync" und blitzt bei jedem Broadcast kurz das Event auf
      ("▶ CoolUsername", "❚❚ KoalaPC", "» …" für Seek). Das Popup ist nur die Fernbedienung
      obendrauf, nie Voraussetzung.
- [x] Rework 2 nach Feedback: Kein reservierter Popup-Platz mehr; KoalaSync-Icon als
      Extension-Button in der Toolbar des vorderen Fensters; Fortschrittsbalken klickbar
      (Seek wird mitgesynct, Scrub-Thumb bei Hover).
- [x] Rework 3 nach Feedback: Fenster-Kaskade statt starker Überlappung — das **rechte**
      Fenster (CoolUsername, mit dem Toolbar-Icon oben rechts) liegt im Vordergrund, das
      linke (KoalaPC) versetzt dahinter unten links. Das Popup öffnet **rechts außen**
      (right: 0, verankert unterm Icon), die beiden Tabs weichen dabei animiert nach links
      aus und bleiben sichtbar. Verbindungslinie komplett entfernt (Sync-Feedback = Puls-
      Ring auf beiden Karten + Event-Chip). Peer-Latenz von 260ms auf 90ms gesenkt — wirkt
      quasi instant.
- [x] Rework 4 nach Feedback: **Story-Walkthrough in 5 Akten** beim ersten Sichtbarwerden —
      (1) Extension über das Toolbar-Icon öffnen, (2) "Raum erstellen" (eigener Pre-Room-
      Screen im Popup, `#demo-room-empty`), (3) Invite-Link fliegt animiert vom Popup zum
      zweiten Browserfenster (Toast "Raum beigetreten", KoalaPC erscheint in der Peer-Liste,
      "IN SYNC"-Chip blendet erst jetzt ein), (4) beide wählen den Video-Tab (Select-Flash im
      Popup + Toast am zweiten Fenster), (5) Play für alle → Popup schließt → Pause vom
      anderen Tab, Seek mit Nachziehen, Play. Danach voll manuell. Jede Interaktion während
      der Story bricht ab und springt via idempotentem `finishDemo()` sofort in den End-
      zustand (Raum verbunden, Chip an, Hint an; Popup schließt bei Klicks außerhalb);
      der Nutzer-Klick wirkt anschließend normal. 4 neue Locale-Keys (DEMO_NO_ROOM,
      DEMO_CREATE_ROOM, DEMO_JOINED, DEMO_TAB_SELECTED) in allen 15 Sprachen.
- [x] Abspiel-Animation: abstrakter **Strichfigur-Kurzfilm** pro Video (SVG: Hügel-
      Silhouetten, laufende Figur mit schwingenden Armen/Beinen, hüpfender Ball) — läuft
      nur bei `playing`, Pause friert beide Filme im selben Frame ein
      (`animation-play-state`), was die Synchronität sofort sichtbar macht.

## Umsetzungsstatus

- [x] `website/template.html`: Hero-Mockup in `.hero-demo-scene` eingebettet (Chip, 2 Tab-
      Karten, Verbindungslinie, Launcher, Ghost-Cursor, Hint); Popup-Inhalt unverändert,
      nur IDs für Play/Pause/Force-Sync ergänzt.
- [x] `website/style.css`: Demo-Styles mit Container-Queries (cqw + px-Fallbacks),
      Mobile-Fallback, `prefers-reduced-motion`-Support.
- [x] `website/app.js`: `initHeroDemo()` — Playback-Uhr (rAF, 8x Zeitraffer), Broadcast-
      Logik (Play/Pause/Seek → Peer folgt), manuelle Steuerung, einmaliger Auto-Durchlauf
      (Play in Tab A → Seek in Tab B → Pause in Tab B → Popup öffnen/Play/schließen); jede
      Interaktion bricht den Durchlauf sofort ab. Auto- und Manuell-Modus nutzen dieselben
      Click-Handler. Launcher-Klicks sind vom Karten-Play/Pause entkoppelt (closest-Guard).
- [x] `website/locales/*.json`: 3 neue Keys (`DEMO_SYNC`, `DEMO_DRIFT`, `DEMO_HINT`) in
      allen 15 Sprachen.
- [x] `eslint.config.mjs`: `requestAnimationFrame`/`cancelAnimationFrame` zu den Globals.
- [x] Verifiziert im Browser-Preview: Auto-Durchlauf, Drift-Szenario, Chip-Rettungsweg,
      Re-Sync, Mobile-Fallback (statisches Popup wie vorher), keine Konsolenfehler,
      Lint sauber, Build ohne offene Platzhalter.
- [ ] `.claude/launch.json` zeigt auf einen Session-Scratchpad-Server — vor dem PR prüfen,
      ob die Datei ins Repo soll (ggf. löschen oder auf dauerhaften Pfad umstellen).

## Scope / Nicht-Ziele

- Kein Backend, keine echten Videos/Assets, keine neuen npm-Dependencies.
- Kein Umbau des restlichen Landingpage-Contents (Features, Compat-Section, Footer etc.) —
  ausschließlich das Hero-Mockup.
- Mobile-Ansicht bekommt **kein** neues Design, bleibt 1:1 der heutige Stand.
