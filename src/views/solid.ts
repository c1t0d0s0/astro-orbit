import * as THREE from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { VP, VS, arrival } from '../earth/quake';
import { SEA_KM, SOURCE_KM, depthAt, frontAt, kmh, surfaceAt, travelTime, tsunamiSpeed } from '../earth/tsunami';
import { arrow, polyline, setArrow } from '../three/bodies';
import type { Stage } from '../three/stage';
import { Labels, Particles, boxClip, clamp01, hash, placeCamera, slab, smooth } from './parts';
import type { CameraPreset, Toggle, View, ViewContext } from './types';

// 大地の動き: 地震 (quake)・津波 (tsunami)・火山 (volcano)。どれも「はじまりからの時間」で動く

// ======== 地震 ========
// 日本付近を東西に切った断面ブロック。東 (+x) の海のプレートが、西の陸のプレートの下にしずみこむ。
// 1 は 20 km。震源から P 波・S 波の球が広がり、陸の地震計 A〜D に順に着く

const KM = 20;
const BLOCK = { x: 12, z: 6, bottom: -6 };
/** 震源 (プレートの境目の上、深さ約 24 km) */
export const HYPO = new THREE.Vector3(2.5, -1.22, 0);
/** 地震計 [名前, x, z] (陸の上) */
export const STATIONS: [string, number, number][] = [
  ['A', 0, 1.2],
  ['B', -3.2, -1.6],
  ['C', -6.6, 1.8],
  ['D', -10.2, -0.8],
];
/** 地震計 i までの震源距離 (km) */
export const stationDistance = (i: number) => new THREE.Vector3(STATIONS[i][1], 0.12, STATIONS[i][2]).distanceTo(HYPO) * KM;
/** プレートの境目の上の面 (海溝 x=4 から西へ 30° でしずむ) */
const slabTop = (x: number) => (x >= 4 ? -0.35 : -0.35 - (4 - x) * Math.tan(Math.PI / 6));
/** 海のプレートの厚さのまん中を、東のはし (s=0) から s だけ進んだ点 [x, y] と傾き (rad) */
const SLAB_FLAT = BLOCK.x - 4;
const SLAB_LEN = SLAB_FLAT + 9.5;
function slabMid(s: number): [number, number, number] {
  if (s < SLAB_FLAT) return [BLOCK.x - s, -0.95, 0];
  const u = s - SLAB_FLAT;
  const a = Math.PI / 6;
  return [4 - u * Math.cos(a) + 0.6 * Math.sin(a), -0.35 - u * Math.sin(a) - 0.6 * Math.cos(a), a];
}
/** プレートの動きの目印の間かく・進む速さ (はじまりからの 1 秒で。本当は 1 年に数 cm なので、ずっと速くしている) */
const MARK_GAP = 1;
const MARK_SPEED = 0.4;

const QUAKE_TOGGLES: Toggle[] = [
  { key: 'pWave', label: 'P波(は) (はじめの小(ちい)さなゆれ)' },
  { key: 'sWave', label: 'S波(は) (あとの大(おお)きなゆれ)' },
  { key: 'plates', label: 'プレートの動(うご)き' },
  { key: 'stations', label: '地震計(じしんけい)' },
  { key: 'labels', label: '名前(なまえ)' },
];
const QUAKE_CAMERAS: CameraPreset[] = [
  { key: 'tilt', label: 'ななめから' },
  { key: 'section', label: '断面(だんめん)' },
  { key: 'top', label: '上(うえ)から' },
];

const C_P = 0xffd23f;
const C_S = 0xff5a4e;

export class QuakeView implements View {
  readonly id = 'quake' as const;
  readonly toggles = QUAKE_TOGGLES;
  readonly cameras = QUAKE_CAMERAS;
  readonly defaults: Record<string, boolean> = { pWave: true, sWave: true, plates: false, stations: true, labels: true };

