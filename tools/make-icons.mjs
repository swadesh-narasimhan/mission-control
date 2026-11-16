// Generates the PWA icons (any + maskable, 192/512) by drawing them in headless Chromium.
// Usage: node tools/make-icons.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'www', 'icons');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const results = await page.evaluate(() => {
  // 5x7 glyphs for the letters used
  const G = {
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110']
  };
  function draw(size, safe, transparent) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    if (!transparent) { g.fillStyle = '#000'; g.fillRect(0, 0, size, size); }
    // content box: maskable keeps everything inside the central ~60%
    const box = size * (safe ? 0.58 : 0.84), ox = (size - box) / 2, oy = (size - box) / 2;
    // orbit ring
    const cx = size / 2, cy = size / 2, R = box / 2;
    g.strokeStyle = 'rgba(95,242,208,0.35)'; g.lineWidth = size * 0.012;
    g.setLineDash([size * 0.012, size * 0.022]);
    g.beginPath(); g.ellipse(cx, cy, R, R * 0.42, -0.35, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    // "MC" in dots: 11 cols x 7 rows
    const cols = 11, rows = 7, p = (box * 0.78) / cols;
    const tx = cx - (cols * p) / 2, ty = cy - (rows * p) / 2;
    const dot = (x, y, r, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.6);
      gr.addColorStop(0, `rgba(95,242,208,${0.45 * a})`); gr.addColorStop(1, 'rgba(95,242,208,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(95,242,208,${a})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    g.globalCompositeOperation = 'lighter';
    for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
      const ch = col < 5 ? G.M : col > 5 ? G.C : null;
      const lit = ch && ch[r][col < 5 ? col : col - 6] === '1';
      const x = tx + (col + 0.5) * p, y = ty + (r + 0.5) * p;
      if (lit) dot(x, y, p * 0.38, 1);
      else { g.fillStyle = 'rgba(95,242,208,0.08)'; g.beginPath(); g.arc(x, y, p * 0.3, 0, Math.PI * 2); g.fill(); }
    }
    // satellite on the orbit
    const a = -0.35, t = -2.3;
    const sx = cx + R * Math.cos(t) * Math.cos(a) - R * 0.42 * Math.sin(t) * Math.sin(a);
    const sy = cy + R * Math.cos(t) * Math.sin(a) + R * 0.42 * Math.sin(t) * Math.cos(a);
    dot(sx, sy, size * 0.022, 1);
    g.globalCompositeOperation = 'source-over';
    void ox; void oy;
    return c.toDataURL('image/png');
  }
  const out = {
    'icon-192.png': draw(192, false), 'icon-512.png': draw(512, false),
    'maskable-192.png': draw(192, true), 'maskable-512.png': draw(512, true)
  };
  // Android launcher icons (legacy square/round + adaptive foreground on transparent)
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    out[`android:mipmap-${d}/ic_launcher.png`] = draw(48 * k, true);
    out[`android:mipmap-${d}/ic_launcher_round.png`] = draw(48 * k, true);
    out[`android:mipmap-${d}/ic_launcher_foreground.png`] = draw(108 * k, true, true);
  }
  return out;
});
const androidRes = join(out, '..', '..', 'android', 'app', 'src', 'main', 'res');
for (const [name, url] of Object.entries(results)) {
  let file = join(out, name);
  if (name.startsWith('android:')) {
    if (!existsSync(androidRes)) continue;
    file = join(androidRes, name.slice(8));
  }
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', name);
}
await browser.close();
