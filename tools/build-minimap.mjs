// Builds www/minimap.js: a simplified road map around the Pasir Panjang Rd bus stops
// (16081 / 16089) plus the routes of the services that call there.
// Roads + coastline: © OpenStreetMap contributors (ODbL), via the Overpass API.
// Bus routes: data.busrouter.sg (derived from LTA DataMall).
// Usage: node tools/build-minimap.mjs      (re-run only if you want fresher map data)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'www', 'minimap.js');
const C = { lat: (1.29196 + 1.29201) / 2, lng: (103.76866 + 103.76908) / 2 }; // between the two stops
const HALF_X = 3200, HALF_Y = 2500; // metres of map data kept around the centre
const SERVICES = ['10', '30', '51', '143', '183', '188', '200'];
const KX = 111320 * Math.cos((C.lat * Math.PI) / 180), KY = 110574;
const toXY = (lat, lng) => [(lng - C.lng) * KX, (lat - C.lat) * KY];
const bbox = [C.lat - HALF_Y / KY, C.lng - HALF_X / KX, C.lat + HALF_Y / KY, C.lng + HALF_X / KX].map((v) => v.toFixed(5)).join(',');

async function overpass(q) {
  const eps = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  for (const ep of eps) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(ep, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { "user-agent": "mission-control-minimap-build" }, signal: AbortSignal.timeout(120000) });
        if (r.ok) return await r.json();
      } catch (e) { /* try next */ }
      await new Promise((ok) => setTimeout(ok, 3000));
    }
  }
  throw new Error('All Overpass endpoints failed');
}
function decodePolyline(str) {
  const pts = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}
// Douglas-Peucker on [[x,y],...]
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let idx = -1, max = 0;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// Split a polyline into runs inside the (slightly padded) box.
function clip(pts) {
  const inside = ([x, y]) => Math.abs(x) <= HALF_X && Math.abs(y) <= HALF_Y;
  const runs = []; let cur = [];
  for (let i = 0; i < pts.length; i++) {
    if (inside(pts[i]) || (i > 0 && inside(pts[i - 1])) || (i < pts.length - 1 && inside(pts[i + 1]))) cur.push(pts[i]);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length > 1);
}
const flat = (pts) => pts.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);

const CLASS = {
  motorway: 0, trunk: 0, primary: 1, secondary: 1, tertiary: 2,
  motorway_link: 2, trunk_link: 2, primary_link: 2, secondary_link: 2, residential: 3, unclassified: 3
};
const LABELS = {
  'Pasir Panjang Road': 'PASIR PANJANG RD', 'Clementi Road': 'CLEMENTI RD', 'West Coast Highway': 'WEST COAST HWY',
  'Ayer Rajah Expressway': 'AYE', 'West Coast Road': 'WEST COAST RD', 'North Buona Vista Road': 'N BUONA VISTA RD',
  'South Buona Vista Road': 'S BUONA VISTA RD', 'Commonwealth Avenue West': "C'WEALTH AVE W", 'Kent Ridge Road': 'KENT RIDGE RD',
  'Lower Kent Ridge Road': 'LOWER KENT RIDGE RD', 'Jalan Buroh': 'JALAN BUROH', 'Clementi Avenue 6': 'CLEMENTI AVE 6'
};

console.log('fetching roads…');
const roadsJ = await overpass(`[out:json][timeout:90];(way["highway"~"^(${Object.keys(CLASS).join('|')})$"](${bbox});way["natural"="coastline"](${bbox}););out geom;`);
const roads = [], coast = [], labelPts = {};
for (const w of roadsJ.elements) {
  if (!w.geometry) continue;
  const xy = w.geometry.map((g) => toXY(g.lat, g.lon));
  if (w.tags.natural === 'coastline') { for (const run of clip(xy)) coast.push(flat(simplify(run, 12))); continue; }
  const cls = CLASS[w.tags.highway]; if (cls === undefined) continue;
  for (const run of clip(xy)) roads.push([cls, ...flat(simplify(run, cls === 3 ? 10 : 6))]);
  const lab = LABELS[w.tags.name];
  if (lab) {
    for (let i = 0; i + 1 < xy.length; i++) {
      const len = Math.hypot(xy[i + 1][0] - xy[i][0], xy[i + 1][1] - xy[i][1]);
      if (len < 120) continue; // only straight-ish stretches long enough for a label
      const mx = (xy[i][0] + xy[i + 1][0]) / 2, my = (xy[i][1] + xy[i + 1][1]) / 2;
      if (Math.abs(mx) < HALF_X && Math.abs(my) < HALF_Y) (labelPts[lab] = labelPts[lab] || []).push([Math.round(mx), Math.round(my), Math.round(len)]);
    }
  }
}
const labels = Object.entries(labelPts).map(([t, p]) => ({
  t, p: p.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1])).slice(0, 12).map(([x, y]) => [x, y])
}));

console.log('fetching bus routes…');
const routesJ = await (await fetch('https://data.busrouter.sg/v1/routes.min.json')).json();
const routes = {};
for (const sv of SERVICES) {
  routes[sv] = [];
  for (const enc of routesJ[sv] || []) {
    const xy = decodePolyline(enc).map(([la, ln]) => toXY(la, ln));
    for (const run of clip(xy)) routes[sv].push(flat(simplify(run, 8)));
  }
}

const data = { c: [C.lat, C.lng], half: [HALF_X, HALF_Y], roads, coast, routes, labels, built: new Date().toISOString().slice(0, 10) };
const js = '/* Generated by tools/build-minimap.mjs. Map data © OpenStreetMap contributors (ODbL); bus routes: busrouter.sg / LTA DataMall. */\n' +
  'window.MC_MINIMAP = ' + JSON.stringify(data) + ';\n';
writeFileSync(OUT, js);
const npts = roads.reduce((a, r) => a + (r.length - 1) / 2, 0);
console.log(`wrote ${OUT}: ${roads.length} road runs (${npts} pts), ${coast.length} coast runs, ${Object.values(routes).reduce((a, r) => a + r.length, 0)} route runs, ${labels.length} labels, ${(js.length / 1024).toFixed(1)} KB`);
