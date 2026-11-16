/* Mission Control ticker - vanilla JS, canvas only, no dependencies.
 * Everything visible is drawn with a 5x7 dot-matrix font onto <canvas>.
 * Page content is cached in offscreen layers and only redrawn when its
 * inputs change; the frame loop is capped at 30 fps and skips frames
 * when nothing moved. */
'use strict';
(function () {
  const APP_VERSION = '1.3.0';
  const SLIDE_MS = 520;
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
    { id: 'map', title: 'WORLD' },
    { id: 'fx', title: 'FX RATES' },
    { id: 'weather', title: 'WEATHER' },
    { id: 'news', title: 'HEADLINES' },
    { id: 'releases', title: 'NEW RELEASES' },
    { id: 'otd', title: 'ON THIS DAY' },
    { id: 'countdown', title: 'COUNTDOWN' },
    { id: 'credits', title: 'CREDITS' }
  ];
  const DEFAULTS = {
    relArtists: 'Anirudh Ravichander, Sai Abhyankkar',
    rssUrl: 'https://www.business-standard.com/rss/markets-106.rss', rssProxy: '', rssDirect: false,
    cdName: 'TRAIN TRIP', cdDate: '',
    palette: 'vfd', dwell: 6, notchMargin: 28,
    remoteOn: true, remoteTopic: '',
    fxAlerts: { usdinr: '', sgdinr: '' },
    pages: { clock: true, bus: true, map: true, fx: true, weather: true, news: true, releases: true, otd: true, countdown: true, credits: true }
  };
  function loadSettings() {
    const s = Object.assign({}, DEFAULTS, LS.get('mc.settings', {}));
    s.pages = Object.assign({}, DEFAULTS.pages, s.pages || {});
    s.fxAlerts = Object.assign({}, DEFAULTS.fxAlerts, s.fxAlerts || {});
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
  const feedReady = () => !!S.rssUrl && (isNative() || !!S.rssProxy || S.rssDirect);

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
    snow: '...oo.... ..oooo.o. .oooooooo ooooooooo .ooooooo. ......... .#..#..#. ......... ..#..#..#'
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
  const KNOWN_ARTISTS = { 'anirudh ravichander': 480976476, 'sai abhyankkar': 1652280551 };
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const BUS_STOPS = [
    { code: '16081', name: 'PALM GREEN', lat: 1.29196, lng: 103.76866 },
    { code: '16089', name: 'CLEMENTI RD', lat: 1.29201, lng: 103.76908 }
  ];
  const fmtDate = (d) => d.toISOString().slice(0, 10);
  const SRC = {
    iss: {
      every: 10e3, retry: 10e3, timeout: 8e3,
      on: () => S.pages.map,
      url: () => 'https://api.wheretheiss.at/v1/satellites/25544',
      parse(j, prev) {
        if (typeof j.latitude !== 'number') throw new Error('BAD DATA');
        const t = j.timestamp * 1000;
        const trail = ((prev && prev.trail) || []).filter((p) => p.t > t - 10 * 60e3 && p.t < t);
        trail.push({ t, lat: j.latitude, lon: j.longitude });
        return { lat: j.latitude, lon: j.longitude, alt: j.altitude, vel: j.velocity, vis: j.visibility, t, trail };
      }
    },
    quakes: {
      every: 300e3, retry: 30e3, timeout: 15e3,
      on: () => S.pages.map,
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
        '&hourly=temperature_2m,precipitation_probability&forecast_hours=7' +
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
            h: String(t).slice(11, 13), temp: o.hourly.temperature_2m[k + 1], pp: o.hourly.precipitation_probability[k + 1]
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
    otd: {
      every: 6 * 3600e3, retry: 60e3, timeout: 15e3,
      on: () => S.pages.otd,
      url: () => { const d = new Date(); return 'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()); },
      parse(j) {
        if (!j || !Array.isArray(j.selected)) throw new Error('BAD DATA');
        return { date: todayKey(), items: j.selected.filter((x) => x && x.text).slice(0, 30).map((x) => ({ year: x.year, text: x.text })) };
      }
    },
    news: {
      every: 600e3, retry: 30e3, timeout: 15e3, text: true,
      on: () => S.pages.news && feedReady(),
      url() {
        const u = S.rssUrl.trim();
        if (isNative() || S.rssDirect || !S.rssProxy) return u;
        const p = S.rssProxy.trim();
        return p.indexOf('{url}') >= 0 ? p.replace('{url}', encodeURIComponent(u)) : p + encodeURIComponent(u);
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
    const s = SRC[k], st = ST[k];
    st.busy = true; st.tried = true;
    try {
      const u = s.fetch ? null : s.url();
      const raw = s.fetch ? await s.fetch() : Array.isArray(u) ? await Promise.all(u.map((x) => fetchWithTimeout(x, s.timeout, s.text)))
        : await fetchWithTimeout(u, s.timeout, s.text);
      const data = s.parse(raw, st.data);
      st.data = data; st.ts = Date.now(); st.fails = 0; st.err = '';
      LS.set(CK + k, { data, ts: st.ts });
      st.next = Date.now() + s.every;
    } catch (e) {
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
    const od = ST.otd;
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
    layers.clear(); mapBase = null; mmImg = null; newsCache.clear(); hdr.key = ftr.key = null;
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

  /* ---------- On this day (Wikipedia) ---------- */
  function drawOtd(g, w, h, now) {
    const st = status('otd', now), od = ST.otd.data;
    const bottom = statusLine(g, w, h, 'WIKIPEDIA · CC BY-SA 4.0', st);
    const head = new Date(now).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    if (!od || od.date !== todayKey() || !od.items.length) {
      text(g, head, w / 2, L.pad * 2, L.s2, PAL.accent, 'center');
      centerMsg(g, w, bottom, ST.otd.fails ? 'NO DATA' : 'LOADING', ST.otd.err);
      return;
    }
    const it = od.items[Math.floor(now / 600e3) % od.items.length]; // a different event every 10 min
    const avail = bottom - L.pad * 2, inner = w - L.pad * 2;
    let tp = L.s1, lines = [];
    for (const cand of [L.s3, L.s2, L.s1]) {
      lines = wrap(it.text, Math.floor((inner + cand) / (6 * cand)), 12);
      tp = cand;
      if (lines.length * LH * cand <= avail * 0.55) break;
    }
    const textH = lines.length * LH * tp;
    const ys = String(it.year);
    const Py = fitP(Math.max(4, ys.length), w * 0.7, Math.max(L.s2 * 7, avail - textH - th(L.s2) - L.pad * 3) , L.s3 * 3);
    const total = th(L.s2) + L.pad + th(Py) + L.pad * 1.5 + textH;
    let y = Math.max(L.pad, Math.round((bottom - total) / 2));
    text(g, head, w / 2, y, L.s2, PAL.accent, 'center'); y += th(L.s2) + L.pad;
    text(g, ys, w / 2, y, Py, PAL.main, 'center', true); y += th(Py) + L.pad * 1.5;
    for (const ln of lines) { text(g, ln, w / 2, y, tp, PAL.main, 'center'); y += LH * tp; }
  }

  /* ---------- 2. world map ---------- */
  // Simplified coastlines as [lon,lat,...] rings (hand-reduced, ~1-3 deg accuracy).
  const LAND = [
    // North America
    [-168,65,-162,70,-156,71.3,-140,69.6,-128,70,-115,68.5,-95,72,-82,73,-78,68,-90,64,-94,59,-86,55.5,-80,52,-78,58,-77,62,-70,61,-64,60,-61,56,-56,52,-60,47,-66,45,-70,43,-70,41.5,-74,40.5,-76,38,-76,35,-81,31.5,-80,27,-80.5,25.2,-82,26.5,-83,29.8,-89,30.2,-94,29.5,-97,27.8,-97.5,24,-97.8,22,-95,18.5,-91,18.7,-90.5,21,-87,21.5,-88,16,-84,15,-83.5,11,-81.5,9,-79,9.5,-77.3,8.5,-78,7.2,-80,7.4,-83,8.3,-86,11,-87.5,13,-92,14.5,-95,16,-98,16,-105,19.5,-106,23,-109.5,26.5,-112.5,29,-114.8,31.5,-113,29,-110,23,-112,25,-114,28,-115,30,-117,32.5,-120.5,34.5,-122.5,37.5,-124,40,-124.5,43,-124,46,-124.7,48.4,-123,49,-127,50.5,-130,54,-133,57,-137,58.5,-140,59.8,-146,60.5,-152,59,-154,57.5,-158,56,-163,54.6,-158,58,-162,58.7,-166,61.5,-165,63,-168,65],
    // Greenland
    [-73,78,-60,82,-30,83.5,-20,82,-18,77,-22,72,-24,69,-32,68,-40,65,-43,60,-48,61,-52,64.5,-54,68,-56,72,-66,76,-73,78],
    // Baffin, Arctic archipelago
    [-80,73.5,-72,72,-62,67,-65,63,-72,62.5,-78,64.5,-75,68,-82,70,-80,73.5],
    [-120,74,-100,73,-90,76,-80,77,-65,82,-90,82,-110,78,-122,76,-120,74],
    // Cuba, Hispaniola
    [-84.9,21.9,-82,23.2,-80,23,-77,21.6,-74.2,20.2,-77.7,19.9,-78.5,21.5,-81.8,22.2,-84.9,21.9],
    [-74.4,18.4,-72.8,19.9,-70,19.7,-68.4,18.6,-71,18.2,-74.4,18.4],
    // South America
    [-77,8.5,-75,11,-71.5,12.4,-68,10.6,-62,10.7,-60,8.5,-57,6,-52,5,-50,1.5,-48,-1,-44,-2.5,-39,-3.5,-35,-5.5,-35,-9,-37,-12,-39,-15,-39.5,-18,-41,-22,-44,-23,-48,-26,-49,-29,-53,-33.5,-55,-35,-57.5,-35,-57,-37,-62,-39,-65,-41,-63.5,-42.5,-65.5,-45,-67.5,-46.5,-66,-48,-69,-51,-68.5,-52.5,-69.5,-55,-72,-54,-75,-52,-74.5,-48,-74,-44,-73.5,-40,-73.5,-37,-71.5,-32,-71.3,-28,-70.5,-23,-70.2,-18.5,-75,-15.5,-77,-12,-79.5,-7.5,-81.2,-5.5,-80,-3,-80.5,-0.5,-79.5,1,-78.5,2.5,-77.5,4,-77.3,7,-77,8.5],
    // Eurasia
    [-9.3,38.7,-8.9,42,-9.3,43.2,-8,43.7,-1.8,43.4,-1.2,46,-2.3,47.2,-4.7,48,-1.6,48.7,1.5,50,3,51.2,4.5,52.5,7,53.5,8.6,53.9,8.5,55.5,8.1,56.9,10.5,57.7,10.8,56.3,12.5,55.6,10.9,54.4,14,54,18,54.8,21,55.2,21.2,56.8,23.8,57.4,24.3,59.4,28.5,59.7,30,60.2,23,60,21.4,60.9,21.5,62.6,25,65,25.3,65.4,22,65.7,21.5,64.5,17.8,62.5,18.5,60,17,58.5,16,56.2,14.5,56.2,12.6,56.2,11,58.7,8,58.1,5.6,58.9,5,61,5.3,62.5,8,63.5,11,64.6,13,67,15,68.5,18,69.7,21,70.2,25,71.1,28.5,71,31,70,33,69.5,36.5,69,40.5,67.5,41,66.3,38,66,33.5,66.5,34.7,65,36.5,64.6,37.5,64,40,64.5,44,66,44,68.4,46,68,53,68.6,57,68.6,60,69.8,65,69,68.5,68.2,66.7,69.8,67,71,69,73,72.5,72.8,72.5,71,73.5,68.5,78,72,80.5,73.5,87,74,86.7,75.1,95,76,100,79,104,77.7,106,77,113,76,113.5,73.5,119,73,127,73.5,129,71,132,71.8,140,72.4,146,72.3,150,71.5,153,70.9,160,70.6,161,69.5,168,70,175,69.8,180,69,180,65,178.5,64.6,177,62.5,173,61.2,170,60,166,60.3,163.5,59.9,162,58,163,56.2,162,54.8,160,53,158.5,52,156.7,51,156,53.5,155.5,57,156.7,57.8,159,58.5,161.8,60.3,160,61.5,156.5,61.6,154,59.5,151,59.2,145,59.3,142,59,138,56.6,135.2,54.7,137.2,54,139,54.2,141.3,53,141.2,51.7,140,48.5,138,46.5,135,43.5,133,42.8,130.7,42.3,129.7,41,128,39.8,129.4,37,129.3,35.2,126.5,34.5,126.3,36.7,126.2,37.7,125,37.7,124.7,39.6,121.6,38.9,121.2,40.8,118,39.2,119,37.2,122.5,37.4,120.3,36,119.2,34.6,120.7,32.5,121.9,31.6,121.9,30,121.4,28.3,119.6,25.7,117.3,23.6,114,22.3,111,21.5,110.4,20.3,109.5,21.6,108,21.6,106.7,20.6,105.7,19,106.6,17.5,108.8,15.4,109.3,12,107,10.4,105,8.7,104.8,10.3,103,11,101,12.7,100,13.4,99.2,10.5,100.3,8.4,101.3,6.9,103,5.5,103.5,1.4,101.3,2.6,100.3,5,98.3,7.9,98.5,12,97.7,16.5,96.3,16.8,94.3,16.2,94.4,18.8,93,20,92,21.5,90.5,22,89,21.8,87,21.5,86.9,20.6,85,19.4,82.2,16.6,80.2,15.5,80.2,13,79.8,10.3,78.2,8.9,77.5,8,76.5,8.9,75.7,11.3,74.8,12.8,73.5,15.9,72.8,19.2,72.6,21.3,70.5,20.8,69,22.4,70.2,22.8,68.5,23.5,67,24.7,66.5,25.4,64.5,25.2,61.5,25.1,57.4,25.7,56.4,27.1,54.7,26.5,51.5,27.9,50,30,48,30,48.8,27.6,50.1,26.7,51.5,24.5,54,24.1,56,26,56.4,24.8,58.6,23.6,59.8,22.4,57.8,19,55,17,52,15.9,49.5,14.5,45,12.8,43.5,12.7,42.7,15.7,41.2,19,39,21.5,38.6,24,35.2,28,34.7,29.5,34.2,31.3,34.9,32.8,35.9,35.5,36.2,36.6,34.5,36.8,32.5,36.1,30.5,36.3,29,36.7,27.3,37,26.3,38.3,26.8,39.5,26.2,40.6,28.8,41,29.2,41.2,31.3,41.1,33.5,42,35.2,42,38.3,40.9,41.5,41.5,41.5,42.6,39.9,43.4,38,44.4,39.2,47.2,35,45.5,36.5,45.2,33.5,44.5,32.5,45.3,33.5,46,31.7,46.3,30.7,46.6,29.6,45.3,28.7,44.3,27.7,42.5,28,41.6,26.4,41.2,23.6,40.1,22.6,40.3,23.3,39.2,22.7,37.5,21.7,36.8,21.1,38.3,19.4,40.3,19.4,41.8,16,43.5,13.6,45.4,12.3,45.3,12.4,44,14,42.4,16,41.4,18.5,40.2,16.8,38.9,15.6,38,16.2,39,15.7,40,14.2,40.8,12.3,41.7,10.5,42.9,8.8,44.4,7.5,43.8,6.2,43.1,4.6,43.4,3.1,43.1,3.2,42,0.8,41,-0.3,39.5,0.2,38.7,-0.7,37.6,-2.1,36.7,-4.4,36.7,-5.6,36,-6.3,36.8,-7.5,37.2,-8.9,37,-9.3,38.7],
    // British Isles, Iceland, Svalbard, Novaya Zemlya
    [-5.7,50,1.4,51.2,1.7,52.7,0.2,53.5,-1.6,55.6,-2,57.6,-3.3,58.6,-5,58.6,-6.2,57.5,-5.6,56,-4.9,54.8,-3.2,54.2,-3,53.4,-4.5,53.2,-4.2,52.2,-5.2,51.7,-3.3,51.4,-5.7,50],
    [-6,52.2,-6.2,53.9,-5.6,54.6,-7.3,55.3,-8.5,54.4,-10,54.2,-9.5,52.5,-10.3,51.6,-8,51.6,-6,52.2],
    [-24,65.5,-22,66.4,-18,66.2,-14.5,66.3,-13.6,65,-15,64.3,-18.7,63.4,-22.5,63.8,-24,65.5],
    [11,78.5,15,77,19,76.6,22,78,27,80,20,80.5,11,79.8,11,78.5],
    [52,71.5,55,70.6,57.5,70.7,56,72.5,60,75.5,68,77,64,75.5,55,73.5,52,71.5],
    // Africa, Madagascar
    [-5.9,35.8,-2,35.1,1,36.5,3,36.8,8.5,36.9,10.3,37.2,11,36.8,10.2,35,11,33.5,13,32.9,15.3,32.3,19,30.3,20,31,20,32.5,23,32.7,25,31.6,29,30.9,32,31.3,34.2,31.3,34.9,29.5,32.5,29.9,33.8,27.3,35.5,24,37.2,21,37.4,18.5,38.6,17.9,39.7,15.5,41.2,14.5,43.3,12.5,44,10.5,45.8,10.8,49,11.3,51.2,11.8,51,10.4,50.5,9,49,6,47.8,4.2,45.5,2,43,-0.5,41.5,-1.8,40,-3.3,39.2,-4.7,39.5,-6.5,39.3,-8,40.4,-10.5,40.5,-15,39.5,-16.8,36.8,-18,35.3,-21.5,35.5,-24,33,-25.5,32.8,-28.5,31,-29.9,28,-33,25.7,-34,22.6,-34,20,-34.8,18.4,-34.2,18.2,-32,17.2,-29,15.2,-27,14.4,-22.5,11.8,-17.3,11.8,-15.8,13.6,-12,13.2,-9.2,12.3,-6.1,11.8,-4.5,9.6,-2.3,9.3,0.5,9.8,3,8.5,4.5,6,4.3,4.5,6.3,2,6.3,-2,4.8,-4.5,5.2,-7.5,4.4,-9.5,5.5,-11.5,6.9,-13.3,8.6,-15,11,-16.7,12.5,-17.4,14.7,-16.5,16.5,-16.2,19.3,-17,21,-15,24.5,-13.5,26.8,-11.5,28.2,-9.8,29.5,-9.7,31.6,-8.5,33.4,-6.8,34,-5.9,35.8],
    [49.3,-12,50.5,-15.5,49.5,-17.5,48,-22,47,-25,45,-25.5,43.5,-22,44.3,-19,44,-17,46,-15.7,48,-13.5,49.3,-12],
    // Japan, Sakhalin, Taiwan, Hainan, Sri Lanka
    [130,31,131.3,31.4,132,33.8,134.7,33.8,136,34,137,34.6,139,34.8,140,35.2,140.8,36,141,38,142,39.5,141.4,41.4,140,41.5,139.9,40.5,139.5,38.2,137.3,36.8,136.8,37.3,136,35.6,133,35.5,131,34.4,130,33.3,130,31],
    [140,41.5,141.7,42.6,143.3,42,145.5,43.3,145,44.3,142,45.5,141.6,45,141.3,43.2,140,42.6,140,41.5],
    [142,46,143.5,46.5,143,49,144.7,49,143,54,142.4,54.3,141.8,52,142.2,47,142,46],
    [120.1,23,121,25.3,122,25,121,22,120.1,23],
    [108.6,19.2,110.5,20.1,111,19.6,110,18.2,108.6,19.2],
    [79.8,9.8,81.9,7.5,81.2,6.1,80,6,79.8,9.8],
    // Philippines
    [120.6,18.5,122.3,18.5,122,16,121.6,14.2,124,13,123,13,120.6,14.2,119.8,16.3,120.6,18.5],
    [122,11.5,124,12.5,125.5,11,124.5,10,122.5,9.5,122,11.5],
    [122,7,124,9,126,9.3,126.6,7,125.4,5.7,124,6.3,122,7],
    // Indonesia, New Guinea
    [109,1.6,110,1.7,111.8,2.8,113.2,3.2,115.5,5.3,116.8,7,118.5,5.5,119.2,5,118,4.3,118,2.2,119,1,117.8,0.9,117.5,-0.8,116.6,-2,116,-3.8,114.5,-3.5,111.7,-3,110.2,-3,110,-1.5,109,0,109,1.6],
    [95.2,5.6,97.5,5.2,100.4,2.3,103.8,-1,106,-3,105.8,-5.8,104.5,-5.9,102.3,-4,100.3,-1,98.6,1.7,96.4,3.8,95.2,5.6],
    [105.2,-6.8,106,-5.9,108.3,-6.2,110.5,-6.9,112.6,-6.9,114.5,-7.7,114.4,-8.7,111,-8.2,108,-7.8,105.2,-6.8],
    [119.4,-5.5,120.5,-5.6,121,-2.7,122.6,-4.5,123.3,-1,121,-1.3,123,0.9,125,1.5,120.5,0.6,119.8,0,118.8,-2.8,119.4,-5.5],
    [131,-1.4,134,-0.8,135,-3.3,138,-1.7,141,-2.6,145,-4.2,146,-5.4,147.6,-6.1,147,-7.8,149,-9.6,150.8,-10.3,148,-10.2,146,-8.2,144,-7.7,143,-9.3,141,-9.1,139,-8.1,138,-7.7,138.7,-6.8,137.8,-5.1,135,-4.4,133.5,-3.6,132,-2.8,131,-1.4],
    // Australia, Tasmania, New Zealand
    [113.4,-22,114.2,-21.8,116.7,-20.6,121,-19.5,122.3,-17.2,124,-16.3,125.7,-14.4,127.8,-14.3,129.6,-14.9,130.3,-12.7,132.6,-11.5,135,-12.2,136.9,-12.2,135.9,-13.4,135.4,-15,137.2,-15.9,139.3,-17.4,140.8,-17.4,141.6,-15,141.6,-12.6,142.5,-10.7,143.3,-12,143.5,-14.2,145.3,-15,146.2,-18.8,148.8,-20.4,150.8,-22.5,153.1,-25.2,153.6,-28.6,153,-31,151.3,-33.8,150,-37.4,147.8,-37.9,146.3,-39.1,144.9,-37.9,143.6,-38.8,140.6,-38,139.6,-37.2,139.4,-35.6,138.1,-35.6,138.5,-34.4,137.8,-32.9,137.5,-34,136,-35,136,-34,135.2,-34.6,134.2,-32.8,131.3,-31.5,128,-32.2,124.4,-33.3,123,-33.9,119.9,-34,117.9,-35.1,115,-34.3,115.7,-31.9,115,-29.5,114.2,-26.3,113.4,-24.4,113.4,-22],
    [144.6,-40.7,148.3,-40.9,148,-43,146.8,-43.6,145.2,-42.4,144.6,-40.7],
    [172.7,-34.4,174.4,-35.6,176,-37.6,178.5,-37.7,177.9,-39.1,176.8,-40,175.2,-41.6,174.6,-41.2,175,-39.6,173.8,-39.3,174.6,-38,172.7,-34.4],
    [172.7,-40.5,174.3,-41.6,173.3,-43,172.7,-43.8,171.2,-44.4,170.6,-45.9,169,-46.6,166.5,-46,166.8,-45.2,168.4,-44,170.8,-42.8,172,-41.3,172.7,-40.5],
    // Antarctica (crude; south of the flat map's range, shown on the globe)
    [-180,-90,180,-90,180,-78,165,-77,165,-71,150,-68,120,-66,90,-66,60,-67,30,-69,0,-70,-20,-73,-45,-77,-60,-73,-58,-63,-65,-66,-75,-71,-100,-73,-130,-74,-150,-77,-180,-78,-180,-90]
  ].map((pts) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
    }
    return { pts, x0, x1, y0, y1 };
  });
  const LAT_TOP = 82, LAT_BOT = -62;
  const HOMES = [{ name: 'SIN', lat: 1.3521, lon: 103.8198, side: 1 }, { name: 'BLR', lat: 12.9716, lon: 77.5946, side: -1 }];
  function inLand(lon, lat) {
    for (const poly of LAND) {
      if (lon < poly.x0 || lon > poly.x1 || lat < poly.y0 || lat > poly.y1) continue;
      const p = poly.pts; let inside = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const yi = p[i + 1], yj = p[j + 1];
        if ((yi > lat) !== (yj > lat) && lon < ((p[j] - p[i]) * (lat - yi)) / (yj - yi) + p[i]) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }
  /* Sub-solar point (low-precision almanac), for the day/night shading. */
  function subsolar(ts) {
    const rad = Math.PI / 180;
    const n = (ts - Date.UTC(2000, 0, 1, 12)) / 864e5;
    const Lm = (280.46 + 0.9856474 * n) % 360;
    const gm = ((357.528 + 0.9856003 * n) % 360) * rad;
    const lam = (Lm + 1.915 * Math.sin(gm) + 0.02 * Math.sin(2 * gm)) * rad;
    const eps = (23.439 - 4e-7 * n) * rad;
    const decl = Math.asin(Math.sin(eps) * Math.sin(lam));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    let eot = Lm * rad - ra;
    eot = Math.atan2(Math.sin(eot), Math.cos(eot)) / rad * 4; // minutes
    const utcMin = (((ts % 864e5) + 864e5) % 864e5) / 6e4;
    let lon = 180 - (utcMin + eot) / 4;
    lon = ((lon + 540) % 360) - 180;
    return { lat: decl / rad, lon };
  }
  let mapBase = null; // {key, c, mask, cols, rows}
  function getMapBase(mw, mh, now) {
    const minute = Math.floor(now / 60e3);
    const key = mw + 'x' + mh + '|' + minute + '|' + S.palette;
    if (mapBase && mapBase.key === key) return mapBase.c;
    let mask, cols, rows;
    if (mapBase && mapBase.mw === mw && mapBase.mh === mh) { mask = mapBase.mask; cols = mapBase.cols; rows = mapBase.rows; }
    else {
      const sp = Math.max(4, Math.round(mw / 200));
      cols = Math.floor(mw / sp); rows = Math.floor(mh / sp);
      mask = new Uint8Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        const lat = LAT_TOP - ((r + 0.5) * (LAT_TOP - LAT_BOT)) / rows;
        for (let c = 0; c < cols; c++) mask[r * cols + c] = inLand(-180 + ((c + 0.5) * 360) / cols, lat) ? 1 : 0;
      }
    }
    const c = (mapBase && mapBase.c && mapBase.c.width === mw && mapBase.c.height === mh) ? mapBase.c : mkCanvas(mw, mh);
    const g = c.getContext('2d'); g.clearRect(0, 0, mw, mh);
    const sx = mw / cols, sy = mh / rows, rad = Math.PI / 180;
    const sun = subsolar(now), sl = Math.sin(sun.lat * rad), cl = Math.cos(sun.lat * rad);
    const day = new Path2D(), dusk = new Path2D(), night = new Path2D(), sea = new Path2D();
    const rL = Math.min(sx, sy) * 0.36, rS = Math.min(sx, sy) * 0.14;
    for (let r = 0; r < rows; r++) {
      const lat = LAT_TOP - ((r + 0.5) * (LAT_TOP - LAT_BOT)) / rows;
      const sla = Math.sin(lat * rad), cla = Math.cos(lat * rad);
      const y = (r + 0.5) * sy;
      for (let k = 0; k < cols; k++) {
        const x = (k + 0.5) * sx;
        if (!mask[r * cols + k]) { sea.moveTo(x + rS, y); sea.arc(x, y, rS, 0, Math.PI * 2); continue; }
        const lon = -180 + ((k + 0.5) * 360) / cols;
        const cz = sla * sl + cla * cl * Math.cos((lon - sun.lon) * rad);
        const path = cz > 0.05 ? day : cz > -0.1 ? dusk : night;
        path.moveTo(x + rL, y); path.arc(x, y, rL, 0, Math.PI * 2);
      }
    }
    g.fillStyle = PAL.main; g.globalAlpha = 0.09; g.fill(sea);
    g.fillStyle = PAL.land; g.globalAlpha = 0.95; g.fill(day);
    g.globalAlpha = 0.6; g.fill(dusk);
    g.globalAlpha = 0.33; g.fill(night);
    g.globalAlpha = 1;
    mapBase = { key, c, mask, cols, rows, mw, mh };
    return c;
  }
  const RAD = Math.PI / 180;
  function mapGeom(w, h) {
    const pad = L.pad, bottom = h - (LH * L.s1 * 2 + pad);
    if (L.portrait) {
      const R = Math.floor(Math.min(w - pad * 2, bottom - pad * 2) / 2);
      const iss = ST.iss.data;
      const c = iss ? { lat: iss.lat, lon: iss.lon } : { lat: 1.35, lon: 103.82 };
      return { globe: true, cx: Math.round(w / 2), cy: Math.round(pad + (bottom - pad) / 2), R, c };
    }
    let mw = w - pad * 2, mh = Math.round(mw / 2.5);
    if (mh > bottom - pad) { mh = bottom - pad; mw = Math.round(mh * 2.5); }
    return { globe: false, mx: Math.round((w - mw) / 2), my: Math.round(pad / 2 + (bottom - pad / 2 - mh) / 2), mw, mh };
  }
  const proj = (G, lon, lat) => [
    G.mx + ((lon + 180) / 360) * G.mw,
    G.my + ((LAT_TOP - Math.max(LAT_BOT, Math.min(LAT_TOP, lat))) / (LAT_TOP - LAT_BOT)) * G.mh
  ];
  /* Flat map or orthographic globe; returns null for points on the far side of the globe. */
  function project(G, lon, lat) {
    if (!G.globe) return proj(G, lon, lat);
    const p0 = G.c.lat * RAD, p = lat * RAD, dl = (lon - G.c.lon) * RAD;
    const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
    if (cosc < 0) return null;
    return [G.cx + G.R * Math.cos(p) * Math.sin(dl), G.cy - G.R * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl))];
  }
  let globeGrid = null;
  function getGlobeGrid() { // land/sea dots at ~1.5 deg, thinned towards the poles; computed once
    if (globeGrid) return globeGrid;
    const lat = [], lon = [], land = [];
    for (let la = -88.5; la <= 88.6; la += 1.5) {
      const step = Math.min(30, 1.5 / Math.max(0.05, Math.cos(la * RAD)));
      for (let lo = -180 + step / 2; lo < 180; lo += step) { lat.push(la); lon.push(lo); land.push(inLand(lo, la) ? 1 : 0); }
    }
    globeGrid = { lat: Float32Array.from(lat), lon: Float32Array.from(lon), land: Uint8Array.from(land) };
    return globeGrid;
  }
  function drawGlobe(g, G, now) {
    const gr = getGlobeGrid(), sun = subsolar(now), sl = Math.sin(sun.lat * RAD), cl = Math.cos(sun.lat * RAD);
    const p0 = G.c.lat * RAD, sp0 = Math.sin(p0), cp0 = Math.cos(p0);
    const dot = G.R * 1.5 * RAD, rL = dot * 0.36, rS = dot * 0.14;
    const day = new Path2D(), dusk = new Path2D(), night = new Path2D(), sea = new Path2D();
    for (let i = 0; i < gr.lat.length; i++) {
      const p = gr.lat[i] * RAD, dl = (gr.lon[i] - G.c.lon) * RAD;
      const sp = Math.sin(p), cp = Math.cos(p), cdl = Math.cos(dl);
      const cosc = sp0 * sp + cp0 * cp * cdl;
      if (cosc <= 0.02) continue;
      const x = G.cx + G.R * cp * Math.sin(dl), y = G.cy - G.R * (cp0 * sp - sp0 * cp * cdl);
      const k = 0.45 + 0.55 * cosc; // dots shrink towards the limb
      if (!gr.land[i]) { const r = rS * k; sea.moveTo(x + r, y); sea.arc(x, y, r, 0, Math.PI * 2); continue; }
      const cz = sp * sl + cp * cl * Math.cos((gr.lon[i] - sun.lon) * RAD);
      const path = cz > 0.05 ? day : cz > -0.1 ? dusk : night, r = rL * k;
      path.moveTo(x + r, y); path.arc(x, y, r, 0, Math.PI * 2);
    }
    g.fillStyle = PAL.main; g.globalAlpha = 0.1; g.fill(sea);
    g.fillStyle = PAL.land; g.globalAlpha = 0.95; g.fill(day);
    g.globalAlpha = 0.6; g.fill(dusk);
    g.globalAlpha = 0.33; g.fill(night);
    g.globalAlpha = 0.5; g.strokeStyle = PAL.dim; g.lineWidth = Math.max(1, L.s1 * 0.3);
    g.beginPath(); g.arc(G.cx, G.cy, G.R + L.s1, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  }
  function drawMap(g, w, h, now) {
    const G = mapGeom(w, h);
    const qd = ST.quakes.data, list = qd ? qd.list.filter((q) => now - q.t <= 864e5) : [];
    const stI = status('iss', now), stQ = status('quakes', now);
    const st = stI.stale || stI.none ? stI : stQ;
    statusLine(g, w, h, (qd ? list.length + ' QUAKES M4.5+ · 24H' : 'QUAKES --') + ' · USGS · WHERETHEISS.AT', st);
    if (G.globe) drawGlobe(g, G, now);
    else g.drawImage(getMapBase(G.mw, G.mh, now), G.mx, G.my);
    const lp = Math.max(2, L.s1 - 1);
    for (const hm of HOMES) {
      const xy = project(G, hm.lon, hm.lat); if (!xy) continue;
      const [x, y] = xy;
      if (hm.side > 0) text(g, hm.name, x + lp * 3, y + lp, lp, PAL.home);
      else text(g, hm.name, x - lp * 3, y - th(lp) - lp, lp, PAL.home, 'right');
    }
  }
  function dynMap(g, w, h, now, ts) {
    const G = mapGeom(w, h);
    const pulse = (ts % 2000) / 2000;
    const u = Math.max(2, L.s1);
    const qd = ST.quakes.data;
    if (qd) {
      for (const q of qd.list) {
        if (now - q.t > 864e5) continue;
        const xy = project(G, q.lon, q.lat); if (!xy) continue;
        const [x, y] = xy;
        const base = u * (0.8 + (q.mag - 4.5) * 0.9);
        const fresh = now - q.t < 3 * 3600e3;
        const ph = fresh ? pulse : 0.15;
        g.strokeStyle = PAL.quake; g.lineWidth = Math.max(1, u * 0.4);
        g.globalAlpha = fresh ? 1 - ph : 0.55;
        g.beginPath(); g.arc(x, y, base + ph * u * 4, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1; g.fillStyle = PAL.quake;
        g.beginPath(); g.arc(x, y, Math.max(1.5, u * 0.55), 0, Math.PI * 2); g.fill();
      }
    }
    const blink = ((ts / 1000) | 0) % 2 === 0;
    for (const hm of HOMES) {
      const xy = project(G, hm.lon, hm.lat); if (!xy) continue;
      g.strokeStyle = PAL.home; g.lineWidth = Math.max(1, u * 0.35); g.globalAlpha = blink ? 1 : 0.5;
      g.strokeRect(xy[0] - u * 1.2, xy[1] - u * 1.2, u * 2.4, u * 2.4); g.globalAlpha = 1;
    }
    const iss = ST.iss.data;
    if (iss) {
      const stale = isStale('iss', now);
      const tr = iss.trail || [];
      const sp = sprite(PAL.iss, Math.max(2, Math.round(u * 0.7)), 'glow'); const o = sp.width / 2;
      g.globalCompositeOperation = 'lighter';
      let prev = null;
      for (let i = 0; i < tr.length; i++) {
        const xy = project(G, tr[i].lon, tr[i].lat);
        if (!xy) { prev = null; continue; }
        const [x, y] = xy;
        g.globalAlpha = 0.15 + 0.6 * (i / Math.max(1, tr.length - 1));
        g.drawImage(sp, x - o, y - o);
        if (prev && (G.globe || Math.abs(tr[i].lon - tr[i - 1].lon) < 90)) { // interpolate; skip antimeridian jumps
          const [px, py] = prev, n = Math.floor(Math.hypot(x - px, y - py) / (u * 1.5));
          for (let s2 = 1; s2 < n; s2++) g.drawImage(sp, px + ((x - px) * s2) / n - o, py + ((y - py) * s2) / n - o);
        }
        prev = xy;
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      const xy = project(G, iss.lon, iss.lat);
      if (xy) {
        const [x, y] = xy;
        g.strokeStyle = PAL.iss; g.lineWidth = Math.max(1, u * 0.4);
        if (!stale) { g.globalAlpha = 1 - pulse; g.beginPath(); g.arc(x, y, u * (1.5 + pulse * 5), 0, Math.PI * 2); g.stroke(); }
        g.globalAlpha = stale ? 0.45 : 1;
        const big = sprite(PAL.iss, Math.max(3, u * 1.6), 'glow');
        g.globalCompositeOperation = 'lighter'; g.drawImage(big, x - big.width / 2, y - big.height / 2);
        g.globalCompositeOperation = 'source-over';
        text(g, stale ? 'ISS (STALE)' : 'ISS', x + u * 3, y + u, Math.max(2, L.s1 - 1), PAL.iss);
        g.globalAlpha = 1;
      }
    }
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
  function drawWeather(g, w, h, now) {
    const st = status('wx', now), d = ST.wx.data;
    const bottom = statusLine(g, w, h, 'OPEN-METEO.COM · CC BY 4.0', st);
    if (!d) { centerMsg(g, w, bottom, ST.wx.fails ? 'NO DATA' : 'LOADING', ST.wx.err); return; }
    const aq = ST.aq.data, soon = rainSoon(now);
    const blocks = splitBlocks(w, bottom, 2);
    const dp = L.portrait ? L.s1 : Math.max(2, L.s1 - 1);
    d.forEach((loc, i) => {
      const b = blocks[i];
      const x = b.x + L.pad, bw = b.w - L.pad * 2;
      const maxC = Math.floor((bw + dp) / (6 * dp));
      const a = aq && aq[i];
      const lines = [
        ['FEELS ' + deg(loc.feels) + '  HUM ' + pct(loc.hum), PAL.main],
        ['WIND ' + (loc.wind == null ? '--' : Math.round(loc.wind) + ' KM/H') + ' · HI ' + deg(loc.tmax) + ' LO ' + deg(loc.tmin), PAL.main],
        ['RAIN ' + pct(loc.rainNow) + ' THIS HR · ' + pct(loc.rainDay) + ' TODAY', PAL.main],
        a && a.aqi != null
          ? ['AQI ' + a.aqi + ' ' + AQI_CAT(a.aqi) + ' · PM2.5 ' + Math.round(a.pm25), a.aqi > 150 ? PAL.bad : a.aqi > 100 ? PAL.warn : PAL.main]
          : ['AQI ' + (ST.aq.fails && !aq ? 'NO DATA' : '--') + (aq && isStale('aq', now) ? ' (STALE)' : ''), PAL.dim]
      ];
      if (loc.sunrise) lines.push(['SUNRISE ' + loc.sunrise + ' · SUNSET ' + loc.sunset, PAL.dim]);
      const hours = (loc.hours || []).slice(0, 6);
      const stripH = hours.length ? 3 * LH * dp + L.s2 * 2 : 0;
      const fixedH = th(L.s2) + L.pad * 0.8 + L.s2 * 2 + th(L.s2) + L.s2 * 2 + lines.length * LH * dp + stripH;
      const Pi = Math.max(2, Math.floor(Math.min(bw * 0.3, b.h - L.pad * 2 - fixedH) / 9));
      let y = b.y + Math.max(L.pad, Math.round((b.h - fixedH - 9 * Pi) / 2));
      text(g, loc.name, x, y, L.s2, PAL.accent);
      if (loc.time) text(g, loc.time.slice(11, 16) + ' LOCAL', x + bw, y + th(L.s2) - th(L.s1), L.s1, PAL.dim, 'right');
      y += th(L.s2) + L.pad * 0.8;
      const [cond, ic] = WMO(loc.code);
      const iconName = (ic === 'sun' && loc.isDay === 0) ? 'moon' : ic;
      icon(g, iconName, x, y, Pi, PAL.main, PAL.dim);
      const ts = deg(loc.temp) + 'C';
      const Pt = fitP(ts.length, bw - 9 * Pi - L.pad, 9 * Pi * 0.8, L.s3 * 3);
      text(g, ts, x + 9 * Pi + L.pad, y + (9 * Pi - th(Pt)) / 2, Pt, PAL.main, 'left', true);
      y += 9 * Pi + L.s2 * 2;
      text(g, cond, x, y, L.s2, PAL.main);
      const rs = soon.find((r) => r.loc === i);
      if (rs) text(g, 'RAIN ' + rs.short, x + bw, y + th(L.s2) - th(L.s1), L.s1, PAL.warn, 'right');
      y += th(L.s2) + L.s2 * 2;
      for (const [ln, col] of lines) { text(g, clip(ln, maxC), x, y, dp, col); y += LH * dp; }
      if (hours.length) {
        y += L.s2;
        dotLine(g, x, y - L.s2 / 2, bw, Math.max(1, dp - 1), PAL.dim);
        y += L.s2 / 2;
        const cw = bw / hours.length;
        hours.forEach((hr, k) => {
          const cx = x + cw * k + cw / 2;
          text(g, hr.h, cx, y, dp, PAL.dim, 'center');
          text(g, deg(hr.temp), cx, y + LH * dp, dp, PAL.main, 'center');
          text(g, pct(hr.pp), cx, y + 2 * LH * dp, dp, hr.pp >= 50 ? PAL.warn : PAL.dim, 'center');
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
          if (k === 0) tags.push({ x, y, edge, t: bb.t, im: labelImg(sv.no + ' ' + busMin(bb.t, now), lp, col) });
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
    const src = d && d.title ? d.title : 'BUSINESS STANDARD · MARKETS';
    text(g, ready ? clip(src, Math.floor((w - L.pad * 2) / (6 * L.s2))) : 'RSS FEED', L.pad, L.pad, L.s2, PAL.accent);
    if (!ready) {
      statusLine(g, w, h, 'RSS', { text: 'NO FEED', color: PAL.warn });
      centerMsg(g, w, h, 'NO FEED', isNative() ? 'SET A FEED URL IN SETTINGS (LONG-PRESS)' :
        'THIS FEED BLOCKS BROWSER (CORS) READS. SET A CORS PROXY IN SETTINGS (LONG-PRESS), OR USE THE ANDROID APP BUILD.');
      return;
    }
    statusLine(g, w, h, 'RSS · ' + (isNative() ? 'NATIVE' : S.rssDirect ? 'DIRECT' : 'VIA PROXY'), st);
    if (!d) centerMsg(g, w, h, ST.news.fails ? 'NO DATA' : 'LOADING', ST.news.err);
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
      ['t', 'QUAKES: USGS · ISS: WHERETHEISS.AT'],
      ['t', 'FX: FRANKFURTER - ECB DAILY REFERENCE RATES'],
      ['t', 'ON THIS DAY: WIKIPEDIA (CC BY-SA 4.0)'],
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
    map: { draw: drawMap, dyn: dynMap, key: (now) => sig('iss', now) + sig('quakes', now) + Math.floor(now / 60e3) },
    fx: { draw: drawFx, key: (now) => sig('fx', now) },
    weather: { draw: drawWeather, key: (now) => sig('wx', now) + sig('aq', now) + Math.floor(now / 60e3) },
    news: { draw: drawNews, dyn: dynNews, dwellMul: 2, key: (now) => sig('news', now) + feedReady() },
    releases: {
      draw: drawReleases, dyn: dynDeck, dynOn: () => player.state !== 'idle', fps: 30,
      key: (now) => sig('rel', now) + Math.floor(now / 3600e3) + '|' + player.state + (player.item ? player.item.id : '') + player.err + '|' + artVer
    },
    otd: { draw: drawOtd, key: (now) => sig('otd', now) + Math.floor(now / 600e3) + todayKey() },
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
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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
      const t = Math.min(1, (ts - trans.t0) / SLIDE_MS), e = ease(t);
      const dx = Math.round(e * W) * trans.dir;
      drawPage(pages[trans.from], -dx, now, ts, dt);
      drawPage(pages[trans.to], trans.dir * W - dx, now, ts, dt);
      if (t >= 1) { cur = trans.to; trans = null; dwellAcc = 0; forceDraw = true; }
    } else drawPage(pages[cur], 0, now, ts, dt);
    drawBanner(now);
    ctx.drawImage(hc, 0, 0);
    ctx.drawImage(fc, 0, L.uy + L.uh - L.ftrH);
    drawnFrames++;
    if (!firstDrawn) {
      firstDrawn = true;
      try { performance.mark('mc-first-frame'); } catch (e) { /* ignore */ }
      setTimeout(loadMinimap, 300);
    }
  }
  let firstDrawn = false, drawnFrames = 0;
  const dynLast = {};
  let lastHc = null, lastHk = null, lastFk = null;
  function drawPage(id, offX, now, ts, dt) {
    const l = layerFor(id, now);
    ctx.drawImage(l.c, L.cx + offX, L.cy);
    const P = PAGES[id];
    if (P.dyn && (!P.dynOn || P.dynOn())) {
      ctx.save();
      ctx.beginPath(); ctx.rect(L.cx, L.cy, L.cw, L.ch); ctx.clip();
      ctx.translate(L.cx + offX, L.cy);
      P.dyn(ctx, L.cw, L.ch, now, ts, dt);
      dynLast[id] = ts;
      ctx.restore();
    }
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
    clock: 'clock', time: 'clock', bus: 'bus', buses: 'bus', world: 'map', map: 'map', iss: 'map', quakes: 'map',
    fx: 'fx', rates: 'fx', forex: 'fx', weather: 'weather', wx: 'weather', news: 'news', headlines: 'news',
    music: 'releases', releases: 'releases', new: 'releases', singles: 'releases',
    otd: 'otd', onthisday: 'otd', history: 'otd', countdown: 'countdown', trip: 'countdown', credits: 'credits'
  };
  function showPage(name) {
    const n = parseInt(name, 10);
    const id = !isNaN(n) && String(n) === name ? pages[n - 1] : PAGE_ALIASES[name];
    const idx = pages.indexOf(id);
    if (idx < 0) return;
    goTo(idx);
    holdUntil = Date.now() + 60e3; // stay on the requested page for a minute
  }
  function setPalette(v) {
    S.palette = v; LS.set('mc.settings', S); PAL = PALETTES[v];
    layers.clear(); mapBase = null; mmImg = null; newsCache.clear(); newsLayout = null; hdr.key = ftr.key = null;
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
    f.rssUrl.value = S.rssUrl; f.rssProxy.value = S.rssProxy; f.rssDirect.checked = !!S.rssDirect;
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
      rssUrl: f.rssUrl.value.trim(), rssProxy: f.rssProxy.value.trim(), rssDirect: f.rssDirect.checked,
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
    if (old.rssUrl !== n.rssUrl || old.rssProxy !== n.rssProxy || old.rssDirect !== n.rssDirect) resetSource('news');
    PAL = PALETTES[S.palette];
    layers.clear(); mapBase = null; mmImg = null; newsCache.clear(); newsLayout = null; hdr.key = ftr.key = null;
    resize(); rebuildPages(); closeSettings(); schedTick(); remoteConnect(true);
  });
  function showRemoteUrls() {
    const t = (sf.elements.remoteTopic.value.trim().replace(/[^A-Za-z0-9_-]/g, '')) || S.remoteTopic;
    document.getElementById('remoteUrls').textContent =
      'Sleep:  ' + NTFY + t + '/publish?message=off\nWake:   ' + NTFY + t + '/publish?message=on';
  }
  sf.elements.remoteTopic.addEventListener('input', showRemoteUrls);
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
    ST[k].ver++;
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
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell unavailable */ }); });
  }
  // test hook (harmless in production): lets the verifier jump to a page
  window.__mc = { go: (id) => { const i = pages.indexOf(id); if (i >= 0) { cur = i; trans = null; dwellAcc = 0; paused = true; forceDraw = true; } }, state: ST, pages: () => pages.slice(), drawn: () => drawnFrames, sleeping: () => sleeping, remote: () => remoteState, mode: LAUNCH_MODE, cmd: (m) => handleRemote(m), player: () => ({ state: player.state, err: player.err, t: player.audio ? player.audio.currentTime : 0, peak: Math.max(...peakLv) }), art: () => artMem.size, alerts: () => alertsNow(Date.now()), banner: () => !!banner, current: () => pages[trans ? trans.to : cur] };
})();
