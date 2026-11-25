/* Mission Control ticker - vanilla JS, canvas only, no dependencies.
 * Everything visible is drawn with a 5x7 dot-matrix font onto <canvas>.
 * Page content is cached in offscreen layers and only redrawn when its
 * inputs change; the frame loop is capped at 30 fps and skips frames
 * when nothing moved. */
'use strict';
(function () {
  const APP_VERSION = '1.7.0';
  const FADE_MS = 110, WIPE_MS = 240; // page change: phosphor decay, then a column-by-column redraw
  const LONGPRESS_MS = 650;

  /* ================================================================ storage */
  const LS = {
    get(k, d) {
      try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* quota or private mode */ }
    },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  const isNative = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());

  /* =============================================================== settings */
  const PAGE_DEFS = [
    { id: 'clock', title: 'CLOCK' },
    { id: 'bus', title: 'BUS' },
    { id: 'sky', title: 'SKY' },
    { id: 'fx', title: 'FX RATES' },
    { id: 'weather', title: 'WEATHER' },
    { id: 'news', title: 'HEADLINES' },
    { id: 'releases', title: 'NEW RELEASES' },
    { id: 'kural', title: 'KURAL' },
    { id: 'countdown', title: 'COUNTDOWN' },
    { id: 'credits', title: 'CREDITS' }
  ];
  const DEFAULTS = {
    relArtists: 'Anirudh Ravichander, Sai Abhyankkar',
    rssUrl: 'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml', rssProxy: '',
    cdName: 'TRAIN TRIP', cdDate: '',
    palette: 'vfd', dwell: 6, notchMargin: 28,
    remoteOn: true, remoteTopic: '',
    fxAlerts: { usdinr: '', sgdinr: '' },
    pages: { clock: true, bus: true, sky: true, fx: true, weather: true, news: true, releases: true, kural: true, countdown: true, credits: true }
  };
  function loadSettings() {
    const s = Object.assign({}, DEFAULTS, LS.get('mc.settings', {}));
    s.pages = Object.assign({}, DEFAULTS.pages, s.pages || {});
    s.fxAlerts = Object.assign({}, DEFAULTS.fxAlerts, s.fxAlerts || {});
    if (s.rssUrl === 'https://www.business-standard.com/rss/markets-106.rss' && !s.feedMigrated) { // v1.6: switch to CNBC-TV18
      s.rssUrl = DEFAULTS.rssUrl; s.feedMigrated = true; LS.set('mc.settings', s); LS.del('mc.cache.v1.news');
    }
    delete s.rssDirect; // replaced by automatic direct/proxy detection
    if (!s.remoteTopic) { // private, unguessable ntfy topic, created once per device
      const b = new Uint8Array(10);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
      else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
      s.remoteTopic = 'mc-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      LS.set('mc.settings', s);
    }
    return s;
  }
  let S = loadSettings();
  const feedReady = () => !!S.rssUrl;
  const skyReady = () => isNative() || !!S.rssProxy;
  /* Your CORS proxy (Settings): {url} is replaced by the encoded target URL, otherwise it is appended. */
  function proxied(u) {
    if (isNative() || !S.rssProxy) return u;
    const pr = S.rssProxy.trim();
    return pr.indexOf('{url}') >= 0 ? pr.replace('{url}', encodeURIComponent(u)) : pr + encodeURIComponent(u);
  }

  /* ================================================================ palette */
  const PALETTES = {
    vfd: {
      main: '#5ff2d0', dim: '#2a8a74', accent: '#5ff2d0', warn: '#5ff2d0', bad: '#5ff2d0', good: '#5ff2d0',
      iss: '#c8fff1', quake: '#5ff2d0', home: '#5ff2d0', land: '#2fa88c', sgt: '#5ff2d0', ist: '#5ff2d0'
    },
    color: {
      main: '#5ff2d0', dim: '#2a8a74', accent: '#ffd166', warn: '#ffb347', bad: '#ff5a4e', good: '#7dff8a',
      iss: '#ffffff', quake: '#ff5a4e', home: '#ffd166', land: '#2fa88c', sgt: '#5ff2d0', ist: '#ffb347'
    }
  };
  let PAL = PALETTES[S.palette] || PALETTES.vfd;

  /* =================================================================== font
   * 5x7 dot-matrix glyphs, rows top to bottom. Upper-case only (VFD style). */
  const FONT_SRC = `
SP 00000 00000 00000 00000 00000 00000 00000
! 00100 00100 00100 00100 00100 00000 00100
" 01010 01010 01010 00000 00000 00000 00000
# 01010 01010 11111 01010 11111 01010 01010
$ 00100 01111 10100 01110 00101 11110 00100
% 11000 11001 00010 00100 01000 10011 00011
& 01100 10010 10100 01000 10101 10010 01101
' 00100 00100 01000 00000 00000 00000 00000
( 00010 00100 01000 01000 01000 00100 00010
) 01000 00100 00010 00010 00010 00100 01000
* 00000 00100 10101 01110 10101 00100 00000
+ 00000 00100 00100 11111 00100 00100 00000
, 00000 00000 00000 00000 01100 00100 01000
- 00000 00000 00000 11111 00000 00000 00000
. 00000 00000 00000 00000 00000 01100 01100
/ 00000 00001 00010 00100 01000 10000 00000
0 01110 10001 10011 10101 11001 10001 01110
1 00100 01100 00100 00100 00100 00100 01110
2 01110 10001 00001 00010 00100 01000 11111
3 11111 00010 00100 00010 00001 10001 01110
4 00010 00110 01010 10010 11111 00010 00010
5 11111 10000 11110 00001 00001 10001 01110
6 00110 01000 10000 11110 10001 10001 01110
7 11111 00001 00010 00100 01000 01000 01000
8 01110 10001 10001 01110 10001 10001 01110
9 01110 10001 10001 01111 00001 00010 01100
: 00000 01100 01100 00000 01100 01100 00000
; 00000 01100 01100 00000 01100 00100 01000
< 00010 00100 01000 10000 01000 00100 00010
= 00000 00000 11111 00000 11111 00000 00000
> 01000 00100 00010 00001 00010 00100 01000
? 01110 10001 00001 00010 00100 00000 00100
@ 01110 10001 00001 01101 10101 10101 01110
A 01110 10001 10001 10001 11111 10001 10001
B 11110 10001 10001 11110 10001 10001 11110
C 01110 10001 10000 10000 10000 10001 01110
D 11100 10010 10001 10001 10001 10010 11100
E 11111 10000 10000 11110 10000 10000 11111
F 11111 10000 10000 11110 10000 10000 10000
G 01110 10001 10000 10111 10001 10001 01111
H 10001 10001 10001 11111 10001 10001 10001
I 01110 00100 00100 00100 00100 00100 01110
J 00111 00010 00010 00010 00010 10010 01100
K 10001 10010 10100 11000 10100 10010 10001
L 10000 10000 10000 10000 10000 10000 11111
M 10001 11011 10101 10101 10001 10001 10001
N 10001 10001 11001 10101 10011 10001 10001
O 01110 10001 10001 10001 10001 10001 01110
P 11110 10001 10001 11110 10000 10000 10000
Q 01110 10001 10001 10001 10101 10010 01101
R 11110 10001 10001 11110 10100 10010 10001
S 01111 10000 10000 01110 00001 00001 11110
T 11111 00100 00100 00100 00100 00100 00100
U 10001 10001 10001 10001 10001 10001 01110
V 10001 10001 10001 10001 10001 01010 00100
W 10001 10001 10001 10101 10101 10101 01010
X 10001 10001 01010 00100 01010 10001 10001
Y 10001 10001 10001 01010 00100 00100 00100
Z 11111 00001 00010 00100 01000 10000 11111
[ 01110 01000 01000 01000 01000 01000 01110
\\ 00000 10000 01000 00100 00010 00001 00000
] 01110 00010 00010 00010 00010 00010 01110
^ 00100 01010 10001 00000 00000 00000 00000
_ 00000 00000 00000 00000 00000 00000 11111
| 00100 00100 00100 00100 00100 00100 00100
~ 00000 00000 01000 10101 00010 00000 00000
° 01100 10010 10010 01100 00000 00000 00000
▲ 00000 00100 00100 01110 01110 11111 00000
▼ 00000 11111 01110 01110 00100 00100 00000
▶ 10000 11000 11100 11110 11100 11000 10000
♪ 00111 00101 00100 00100 01100 11100 01000
₹ 11111 00100 11111 00100 11000 00110 00001
• 00000 00000 01110 01110 01110 00000 00000
· 00000 00000 00000 00100 00000 00000 00000
█ 11111 11111 11111 11111 11111 11111 11111
● 00000 01110 11111 11111 11111 01110 00000
○ 00000 01110 10001 10001 10001 01110 00000
`;
  const FONT = new Map();
  for (const line of FONT_SRC.trim().split('\n')) {
    const parts = line.trim().split(/\s+/);
    const ch = parts[0] === 'SP' ? ' ' : parts[0];
    const cells = [];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (parts[1 + r][c] === '1') cells.push(c, r);
    FONT.set(ch, cells);
  }
  const QMARK = FONT.get('?');

  /* 9x9 weather icons */
  const ICONS = {
    sun: '....#.... .#.....#. ...###... ..#####.. #.#####.# ..#####.. ...###... .#.....#. ....#....',
    moon: '...###... ..##..... .##...... .##...... .##...... .##...... ..##..... ...###... .........',
    partly: '.#..#.... ..###.#.. .###..... .##.ooo.. ..#ooooo. ..ooooooo .oooooooo .ooooooo. .........',
    cloud: '......... ...##.... ..####.#. .######## ######### ######### .#######. ......... .........',
    rain: '...oo.... ..oooo.o. .oooooooo ooooooooo .ooooooo. ......... .#..#..#. #..#..#.. .........',
    storm: '..ooo.... .ooooo.o. ooooooooo ooooooooo .ooooooo. .....##.. ....##... ...####.. ....#....',
    fog: '......... #######.. ......... ..####### ......... #######.. ......... ..####### .........',
    snow: '...oo.... ..oooo.o. .oooooooo ooooooooo .ooooooo. ......... .#..#..#. ......... ..#..#..#',
    drop: '...#... ...#... ..###.. .#####. .#####. .#####. ..###..',
    sunup: '....#.... ...###... ..#####.. ......... ...###... .#######. ......... ooooooooo',
    sundown: '..#####.. ...###... ....#.... ......... ...###... .#######. ......... ooooooooo'
  };
  const ICON_CELLS = {};
  for (const k in ICONS) {
    const rows = ICONS[k].split(' '); const cells = [], dim = [];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) { if (row[c] === '#') cells.push(c, r); else if (row[c] === 'o') dim.push(c, r); }
    });
    ICON_CELLS[k] = { cells, dim };
  }

  /* ================================================================ sprites */
  const spriteCache = new Map();
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  /* A lit VFD dot: bright core + soft halo (halos add up with 'lighter'). */
  function sprite(color, p, kind) {
    const key = color + '|' + p + '|' + kind;
    let s = spriteCache.get(key);
    if (s) return s;
    const [r, g, b] = rgb(color);
    const size = Math.max(3, Math.ceil(p * 3));
    s = mkCanvas(size, size);
    const x = s.getContext('2d'); const cx = size / 2;
    if (kind === 'ghost') {
      x.fillStyle = `rgba(${r},${g},${b},0.075)`;
      x.beginPath(); x.arc(cx, cx, Math.max(0.6, p * 0.36), 0, Math.PI * 2); x.fill();
    } else {
      const gr = x.createRadialGradient(cx, cx, 0, cx, cx, cx);
      gr.addColorStop(0, `rgba(${r},${g},${b},0.34)`);
      gr.addColorStop(0.35, `rgba(${r},${g},${b},0.16)`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      x.fillStyle = gr; x.fillRect(0, 0, size, size);
      x.fillStyle = `rgb(${r},${g},${b})`;
      x.beginPath(); x.arc(cx, cx, Math.max(0.7, p * 0.4), 0, Math.PI * 2); x.fill();
      if (p >= 4) {
        x.fillStyle = 'rgba(255,255,255,0.28)';
        x.beginPath(); x.arc(cx, cx, p * 0.17, 0, Math.PI * 2); x.fill();
      }
    }
    spriteCache.set(key, s);
    return s;
  }

  /* =================================================================== text */
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[‘’‚′`]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/[–—−]/g, '-')
      .replace(/…/g, '...')
      .replace(/\u00A9/g, '(C)')
      .replace(/[{]/g, '(').replace(/[}]/g, ')')
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }
  const tw = (n, p) => (n > 0 ? (n * 6 - 1) * p : 0); // width of n chars
  const th = (p) => 7 * p;
  const LH = 10; // line height in dots

  /* Draw dot-matrix text. Returns drawn width. align: left|center|right */
  function text(g, str, x, y, p, color, align, ghost) {
    str = norm(str);
    const w = tw(str.length, p);
    if (align === 'center') x = x - w / 2; else if (align === 'right') x = x - w;
    x = Math.round(x); y = Math.round(y);
    if (ghost) {
      const gs = sprite(color, p, 'ghost'); const go = gs.width / 2 - p / 2;
      for (let i = 0; i < str.length; i++) {
        const bx = x + i * 6 * p;
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) g.drawImage(gs, bx + c * p - go, y + r * p - go);
      }
    }
    const sp = sprite(color, p, 'glow'); const o = sp.width / 2 - p / 2;
    const prev = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < str.length; i++) {
      const cells = FONT.get(str[i]) || QMARK;
      const bx = x + i * 6 * p;
      for (let j = 0; j < cells.length; j += 2) g.drawImage(sp, bx + cells[j] * p - o, y + cells[j + 1] * p - o);
    }
    g.globalCompositeOperation = prev;
    return w;
  }
  function icon(g, name, x, y, p, color, dimColor) {
    const ic = ICON_CELLS[name] || ICON_CELLS.cloud;
    const prev = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter';
    for (const [cells, col] of [[ic.dim, dimColor || color], [ic.cells, color]]) {
      const sp = sprite(col, p, 'glow'); const o = sp.width / 2 - p / 2;
      for (let j = 0; j < cells.length; j += 2) g.drawImage(sp, x + cells[j] * p - o, y + cells[j + 1] * p - o);
    }
    g.globalCompositeOperation = prev;
  }
  /* Text that shrinks its dot pitch (down to 2) to fit maxW. */
  function fitText(g, str, x, y, maxW, pmax, color, align) {
    const n = norm(str).length;
    const p = Math.max(2, Math.min(pmax, Math.floor(maxW / Math.max(1, n * 6 - 1))));
    const s = tw(n, p) > maxW ? clip(str, Math.floor((maxW / p + 1) / 6)) : str;
    return text(g, s, x, y, p, color, align);
  }
  function wrap(str, maxChars, maxLines) {
    const words = norm(str).split(' ');
    const lines = []; let cur = '';
    for (let w of words) {
      while (w.length > maxChars) {
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, maxChars)); w = w.slice(maxChars);
      }
      if (!w) continue;
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) {
      const keep = lines.slice(0, maxLines);
      let last = keep[maxLines - 1];
      if (last.length > maxChars - 3) last = last.slice(0, maxChars - 3);
      keep[maxLines - 1] = last + '...';
      return keep;
    }
    return lines;
  }
  const clip = (s, n) => { s = norm(s); return s.length > n ? s.slice(0, Math.max(0, n - 3)) + '...' : s; };
  const fitP = (chars, maxW, maxH, cap) => Math.max(1, Math.floor(Math.min(maxW / Math.max(1, chars * 6 - 1), maxH / 7, cap || 1e9)));
  function dotLine(g, x, y, w, p, color) {
    g.fillStyle = color; g.globalAlpha = 0.5;
    const step = p * 2; const r = Math.max(0.6, p * 0.3);
    g.beginPath();
    for (let xx = x; xx <= x + w; xx += step) { g.moveTo(xx + r, y); g.arc(xx, y, r, 0, Math.PI * 2); }
    g.fill(); g.globalAlpha = 1;
  }

  /* ================================================================ time fmt */
  const pad2 = (n) => String(n).padStart(2, '0');
  const hhmm = (ts) => { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 'S';
    const m = Math.round(s / 60); if (m < 60) return m + 'M';
    const h = Math.round(m / 60); if (h < 48) return h + 'H';
    return Math.round(h / 24) + 'D';
  }
  const fmtCache = {};
  function zoneParts(tz, d) {
    const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    }));
    const o = {};
    for (const p of f.formatToParts(d)) o[p.type] = p.value;
    return o;
  }
  function zoneOffset(tz, d) {
    try {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
      const p = f.formatToParts(d).find((x) => x.type === 'timeZoneName');
      return p ? p.value.replace('GMT', 'UTC') : '';
    } catch (e) { return ''; }
  }

  /* ============================================================ data layer */
  const CK = 'mc.cache.v1.';
  const FEEDMODE_KEY = 'mc.feedmode.v1';
  const FEEDS = {
    cnbc: 'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml',          // loads directly
    bs: 'https://www.business-standard.com/rss/markets-106.rss'                   // needs the CORS proxy
  };
  const feedPreset = (u) => Object.keys(FEEDS).find((k) => FEEDS[k] === String(u).trim()) || 'custom';
  const feedMode = () => (isNative() ? 'NATIVE' : ({ direct: 'DIRECT', proxy: 'VIA PROXY' })[LS.get(FEEDMODE_KEY, {})[String(S.rssUrl).trim()]] || 'AUTO');
  /* Friendly names for known feeds (channel titles can be long SEO strings). */
  function feedLabel(url, title) {
    const h = String(url);
    if (/cnbctv18\.com/.test(h)) return 'CNBC-TV18 MARKETS';
    if (/business-standard\.com/.test(h)) return 'BUSINESS STANDARD';
    if (/moneycontrol\.com/.test(h)) return 'MONEYCONTROL';
    if (/economictimes/.test(h)) return 'ECONOMIC TIMES';
    if (/livemint\.com/.test(h)) return 'MINT';
    return title || 'HEADLINES';
  }
  const KNOWN_ARTISTS = { 'anirudh ravichander': 480976476, 'sai abhyankkar': 1652280551 };
  /* One kural per local day, cycling through all 1330. */
  const kuralNo = () => { const d = new Date(); return (Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) % 1330) + 1; };
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const BUS_STOPS = [
    { code: '16081', name: 'PALM GREEN', lat: 1.29196, lng: 103.76866 },
    { code: '16089', name: 'CLEMENTI RD', lat: 1.29201, lng: 103.76908 }
  ];
  const fmtDate = (d) => d.toISOString().slice(0, 10);
  const SRC = {
    sky: {
      every: 60e3, retry: 30e3, timeout: 15e3,
      on: () => S.pages.sky && skyReady(),
      fetch: () => skyFetch(),
      parse: (x) => x
    },
    quakes: {
      every: 300e3, retry: 30e3, timeout: 15e3,
      on: () => S.pages.sky,
      url: () => 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
      parse(j) {
        if (!j || !Array.isArray(j.features)) throw new Error('BAD DATA');
        const list = j.features
          .filter((f) => f && f.geometry && f.properties && typeof f.properties.mag === 'number')
          .map((f) => ({
            mag: f.properties.mag, place: f.properties.place || 'UNKNOWN', t: f.properties.time,
            lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2]
          }))
          .sort((a, b) => b.t - a.t);
        return { list, generated: j.metadata && j.metadata.generated };
      }
    },
    fx: {
      every: 3600e3, retry: 30e3, timeout: 15e3,
      on: () => S.pages.fx,
      url: () => `https://api.frankfurter.dev/v1/${fmtDate(new Date(Date.now() - 45 * 864e5))}..?base=USD&symbols=INR,SGD`,
      parse(j) {
        if (!j || !j.rates) throw new Error('BAD DATA');
        const series = Object.keys(j.rates).sort()
          .map((d) => ({ d, inr: j.rates[d].INR, sgd: j.rates[d].SGD }))
          .filter((r) => typeof r.inr === 'number' && typeof r.sgd === 'number');
        if (!series.length) throw new Error('EMPTY');
        return { series, date: series[series.length - 1].d };
      }
    },
    wx: {
      every: 900e3, retry: 30e3, timeout: 15e3,
      on: () => S.pages.weather,
      url: () => 'https://api.open-meteo.com/v1/forecast?latitude=1.2897,12.9716&longitude=103.8501,77.5946' +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
        '&hourly=temperature_2m,precipitation_probability,weather_code,is_day&forecast_hours=7' +
        '&minutely_15=precipitation&forecast_minutely_15=8' +
        '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&forecast_days=1&timezone=auto',
      parse(j) {
        const arr = Array.isArray(j) ? j : [j];
        if (arr.length < 2 || !arr[0].current) throw new Error('BAD DATA');
        const names = ['SINGAPORE', 'BENGALURU'];
        return arr.slice(0, 2).map((o, i) => ({
          name: names[i],
          time: o.current.time,
          temp: o.current.temperature_2m, feels: o.current.apparent_temperature,
          hum: o.current.relative_humidity_2m, wind: o.current.wind_speed_10m,
          code: o.current.weather_code, isDay: o.current.is_day,
          rainNow: o.hourly && o.hourly.precipitation_probability ? o.hourly.precipitation_probability[0] : null,
          rainDay: o.daily && o.daily.precipitation_probability_max ? o.daily.precipitation_probability_max[0] : null,
          tmax: o.daily && o.daily.temperature_2m_max ? o.daily.temperature_2m_max[0] : null,
          tmin: o.daily && o.daily.temperature_2m_min ? o.daily.temperature_2m_min[0] : null,
          off: o.utc_offset_seconds || 0,
          sunrise: o.daily && o.daily.sunrise ? String(o.daily.sunrise[0]).slice(11, 16) : '',
          sunset: o.daily && o.daily.sunset ? String(o.daily.sunset[0]).slice(11, 16) : '',
          hours: o.hourly && o.hourly.time ? o.hourly.time.slice(1, 7).map((t, k) => ({
            h: String(t).slice(11, 13), temp: o.hourly.temperature_2m[k + 1], pp: o.hourly.precipitation_probability[k + 1],
            code: o.hourly.weather_code ? o.hourly.weather_code[k + 1] : null, isDay: o.hourly.is_day ? o.hourly.is_day[k + 1] : 1
          })) : [],
          m15: o.minutely_15 && o.minutely_15.time ? { t: o.minutely_15.time, p: o.minutely_15.precipitation } : null
        }));
      }
    },
    aq: {
      every: 1800e3, retry: 60e3, timeout: 15e3,
      on: () => S.pages.weather,
      url: () => 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=1.2897,12.9716&longitude=103.8501,77.5946' +
        '&current=us_aqi,pm2_5&timezone=auto',
      parse(j) {
        const arr = Array.isArray(j) ? j : [j];
        if (arr.length < 2 || !arr[0].current) throw new Error('BAD DATA');
        return arr.slice(0, 2).map((o) => ({ aqi: o.current.us_aqi, pm25: o.current.pm2_5 }));
      }
    },
    bus: {
      every: 30e3, retry: 15e3, timeout: 10e3,
      on: () => S.pages.bus,
      url: () => BUS_STOPS.map((b) => 'https://arrivelah2.busrouter.sg/?id=' + b.code),
      parse(arr) {
        const one = (n) => (n && n.time ? { t: Date.parse(n.time), lat: +n.lat || 0, lng: +n.lng || 0, load: n.load || '', type: n.type || '' } : null);
        return arr.map((j, i) => {
          if (!j || !Array.isArray(j.services)) throw new Error('BAD DATA');
          return {
            code: BUS_STOPS[i].code,
            services: j.services.map((x) => ({ no: String(x.no), buses: [one(x.next), one(x.next2), one(x.next3)].filter(Boolean) }))
          };
        });
      }
    },
    kural: {
      every: 6 * 3600e3, retry: 60e3, timeout: 15e3,
      on: () => S.pages.kural,
      url: () => 'kural/k' + pad2(Math.floor((kuralNo() - 1) / 100) + 1) + '.json',
      parse(rows) {
        const n = kuralNo(), r = Array.isArray(rows) && rows.find((x) => x[0] === n);
        if (!r) throw new Error('KURAL NOT FOUND');
        return { date: todayKey(), n, ta: [r[1], r[2]], en: r[3], ch: r[4] };
      }
    },
    news: {
      every: 600e3, retry: 30e3, timeout: 15e3, text: true,
      on: () => S.pages.news && feedReady(),
      /* Feeds that send CORS headers (e.g. CNBC-TV18) load directly; others go through your proxy.
         The result is remembered per feed so a blocked direct attempt isn't repeated. */
      async fetch() {
        const u = S.rssUrl.trim(), modes = LS.get(FEEDMODE_KEY, {});
        const via = (m) => fetchWithTimeout(m === 'proxy' ? proxied(u) : u, this.timeout, true);
        if (isNative() || modes[u] === 'direct') return via('direct');
        if (modes[u] === 'proxy' && S.rssProxy) return via('proxy');
        try { const t = await via('direct'); modes[u] = 'direct'; LS.set(FEEDMODE_KEY, modes); return t; }
        catch (e) {
          if (!S.rssProxy || !(e && (e.name === 'TypeError' || /^HTTP 40[13]/.test(e.message)))) throw e;
          const t = await via('proxy'); modes[u] = 'proxy'; LS.set(FEEDMODE_KEY, modes); return t;
        }
      },
      parse(txt) {
        const doc = new DOMParser().parseFromString(txt, 'text/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('BAD XML');
        const pick = (el, tag) => { const n = el.getElementsByTagName(tag)[0]; return n ? n.textContent.trim() : ''; };
        let nodes = Array.from(doc.getElementsByTagName('item'));
        if (!nodes.length) nodes = Array.from(doc.getElementsByTagName('entry'));
        const items = nodes.slice(0, 30).map((n) => {
          const d = Date.parse(pick(n, 'pubDate') || pick(n, 'updated') || pick(n, 'dc:date'));
          return { title: pick(n, 'title').replace(/\s+/g, ' '), t: isNaN(d) ? null : d };
        }).filter((x) => x.title);
        if (!items.length) throw new Error('EMPTY FEED');
        const ch = doc.getElementsByTagName('channel')[0];
        return { items, title: ch ? pick(ch, 'title') : '' };
      }
    },
    rel: {
      every: 6 * 3600e3, retry: 120e3, timeout: 15e3,
      on: () => S.pages.releases,
      // iTunes catalogue: resolve artist names to ids once (cached), then list their latest releases.
      async fetch() {
        const names = String(S.relArtists || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6);
        if (!names.length) throw new Error('NO ARTISTS SET');
        const ids = LS.get('mc.artistIds', {}), out = [];
        for (const n of names) {
          const k = n.toLowerCase();
          let id = ids[k] || KNOWN_ARTISTS[k];
          if (!id) {
            const j = await fetchWithTimeout('https://itunes.apple.com/search?entity=musicArtist&country=in&limit=1&term=' + encodeURIComponent(n), this.timeout);
            id = j && j.results && j.results[0] && j.results[0].artistId;
            if (!id) continue;
            ids[k] = id; LS.set('mc.artistIds', ids);
          }
          out.push(await fetchWithTimeout('https://itunes.apple.com/lookup?entity=album&limit=60&sort=recent&country=in&id=' + id, this.timeout));
        }
        if (!out.length) throw new Error('ARTISTS NOT FOUND');
        return out;
      },
      parse(arr) {
        const seen = new Set(), items = [];
        for (const j of arr) {
          for (const r of (j && j.results) || []) {
            if (r.wrapperType !== 'collection' || !r.releaseDate || seen.has(r.collectionId)) continue;
            seen.add(r.collectionId);
            let name = String(r.collectionName || ''), type = 'ALBUM', film = '', lang = '';
            if (/ - Single$/i.test(name)) { type = 'SINGLE'; name = name.replace(/ - Single$/i, ''); }
            else if (/ - EP$/i.test(name)) { type = 'EP'; name = name.replace(/ - EP$/i, ''); }
            const fm = /\(From [“"]([^"”]+)[”"]\)/i.exec(name);
            if (fm) { film = fm[1].trim(); name = name.replace(fm[0], ''); }
            const lm = /\[([A-Za-z]+)\]/.exec(name);
            if (lm) { lang = lm[1]; name = name.replace(lm[0], ''); }
            if (/original (motion picture )?(soundtrack|background score)/i.test(name)) type = 'SOUNDTRACK';
            items.push({ id: r.collectionId, art: r.artworkUrl100 || r.artworkUrl60 || '', t: Date.parse(r.releaseDate), title: name.replace(/\s+/g, ' ').trim(), artist: r.artistName || '', type, film, lang });
          }
        }
        items.sort((a, b) => b.t - a.t);
        return { items: items.slice(0, 16) };
      }
    }
  };
  const ST = {};
  for (const k in SRC) {
    const c = LS.get(CK + k, null);
    ST[k] = { data: c ? c.data : null, ts: c ? c.ts : 0, fails: 0, err: '', next: c ? c.ts + SRC[k].every : 0, busy: false, tried: false, ver: 0 };
  }

  { const rd = ST.rel.data; if (rd && rd.items && rd.items.length && !rd.items[0].id) ST.rel.next = 0; } // pre-1.3 cache: no artwork ids
  { const wd = ST.wx.data; if (wd && wd[0] && wd[0].hours && wd[0].hours[0] && wd[0].hours[0].code === undefined) ST.wx.next = 0; } // pre-1.3.1: no hourly icons

  async function fetchWithTimeout(url, ms, asText) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(() => { if (ac) ac.abort(); rej(new Error('TIMEOUT')); }, ms);
    });
    try {
      const res = await Promise.race([
        fetch(url, { signal: ac ? ac.signal : undefined, cache: 'no-store', credentials: 'omit' }), timeout
      ]);
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { const j = await Promise.race([res.json(), timeout]); if (j && j.message) msg += ' ' + j.message; } catch (e) { /* not json */ }
        throw new Error(msg);
      }
      return await Promise.race([asText ? res.text() : res.json(), timeout]);
    } finally { clearTimeout(timer); }
  }
  function shortErr(e) {
    if (!e) return 'ERROR';
    if (e.name === 'AbortError' || e.message === 'TIMEOUT') return 'TIMEOUT';
    if (e.name === 'TypeError') return navigator.onLine === false ? 'OFFLINE' : 'NETWORK/CORS';
    if (e.name === 'SyntaxError') return 'BAD RESPONSE';
    return norm(e.message).slice(0, 48);
  }
  async function runSource(k) {
    const s = SRC[k], st = ST[k], gen = st.gen || 0;
    st.busy = true; st.tried = true;
    try {
      const u = s.fetch ? null : s.url();
      const raw = s.fetch ? await s.fetch() : Array.isArray(u) ? await Promise.all(u.map((x) => fetchWithTimeout(x, s.timeout, s.text)))
        : await fetchWithTimeout(u, s.timeout, s.text);
      if ((st.gen || 0) !== gen) { st.next = 0; return; } // source changed mid-flight (e.g. new feed): drop this result
      const data = s.parse(raw, st.data);
      st.data = data; st.ts = Date.now(); st.fails = 0; st.err = '';
      LS.set(CK + k, { data, ts: st.ts });
      st.next = Date.now() + s.every;
    } catch (e) {
      if ((st.gen || 0) !== gen) { st.next = 0; return; }
      st.fails++; st.err = shortErr(e);
      const back = Math.min(s.retry * Math.pow(2, st.fails - 1), Math.max(s.every, 300e3));
      st.next = Date.now() + back * (0.85 + Math.random() * 0.3);
    } finally {
      st.busy = false; st.ver++;
    }
  }
  function schedTick() {
    if (document.hidden || sleeping) return;
    const now = Date.now();
    const offline = navigator.onLine === false;
    const od = ST.kural;
    if (od.data && od.data.date !== todayKey() && !od.fails && !od.busy) od.next = Math.min(od.next, now);
    for (const k in SRC) {
      const st = ST[k];
      if (!SRC[k].on() || st.busy || now < st.next) continue;
      if (offline) { // don't hit the network; count it as a failed attempt so data shows STALE
        st.fails++; st.err = 'OFFLINE'; st.next = now + 30e3; st.ver++;
        continue;
      }
      runSource(k);
    }
  }
  function isStale(k, now) {
    const st = ST[k]; if (!st.data) return false;
    const e = SRC[k].every;
    return st.fails > 0 || now - st.ts > Math.max(e * 2.5, e + 60e3);
  }
  /* Status label for a source: never invents data. */
  function status(k, now) {
    const st = ST[k];
    if (!st.data) {
      if (st.fails > 0) return { text: 'NO DATA · ' + st.err, color: PAL.warn, none: true };
      return { text: 'LOADING', color: PAL.dim, none: true };
    }
    if (isStale(k, now)) return { text: 'STALE ' + hhmm(st.ts) + (st.err ? ' · ' + st.err : ''), color: PAL.warn, stale: true };
    return { text: 'UPD ' + hhmm(st.ts), color: PAL.dim };
  }
  const sig = (k, now) => { const st = ST[k]; return st.ver + (isStale(k, now) ? 's' : 'f') + (st.data ? 1 : 0); };

  /* ================================================================ layout */
  const cv = document.getElementById('screen');
  const ctx = cv.getContext('2d', { alpha: false });
  let W = 0, H = 0, DPR = 1;
  const L = {};
  /* Screen rotation relative to the phone's natural (portrait) orientation:
     90 = top of the phone on the LEFT, 270 = top of the phone on the RIGHT. */
  function screenAngle() {
    const so = window.screen && window.screen.orientation;
    let a = so && typeof so.angle === 'number' ? so.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
    return ((a % 360) + 360) % 360;
  }
  function readInsets() {
    const cs = getComputedStyle(document.getElementById('safe'));
    const ins = {
      t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
      b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0
    };
    // Fallback: some fullscreen PWAs / WebViews report 0 for the cutout. In landscape the
    // M07's teardrop notch sits on the side where the top of the phone is, so keep
    // S.notchMargin CSS px clear on that side.
    const m = Math.max(0, +S.notchMargin || 0);
    if (m && window.innerWidth > window.innerHeight) {
      const a = screenAngle();
      if (a === 90 && ins.l < m) ins.l = m;
      else if (a === 270 && ins.r < m) ins.r = m;
    }
    return ins;
  }
  let insetKey = '';
  const insetSig = () => { const i = readInsets(); return [window.innerWidth, window.innerHeight, i.t, i.r, i.b, i.l].join(','); };
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(window.innerWidth * DPR); H = Math.round(window.innerHeight * DPR);
    cv.width = W; cv.height = H;
    const ins = readInsets();
    insetKey = insetSig();
    const base = Math.min(W, H);
    L.portrait = H >= W;
    L.s1 = Math.max(2, Math.round(base / 180));
    L.s2 = Math.max(3, Math.round(base / 120));
    L.s3 = Math.max(4, Math.round(base / 80));
    L.pad = Math.round(base / 30);
    L.ux = Math.round(ins.l * DPR); L.uy = Math.round(ins.t * DPR);
    L.uw = W - L.ux - Math.round(ins.r * DPR); L.uh = H - L.uy - Math.round(ins.b * DPR);
    L.hdrH = L.s1 * 7 + L.pad * 2;
    L.ftrH = L.s1 * 7 + L.pad * 2;
    L.cx = L.ux; L.cy = L.uy + L.hdrH; L.cw = L.uw; L.ch = L.uh - L.hdrH - L.ftrH;
    layers.clear(); skyBase = null; mmImg = null; newsCache.clear(); hdr.key = ftr.key = null;
    forceDraw = true;
  }

  /* ================================================================= pages */
  const ZONES = [
    { label: 'SINGAPORE', tz: 'Asia/Singapore', col: 'sgt' },
    { label: 'INDIA', tz: 'Asia/Kolkata', col: 'ist' }
  ];
  function splitBlocks(w, h, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(L.portrait ? { x: 0, y: Math.round(i * h / n), w, h: Math.round(h / n) }
        : { x: Math.round(i * w / n), y: 0, w: Math.round(w / n), h });
    }
    return out;
  }
  function blockDividers(g, w, h, n) {
    for (let i = 1; i < n; i++) {
      if (L.portrait) dotLine(g, L.pad, Math.round(i * h / n), w - L.pad * 2, L.s1, PAL.dim);
      else {
        const x = Math.round(i * w / n);
        g.fillStyle = PAL.dim; g.globalAlpha = 0.5; g.beginPath();
        for (let y = L.pad; y < h - L.pad; y += L.s1 * 2) { g.moveTo(x + L.s1 * 0.3, y); g.arc(x, y, L.s1 * 0.3, 0, Math.PI * 2); }
        g.fill(); g.globalAlpha = 1;
      }
    }
  }
  /* Footer line inside a page: source on the left, status on the right. */
  function statusLine(g, w, h, left, st) {
    const p = L.s1, y = h - L.pad - th(p);
    const cols = Math.floor((w - L.pad * 2 + p) / (6 * p));
    const r = st ? norm(st.text) : '', l = left ? norm(left) : '';
    if (r) text(g, clip(r, cols), w - L.pad, y, p, st.color, 'right');
    if (!l) return y - L.pad;
    if (l.length + r.length + 2 <= cols) { text(g, l, L.pad, y, p, PAL.dim); return y - L.pad; }
    const lines = wrap(l, cols, 2);
    let y2 = y - LH * p * lines.length;
    const top = y2;
    for (const ln of lines) { text(g, ln, L.pad, y2, p, PAL.dim); y2 += LH * p; }
    return top - L.pad;
  }
  function centerMsg(g, w, h, big, small) {
    const p = fitP(norm(big).length, w * 0.8, h * 0.15, L.s3 * 2);
    text(g, big, w / 2, h / 2 - th(p), p, PAL.main, 'center');
    if (small) {
      const lines = wrap(small, Math.floor((w - L.pad * 2) / (6 * L.s1)), 7);
      lines.forEach((ln, i) => text(g, ln, w / 2, h / 2 + L.pad + i * LH * L.s1, L.s1, PAL.dim, 'center'));
    }
  }

  /* ---------- 1. clock ---------- */
  function drawClock(g, w, h, now) {
    const d = new Date(now);
    const blocks = splitBlocks(w, h, 2);
    ZONES.forEach((z, i) => {
      const b = blocks[i]; const p = zoneParts(z.tz, d);
      const bw = b.w - L.pad * 2;
      const P = Math.max(2, Math.floor(Math.min(bw / 37, (b.h * 0.45) / 7)));
      const q = Math.max(2, Math.round(P * 0.4));
      const totalW = 29 * P + P + 17 * q;
      const stackH = th(L.s2) + L.s2 * 3 + th(P) + L.s2 * 3 + th(L.s2);
      let y = b.y + Math.round((b.h - stackH) / 2);
      text(g, z.label, b.x + b.w / 2, y, L.s2, PAL[z.col], 'center');
      y += th(L.s2) + L.s2 * 3;
      const x0 = Math.round(b.x + (b.w - totalW) / 2);
      text(g, p.hour + ':' + p.minute, x0, y, P, PAL.main, 'left', true);
      text(g, ':' + p.second, x0 + 30 * P, y + th(P) - th(q), q, PAL.main, 'left', true);
      y += th(P) + L.s2 * 3;
      text(g, `${p.weekday} ${p.day} ${p.month} ${p.year}`, b.x + b.w / 2, y, L.s2, PAL.main, 'center');
    });
    blockDividers(g, w, h, 2);
  }

  /* ---------- Kural of the day: Tamil drawn as dot-matrix + English meaning ----------
     Tamil needs proper shaping (vowel signs, ligatures), so the phone's own Tamil font renders
     the words and each pixel of that small raster becomes one VFD dot. */
  const tamilCache = new Map();
  function tamilBits(str, hd) {
    const key = str + '|' + hd;
    let r = tamilCache.get(key);
    if (r) return r;
    if (tamilCache.size > 60) tamilCache.clear();
    const fs = Math.round(hd * 0.8), font = `600 ${fs}px "Noto Sans Tamil", "Noto Sans Tamil UI", "Tamil Sangam MN", "Latha", sans-serif`;
    const m = mkCanvas(8, 8).getContext('2d'); m.font = font;
    const wd = Math.max(1, Math.ceil(m.measureText(str).width) + 2);
    const c = mkCanvas(wd, hd), g = c.getContext('2d', { willReadFrequently: true });
    g.font = font; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText(str, 1, hd / 2 + 1);
    const d = g.getImageData(0, 0, wd, hd).data, bits = new Uint8Array(wd * hd);
    let last = 0;
    for (let i = 0; i < wd * hd; i++) if (d[i * 4 + 3] > 107) { bits[i] = 1; last = Math.max(last, i % wd); }
    r = { bits, w: Math.min(wd, last + 2), stride: wd, h: hd };
    tamilCache.set(key, r);
    return r;
  }
  function drawTamilRow(g, words, x, y, p, color, hd) {
    const space = Math.round(hd * 0.35);
    const parts = words.map((wd) => tamilBits(wd, hd));
    const total = parts.reduce((a, b2) => a + b2.w, 0) + space * (parts.length - 1);
    const gs = sprite(color, p, 'ghost'), go = gs.width / 2 - p / 2;
    for (let yy = 0; yy < hd; yy++) for (let xx = 0; xx < total; xx++) g.drawImage(gs, x + xx * p - go, y + yy * p - go);
    const sp = sprite(color, p, 'glow'), o = sp.width / 2 - p / 2;
    const prev = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter';
    let ox = 0;
    for (const b2 of parts) {
      for (let yy = 0; yy < b2.h; yy++) for (let xx = 0; xx < b2.w; xx++) if (b2.bits[yy * b2.stride + xx]) g.drawImage(sp, x + (ox + xx) * p - o, y + yy * p - o);
      ox += b2.w + space;
    }
    g.globalCompositeOperation = prev;
    return total;
  }
  function drawKural(g, w, h, now) {
    const st = status('kural', now), k = ST.kural.data;
    const bottom = statusLine(g, w, h, k ? 'THIRUKKURAL · ' + k.n + ' OF 1330' : 'THIRUKKURAL', st);
    if (!k || k.date !== todayKey()) { centerMsg(g, w, bottom, ST.kural.fails ? 'NO DATA' : 'LOADING', ST.kural.err); return; }
    const inner = w - L.pad * 2, avail = bottom - L.pad * 2, HD = 22;
    const wrapTa = (line, p) => { // word-wrap one Tamil line into rows that fit the width
      const words = line.split(/\s+/).filter(Boolean), rows = [];
      let cur = [], cw = 0;
      for (const wd of words) {
        const ww = tamilBits(wd, HD).w + (cur.length ? Math.round(HD * 0.35) : 0);
        if (cur.length && (cw + ww) * p > inner) { rows.push(cur); cur = [wd]; cw = tamilBits(wd, HD).w; }
        else { cur.push(wd); cw += ww; }
      }
      if (cur.length) rows.push(cur);
      return rows;
    };
    let best = null;
    for (let tp = L.s1 + 2; tp >= 2 && !best; tp--) {
      for (const ep of [L.s2, L.s1]) {
        const r1 = wrapTa(k.ta[0], tp), r2 = wrapTa(k.ta[1], tp);
        if (r1.length > 2 || r2.length > 2) break; // too big to keep the two-line couplet shape
        const rows = [...r1, ...r2];
        const en = wrap(k.en, Math.floor((inner + ep) / (6 * ep)));
        if (en.length > 9) continue; // too long at this size: try the smaller English size
        const hTa = rows.length * HD * tp + (rows.length - 1) * tp * 3;
        const total = th(L.s1) + L.pad + hTa + L.pad * 1.4 + en.length * LH * ep;
        if (total <= avail) { best = { tp, ep, rows, en, hTa, total }; break; }
      }
    }
    if (!best) { const tp = 2, ep = L.s1; const rows = [...wrapTa(k.ta[0], tp), ...wrapTa(k.ta[1], tp)]; best = { tp, ep, rows, en: wrap(k.en, Math.floor((inner + ep) / (6 * ep)), 5), hTa: rows.length * HD * tp, total: avail }; }
    let y = L.pad + Math.max(0, Math.round((avail - best.total) / 2));
    if (k.ch) fitText(g, k.ch, w / 2, y, inner, L.s1, PAL.accent, 'center');
    y += th(L.s1) + L.pad;
    for (const row of best.rows) {
      const rw = row.reduce((a, wd, i) => a + tamilBits(wd, HD).w + (i ? Math.round(HD * 0.35) : 0), 0) * best.tp;
      drawTamilRow(g, row, Math.round((w - rw) / 2), y, best.tp, PAL.main, HD);
      y += HD * best.tp + best.tp * 3;
    }
    y += L.pad * 1.4 - best.tp * 3;
    for (const ln of best.en) { text(g, ln, w / 2, y, best.ep, PAL.main, 'center'); y += LH * best.ep; }
  }

  /* ---------- 2. SKY: India - Southeast Asia, live SIN<->BLR flights, regional quakes ---------- */
  const RAD = Math.PI / 180;
  const HOMES = [{ name: 'SIN', lat: 1.3644, lon: 103.9915, side: 1 }, { name: 'BLR', lat: 13.1986, lon: 77.7066, side: -1 }]; // airports
  /* Sub-solar point (low-precision almanac), for the day/night shading. */
  function subsolar(ts) {
    const n = (ts - Date.UTC(2000, 0, 1, 12)) / 864e5;
    const Lm = (280.46 + 0.9856474 * n) % 360;
    const gm = ((357.528 + 0.9856003 * n) % 360) * RAD;
    const lam = (Lm + 1.915 * Math.sin(gm) + 0.02 * Math.sin(2 * gm)) * RAD;
    const eps = (23.439 - 4e-7 * n) * RAD;
    const decl = Math.asin(Math.sin(eps) * Math.sin(lam));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    let eot = Lm * RAD - ra;
    eot = (Math.atan2(Math.sin(eot), Math.cos(eot)) / RAD) * 4; // minutes
    const utcMin = (((ts % 864e5) + 864e5) % 864e5) / 6e4;
    let lon = 180 - (utcMin + eot) / 4;
    lon = ((lon + 540) % 360) - 180;
    return { lat: decl / RAD, lon };
  }
  // Natural Earth coastline for the region (tools/build-region.mjs), loaded after the first frame.
  let REG = null;
  function loadRegion() {
    if (REG || document.getElementById('regData')) return;
    const sc = document.createElement('script');
    sc.id = 'regData'; sc.src = 'region.js'; sc.async = true;
    sc.onload = () => { REG = window.MC_REGION || null; skyBase = null; forceDraw = true; };
    document.head.appendChild(sc);
  }
  const SKY_FIT = { w: 70, e: 108, s: -5, n: 30 }; // always visible: India up to Delhi, Sri Lanka, the Bay of Bengal, Malaysia, Singapore
  function skyGeom(w, h) {
    const pad = L.pad, mx = pad, my = Math.round(pad / 2);
    const mw = w - pad * 2, full = h - (LH * L.s1 * 2 + pad) - my - Math.round(pad / 2);
    const mh = L.portrait ? Math.round(full * 0.64) : full; // portrait: flight board below the map
    const lat0 = (SKY_FIT.s + SKY_FIT.n) / 2, cosl = Math.cos(lat0 * RAD);
    const k = Math.min(mw / ((SKY_FIT.e - SKY_FIT.w) * cosl), mh / (SKY_FIT.n - SKY_FIT.s)); // px per degree of latitude
    return { mx, my, mw, mh, k, cosl, lat0, lonC: (SKY_FIT.w + SKY_FIT.e) / 2, by: my + mh + pad, bb: my + full };
  }
  const skyXY = (G, lon, lat) => [G.mx + G.mw / 2 + (lon - G.lonC) * G.cosl * G.k, G.my + G.mh / 2 - (lat - G.lat0) * G.k];
  const inSky = (G, lon, lat) => { const [x, y] = skyXY(G, lon, lat); return x >= G.mx && x <= G.mx + G.mw && y >= G.my && y <= G.my + G.mh; };
  function greatCircle(a, b, n) {
    const la1 = a.lat * RAD, lo1 = a.lon * RAD, la2 = b.lat * RAD, lo2 = b.lon * RAD;
    const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, A = Math.sin((1 - t) * d) / Math.sin(d), B = Math.sin(t * d) / Math.sin(d);
      const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
      const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
      const z = A * Math.sin(la1) + B * Math.sin(la2);
      out.push([Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD]);
    }
    return out;
  }
  let skyBase = null;
  function getSkyBase(G, now) {
    const key = [G.mw, G.mh, Math.floor(now / 60e3), S.palette, !!REG].join('|');
    if (skyBase && skyBase.key === key) return skyBase.c;
    const sp = Math.max(5, Math.round(Math.min(G.mw, G.mh) / 100));
    const cols = Math.floor(G.mw / sp), rows = Math.floor(G.mh / sp);
    let mask = skyBase && skyBase.cols === cols && skyBase.rows === rows && skyBase.reg === !!REG ? skyBase.mask : null;
    if (!mask) { // rasterise the coastline polygons at dot resolution, then read back which dots are land
      mask = new Uint8Array(cols * rows);
      if (REG) {
        const m = mkCanvas(cols, rows), mg = m.getContext('2d', { willReadFrequently: true });
        const fx = cols / G.mw, fy = rows / G.mh;
        mg.fillStyle = '#fff'; mg.beginPath();
        for (const r of REG.rings) {
          for (let i = 0; i < r.length; i += 2) {
            const [x, y] = skyXY(G, r[i], r[i + 1]), px = (x - G.mx) * fx, py = (y - G.my) * fy;
            if (i) mg.lineTo(px, py); else mg.moveTo(px, py);
          }
          mg.closePath();
        }
        mg.fill();
        const d = mg.getImageData(0, 0, cols, rows).data;
        for (let i = 0; i < cols * rows; i++) mask[i] = d[i * 4 + 3] > 110 ? 1 : 0;
      }
    }
    const c = skyBase && skyBase.c && skyBase.c.width === G.mw && skyBase.c.height === G.mh ? skyBase.c : mkCanvas(G.mw, G.mh);
    const g = c.getContext('2d'); g.clearRect(0, 0, G.mw, G.mh);
    const sun = subsolar(now), sl = Math.sin(sun.lat * RAD), cl = Math.cos(sun.lat * RAD);
    const day = new Path2D(), dusk = new Path2D(), night = new Path2D(), sea = new Path2D();
    const sx = G.mw / cols, sy = G.mh / rows, rL = Math.min(sx, sy) * 0.36, rS = Math.min(sx, sy) * 0.14;
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) * sy, lat = G.lat0 - (y - G.mh / 2) / G.k;
      const sla = Math.sin(lat * RAD), cla = Math.cos(lat * RAD);
      for (let q = 0; q < cols; q++) {
        const x = (q + 0.5) * sx;
        if (!mask[r * cols + q]) { sea.moveTo(x + rS, y); sea.arc(x, y, rS, 0, Math.PI * 2); continue; }
        const lon = G.lonC + (x - G.mw / 2) / (G.cosl * G.k);
        const cz = sla * sl + cla * cl * Math.cos((lon - sun.lon) * RAD);
        const path = cz > 0.05 ? day : cz > -0.1 ? dusk : night;
        path.moveTo(x + rL, y); path.arc(x, y, rL, 0, Math.PI * 2);
      }
    }
    g.fillStyle = PAL.main; g.globalAlpha = 0.09; g.fill(sea);
    g.fillStyle = PAL.land; g.globalAlpha = 0.95; g.fill(day);
    g.globalAlpha = 0.6; g.fill(dusk);
    g.globalAlpha = 0.33; g.fill(night);
    g.globalAlpha = 1;
    if (!REG) text(g, 'LOADING MAP', G.mw / 2, G.mh / 2, L.s1, PAL.dim, 'center');
    skyBase = { key, c, mask, cols, rows, reg: !!REG };
    return c;
  }

  /* Flights: live positions from adsb.lol (via your CORS proxy), routes from adsbdb.
     SIN<->BLR flights are the headline; every other Singapore<->India flight is shown quietly.
     Only real positions are shown; a flight out of receiver range keeps its last fix, marked with its time. */
  const SKY_CARRIERS = { SIA: 'SQ', TGW: 'TR', IGO: '6E', AIC: 'AI', AXB: 'IX', AKJ: 'QP', VTI: 'UK', MAS: 'MH' };
  // Receiver circles (250 nm) around Singapore and the Indian airports with Singapore flights:
  // SIN, BLR, MAA, HYD, BOM, DEL, CCU, TRV (Trivandrum), VTZ (Visakhapatnam). Trichy, Madurai, Coimbatore,
  // Kochi, Goa, Ahmedabad and Lucknow fall inside these.
  const SKY_WATCH = [[1.36, 103.99], [13.2, 77.71], [12.99, 80.17], [17.24, 78.43], [19.09, 72.87], [28.56, 77.1], [22.65, 88.45], [8.48, 76.92], [17.72, 83.22]];
  const ROUTE_KEY = 'mc.routes.v2';
  const routeCache = LS.get(ROUTE_KEY, {});
  async function routeOf(cs) { // 'SIN-MAA' style for Singapore<->India, '' otherwise
    let j = null;
    try { j = await fetchWithTimeout('https://api.adsbdb.com/v0/callsign/' + encodeURIComponent(cs), 10e3); }
    catch (e) { if (!/^HTTP 404/.test(e.message)) throw e; }
    const fr = j && j.response && j.response.flightroute;
    const o = fr && fr.origin, d = fr && fr.destination;
    let r = '';
    if (o && d && ((o.iata_code === 'SIN' && d.country_iso_name === 'IN') || (d.iata_code === 'SIN' && o.country_iso_name === 'IN'))) r = o.iata_code + '-' + d.iata_code;
    routeCache[cs] = { r, t: Date.now() };
    const ks = Object.keys(routeCache);
    if (ks.length > 600) for (const k2 of ks.slice(0, ks.length - 600)) delete routeCache[k2];
    LS.set(ROUTE_KEY, routeCache);
    return r;
  }
  function flightFix(cs, r, a) {
    const alt = typeof a.alt_baro === 'number' ? a.alt_baro : 0, ground = a.alt_baro === 'ground' || alt < 300;
    const [o, d] = r.split('-');
    const al = SKY_CARRIERS[cs.slice(0, 3)] || cs.slice(0, 3);
    const dh = HOMES.find((x) => x.name === d);
    return {
      cs, al, fn: al + cs.slice(3), r, city: o === 'SIN' ? d : o, bl: (o === 'BLR' || d === 'BLR'),
      lat: a.lat, lon: a.lon, trk: a.track != null ? a.track : (a.true_heading || 0), alt, ground,
      // landed: on the ground near its destination (destination coords known for SIN/BLR; others: on the ground and not near SIN)
      landed: !!(ground && (dh ? Math.hypot(a.lat - dh.lat, a.lon - dh.lon) < 0.3 : d !== 'SIN' && Math.hypot(a.lat - HOMES[0].lat, a.lon - HOMES[0].lon) > 1)),
      seen: Date.now() - ((a.seen_pos != null ? a.seen_pos : a.seen) || 0) * 1000
    };
  }
  /* Which callsigns are worth a route lookup, most likely first. A Singapore carrier near an Indian airport,
     or an Indian carrier near Singapore, is almost certainly flying SIN<->India; Singapore Airlines near
     Changi could be going anywhere, so it waits. IndiGo's international flights are 6E1xxx. 9 = skip. */
  function lookupRank(cs, nearSin, nearIndia) {
    const p = cs.slice(0, 3), n = parseInt(cs.slice(3), 10);
    const sgCarrier = p === 'SIA' || p === 'TGW', inCarrier = !sgCarrier && p !== 'MAS';
    if (p === 'IGO' && !(n >= 1000 && n < 2000)) return 9;
    if (sgCarrier && nearIndia) return 0;
    if (inCarrier && nearSin) return 0;
    if (p === 'MAS') return 3;
    return sgCarrier ? 2 : 1;
  }
  /* adsb.lol throttles bursts (simultaneous requests get HTTP 429 and a cool-down), so its calls are paced ~1.1 s apart. */
  let adsbAt = 0, adsbBlocked = false;
  async function adsb(url) {
    if (adsbBlocked) throw new Error('HTTP 429');
    const wait = adsbAt + 1100 - Date.now();
    if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
    adsbAt = Date.now();
    try { return await fetchWithTimeout(proxied(url), 15e3); }
    catch (e) { if (/^HTTP 429/.test(e.message)) adsbBlocked = true; throw e; } // stop for this cycle
  }
  async function skyFetch() {
    const prev = (ST.sky.data && ST.sky.data.flights) || [];
    adsbBlocked = false;
    const seen = new Map(), where = new Map(); // callsign -> { sin, india } circles it was seen in
    let ok = 0, firstErr = null;
    for (const [ci, [la, lo]] of SKY_WATCH.entries()) {
      try {
        const j = await adsb(`https://api.adsb.lol/v2/point/${la}/${lo}/250`);
        ok++;
        for (const a of (j && j.ac) || []) {
          const cs = String(a.flight || '').trim();
          if (!cs || a.lat == null || !SKY_CARRIERS[cs.slice(0, 3)]) continue;
          seen.set(cs, a);
          const wh = where.get(cs) || { sin: false, india: false };
          if (ci === 0) wh.sin = true; else wh.india = true;
          where.set(cs, wh);
        }
      } catch (e) { firstErr = firstErr || e; if (adsbBlocked) break; }
    }
    if (!ok) throw firstErr;
    const flights = new Map(), fresh = (c) => c && Date.now() - c.t < 3 * 864e5;
    const todo = [];
    for (const [cs, a] of seen) {
      const c = routeCache[cs];
      if (fresh(c)) { if (c.r) flights.set(cs, flightFix(cs, c.r, a)); }
      else { const wh = where.get(cs); const rk = lookupRank(cs, wh.sin, wh.india); if (rk < 9) todo.push([rk, cs]); }
    }
    todo.sort((x, y) => x[0] - y[0]);
    for (const [, cs] of todo.slice(0, 20)) { // be gentle with adsbdb; the rest get checked next minute
      let r = '';
      try { r = await routeOf(cs); } catch (e) { continue; }
      if (r) flights.set(cs, flightFix(cs, r, seen.get(cs)));
    }
    // keep following flights that left every circle (no coverage over the Bay of Bengal): BLR first, a few others
    const lost = prev.filter((f) => !flights.has(f.cs) && !f.landed && Date.now() - f.seen < 5 * 3600e3)
      .sort((x, y) => (y.bl - x.bl) || (y.seen - x.seen));
    for (const [i, f] of lost.entries()) {
      let a = null;
      if (f.bl || i < 4) {
        try { const j = await adsb('https://api.adsb.lol/v2/callsign/' + encodeURIComponent(f.cs)); a = ((j && j.ac) || [])[0] || null; }
        catch (e) { a = null; }
      }
      flights.set(f.cs, a && a.lat != null ? flightFix(f.cs, f.r, a) : f);
    }
    return { flights: [...flights.values()] };
  }
  const skyFlights = () => ((ST.sky.data && ST.sky.data.flights) || []).filter((f) => !f.landed && f.r);
  const isBlr = (f) => (f.bl != null ? f.bl : /BLR/.test(f.r));
  function drawSky(g, w, h, now) {
    const G = skyGeom(w, h);
    const qd = ST.quakes.data, quakes = qd ? qd.list.filter((q) => now - q.t <= 864e5 && inSky(G, q.lon, q.lat)) : [];
    const fl = skyFlights(), blr = fl.filter(isBlr), others = fl.filter((f) => !isBlr(f));
    let left, st;
    if (!skyReady()) { left = 'FLIGHTS NEED THE CORS PROXY (SETTINGS)'; st = { text: 'NO PROXY', color: PAL.warn }; }
    else {
      st = status('sky', now);
      left = (ST.sky.data ? blr.length + ' SIN-BLR · ' + others.length + ' SIN-INDIA' : 'FLIGHTS') +
        ' · ' + quakes.length + ' QUAKE' + (quakes.length === 1 ? '' : 'S');
    }
    statusLine(g, w, h, left, st);
    g.drawImage(getSkyBase(G, now), G.mx, G.my);
    // the SIN-BLR great circle
    const gc = greatCircle(HOMES[0], HOMES[1], 90);
    g.fillStyle = PAL.accent; g.globalAlpha = 0.55; g.beginPath();
    let lx = -1e9, ly = -1e9;
    for (const [lo, la] of gc) {
      const [x, y] = skyXY(G, lo, la);
      if (Math.hypot(x - lx, y - ly) < L.s1 * 2.2) continue;
      g.moveTo(x + L.s1 * 0.35, y); g.arc(x, y, L.s1 * 0.35, 0, Math.PI * 2); lx = x; ly = y;
    }
    g.fill(); g.globalAlpha = 1;
    const lp = Math.max(2, L.s1);
    for (const hm of HOMES) {
      const [x, y] = skyXY(G, hm.lon, hm.lat);
      if (hm.side > 0) text(g, hm.name, x + lp * 3, y + lp, lp, PAL.home);
      else text(g, hm.name, x - lp * 3, y - th(lp) - lp, lp, PAL.home, 'right');
    }
    if (L.portrait && skyReady()) { // airport-style board for SIN<->BLR; other India flights summarised in one line
      const bp = L.s2, x = L.pad, bw = w - L.pad * 2;
      let y = G.by;
      dotLine(g, x, y - L.pad / 2, bw, Math.max(1, L.s1 - 1), PAL.dim);
      text(g, 'SIN ▶ BLR  ·  BLR ▶ SIN', x, y, L.s1, PAL.accent); y += LH * L.s1 * 1.4;
      const list = blr.slice().sort((a, b) => (now - a.seen > 5 * 60e3) - (now - b.seen > 5 * 60e3) || a.fn.localeCompare(b.fn));
      if (!ST.sky.data) text(g, ST.sky.fails ? 'NO DATA' : 'LOADING', x, y, bp, PAL.dim);
      else if (!list.length) { text(g, 'NO FLIGHTS IN RANGE', x, y, bp, PAL.dim); y += LH * bp; }
      const reserve = others.length ? LH * L.s1 * 1.6 : 0;
      for (const f of list) {
        if (y + LH * bp + th(L.s1) + reserve > G.bb) break;
        const old = now - f.seen > 5 * 60e3;
        const stat = old ? 'NO SIGNAL · LAST SEEN ' + hhmm(f.seen) : f.ground ? 'ON GROUND' : 'FL' + pad2(Math.round(f.alt / 1000)) + '0 · LIVE';
        text(g, f.fn, x, y, bp, old ? PAL.dim : PAL.iss);
        text(g, f.r.replace('-', ' ▶ '), x + bw, y, bp, PAL.main, 'right');
        y += LH * bp;
        text(g, stat, x, y, L.s1, old ? PAL.dim : PAL.main);
        y += LH * L.s1 * 1.3;
      }
      if (others.length) {
        const sum = '+' + others.length + ' SIN-INDIA: ' + others.map((f) => f.al + ' ' + f.city).join(' · ');
        fitText(g, sum, x, Math.min(y + L.s1, G.bb - th(L.s1)), bw, L.s1, PAL.dim);
      }
    }
  }
  function dynSky(g, w, h, now, ts) {
    const G = skyGeom(w, h), u = Math.max(2, L.s1), pulse = (ts % 2000) / 2000;
    g.save(); g.beginPath(); g.rect(G.mx, G.my, G.mw, G.mh); g.clip();
    const qd = ST.quakes.data;
    if (qd) {
      for (const q of qd.list) {
        if (now - q.t > 864e5 || !inSky(G, q.lon, q.lat)) continue;
        const [x, y] = skyXY(G, q.lon, q.lat);
        const base = u * (0.8 + (q.mag - 4.5) * 0.9), fresh = now - q.t < 3 * 3600e3, ph = fresh ? pulse : 0.15;
        g.strokeStyle = PAL.quake; g.lineWidth = Math.max(1, u * 0.4);
        g.globalAlpha = fresh ? 1 - ph : 0.55;
        g.beginPath(); g.arc(x, y, base + ph * u * 4, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1; g.fillStyle = PAL.quake;
        g.beginPath(); g.arc(x, y, Math.max(1.5, u * 0.55), 0, Math.PI * 2); g.fill();
      }
    }
    for (const hm of HOMES) {
      const [x, y] = skyXY(G, hm.lon, hm.lat);
      g.strokeStyle = PAL.home; g.lineWidth = Math.max(1, u * 0.35); g.globalAlpha = 0.9;
      g.strokeRect(x - u * 1.2, y - u * 1.2, u * 2.4, u * 2.4); g.globalAlpha = 1;
    }
    const arrow = (x, y, trk, r, col) => {
      const a = (trk - 90) * RAD;
      g.fillStyle = col; g.beginPath();
      g.moveTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6);
      g.lineTo(x + Math.cos(a + 2.6) * r, y + Math.sin(a + 2.6) * r);
      g.lineTo(x + Math.cos(a - 2.6) * r, y + Math.sin(a - 2.6) * r);
      g.closePath(); g.fill();
    };
    const lp = Math.max(2, L.s1 - 1), lpo = Math.max(2, L.s1 - 2);
    const fl = skyFlights().filter((f) => inSky(G, f.lon, f.lat));
    // BLR labels get first claim on space; quieter labels move or drop out rather than overlap
    const placed = [];
    const hit = (r) => placed.some((b) => r[0] < b[0] + b[2] && r[0] + r[2] > b[0] && r[1] < b[1] + b[3] && r[1] + r[3] > b[1]);
    const blrLabel = (f) => labelImg(now - f.seen > 5 * 60e3 ? f.fn + ' ' + hhmm(f.seen) : f.fn, lp, PAL.iss);
    for (const f of fl) {
      if (!isBlr(f)) continue;
      const [x, y] = skyXY(G, f.lon, f.lat), im = blrLabel(f);
      placed.push([x - u * 2.5, y - u * 2.5, u * 5, u * 5], [x + u * 2.5, y - im.height / 2, im.width, im.height]);
    }
    // other Singapore<->India flights: small, dim, no pulse; label = airline + Indian city
    for (const f of fl) {
      if (isBlr(f)) continue;
      const [x, y] = skyXY(G, f.lon, f.lat), old = now - f.seen > 5 * 60e3;
      g.globalAlpha = old ? 0.3 : 0.6;
      const sp = sprite(PAL.main, Math.max(2, Math.round(u * 0.7)), 'glow');
      g.globalCompositeOperation = 'lighter'; g.drawImage(sp, x - sp.width / 2, y - sp.height / 2); g.globalCompositeOperation = 'source-over';
      arrow(x, y, f.trk, u * 1.2, PAL.main);
      const im = labelImg(f.al + ' ' + f.city, lpo, PAL.dim);
      for (const [lx, ly] of [[x + u * 1.6, y - im.height / 2], [x - u * 1.6 - im.width, y - im.height / 2], [x - im.width / 2, y - u * 1.4 - im.height], [x - im.width / 2, y + u * 1.4]]) {
        const r = [lx, ly, im.width, im.height];
        if (hit(r)) continue;
        g.drawImage(im, Math.round(lx), Math.round(ly)); placed.push(r); break;
      }
      g.globalAlpha = 1;
    }
    // SIN<->BLR: bright, pulsing, flight number
    for (const f of fl) {
      if (!isBlr(f)) continue;
      const [x, y] = skyXY(G, f.lon, f.lat);
      const old = now - f.seen > 5 * 60e3; // out of receiver range: last real fix, dimmed
      if (!old) { g.strokeStyle = PAL.iss; g.lineWidth = Math.max(1, u * 0.4); g.globalAlpha = 1 - pulse; g.beginPath(); g.arc(x, y, u * (1.5 + pulse * 4), 0, Math.PI * 2); g.stroke(); }
      g.globalAlpha = old ? 0.45 : 1;
      const sp = sprite(PAL.iss, Math.max(3, Math.round(u * 1.3)), 'glow');
      g.globalCompositeOperation = 'lighter'; g.drawImage(sp, x - sp.width / 2, y - sp.height / 2); g.globalCompositeOperation = 'source-over';
      arrow(x, y, f.trk, u * 2.2, PAL.iss);
      const im = blrLabel(f);
      g.drawImage(im, Math.round(x + u * 2.5), Math.round(y - im.height / 2));
      g.globalAlpha = 1;
    }
    g.restore();
  }

  /* ---------- 3. FX ---------- */
  const FX_PAIRS = [
    { id: 'usdinr', name: 'USD/INR', f: (r) => r.inr, dp: 2 },
    { id: 'sgdinr', name: 'SGD/INR', f: (r) => r.inr / r.sgd, dp: 2 }
  ];
  function parseFxRule(str) {
    const m = /^\s*(>=|<=|>|<|=)?\s*([0-9]*\.?[0-9]+)\s*$/.exec(str || '');
    return m ? { op: m[1] && m[1] !== '=' ? m[1] : '>=', v: parseFloat(m[2]) } : null;
  }
  function fxHit(pr, val) {
    const r = parseFxRule(S.fxAlerts[pr.id]); if (!r) return null;
    const ok = r.op === '>=' ? val >= r.v : r.op === '<=' ? val <= r.v : r.op === '>' ? val > r.v : val < r.v;
    return ok ? r : null;
  }
  function fxAlertList() {
    const d = ST.fx.data; if (!d || !d.series.length) return [];
    const last = d.series[d.series.length - 1], out = [];
    for (const pr of FX_PAIRS) { const r = fxHit(pr, pr.f(last)); if (r) out.push(pr.name + ' ' + r.op + ' ' + r.v); }
    return out;
  }
  function drawFx(g, w, h, now) {
    const st = status('fx', now), d = ST.fx.data;
    const bottom = statusLine(g, w, h, d ? 'ECB REF RATE ' + d.date + ' · FRANKFURTER' : 'FRANKFURTER (ECB)', st);
    if (!d) { centerMsg(g, w, bottom, st.none && ST.fx.fails ? 'NO DATA' : 'LOADING', ST.fx.err); return; }
    const S2 = d.series;
    const pairs = FX_PAIRS;
    const blocks = splitBlocks(w, bottom, pairs.length);
    pairs.forEach((pr, i) => {
      const b = blocks[i];
      const vals = S2.map(pr.f);
      const last = vals[vals.length - 1], prev = vals.length > 1 ? vals[vals.length - 2] : null;
      const x = b.x + L.pad, bw = b.w - L.pad * 2;
      let y = b.y + L.pad;
      text(g, pr.name, x, y, L.s2, PAL.accent);
      const hit = fxHit(pr, last);
      if (hit) fitText(g, 'ALERT ' + hit.op + ' ' + hit.v, x + bw, y + th(L.s2) - th(L.s1), bw - tw(8, L.s2) - L.s1 * 2, L.s1, PAL.warn, 'right');
      y += th(L.s2) + L.s2 * 2;
      const rs = last.toFixed(pr.dp);
      const P = fitP(rs.length, bw, b.h * 0.3, L.s3 * 3);
      text(g, rs, x, y, P, hit ? PAL.accent : PAL.main, 'left', true);
      y += th(P) + L.s2 * 2;
      if (prev != null) {
        const dv = last - prev, pct = (dv / prev) * 100;
        const up = dv > 0, flat = dv === 0;
        const col = flat ? PAL.dim : up ? PAL.good : PAL.bad;
        const s = (flat ? '= ' : up ? '▲ +' : '▼ ') + dv.toFixed(pr.dp) + ' (' + (up ? '+' : '') + pct.toFixed(2) + '%)';
        const vs = 'VS ' + S2[S2.length - 2].d.slice(5);
        const room = norm(s).length + 1 + vs.length <= Math.floor((bw + L.s1) / (6 * L.s1));
        if (room) { text(g, s, x, y, L.s1, col); text(g, vs, x + bw, y, L.s1, PAL.dim, 'right'); }
        else fitText(g, s, x, y, bw, L.s1, col);
      }
      y += th(L.s1) + L.s1 * 3;
      // sparkline
      const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      const sh = Math.max(L.s1 * 6, Math.min(b.y + b.h - L.pad - y - th(L.s1) - L.s1 * 2, b.h * 0.28));
      const sp = sprite(PAL.main, Math.max(2, L.s1 - 1), 'glow'); const o = sp.width / 2;
      const pts = vals.map((v, k) => [x + (k / Math.max(1, vals.length - 1)) * bw, y + sh - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * sh]);
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < pts.length; k++) {
        const [px, py] = pts[k];
        g.drawImage(sp, px - o, py - o);
        if (k > 0) {
          const [qx, qy] = pts[k - 1];
          const n = Math.floor(Math.hypot(px - qx, py - qy) / (L.s1 * 1.6));
          g.globalAlpha = 0.5;
          for (let s = 1; s < n; s++) g.drawImage(sp, qx + ((px - qx) * s) / n - o, qy + ((py - qy) * s) / n - o);
          g.globalAlpha = 1;
        }
      }
      g.globalCompositeOperation = 'source-over';
      y += sh + L.s1 * 2;
      const days = Math.round((Date.parse(S2[S2.length - 1].d) - Date.parse(S2[0].d)) / 864e5);
      fitText(g, days + 'D LO ' + lo.toFixed(pr.dp) + ' HI ' + hi.toFixed(pr.dp), x, y, bw, L.s1, PAL.dim);
    });
    blockDividers(g, w, bottom, pairs.length);
  }

  /* ---------- 4. weather ---------- */
  const WMO = (c) => {
    if (c === 0) return ['CLEAR', 'sun'];
    if (c === 1) return ['MAINLY CLEAR', 'sun'];
    if (c === 2) return ['PARTLY CLOUDY', 'partly'];
    if (c === 3) return ['OVERCAST', 'cloud'];
    if (c === 45 || c === 48) return ['FOG', 'fog'];
    if (c >= 51 && c <= 57) return ['DRIZZLE', 'rain'];
    if (c === 61) return ['LIGHT RAIN', 'rain'];
    if (c === 63) return ['RAIN', 'rain'];
    if (c === 65) return ['HEAVY RAIN', 'rain'];
    if (c === 66 || c === 67) return ['FREEZING RAIN', 'rain'];
    if (c >= 71 && c <= 77) return ['SNOW', 'snow'];
    if (c === 80) return ['LIGHT SHOWERS', 'rain'];
    if (c === 81) return ['SHOWERS', 'rain'];
    if (c === 82) return ['HEAVY SHOWERS', 'rain'];
    if (c === 85 || c === 86) return ['SNOW SHOWERS', 'snow'];
    if (c === 95) return ['THUNDERSTORM', 'storm'];
    if (c === 96 || c === 99) return ['STORM + HAIL', 'storm'];
    return ['CODE ' + c, 'cloud'];
  };
  const deg = (v) => (v == null ? '--' : Math.round(v) + '°');
  const pct = (v) => (v == null ? '--' : v + '%');
  const AQI_CAT = (a) => (a <= 50 ? 'GOOD' : a <= 100 ? 'MODERATE' : a <= 150 ? 'SENSITIVE' : a <= 200 ? 'UNHEALTHY' : a <= 300 ? 'V.UNHEALTHY' : 'HAZARDOUS');
  /* Open-Meteo minutely_15 'precipitation' is the sum over the 15 min ENDING at the slot time,
     in the location's local time; convert with its utc_offset_seconds. */
  function rainSoon(now) {
    const d = ST.wx.data; if (!d || isStale('wx', now)) return [];
    const out = [];
    d.forEach((loc, i) => {
      const m = loc.m15; if (!m || !m.t) return;
      for (let k = 0; k < m.t.length; k++) {
        const end = Date.parse(m.t[k] + ':00Z') - (loc.off || 0) * 1000, startT = end - 15 * 60e3;
        if (end <= now) continue;
        if (startT - now > 90 * 60e3) break;
        if ((m.p[k] || 0) >= 0.1) {
          const mins = Math.round((startT - now) / 60e3);
          out.push({ loc: i, short: mins <= 0 ? 'NOW' : '~' + Math.max(5, Math.round(mins / 5) * 5) + 'M', code: i === 0 ? 'SG' : 'BLR' });
          break;
        }
      }
    });
    return out;
  }
  /* Weather, built to be read from across the room: big icon + temperature, the condition,
     then icon "chips" (rain chance, high/low, sunrise/sunset, AQI) and the next 6 hours as icons. */
  function drawWeather(g, w, h, now) {
    const st = status('wx', now), d = ST.wx.data;
    const bottom = statusLine(g, w, h, 'OPEN-METEO.COM · CC BY 4.0', st);
    if (!d) { centerMsg(g, w, bottom, ST.wx.fails ? 'NO DATA' : 'LOADING', ST.wx.err); return; }
    const aq = ST.aq.data, soon = rainSoon(now);
    const blocks = splitBlocks(w, bottom, 2);
    const portrait = L.portrait;
    const pc = portrait ? L.s2 : L.s1 + 1;   // chip text pitch
    d.forEach((loc, i) => {
      const b = blocks[i];
      const x = b.x + L.pad, bw = b.w - L.pad * 2;
      const a = aq && aq[i];
      // chips, in groups that stay together on one line
      const C = (t, col, ic) => ({ t, col, ic });
      const groups = [
        [C(pct(loc.rainDay), (loc.rainDay || 0) >= 50 ? PAL.warn : PAL.main, 'drop')],
        [C('▲' + deg(loc.tmax), PAL.main), C('▼' + deg(loc.tmin), PAL.main)]
      ];
      if (loc.sunrise) groups.push([C(loc.sunrise, PAL.main, 'sunup')], [C(loc.sunset, PAL.main, 'sundown')]);
      if (a && a.aqi != null) groups.push([C('AQI ' + a.aqi, a.aqi > 150 ? PAL.bad : a.aqi > 100 ? PAL.warn : PAL.main)]);
      const icCols = (c) => (c.ic ? ICONS[c.ic].split(' ')[0].length : 0);
      const chipW = (c) => (c.ic ? icCols(c) * pc + pc * 1.5 : 0) + tw(norm(c.t).length, pc);
      const inGap = pc * 6, gapX = pc * 6 * 2;
      const groupW = (gr) => gr.reduce((acc, c, k) => acc + chipW(c) + (k ? inGap : 0), 0);
      const chipAreaW = portrait ? bw : Math.round(bw * 0.4);
      const rows = [];
      for (const gr of groups) {
        const last = rows[rows.length - 1];
        if (portrait && last && last.w + gapX + groupW(gr) <= chipAreaW) { last.items.push(...gr); last.w += gapX + groupW(gr); last.breaks.push(last.items.length - gr.length); }
        else rows.push({ items: gr.slice(), w: groupW(gr), breaks: [0] });
      }
      const rowH = LH * pc + pc;
      const drawRow = (row, rx, ry) => {
        let cx = rx;
        row.items.forEach((c, k) => {
          if (k > 0) cx += row.breaks.includes(k) ? gapX : inGap;
          if (c.ic) {
            const ip = c.ic === 'drop' ? pc : Math.max(2, Math.round((pc * 7) / 8));
            icon(g, c.ic, cx, ry + (th(pc) - (c.ic === 'drop' ? 7 : 8) * ip) / 2, ip, c.col, PAL.dim);
            cx += icCols(c) * ip + pc * 1.5;
          }
          cx += text(g, c.t, cx, ry, pc, c.col);
        });
      };
      // next 6 hours as icons
      const hours = (loc.hours || []).slice(0, 6);
      const hcw = bw / Math.max(1, hours.length);
      const hp = Math.max(2, Math.min(L.s1 + 1, Math.floor((hcw * 0.6) / 9)));
      const stripH = hours.length ? L.pad * 0.6 + th(L.s1) + L.s1 * 2 + 9 * hp : 0;
      const [cond, ic] = WMO(loc.code);
      const iconName = (ic === 'sun' && loc.isDay === 0) ? 'moon' : ic;
      const rs = soon.find((r) => r.loc === i);
      const feels = 'FEELS ' + deg(loc.feels), ts = deg(loc.temp);
      const nameH = th(L.s2) + L.pad * 0.8;
      // hero = weather icon + big temperature with feels-like underneath
      const drawHero = (hx, hy, hw, hh) => {
        const Pi = Math.max(3, Math.floor(Math.min(hw * 0.36, hh) / 9));
        const tx = hx + 9 * Pi + L.pad * 1.5, tW = hw - 9 * Pi - L.pad * 1.5;
        const fp = Math.max(L.s1, Math.min(L.s2, Math.floor((tW + L.s2) / (6 * feels.length))));
        const Pt = fitP(ts.length, tW, hh - th(fp) - fp * 3, L.s3 * 4);
        const heroH = th(Pt) + fp * 3 + th(fp);
        icon(g, iconName, hx, hy + Math.max(0, (hh - 9 * Pi) / 2), Pi, PAL.main, PAL.dim);
        const ty = hy + Math.max(0, (hh - heroH) / 2);
        text(g, ts, tx, ty, Pt, PAL.main, 'left', true);
        text(g, feels, tx, ty + th(Pt) + fp * 3, fp, PAL.dim);
      };
      let y;
      if (portrait) {
        const condP = Math.max(L.s1, Math.min(L.s3, Math.floor((bw + L.s3) / (6 * Math.max(1, cond.length)))));
        const fixedH = nameH + L.pad * 0.6 + th(condP) + L.pad * 0.8 + rows.length * rowH + stripH;
        const heroH = Math.max(L.s2 * 9, Math.min(bw * 0.42, b.h - L.pad * 2 - fixedH));
        y = b.y + Math.max(L.pad, Math.round((b.h - fixedH - heroH) / 2));
        text(g, loc.name, x, y, L.s2, PAL.accent);
        if (rs) text(g, 'RAIN ' + rs.short, x + bw, y, L.s2, PAL.warn, 'right');
        y += nameH;
        drawHero(x, y, bw, heroH); y += heroH + L.pad * 0.6;
        text(g, cond, x, y, condP, PAL.main); y += th(condP) + L.pad * 0.8;
        for (const row of rows) { drawRow(row, x, y); y += rowH; }
      } else {
        // landscape: condition shares the name line; chips stack in a column beside the hero
        const chipsH = rows.length * rowH;
        const heroH = Math.max(chipsH, Math.min(bw * 0.3, b.h - L.pad * 2 - nameH - stripH));
        y = b.y + Math.max(L.pad, Math.round((b.h - nameH - heroH - stripH) / 2));
        text(g, loc.name, x, y, L.s2, PAL.accent);
        const nameW = tw(loc.name.length, L.s2) + L.s2 * 6;
        fitText(g, rs ? cond + ' · RAIN ' + rs.short : cond, x + bw, y, bw - nameW, L.s2, rs ? PAL.warn : PAL.main, 'right');
        y += nameH;
        drawHero(x, y, bw - chipAreaW - L.pad, heroH);
        let cy = y + Math.max(0, (heroH - chipsH) / 2);
        for (const row of rows) { drawRow(row, x + bw - chipAreaW, cy); cy += rowH; }
        y += heroH;
      }
      if (hours.length) {
        y += L.pad * 0.6;
        dotLine(g, x, y - L.s1, bw, Math.max(1, L.s1 - 1), PAL.dim);
        y += L.s1;
        hours.forEach((hr, k) => {
          const cx = x + hcw * k + hcw / 2;
          text(g, hr.h, cx, y, L.s1, PAL.dim, 'center');
          const [, hic] = WMO(hr.code == null ? loc.code : hr.code);
          const hn = (hic === 'sun' && hr.isDay === 0) ? 'moon' : hic;
          icon(g, hn, Math.round(cx - 4.5 * hp), y + th(L.s1) + L.s1 * 2, hp, PAL.main, PAL.dim);
        });
      }
    });
    blockDividers(g, w, bottom, 2);
  }

  /* ---------- bus radar (stops 16081 + 16089, Pasir Panjang Rd) ---------- */
  const BUS_C = { lat: (BUS_STOPS[0].lat + BUS_STOPS[1].lat) / 2, lng: (BUS_STOPS[0].lng + BUS_STOPS[1].lng) / 2 };
  // Roads + routes baked by tools/build-minimap.mjs; loaded after the first frame so it never delays startup.
  let MM = null;
  function loadMinimap() {
    if (MM || document.getElementById('mmData')) return;
    const sc = document.createElement('script');
    sc.id = 'mmData'; sc.src = 'minimap.js'; sc.async = true;
    sc.onload = () => { MM = window.MC_MINIMAP || null; mmImg = null; forceDraw = true; };
    document.head.appendChild(sc);
  }
  const MM_RANGE = 1500; // metres from the stops to the nearer map edge
  function busGeom(w, h) {
    const pad = L.pad, statusH = 2 * LH * L.s1 + pad * 2;
    if (L.portrait) {
      const mh = Math.round((h - statusH) * 0.58);
      return { mx: pad, my: Math.round(pad / 2), mw: w - pad * 2, mh, lx: pad, ly: Math.round(pad / 2) + mh + pad, lw: w - pad * 2, lb: h - statusH };
    }
    const mw = Math.round((w - pad * 3) * 0.55);
    return { mx: pad, my: Math.round(pad / 2), mw, mh: h - statusH, lx: pad * 2 + mw, ly: pad, lw: w - mw - pad * 3, lb: h - statusH };
  }
  const mmK = (G) => MM_RANGE / (Math.min(G.mw, G.mh) / 2); // metres per pixel
  const mmXY = (G, x, y) => { const k = mmK(G); return [G.mx + G.mw / 2 + x / k, G.my + G.mh / 2 - y / k]; };
  const llToM = (lat, lng) => [(lng - BUS_C.lng) * 111320 * Math.cos(BUS_C.lat * RAD), (lat - BUS_C.lat) * 110574];
  let mmImg = null;
  function getMinimap(G) {
    const key = [G.mw, G.mh, S.palette].join('|');
    if (mmImg && mmImg.key === key) return mmImg.c;
    const c = mkCanvas(G.mw, G.mh), g = c.getContext('2d');
    const k = mmK(G), ox = G.mw / 2, oy = G.mh / 2, u = Math.max(2, L.s1);
    const dots = (pts, spacing, r, path) => { // dotted polyline into a Path2D
      let carry = 0;
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const x0 = ox + pts[i] / k, y0 = oy - pts[i + 1] / k, x1 = ox + pts[i + 2] / k, y1 = oy - pts[i + 3] / k;
        const len = Math.hypot(x1 - x0, y1 - y0);
        let d = carry;
        for (; d <= len; d += spacing) { const t = len ? d / len : 0, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; path.moveTo(x + r, y); path.arc(x, y, r, 0, Math.PI * 2); }
        carry = d - len;
      }
    };
    if (MM) {
      const layer = (fill, alpha, build) => { const pth = new Path2D(); build(pth); g.fillStyle = fill; g.globalAlpha = alpha; g.fill(pth); };
      layer(PAL.dim, 0.7, (pth) => { for (const r of MM.coast) dots(r, u * 1.4, u * 0.2, pth); });
      const cls = [[u * 0.9, u * 0.4, 0.8], [u * 1.0, u * 0.34, 0.65], [u * 1.3, u * 0.25, 0.38], [u * 1.7, u * 0.18, 0.2]];
      for (let ci = 3; ci >= 0; ci--) layer(PAL.main, cls[ci][2], (pth) => { for (const r of MM.roads) if (r[0] === ci) dots(r.slice(1), cls[ci][0], cls[ci][1], pth); });
      layer(PAL.accent, 0.45, (pth) => { for (const sv in MM.routes) for (const r of MM.routes[sv]) dots(r, u * 0.75, u * 0.22, pth); });
      g.globalAlpha = 1;
      // road labels: nearest candidate that fits and doesn't overlap
      const lp = Math.max(2, L.s1 - 1), placed = [[ox - u * 10, oy - u * 6, u * 20, u * 12]];
      const hit = (a) => placed.some((b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]);
      for (const lab of MM.labels) {
        const lw = tw(lab.t.length, lp) + lp * 2, lh = th(lp) + lp * 2;
        for (const [x, y] of lab.p) {
          const r = [ox + x / k - lw / 2, oy - y / k - lh / 2, lw, lh];
          if (r[0] < u * 2 || r[1] < u * 2 || r[0] + lw > G.mw - u * 2 || r[1] + lh > G.mh - u * 2 || hit(r)) continue;
          g.fillStyle = '#000'; g.globalAlpha = 0.8; g.fillRect(r[0], r[1], lw, lh); g.globalAlpha = 1;
          text(g, lab.t, r[0] + lp, r[1] + lp, lp, PAL.dim);
          placed.push(r); break;
        }
      }
    } else text(g, 'LOADING MAP', ox, oy, u, PAL.dim, 'center');
    // frame, north, scale bar
    g.strokeStyle = PAL.dim; g.globalAlpha = 0.6; g.lineWidth = 1; g.setLineDash([u, u * 1.5]);
    g.strokeRect(0.5, 0.5, G.mw - 1, G.mh - 1); g.setLineDash([]); g.globalAlpha = 1;
    const lp = Math.max(2, L.s1 - 1);
    text(g, 'N', u * 2, u * 2, lp, PAL.dim);
    const bar = 500 / k;
    g.fillStyle = PAL.dim; g.fillRect(u * 2, G.mh - u * 2.5, bar, Math.max(1, u * 0.35));
    text(g, '500M', u * 2 + bar + lp * 2, G.mh - u * 2.5 - th(lp) / 2, lp, PAL.dim);
    mmImg = { key, c };
    return c;
  }
  const busMin = (t, now) => { const ms = t - now; return ms <= 60e3 ? 'ARR' : Math.floor(ms / 60e3) + 'M'; };
  const loadCol = (l) => (l === 'SEA' ? PAL.good : l === 'SDA' ? PAL.warn : l === 'LSD' ? PAL.bad : PAL.main);
  const labelCache = new Map();
  function labelImg(str, p, color) {
    const key = str + '|' + p + '|' + color;
    let c = labelCache.get(key);
    if (!c) {
      if (labelCache.size > 300) labelCache.clear();
      c = mkCanvas(tw(norm(str).length, p) + p * 4, th(p) + p * 4);
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(p, p, c.width - p * 2, c.height - p * 2);
      text(g, str, p * 2, p * 2, p, color);
      labelCache.set(key, c);
    }
    return c;
  }
  function drawBus(g, w, h, now) {
    const st = status('bus', now), d = ST.bus.data;
    statusLine(g, w, h, 'BUS: ARRIVELAH / LTA · MAP © OPENSTREETMAP', st);
    const G = busGeom(w, h), u = Math.max(2, L.s1);
    g.drawImage(getMinimap(G), G.mx, G.my);
    const [sx, sy] = mmXY(G, 0, 0);
    g.strokeStyle = PAL.home; g.lineWidth = Math.max(1, u * 0.5);
    g.strokeRect(sx - u * 1.8, sy - u * 1.8, u * 3.6, u * 3.6);
    g.fillStyle = PAL.home; g.fillRect(sx - u * 0.5, sy - u * 0.5, u, u);
    if (!d) {
      text(g, ST.bus.fails ? 'NO DATA' : 'LOADING', G.lx, G.ly, L.s2, PAL.main);
      if (ST.bus.err) fitText(g, ST.bus.err, G.lx, G.ly + LH * L.s2, G.lw, L.s1, PAL.dim);
      return;
    }
    // arrival lists: one column per stop; larger text when it fits
    const colW = G.lw / 2;
    const noLen = Math.max(3, ...d.map((st2) => Math.max(0, ...st2.services.map((sv) => sv.no.length))));
    const need = noLen + 1 + 4 + 3;
    const p = tw(need, L.s1 + 1) <= colW - L.pad / 2 ? L.s1 + 1 : L.s1, lh = LH * p, lp = Math.max(2, L.s1 - 1);
    d.forEach((stop, i) => {
      const x = G.lx + colW * i, info = BUS_STOPS[i];
      const cols = Math.floor((colW - L.pad / 2 + p) / (6 * p));
      let y = G.ly;
      fitText(g, (i === 0 ? '● ' : '○ ') + info.name, x, y, colW - L.pad / 2, p, PAL.accent); y += lh;
      text(g, info.code + '  NEXT THEN', x, y, lp, PAL.dim); y += LH * lp * 1.4;
      const rows = stop.services.map((sv) => ({ no: sv.no, b: sv.buses.filter((bb) => bb.t > now - 30e3) }))
        .filter((r) => r.b.length).sort((a, b) => a.b[0].t - b.b[0].t);
      for (const r of rows) {
        if (y + th(p) > G.lb) break;
        text(g, r.no, x, y, p, PAL.main);
        text(g, busMin(r.b[0].t, now), x + (noLen + 1) * 6 * p, y, p, loadCol(r.b[0].load));
        if (r.b[1]) text(g, busMin(r.b[1].t, now), x + (noLen + 5) * 6 * p, y, p, PAL.dim);
        y += lh;
      }
      if (!rows.length) text(g, 'NO BUSES', x, y, p, PAL.dim);
    });
  }
  function dynBus(g, w, h, now, ts) {
    const G = busGeom(w, h), d = ST.bus.data;
    if (!d) return;
    const u = Math.max(2, L.s1), lp = Math.max(2, L.s1 - 1), inset = u * 3;
    const cx = G.mx + G.mw / 2, cy = G.my + G.mh / 2;
    const tags = [];
    g.save(); g.beginPath(); g.rect(G.mx, G.my, G.mw, G.mh); g.clip();
    d.forEach((stop, i) => {
      const col = i === 0 ? PAL.main : PAL.accent;
      for (const sv of stop.services) {
        sv.buses.forEach((bb, k) => {
          if (k > 1 || !bb.lat || !bb.lng || bb.t < now - 30e3) return;
          let [x, y] = mmXY(G, ...llToM(bb.lat, bb.lng));
          let edge = false;
          if (x < G.mx + inset || x > G.mx + G.mw - inset || y < G.my + inset || y > G.my + G.mh - inset) {
            const dx = x - cx, dy = y - cy;
            const sc = Math.min((G.mw / 2 - inset) / Math.max(1e-6, Math.abs(dx)), (G.mh / 2 - inset) / Math.max(1e-6, Math.abs(dy)));
            x = cx + dx * sc; y = cy + dy * sc; edge = true;
          }
          const soon = bb.t - now <= 2 * 60e3, period = soon ? 700 : 1400;
          const ph = ((ts + i * 300 + k * 500) % period) / period;
          if (edge) { // arrow on the map edge pointing towards the bus
            const a = Math.atan2(y - cy, x - cx), r = u * (k ? 1.1 : 1.6);
            g.fillStyle = col; g.globalAlpha = k ? 0.45 : 0.9;
            g.beginPath(); g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            g.lineTo(x + Math.cos(a + 2.5) * r, y + Math.sin(a + 2.5) * r); g.lineTo(x + Math.cos(a - 2.5) * r, y + Math.sin(a - 2.5) * r);
            g.closePath(); g.fill();
          } else {
            g.strokeStyle = col; g.lineWidth = Math.max(1, u * 0.4);
            g.globalAlpha = (1 - ph) * (k ? 0.5 : 1);
            g.beginPath(); g.arc(x, y, u * (1 + ph * 2.4), 0, Math.PI * 2); g.stroke();
            g.globalAlpha = k ? 0.55 : 1;
            const sp = sprite(col, Math.round(u * (k ? 0.9 : 1.3)), 'glow');
            g.globalCompositeOperation = 'lighter'; g.drawImage(sp, x - sp.width / 2, y - sp.height / 2); g.globalCompositeOperation = 'source-over';
          }
          g.globalAlpha = 1;
          if (k === 0) tags.push({ x, y, edge, t: bb.t, im: labelImg(sv.no, lp, col) });
        });
      }
    });
    const placed = [[cx - u * 2, cy - u * 2, u * 4, u * 4]];
    const hit = (a) => placed.some((b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]);
    tags.sort((a, b) => a.t - b.t);
    for (const tg of tags) {
      const W2 = tg.im.width, H2 = tg.im.height;
      const ly = Math.min(G.my + G.mh - H2, Math.max(G.my, tg.y - H2 / 2));
      const cands = [[tg.x + u * 2 - lp, ly], [tg.x - u * 2 - W2 + lp, ly], [tg.x - W2 / 2, ly - H2], [tg.x - W2 / 2, ly + H2]];
      for (const [lx, yy] of cands) {
        const r = [lx, yy, W2, H2];
        if (lx < G.mx || yy < G.my || lx + W2 > G.mx + G.mw || yy + H2 > G.my + G.mh || hit(r)) continue;
        g.drawImage(tg.im, Math.round(lx), Math.round(yy)); placed.push(r); break;
      }
    }
    g.restore();
  }

  /* ---------- 5. headlines ---------- */
  let newsScroll = 0;
  const newsCache = new Map(); // idx -> canvas
  let newsLayout = null; // {key, items:[{y,h,lines,time}], total}
  function newsGeom(w, h) {
    const p = L.s1;
    const top = L.pad + th(L.s2) + L.pad;
    const bottom = h - L.pad - th(L.s1) - L.pad;
    return { p, top, bottom, x: L.pad, w: w - L.pad * 2 };
  }
  function getNewsLayout(w, h) {
    const d = ST.news.data; if (!d) return null;
    const key = ST.news.ts + '|' + w + '|' + h;
    if (newsLayout && newsLayout.key === key) return newsLayout;
    const G = newsGeom(w, h), p = G.p;
    const maxC = Math.floor(G.w / (6 * p)) - 6;
    let y = 0; const items = [];
    for (const it of d.items) {
      const lines = wrap(it.title, maxC, 4);
      const ih = lines.length * LH * p + p * 6;
      items.push({ y, h: ih, lines, time: it.t ? hhmm(it.t) : '--:--' });
      y += ih;
    }
    newsCache.clear();
    newsLayout = { key, items, total: y };
    return newsLayout;
  }
  function newsItemCanvas(i, it, G) {
    let c = newsCache.get(i);
    if (c) return c;
    if (newsCache.size > 24) newsCache.delete(newsCache.keys().next().value);
    const p = G.p;
    c = mkCanvas(G.w, it.h);
    const g = c.getContext('2d');
    text(g, it.time, 0, 0, p, PAL.dim);
    it.lines.forEach((ln, k) => text(g, ln, 6 * 6 * p, k * LH * p, p, PAL.main));
    dotLine(g, 6 * 6 * p, it.h - p * 3, Math.min(G.w - 36 * p, 24 * p), Math.max(1, p - 1), PAL.dim);
    newsCache.set(i, c);
    return c;
  }
  function drawNews(g, w, h, now) {
    const st = status('news', now);
    const ready = feedReady();
    const d = ST.news.data;
    const src = feedLabel(S.rssUrl, d && d.title);
    text(g, ready ? clip(src, Math.floor((w - L.pad * 2) / (6 * L.s2))) : 'RSS FEED', L.pad, L.pad, L.s2, PAL.accent);
    if (!ready) {
      statusLine(g, w, h, 'RSS', { text: 'NO FEED', color: PAL.warn });
      centerMsg(g, w, h, 'NO FEED', 'SET A FEED URL IN SETTINGS (LONG-PRESS)');
      return;
    }
    statusLine(g, w, h, 'RSS · ' + feedMode(), st);
    if (!d) {
      const blocked = ST.news.err === 'NETWORK/CORS' && !S.rssProxy;
      centerMsg(g, w, h, ST.news.fails ? 'NO DATA' : 'LOADING', blocked ? 'THIS FEED BLOCKS BROWSER READS: SET A CORS PROXY IN SETTINGS' : ST.news.err);
    }
  }
  function dynNews(g, w, h, now, ts, dt) {
    if (!feedReady() || !ST.news.data) return;
    const lay = getNewsLayout(w, h); if (!lay || !lay.total) return;
    const G = newsGeom(w, h);
    newsScroll += dt * L.s1 * 7;
    const viewH = G.bottom - G.top;
    const total = lay.total;
    const off = ((newsScroll % total) + total) % total;
    g.save(); g.beginPath(); g.rect(0, G.top, w, viewH); g.clip();
    for (let rep = 0; rep < 2; rep++) {
      const base = rep * total - off;
      if (base > viewH) break;
      lay.items.forEach((it, i) => {
        const y = G.top + base + it.y;
        if (y + it.h < G.top || y > G.bottom) return;
        g.drawImage(newsItemCanvas(i, it, G), G.x, Math.round(y));
      });
    }
    // fade edges
    const f = L.pad * 1.5;
    let gr = g.createLinearGradient(0, G.top, 0, G.top + f);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, G.top, w, f);
    gr = g.createLinearGradient(0, G.bottom - f, 0, G.bottom);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, G.bottom - f, w, f);
    g.restore();
  }

  /* ---------- 6. new releases (iTunes catalogue) ---------- */
  /* Cover art: Apple artwork (CORS-enabled) dithered onto the dot grid (Floyd-Steinberg),
     16x16 for the list and 32x32 for the deck; cached in localStorage so it survives offline. */
  const ART_KEY = 'mc.art.v1';
  const artStore = LS.get(ART_KEY, {});
  const artMem = new Map(), artPending = new Set();
  let artVer = 0;
  const packBits = (a) => {
    const b = new Uint8Array(Math.ceil(a.length / 8)); let out = '';
    for (let i = 0; i < a.length; i++) if (a[i]) b[i >> 3] |= 1 << (i & 7);
    for (const x of b) out += String.fromCharCode(x);
    return btoa(out);
  };
  const unpackBits = (str, n) => {
    const raw = atob(str), a = new Uint8Array(n * n);
    for (let i = 0; i < a.length; i++) a[i] = (raw.charCodeAt(i >> 3) >> (i & 7)) & 1;
    return a;
  };
  function ditherImg(img, n) {
    const c = mkCanvas(n, n), g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, n, n);
    const px = g.getImageData(0, 0, n, n).data, v = new Float32Array(n * n);
    let lo = 1, hi = 0;
    for (let i = 0; i < n * n; i++) {
      const l = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
      v[i] = l; if (l < lo) lo = l; if (l > hi) hi = l;
    }
    const span = Math.max(0.2, hi - lo); // stretch contrast so dark covers still read,
    let mean = 0;                        // then darken mid-tones: light-on-black wants sparse dots
    for (let i = 0; i < v.length; i++) { v[i] = (v[i] - lo) / span; mean += v[i]; }
    mean /= v.length;
    const gam = Math.max(1.2, Math.min(2.0, 1 + mean * 1.6));
    for (let i = 0; i < v.length; i++) v[i] = Math.pow(v[i], gam);
    const out = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x, o = v[i], nv = o >= 0.5 ? 1 : 0, e = o - nv;
        out[i] = nv;
        if (x + 1 < n) v[i + 1] += (e * 7) / 16;
        if (y + 1 < n) { if (x > 0) v[i + n - 1] += (e * 3) / 16; v[i + n] += (e * 5) / 16; if (x + 1 < n) v[i + n + 1] += e / 16; }
      }
    }
    return out;
  }
  function coverArt(it, n) { // dot bitmap, or null while it loads
    if (!it || !it.id) return null;
    let rec = artMem.get(it.id);
    if (!rec && artStore[it.id]) {
      try { rec = { 16: unpackBits(artStore[it.id][0], 16), 32: unpackBits(artStore[it.id][1], 32) }; artMem.set(it.id, rec); } catch (e) { rec = null; }
    }
    if (rec) return rec[n];
    if (it.art && !artPending.has(it.id) && navigator.onLine !== false) {
      artPending.add(it.id);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const r2 = { 16: ditherImg(img, 16), 32: ditherImg(img, 32) };
          artMem.set(it.id, r2);
          artStore[it.id] = [packBits(r2[16]), packBits(r2[32])];
          const keys = Object.keys(artStore);
          if (keys.length > 40) for (const k of keys.slice(0, keys.length - 40)) delete artStore[k];
          LS.set(ART_KEY, artStore);
          artVer++; forceDraw = true;
        } catch (e) { /* undecodable: keep the empty grid */ }
        artPending.delete(it.id);
      };
      img.onerror = () => setTimeout(() => artPending.delete(it.id), 300e3);
      img.src = it.art.replace(/\/\d+x\d+bb\./, '/200x200bb.');
    }
    return null;
  }
  /* Unlit cells are faint ghost dots, exactly like an unlit VFD matrix. */
  function drawArt(g, bits, n, x, y, p, color) {
    const gs = sprite(color, p, 'ghost'), go = gs.width / 2 - p / 2;
    for (let i = 0; i < n * n; i++) if (!bits || !bits[i]) g.drawImage(gs, x + (i % n) * p - go, y + ((i / n) | 0) * p - go);
    if (!bits) return;
    const sp = sprite(color, p, 'glow'), o = sp.width / 2 - p / 2;
    const prev = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n * n; i++) if (bits[i]) g.drawImage(sp, x + (i % n) * p - o, y + ((i / n) | 0) * p - o);
    g.globalCompositeOperation = prev;
  }
  const timgCache = new Map();
  function textImg(str, p, color, ghost) { // cached text bitmap for things redrawn every frame
    const key = str + '|' + p + '|' + color + '|' + !!ghost;
    let c = timgCache.get(key);
    if (!c) {
      if (timgCache.size > 160) timgCache.clear();
      c = mkCanvas(tw(norm(str).length, p) + p * 4, th(p) + p * 4);
      text(c.getContext('2d'), str, p * 2, p * 2, p, color, 'left', ghost);
      timgCache.set(key, c);
    }
    return c;
  }
  const mmss = (sec) => pad2(Math.floor(sec / 60)) + ':' + pad2(Math.floor(sec % 60));

  /* ---------- preview deck: 30 s Apple preview + live spectrum analyser ---------- */
  const player = { state: 'idle', idx: -1, item: null, audio: null, ctx: null, an: null, bins: null, err: '', started: 0 };
  const previewCache = new Map();
  const NB = 16, bandLv = new Float32Array(NB), peakLv = new Float32Array(NB), peakT = new Float64Array(NB);
  let lastDecay = 0;
  async function previewUrlFor(it) {
    if (previewCache.has(it.id)) return previewCache.get(it.id);
    const j = await fetchWithTimeout('https://itunes.apple.com/lookup?entity=song&limit=50&country=in&id=' + it.id, 12e3);
    const tr = ((j && j.results) || []).filter((r) => r.wrapperType === 'track' && r.previewUrl)
      .sort((a, b) => (a.discNumber || 1) - (b.discNumber || 1) || (a.trackNumber || 0) - (b.trackNumber || 0))[0];
    if (!tr) throw new Error('NO PREVIEW');
    previewCache.set(it.id, tr.previewUrl);
    return tr.previewUrl;
  }
  function ensureAudio() {
    if (!player.audio) {
      const a = new Audio();
      a.crossOrigin = 'anonymous'; // previews send CORS headers, so the analyser can read them
      a.preload = 'auto';
      a.addEventListener('ended', () => stopPreview());
      a.addEventListener('error', () => {
        if (player.state === 'loading' || player.state === 'playing') { player.state = 'error'; player.err = 'CANNOT PLAY'; forceDraw = true; setTimeout(() => { if (player.state === 'error') stopPreview(); }, 6000); }
      });
      player.audio = a;
    }
    if (!player.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        player.ctx = new AC();
        const src = player.ctx.createMediaElementSource(player.audio);
        player.an = player.ctx.createAnalyser();
        player.an.fftSize = 2048; player.an.smoothingTimeConstant = 0.55;
        player.an.minDecibels = -90; player.an.maxDecibels = -22;
        src.connect(player.an); player.an.connect(player.ctx.destination);
        player.bins = new Uint8Array(player.an.frequencyBinCount);
      }
    }
  }
  function stopAudio() {
    const a = player.audio; if (!a) return;
    try { a.pause(); } catch (e) { /* ignore */ }
    a.removeAttribute('src');
    try { a.load(); } catch (e) { /* ignore */ }
  }
  function stopPreview() {
    if (player.state === 'idle') return;
    stopAudio();
    Object.assign(player, { state: 'idle', item: null, idx: -1, err: '' });
    bandLv.fill(0); peakLv.fill(0);
    holdUntil = Date.now() + 8000; dwellAcc = 0; forceDraw = true; // linger on the list briefly
  }
  async function playRelease(idx) {
    const d = ST.rel.data, it = d && d.items[idx];
    if (!it) return;
    const pi = pages.indexOf('releases');
    if (pi < 0) return;
    if (pages[trans ? trans.to : cur] !== 'releases') goTo(pi);
    stopAudio();
    Object.assign(player, { state: 'loading', idx, item: it, err: '', started: performance.now() });
    bandLv.fill(0); peakLv.fill(0);
    holdUntil = Number.MAX_SAFE_INTEGER; forceDraw = true;
    try {
      const url = await previewUrlFor(it);
      if (player.item !== it) return;
      ensureAudio();
      if (player.ctx && player.ctx.state === 'suspended') { try { await player.ctx.resume(); } catch (e) { /* needs a tap */ } }
      if (player.ctx && player.ctx.state !== 'running') { const e = new Error('tap'); e.name = 'NotAllowedError'; throw e; }
      player.audio.src = url;
      await player.audio.play();
      if (player.item !== it) return;
      player.state = 'playing'; player.started = performance.now(); forceDraw = true;
    } catch (e) {
      if (player.item !== it) return;
      if (e && e.name === 'NotAllowedError') player.state = 'armed'; // browser wants a tap first
      else {
        player.state = 'error'; player.err = shortErr(e);
        setTimeout(() => { if (player.item === it && player.state === 'error') stopPreview(); }, 6000);
      }
      forceDraw = true;
    }
  }
  function readSpectrum(ts, seg) {
    if (player.state === 'playing' && player.an) {
      player.an.getByteFrequencyData(player.bins);
      const ny = player.ctx.sampleRate / 2, nb = player.bins.length;
      for (let b = 0; b < NB; b++) { // log-spaced bands, 40 Hz - 16 kHz
        const f0 = 40 * Math.pow(400, b / NB), f1 = 40 * Math.pow(400, (b + 1) / NB);
        const i0 = Math.min(nb - 1, Math.floor((f0 / ny) * nb)), i1 = Math.max(i0 + 1, Math.ceil((f1 / ny) * nb));
        let m = 0;
        for (let i = i0; i < i1 && i < nb; i++) if (player.bins[i] > m) m = player.bins[i];
        bandLv[b] = Math.round((m / 255) * seg);
        if (bandLv[b] >= peakLv[b]) { peakLv[b] = bandLv[b]; peakT[b] = ts; }
      }
    } else bandLv.fill(0);
    if (ts - lastDecay > 70) { // peak-hold markers fall one segment at a time
      lastDecay = ts;
      for (let b = 0; b < NB; b++) if (ts - peakT[b] > 450 && peakLv[b] > bandLv[b]) peakLv[b]--;
    }
  }
  const segCache = new Map();
  function segImg(wd, ht, color, lit) {
    const key = wd + '|' + ht + '|' + color + '|' + lit;
    let c = segCache.get(key);
    if (!c) {
      const m = lit ? Math.ceil(ht * 0.9) : 0, [r, g0, b] = rgb(color);
      c = mkCanvas(wd + m * 2, ht + m * 2);
      const g = c.getContext('2d');
      if (lit) { g.shadowColor = color; g.shadowBlur = ht * 0.9; g.fillStyle = color; }
      else g.fillStyle = `rgba(${r},${g0},${b},0.08)`;
      g.fillRect(m, m, wd, ht);
      if (lit) { g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(m, m, wd, Math.max(1, ht * 0.35)); }
      segCache.set(key, c);
    }
    return c;
  }
  function deckGeom(w, h) {
    const pad = L.pad, p1 = L.s1, bottom = h - (LH * p1 * 2 + pad);
    const G = { p1, bottom, pn: 30 };
    if (L.portrait) {
      G.ap = Math.max(3, Math.floor(Math.min((w - pad * 2) * 0.62, bottom * 0.36) / 32));
      G.titleP = L.s3; G.cp = Math.round(L.s3 * 1.3);
      G.tx = pad; G.tw = w - pad * 2;
      let y = 0;
      G.hy = y; y += LH * p1 + pad * 0.5;
      G.ax = Math.round((w - G.ap * 32) / 2); G.ay = y; y += G.ap * 32 + pad;
      G.titleY = y; y += LH * G.titleP;
      G.artistY = y; y += LH * L.s2;
      G.filmY = y; y += LH * p1 + pad * 0.5;
      G.counterY = y; y += th(G.cp) + pad * 0.7;
      G.progY = y; y += p1 * 2 + pad;
      G.sy = y; G.sh = Math.min(bottom - y - pad, Math.round(G.tw * 0.55));
      const shift = Math.max(0, Math.round((bottom - (G.sy + G.sh)) / 2));
      for (const k of ['hy', 'ay', 'titleY', 'artistY', 'filmY', 'counterY', 'progY', 'sy']) G[k] += shift;
      G.sx = pad; G.sw = G.tw;
    } else {
      G.ap = Math.max(3, Math.floor((bottom - pad) / 32));
      G.ax = pad; G.ay = Math.max(Math.round(pad / 2), Math.round((bottom - G.ap * 32) / 2));
      G.titleP = L.s2; G.cp = L.s2 + Math.round(L.s1 * 0.75);
      G.tx = G.ax + G.ap * 32 + pad * 2; G.tw = w - G.tx - pad;
      let y = G.ay;
      G.hy = y; y += LH * p1 + pad * 0.3;
      G.titleY = y; y += LH * G.titleP;
      G.artistY = y; y += LH * p1;
      G.filmY = y; y += LH * p1 + pad * 0.5;
      G.counterY = y; y += th(G.cp) + pad * 0.6;
      G.progY = y; y += p1 * 2 + pad * 0.8;
      G.sx = G.tx; G.sy = y; G.sw = G.tw; G.sh = Math.max(p1 * 12, G.ay + G.ap * 32 - y);
    }
    G.hx = G.tx;
    G.seg = Math.max(6, Math.min(14, Math.floor(G.sh / (p1 * 2.8))));
    G.cellH = G.sh / G.seg; G.segH = Math.max(2, Math.round(G.cellH * 0.62));
    G.bandW = G.sw / NB; G.barW = Math.max(3, Math.round(G.bandW * 0.72));
    G.pd = Math.min(Math.floor(G.tw / G.pn), p1 * 3);
    return G;
  }
  function drawDeck(g, w, h, now) {
    const it = player.item, G = deckGeom(w, h), p1 = L.s1;
    statusLine(g, w, h, 'APPLE MUSIC PREVIEW · 30 SEC', { text: player.state === 'armed' ? 'TAP TO PLAY' : 'TAP TO STOP', color: PAL.dim });
    drawArt(g, coverArt(it, 32), 32, G.ax, G.ay, G.ap, PAL.main);
    const head = player.state === 'loading' ? 'LOADING' : player.state === 'armed' ? 'TAP TO PLAY' : player.state === 'error' ? 'NO PREVIEW · ' + player.err : 'PREVIEW';
    fitText(g, head, G.hx + 2 * 6 * p1, G.hy, G.tw - 2 * 6 * p1, p1, player.state === 'error' ? PAL.warn : PAL.accent);
    if (tw(norm(it.title).length, G.titleP) <= G.tw) text(g, it.title, G.tx, G.titleY, G.titleP, PAL.main);
    fitText(g, it.artist, G.tx, G.artistY, G.tw, L.portrait ? L.s2 : p1, PAL.accent);
    const sub = [it.film ? 'FROM ' + it.film : '', it.type + (it.lang ? ' · ' + it.lang : '')].filter(Boolean).join(' · ');
    text(g, clip(sub, Math.floor((G.tw + p1) / (6 * p1))), G.tx, G.filmY, p1, PAL.dim);
    text(g, '/ 00:30', G.tx + tw(5, G.cp) + p1 * 3, G.counterY + th(G.cp) - th(p1), p1, PAL.dim);
    const gs = sprite(PAL.main, p1, 'ghost');
    for (let i = 0; i < G.pn; i++) g.drawImage(gs, G.tx + i * G.pd - gs.width / 2 + p1 / 2, G.progY - gs.height / 2 + p1 / 2);
    const off = segImg(G.barW, G.segH, PAL.main, false);
    for (let b = 0; b < NB; b++) {
      const x = G.sx + b * G.bandW + (G.bandW - G.barW) / 2;
      for (let k = 0; k < G.seg; k++) g.drawImage(off, Math.round(x), Math.round(G.sy + G.sh - (k + 1) * G.cellH + (G.cellH - G.segH) / 2));
    }
  }
  function dynDeck(g, w, h, now, ts) {
    if (player.state === 'idle' || !player.item) return;
    const G = deckGeom(w, h), p1 = L.s1, a = player.audio, playing = player.state === 'playing';
    if (playing || Math.floor(ts / 500) % 2) g.drawImage(textImg('▶', p1, PAL.accent), G.hx - p1 * 2, G.hy - p1 * 2);
    const title = norm(player.item.title);
    if (tw(title.length, G.titleP) > G.tw) { // marquee for long titles
      const im = textImg(title + '     ', G.titleP, PAL.main), cyc = (title.length + 5) * 6 * G.titleP;
      const off = Math.max(0, ((ts - player.started - 1500) * G.titleP * 10) / 1000) % cyc;
      g.save(); g.beginPath(); g.rect(G.tx, G.titleY - G.titleP, G.tw, th(G.titleP) + G.titleP * 2); g.clip();
      g.drawImage(im, Math.round(G.tx - off - G.titleP * 2), G.titleY - G.titleP * 2);
      g.drawImage(im, Math.round(G.tx - off + cyc - G.titleP * 2), G.titleY - G.titleP * 2);
      g.restore();
    }
    const el = playing && a ? a.currentTime || 0 : 0;
    const dur = a && isFinite(a.duration) && a.duration > 0 ? a.duration : 30;
    g.drawImage(textImg(mmss(el), G.cp, PAL.main, true), G.tx - G.cp * 2, G.counterY - G.cp * 2);
    const lit = Math.min(G.pn, Math.floor((el / dur) * G.pn + 1e-6));
    if (lit) {
      const sp = sprite(PAL.main, p1, 'glow');
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < lit; i++) g.drawImage(sp, G.tx + i * G.pd - sp.width / 2 + p1 / 2, G.progY - sp.height / 2 + p1 / 2);
      g.globalCompositeOperation = 'source-over';
    }
    readSpectrum(ts, G.seg);
    const hot = Math.ceil(G.seg * 0.8);
    const on = segImg(G.barW, G.segH, PAL.main, true), onHot = segImg(G.barW, G.segH, PAL.warn, true);
    const m = (on.width - G.barW) / 2;
    for (let b = 0; b < NB; b++) {
      const x = Math.round(G.sx + b * G.bandW + (G.bandW - G.barW) / 2 - m);
      const yAt = (k) => Math.round(G.sy + G.sh - (k + 1) * G.cellH + (G.cellH - G.segH) / 2 - m);
      for (let k = 0; k < bandLv[b]; k++) g.drawImage(k >= hot ? onHot : on, x, yAt(k));
      const pk = peakLv[b] - 1;
      if (pk >= 0 && pk >= bandLv[b]) g.drawImage(pk >= hot ? onHot : on, x, yAt(pk));
    }
  }

  /* ---------- 6. new releases list ---------- */
  let relHits = [];
  function drawReleases(g, w, h, now) {
    if (player.state !== 'idle' && player.item) { relHits = []; drawDeck(g, w, h, now); return; }
    relHits = [];
    const st = status('rel', now), d = ST.rel.data;
    const bottom = statusLine(g, w, h, 'APPLE MUSIC · TAP A RELEASE TO PREVIEW', st);
    if (!d || !d.items.length) { centerMsg(g, w, bottom, ST.rel.fails ? 'NO DATA' : 'LOADING', ST.rel.err || 'SET ARTISTS IN SETTINGS'); return; }
    const ncol = L.portrait ? 1 : 2;
    const colW = (w - L.pad * (ncol + 1)) / ncol;
    const pT = L.s2, pS = L.s1;
    const ap = Math.max(3, Math.floor((LH * pS * 3 + LH * pT - L.pad * 0.25) / 16));
    const artW = ap * 16, tx0 = artW + L.pad;
    const tCols = Math.floor((colW - tx0 + pT) / (6 * pT)), sCols = Math.floor((colW - tx0 + pS) / (6 * pS));
    let col = 0, y = L.pad;
    for (let idx = 0; idx < d.items.length; idx++) {
      const it = d.items[idx], age = now - it.t;
      const tag = it.t > now ? 'COMING ' : age < 7 * 864e5 ? 'NEW ' : '';
      const date = new Date(it.t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: age > 300 * 864e5 ? 'numeric' : undefined });
      const tl = wrap(it.title, tCols, 2);
      const sub2 = [it.film ? 'FROM ' + it.film : '', it.type + (it.lang ? ' · ' + it.lang : '')].filter(Boolean).join(' · ');
      const textH = LH * pS + tl.length * LH * pT + 2 * LH * pS;
      const ih = Math.max(textH, artW) + L.pad * 0.8;
      if (y + ih - L.pad * 0.8 > bottom) { col++; y = L.pad; if (col >= ncol) break; }
      const x = L.pad + col * (colW + L.pad);
      drawArt(g, coverArt(it, 16), 16, x, y, ap, PAL.main);
      const tx = x + tx0;
      let yy = y;
      if (tag) text(g, tag, tx, yy, pS, PAL.accent);
      text(g, date, tx + tw(tag.length, pS) + (tag ? pS * 2 : 0), yy, pS, PAL.dim);
      yy += LH * pS;
      for (const ln of tl) { text(g, ln, tx, yy, pT, PAL.main); yy += LH * pT; }
      text(g, clip(it.artist, sCols), tx, yy, pS, PAL.accent); yy += LH * pS;
      text(g, clip(sub2, sCols), tx, yy, pS, PAL.dim);
      relHits.push({ x, y: y - L.pad * 0.3, w: colW, h: ih, idx });
      y += ih;
    }
  }

  /* ---------- 7. countdown ---------- */
  function drawCountdown(g, w, h, now) {
    const name = S.cdName || 'COUNTDOWN';
    const t = S.cdDate ? new Date(S.cdDate).getTime() : NaN;
    const np = fitP(norm(name).length, w - L.pad * 2, h * 0.08, L.s3);
    if (isNaN(t)) {
      text(g, name, w / 2, L.pad * 2, np, PAL.accent, 'center');
      centerMsg(g, w, h, 'DATE NOT SET', 'LONG-PRESS TO OPEN SETTINGS AND PICK THE DATE');
      return;
    }
    let diff = t - now; const past = diff < 0; diff = Math.abs(diff);
    const days = Math.floor(diff / 864e5);
    const hh = Math.floor((diff % 864e5) / 3600e3), mm = Math.floor((diff % 3600e3) / 60e3), ss = Math.floor((diff % 60e3) / 1000);
    const ds = String(days);
    const P = fitP(Math.max(3, ds.length), w * 0.8, h * 0.3, L.s3 * 4);
    const q = fitP(8, w * 0.8, h * 0.1, L.s3 * 1.5);
    const total = th(np) + L.pad * 2 + th(P) + L.s2 * 3 + th(L.s2) + L.pad * 2 + th(q) + L.pad * 2 + th(L.s1);
    let y = Math.round((h - total) / 2);
    text(g, name, w / 2, y, np, PAL.accent, 'center'); y += th(np) + L.pad * 2;
    text(g, ds, w / 2, y, P, PAL.main, 'center', true); y += th(P) + L.s2 * 3;
    text(g, past ? (days === 1 ? 'DAY SINCE' : 'DAYS SINCE') : (days === 1 ? 'DAY TO GO' : 'DAYS TO GO'), w / 2, y, L.s2, PAL.dim, 'center');
    y += th(L.s2) + L.pad * 2;
    text(g, pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss), w / 2, y, q, PAL.main, 'center', true); y += th(q) + L.pad * 2;
    const td = new Date(t);
    const tl = td.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + pad2(td.getHours()) + ':' + pad2(td.getMinutes());
    text(g, tl, w / 2, y, L.s1, PAL.dim, 'center');
  }

  /* ---------- 8. credits ---------- */
  function drawCredits(g, w, h) {
    const p = L.s1, maxC = Math.floor((w - L.pad * 2) / (6 * p));
    const rows = [
      ['h', 'DATA SOURCES'],
      ['t', 'WEATHER: OPEN-METEO.COM (CC BY 4.0) · AIR QUALITY: CAMS'],
      ['t', 'BUS: ARRIVELAH / LTA DATAMALL · MAP © OPENSTREETMAP (ODBL)'],
      ['t', 'FLIGHTS: ADSB.LOL (ODBL) · ROUTES: ADSBDB · QUAKES: USGS'],
      ['t', 'SKY MAP: NATURAL EARTH (PUBLIC DOMAIN)'],
      ['t', 'FX: FRANKFURTER - ECB DAILY REFERENCE RATES'],
      ['t', 'KURAL: THIRUVALLUVAR · TEXT + ENGLISH: TK120404/THIRUKKURAL (APACHE-2.0)'],
      ['t', 'NEW RELEASES: ITUNES · HEADLINES: YOUR RSS FEED'],
      ['g', ''],
      ['h', 'CONTROLS'],
      ['t', 'TAP: FULLSCREEN / PAUSE · SWIPE: PAGE · HOLD: SETTINGS'],
      ['g', ''],
      ['h', 'SYSTEM'],
      ['t', 'VERSION ' + APP_VERSION + (isNative() ? ' · ANDROID APP' : ' · PWA')],
      ['t', 'WAKE LOCK ' + (wakeLock ? 'ON' : ('wakeLock' in navigator ? 'OFF' : 'UNSUPPORTED'))],
      ['t', 'MODE: ' + LAUNCH_MODE],
      ['t', 'REMOTE: ' + remoteState],
      ['t', 'BATTERY: ' + (battery ? Math.round(battery.level * 100) + '%' + (battery.charging ? ' CHARGING' : '') : 'UNKNOWN')]
    ];
    let y = L.pad;
    for (const [k, s] of rows) {
      if (k === 'g') { y += LH * p * 0.6; continue; }
      const lines = k === 'h' ? [norm(s)] : wrap(s, maxC);
      for (const ln of lines) {
        if (y + th(p) > h - L.pad) return;
        text(g, ln, L.pad, y, p, k === 'h' ? PAL.accent : PAL.main); y += LH * p;
      }
      y += p * 3;
    }
  }

  const PAGES = {
    clock: { draw: drawClock, key: (now) => Math.floor(now / 1000) },
    bus: { draw: drawBus, dyn: dynBus, fps: 15, dwellMul: 1.5, key: (now) => sig('bus', now) + Math.floor(now / 5000) + !!MM },
    sky: { draw: drawSky, dyn: dynSky, fps: 20, key: (now) => sig('sky', now) + sig('quakes', now) + Math.floor(now / 60e3) + !!REG + skyReady() },
    fx: { draw: drawFx, key: (now) => sig('fx', now) },
    weather: { draw: drawWeather, key: (now) => sig('wx', now) + sig('aq', now) + Math.floor(now / 60e3) },
    news: { draw: drawNews, dyn: dynNews, dwellMul: 2, key: (now) => sig('news', now) + feedReady() },
    releases: {
      draw: drawReleases, dyn: dynDeck, dynOn: () => player.state !== 'idle', fps: 30,
      key: (now) => sig('rel', now) + Math.floor(now / 3600e3) + '|' + player.state + (player.item ? player.item.id : '') + player.err + '|' + artVer
    },
    kural: { draw: drawKural, key: (now) => sig('kural', now) + todayKey() },
    countdown: { draw: drawCountdown, key: (now) => Math.floor(now / 1000) + S.cdDate + S.cdName },
    credits: { draw: drawCredits, key: () => String(!!wakeLock) + remoteState + (battery ? Math.round(battery.level * 100) + '' + battery.charging : '') }
  };

  /* ================================================================ layers */
  const layers = new Map(); // id -> {c, g, key}
  function layerFor(id, now) {
    let l = layers.get(id);
    if (!l) {
      if (layers.size >= 3) {
        for (const k of layers.keys()) { if (k !== id && !visibleIds().includes(k)) { layers.delete(k); break; } }
      }
      const c = mkCanvas(L.cw, L.ch);
      l = { c, g: c.getContext('2d'), key: null };
      layers.set(id, l);
    }
    const k = PAGES[id].key(now) + '|' + S.palette;
    if (l.key !== k) {
      l.g.clearRect(0, 0, L.cw, L.ch);
      PAGES[id].draw(l.g, L.cw, L.ch, now);
      l.key = k;
    }
    return l;
  }
  const layerDirty = (id, now) => { const l = layers.get(id); return !l || l.key !== PAGES[id].key(now) + '|' + S.palette; };

  /* ======================================================== header / footer */
  const hdr = { c: null, key: null }, ftr = { c: null, key: null };
  let pages = [], cur = 0, trans = null, paused = false, settingsOpen = false, dwellAcc = 0, forceDraw = true;
  const visibleIds = () => (trans ? [pages[trans.from], pages[trans.to]] : [pages[cur]]);
  const isFullscreen = () => !!document.fullscreenElement || window.matchMedia('(display-mode: fullscreen)').matches;
  function staleCount(now) {
    let n = 0;
    for (const k in SRC) if (SRC[k].on() && (isStale(k, now) || (!ST[k].data && ST[k].fails))) n++;
    return n;
  }
  const bootAt = Date.now();
  function drawHeader(now) {
    const idx = trans ? trans.to : cur;
    const id = pages[idx];
    const def = PAGE_DEFS.find((p) => p.id === id);
    const online = navigator.onLine !== false;
    const sc = staleCount(now);
    const bat = battery ? (battery.charging ? 'CHG ' : 'BAT ') + Math.round(battery.level * 100) + '%' : '';
    const key = [idx, id, online, sc, bat, S.palette, W, H].join('|');
    if (hdr.key === key && hdr.c) return hdr.c;
    const c = hdr.c && hdr.c.width === W && hdr.c.height === L.uy + L.hdrH ? hdr.c : mkCanvas(W, L.uy + L.hdrH);
    const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    const p = L.s1, y = L.uy + L.pad;
    const left = pad2(idx + 1) + ' ' + (def ? def.title : '');
    text(g, left, L.ux + L.pad, y, p, PAL.main);
    const right = [sc ? sc + ' STALE' : '', online ? '' : 'OFFLINE', bat || (online ? 'ONLINE' : '')].filter(Boolean).join(' · ');
    const cols = Math.floor((L.uw - L.pad * 2 + p) / (6 * p));
    const lowBat = battery && !battery.charging && battery.level < 0.2;
    text(g, clip(right, cols - norm(left).length - 2), L.ux + L.uw - L.pad, y, p, online && !sc && !lowBat ? PAL.dim : PAL.warn, 'right');
    dotLine(g, L.ux + L.pad, L.uy + L.hdrH - 1, L.uw - L.pad * 2, Math.max(1, p - 1), PAL.dim);
    hdr.c = c; hdr.key = key;
    return c;
  }
  function drawFooter(now) {
    const idx = trans ? trans.to : cur;
    const fs = isFullscreen();
    const al = alertsNow(now);
    const alertTxt = al.length ? al[Math.floor(now / 3000) % al.length] : '';
    const hint = alertTxt || (paused ? '' : !fs ? 'TAP: FULLSCREEN' : (now - bootAt < 60e3 ? 'HOLD: SETTINGS' : ''));
    const hintCol = alertTxt ? PAL.warn : PAL.dim;
    const key = [idx, pages.length, paused, hint, S.palette, W, H].join('|');
    const fh = L.ftrH + (H - L.uy - L.uh);
    if (ftr.key === key && ftr.c) return ftr.c;
    const c = ftr.c && ftr.c.width === W && ftr.c.height === fh ? ftr.c : mkCanvas(W, fh);
    const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    const p = L.s1, cy = L.pad + th(p) / 2;
    const gap = Math.round(p * 5), n = pages.length;
    const dotsW = (n - 1) * gap;
    // dots centred; when a long hint is showing in portrait, move them to the left edge
    const cols = Math.floor((L.uw - L.pad * 2 + p) / (6 * p));
    const leftTxt = paused ? '|| PAUSED' : '';
    const half = Math.floor((cols - Math.ceil((dotsW + gap * 2) / (6 * p))) / 2);
    const centred = leftTxt.length <= half && hint.length <= half;
    const x0 = centred ? L.ux + L.uw / 2 - dotsW / 2 : L.ux + L.pad + p;
    for (let i = 0; i < n; i++) {
      const sp = sprite(i === idx ? PAL.main : PAL.dim, i === idx ? Math.round(p * 2) : Math.round(p * 1.2), 'glow');
      g.globalCompositeOperation = 'lighter';
      g.drawImage(sp, Math.round(x0 + i * gap - sp.width / 2), Math.round(cy - sp.height / 2));
      g.globalCompositeOperation = 'source-over';
    }
    dotLine(g, L.ux + L.pad, 1, L.uw - L.pad * 2, Math.max(1, p - 1), PAL.dim);
    if (centred) {
      if (leftTxt) text(g, leftTxt, L.ux + L.pad, L.pad, p, PAL.warn);
      if (hint) text(g, hint, L.ux + L.uw - L.pad, L.pad, p, hintCol, 'right');
    } else {
      const right = [leftTxt, hint].filter(Boolean).join(' · ');
      const free = cols - Math.ceil((dotsW + gap * 2) / (6 * p)) - 1;
      text(g, clip(right, free), L.ux + L.uw - L.pad, L.pad, p, paused || alertTxt ? PAL.warn : PAL.dim, 'right');
    }
    ftr.c = c; ftr.key = key;
    return c;
  }

  function releaseAlerts(now) { // new in the last 24 h, or due within a week (pre-orders)
    const d = ST.rel.data; if (!d || !S.pages.releases) return [];
    const out = [];
    for (const it of d.items) {
      if (it.t <= now && now - it.t < 864e5) out.push('NEW: ' + it.title);
      else if (it.t > now && it.t - now < 7 * 864e5) out.push('COMING ' + new Date(it.t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ': ' + it.title);
    }
    return out.slice(0, 3);
  }
  let alertCache = { sec: -1, list: [] };
  function alertsNow(now) {
    const sec = Math.floor(now / 1000);
    if (alertCache.sec !== sec) {
      alertCache = { sec, list: rainSoon(now).map((r) => 'RAIN ' + r.code + ' ' + r.short).concat(fxAlertList(), releaseAlerts(now)) };
    }
    return alertCache.list;
  }

  /* ---------- message banner (remote "msg ...") ---------- */
  let banner = null, holdUntil = 0, lastBannerTick = -1;
  function showBanner(t) {
    if (sleeping) exitSleep();
    banner = { text: String(t).slice(0, 240), at: Date.now(), until: Date.now() + 120e3, c: null, key: '' };
    forceDraw = true;
  }
  function drawBanner(now) {
    if (!banner) return;
    if (now > banner.until) { banner = null; forceDraw = true; return; }
    const key = [banner.text, W, H, S.palette].join('|');
    if (banner.key !== key) {
      const bw = L.cw - L.pad * 2, inner = bw - L.pad * 2;
      let p = L.s3 * 2, lines;
      const longest = Math.max.apply(null, norm(banner.text).split(' ').map((x) => x.length));
      for (; p > L.s1; p--) {
        const cols = Math.floor((inner + p) / (6 * p));
        lines = wrap(banner.text, cols);
        if (longest <= cols && lines.length * LH * p <= L.ch * 0.5) break;
      }
      lines = wrap(banner.text, Math.floor((inner + p) / (6 * p)), 8);
      const bh = L.pad * 2 + th(L.s1) + L.s1 * 4 + lines.length * LH * p;
      const c = mkCanvas(bw, bh), g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, bw, bh);
      const e = Math.max(1, L.s1 - 1);
      dotLine(g, e, e, bw - e * 2, e, PAL.accent); dotLine(g, e, bh - e, bw - e * 2, e, PAL.accent);
      g.fillStyle = PAL.accent; g.globalAlpha = 0.5; g.beginPath();
      for (let yy = e; yy <= bh - e; yy += e * 2) { g.moveTo(e * 1.3, yy); g.arc(e, yy, e * 0.3, 0, Math.PI * 2); g.moveTo(bw - e * 0.7, yy); g.arc(bw - e, yy, e * 0.3, 0, Math.PI * 2); }
      g.fill(); g.globalAlpha = 1;
      text(g, 'MESSAGE · ' + hhmm(banner.at), bw / 2, L.pad, L.s1, PAL.accent, 'center');
      lines.forEach((ln, k) => text(g, ln, bw / 2, L.pad + th(L.s1) + L.s1 * 4 + k * LH * p, p, PAL.main, 'center'));
      banner.c = c; banner.key = key;
    }
    const bx = L.cx + L.pad, by = Math.round(L.cy + (L.ch - banner.c.height) / 2);
    ctx.drawImage(banner.c, bx, by);
    if (now - banner.at < 10e3 && Math.floor(now / 500) % 2) { // attention pulse for the first 10 s
      ctx.strokeStyle = PAL.accent; ctx.lineWidth = Math.max(2, L.s1 * 0.7);
      ctx.strokeRect(bx + ctx.lineWidth / 2, by + ctx.lineWidth / 2, banner.c.width - ctx.lineWidth, banner.c.height - ctx.lineWidth);
    }
  }

  /* ============================================================ frame loop */
  let raf = 0, lastTs = 0;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (lastTs && ts - lastTs < 1000 / 30 - 4) return; // 30 fps cap
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (!pages.length || !W) return;
    const now = Date.now();

    if (!paused && !settingsOpen && !trans && pages.length > 1 && now >= holdUntil) {
      dwellAcc += dt * 1000;
      const def = PAGES[pages[cur]];
      if (dwellAcc >= S.dwell * 1000 * (def.dwellMul || 1)) go(1);
    }
    let need = forceDraw;
    if (trans) need = true;
    for (const id of visibleIds()) {
      const P = PAGES[id];
      if (layerDirty(id, now)) need = true;
      else if (P.dyn && (!P.dynOn || P.dynOn()) && (!P.fps || trans || ts - (dynLast[id] || 0) >= 1000 / P.fps - 4)) need = true;
    }
    const hc = drawHeader(now), fc = drawFooter(now);
    if (hc !== lastHc || hdr.key !== lastHk || ftr.key !== lastFk) need = true;
    if (banner) { const bt = Math.floor(now / 500); if (bt !== lastBannerTick || now > banner.until) { lastBannerTick = bt; need = true; } }
    if (!need) return;
    forceDraw = false; lastHc = hc; lastHk = hdr.key; lastFk = ftr.key;

    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (trans) {
      /* VFD-style page change: the old page's dots decay out (~110 ms), then the new page is driven in one
         character column at a time (~240 ms) with a briefly over-bright leading column. No sliding. */
      const el = ts - trans.t0;
      if (el < FADE_MS) {
        const a = 1 - el / FADE_MS;
        ctx.globalAlpha = a * a;
        drawPage(pages[trans.from], 0, now, ts, dt, true);
        ctx.globalAlpha = 1;
      } else {
        const t = Math.min(1, (el - FADE_MS) / WIPE_MS), step = 6 * L.s1;
        const cols = Math.ceil(L.cw / step), wv = Math.min(L.cw, Math.ceil(t * cols) * step);
        const x0 = trans.dir > 0 ? L.cx : L.cx + L.cw - wv;
        drawPage(pages[trans.to], 0, now, ts, dt, false, [x0, wv]);
        if (t < 1 && wv > 0) {
          const ex = trans.dir > 0 ? x0 + wv - step : x0;
          ctx.save(); ctx.beginPath(); ctx.rect(ex, L.cy, step, L.ch); ctx.clip();
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4;
          ctx.drawImage(layerFor(pages[trans.to], now).c, L.cx, L.cy);
          ctx.restore();
        }
        if (t >= 1) { cur = trans.to; trans = null; dwellAcc = 0; forceDraw = true; }
      }
    } else drawPage(pages[cur], 0, now, ts, dt);
    drawBanner(now);
    ctx.drawImage(hc, 0, 0);
    ctx.drawImage(fc, 0, L.uy + L.uh - L.ftrH);
    drawnFrames++;
    if (!firstDrawn) {
      firstDrawn = true;
      try { performance.mark('mc-first-frame'); } catch (e) { /* ignore */ }
      setTimeout(loadMinimap, 300);
      setTimeout(loadRegion, 600);
    }
  }
  let firstDrawn = false, drawnFrames = 0;
  const dynLast = {};
  let lastHc = null, lastHk = null, lastFk = null;
  function drawPage(id, offX, now, ts, dt, staticOnly, clipX) {
    const l = layerFor(id, now);
    if (clipX) { ctx.save(); ctx.beginPath(); ctx.rect(clipX[0], L.cy, clipX[1], L.ch); ctx.clip(); }
    ctx.drawImage(l.c, L.cx + offX, L.cy);
    const P = PAGES[id];
    if (!staticOnly && P.dyn && (!P.dynOn || P.dynOn())) {
      ctx.save();
      ctx.beginPath(); ctx.rect(L.cx, L.cy, L.cw, L.ch); ctx.clip();
      ctx.translate(L.cx + offX, L.cy);
      P.dyn(ctx, L.cw, L.ch, now, ts, dt);
      dynLast[id] = ts;
      ctx.restore();
    }
    if (clipX) ctx.restore();
  }
  function go(dir) {
    if (pages.length < 2) return;
    if (trans) { cur = trans.to; trans = null; }
    const to = (cur + dir + pages.length) % pages.length;
    if (pages[to] !== 'releases') stopPreview();
    trans = { from: cur, to, dir: dir > 0 ? 1 : -1, t0: performance.now() };
    dwellAcc = 0;
  }
  function goTo(idx) {
    if (idx < 0 || idx >= pages.length) return;
    if (trans) { cur = trans.to; trans = null; }
    if (pages[idx] !== 'releases') stopPreview();
    if (idx !== cur) trans = { from: cur, to: idx, dir: idx > cur ? 1 : -1, t0: performance.now() };
    dwellAcc = 0;
  }
  function start() { if (!raf) { lastTs = 0; forceDraw = true; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function rebuildPages() {
    const curId = pages[cur];
    pages = PAGE_DEFS.map((p) => p.id).filter((id) => S.pages[id]);
    if (!pages.length) pages = ['clock'];
    cur = Math.max(0, pages.indexOf(curId));
    trans = null; dwellAcc = 0; forceDraw = true;
  }

  /* ============================================================== gestures */
  let pd = null;
  cv.addEventListener('pointerdown', (e) => {
    if (settingsOpen) return;
    if (sleeping) { onTap(); return; }
    pd = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, long: false, id: e.pointerId };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    pd.timer = setTimeout(() => { if (pd && !pd.moved) { pd.long = true; openSettings(); } }, LONGPRESS_MS);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pd || e.pointerId !== pd.id) return;
    if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 12) { pd.moved = true; clearTimeout(pd.timer); }
  });
  const endPointer = (e, cancelled) => {
    if (!pd || e.pointerId !== pd.id) return;
    clearTimeout(pd.timer);
    const p = pd; pd = null;
    if (cancelled || p.long) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) { go(dx < 0 ? 1 : -1); return; }
    if (!p.moved && performance.now() - p.t < 500) onTap(e.clientX, e.clientY);
  };
  cv.addEventListener('pointerup', (e) => endPointer(e, false));
  cv.addEventListener('pointercancel', (e) => endPointer(e, true));
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  function onTap(cx, cy) {
    if (sleeping) {
      exitSleep();
      if (!isFullscreen() && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      return;
    }
    if (banner) { banner = null; forceDraw = true; return; }
    requestWake();
    if (pages[cur] === 'releases' && !trans) {
      if (player.state === 'armed') { playRelease(player.idx); return; }
      if (player.state !== 'idle') { stopPreview(); return; }
      if (cx != null) {
        const hx = cx * DPR - L.cx, hy = cy * DPR - L.cy;
        const hit = relHits.find((r) => hx >= r.x && hx <= r.x + r.w && hy >= r.y && hy <= r.y + r.h);
        if (hit) {
          if (!isFullscreen() && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
          playRelease(hit.idx); return;
        }
      }
    }
    if (!isFullscreen() && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => { paused = !paused; forceDraw = true; });
      return;
    }
    paused = !paused; dwellAcc = 0; forceDraw = true;
  }
  document.addEventListener('keydown', (e) => {
    if (settingsOpen) { if (e.key === 'Escape') closeSettings(); return; }
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === ' ') { paused = !paused; forceDraw = true; }
    else if (e.key === 's' || e.key === 'S') openSettings();
  });
  // Cutout insets can change without a resize event (180° flip, entering fullscreen),
  // and some browsers update env() a moment after resizing, so re-check a few times.
  function relayoutSoon() {
    clearTimeout(rsT);
    rsT = setTimeout(resize, 120);
    setTimeout(() => { if (insetSig() !== insetKey) resize(); }, 600);
    setTimeout(() => { if (insetSig() !== insetKey) resize(); }, 1500);
  }
  document.addEventListener('fullscreenchange', () => { forceDraw = true; relayoutSoon(); });
  if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
    window.screen.orientation.addEventListener('change', relayoutSoon);
  } else window.addEventListener('orientationchange', relayoutSoon);
  setInterval(() => { if (!document.hidden && insetSig() !== insetKey) resize(); }, 3000);

  /* ============================================================= wake lock */
  let wakeLock = null;
  async function requestWake() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock || sleeping) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeLock = null; /* needs a gesture or not allowed; retried on next tap/visibility */ }
  }

  /* ====================================================== remote sleep/wake
   * Listens on a private ntfy.sh topic (Server-Sent Events). An iPhone Shortcut
   * opens https://ntfy.sh/<topic>/publish?message=off (or on). "off" releases the
   * wake lock and blanks the display so Android's own screen timeout turns the
   * screen off. Waking the screen, a tap, or "on" resumes. */
  let sleeping = false, es = null, esTopic = '', remoteState = 'OFF';
  const NTFY = 'https://ntfy.sh/';
  function enterSleep() {
    if (sleeping) return;
    stopPreview();
    sleeping = true;
    if (settingsOpen) closeSettings();
    document.body.classList.add('sleep');
    stop();
    const wl = wakeLock; wakeLock = null;
    if (wl) wl.release().catch(() => {});
  }
  function exitSleep() {
    if (!sleeping) return;
    sleeping = false;
    document.body.classList.remove('sleep');
    requestWake(); start(); schedTick();
    forceDraw = true;
  }
  const PAGE_ALIASES = {
    clock: 'clock', time: 'clock', bus: 'bus', buses: 'bus', sky: 'sky', flights: 'sky', map: 'sky', world: 'sky', quakes: 'sky',
    fx: 'fx', rates: 'fx', forex: 'fx', weather: 'weather', wx: 'weather', news: 'news', headlines: 'news',
    music: 'releases', releases: 'releases', new: 'releases', singles: 'releases',
    kural: 'kural', thirukkural: 'kural', countdown: 'countdown', trip: 'countdown', credits: 'credits'
  };
  function showPage(name) {
    const n = parseInt(name, 10);
    const id = !isNaN(n) && String(n) === name ? pages[n - 1] : PAGE_ALIASES[name];
    const idx = pages.indexOf(id);
    if (idx < 0) return;
    goTo(idx);
    holdUntil = Date.now() + 60e3; // stay on the requested page for a minute
  }
  function setFeed(url) {
    if (String(S.rssUrl).trim() === url) return;
    S.rssUrl = url; S.feedMigrated = true; LS.set('mc.settings', S);
    resetSource('news'); newsLayout = null; newsScroll = 0; forceDraw = true; schedTick();
  }
  function setPalette(v) {
    S.palette = v; LS.set('mc.settings', S); PAL = PALETTES[v];
    layers.clear(); skyBase = null; mmImg = null; newsCache.clear(); newsLayout = null; hdr.key = ftr.key = null;
    if (banner) banner.key = '';
    forceDraw = true;
  }
  /* Remote commands (ntfy message text):
     off | on | toggle | msg <text> | clear | next | prev | pause | resume |
     page <name or number> | <page name> | colour | vfd */
  function handleRemote(raw) {
    const msg = String(raw || '').trim(), low = msg.toLowerCase();
    const word = low.split(/\s+/)[0], rest = msg.slice(word.length).trim();
    if (low === 'off' || low === 'sleep') return enterSleep();
    if (low === 'on' || low === 'wake') return exitSleep();
    if (low === 'toggle') return sleeping ? exitSleep() : enterSleep();
    if (word === 'msg' || word === 'say' || word === 'message') { if (rest) showBanner(rest); return; }
    if ((word === 'feed' || word === 'news') && rest) { // switch headline source, then show it
      const k = /^(bs|business)/i.test(rest) ? 'bs' : /^cnbc/i.test(rest) ? 'cnbc' : '';
      if (k) { setFeed(FEEDS[k]); if (sleeping) exitSleep(); showPage('news'); }
      return;
    }
    if (low === 'clear' || low === 'dismiss') { banner = null; forceDraw = true; return; }
    if (word === 'play') { const n = parseInt(rest, 10); playRelease(!isNaN(n) && n > 0 ? n - 1 : 0); return; }
    if (low === 'stop') { stopPreview(); return; }
    const isCmd = ['next', 'prev', 'previous', 'back', 'pause', 'resume', 'colour', 'color', 'vfd', 'page', 'show', 'palette'].includes(word) || PAGE_ALIASES[low.replace(/\s+/g, '')];
    if (!isCmd) return;
    if (sleeping) exitSleep();
    if (low === 'next') { holdUntil = 0; go(1); }
    else if (low === 'prev' || low === 'previous' || low === 'back') { holdUntil = 0; go(-1); }
    else if (low === 'pause') { paused = true; forceDraw = true; }
    else if (low === 'resume') { paused = false; holdUntil = 0; dwellAcc = 0; forceDraw = true; }
    else if (word === 'page' || word === 'show') showPage(rest.toLowerCase().replace(/\s+/g, ''));
    else if (/^(palette\s+)?colou?r$/.test(low)) setPalette('color');
    else if (/^(palette\s+)?vfd$/.test(low)) setPalette('vfd');
    else showPage(low.replace(/\s+/g, ''));
  }
  function remoteConnect(force) {
    if (navigator.onLine === false) { if (es) { es.close(); es = null; } esTopic = ''; remoteState = 'OFFLINE'; return; }
    const want = S.remoteOn && S.remoteTopic && typeof EventSource === 'function' ? S.remoteTopic : '';
    if (!force && es && esTopic === want && es.readyState !== 2) return;
    if (!force && !es && esTopic === want && !want) return;
    if (es) { es.close(); es = null; }
    esTopic = want;
    if (!want) { remoteState = 'OFF'; return; }
    remoteState = 'CONNECTING';
    es = new EventSource(NTFY + encodeURIComponent(want) + '/sse');
    es.onopen = () => { remoteState = 'LISTENING'; };
    es.onerror = () => { remoteState = es && es.readyState === 2 ? 'DISCONNECTED' : 'RECONNECTING'; };
    es.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || m.event !== 'message') return;
      if (m.time && Date.now() / 1000 - m.time > 120) return; // ignore anything old
      handleRemote(String(m.message || ''));
    };
  }
  setInterval(() => { if (!document.hidden) remoteConnect(false); }, 10e3);

  /* =============================================================== battery */
  let battery = null;
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      battery = b;
      const upd = () => { forceDraw = true; };
      b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd);
    }).catch(() => { battery = null; });
  }


  /* ====================================================== install / mode */
  // How this page was launched, read before any requestFullscreen():
  // an installed app reports display-mode fullscreen; a normal Chrome tab reports browser.
  const LAUNCH_MODE = isNative() ? 'ANDROID APP'
    : window.matchMedia('(display-mode: fullscreen)').matches ? 'INSTALLED APP'
    : window.matchMedia('(display-mode: standalone)').matches ? 'INSTALLED APP (STANDALONE)'
    : 'BROWSER TAB';
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { installEvt = e; });
  window.addEventListener('appinstalled', () => { installEvt = null; });

  /* =============================================================== settings */
  const sEl = document.getElementById('settings'), sf = document.getElementById('sf');
  const pf = document.getElementById('pagesField');
  for (const p of PAGE_DEFS) {
    const lab = document.createElement('label'); lab.className = 'check';
    const inp = document.createElement('input'); inp.type = 'checkbox'; inp.name = 'page_' + p.id;
    lab.appendChild(inp); lab.appendChild(document.createTextNode(' ' + p.title));
    pf.appendChild(lab);
  }
  function openSettings() {
    if (settingsOpen) return;
    settingsOpen = true;
    const f = sf.elements;
    f.relArtists.value = S.relArtists;
    f.rssUrl.value = S.rssUrl; f.rssProxy.value = S.rssProxy; f.rssPreset.value = feedPreset(S.rssUrl);
    f.cdName.value = S.cdName; f.cdDate.value = S.cdDate; f.cdDate.min = '2026-01-01T00:00';
    f.palette.value = S.palette; f.dwell.value = S.dwell;
    f.notchMargin.value = S.notchMargin;
    f.remoteOn.checked = !!S.remoteOn; f.remoteTopic.value = S.remoteTopic;
    for (const pr of FX_PAIRS) f['fx_' + pr.id].value = S.fxAlerts[pr.id] || '';
    showRemoteUrls();
    document.getElementById('sInstall').hidden = !installEvt;
    for (const p of PAGE_DEFS) f['page_' + p.id].checked = !!S.pages[p.id];
    document.getElementById('sInfo').textContent = 'v' + APP_VERSION + ' · running as: ' + LAUNCH_MODE.toLowerCase() +
      ' · wake lock ' + (wakeLock ? 'on' : 'off') + ' · remote ' + remoteState.toLowerCase();
    sEl.hidden = false;
  }
  function closeSettings() { sEl.hidden = true; settingsOpen = false; forceDraw = true; }
  sf.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = sf.elements, old = S;
    const n = {
      relArtists: f.relArtists.value.trim(),
      rssUrl: f.rssUrl.value.trim(), rssProxy: f.rssProxy.value.trim(), feedMigrated: true,
      cdName: f.cdName.value.trim() || 'COUNTDOWN', cdDate: f.cdDate.value,
      palette: f.palette.value === 'color' ? 'color' : 'vfd',
      dwell: Math.max(3, Math.min(120, parseInt(f.dwell.value, 10) || 6)),
      notchMargin: Math.max(0, Math.min(120, parseInt(f.notchMargin.value, 10) || 0)),
      remoteOn: f.remoteOn.checked,
      remoteTopic: (f.remoteTopic.value.trim().replace(/[^A-Za-z0-9_-]/g, '') || old.remoteTopic).slice(0, 64),
      fxAlerts: {},
      pages: {}
    };
    for (const p of PAGE_DEFS) n.pages[p.id] = f['page_' + p.id].checked;
    for (const pr of FX_PAIRS) { const v = f['fx_' + pr.id].value.trim(); n.fxAlerts[pr.id] = parseFxRule(v) ? v : ''; }
    S = n; LS.set('mc.settings', S);
    if (old.relArtists !== n.relArtists) resetSource('rel');
    if (old.rssUrl !== n.rssUrl || old.rssProxy !== n.rssProxy) { resetSource('news'); LS.del(FEEDMODE_KEY); }
    PAL = PALETTES[S.palette];
    layers.clear(); skyBase = null; mmImg = null; newsCache.clear(); newsLayout = null; hdr.key = ftr.key = null;
    resize(); rebuildPages(); closeSettings(); schedTick(); remoteConnect(true);
  });
  function showRemoteUrls() {
    const t = (sf.elements.remoteTopic.value.trim().replace(/[^A-Za-z0-9_-]/g, '')) || S.remoteTopic;
    document.getElementById('remoteUrls').textContent =
      'Sleep:  ' + NTFY + t + '/publish?message=off\nWake:   ' + NTFY + t + '/publish?message=on';
  }
  sf.elements.remoteTopic.addEventListener('input', showRemoteUrls);
  sf.elements.rssPreset.addEventListener('change', () => { const k = sf.elements.rssPreset.value; if (FEEDS[k]) sf.elements.rssUrl.value = FEEDS[k]; else sf.elements.rssUrl.focus(); });
  sf.elements.rssUrl.addEventListener('input', () => { sf.elements.rssPreset.value = feedPreset(sf.elements.rssUrl.value); });
  document.getElementById('sSleep').addEventListener('click', () => { closeSettings(); enterSleep(); });
  document.getElementById('sShare').addEventListener('click', async () => {
    showRemoteUrls();
    const txt = 'Mission Control remote sleep\n' + document.getElementById('remoteUrls').textContent;
    const info = document.getElementById('sInfo');
    try {
      if (navigator.share) { await navigator.share({ title: 'Mission Control remote', text: txt }); return; }
      await navigator.clipboard.writeText(txt); info.textContent = 'URLs copied to clipboard.';
    } catch (e) { if (e && e.name !== 'AbortError') info.textContent = 'Could not share - long-press the URLs to copy them.'; }
  });
  /* ---------- settings backup link: #cfg=<base64url JSON>; the part after # never reaches a server ---------- */
  const b64e = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (x) => { x = x.replace(/-/g, '+').replace(/_/g, '/'); while (x.length % 4) x += '='; return decodeURIComponent(escape(atob(x))); };
  function backupLink() { return location.origin + location.pathname + '#cfg=' + b64e(JSON.stringify(S)); }
  function sanitizeSettings(o) {
    const out = {};
    for (const k in DEFAULTS) {
      if (!(k in o)) continue;
      const dv = DEFAULTS[k], v = o[k];
      if (dv && typeof dv === 'object') {
        if (v && typeof v === 'object') { out[k] = {}; for (const kk in dv) if (kk in v && typeof v[kk] === typeof dv[kk]) out[k][kk] = v[kk]; }
      } else if (typeof v === typeof dv) out[k] = v;
    }
    return out;
  }
  function checkRestoreLink() {
    const hsh = location.hash;
    if (!hsh.startsWith('#cfg=')) return;
    let o = null;
    try { o = JSON.parse(b64d(hsh.slice(5))); } catch (e) { o = null; }
    history.replaceState(null, '', location.pathname + location.search);
    if (!o || typeof o !== 'object') return;
    if (!window.confirm('Restore Mission Control settings from this backup link? This replaces the settings on this phone.')) return;
    LS.set('mc.settings', Object.assign({}, S, sanitizeSettings(o)));
    location.reload();
  }
  async function shareText(title, txt, okMsg) {
    const info = document.getElementById('sInfo');
    try {
      if (navigator.share) { await navigator.share({ title, text: txt }); return; }
      await navigator.clipboard.writeText(txt); info.textContent = okMsg;
    } catch (e) { if (e && e.name !== 'AbortError') info.textContent = 'Could not share - try again.'; }
  }
  document.getElementById('sBackup').addEventListener('click', () => shareText('Mission Control settings backup', backupLink(), 'Backup link copied. It contains your Last.fm key - keep it private.'));
  document.getElementById('sInstall').addEventListener('click', async () => {
    if (!installEvt) return;
    const ev = installEvt; installEvt = null;
    try { await ev.prompt(); } catch (e) { /* dismissed */ }
    document.getElementById('sInstall').hidden = true;
  });
  document.getElementById('sCancel').addEventListener('click', closeSettings);
  document.getElementById('sClear').addEventListener('click', () => {
    for (const k in SRC) resetSource(k);
    document.getElementById('sInfo').textContent = 'Cached data cleared.';
  });
  function resetSource(k) {
    LS.del(CK + k);
    Object.assign(ST[k], { data: null, ts: 0, fails: 0, err: '', next: 0, tried: false });
    ST[k].ver++; ST[k].gen = (ST[k].gen || 0) + 1;
  }

  /* ============================================================ lifecycle */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopPreview(); stop(); return; }
    if (sleeping) { exitSleep(); remoteConnect(false); return; } // screen was woken (double-tap / power key)
    requestWake(); schedTick(); start(); remoteConnect(false);
  });
  let rsT = 0;
  window.addEventListener('resize', relayoutSoon);
  window.addEventListener('online', () => { for (const k in SRC) if (ST[k].fails) ST[k].next = 0; schedTick(); remoteConnect(true); forceDraw = true; });
  window.addEventListener('offline', () => { remoteConnect(true); forceDraw = true; });

  resize();
  rebuildPages();
  start();
  schedTick();
  setInterval(schedTick, 1000);
  requestWake();
  remoteConnect(true);
  checkRestoreLink();

  if ('serviceWorker' in navigator && !isNative() && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js')
        .then((reg) => setInterval(() => reg.update().catch(() => {}), 3600e3)) // always-on: look for updates hourly
        .catch(() => { /* offline shell unavailable */ });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { // a new version took over
        if (!hadController || reloading) return;                          // (first install: nothing to refresh)
        reloading = true;
        const go2 = () => { if (settingsOpen || player.state !== 'idle' || banner) { setTimeout(go2, 30e3); return; } location.reload(); };
        go2();
      });
    });
  }
  // test hook (harmless in production): lets the verifier jump to a page
  window.__mc = { go: (id) => { const i = pages.indexOf(id); if (i >= 0) { cur = i; trans = null; dwellAcc = 0; paused = true; forceDraw = true; } }, state: ST, pages: () => pages.slice(), drawn: () => drawnFrames, sleeping: () => sleeping, remote: () => remoteState, mode: LAUNCH_MODE, cmd: (m) => handleRemote(m), player: () => ({ state: player.state, err: player.err, t: player.audio ? player.audio.currentTime : 0, peak: Math.max(...peakLv) }), art: () => artMem.size, alerts: () => alertsNow(Date.now()), banner: () => !!banner, current: () => pages[trans ? trans.to : cur] };
})();
