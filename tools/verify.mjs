// Verification harness: serves www/ locally, drives headless Chromium at the
// Galaxy M07 resolution (360x800 CSS @2x = 720x1600 px) in both orientations,
// screenshots every page, collects console errors, tests each API from a
// browser context, checks installability and offline start.
// Usage: node tools/verify.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import os from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(ROOT, 'www');
const SHOTS = join(ROOT, 'screenshots');
await mkdir(SHOTS, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json'
};
// Static server + a local test-only RSS proxy (/proxy?url=...) to exercise the "via proxy" code path.
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/proxy') {
    try {
      const r = await fetch(u.searchParams.get('url'), { headers: { 'user-agent': 'Mozilla/5.0 mission-control-verify' } });
      const body = await r.text();
      res.writeHead(r.status, { 'content-type': 'application/rss+xml; charset=utf-8', 'access-control-allow-origin': '*' });
      res.end(body);
    } catch (e) { res.writeHead(502); res.end(String(e)); }
    return;
  }
  let p = normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const f = join(WWW, p);
  if (!f.startsWith(WWW) || !existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(await readFile(f));
});
await new Promise((r) => server.listen(8099, '127.0.0.1', r));
const ORIGIN = 'http://localhost:8099';
const report = { console: [], apis: [], pages: [], installability: null, offline: null, perf: null, interactions: {} };

const PAGES = ['clock', 'bus', 'map', 'fx', 'weather', 'news', 'releases', 'otd', 'countdown', 'credits'];
const VIEWPORTS = [
  { name: 'portrait', viewport: { width: 360, height: 800 } },
  { name: 'landscape', viewport: { width: 800, height: 360 } }
];
const browser = await chromium.launch();

function watch(page, label) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') report.console.push(`[${label}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => report.console.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => report.console.push(`[${label}] requestfailed: ${r.url()} ${r.failure() && r.failure().errorText}`));
}
async function waitForData(page, keys, ms = 20000) {
  await page.waitForFunction((ks) => ks.every((k) => window.__mc && (window.__mc.state[k].data || window.__mc.state[k].fails)), keys, { timeout: ms }).catch(() => {});
}

// ---------- 1. screenshots of every page, both orientations (default settings) ----------
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Asia/Singapore', locale: 'en-GB' });
  await ctx.addInitScript(() => { if (!localStorage.getItem('mc.settings')) localStorage.setItem('mc.settings', JSON.stringify({})); });
  const page = await ctx.newPage();
  watch(page, vp.name);
  await page.goto(ORIGIN + '/');
  await waitForData(page, ['iss', 'quakes', 'fx', 'wx', 'aq', 'bus', 'otd']);
  await page.waitForTimeout(1500);
  for (const id of PAGES) {
    await page.evaluate((i) => window.__mc.go(i), id);
    await page.waitForTimeout(id === 'news' || id === 'map' ? 900 : 500);
    const file = `${vp.name}-${PAGES.indexOf(id) + 1}-${id}.png`;
    await page.screenshot({ path: join(SHOTS, file) });
    report.pages.push(file);
  }
  const st = await page.evaluate(() => Object.fromEntries(Object.entries(window.__mc.state).map(([k, v]) => [k, { hasData: !!v.data, fails: v.fails, err: v.err }])));
  report[`state_${vp.name}`] = st;
  await ctx.close();
}

// ---------- 2. headlines via a (local test) proxy + mocked Last.fm, colour palette ----------
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Asia/Singapore' });
  // MOCK: Last.fm response is fabricated here ONLY to check the now-playing layout. Labelled TEST.
  await ctx.route('https://ws.audioscrobbler.com/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ recenttracks: { track: [{ '@attr': { nowplaying: 'true' }, name: 'TEST TRACK (MOCKED RESPONSE)', artist: { '#text': 'TEST ARTIST' }, album: { '#text': 'TEST ALBUM' } }] } })
  }));
  await ctx.addInitScript((proxy) => {
    localStorage.setItem('mc.settings', JSON.stringify({
      rssProxy: proxy, palette: 'color',
      cdName: 'TRAIN TRIP', cdDate: '2026-12-19T08:00'
    }));
  }, ORIGIN + '/proxy?url={url}');
  const page = await ctx.newPage();
  watch(page, 'configured');
  await page.goto(ORIGIN + '/');
  await waitForData(page, ['iss', 'quakes', 'fx', 'wx', 'news', 'rel', 'otd']);
  await page.waitForTimeout(1200);
  for (const id of ['news', 'releases', 'otd', 'bus', 'countdown', 'map', 'fx', 'weather', 'clock']) {
    await page.evaluate((i) => window.__mc.go(i), id);
    await page.waitForTimeout(id === 'news' ? 2500 : 600);
    const file = `configured-colour-${id}.png`;
    await page.screenshot({ path: join(SHOTS, file) });
    report.pages.push(file);
  }
  report.state_configured = await page.evaluate(() => Object.fromEntries(Object.entries(window.__mc.state).map(([k, v]) => [k, { hasData: !!v.data, fails: v.fails, err: v.err }])));

  // interactions: swipe, tap-to-pause, long-press settings
  await page.evaluate(() => window.__mc.go('clock'));
  const before = await page.evaluate(() => window.__mc.pages());
  const box = { x: 180, y: 400 };
  const hdrTitle = async () => page.evaluate(() => document.title);
  await page.mouse.move(box.x + 100, box.y); await page.mouse.down();
  await page.mouse.move(box.x - 60, box.y, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, 'interaction-after-swipe.png') });
  // long press
  await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
  const settingsVisible = await page.evaluate(() => !document.getElementById('settings').hidden);
  await page.screenshot({ path: join(SHOTS, 'settings.png') });
  report.interactions = { pages: before, settingsOpensOnLongPress: settingsVisible, title: await hdrTitle() };
  await ctx.close();
}

