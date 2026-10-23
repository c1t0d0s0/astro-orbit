import { VP, VS, arrival, seismogram } from '../earth/quake';

// 地学の画面の小さなグラフ (SVG)。色は CSS のクラスで決める (chart.ts と同じ)

const f1 = (n: number) => n.toFixed(1);

/** 地震計の記録。地点ごとに 1 本、0〜length 秒。いま (t) までをかき、P 波・S 波の着いた時刻に印をつける */
export function seismoChart(stations: { name: string; d: number }[], t: number, length: number): string {
  const W = 320;
  const L = 26;
  const R = 8;
  const row = 34;
  const T = 8;
  const H = T + row * stations.length + 22;
  const PW = W - L - R;
  const x = (s: number) => L + (s / length) * PW;
  const traces = stations
    .map((st, i) => {
      const cy = T + row * (i + 0.5);
      const pts: string[] = [];
      const end = Math.min(t, length);
      for (let s = 0; s <= end; s += 0.25) pts.push(`${f1(x(s))},${f1(cy - seismogram(s, st.d) * row * 0.48)}`);
      const tp = arrival(st.d, VP);
      const ts = arrival(st.d, VS);
      const mark = (s: number, cls: string) => (s <= end ? `<line class="${cls}" x1="${f1(x(s))}" x2="${f1(x(s))}" y1="${f1(cy - row * 0.45)}" y2="${f1(cy + row * 0.45)}"/>` : '');
      return (
        `<line class="c-grid" x1="${L}" x2="${L + PW}" y1="${f1(cy)}" y2="${f1(cy)}"/>` +
        `<text class="c-note" x="4" y="${f1(cy + 4)}">${st.name}</text>` +
        (end > tp && end > 0 ? `<rect class="c-ps" x="${f1(x(tp))}" y="${f1(cy - row * 0.45)}" width="${f1(x(Math.min(ts, end)) - x(tp))}" height="${f1(row * 0.9)}"/>` : '') +
        mark(tp, 'c-p') +
        mark(ts, 'c-s') +
        (pts.length > 1 ? `<polyline class="c-line c-quake" points="${pts.join(' ')}"/>` : '')
      );
    })
    .join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map((k) => `<text class="c-tick" x="${f1(x(k * length))}" y="${H - 6}" text-anchor="middle">${Math.round(k * length)}秒</text>`)
    .join('');
  return (
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="地震計の記録">` +
    traces +
    (t <= length ? `<line class="c-now" x1="${f1(x(t))}" x2="${f1(x(t))}" y1="${T}" y2="${T + row * stations.length}"/>` : '') +
    ticks +
    `</svg>`
  );
}

/**
 * 高さと気温のグラフ。まわりの空気 (灰色) と、上がっていく空気のかたまり (赤) の気温。
 * 雲の底 (露点) と 0 °C の高さに線を引く。z はいまの空気のかたまりの高さ (m)。なければ点をかかない
 */
export function airChart(t0: number, dew: number, z: number | null, env: (z: number) => number, parcel: (z: number) => number, base: number): string {
  const W = 320;
  const H = 190;
  const L = 34;
  const T = 10;
  const PW = W - L - 12;
  const PH = H - T - 30;
  const ZMAX = 8000;
  const tMin = Math.min(-30, Math.floor(parcel(ZMAX) / 10) * 10);
  const tMax = Math.max(30, Math.ceil(t0 / 10) * 10);
  const x = (temp: number) => L + ((temp - tMin) / (tMax - tMin)) * PW;
  const y = (h: number) => T + PH - (h / ZMAX) * PH;
  const line = (f: (h: number) => number) => Array.from({ length: 41 }, (_, i) => (i / 40) * ZMAX).map((h) => `${f1(x(f(h)))},${f1(y(h))}`).join(' ');
  const grid =
    [0, 2000, 4000, 6000, 8000].map((h) => `<line class="c-grid" x1="${L}" x2="${L + PW}" y1="${f1(y(h))}" y2="${f1(y(h))}"/><text class="c-tick" x="${L - 4}" y="${f1(y(h) + 4)}" text-anchor="end">${h / 1000}km</text>`).join('') +
    Array.from({ length: (tMax - tMin) / 10 + 1 }, (_, i) => tMin + i * 10)
      .map((tc) => `<line class="c-grid" x1="${f1(x(tc))}" x2="${f1(x(tc))}" y1="${T}" y2="${T + PH}"/><text class="c-tick" x="${f1(x(tc))}" y="${T + PH + 14}" text-anchor="middle">${tc}℃</text>`)
      .join('');
  return (
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="高さと気温のグラフ">` +
    grid +
    `<line class="c-freeze" x1="${f1(x(0))}" x2="${f1(x(0))}" y1="${T}" y2="${T + PH}"/>` +
    `<line class="c-base" x1="${L}" x2="${L + PW}" y1="${f1(y(base))}" y2="${f1(y(base))}"/>` +
    `<text class="c-tick" x="${L + PW}" y="${f1(y(base) - 4)}" text-anchor="end">雲の底 ${(base / 1000).toFixed(1)}km</text>` +
    `<polyline class="c-line c-env" points="${line(env)}"/>` +
    `<polyline class="c-line c-parcel" points="${line(parcel)}"/>` +
    (z !== null ? `<circle class="c-dot" cx="${f1(x(parcel(z)))}" cy="${f1(y(z))}" r="4"/>` : '') +
    `<text class="c-tick" x="${L + 4}" y="${H - 2}">地上 ${t0}℃・露点 ${dew}℃</text>` +
    `</svg>`
  );
}
