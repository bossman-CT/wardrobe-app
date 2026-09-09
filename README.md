# Wardrobe

A virtual closet and outfit builder: photograph clothing, organize it by category (tops / bottoms / shoes / other), mix and match items on a male or female mannequin, and save/swipe through outfits.

This is a **v1 prototype** built as a dependency-free static web app (plain HTML/CSS/JS), so it runs instantly with no build step and no npm install. It works as an installable PWA on Android today; see "Path to a native app" below for turning it into a Play Store app later.

## Features

- **Closet**: add clothing via camera or photo picker, auto-sorted into Tops / Bottoms / Shoes / Other
- **Builder**: pick a male or female mannequin, tap a slot to add an item, drag to reposition, use the handle to resize
- **Outfits**: save a mannequin composition as a named outfit, swipe (or use Prev/Next) through saved outfits, edit or delete any of them

All data (photos + outfits) is stored locally in the browser via IndexedDB — nothing leaves the device.

## Running it locally

Requires Node.js (any reasonably recent version — this app itself has zero dependencies, the server is just for local testing since some browser APIs need `http://` rather than `file://`).

```bash
node server.js
```

Then open `http://localhost:5173` on your phone or desktop browser. On Android, open it in Chrome and use "Add to Home screen" to install it as a standalone app (works offline after the first load, thanks to the service worker in `sw.js`).

## Deploying (like your friend's Vercel setup)

This is a static site, so it deploys to Vercel with zero configuration:

```bash
npx vercel
```

(or connect the GitHub/GitLab repo to Vercel's dashboard for automatic deploys on push). No framework, no build step — Vercel will just serve the files as-is.

## Path to a native Android app

Right now this is a PWA (installable from the browser, works offline, but not a Play-Store app). Two ways to get a real installable `.apk`:

1. **Capacitor** — wraps this exact HTML/CSS/JS in a native Android shell, giving you a real APK with full camera API access, minimal code changes. Fastest path from what exists today.
2. **React Native / Expo rewrite** — a full native rewrite, more work but the most "real app" feeling and native performance. Worth it if this grows beyond a prototype.

Either path needs a current Node.js LTS version (this machine currently has Node v11, which is far too old for either toolchain) — worth upgrading when you're ready for that step.

## File structure

- `index.html` — app shell and all three views (Closet / Builder / Outfits)
- `styles.css` — all styling
- `app.js` — app logic (rendering, drag/resize, save/load)
- `db.js` — tiny IndexedDB wrapper
- `mannequins.js` — male/female SVG silhouettes
- `manifest.json` / `sw.js` — PWA install + offline support
- `server.js` — zero-dependency static file server for local testing
