import { asin, atan2, cos, norm360, sin, type Vec3 } from './math';

// 座標の変換。
//   黄道座標 (黄経・黄緯): 地球の公転の面が基準
//   赤道座標 (赤経・赤緯): 地球の赤道が基準。星はこの座標でほとんど動かない
//   地平座標 (方位・高度): その場所で見上げた空。方位は北 0°・東 90°・南 180°・西 270°

export interface Equatorial {
  /** 赤経 (°) */
  ra: number;
  /** 赤緯 (°) */
  dec: number;
}

export interface Horizontal {
  /** 高度 (°)。地平線が 0°、真上が 90° */
  alt: number;
  /** 方位 (°) */
  az: number;
}

export function eclipticToEquatorial(lon: number, lat: number, eps: number): Equatorial {
  return {
    ra: norm360(atan2(sin(lon) * cos(eps) - (sin(lat) / cos(lat)) * sin(eps), cos(lon))),
    dec: asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon)),
  };
}

/** その場所の地方恒星時 (°)。東経はプラス */
export const localSiderealTime = (gmstDeg: number, lon: number) => norm360(gmstDeg + lon);

/** 赤道座標の天体が、緯度 lat・地方恒星時 lst の場所でどこに見えるか */
export function toHorizontal(eq: Equatorial, lat: number, lst: number): Horizontal {
  const h = lst - eq.ra; // 時角
  const east = -cos(eq.dec) * sin(h);
  const north = sin(eq.dec) * cos(lat) - cos(eq.dec) * cos(h) * sin(lat);
  const up = sin(eq.dec) * sin(lat) + cos(eq.dec) * cos(h) * cos(lat);
  return { alt: asin(up), az: norm360(atan2(east, north)) };
}

/** 方位・高度の向き (x: 東, y: 北, z: 真上) */
export const horizontalVector = (p: Horizontal): Vec3 => [cos(p.alt) * sin(p.az), cos(p.alt) * cos(p.az), sin(p.alt)];

/** 赤道座標の向き (x: 春分点, z: 天の北極) */
export const equatorialVector = (eq: Equatorial): Vec3 => [cos(eq.dec) * cos(eq.ra), cos(eq.dec) * sin(eq.ra), sin(eq.dec)];
