import * as THREE from 'three';
import { RAD, cos, sin, type Vec3 } from '../astro/math';

// 3D の画面の向き (three.js は y が上)。
//   宇宙の画面: 黄道 (地球の公転の面) を水平な面にする。x が春分点の方向、y が黄道の北
//   地上の画面: x が東、y が真上、z が南 (−z が北)

/** 黄道座標 (x: 春分点, z: 黄道の北) → 宇宙の画面 */
export const eclToScene = (v: Vec3, out = new THREE.Vector3()) => out.set(v[0], v[2], -v[1]);

/** 赤道座標 (x: 春分点, z: 天の北極) → 黄道座標 */
export const eqToEcl = (v: Vec3, eps: number): Vec3 => [v[0], v[1] * cos(eps) + v[2] * sin(eps), -v[1] * sin(eps) + v[2] * cos(eps)];

export const eqToScene = (v: Vec3, eps: number, out = new THREE.Vector3()) => eclToScene(eqToEcl(v, eps), out);

/** 黄経・黄緯の向き → 宇宙の画面 */
export const eclLonLat = (lon: number, lat: number, out = new THREE.Vector3()) => eclToScene([cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat)], out);

const bx = new THREE.Vector3();
const by = new THREE.Vector3();
const bz = new THREE.Vector3();
const basis = new THREE.Matrix4();

/**
 * 地球の球の向き。球のテクスチャは、経度 0° が球の +x、北極が +y、東経 90° が −z に来る (three.js の SphereGeometry)。
 * gmst はグリニッジ恒星時 (経度 0° の線が春分点からどれだけ回ったか)、eps は地軸のかたむき
 */
export function earthQuaternion(gmst: number, eps: number, out = new THREE.Quaternion()): THREE.Quaternion {
  eqToScene([cos(gmst), sin(gmst), 0], eps, bx);
  eqToScene([0, 0, 1], eps, by);
  eqToScene([sin(gmst), -cos(gmst), 0], eps, bz);
  return out.setFromRotationMatrix(basis.makeBasis(bx, by, bz));
}

/** 地球の球の上の、緯度・経度の場所 (球の中の向き。半径 1) */
export const onGlobe = (lat: number, lon: number, out = new THREE.Vector3()) => out.set(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));

/**
 * 赤道座標の向きを、緯度 lat・地方恒星時 lst の場所の地上の画面の向きにする行列。
 * 星座をまとめた入れ物にこの行列をつけると、星が日周運動する
 */
export function skyMatrix(lat: number, lst: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  const c = cos(lat);
  const s = sin(lat);
  // 地方恒星時の分だけ回して時角の向きにし、緯度の分だけかたむける
  const b = new THREE.Matrix4().set(0, 1, 0, 0, c, 0, s, 0, s, 0, -c, 0, 0, 0, 0, 1);
  return out.makeRotationZ(-lst * RAD).premultiply(b);
}

/** 方位・高度 → 地上の画面の向き */
export const horizonToScene = (alt: number, az: number, out = new THREE.Vector3()) => out.set(cos(alt) * sin(az), sin(alt), cos(alt) * cos(az) * -1);
