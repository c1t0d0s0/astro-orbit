import { equatorialVector } from './coords';
import { dot, fromLonLat, type Vec3 } from './math';
import { bodiesAt } from './state';

// 潮の満ち引き (平衡潮汐)。月と太陽が海水を引く力の「場所によるちがい」(起潮力) で、
// 海面は月 (と太陽) の方向と、その反対側の 2 か所がふくらむ。
// 実際の海では、陸や海の深さのせいで満潮が数時間おくれたり、大きさが変わったりする。

/** 月の平均距離 (km) */
const MOON_MEAN = 384_400;
/** 太陽の起潮力は月の約 0.46 倍 (質量は約 2700 万倍、距離は約 390 倍なので 2700万 ÷ 390³) */
export const SUN_RATIO = 0.46;

/** 向き d の海面の高さ。body の方向との角を θ として (3cos²θ − 1) / 2 に比例する */
export const bulge = (d: Vec3, body: Vec3) => {
  const c = dot(d, body);
  return (3 * c * c - 1) / 2;
};

export interface TideParts {
  /** 月の向き・太陽の向き (赤道座標の単位ベクトル) */
  moonDir: Vec3;
  sunDir: Vec3;
  /** 月・太陽の起潮力の強さ (月が平均距離のときを 1) */
  moonK: number;
  sunK: number;
}

export function tideParts(ms: number): TideParts {
  const b = bodiesAt(ms);
  return {
    moonDir: equatorialVector(b.moon),
    sunDir: equatorialVector(b.sun),
    moonK: (MOON_MEAN / b.moon.dist) ** 3,
    sunK: SUN_RATIO / b.sun.dist ** 3,
  };
}

/** 赤道座標の向き d の海面の高さ (月だけで、平均距離のときの満潮を 1 とする目安) */
export function tideAtDir(p: TideParts, d: Vec3): number {
  return p.moonK * bulge(d, p.moonDir) + p.sunK * bulge(d, p.sunDir);
}

/** 緯度 lat・経度 lon の場所の、時刻 ms の海面の高さ */
export function tideAt(ms: number, lat: number, lon: number): number {
  const b = bodiesAt(ms);
  return tideAtDir(tideParts(ms), fromLonLat(b.gmst + lon, lat));
}

/** 時刻 ms のまわり 1 日の、その場所の潮の高低差 */
export function tideRange(ms: number, lat: number, lon: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let h = -12; h <= 12; h += 0.25) {
    const v = tideAt(ms + h * 3_600_000, lat, lon);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return hi - lo;
}

export type TideName = 'spring' | 'middle' | 'neap';

/** 月と太陽の角度から、大潮・中潮・小潮を決める (目安。実際の潮名は月齢で決める) */
export function tideName(phase: number): TideName {
  const d = Math.abs(((phase + 90) % 180) - 90); // 新月・満月からの角度 (0〜90°)
  return d < 30 ? 'spring' : d > 60 ? 'neap' : 'middle';
}
