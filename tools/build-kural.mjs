// Builds www/kural/k01.json … k14.json (100 kurals per file) for the "Kural of the day" page.
// Source: github.com/tk120404/thirukkural (Apache-2.0): Tamil text of the Thirukkural
// (Thiruvalluvar, public domain) with English translations, plus chapter names.
// Entry format: [number, tamilLine1, tamilLine2, englishExplanation, chapterEnglish]
// Usage: node tools/build-kural.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'www', 'kural');
const BASE = 'https://raw.githubusercontent.com/tk120404/thirukkural/master/';
const get = async (f) => { const r = await fetch(BASE + f); if (!r.ok) throw new Error(f + ' HTTP ' + r.status); return r.json(); };

const all = (await get('thirukkural.json')).kural;
const detail = await get('detail.json');
const chapterOf = [];
for (const sec of detail[0].section.detail) {
  for (const grp of sec.chapterGroup.detail) {
    for (const ch of grp.chapters.detail) for (let n = ch.start; n <= ch.end; n++) chapterOf[n] = ch.translation;
  }
}
if (all.length !== 1330) throw new Error('expected 1330 kurals, got ' + all.length);
mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (let c = 0; c < 14; c++) {
  const rows = all.slice(c * 100, c * 100 + 100).map((k) => {
    const n = +k.Number;
    return [n, k.Line1.trim(), k.Line2.trim(), String(k.explanation || k.Translation).replace(/\s+/g, ' ').trim(), chapterOf[n] || ''];
  });
  const js = JSON.stringify(rows);
  bytes += js.length;
  writeFileSync(join(OUT, 'k' + String(c + 1).padStart(2, '0') + '.json'), js);
}
writeFileSync(join(OUT, 'NOTICE.txt'), 'Thirukkural text and English translations from github.com/tk120404/thirukkural (Apache License 2.0).\nThe Thirukkural (Thiruvalluvar) is in the public domain.\n');
console.log(`wrote 14 chunks to ${OUT} (${(bytes / 1024).toFixed(0)} KB total, ~${(bytes / 14 / 1024).toFixed(0)} KB each)`);
