import { asin, atan2, cos, sin } from '../astro/math';

// オーロラ。太陽風のつぶが地球の磁場にそって極のまわりに入り、高さ 100〜300 km の空気を光らせる

/** 地球の磁石の軸の北のはし (地磁気の北極。IGRF 2025 の双極子で 北緯 80.8°・西経 72.6°) */
export const GEOMAG_POLE = { lat: 80.8, lon: -72.6 };

/** 地磁気緯度 (°)。地磁気の北極からどれだけ離れているかで決まる緯度 */
export function geomagLat(lat: number, lon: number): number {
  const p = GEOMAG_POLE;
  return asin(sin(lat) * sin(p.lat) + cos(lat) * cos(p.lat) * cos(lon - p.lon));
}

/** オーロラの輪の中心の地磁気緯度 (ふだんは約 67°、太陽風が強いと約 55° まで下がる) と幅 */
export const ovalLat = (storm: boolean) => (storm ? 56 : 67);
export const OVAL_WIDTH = 5;

/** 地磁気緯度 m の場所が、オーロラの輪の下にあるか */
export const underOval = (m: number, storm: boolean) => Math.abs(Math.abs(m) - ovalLat(storm)) <= OVAL_WIDTH;

/**
 * その場所 (地磁気緯度 m) から見たオーロラの輪の下のはしまでの角度 (°)。
 * 0 なら輪の真下、正なら極のがわ (北半球なら北の空)、負なら赤道のがわの空にある
 */
export function ovalGap(m: number, storm: boolean): number {
  const c = ovalLat(storm);
  const a = Math.abs(m);
  if (Math.abs(a - c) <= OVAL_WIDTH) return 0;
  return a < c ? c - OVAL_WIDTH - a : -(a - c - OVAL_WIDTH);
}

/** 輪までの角度 (°) から、地上で見える、高さ h km のオーロラの仰角 (°)。オーロラの下のはしは約 110 km、上のはしは約 250 km */
export function auroraElevation(gapDeg: number, h = 110): number {
  const R = 6371;
  const a = Math.abs(gapDeg);
  if (a < 1e-6) return 90;
  // 地球の丸みを入れた仰角
  return atan2((R + h) * cos(a) - R, (R + h) * sin(a));
}

/**
 * その場所の空にオーロラが見えるか。輪の真下 (overhead) でなくても、上のはしの仰角が 3° 以上なら低い空 (low) に見える。
 * 夜 (太陽が −10° より低い) でないと見えない
 */
export function auroraSky(m: number, sunAlt: number, storm: boolean): 'overhead' | 'low' | null {
  if (sunAlt > -10) return null;
  const gap = ovalGap(m, storm);
  if (gap === 0) return 'overhead';
  return auroraElevation(gap, 250) >= 3 ? 'low' : null;
}