  private readonly labels: Labels;
  private readonly pBall: THREE.Mesh;
  private readonly sBall: THREE.Mesh;
  private readonly pRing: THREE.Line;
  private readonly sRing: THREE.Line;
  private readonly stations: THREE.Mesh[] = [];
  private readonly stationGroup = new THREE.Group();
  private readonly plateGroup = new THREE.Group();
  private readonly plateMarks: THREE.Mesh[] = [];

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x0f1c2e);
    this.labels = new Labels(stage);
    root.add(new THREE.AmbientLight(0xffffff, 0.75));
    const light = new THREE.DirectionalLight(0xffffff, 1.1);
    light.position.set(4, 10, 8);
    root.add(light);

    const { x: X, z: Z, bottom: B } = BLOCK;
    // マントル (いちばん下)
    root.add(slab([[-X, B], [X, B], [X, -1.6], [-X, -1.6]], -Z + 0.02, Z - 0.02, 0xc4704a));
    // 海のプレート (しずみこむ板)
    const top: [number, number][] = [];
    for (let x = X; x >= -5.8; x -= 0.5) top.push([x, Math.max(B, slabTop(x))]);
    const bottom: [number, number][] = [];
    for (let x = -3.7; x <= X; x += 0.5) bottom.push([x, Math.max(B, slabTop(x) - 1.2)]);
    root.add(slab([...top, [-5.8, B], ...bottom, [X, -1.55]], -Z, Z, 0x6f7f95));
    // 陸のプレート (上の面は海岸 x=1 まで陸、そこから海溝まで下がる)
    const land: [number, number][] = [[-X, -1.6], [-X, 0.12], [1, 0.12], [3.8, -0.33]];
    for (let x = 3.8; x >= 1.83; x -= 0.25) land.push([x, slabTop(x) - 0.01]);
    land.push([1.83, -1.6]);
    root.add(slab(land, -Z, Z, 0x9c7b55));
    // 陸の上の面 (緑) と海
    const ground = new THREE.Mesh(new THREE.BoxGeometry(X + 1, 0.04, 2 * Z), new THREE.MeshLambertMaterial({ color: 0x6f9a55 }));
    ground.position.set((-X + 1) / 2, 0.14, 0);
    root.add(ground);
    root.add(slab([[1, 0.12], [X, 0.12], [X, -0.35], [3.8, -0.35]], -Z, Z, 0x3d7fd0, { opacity: 0.55 }));

    // 震源と震央
    const hypo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
    hypo.position.copy(HYPO);
    root.add(hypo);
    const epi = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    epi.position.set(HYPO.x, 0.14, HYPO.z);
    root.add(epi);
    root.add(polyline([HYPO.clone(), epi.position.clone()], 0xffffff, { dashed: true, opacity: 0.9 }));
    this.labels.add(root, '震源(しんげん)', [HYPO.x + 0.9, HYPO.y - 0.3, HYPO.z + Z * 0.1]);
    this.labels.add(root, '震央(しんおう)', [HYPO.x, 0.75, HYPO.z]);
    this.labels.add(root, '陸(りく)のプレート', [-8, -0.8, Z]);
    this.labels.add(root, '海(うみ)のプレート', [8.5, -0.95, Z]);
    this.labels.add(root, 'マントル', [-6, -4.6, Z]);
    this.labels.add(root, '海溝(かいこう)', [4.2, 0.5, -Z]);

    // P 波・S 波 (ブロックの中だけ。地面の中を進むので、岩をすかして見せる)
    const clip = boxClip([-X, B, -Z], [X, 0.2, Z]);
    const ball = (color: number) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, depthTest: false, clippingPlanes: clip }),
      );
      m.renderOrder = 10;
      return m;
    };
    this.pBall = ball(C_P);
    this.sBall = ball(C_S);
    this.pBall.position.copy(HYPO);
    this.sBall.position.copy(HYPO);
    const ring = (color: number) => {
      const pts = Array.from({ length: 129 }, (_, i) => new THREE.Vector3(Math.cos((i / 128) * Math.PI * 2), 0, Math.sin((i / 128) * Math.PI * 2)));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, clippingPlanes: clip }));
      l.position.set(HYPO.x, 0.2, HYPO.z);
      return l;
    };
    this.pRing = ring(C_P);
    this.sRing = ring(C_S);
    root.add(this.pBall, this.sBall, this.pRing, this.sRing);

    // 地震計
    STATIONS.forEach(([name, x, z]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 16), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      m.position.set(x, 0.4, z);
      this.stations.push(m);
      this.stationGroup.add(m);
      this.labels.add(this.stationGroup, `${name}地点(ちてん)`, [x, 1.05, z], 'is-small');
    });
    root.add(this.stationGroup);

    // プレートの動き (海のプレートは 1 年に数 cm ずつ西へ動き、陸のプレートの先を引きずりこむ)
    this.plateGroup.add(arrow(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(10.5, -0.2, Z + 0.3), 3, 0xffffff, 0.5));
    const down = new THREE.Vector3(-Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6), 0);
    this.plateGroup.add(arrow(down, new THREE.Vector3(0, slabTop(0) - 0.6, Z + 0.3), 2.6, 0xffffff, 0.45));
    this.labels.add(this.plateGroup, '1年(ねん)に数(すう)cm', [9, 0.5, Z + 0.3], 'is-small');
    // 海のプレートの断面の目印。再生すると、しずみこむ向きに流れていく
    const markGeo = new THREE.BoxGeometry(0.1, 0.9, 0.04);
    const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    for (let i = 0; i < Math.floor(SLAB_LEN / MARK_GAP); i++) {
      const m = new THREE.Mesh(markGeo, markMat);
      this.plateMarks.push(m);
      this.plateGroup.add(m);
    }
    root.add(this.plateGroup);

    stage.controls.minDistance = 6;
    stage.controls.maxDistance = 70;
  }

  update(ms: number, ctx: ViewContext): void {
    const o = ctx.options;
    const t = ms / 1000;
    const rp = (VP * t) / KM;
    const rs = (VS * t) / KM;
    const depth = -HYPO.y;
    this.pBall.visible = o.pWave !== false && t > 0;
    this.sBall.visible = o.sWave !== false && t > 0;
    this.pBall.scale.setScalar(Math.max(rp, 1e-3));
    this.sBall.scale.setScalar(Math.max(rs, 1e-3));
    // 地面の上の波の先 (球と地面の交わり)
    const surf = (r: number) => Math.sqrt(Math.max(0, r * r - depth * depth));
    this.pRing.visible = this.pBall.visible && rp > depth;
    this.sRing.visible = this.sBall.visible && rs > depth;
    this.pRing.scale.set(surf(rp), 1, surf(rp));
    this.sRing.scale.set(surf(rs), 1, surf(rs));

    // 地震計: P 波が着くと黄色、S 波が着くと赤
    this.stationGroup.visible = o.stations !== false;
    this.stations.forEach((m, i) => {
      const d = stationDistance(i);
      const color = t >= arrival(d, VS) ? C_S : t >= arrival(d, VP) ? C_P : 0xdddddd;
      (m.material as THREE.MeshLambertMaterial).color.setHex(color);
      // ゆれている間は少し上下させる
      m.position.y = 0.4 + (t >= arrival(d, VP) && t < arrival(d, VS) + 30 ? 0.04 * Math.sin(t * 40 + i) : 0);
    });
    this.plateGroup.visible = !!o.plates;
    const shift = (t * MARK_SPEED) % MARK_GAP;
    this.plateMarks.forEach((m, i) => {
      const [x, y, a] = slabMid(i * MARK_GAP + shift);
      m.position.set(x, y, BLOCK.z + 0.03);
      m.rotation.z = a;
    });
    this.labels.show(o.labels !== false);
    this.stage.invalidate();
  }

  setCamera(key: string): void {
    if (key === 'section') placeCamera(this.stage, [0, -1.5, 30], [0, -2.2, 0], 1.6);
    else if (key === 'top') placeCamera(this.stage, [0, 30, 0.01], [0, 0, 0], 1.6);
    else placeCamera(this.stage, [14, 12, 22], [0, -1.5, 0], 1.6);
  }
}

