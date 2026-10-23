// 地震の波。距離は km、時間は秒

/** P 波 (はじめの小さなゆれ・初期微動) の速さ */
export const VP = 6;
/** S 波 (あとから来る大きなゆれ・主要動) の速さ */
export const VS = 3.5;

/** 震源からの距離 d の場所に、速さ v の波が着くまでの時間 */
export const arrival = (d: number, v: number) => d / v;

/** 初期微動継続時間 (P 波が着いてから S 波が着くまで) */
export const psTime = (d: number) => d / VS - d / VP;

/** 大森公式 D = k·T の k (km/s)。この速さなら約 8.4 */
export const OMORI_K = 1 / (1 / VS - 1 / VP);

/** 初期微動継続時間 T から、震源までの距離 */
export const distanceFromPS = (t: number) => OMORI_K * t;

/** 震源 (x, y, 深さ) から地表の点 (x, y) までの距離 */
export const hypoDistance = (dx: number, dy: number, depth: number) => Math.hypot(dx, dy, depth);

/**
 * 地震計のゆれ (目安の形)。時刻 t、距離 d。P 波で小さく、S 波で大きくゆれ、だんだん小さくなる。
 * 遠いほど小さい。もどり値は -1〜1 くらい
 */
export function seismogram(t: number, d: number): number {
  const tp = arrival(d, VP);
  const ts = arrival(d, VS);
  const fall = 60 / (d + 60);
  let a = 0;
  if (t > tp) a += 0.22 * Math.exp(-(t - tp) / 25) * Math.sin((t - tp) * 9.1) * Math.sin((t - tp) * 2.3 + 1);
  if (t > ts) a += Math.exp(-(t - ts) / 12) * Math.min(1, (t - ts) / 1.5) * Math.sin((t - ts) * 4.3) * (0.7 + 0.3 * Math.sin((t - ts) * 1.1));
  return a * fall;
}
