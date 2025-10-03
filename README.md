# Juicy Habit

Juicy Habit ist eine moderne, komplett clientseitige Progressive Web App rund um Saftrezepte, Einkaufsliste und Motivation. Die App kombiniert Material-Design-Komponenten mit einer Offline-fähigen Oberfläche und lässt sich auf Smartphones wie eine native App installieren.

## Features
- Rezeptübersicht mit Filtermöglichkeiten und liebevoll gestalteten Karten
- Detaildialog mit Ziel, Menge, Zubereitungsschritten und Zutatenliste
- Einkaufsliste mit automatischer Aggregation der Zutaten plus manuellen Ergänzungen
- Motivationstab mit Tipps und Zitaten für gesunde Routinen
- Vollständige PWA-Unterstützung: Manifest, Service Worker, Offline-Fallback und Installations-CTA

## Verzeichnisstruktur
```
.
├── index.html             # Einstiegspunkt inkl. Manifest- und CSS-Verknüpfung
├── app.js                 # Hauptlogik (Routing, Rendering, State-Handling)
├── ui.css                 # Stylesheet inkl. Responsive- und PWA-spezifischer Anpassungen
├── manifest.webmanifest   # PWA-Manifest (Icons, Start-URL, Theme)
├── service-worker.js      # Caching-Strategien & Offline-Handling
├── data/                  # Statische JSON-Daten (Rezepte, Wochenplan, Motivation)
└── icons/                 # PWA-Icons in mehreren Größen
```

## Voraussetzungen
- Ein beliebiger statischer Webserver (z. B. [`http-server`](https://www.npmjs.com/package/http-server), `serve`, Python `http.server`)
- Aktueller Browser mit PWA-Unterstützung (Chrome, Edge, Safari, Firefox mobile)

## Lokale Entwicklung
1. Repository klonen oder entpacken:
   ```bash
   git clone <dein-repo-url>
   cd juice
   ```
2. Statischen Server starten, z. B. mit `http-server`:
   ```bash
   npx http-server -p 5173
   ```
   Alternativ:
   ```bash
   python3 -m http.server 5173
   ```
3. Browser öffnen und `http://localhost:5173` aufrufen.

Die PWA-Installationsschaltfläche erscheint, sobald der Service Worker aktiv ist und der Browser die `beforeinstallprompt`-Bedingungen erfüllt.

## PWA installieren & testen
- Öffne die App über den lokalen bzw. produktiven Link.
- Bestätige im Browser die Installationsaufforderung (oder nutze Menü → „App installieren“).
- Überprüfe in den DevTools unter „Application → Service Workers“, dass `service-worker.js` erfolgreich registriert ist.
- Für Offline-Tests: Seite laden, Netzwerkverbindung trennen, anschließend navigieren; der Offline-Fallback (`index.html`) sollte weiterhin erscheinen.

## Deployment
Die App lässt sich auf jedem statischen Hosting-Dienst bereitstellen (GitHub Pages, Netlify, Vercel, Cloudflare Pages, Firebase Hosting usw.). Wichtig ist, dass die Dateien unter derselben Origin ausgeliefert werden, damit Manifest und Service Worker korrekt greifen.

1. Dateien in das Ziel-Repository pushen bzw. hochladen.
2. Hosting auf die Wurzel (`/`) konfigurieren.
3. Nach dem ersten Deploy einmal hart aktualisieren, um den neuen Service Worker zu aktivieren.

## Beitragen
Pull Requests und Issues sind willkommen. Bitte stelle sicher, dass du vor dem Einreichen lokal testest und den Service Worker ggf. aktualisierst, falls sich zwischengespeicherte Assets ändern.

## Lizenz
Bitte ergänze hier die gewünschte Lizenz (z. B. MIT, Apache 2.0). Solange keine Lizenz definiert ist, gilt der Standard-Urheberrechtsschutz.