// ======== 津波 ========
// 沖 (東・+x) から海岸 (西) までの海を、横から切った断面。1 は 20 km、深さは 2000 m で 1、海面の高さは 1 m で 0.12 にして強調する

const TX = (km: number) => km / KM - 10;
const DEPTH_Y = (m: number) => -m / 2000;
const ETA_Y = 0.12;
const TZ = 4;
const NX = 220;

const TSUNAMI_TOGGLES: Toggle[] = [
  { key: 'speed', label: '津波(つなみ)の速(はや)さ' },
  { key: 'depth', label: '海(うみ)の深(ふか)さ' },
  { key: 'labels', label: '名前(なまえ)' },
];
const TSUNAMI_CAMERAS: CameraPreset[] = [
  { key: 'tilt', label: 'ななめから' },
  { key: 'section', label: '断面(だんめん)' },
  { key: 'shore', label: '海岸(かいがん)' },
];

/** 陸の高さ (m)。海岸から内陸へ 1 km で 0.3 m ずつ上がる */
const landHeight = (km: number) => Math.max(0, -km) * 0.3;

export class TsunamiView implements View {
  readonly id = 'tsunami' as const;
  readonly toggles = TSUNAMI_TOGGLES;
  readonly cameras = TSUNAMI_CAMERAS;
  readonly defaults: Record<string, boolean> = { speed: true, depth: true, labels: true };

