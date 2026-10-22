import { eclipticToEquatorial, type Equatorial } from './coords';
import { cos, norm360 } from './math';
import { moonPosition } from './moon';
import { sunPosition } from './sun';
import { gmst, julianDay, obliquity } from './time';

/** ある時刻の太陽と月 (どの画面でも、ここから位置を取る) */
export interface Bodies {
  ms: number;
  jd: number;
  /** 地軸のかたむき (°) */
  eps: number;
  /** グリニッジ恒星時 (°) */
  gmst: number;
  sun: Equatorial & { lon: number; dist: number };
  moon: Equatorial & { lon: number; lat: number; dist: number };
  /** 月が太陽から東へはなれている角度 (°)。0° 新月、90° 上弦、180° 満月、270° 下弦 */
  phase: number;
  /** 月の光っている部分の割合 (0〜1) */
  illum: number;
}

let cache: Bodies | null = null;

export function bodiesAt(ms: number): Bodies {
  if (cache?.ms === ms) return cache;
  const jd = julianDay(ms);
  const eps = obliquity(jd);
  const s = sunPosition(jd);
  const m = moonPosition(jd);
  const phase = norm360(m.lon - s.lon);
  // 月から見た太陽と地球の間の角 ≒ 180° − 地球から見た太陽と月の間の角
  const elong = Math.acos(cos(m.lat) * cos(phase)) * (180 / Math.PI);
  cache = {
    ms,
    jd,
    eps,
    gmst: gmst(jd),
    sun: { lon: s.lon, dist: s.dist, ...eclipticToEquatorial(s.lon, 0, eps) },
    moon: { lon: m.lon, lat: m.lat, dist: m.dist, ...eclipticToEquatorial(m.lon, m.lat, eps) },
    phase,
    illum: (1 - cos(elong)) / 2,
  };
  return cache;
}
