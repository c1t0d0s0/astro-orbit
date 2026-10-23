// 津波。海の深さ h (m) で、速さは √(g·h)

export const G = 9.8;

/** 深さ h (m) の海を進む津波の速さ (m/s) */
export const tsunamiSpeed = (h: number) => Math.sqrt(G * Math.max(h, 0.5));

/** m/s → 時速 km */
export const kmh = (v: number) => v * 3.6;

/**
 * グリーンの法則: 浅くなると津波は高くなる (高さは深さの 1/4 乗に反比例)。
 * 深さ h0 で高さ a0 の津波が、深さ h に来たときの高さ
 */
export const greenHeight = (a0: number, h0: number, h: number) => a0 * (h0 / Math.max(h, 0.5)) ** 0.25;

/**
 * 画面で使う、沖から海岸までの海の深さ (m)。x は海岸から沖へ向かう距離 (km、0 が海岸)。
 * 海溝 (約 7000 m) → 深い海 (約 4000 m) → 大陸斜面 → 大陸だな (約 100 m) → 海岸
 */
export function depthAt(x: number): number {
  if (x <= 0) return 0;
  if (x < 30) return 10 + (150 - 10) * (x / 30);
  if (x < 110) return 150 + (4000 - 150) * ((x - 30) / 80);
  if (x < 300) return 4000;
  if (x < 360) return 4000 + 3000 * Math.sin(((x - 300) / 60) * (Math.PI / 2));
  return 7000 - 2000 * Math.min(1, (x - 360) / 60);
}

/** 画面の海の長さ (km) と、津波が起こる場所 (海岸からの距離 km) */
export const SEA_KM = 440;
export const SOURCE_KM = 260;

/** x1 から x2 まで (km) 津波が進むのにかかる時間 (秒)。深さにそって足しあわせる */
export function travelTime(x1: number, x2: number): number {
  const a = Math.min(x1, x2);
  const b = Math.max(x1, x2);
  const n = Math.max(1, Math.ceil((b - a) / 0.5));
  const dx = (b - a) / n;
  let t = 0;
  for (let i = 0; i < n; i++) t += (dx * 1000) / tsunamiSpeed(depthAt(a + (i + 0.5) * dx));
  return t;
}

/** 津波の山の時間の幅 (秒)。深い海で波長が 100 km ほどになる */
export const PULSE = 240;
/** 起こったところでの津波の高さ (m)。海岸のがわと沖のがわに半分ずつ分かれて進む */
export const SOURCE_HEIGHT = 2;

/** x (km) に、t 秒にある海面の高さ (m)。tau はそこまで津波が進むのにかかる時間 (travelTime(SOURCE_KM, x)) */
export function surfaceAt(x: number, t: number, tau: number): number {
  const h = depthAt(x);
  if (h <= 0) return 0;
  const a = greenHeight(SOURCE_HEIGHT / 2, depthAt(SOURCE_KM), h);
  const s = (t - tau) / PULSE;
  return a * Math.exp(-s * s);
}

/** t 秒に、海岸へ向かう津波の山がある場所 (海岸からの km)。もう海岸に着いていたら 0 */
export function frontAt(t: number): number {
  if (t <= 0) return SOURCE_KM;
  if (travelTime(0, SOURCE_KM) <= t) return 0;
  let lo = 0;
  let hi = SOURCE_KM;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (travelTime(mid, SOURCE_KM) > t) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