  private readonly labels: Labels;
  private readonly sea: THREE.Mesh;
  private readonly front: THREE.Mesh;
  private readonly flood: THREE.Mesh;
  /** 海面の頂点ごとの、海岸からの距離 (km) と、津波が着くまでの時間 */
  private readonly kms: number[] = [];
  private readonly taus: number[] = [];
  private readonly speedArrow: THREE.ArrowHelper;
  private readonly speedLabel: CSS2DObject;
  private readonly depthGroup = new THREE.Group();
  private readonly uplift: THREE.Mesh;

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x10233a);
    this.labels = new Labels(stage);
    root.add(new THREE.AmbientLight(0xffffff, 0.7));
    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(-4, 10, 8);
    root.add(light);

    // 海の底の断面 (前の面 z = TZ から奥まで)
    const floor: [number, number][] = [];
    for (let i = 0; i <= NX; i++) {
      const km = (SEA_KM * i) / NX;
      floor.push([TX(km), DEPTH_Y(depthAt(km))]);
    }
    root.add(slab([...floor, [TX(SEA_KM), -4.4], [TX(0), -4.4]], -TZ, TZ, 0x8a6a4a));
    // 陸 (海岸から 40 km 内陸まで)
    const land: [number, number][] = [];
    for (let km = 0; km >= -40; km -= 2) land.push([TX(km), landHeight(km) * ETA_Y]);
    root.add(slab([...land, [TX(-40), -4.4], [TX(0), -4.4]], -TZ, TZ, 0x6f9a55));
    // 家
    for (const [km, z] of [[-1.5, -1], [-2.5, 1.5], [-4, -2.5], [-6, 0.5], [-9, 2.5], [-14, -1.5]]) {
      const house = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), new THREE.MeshLambertMaterial({ color: 0xf2e6d0 }));
      house.position.set(TX(km), landHeight(km) * ETA_Y + 0.09, z);
      root.add(house);
    }
    this.labels.add(root, '陸(りく)', [TX(-30), 3.2, 0]);
    this.labels.add(root, '海岸(かいがん)', [TX(0), 1.2, TZ]);
    this.labels.add(root, '海溝(かいこう)', [TX(390), DEPTH_Y(7000) - 0.4, TZ]);

    // 海面 (頂点の高さを時刻ごとに変える)
    const geo = new THREE.PlaneGeometry(SEA_KM / KM, 2 * TZ, NX, 1).rotateX(-Math.PI / 2);
    geo.translate(TX(SEA_KM / 2), 0, 0);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const km = (pos.getX(i) + 10) * KM;
      this.kms.push(km);
      this.taus.push(travelTime(SOURCE_KM, km));
    }
    this.sea = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3d8ee0, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    root.add(this.sea);
    // 前の面の海水 (断面)
    const water: [number, number][] = floor.map(([x, y]) => [x, y]);
    this.front = slab([...water.reverse(), [TX(0), 0], [TX(SEA_KM), 0]], TZ - 0.01, TZ, 0x3d8ee0, { opacity: 0.35 });
    root.add(this.front);
    // 陸に上がった水
    this.flood = new THREE.Mesh(new THREE.PlaneGeometry(40 / KM, 2 * TZ).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6aa6e8, transparent: true, opacity: 0.75, depthWrite: false }));
    this.flood.position.set(TX(-20), 0, 0);
    root.add(this.flood);

    // 海の底が持ち上がるところ
    this.uplift = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 2 * TZ), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8 }));
    this.uplift.position.set(TX(SOURCE_KM), DEPTH_Y(depthAt(SOURCE_KM)) + 0.04, 0);
    root.add(this.uplift);
    this.labels.add(root, '海底(かいてい)が持(も)ち上(あ)がる', [TX(SOURCE_KM), DEPTH_Y(4000) - 0.5, TZ], 'is-small');

    // 速さの矢印と、深さの目盛り
    this.speedArrow = arrow(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 1, 0xffd23f, 0.3);
    root.add(this.speedArrow);
    this.speedLabel = this.labels.add(root, '', [0, 0, 0], 'is-small');
    for (const km of [20, 75, 200, 330]) {
      const d = Math.round(depthAt(km) / (depthAt(km) >= 1000 ? 100 : 10)) * (depthAt(km) >= 1000 ? 100 : 10);
      const tick = polyline([new THREE.Vector3(TX(km), 0, TZ), new THREE.Vector3(TX(km), DEPTH_Y(d), TZ)], 0xffffff, { dashed: true, opacity: 0.6 });
      this.depthGroup.add(tick);
      this.labels.add(this.depthGroup, `深(ふか)さ ${d.toLocaleString()} m`, [TX(km), DEPTH_Y(d) / 2, TZ + 0.1], 'is-small');
    }
    root.add(this.depthGroup);

    stage.controls.minDistance = 3;
    stage.controls.maxDistance = 70;
  }

  update(ms: number, ctx: ViewContext): void {
    const o = ctx.options;
    const t = ms / 1000;
    // 海面
    const pos = this.sea.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      // 起こったところでは、海底が持ち上がったぶんだけ、はじめから海面が高い
      pos.setY(i, surfaceAt(this.kms[i], t, this.taus[i]) * ETA_Y);
    }
    pos.needsUpdate = true;
    this.sea.geometry.computeVertexNormals();
    // 海岸に着いた津波が陸に上がる
    const atShore = surfaceAt(0.5, t, travelTime(SOURCE_KM, 0.5));
    this.flood.visible = atShore > 0.15;
    this.flood.position.y = atShore * ETA_Y;
    this.uplift.visible = t < 120;

    // 海岸へ向かう山の位置と速さ
    const km = frontAt(t);
    const v = tsunamiSpeed(depthAt(km));
    const showSpeed = o.speed !== false && km > 0.5 && t > 0;
    const x = TX(km);
    const y = surfaceAt(km, t, travelTime(SOURCE_KM, km)) * ETA_Y + 0.5;
    this.speedArrow.visible = showSpeed;
    if (showSpeed) {
      this.speedArrow.position.set(x, y, 0);
      setArrow(this.speedArrow, new THREE.Vector3(-1, 0, 0), 0.4 + v / 90, 0.3);
    }
    this.speedLabel.position.set(x, y + 0.6, 0);
    this.stage.setLabelText(this.speedLabel, `時速(じそく)約(やく)${Math.round(kmh(v) / 10) * 10} km`);
    this.depthGroup.visible = o.depth !== false;
    this.labels.show(o.labels !== false);
    this.speedLabel.visible = showSpeed;
    this.stage.invalidate();
  }

  setCamera(key: string): void {
    if (key === 'section') placeCamera(this.stage, [0, -0.8, 21], [0.5, -1, 0], 1.4);
    else if (key === 'shore') placeCamera(this.stage, [TX(30), 2.5, 7], [TX(-5), 0, 0], 1.1);
    else placeCamera(this.stage, [4, 9, 19], [-1, -1, 0], 1.6);
  }
}

