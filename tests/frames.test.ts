import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { equatorialVector, localSiderealTime, toHorizontal } from '../src/astro/coords';
import { seasonPoint } from '../src/astro/events';
import { bodiesAt } from '../src/astro/state';
import { earthQuaternion, eclLonLat, onGlobe, skyMatrix } from '../src/three/frames';

// 3D の画面の向きが、天文計算と合っているか

/** 宇宙の画面で、時刻 ms に緯度 lat・経度 lon の地点の真上の向きと、そこから太陽への向き */
function local(ms: number, lat: number, lon: number) {
  const b = bodiesAt(ms);
  const q = earthQuaternion(b.gmst, b.eps);
  const up = onGlobe(lat, lon).applyQuaternion(q);
  const earth = eclLonLat(b.sun.lon + 180, 0).multiplyScalar(20);
  const toSun = earth.clone().negate().normalize();
  return { up, toSun };
}

describe('宇宙の画面の地球の向き', () => {
  it('地点の真上と太陽の向きの角度が、地上で計算した太陽の高度と合う', () => {
    for (const [ms, lat, lon] of [
      [Date.UTC(2026, 5, 21, 3), 35.68, 139.77],
      [Date.UTC(2026, 11, 21, 23), 35.68, 139.77],
      [Date.UTC(2026, 2, 20, 12), -33.87, 151.21],
      [Date.UTC(2026, 8, 1, 18), 69.65, 18.96],
    ] as const) {
      const { up, toSun } = local(ms, lat, lon);
      const b = bodiesAt(ms);
      const alt = toHorizontal(b.sun, lat, localSiderealTime(b.gmst, lon)).alt;
      // 太陽までの距離が有限なので、少しだけずれる (地球の半径 1、軌道の半径 20)
      expect(Math.asin(up.dot(toSun)) * (180 / Math.PI)).toBeCloseTo(alt, 0);
    }
  });

  it('夏至には、北極圏の中はどの経度でも太陽の光が当たっている', () => {
    const ms = seasonPoint(2026, 'summer');
    for (let lon = -180; lon < 180; lon += 15) {
      const { up, toSun } = local(ms, 67.5, lon);
      expect(up.dot(toSun)).toBeGreaterThan(0);
    }
  });
});

describe('地上の画面の空の向き', () => {
  it('太陽の位置が、方位・高度の計算と合う (x 東・y 上・z 南)', () => {
    const ms = Date.UTC(2026, 5, 21, 0);
    const b = bodiesAt(ms);
    const lst = localSiderealTime(b.gmst, 139.77);
    const v = new THREE.Vector3(...equatorialVector(b.sun)).applyMatrix4(skyMatrix(35.68, lst));
    const h = toHorizontal(b.sun, 35.68, lst);
    const rad = Math.PI / 180;
    expect(v.y).toBeCloseTo(Math.sin(h.alt * rad), 5);
    expect(v.x).toBeCloseTo(Math.cos(h.alt * rad) * Math.sin(h.az * rad), 5);
    expect(v.z).toBeCloseTo(-Math.cos(h.alt * rad) * Math.cos(h.az * rad), 5);
  });
});
