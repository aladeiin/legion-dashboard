# WorldTime Buddy

A macOS desktop app for comparing time zones across the world, similar to
[worldtimebuddy.com](https://www.worldtimebuddy.com/) — built so you can
line up a meeting window that actually works for you and a client (or
teammate) on the other side of the planet.

## Features

- **Add/remove any city or time zone at will**, searchable by city, country,
  or IANA time zone id (e.g. "Mumbai", "Germany", "Asia/Tokyo").
- **Visual 24-hour timeline per city**, color-coded by night / early morning /
  work hours / evening, aligned column-for-column across every row so you can
  see the same instant in every zone at a glance.
- **Click any time slot** to pick a candidate meeting time — a summary bar
  instantly shows the local time (and date, if it differs) in every city.
- **Automatic overlap suggestions**: configurable "work hours" (default
  9am–6pm) highlight every slot where *all* added locations are within
  business hours, with a "jump to next suggested slot" button.
- **Date navigation** (prev/next/today or a date picker) — fully DST-correct,
  since all conversions go through the browser's native `Intl` time zone
  APIs rather than fixed UTC offsets.
- **Drag to reorder** cities, star one as your "home" reference location.
- **12h/24h toggle**, light/dark mode (follows macOS appearance), and a
  live "now" marker on the current day.
- Everything is saved locally (your city list and preferences persist
  between launches) — no account, no server, no network access required.

## Requirements

- [Node.js](https://nodejs.org/) 18+ and npm
- macOS (the app is packaged as a native `.app`/`.dmg`; it also runs fine in
  dev mode on Linux/Windows via `npm start` since it's Electron)

## Run it in development

```bash
cd worldtime-buddy
npm install
npm start
```

This launches the app in an Electron window immediately — no build step
needed while you're just using or tweaking it.

## Build a real macOS app (.app / .dmg)

```bash
npm install
npm run dist
```

This uses [electron-builder](https://www.electron.build/) to produce a
`.dmg` installer and a `.zip` of the `.app` bundle in `dist/`. Run this on
a Mac to get a natively-signed-for-your-machine build (unsigned builds work
fine for local use; right-click → Open the first time to bypass Gatekeeper,
or see electron-builder's docs if you want to codesign/notarize for
distribution).

If you just want the unpacked `.app` without building the dmg/zip:

```bash
npm run dist:dir
```

## Project structure

- `main.js` — Electron main process (window + native macOS menu bar)
- `preload.js` — empty by design; the app only needs `localStorage` and the
  browser's built-in `Intl` APIs, both already available in the renderer
- `index.html` / `styles.css` / `app.js` — the UI and all app logic
- `timezone.js` — DST-safe time zone conversion helpers built on `Intl`
- `cities.js` — curated list of ~140 major world cities mapped to their IANA
  time zone (any other IANA zone can also be typed directly into the search)

## Notes

- No custom app icon is bundled yet — `npm run dist` will use Electron's
  default icon. Drop a 1024×1024 `icon.icns` into `assets/` and reference it
  via `build.mac.icon` in `package.json` if you want to customize it.