// ======== 火山 ========
// マグマのねばりけがちがう 3 つの火山をならべる。左から、たて状火山 (弱い)・成層火山 (中くらい)・溶岩ドーム (強い)。
// 「断面」にすると、手前半分を切りとって、マグマだまりと火道 (マグマの通り道) を見せる

interface VolcanoType {
  key: string;
  name: string;
  x: number;
  radius: number;
  height: number;
  /** 半径 r (0〜radius) での高さ */
  profile(r: number): number;
  rock: number;
  magma: number;
  /** 灰を噴き上げる高さ (0 なら噴き上げない) */
  ash: number;
}

const VOLCANOES: VolcanoType[] = [
  {
    key: 'shield',
    name: 'たて状(じょう)火山(かざん)',
    x: -8,
    radius: 4,
    height: 1.2,
    profile: (r) => 1.2 * (1 - (r / 4) ** 1.7),
    rock: 0x3b3735,
    magma: 0xff5a1f,
    ash: 0,
  },
  {
    key: 'strato',
    name: '成層火山(せいそうかざん)',
    x: 0,
    radius: 2.8,
    height: 2.6,
    profile: (r) => (r < 0.18 ? 2.6 * (1 - 0.18 / 2.8) ** 1.8 - 0.12 : 2.6 * (1 - r / 2.8) ** 1.8),
    rock: 0x7a6e66,
    magma: 0xff7a2a,
    ash: 4.5,
  },
  {
    key: 'dome',
    name: '溶岩(ようがん)ドーム',
    x: 7,
    radius: 1.3,
    height: 1.3,
    profile: (r) => 1.3 * Math.sqrt(Math.max(0, 1 - (r / 1.3) ** 2)),
    rock: 0xc9c3b8,
    magma: 0xffb37a,
    ash: 8,
  },
];

