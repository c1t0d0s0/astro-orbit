import { cos, norm360, sin } from './math';
import { centuries } from './time';

// 地球から見た太陽の位置 (Meeus『天文アルゴリズム』25 章の低精度の式。誤差 0.01° 程度)

export interface SunPosition {
  /** 視黄経 (°)。0° が春分点、90° が夏至点 */
  lon: number;
  /** 地球との距離 (天文単位) */
  dist: number;
  /** 平均近点角 (°)。0° のとき地球は太陽にいちばん近い (近日点) */
  anomaly: number;
}

export function sunPosition(jd: number): SunPosition {
  const t = centuries(jd);
  const l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
  const m = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
  const e = 0.016708634 - 0.000042037 * t - 0.0000001267 * t * t;
  const c = (1.914602 - 0.004817 * t - 0.000014 * t * t) * sin(m) + (0.019993 - 0.000101 * t) * sin(2 * m) + 0.000289 * sin(3 * m);
  const trueLon = l0 + c;
  const v = m + c;
  const dist = (1.000001018 * (1 - e * e)) / (1 + e * cos(v));
  const omega = 125.04 - 1934.136 * t;
  return { lon: norm360(trueLon - 0.00569 - 0.00478 * sin(omega)), dist, anomaly: norm360(m) };
}
