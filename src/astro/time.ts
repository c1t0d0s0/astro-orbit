// 時刻。JS の Date (UTC のミリ秒) とユリウス日を行き来する。
// 力学時と世界時の差 (2026 年でおよそ 69 秒) は、見た目には分からないので考えない

export const DAY_MS = 86_400_000;
const J2000 = 2451545.0;

/** ユリウス日 */
export const julianDay = (ms: number) => ms / DAY_MS + 2440587.5;
export const msFromJulianDay = (jd: number) => (jd - 2440587.5) * DAY_MS;

/** J2000.0 からのユリウス世紀 */
export const centuries = (jd: number) => (jd - J2000) / 36525;

/** グリニッジ平均恒星時 (°)。地球が星に対してどれだけ回ったか (Meeus 12.4) */
export function gmst(jd: number): number {
  const t = centuries(jd);
  const deg = 280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * t * t - (t * t * t) / 38710000;
  return ((deg % 360) + 360) % 360;
}

/** 黄道傾斜角 (°)。地軸のかたむき */
export function obliquity(jd: number): number {
  const t = centuries(jd);
  const omega = 125.04 - 1934.136 * t;
  return 23.4392911 - (46.815 * t) / 3600 + 0.00256 * Math.cos((omega * Math.PI) / 180);
}