const VOLCANO_TOGGLES: Toggle[] = [
  { key: 'section', label: '断面(だんめん)' },
  { key: 'lava', label: '溶岩(ようがん)' },
  { key: 'ash', label: '火山灰(かざんばい)・噴煙(ふんえん)' },
  { key: 'labels', label: '名前(なまえ)' },
];
const VOLCANO_CAMERAS: CameraPreset[] = [
  { key: 'all', label: '3つならべて' },
  { key: 'shield', label: 'たて状(じょう)火山(かざん)' },
  { key: 'strato', label: '成層火山(せいそうかざん)' },
  { key: 'dome', label: '溶岩(ようがん)ドーム' },
];

const HOUR = 3600;
/** マグマが上がってくる時間・噴火が始まる時刻 (秒) */
const ERUPT = 3 * HOUR;
const CHAMBER_Y = -2.6;
const ASH_N = 700;

/** 噴火の進み方 (時刻 t 秒から): マグマの高さ (0〜1)・溶岩の広がり (0〜1)・溶岩ドームの育ち方 (0〜1)・噴煙の強さ (0〜1) */
export function eruption(type: string, t: number) {
  const rise = clamp01(t / ERUPT);
  const after = Math.max(0, t - ERUPT);
  if (type === 'shield') return { rise, lava: smooth(0, 15 * HOUR, after), dome: 0, ash: 0, flow: 0 };
  if (type === 'strato') return { rise, lava: smooth(2 * HOUR, 14 * HOUR, after), dome: 0, ash: smooth(0, 0.5 * HOUR, after) * (1 - smooth(12 * HOUR, 20 * HOUR, after)), flow: 0 };
  // ねばりけが強いと、出口がふさがって圧力がたまり、あるときに爆発する
  const blast = smooth(5 * HOUR, 5.3 * HOUR, after) * (1 - smooth(9 * HOUR, 16 * HOUR, after));
  return { rise, lava: 0, dome: smooth(0, 5 * HOUR, after), ash: blast, flow: smooth(5.2 * HOUR, 6.2 * HOUR, after) * (1 - smooth(8 * HOUR, 11 * HOUR, after)) };
}

export class VolcanoView implements View {
  readonly id = 'volcano' as const;
  readonly toggles = VOLCANO_TOGGLES;
  readonly cameras = VOLCANO_CAMERAS;
  readonly defaults: Record<string, boolean> = { section: false, lava: true, ash: true, labels: true };

