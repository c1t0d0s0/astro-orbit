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
