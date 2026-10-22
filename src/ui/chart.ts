import { dayInfo, type Place } from '../astro/events';
import { tideAt } from '../astro/tide';
import { DAY_MS } from '../astro/time';

// 解説のための小さなグラフ (SVG)。色は CSS のクラスで決める (暗い画面では黒板の色になる)

const f1 = (n: number) => n.toFixed(1);

/** 1 年の昼の長さ (5 日ごとに計算して、つなぐ)。同じ場所・年なら計算をくりかえさない */
const daylightCache = new Map<string, number[]>();

function yearDaylight(place: Place, year: number): number[] {
  const key = `${place.lat}:${place.lon}:${place.tz}:${year}`;
  let hours = daylightCache.get(key);
  if (!hours) {
    hours = [];
    const start = Date.UTC(year, 0, 1, 12 - place.tz);
    for (let d = 0; d <= 365; d += 5) hours.push(dayInfo(start + d * DAY_MS, place).daylight);
    daylightCache.set(key, hours);
  }
  return hours;
}

/**
 * 1 年の昼の長さのグラフ。横じくが月、たてじくが時間 (0〜24)。
 * notilt のときは「地軸がかたむいていなかったら」として 12 時間の線をかく
 */
export function daylightChart(place: Place, ms: number, notilt = false): string {
  const W = 320;
  const H = 168;
  const L = 34;
  const T = 10;
  const PW = W - L - 10;
  const PH = H - T - 28;
  const year = new Date(ms + place.tz * 3_600_000).getUTCFullYear();
  const hours = notilt ? yearDaylight(place, year).map(() => 12) : yearDaylight(place, year);
  const x = (day: number) => L + (day / 365) * PW;
  const y = (h: number) => T + PH - (h / 24) * PH;
  const grid = [0, 6, 12, 18, 24]
    .map((h) => `<line class="c-grid" x1="${L}" x2="${L + PW}" y1="${f1(y(h))}" y2="${f1(y(h))}"/><text class="c-tick" x="${L - 5}" y="${f1(y(h) + 4)}" text-anchor="end">${h}</text>`)
    .join('');
  const months = Array.from({ length: 12 }, (_, m) => {
    const day = (Date.UTC(year, m, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
    return `<line class="c-grid" x1="${f1(x(day))}" x2="${f1(x(day))}" y1="${T}" y2="${T + PH}"/>${m % 3 === 0 ? `<text class="c-tick" x="${f1(x(day + 15))}" y="${T + PH + 16}" text-anchor="middle">${m + 1}月</text>` : ''}`;
  }).join('');
  const area = hours.map((h, i) => `${f1(x(i * 5))},${f1(y(h))}`).join(' ');
  const today = (ms - Date.UTC(year, 0, 1) + place.tz * 3_600_000) / DAY_MS;
  const now = notilt ? 12 : dayInfo(ms, place).daylight;
  return (
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="1年の昼の長さのグラフ">` +
    grid +
    months +
    `<polygon class="c-fill" points="${f1(x(0))},${f1(y(0))} ${area} ${f1(x(365))},${f1(y(0))}"/>` +
    `<polyline class="c-line" points="${area}"/>` +
    `<line class="c-now" x1="${f1(x(today))}" x2="${f1(x(today))}" y1="${T}" y2="${T + PH}"/>` +
    `<circle class="c-dot" cx="${f1(x(today))}" cy="${f1(y(now))}" r="4"/>` +
    `<text class="c-tick" x="${L - 5}" y="${T - 1}" text-anchor="end">時間</text>` +
    `</svg>`
  );
}

/**
 * 同じ太さの光の束が、地面に当たるようす。太陽が低いほど、光が広い面積に広がって、地面 1 か所あたりの光は弱くなる
 */
export function beamChart(alt: number): string {
  const W = 320;
  const H = 150;
  const G = 128; // 地面の高さ
  const CX = 160;
  const beam = 46; // 光の束の太さ
  if (alt <= 0) {
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="太陽は地平線の下"><line class="c-ground" x1="10" x2="${W - 10}" y1="${G}" y2="${G}"/><text class="c-note" x="${CX}" y="${G / 2}" text-anchor="middle">太陽は地平線の下</text></svg>`;
  }
  const a = (alt * Math.PI) / 180;
  const foot = Math.min(beam / Math.sin(a), W - 30);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const len = 140;
  // 光の束の両はし (地面に当たる 2 点から、太陽の方向へのばす)
  const x1 = CX - foot / 2;
  const x2 = CX + foot / 2;
  const pts = `${f1(x1)},${G} ${f1(x2)},${G} ${f1(x2 - dx * len)},${f1(G - dy * len)} ${f1(x1 - dx * len)},${f1(G - dy * len)}`;
  const pct = Math.round(Math.sin(a) * 100);
  return (
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="太陽の高さ ${Math.round(alt)}度のときの光の当たり方">` +
    `<polygon class="c-beam" points="${pts}"/>` +
    `<line class="c-ground" x1="10" x2="${W - 10}" y1="${G}" y2="${G}"/>` +
    `<line class="c-foot" x1="${f1(x1)}" x2="${f1(x2)}" y1="${G + 6}" y2="${G + 6}"/>` +
    `<text class="c-tick" x="${CX}" y="${G + 20}" text-anchor="middle">光が当たる広さ ×${(1 / Math.sin(a)).toFixed(2)}</text>` +
    `<text class="c-note" x="14" y="20">太陽の高さ ${Math.round(alt)}°</text>` +
    `<text class="c-note" x="14" y="38">同じ広さあたりの光の強さ ${pct}%</text>` +
    `</svg>`
  );
}

/** その場所の潮の高さ (前後 24 時間)。いまを点で示す */
export function tideChart(place: Place, ms: number): string {
  const W = 320;
  const H = 150;
  const L = 12;
  const T = 14;
  const PW = W - 2 * L;
  const PH = H - T - 30;
  const pts: string[] = [];
  const x = (h: number) => L + ((h + 24) / 48) * PW;
  const y = (v: number) => T + PH / 2 - (v / 1.6) * (PH / 2);
  for (let h = -24; h <= 24; h += 0.5) pts.push(`${f1(x(h))},${f1(y(tideAt(ms + h * 3_600_000, place.lat, place.lon)))}`);
  const now = tideAt(ms, place.lat, place.lon);
  const ticks = [-24, -12, 0, 12, 24]
    .map((h) => `<text class="c-tick" x="${f1(x(h))}" y="${H - 8}" text-anchor="middle">${h === 0 ? 'いま' : `${h > 0 ? '+' : ''}${h}時間`}</text>`)
    .join('');
  return (
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="潮の高さのグラフ">` +
    `<line class="c-grid" x1="${L}" x2="${L + PW}" y1="${f1(y(0))}" y2="${f1(y(0))}"/>` +
    `<line class="c-now" x1="${f1(x(0))}" x2="${f1(x(0))}" y1="${T}" y2="${T + PH}"/>` +
    `<polyline class="c-line c-sea" points="${pts.join(' ')}"/>` +
    `<circle class="c-dot" cx="${f1(x(0))}" cy="${f1(y(now))}" r="4"/>` +
    ticks +
    `</svg>`
  );
}
