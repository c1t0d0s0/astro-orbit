// src/data/stars.json と src/data/land.json を作りなおすためのスクリプト (ふだんは使わない)。
//   星: Yale Bright Star Catalogue 第 5 版 (https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz) の 5.0 等より明るい星
//   陸: Natural Earth 1:110m land (パブリックドメイン。https://github.com/nvkelso/natural-earth-vector の geojson/ne_110m_land.geojson)
// 使い方: 上の 2 つを 1 つのフォルダ (bsc5.gz, land.geojson) に置いて
//   node scripts/gen-data.mjs <そのフォルダ> src/data
// stars.json は [赤経 (°), 赤緯 (°), 等級, B−V 色指数, バイエル符号 (例 "AlpOri")] のならび (明るい順)
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const [, , dl, out] = process.argv;
// --- stars (Yale Bright Star Catalogue, 5th ed.) ---
const lines = gunzipSync(readFileSync(`${dl}/bsc5.gz`)).toString('latin1').split('\n');
const stars = [];
for (const l of lines) {
  if (l.length < 110) continue;
  const rah = l.slice(75, 77).trim();
  const vmag = parseFloat(l.slice(102, 107));
  if (!rah || !Number.isFinite(vmag) || vmag > 5.0) continue;
  const ra = (+rah + +l.slice(77, 79) / 60 + +l.slice(79, 83) / 3600) * 15;
  const dec = (l[83] === '-' ? -1 : 1) * (+l.slice(84, 86) + +l.slice(86, 88) / 60 + +l.slice(88, 90) / 3600);
  const bv = parseFloat(l.slice(109, 114));
  const bayer = l.slice(7, 10).trim();
  const sup = l.slice(10, 11).trim();
  const con = l.slice(11, 14).trim();
  const name = bayer && con ? `${bayer}${sup}${con}` : '';
  stars.push([+ra.toFixed(3), +dec.toFixed(3), vmag, Number.isFinite(bv) ? bv : 0.6, name]);
}
stars.sort((a, b) => a[2] - b[2]);
writeFileSync(`${out}/stars.json`, JSON.stringify(stars));
console.log('stars', stars.length);
// --- land (Natural Earth 110m, public domain) ---
const geo = JSON.parse(readFileSync(`${dl}/land.geojson`, 'utf8'));
const rings = [];
for (const f of geo.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of polys) for (const ring of p) rings.push(ring.flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));
}
writeFileSync(`${out}/land.json`, JSON.stringify(rings));
console.log('rings', rings.length, rings.reduce((s, r) => s + r.length / 2, 0));
