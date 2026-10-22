import * as THREE from 'three';
import { cos, sin } from '../astro/math';
import { earthTexture, glowTexture, moonTexture } from './textures';

// 太陽・地球・月と、線の部品

export const COLORS = {
  orbit: 0x6aa893,
  axis: 0xffe36e,
  equator: 0xffffff,
  arctic: 0x8fd3ff,
  tropic: 0xffb26b,
  place: 0xff5a4e,
  summer: 0xff7a6b,
  equinox: 0x7fd18b,
  winter: 0x7fb4ff,
  moonPath: 0xd8d2c0,
  force: 0xffe36e,
};

/** 地球 (半径 r)。経度 0° が +x、北極が +y */
export function earthMesh(r = 1): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32), new THREE.MeshLambertMaterial({ map: earthTexture() }));
}

/**
 * 月 (半径 r)。地球に向いている側 (月面の経度 0°) が +z に来るので、lookAt(地球) でいつも同じ面が地球を向く
 */
export function moonMesh(r: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(r, 48, 24);
  geo.rotateY(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: moonTexture() }));
}

/** 光る太陽 (まわりの光つき) */
export function sunMesh(r: number): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 48, 24), new THREE.MeshBasicMaterial({ color: 0xffd75e })));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), depthWrite: false, transparent: true }));
  glow.scale.setScalar(r * 4.2);
  g.add(glow);
  return g;
}

/** 線 (点をつないだもの) */
export function polyline(points: THREE.Vector3[], color: number, opts: { opacity?: number; dashed?: boolean; closed?: boolean } = {}): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const opacity = opts.opacity ?? 1;
  const mat = opts.dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.2, transparent: opacity < 1, opacity })
    : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  const line = opts.closed ? new THREE.LineLoop(geo, mat) : new THREE.Line(geo, mat);
  if (opts.dashed) line.computeLineDistances();
  return line;
}

/** xz 面の円 (半径 r) */
export function circle(r: number, color: number, opts: { opacity?: number; dashed?: boolean; segments?: number } = {}): THREE.Line {
  const n = opts.segments ?? 128;
  const pts = Array.from({ length: n }, (_, i) => new THREE.Vector3(r * Math.cos((i / n) * Math.PI * 2), 0, r * Math.sin((i / n) * Math.PI * 2)));
  return polyline(pts, color, { ...opts, closed: true });
}

/** 地球の上の緯線 (半径 r の球の上) */
export function latitudeRing(lat: number, r: number, color: number, opts: { opacity?: number; dashed?: boolean } = {}): THREE.Line {
  const ring = circle(r * cos(lat), color, { ...opts, segments: 96 });
  ring.position.y = r * sin(lat);
  return ring;
}

/** 地軸 (y の向きに、長さ len の線) */
export function axisLine(len: number, color = COLORS.axis): THREE.Line {
  return polyline([new THREE.Vector3(0, -len / 2, 0), new THREE.Vector3(0, len / 2, 0)], color);
}

/** 矢印 */
export function arrow(dir: THREE.Vector3, origin: THREE.Vector3, len: number, color: number, head = 0.25): THREE.ArrowHelper {
  return new THREE.ArrowHelper(dir.clone().normalize(), origin, len, color, Math.min(head, len * 0.5), Math.min(head * 0.6, len * 0.3));
}

/** 矢印の向きと長さを変える */
export function setArrow(a: THREE.ArrowHelper, dir: THREE.Vector3, len: number, head = 0.25): void {
  if (len < 1e-4) {
    a.visible = false;
    return;
  }
  a.visible = true;
  a.setDirection(dir.clone().normalize());
  a.setLength(len, Math.min(head, len * 0.5), Math.min(head * 0.6, len * 0.3));
}
