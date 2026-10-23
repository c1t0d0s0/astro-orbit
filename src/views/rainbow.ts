import * as THREE from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { localSiderealTime, toHorizontal } from '../astro/coords';
import { bodiesAt } from '../astro/state';
import { RAINBOW_COLORS, rainbowAngle, rainbowIncidence, rayPath } from '../earth/optics';
import { polyline } from '../three/bodies';
import { horizonToScene } from '../three/frames';
import type { Stage } from '../three/stage';
import { glowTexture } from '../three/textures';
import { Labels, Particles, hash, placeCamera } from './parts';
import type { CameraPreset, Toggle, View, ViewContext } from './types';

// 虹。本当の日時と場所の太陽の位置から、太陽と反対の点 (対日点) のまわり 42° に虹をかく。
// 地上の画面と同じく、x が東、y が真上、z が南。観察する人は原点に立つ。
// 「雨つぶの中」の視点では、地面の下に大きくかいた雨つぶ 1 つの中の、光の道すじを見せる

/** 虹 (と雨) までの距離 */
const D = 16;
const EYE = new THREE.Vector3(0, 0.3, 0);
/** 大きな雨つぶを置く場所 (地面の下なので、ふだんの視点からは見えない) */
const DROP_AT = new THREE.Vector3(0, -40, 0);
const DROP_R = 3;

/** 空の色 (太陽の高さで変わる。ground.ts と同じ考え方) */
function skyColor(alt: number, out: THREE.Color): THREE.Color {
  const night = new THREE.Color(0x0b1630);
  const dusk = new THREE.Color(0x4a4a80);
  const day = new THREE.Color(0x7fb2e5);
  if (alt <= -12) return out.copy(night);
  if (alt <= -2) return out.copy(night).lerp(dusk, (alt + 12) / 10);
  if (alt <= 8) return out.copy(dusk).lerp(day, (alt + 2) / 10);
  return out.copy(day);
}

const TOGGLES: Toggle[] = [
  { key: 'rays', label: '光(ひかり)の道(みち)すじ' },
  { key: 'secondary', label: '副虹(ふくにじ) (外(そと)がわの虹(にじ))' },
  { key: 'rain', label: '雨(あめ)' },
  { key: 'labels', label: '名前(なまえ)' },
];
const CAMERAS: CameraPreset[] = [
  { key: 'behind', label: '人(ひと)のうしろから' },
  { key: 'side', label: '横(よこ)から' },
  { key: 'eye', label: '人(ひと)の目(め)で' },
  { key: 'drop', label: '雨(あめ)つぶの中(なか)' },
];

/** 対日点のまわり angle (°) の円の上の点 (地面より下もふくむ)。axis は対日点の向き */
function conePoint(axis: THREE.Vector3, e1: THREE.Vector3, e2: THREE.Vector3, angle: number, phi: number, out: THREE.Vector3): THREE.Vector3 {
  const a = (angle * Math.PI) / 180;
  return out
    .copy(axis)
    .multiplyScalar(Math.cos(a))
    .addScaledVector(e1, Math.sin(a) * Math.cos(phi))
    .addScaledVector(e2, Math.sin(a) * Math.sin(phi))
    .multiplyScalar(D)
    .add(EYE);
}

const SEG = 160;

export class RainbowView implements View {
  readonly id = 'rainbow' as const;
  readonly toggles = TOGGLES;
  readonly cameras = CAMERAS;
  readonly defaults: Record<string, boolean> = { rays: true, secondary: true, rain: true, labels: true };

  private readonly labels: Labels;
  private readonly primary: THREE.Mesh;
  private readonly secondary: THREE.Mesh;
  private readonly sun: THREE.Sprite;
  private readonly ground: THREE.Mesh;
  private readonly rays = new THREE.Group();
  private readonly rain: Particles;
  private readonly cloud: Particles;
  private readonly person = new THREE.Group();
  private readonly sky = new THREE.Color();
  private readonly antiLabel: CSS2DObject;
  private readonly arcLabel: CSS2DObject;
  private camKey = 'behind';
  private last: { ms: number; ctx: ViewContext } | null = null;
  /** 対日点の向き (カメラを合わせるのに使う) */
  private readonly anti = new THREE.Vector3(0, 0, -1);

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    this.labels = new Labels(stage);
    root.add(new THREE.AmbientLight(0xffffff, 0.85));
    const light = new THREE.DirectionalLight(0xffffff, 0.7);
    light.position.set(-5, 6, 4);
    root.add(light);

