# Mission Control ticker

An always-on desk display for a Galaxy M07 (or any Android phone running Chrome). It is a static PWA with no build step and no dependencies at runtime. Everything is drawn on a `<canvas>` in a VFD dot-matrix style using a hand-made 5×7 font, and it works offline after the first load.

Pages rotate every 6 s (headlines get 12 s) with a horizontal slide:

| # | Page | Source | Refresh |
|---|------|--------|---------|
| 1 | Clock: Singapore + India, date, UTC offset | device clock (`Intl`) | 1 s |
| 2 | World map: ISS + 10-min trail, M4.5+ quakes (24 h), SIN/BLR markers, day/night | wheretheiss.at, USGS | 10 s / 5 min |
| 3 | FX: USD/INR, SGD/INR, USD/SGD, ~6-week sparkline, ECB rate date | Frankfurter (ECB) | 1 h |
| 4 | Weather: Singapore + Bengaluru | Open-Meteo (CC BY 4.0) | 15 min |
| 5 | Headlines (scrolling) | your RSS feed | 10 min |
| 6 | Now playing | Last.fm `user.getRecentTracks` | 15 s |
| 7 | Countdown | settings | 1 s |
| 8 | Credits / attribution | — | — |

**Controls:** the first tap goes fullscreen, and later taps pause or resume rotation. Swipe left or right to change page. **Long-press (0.65 s) opens Settings.** With a keyboard: ← → change page, Space pauses, S opens Settings.

**Data rules:** the app never shows placeholder numbers. If a fetch fails, it shows the last good value from localStorage marked `STALE hh:mm` (with the reason, e.g. `TIMEOUT`, `HTTP 403`, `OFFLINE`). If nothing was ever fetched, it shows `NO DATA`. Fetches use timeouts and exponential backoff with jitter, and they pause while the tab is hidden or the phone is offline.

```
www/                 ← the whole app (deploy this folder)
  index.html app.js style.css manifest.webmanifest sw.js icons/
tools/make-icons.mjs ← regenerates PWA + Android launcher icons
tools/verify.mjs     ← headless-Chromium test harness (screenshots, APIs, installability)
android/             ← Capacitor Android project (Phase 2)
.github/workflows/pages.yml ← GitHub Pages deploy of www/
```

---

## Run locally

```bash
npm run serve
```
Then open http://localhost:8090. Any static server works; the service worker needs `localhost` or HTTPS.

## Deploy free on GitHub Pages

1. Create a new GitHub repository, for example `mission-control`. It can be public, or private if you're on a paid plan.
2. Push this folder:
   ```bash
   git init && git add -A && git commit -m "Mission Control ticker"
   ```
   ```bash
   git branch -M main && git remote add origin https://github.com/<you>/mission-control.git && git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**. The included workflow (`.github/workflows/pages.yml`) publishes `www/` on every push to `main`.
4. After about a minute the site is live at `https://<you>.github.io/mission-control/`. All paths are relative, so the sub-path works.

*No Actions?* Copy the **contents** of `www/` into a repo's root and choose **Source: Deploy from a branch → main / (root)**.

**After changing the code**, bump `CACHE` in `www/sw.js` (e.g. `mc-shell-v2`). Otherwise phones keep the old cached shell; it updates on the next launch after that.

## Install on the Galaxy M07

1. On the phone, open the GitHub Pages URL in **Chrome**.
2. Tap **⋮ → Add to Home screen → Install** (Chrome may show "Install app" instead). The icon lands on the home screen.
3. Launch it from the icon. It opens fullscreen (`display: fullscreen`) in whichever orientation you hold the phone.
4. **Tap once** so Chrome grants the Screen Wake Lock, which needs a user gesture. Credits → SYSTEM shows `WAKE LOCK ON`.
5. Long-press to open Settings and enter your Last.fm details, RSS proxy and countdown date.

Tips for 24/7 use:
- Keep it on the charger. As a fallback to the wake lock, turn on **Developer options → Stay awake** (screen never sleeps while charging).
- **Settings → Apps → Chrome → Battery → Unrestricted**, so One UI doesn't freeze it.
- Between 23:00 and 07:00 the display dims to about 30% (CSS opacity on a pure-black page). You can turn this off in Settings.

### Address bar shows after the screen wakes?

