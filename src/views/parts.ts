import * as THREE from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Stage } from '../three/stage';
import { softTexture } from '../three/textures';

// 地学の画面で共通に使う部品 (ラベル・つぶ・カメラの置き方・決まった乱数)

/** いつも同じ値になる 0〜1 の乱数 (つぶの位置を時刻だけで決めるため) */
export function hash(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 0〜1 におさめる */
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** a から b へ 0〜1 でなめらかに変わる */
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 名前のラベルをまとめて、表示の切りかえ「名前」でいっしょに出し入れする */
export class Labels {
  readonly list: CSS2DObject[] = [];
  constructor(private readonly stage: Stage) {}

  add(parent: THREE.Object3D, text: string, at: THREE.Vector3 | [number, number, number], cls = ''): CSS2DObject {
    const l = this.stage.label(text, cls);
    if (Array.isArray(at)) l.position.set(...at);
    else l.position.copy(at);
    parent.add(l);
    this.list.push(l);
    return l;
  }

  show(on: boolean): void {
    for (const l of this.list) l.visible = on && l.parent!.visible;
  }
}

/**
 * やわらかい丸いつぶ (雲・火山灰・水しぶきなど) n 個。位置と色は update でつぶごとに書きかえる。
 * 見せないつぶは hide で画面の外に出す
 */
export class Particles {
  readonly points: THREE.Points;
  readonly pos: THREE.BufferAttribute;
  readonly col: THREE.BufferAttribute;

  constructor(
    readonly n: number,
    size: number,
    opts: { opacity?: number; additive?: boolean; color?: number; texture?: THREE.Texture } = {},
  ) {
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('color', this.col);
    const mat = new THREE.PointsMaterial({
      size,
      map: opts.texture ?? softTexture(),
      vertexColors: true,
      color: opts.color ?? 0xffffff,
      transparent: true,
      opacity: opts.opacity ?? 0.9,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < n; i++) this.hide(i);
  }

  set(i: number, x: number, y: number, z: number): void {
    this.pos.setXYZ(i, x, y, z);
  }

  color(i: number, c: THREE.Color): void {
    this.col.setXYZ(i, c.r, c.g, c.b);
  }

  hide(i: number): void {
    this.pos.setXYZ(i, 0, -1e4, 0);
  }

  done(): void {
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
  }
}

/** カメラを pos に置いて target を見る (縦長の画面では、fit の倍率だけ遠ざける) */
export function placeCamera(stage: Stage, pos: [number, number, number], target: [number, number, number], base = 1.25): void {
  const k = stage.fit(base);
  const t = new THREE.Vector3(...target);
  stage.controls.target.copy(t);
  stage.camera.position.set(...pos).sub(t).multiplyScalar(k).add(t);
  stage.controls.update();
  stage.invalidate();
}

/** 箱の中 (min〜max) だけをかくための切り取り面 */
export function boxClip(min: [number, number, number], max: [number, number, number]): THREE.Plane[] {
  return [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -min[0]),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), max[0]),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -min[1]),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), max[1]),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -min[2]),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), max[2]),
  ];
}

/** x-y 面の多角形を、z の向きに depth だけのばした立体 (断面ブロックの層に使う) */
export function slab(points: [number, number][], z0: number, z1: number, color: number, opts: { opacity?: number } = {}): THREE.Mesh {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false });
  geo.translate(0, 0, z0);
  const opacity = opts.opacity ?? 1;
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
}

/** 地面 (x-z 面) の上の、高さ関数 height(x, z) の面。色は color(x, z, y) で頂点ごとに決める */
export function terrain(
  w: number,
  d: number,
  nx: number,
  nz: number,
  height: (x: number, z: number) => number,
  color: (x: number, z: number, y: number, out: THREE.Color) => void,
  center: [number, number] = [0, 0],
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, d, nx, nz).rotateX(-Math.PI / 2);
  geo.translate(center[0], 0, center[1]);
  const pos = geo.getAttribute('position');
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = height(x, z);
    pos.setY(i, y);
    color(x, z, y, c);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}