    this.ground = new THREE.Mesh(new THREE.CircleGeometry(30, 72).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6f9a55 }));
    root.add(this.ground);
    for (const [name, x, z] of [
      ['北(きた)', 0, -1],
      ['東(ひがし)', 1, 0],
      ['南(みなみ)', 0, 1],
      ['西(にし)', -1, 0],
    ] as const) this.labels.add(root, name, [x * 22, 0.3, z * 22], 'is-dir');

    // 観察する人
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.3, 12), new THREE.MeshLambertMaterial({ color: 0xff7a5c }));
    body.position.y = 0.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshLambertMaterial({ color: 0xffd9b8 }));
    head.position.y = 0.36;
    this.person.add(body, head);
    root.add(this.person);

    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
    this.sun.scale.setScalar(4);
    root.add(this.sun);
    this.labels.add(this.sun, '太陽(たいよう)', [0, 0.35, 0], 'is-sun');

    // 虹 (色ごとの輪をつないだ帯)。地面より下は切りとる
    const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
    this.primary = this.band(clip, 0.85);
    this.secondary = this.band(clip, 0.4);
    root.add(this.primary, this.secondary);
    this.arcLabel = this.labels.add(root, '虹(にじ) (対日点(たいじつてん)から約(やく)42°)', [0, 0, 0], 'is-small');
    this.antiLabel = this.labels.add(root, '対日点(たいじつてん) (太陽(たいよう)と反対(はんたい)の点(てん))', [0, 0, 0], 'is-small');

    this.rain = new Particles(500, 0.12, { opacity: 0.6, color: 0xcfe3ff });
    this.cloud = new Particles(260, 4, { opacity: 0.55 });
    root.add(this.rain.points, this.cloud.points);
    root.add(this.rays);

    this.buildDrop(root);

    stage.controls.minDistance = 0.01;
    stage.controls.maxDistance = 60;
  }

  /** 色の帯の形 (幾何は update で、対日点の向きに合わせて書きかえる) */
  private band(clip: THREE.Plane[], opacity: number): THREE.Mesh {
    const rings = RAINBOW_COLORS.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rings * (SEG + 1) * 3), 3));
    const col = new Float32Array(rings * (SEG + 1) * 3);
    const c = new THREE.Color();
    RAINBOW_COLORS.forEach((rc, j) => {
      c.setHex(rc.color);
      for (let i = 0; i <= SEG; i++) col.set([c.r, c.g, c.b], (j * (SEG + 1) + i) * 3);
    });
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx: number[] = [];
    for (let j = 0; j < rings - 1; j++)
      for (let i = 0; i < SEG; i++) {
        const a = j * (SEG + 1) + i;
        const b = a + SEG + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    geo.setIndex(idx);
    return new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, clippingPlanes: clip }),
    );
  }

  /** 大きな雨つぶと、その中の光の道すじ (主虹: 1 回反射)。色ごとに出ていく向きが少しちがう */
  private buildDrop(root: THREE.Object3D): void {
    const g = new THREE.Group();
    g.position.copy(DROP_AT);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(DROP_R, 48, 24), new THREE.MeshLambertMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.25, depthWrite: false })));
    g.add(polyline(Array.from({ length: 97 }, (_, i) => new THREE.Vector3(DROP_R * Math.cos((i / 96) * Math.PI * 2), DROP_R * Math.sin((i / 96) * Math.PI * 2), 0)), 0xcfe8ff, { opacity: 0.8 }));
    const to3 = ([x, y]: [number, number]) => new THREE.Vector3(x * DROP_R, y * DROP_R, 0.01);
    // 太陽の光 (白) は左から入る。入る高さは、虹の光が集まる入射角に合わせる
    const n0 = 1.333;
    const b = Math.sin(rainbowIncidence(n0, 1));
    const white = rayPath(n0, b, 1);
    g.add(polyline([to3(white[0]), to3(white[1])], 0xffffff));
    for (const rc of [RAINBOW_COLORS[0], RAINBOW_COLORS[3], RAINBOW_COLORS[6]]) {
      const path = rayPath(rc.n, b, 1).slice(1);
      g.add(polyline(path.map(to3), rc.color));
    }
    this.labels.add(g, '太陽(たいよう)の光(ひかり)', [-DROP_R * 1.9, b * DROP_R + 0.5, 0], 'is-small');
    this.labels.add(g, '屈折(くっせつ)', [-DROP_R * 0.95, b * DROP_R + 0.6, 0], 'is-small');
    this.labels.add(g, '反射(はんしゃ)', [DROP_R * 1.2, -0.6, 0], 'is-small');
    const out = rayPath(RAINBOW_COLORS[0].n, b, 1);
    const end = out[out.length - 1];
    this.labels.add(g, '赤(あか)', to3(end).add(new THREE.Vector3(-0.3, -0.3, 0)), 'is-small');
    const outV = rayPath(RAINBOW_COLORS[6].n, b, 1);
    this.labels.add(g, 'むらさき', to3(outV[outV.length - 1]).add(new THREE.Vector3(0.6, 0.2, 0)), 'is-small');
    this.labels.add(g, `入(はい)った光(ひかり)と約(やく)${Math.round(rainbowAngle(n0))}°の向(む)きに出(で)る`, [-DROP_R * 1.6, -DROP_R * 1.35, 0], 'is-small');
    root.add(g);
  }

  update(ms: number, ctx: ViewContext): void {
    this.last = { ms, ctx };
    const o = ctx.options;
    const b = bodiesAt(ms);
    const { lat, lon } = ctx.place;
    const sun = toHorizontal(b.sun, lat, localSiderealTime(b.gmst, lon));
    const sunDir = horizonToScene(sun.alt, sun.az);
    const anti = sunDir.clone().negate();
    this.anti.copy(anti);

    // 空の色と、太陽
    skyColor(sun.alt, this.sky);
    this.stage.background.copy(this.camKey === 'drop' ? new THREE.Color(0x14233a) : this.sky);
    const light = Math.max(0, Math.min(1, (sun.alt + 6) / 14));
    (this.ground.material as THREE.MeshLambertMaterial).color.setHex(0x6f9a55).multiplyScalar(0.3 + 0.7 * light);
    this.sun.position.copy(sunDir).multiplyScalar(26);
    this.sun.visible = sun.alt > -2;

    // 虹の帯: 対日点のまわりに、色ごとの角度で輪をかく
    const e1 = new THREE.Vector3(0, 1, 0).addScaledVector(anti, -anti.y).normalize();
    const e2 = anti.clone().cross(e1).normalize();
    const p = new THREE.Vector3();
    const fill = (mesh: THREE.Mesh, k: number) => {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      RAINBOW_COLORS.forEach((rc, j) => {
        const ang = rainbowAngle(rc.n, k);
        for (let i = 0; i <= SEG; i++) {
          conePoint(anti, e1, e2, ang, (i / SEG) * Math.PI * 2, p);
          pos.setXYZ(j * (SEG + 1) + i, p.x, p.y, p.z);
        }
      });
      pos.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
    };
    fill(this.primary, 1);
    fill(this.secondary, 2);
    // 太陽が出ていて、雨がふっているときだけ見える
    const visible = sun.alt > -1 && o.rain !== false;
    this.primary.visible = visible;
    this.secondary.visible = visible && o.secondary !== false;
    (this.primary.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.min(1, (sun.alt + 1) / 4);

    // 雨と雲 (太陽と反対がわ)
    const ax = new THREE.Vector3(anti.x, 0, anti.z).normalize();
    if (ax.lengthSq() < 0.5) ax.set(0, 0, -1);
    const side = new THREE.Vector3(-ax.z, 0, ax.x);
    for (let i = 0; i < this.rain.n; i++) {
      if (o.rain === false) {
        this.rain.hide(i);
        continue;
      }
      const d = D * (0.75 + 0.5 * hash(i, 1));
      const w = (hash(i, 2) - 0.5) * 26;
      const y = hash(i, 3) * 9;
      this.rain.set(i, ax.x * d + side.x * w, y, ax.z * d + side.z * w);
    }
    this.rain.done();
    for (let i = 0; i < this.cloud.n; i++) {
      if (o.rain === false) {
        this.cloud.hide(i);
        continue;
      }
      const d = D * (0.8 + 0.6 * hash(i, 4));
      const w = (hash(i, 5) - 0.5) * 34;
      this.cloud.set(i, ax.x * d + side.x * w, 9.5 + hash(i, 6) * 2.5, ax.z * d + side.z * w);
      this.cloud.color(i, new THREE.Color(0x9aa4b0).multiplyScalar(0.7 + 0.3 * light));
    }
    this.cloud.done();

    // 光の道すじ: 太陽 → 虹のてっぺんの雨つぶ → 目。太陽 → 目 → 対日点の線
    this.disposeRays();
    const showRays = o.rays !== false && visible;
    this.rays.visible = showRays;
    const topAng = rainbowAngle(1.333);
    conePoint(anti, e1, e2, topAng, 0, p);
    const drop = p.clone();
    const antiPt = anti.clone().multiplyScalar(D).add(EYE);
    if (showRays) {
      const far = sunDir.clone().multiplyScalar(24);
      this.rays.add(polyline([drop.clone().add(far), drop, EYE.clone()], 0xfff1a8));
      this.rays.add(polyline([EYE.clone().add(far), EYE.clone(), antiPt], 0xffffff, { dashed: true, opacity: 0.8 }));
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.position.copy(antiPt);
      this.rays.add(m);
    }
    this.antiLabel.position.copy(antiPt).add(new THREE.Vector3(0, -0.6, 0));
    this.arcLabel.position.copy(drop).add(new THREE.Vector3(0, 0.8, 0));
    this.labels.show(o.labels !== false);
    this.antiLabel.visible = showRays && o.labels !== false;
    this.arcLabel.visible = visible && drop.y > 0 && o.labels !== false;
    if (this.camKey === 'eye') this.lookAnti();
    this.stage.invalidate();
  }

  private disposeRays(): void {
    for (const c of [...this.rays.children]) {
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      this.rays.remove(c);
    }
  }

  /** 人の目の位置から、虹のほう (対日点の方位) を向く */
  private lookAnti(): void {
    const dir = new THREE.Vector3(this.anti.x, 0, this.anti.z).normalize();
    if (dir.lengthSq() < 0.5) dir.set(0, 0, -1);
    dir.y = 0.35;
    this.stage.camera.position.copy(EYE);
    this.stage.controls.target.copy(EYE).addScaledVector(dir.normalize(), 0.01);
    this.stage.controls.update();
  }

  setCamera(key: string): void {
    this.camKey = key;
    const c = this.stage.controls;
    const cam = this.stage.camera;
    c.enableZoom = key !== 'eye';
    c.rotateSpeed = key === 'eye' ? -0.4 : 1;
    c.minDistance = key === 'eye' ? 0.01 : 2;
    c.maxDistance = key === 'eye' ? 0.01 : 60;
    cam.fov = key === 'eye' ? 75 : 45;
    cam.updateProjectionMatrix();
    // 虹は太陽と反対がわにあるので、カメラは太陽のがわ (人のうしろ) に置く
    const back = this.anti.clone().setY(0).normalize().negate();
    if (back.lengthSq() < 0.5) back.set(0, 0, 1);
    if (key === 'drop') placeCamera(this.stage, [DROP_AT.x, DROP_AT.y, DROP_AT.z + 15], [DROP_AT.x, DROP_AT.y, DROP_AT.z], 1.2);
    else if (key === 'eye') this.lookAnti();
    else if (key === 'side') {
      const s = new THREE.Vector3(-back.z, 0, back.x);
      placeCamera(this.stage, [s.x * 26, 6, s.z * 26], [-back.x * 6, 3, -back.z * 6], 1.3);
    } else placeCamera(this.stage, [back.x * 10, 4, back.z * 10], [-back.x * 10, 3.5, -back.z * 10], 1.3);
    if (this.last) this.update(this.last.ms, this.last.ctx);
  }
}