// ---------- 3. no dimming at night (dimming was removed in v1.2.1; brightness is left to Android) ----------
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, timezoneId: 'Asia/Singapore' });
  const page = await ctx.newPage();
  watch(page, 'night');
  await page.clock.setFixedTime(new Date('2026-11-16T23:30:00+08:00'));
  await page.goto(ORIGIN + '/');
  await page.waitForTimeout(2500);
  report.interactions.opacityAt2330 = await page.evaluate(() => getComputedStyle(document.getElementById('screen')).opacity);
  await ctx.close();
}

// ---------- 4. every API from a browser context (origin http://localhost:8099) ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/');
  const urls = {
    'wheretheiss.at ISS': 'https://api.wheretheiss.at/v1/satellites/25544',
    'USGS M4.5+ day': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
    'Frankfurter (ECB)': 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR,SGD',
    'Open-Meteo': 'https://api.open-meteo.com/v1/forecast?latitude=1.29&longitude=103.85&current=temperature_2m',
    'Business Standard RSS (direct)': 'https://www.business-standard.com/rss/markets-106.rss',
    'Last.fm (invalid key, CORS check)': 'https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=rj&api_key=invalid&format=json&limit=1'
  };
  for (const [name, url] of Object.entries(urls)) {
    const r = await page.evaluate(async (u) => {
      try {
        const res = await fetch(u, { cache: 'no-store' });
        const t = await res.text();
        return { readable: true, status: res.status, bytes: t.length, sample: t.slice(0, 90) };
      } catch (e) { return { readable: false, error: String(e) }; }
    }, url);
    report.apis.push({ name, url, ...r });
  }
  await ctx.close();
}

// ---------- 5. installability + offline start (persistent profile, so not incognito) ----------
{
  const dir = join(os.tmpdir(), 'mc-verify-profile-' + process.pid);
  const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
  const page = ctx.pages()[0] || await ctx.newPage();
  watch(page, 'install');
  await page.goto(ORIGIN + '/');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  await page.reload();
  await page.waitForTimeout(2000);
  const cdp = await ctx.newCDPSession(page);
  const errs = await cdp.send('Page.getInstallabilityErrors').catch((e) => ({ error: String(e) }));
  const man = await cdp.send('Page.getAppManifest').catch((e) => ({ error: String(e) }));
  report.installability = {
    errors: errs.installabilityErrors || errs, manifestUrl: man.url, manifestErrors: man.errors,
    swControlled: await page.evaluate(() => !!navigator.serviceWorker.controller)
  };
  await ctx.setOffline(true);
  await page.reload().catch((e) => report.console.push('[install] offline reload failed: ' + e.message));
  await page.waitForTimeout(3000);
  const offlineOk = await page.evaluate(() => !!window.__mc).catch(() => false);
  await page.screenshot({ path: join(SHOTS, 'offline-start.png') });
  await page.evaluate(() => window.__mc.go('fx')).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, 'offline-fx-stale.png') });
  report.offline = { appLoadedOffline: offlineOk };
  await ctx.close();
  await rm(dir, { recursive: true, force: true });
}

// ---------- 6. load time with 4x CPU throttle + "Fast 3G"-ish network, cold cache ----------
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await page.goto(ORIGIN + '/');
  await page.waitForFunction(() => performance.getEntriesByName('mc-first-frame').length > 0, null, { timeout: 15000 }).catch(() => {});
  report.perf = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const f = performance.getEntriesByName('mc-first-frame')[0];
    const bytes = performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) + (n.transferSize || 0);
    return { domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), firstFrameMs: f ? Math.round(f.startTime) : null, transferredKB: Math.round(bytes / 1024) };
  });
  await ctx.close();
}

// ---------- 7. render cost per page: drawn fps + main-thread busy %, 4x CPU throttle ----------
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((proxy) => localStorage.setItem('mc.settings', JSON.stringify({ rssProxy: proxy })), ORIGIN + '/proxy?url={url}');
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/');
  await waitForData(page, ['iss', 'quakes', 'fx', 'wx', 'news']);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  report.render = {};
  for (const id of ['clock', 'bus', 'map', 'news', 'fx']) {
    await page.evaluate((i) => window.__mc.go(i), id);
    await page.waitForTimeout(800);
    const f0 = await page.evaluate(() => window.__mc.drawn()); const m0 = await metric();
    await page.waitForTimeout(4000);
    const f1 = await page.evaluate(() => window.__mc.drawn()); const m1 = await metric();
    const wall = m1.Timestamp - m0.Timestamp;
    report.render[id] = {
      drawnFps: +((f1 - f0) / wall).toFixed(1),
      mainThreadBusyPct: Math.round(((m1.TaskDuration - m0.TaskDuration) / wall) * 100),
      jsHeapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1)
    };
  }
  // slide transition smoothness
  await page.evaluate(() => window.__mc.go('clock'));
  await ctx.close();
}

await browser.close();
server.close();
console.log(JSON.stringify(report, null, 2));