  private readonly labels: Labels;
  private readonly full = new THREE.Group();
  private readonly half = new THREE.Group();
  private readonly groundFull: THREE.Mesh;
  private readonly groundHalf: THREE.Mesh;
  private readonly magma: THREE.Mesh[] = [];
  private readonly lava: THREE.Mesh[] = [];
  private readonly domes: THREE.Mesh[] = [];
  private readonly ash: Particles;
  private readonly flow: Particles;
  private section = false;

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x5d89b8);
    this.labels = new Labels(stage);
    root.add(new THREE.AmbientLight(0xffffff, 0.7));
    const light = new THREE.DirectionalLight(0xffffff, 1.1);
    light.position.set(-6, 12, 9);
    root.add(light);

    // 地面 (上の面は緑、横は地層の茶色)
    const sideMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    const topMat = new THREE.MeshLambertMaterial({ color: 0x7fa65f });
    const mats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    this.groundFull = new THREE.Mesh(new THREE.BoxGeometry(26, 4, 12), mats);
    this.groundFull.position.set(-0.5, -2, 0);
    this.groundHalf = new THREE.Mesh(new THREE.BoxGeometry(26, 4, 6), mats);
    this.groundHalf.position.set(-0.5, -2, -3);
    root.add(this.groundFull, this.groundHalf);

    for (const v of VOLCANOES) {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 40; i++) {
        const r = (v.radius * i) / 40;
        pts.push(new THREE.Vector2(r, Math.max(0, v.profile(r))));
      }
      pts.reverse();
      const rockMat = new THREE.MeshLambertMaterial({ color: v.rock, side: THREE.DoubleSide });
      const whole = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), rockMat);
      whole.position.x = v.x;
      this.full.add(whole);
      // 奥の半分 (z < 0) と、切り口
      const back = new THREE.Mesh(new THREE.LatheGeometry(pts, 36, Math.PI / 2, Math.PI), rockMat);
      back.position.x = v.x;
      this.half.add(back);
      const cut = pts.map((p) => [p.x, p.y] as [number, number]);
      const outline: [number, number][] = [...cut.map(([r, y]) => [-r, y] as [number, number]).reverse(), ...cut.slice(1)];
      const face = new THREE.Mesh(
        new THREE.ShapeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)))),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(v.rock).lerp(new THREE.Color(0x8a6a4a), 0.4) }),
      );
      face.position.set(v.x, 0, 0.002);
      this.half.add(face);
      // 成層火山は、溶岩と火山灰が交互に重なった層
      if (v.key === 'strato') {
        for (const k of [0.25, 0.5, 0.75]) {
          const layer = cut.filter(([r]) => r <= v.radius * (1 - k * 0.15)).map(([r, y]) => [r, y * (1 - k)] as [number, number]);
          const line = [...layer.map(([r, y]) => new THREE.Vector3(v.x - r, y, 0.004)).reverse(), ...layer.slice(1).map(([r, y]) => new THREE.Vector3(v.x + r, y, 0.004))];
          this.half.add(polyline(line, 0x4d4540, { opacity: 0.8 }));
        }
      }
      // マグマだまりと火道 (切り口に平らにかく)
      const chamber = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: v.magma }));
      chamber.scale.set(v.key === 'shield' ? 1.6 : 1.1, 0.55, 1);
      chamber.position.set(v.x, CHAMBER_Y, 0.006);
      this.half.add(chamber);
      const conduit = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1), new THREE.MeshBasicMaterial({ color: v.magma }));
      this.magma.push(conduit);
      this.half.add(conduit);
      this.labels.add(this.half, 'マグマだまり', [v.x, CHAMBER_Y - 0.95, 0.3], 'is-small');
      this.labels.add(root, v.name, [v.x, v.height + 0.9, 0]);

      // 溶岩 (山の表面の上に、てっぺんから広がる)
      const lavaMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: v.magma, emissive: v.magma, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
      lavaMesh.position.x = v.x;
      this.lava.push(lavaMesh);
      root.add(lavaMesh);
      // 溶岩ドーム (てっぺんにもり上がる)
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xe0d6c6 }));
      dome.position.set(v.x, v.height - 0.05, 0);
      dome.visible = false;
      this.domes.push(dome);
      root.add(dome);
    }
    root.add(this.full, this.half);

    this.ash = new Particles(ASH_N, 1.8, { opacity: 0.7 });
    this.flow = new Particles(220, 1.4, { opacity: 0.8 });
    root.add(this.ash.points, this.flow.points);
    this.labels.add(root, '風(かぜ)の向(む)き →', [-2, 8.5, 0], 'is-small');

    stage.controls.minDistance = 3;
    stage.controls.maxDistance = 70;
    stage.controls.maxPolarAngle = Math.PI * 0.55;
  }

  /** 山の表面の、てっぺんから半径 r までをおおう溶岩の面 (向き phi0 から phiLen) */
  private lavaGeometry(v: VolcanoType, r: number, phi0: number, phiLen: number): THREE.BufferGeometry {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const rr = (r * i) / 24;
      pts.push(new THREE.Vector2(rr, v.profile(rr) + 0.03));
    }
    return new THREE.LatheGeometry(pts.reverse(), 48, phi0, phiLen);
  }

  update(ms: number, ctx: ViewContext): void {
    const o = ctx.options;
    const t = ms / 1000;
    this.section = !!o.section;
    this.full.visible = !this.section;
    this.half.visible = this.section;
    this.groundFull.visible = !this.section;
    this.groundHalf.visible = this.section;

    VOLCANOES.forEach((v, i) => {
      const e = eruption(v.key, t);
      // 火道の中をマグマが上がってくる
      const top = CHAMBER_Y + (v.height - CHAMBER_Y) * e.rise;
      const conduit = this.magma[i];
      conduit.scale.y = Math.max(0.01, top - CHAMBER_Y);
      conduit.position.set(v.x, (top + CHAMBER_Y) / 2, 0.008);

      // 溶岩: たて状火山は四方へ広く、成層火山は手前の谷にそって流れる
      const lava = this.lava[i];
      lava.geometry.dispose();
      const showLava = o.lava !== false && e.lava > 0.01;
      lava.visible = showLava;
      if (showLava) {
        const r = v.radius * (v.key === 'shield' ? 0.95 : 0.85) * e.lava;
        const full: [number, number] = this.section ? [Math.PI / 2, Math.PI] : [0, Math.PI * 2];
        const [p0, pl] = v.key === 'shield' ? full : this.section ? [Math.PI * 0.85, 0.3] : [-0.15, 0.3];
        lava.geometry = this.lavaGeometry(v, r, p0, pl);
      } else lava.geometry = new THREE.BufferGeometry();
      // 冷えると暗くなる
      const m = lava.material as THREE.MeshLambertMaterial;
      m.emissiveIntensity = 0.25 + 0.6 * (1 - smooth(10 * HOUR, 21 * HOUR, t));

      const dome = this.domes[i];
      dome.visible = v.key === 'dome' && e.dome > 0.01;
      dome.scale.set(0.55 * e.dome + 0.01, 0.6 * e.dome + 0.01, 0.55 * e.dome + 0.01);
    });

    // 噴煙と火山灰: てっぺんから上がって、上空の風で東 (+x) へ流れる
    const showAsh = o.ash !== false;
    const ashColor = new THREE.Color();
    const per = ASH_N / 2;
    for (let k = 0; k < ASH_N; k++) {
      const v = k < per ? VOLCANOES[1] : VOLCANOES[2];
      const e = eruption(v.key, t);
      const life = 1.5 * HOUR;
      // つぶ k は life ごとに生まれなおす (生まれる時刻はつぶごとにずらす)。生まれたときの噴火の強さで高さが決まる
      const age = (t + hash(k, 1) * life) % life;
      const birth = t - age;
      const strength = eruption(v.key, birth).ash;
      if (!showAsh || birth < ERUPT || strength < 0.05 || e.ash <= 0) {
        this.ash.hide(k);
        continue;
      }
      const f = age / life;
      const h = v.ash * strength * Math.min(1, f * 3) * (0.7 + 0.3 * hash(k, 2));
      const spread = 0.25 + f * 1.6;
      const drift = Math.max(0, f - 0.2) * 7;
      this.ash.set(k, v.x + (hash(k, 3) - 0.5) * spread + drift, v.height + h, (hash(k, 4) - 0.5) * spread);
      ashColor.setHex(v.key === 'dome' ? 0x8f8a86 : 0x9b958f).multiplyScalar(0.85 + 0.3 * hash(k, 5));
      this.ash.color(k, ashColor);
    }
    this.ash.done();

    // 火砕流 (溶岩ドームがくずれて、熱い灰と岩が山の斜面を流れ下る)
    const flowE = eruption('dome', t).flow;
    const dv = VOLCANOES[2];
    for (let k = 0; k < this.flow.n; k++) {
      if (!showAsh || flowE <= 0.01) {
        this.flow.hide(k);
        continue;
      }
      const ang = (hash(k, 6) - 0.5) * 1.6 + Math.PI / 2;
      const r = (0.3 + hash(k, 7) * 4.5) * flowE;
      this.flow.set(k, dv.x + Math.cos(ang) * r, Math.max(0, dv.profile(Math.min(r, dv.radius))) + 0.25 + hash(k, 8) * 0.5, Math.sin(ang) * r);
      this.flow.color(k, ashColor.setHex(0xa59a90));
    }
    this.flow.done();

    this.labels.show(o.labels !== false);
    this.stage.invalidate();
  }

  setCamera(key: string): void {
    const v = VOLCANOES.find((x) => x.key === key);
    if (v) placeCamera(this.stage, [v.x + 1, v.height + 2.5, v.radius * 2.4 + 4], [v.x, v.height * 0.4, 0], 1.2);
    else placeCamera(this.stage, [0, 6, 18], [0, 0.8, 0], 1.6);
  }
}

/** 地震計 i に P 波・S 波が着く時刻 (秒) と距離 (km)。いまのようすで使う */
export function stationTimes(i: number) {
  const d = stationDistance(i);
  return { name: STATIONS[i][0], d, p: arrival(d, VP), s: arrival(d, VS) };
}