That means it's running in a **Chrome tab**, not as the installed app. In a tab, fullscreen is lost every time the screen turns off. Long-press → Settings: the grey line at the bottom says `running as: browser tab` or `installed app`. To fix it:
1. Long-press → **INSTALL APP** (the button appears only when Chrome offers installation). Or use Chrome **⋮ → Add to Home screen → Install**, and pick *Install*, not *Create shortcut*.
2. Delete any old home-screen shortcut and **launch from the new icon**. The app also appears in the app drawer and under Settings → Apps.
The installed app has no address bar at all, and after waking it comes straight back fullscreen.

## Remote sleep from the iPhone (free, no extra Android app)

The ticker listens on a private [ntfy.sh](https://ntfy.sh) topic, which is randomly generated per phone and shown in Settings → REMOTE SLEEP.
- **"off"**: the ticker releases the wake lock and blanks the display. Android's own screen timeout then switches the screen off.
- **"on"**: wakes the ticker if the screen is still lit.
- A web page can't turn a sleeping screen *on*. Wake it with **double-tap** (Settings → Advanced features → Motions and gestures → *Double tap to turn on screen*) or the side key. The ticker resumes by itself.

Setup:
1. On the M07: turn **off** Developer options → *Stay awake*, and set **Display → Screen timeout** to 15–30 s. The ticker's wake lock keeps the screen on while it's awake.
2. Long-press → Settings → REMOTE SLEEP → **SHARE URLS**, and send them to yourself.
3. On the iPhone, make a Shortcut "Desk off" with one action, **Get Contents of URL**, pointed at the *Sleep* URL. Make "Desk on" with the *Wake* URL if you want it. Put them on Back Tap, the Action Button, Control Center or Siri.

Anyone who knows the topic can sleep your screen, so don't share it. If you need a new topic, edit it in Settings and update the Shortcuts.

## Settings (long-press)

| Setting | Notes |
|---|---|
| Last.fm username + API key | Get a key at https://www.last.fm/api/account/create. It is stored **only** in this browser's localStorage and is never in the code. |
| RSS feed URL | Defaults to `https://www.business-standard.com/rss/markets-106.rss` (checked 16 Nov 2026: valid RSS 2.0 with 35 items). |
| CORS proxy | Required in the browser for that feed (see below). `{url}` is replaced by the encoded feed URL; otherwise the encoded URL is appended. |
| "Feed allows CORS" | Tick this only for a feed that sends `Access-Control-Allow-Origin`. |
| Countdown | Event name (default `TRAIN TRIP`) and date/time. Until a date is set the page shows `DATE NOT SET`. |
| Palette | `VFD TEAL` (mono) or `FULL COLOUR` (amber labels, red quakes, green/red FX moves). |
| Seconds per page, night dimming, enabled pages | Disabled pages also stop fetching. |

### The Business Standard feed and CORS

The feed URL works: it returns HTTP 200 and valid RSS. But it sends **no `Access-Control-Allow-Origin` header**, so Chrome blocks a web page from reading it (confirmed from a browser context: `TypeError: Failed to fetch`). Until you set a proxy, the Headlines page shows **NO FEED**. You have two options:

- **Use the Android app build (Phase 2).** It fetches natively, so CORS doesn't apply and no proxy is needed.
- **Run your own small proxy.** A free Cloudflare Worker works. Restrict it to the feed so it isn't an open proxy:

```js
// Cloudflare Worker → set the app's CORS proxy to:  https://<name>.<you>.workers.dev/?url={url}
export default {
  async fetch(req) {
    const u = new URL(req.url).searchParams.get('url');
    const ALLOW = ['https://www.business-standard.com/rss/'];
    if (!u || !ALLOW.some((p) => u.startsWith(p))) return new Response('forbidden', { status: 403 });
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (personal RSS ticker)' }, cf: { cacheTtl: 300 } });
    return new Response(r.body, {
      status: r.status,
      headers: { 'content-type': r.headers.get('content-type') || 'application/rss+xml',
                 'access-control-allow-origin': '*', 'cache-control': 'max-age=300' }
    });
  }
};
```
(The proxy path in the app was tested with a local proxy. This Worker itself was not deployed or tested, and Business Standard may treat cloud IPs differently.)

## API check (from a browser context, 16 Nov 2026)

| API | Browser fetch | Notes |
|---|---|---|
| wheretheiss.at `/v1/satellites/25544` | ✅ CORS `*` | |
| USGS `4.5_day.geojson` | ✅ CORS `*` | |
| Frankfurter `api.frankfurter.dev/v1` | ✅ CORS `*` | The old `api.frankfurter.app` now 301-redirects here. |
| Open-Meteo forecast | ✅ CORS `*` | Multi-location request returns an array. |
| Business Standard RSS | ❌ **CORS-blocked** | Feed itself is fine; needs a proxy or the Android build. |
| Last.fm `ws.audioscrobbler.com` | ✅ CORS `*` | Checked with an invalid key (readable 403 JSON). A real key was not tested. |

## Verification

```bash
npm run verify
```
This serves `www/`, then drives headless Chromium at 360×800 CSS px @2× (= 720×1600, the M07 panel) in portrait and landscape. It screenshots every page into `screenshots/`, collects console errors, tests each API, checks installability via the Chrome DevTools Protocol (CDP), starts the app offline, and measures load and render cost. The latest run found:

- Console errors: **none**.
- Installability (`Page.getInstallabilityErrors`): **none**. Manifest parsed without errors, and the service worker controls the page.
- Offline: the app shell loads from the service-worker cache and shows cached data.
- Load with 4× CPU throttle and ~1.6 Mbps / 150 ms network: first frame at **~0.78 s**, 83 KB transferred.
- Render cost (4× CPU throttle): clock 1 frame/s at 3% main thread. Map and headlines a steady 30 fps at 8–10%. Static pages (FX, weather) draw 0 fps until data changes. JS heap is about 2 MB.

## Phase 2: Android APK (Capacitor)

Java and the Android SDK are **not installed** on the build Mac, and there's no Homebrew, so the APK was **not built here**. The Capacitor 8.6.0 project is already generated and configured in `android/`:
- `CapacitorHttp` is enabled (`capacitor.config.json`), so `fetch()` goes through native HTTP. The RSS feed works directly and needs no proxy.
- `MainActivity` keeps the screen on (`FLAG_KEEP_SCREEN_ON`) and hides the system bars (immersive). It does this natively because the Wake Lock API is unreliable inside WebView.
- Black splash and adaptive-icon background, and the launcher icons are generated from the PWA icon.

### Build the debug APK with Android Studio

1. Install **Android Studio** (current stable) from developer.android.com/studio. It bundles the JDK 21 that Gradle needs. On first run, accept the SDK licences and let it install the SDK (API 36).
2. In this folder, copy the latest web files into the native project:
   ```bash
   npx cap sync android
   ```
3. Open the project. Either use **File → Open… → `mission-control/android`**, or run:
   ```bash
   npx cap open android
   ```
4. Wait for the Gradle sync to finish. Then choose **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
5. The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

Or from the terminal, once Android Studio is installed:
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ANDROID_HOME="$HOME/Library/Android/sdk"
```
```bash
cd android && ./gradlew assembleDebug
```

Re-run `npx cap sync android` and rebuild whenever you change anything in `www/`.

### Sideload onto the M07 (Android 15 / One UI 7)

1. Copy `app-debug.apk` to the phone (USB, Quick Share, or Google Drive).
2. **Turn off Auto Blocker**, which blocks all sideloading: **Settings → Security and privacy → Auto Blocker → Off**.
3. Allow the app you'll open the APK with: **Settings → Apps → ⋮ (top right) → Special access → Install unknown apps → My Files** (or Chrome/Drive) **→ Allow from this source**.
4. In **My Files**, tap the APK and choose **Install**. If Play Protect warns that the app is unrecognised, choose **More details → Install anyway**. Debug builds are self-signed, so this is expected.
5. Optional: turn Auto Blocker and the "unknown apps" permission back on afterwards.

With USB debugging enabled, `adb install -r app-debug.apk` also works.

## Not verified

- **Real M07 hardware.** Everything above ran in headless Chromium emulating the screen size, not on the phone. That covers the 90 Hz / Helio G99 performance, the wake lock, the fullscreen tap and the "Add to Home screen" flow.
- **Last.fm with a real API key.** The now-playing layout was checked with a **mocked** response (`TEST TRACK (MOCKED RESPONSE)` in `screenshots/configured-colour-music.png`).
- **The Business Standard feed through a deployed proxy.** It was only tested through the harness's local proxy.
- **The Android build.** It was not compiled, because there is no JDK or SDK here.
- **Map coastlines.** These are hand-simplified polygons (roughly 1–3° accuracy). They're good enough for a dot-matrix display but are not survey-grade.
