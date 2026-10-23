import * as THREE from 'three';
import { CURRENTS, WINDS } from '../data/currents';
import { arrow, earthMesh, polyline } from '../three/bodies';
import { onGlobe } from '../three/frames';
import type { Stage } from '../three/stage';
import { Labels, Particles, hash, placeCamera, smooth, terrain } from './parts';
import type { CameraPreset, Toggle, View, ViewContext } from './types';
import { sstTexture, tangents } from './weather';

// 川と海: 川のはたらき (river)・海流 (current)。どちらも「はじまりからの時間」で動く

// ======== 川 ========
// 西 (−x) の山から東 (+x) の海まで。1 は約 1 km、高さは強調している。
// 上流は V 字谷、山を出たところに扇状地、平地では曲がりくねり (三日月湖)、河口に三角州

const HOUR = 3600;
const X0 = -11.5;
/** ふつうの海岸線の x */
const COAST = 8.4;

/** 川の中心の z (x の場所で)。河口から先はまっすぐ海へ出る */
export function riverZ(x: number): number {
  x = Math.min(x, 9.1);
  if (x < -5) return 0.5 * Math.sin(x * 0.9 + 1.5);
  if (x < -2) return 0.5 * Math.sin(-5 * 0.9 + 1.5) * (1 - smooth(-5, -2, x));
  const a = 0.5 + 1.1 * smooth(-2, 4, x);
  return a * Math.sin((x + 2) * 1.25) * (1 - smooth(7.5, 9.6, x) * 0.7);
}

/** 区間: 上流 (山の中)・中流 (扇状地から平地)・下流 (平地の終わりと河口) */
export const reachOf = (x: number): 'upper' | 'middle' | 'lower' => (x < -5 ? 'upper' : x < 3 ? 'middle' : 'lower');

/** 川の水の流れる速さ (ふだんを 1 とした目安) */
const flowSpeed = (x: number) => (x < -5 ? 1 : x < -2 ? 0.7 : 0.4);

/** 大雨のあとの増水 (0〜1)。6 時間目から 16 時間目まで山に雨がふり、20 時間目ごろに水がいちばん多くなる */
export const RAIN = [6 * HOUR, 16 * HOUR] as const;
export function flood(t: number): number {
  return smooth(8 * HOUR, 20 * HOUR, t) * (1 - smooth(22 * HOUR, 40 * HOUR, t));
}

// 三角州: 河口で積もった砂やどろが、海岸線を海へ丸く押し出している。
// 川は三角州の上で 3 本に分かれ、それぞれの河口の先が少し張り出す
const DELTA_Z = riverZ(9.1);
const MOUTHS = [DELTA_Z - 1.25, DELTA_Z, DELTA_Z + 1.25];

/** 海岸線の x (z の場所で) */
function coastX(z: number): number {
  const lobes = MOUTHS.reduce((a, zm) => a + 0.28 * Math.exp(-(((z - zm) / 0.4) ** 2)), 0);
  return COAST + 1.7 * Math.exp(-(((z - DELTA_Z) / 1.6) ** 2)) + lobes;
}

/** 海岸線までの (おおよその) 距離。海の中が +、陸が − */
function coastDist(x: number, z: number): number {
  const slope = (coastX(z + 0.01) - coastX(z - 0.01)) / 0.02;
  return (x - coastX(z)) / Math.hypot(1, slope);
}

const X1 = coastX(DELTA_Z) + 0.05;

/** 土地の高さ */
function landHeight(x: number, z: number): number {
  const zc = riverZ(x);
  const d = Math.abs(z - zc);
  if (x < -5) {
    // 山: 東西にのびる尾根を V 字にけずった谷
    const base = 0.9 + (-5 - x) * 0.5 + 0.25 * Math.sin(z * 1.7 + x) * Math.sin(x * 0.8);
    const v = Math.max(0, 1 - d / 2.6);
    return base - (base - 0.35) * v ** 1.15;
  }
  const plain = 0.28 - (x + 2) * 0.024;
  // 扇状地: 山を出たところ (x=-5) を頂点にした、ゆるい円すい
  const r = Math.hypot(x + 5, z * 1.1);
  const fan = Math.max(0, 0.9 - r * 0.22);
  let h = Math.max(plain, fan);
  if (x > -5 && x < -4.2) h = Math.max(h, 0.9 + (-4.2 - x) * 0.2 * (1 + Math.abs(z) * 0.5));
  // 海岸の近くは海面より少し高い平らな土地 (三角州)
  const c = coastDist(x, z);
  if (x > 7.5) h = Math.max(h, 0.025 + 0.025 * Math.min(1, -c * 1.5));
  // 川の流れるところは少し低い (三角州の上では浅い)
  const w = 0.2 + 0.25 * smooth(-5, 6, x);
  h -= 0.1 * (1 - 0.8 * smooth(8, 9, x)) * Math.max(0, 1 - d / (w * 1.6));
  // 海: 岸からゆるやかに深くなる
  return c > 0 ? 0.025 - c * 0.2 : h;
}

function landColor(x: number, z: number, y: number, out: THREE.Color): void {
  const zc = riverZ(x);
  const near = Math.abs(z - zc);
  if (y < 0) out.setHex(0xc9b48a).lerp(new THREE.Color(0x3d6f9f), Math.min(1, -y * 3));
  else if (x < -5) out.setHex(0x4f7d43).lerp(new THREE.Color(0x8a7356), Math.min(1, near < 0.8 ? 0.7 : 0.15));
  else if (Math.hypot(x + 5, z * 1.1) < 3.6) out.setHex(0xa49a6a);
  else {
    // 平地は緑、三角州は砂やどろの色、波打ちぎわは砂浜
    out.setHex(0x78a65a).lerp(new THREE.Color(0xc4b87e), smooth(8.0, 9.0, x));
    out.lerp(new THREE.Color(0xe0d0a2), smooth(-0.2, 0, coastDist(x, z)));
  }
  // 川原 (石や砂が積もったところ)
  if (y >= 0 && near < 0.55 && x > -5) out.lerp(new THREE.Color(0xd8cba6), 0.55);
}

/** 点の列にそった、はばが w0 から w1 へ広がる帯 (水面) */
function ribbon(pts: THREE.Vector3[], w0: number, w1: number, color: number): THREE.Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  pts.forEach((c, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    const nx = -(b.z - a.z);
    const nz = b.x - a.x;
    const l = Math.hypot(nx, nz) || 1;
    pos.push(c.x + (nx / l) * w, c.y, c.z + (nz / l) * w, c.x - (nx / l) * w, c.y, c.z - (nz / l) * w);
    if (i > 0) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

const RIVER_TOGGLES: Toggle[] = [
  { key: 'speed', label: '流(なが)れの速(はや)さ' },
  { key: 'sediment', label: '石(いし)や砂(すな)' },
  { key: 'erosion', label: 'けずる・積(つ)もる' },
  { key: 'labels', label: '名前(なまえ)' },
];
const RIVER_CAMERAS: CameraPreset[] = [
  { key: 'whole', label: '全体(ぜんたい)' },
  { key: 'upper', label: '上流(じょうりゅう)' },
  { key: 'middle', label: '中流(ちゅうりゅう)' },
  { key: 'lower', label: '下流(かりゅう)' },
];

const SEG = 260;
const FLOW_N = 420;

export class RiverView implements View {
  readonly id = 'river' as const;
  readonly toggles = RIVER_TOGGLES;
  readonly cameras = RIVER_CAMERAS;
  readonly defaults: Record<string, boolean> = { speed: false, sediment: true, erosion: false, labels: true };

  private readonly labels: Labels;
  private readonly water: THREE.Mesh;
  private readonly centers: THREE.Vector3[] = [];
  private readonly normals: THREE.Vector3[] = [];
  /** 川の各点まで、水が流れてくるのにかかる時間 (ふだんの速さで) */
  private readonly tau: number[] = [];
  private readonly flow: Particles;
  private readonly stones: Particles;
  private readonly sand: Particles;
  private readonly rain: Particles;
  private readonly clouds: Particles;
  private readonly marks = new THREE.Group();

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x8ab8e2);
    this.labels = new Labels(stage);
    root.add(new THREE.AmbientLight(0xffffff, 0.75));
    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(-4, 10, 6);
    root.add(light);

    root.add(terrain(26, 16, 312, 192, landHeight, landColor, [-0.5, 0]));
    // 海
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6, 16).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3d8ee0, transparent: true, opacity: 0.75 }));
    sea.position.set(9.8, 0.005, 0);
    root.add(sea);

    // 川の中心線
    for (let i = 0; i <= SEG; i++) {
      const x = X0 + ((X1 - X0) * i) / SEG;
      this.centers.push(new THREE.Vector3(x, 0, riverZ(x)));
    }
    let acc = 0;
    for (let i = 0; i <= SEG; i++) {
      const a = this.centers[Math.max(0, i - 1)];
      const b = this.centers[Math.min(SEG, i + 1)];
      const dir = b.clone().sub(a).normalize();
      this.normals.push(new THREE.Vector3(-dir.z, 0, dir.x));
      if (i > 0) acc += this.centers[i].distanceTo(this.centers[i - 1]) / flowSpeed(this.centers[i].x);
      this.tau.push(acc);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < SEG; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    geo.setIndex(idx);
    this.water = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3d8ee0, side: THREE.DoubleSide }));
    root.add(this.water);

    // 三日月湖 (曲がりくねった川の一部が取り残された湖)
    const lake = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 6, 32, Math.PI * 1.3), new THREE.MeshLambertMaterial({ color: 0x3d8ee0 }));
    lake.rotation.x = -Math.PI / 2;
    lake.scale.set(1, 1, 0.2);
    lake.position.set(5.2, landHeight(5.2, -2.6) + 0.02, -2.6);
    root.add(lake);

    // 三角州の上で分かれた川 (まん中は本流)。本流から分かれ、ゆるく曲がってそれぞれの河口へ
    for (const zm of [MOUTHS[0], MOUTHS[2]]) {
      const f = new THREE.Vector2(8.7, riverZ(8.7));
      const m = new THREE.Vector2(coastX(zm) + 0.05, zm);
      const k = new THREE.Vector2(f.x + 0.5, f.y + (zm - f.y) * 0.75);
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 24; s++) {
        const u = s / 24;
        const x = (1 - u) ** 2 * f.x + 2 * u * (1 - u) * k.x + u * u * m.x;
        const z = (1 - u) ** 2 * f.y + 2 * u * (1 - u) * k.y + u * u * m.y;
        pts.push(new THREE.Vector3(x, Math.max(landHeight(x, z) + 0.03, 0.012), z));
      }
      root.add(ribbon(pts, 0.12, 0.2, 0x3d8ee0));
    }

    this.flow = new Particles(FLOW_N, 0.16, { opacity: 0.95 });
    this.stones = new Particles(60, 0.32, { opacity: 1, color: 0x8a7a68 });
    this.sand = new Particles(200, 0.12, { opacity: 1, color: 0xc8a66a });
    this.rain = new Particles(300, 0.1, { opacity: 0.8, color: 0xd8e8ff });
    this.clouds = new Particles(140, 3.5, { opacity: 0.6, color: 0x9aa4b0 });
    root.add(this.flow.points, this.stones.points, this.sand.points, this.rain.points, this.clouds.points);

    // けずる (外がわ・赤) と積もる (内がわ・黄) の印。平地の曲がり角ごと (名前は 2 つ目の曲がり角につける)
    for (let n = 0; n < 6; n++) {
      const x = -2 + (Math.PI / 2 + n * Math.PI) / 1.25;
      if (x > 8) break;
      const zc = riverZ(x);
      const out = Math.sign(zc) || 1;
      const w = 0.2 + 0.25 * smooth(-5, 6, x);
      this.marks.add(arrow(new THREE.Vector3(0, 0, out), new THREE.Vector3(x, 0.35, zc + out * (w + 0.05)), 0.5, 0xff5a4e, 0.18));
      const bar = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
      bar.scale.set(1.6, 1, 0.8);
      bar.position.set(x, landHeight(x, zc - out * (w + 0.3)) + 0.03, zc - out * (w + 0.3));
      this.marks.add(bar);
      if (n === 1) {
        this.labels.add(this.marks, 'けずる (外(そと)がわ・速(はや)い)', [x, 0.75, zc + out * (w + 0.6)], 'is-small is-warm');
        this.labels.add(this.marks, '積(つ)もる (内(うち)がわ・おそい)', [x, 0.45, zc - out * (w + 0.5)], 'is-small');
      }
    }
    root.add(this.marks);

    this.labels.add(root, 'V字谷(じこく)', [-9, 2.4, riverZ(-9)]);
    this.labels.add(root, '扇状地(せんじょうち)', [-3.6, 1.2, 1.4]);
    this.labels.add(root, '三日月湖(みかづきこ)', [5.2, 0.7, -2.6], 'is-small');
    this.labels.add(root, '三角州(さんかくす)', [9.3, 0.3, DELTA_Z - 0.7]);
    this.labels.add(root, '海(うみ)', [11, 0.4, -4]);
    this.labels.add(root, '上流(じょうりゅう)', [-9, 4.6, -4], 'is-small');
    this.labels.add(root, '中流(ちゅうりゅう)', [-1, 1.6, -4], 'is-small');
    this.labels.add(root, '下流(かりゅう)', [6, 1.2, -4], 'is-small');

    stage.controls.minDistance = 2;
    stage.controls.maxDistance = 50;
    stage.controls.maxPolarAngle = Math.PI * 0.48;
  }

  /** 川の i 番目の点で、中心から横へ l (−1〜1) の位置 */
  private onRiver(i: number, l: number, width: number, lift: number, out: THREE.Vector3): THREE.Vector3 {
    const c = this.centers[i];
    out.copy(c).addScaledVector(this.normals[i], l * width);
    out.y = landHeight(c.x, c.z) + lift;
    return out;
  }

  private width(x: number, f: number): number {
    // 三角州の上では 3 本に分かれるので、本流は細くなる
    return (0.12 + 0.28 * smooth(-6, 8, x)) * (1 - 0.45 * smooth(8.5, 9.2, x)) * (1 + 1.6 * f);
  }

  update(ms: number, ctx: ViewContext): void {
    const o = ctx.options;
    const t = ms / 1000;
    const f = flood(t);

    // 水面 (増水すると川はばが広がり、にごった色になる)
    const pos = this.water.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    for (let i = 0; i <= SEG; i++) {
      const w = this.width(this.centers[i].x, f);
      const lift = 0.035 + 0.12 * f;
      this.onRiver(i, -1, w, lift, p);
      pos.setXYZ(2 * i, p.x, Math.max(p.y, 0.012), p.z);
      this.onRiver(i, 1, w, lift, p);
      pos.setXYZ(2 * i + 1, p.x, Math.max(p.y, 0.012), p.z);
    }
    pos.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
    this.water.geometry.computeBoundingSphere();
    (this.water.material as THREE.MeshLambertMaterial).color.setHex(0x3d8ee0).lerp(new THREE.Color(0x9a7a50), f * 0.85);

    // 流れる水のつぶ: 時刻 t までに流れた量 (増水すると速い) で、川にそった位置を決める
    let moved = 0;
    let flooded = 0;
    const steps = 60;
    for (let k = 0; k < steps; k++) {
      const fk = flood(((k + 0.5) / steps) * t);
      moved += (1 + 1.8 * fk) * (t / steps);
      flooded += fk * (t / steps);
    }
    const T = this.tau[SEG];
    const c = new THREE.Color();
    // 画面の中で見やすい速さにする (ふだんは約 20 分で上流から河口まで)
    const k = T / (20 * 60);
    for (let n = 0; n < FLOW_N; n++) {
      const phase = (hash(n, 1) * T + moved * k) % T;
      let i = 0;
      while (i < SEG && this.tau[i + 1] < phase) i++;
      const l = (hash(n, 2) - 0.5) * 1.6;
      const x = this.centers[i].x;
      const w = this.width(x, f);
      this.onRiver(i, l, w, 0.05 + 0.12 * f, p);
      this.flow.set(n, p.x, p.y, p.z);
      // 曲がり角の外がわほど速い。速いほど白っぽく
      const out = Math.sign(riverZ(x)) * Math.sign(this.normals[i].z || 1) * l;
      const speed = flowSpeed(x) * (1 + 0.6 * out) * (1 + 1.2 * f);
      if (o.speed) c.setHSL(0.58, 0.9, 0.35 + Math.min(0.55, speed * 0.3));
      else c.setHex(0xcfe8ff);
      this.flow.color(n, c);
    }
    this.flow.done();

    // 石と砂: 大きな石は上流だけにあり、大雨のときにだけ転がって運ばれる。砂は下流まで運ばれて積もる
    const showSed = o.sediment !== false;
    for (let n = 0; n < this.stones.n; n++) {
      if (!showSed) {
        this.stones.hide(n);
        continue;
      }
      const i0 = Math.floor(hash(n, 3) * SEG * 0.3);
      // 増水していた時間が長いほど、下流へ転がっている (山を出たところで止まる)
      const i = Math.min(Math.floor(SEG * 0.36), i0 + Math.floor((flooded / (8 * HOUR)) * 25 * hash(n, 4)));
      this.onRiver(i, (hash(n, 5) - 0.5) * 1.4, this.width(this.centers[i].x, f), 0.07, p);
      this.stones.set(n, p.x, p.y, p.z);
    }
    this.stones.done();
    for (let n = 0; n < this.sand.n; n++) {
      if (!showSed) {
        this.sand.hide(n);
        continue;
      }
      const i = Math.floor(SEG * (0.35 + 0.65 * hash(n, 6)));
      const inner = -Math.sign(riverZ(this.centers[i].x)) || 1;
      this.onRiver(i, inner * (1 + 0.4 * hash(n, 7)), this.width(this.centers[i].x, f), 0.04, p);
      this.sand.set(n, p.x, p.y, p.z);
    }
    this.sand.done();

    // 山にふる雨と雲
    const raining = t >= RAIN[0] && t < RAIN[1];
    for (let n = 0; n < this.rain.n; n++) {
      if (!raining) {
        this.rain.hide(n);
        continue;
      }
      const period = 0.25 * HOUR;
      const y = 6 * (1 - ((t + hash(n, 8) * period) % period) / period);
      this.rain.set(n, -11 + hash(n, 9) * 8, y, (hash(n, 10) - 0.5) * 12);
    }
    this.rain.done();
    const cloudy = smooth(RAIN[0] - HOUR, RAIN[0], t) * (1 - smooth(RAIN[1], RAIN[1] + HOUR, t));
    for (let n = 0; n < this.clouds.n; n++) {
      if (cloudy < 0.05) {
        this.clouds.hide(n);
        continue;
      }
      this.clouds.set(n, -11 + hash(n, 11) * 9, 6 + hash(n, 12) * 1.2, (hash(n, 13) - 0.5) * 13);
    }
    this.clouds.done();
    this.stage.background.setHex(0x8ab8e2).lerp(new THREE.Color(0x8c96a2), cloudy * 0.8);

    this.marks.visible = !!o.erosion;
    this.labels.show(o.labels !== false);
    this.stage.invalidate();
  }

  setCamera(key: string): void {
    if (key === 'upper') placeCamera(this.stage, [-6, 4.5, 5], [-9, 1.4, 0], 1);
    else if (key === 'middle') placeCamera(this.stage, [0, 4, 6.5], [0.5, 0, 0], 1);
    else if (key === 'lower') placeCamera(this.stage, [12, 4, 5.5], [7.5, 0, 0], 1);
    else placeCamera(this.stage, [0, 13, 15], [-0.5, 0.5, 0], 1.3);
  }
}

// ======== 海流 ========
// 地球儀の上の、おもな海流。赤が暖流、青が寒流。つぶが流れる向きに動く (速さは強調している)。
// 海流は、地球全体にふく風 (貿易風・偏西風) にひきずられてできる。北半球では時計回り、南半球では反時計回りの大きなうず

const R = 5;
const globe = (lat: number, lon: number, r = R) => onGlobe(lat, lon).multiplyScalar(r);

const CURRENT_TOGGLES: Toggle[] = [
  { key: 'flow', label: '海流(かいりゅう)の動(うご)き' },
  { key: 'winds', label: '地球(ちきゅう)をめぐる風(かぜ)' },
  { key: 'sst', label: '海面(かいめん)の水温(すいおん)' },
  { key: 'labels', label: '名前(なまえ)' },
];
const CURRENT_CAMERAS: CameraPreset[] = [
  { key: 'japan', label: '日本(にほん)の近(ちか)く' },
  { key: 'pacific', label: '太平洋(たいへいよう)' },
  { key: 'atlantic', label: '大西洋(たいせいよう)' },
  { key: 'south', label: '南(みなみ)から' },
];

/** 通り道を細かくした点 (経度 180° をまたぐところもつなぐ) */
function densify(path: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [la0, lo0] = path[i];
    const [la1, lo1raw] = path[i + 1];
    let lo1 = lo1raw;
    if (lo1 - lo0 > 180) lo1 -= 360;
    if (lo0 - lo1 > 180) lo1 += 360;
    const n = Math.max(2, Math.ceil(Math.hypot(la1 - la0, lo1 - lo0) / 2));
    for (let k = 0; k < n; k++) out.push([la0 + ((la1 - la0) * k) / n, lo0 + ((lo1 - lo0) * k) / n]);
  }
  out.push(path[path.length - 1]);
  return out;
}

export class CurrentView implements View {
  readonly id = 'current' as const;
  readonly toggles = CURRENT_TOGGLES;
  readonly cameras = CURRENT_CAMERAS;
  readonly defaults: Record<string, boolean> = { flow: true, winds: false, sst: false, labels: true };

  private readonly labels: Labels;
  private readonly lines = new THREE.Group();
  private readonly flow: Particles;
  private readonly paths: { pts: THREE.Vector3[]; warm: boolean; len: number }[] = [];
  private readonly winds = new THREE.Group();
  private readonly sst: THREE.Mesh;

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x0b1630);
    this.labels = new Labels(stage);
    root.add(new THREE.AmbientLight(0xffffff, 0.85));
    const light = new THREE.DirectionalLight(0xffffff, 0.9);
    light.position.copy(globe(20, 150, 30));
    root.add(light);
    root.add(earthMesh(R));
    this.sst = new THREE.Mesh(new THREE.SphereGeometry(R * 1.003, 96, 48), new THREE.MeshBasicMaterial({ map: sstTexture(), transparent: true, depthWrite: false }));
    root.add(this.sst);

    let total = 0;
    for (const c of CURRENTS) {
      const pts = densify(c.path).map(([la, lo]) => globe(la, lo, R * 1.008));
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
      this.paths.push({ pts, warm: c.warm, len });
      total += len;
      this.lines.add(polyline(pts, c.warm ? 0xff6b5b : 0x5ab0ff, { opacity: 0.55 }));
      // 向きがわかるように、まん中に矢印
      const mid = Math.floor(pts.length / 2);
      const dir = pts[Math.min(pts.length - 1, mid + 1)].clone().sub(pts[mid]);
      this.lines.add(arrow(dir, pts[mid], 0.32, c.warm ? 0xff6b5b : 0x5ab0ff, 0.16));
      if (c.label) {
        const at = pts[Math.floor(pts.length * 0.45)].clone().multiplyScalar(1.03);
        this.labels.add(this.lines, c.name, at, `is-small ${c.warm ? 'is-warm' : 'is-cold'}`);
      }
    }
    root.add(this.lines);
    this.flow = new Particles(Math.round(total * 9), 0.09, { opacity: 0.95, additive: false });
    root.add(this.flow.points);

    for (const w of WINDS) {
      for (let lon = -180; lon < 180; lon += 30) {
        const { east } = tangents(w.lat, lon);
        this.winds.add(arrow(w.to === 'east' ? east : east.clone().negate(), globe(w.lat, lon, R * 1.03), 0.6, 0xffffff, 0.16));
      }
      this.labels.add(this.winds, w.name, globe(w.lat + 3, w.lat > 0 ? 160 : 100, R * 1.05), 'is-small');
    }
    root.add(this.winds);
    this.labels.add(root, '日本(にほん)', globe(40, 141, R * 1.03), 'is-small');

    stage.controls.minDistance = R * 1.2;
    stage.controls.maxDistance = R * 8;
  }

  update(ms: number, ctx: ViewContext): void {
    const o = ctx.options;
    const day = ms / 86_400_000;
    // つぶは、長さ 1 の道のりを約 20 日で進む (本当の海流の速さより、ずっと速くしている)
    const c = new THREE.Color();
    let n = 0;
    const p = new THREE.Vector3();
    for (const path of this.paths) {
      const count = Math.round(path.len * 9);
      for (let k = 0; k < count && n < this.flow.n; k++, n++) {
        if (o.flow === false) {
          this.flow.hide(n);
          continue;
        }
        const s = ((hash(n, 1) * path.len + day / 20) % path.len + path.len) % path.len;
        // 道のり s の点
        let acc = 0;
        let i = 1;
        for (; i < path.pts.length; i++) {
          const d = path.pts[i].distanceTo(path.pts[i - 1]);
          if (acc + d >= s) break;
          acc += d;
        }
        i = Math.min(i, path.pts.length - 1);
        const a = path.pts[i - 1];
        const b = path.pts[i];
        const f = Math.min(1, (s - acc) / Math.max(1e-6, a.distanceTo(b)));
        p.copy(a).lerp(b, f);
        this.flow.set(n, p.x, p.y, p.z);
        this.flow.color(n, c.setHex(path.warm ? 0xffb0a6 : 0xb5dcff));
      }
    }
    for (; n < this.flow.n; n++) this.flow.hide(n);
    this.flow.done();
    this.winds.visible = !!o.winds;
    this.sst.visible = !!o.sst;
    this.labels.show(o.labels !== false);
    this.labels.occlude(this.stage.camera.position, R);
    this.stage.invalidate();
  }

  /** 地球の裏がわの名前は、カメラを回したときにもかくす */
  frame(): void {
    if (this.labels.occlude(this.stage.camera.position, R)) this.stage.invalidate();
  }

  setCamera(key: string): void {
    const k = this.stage.fit(1.1);
    const at: Record<string, [number, number, number]> = {
      japan: [33, 145, 2.2],
      pacific: [18, -170, 3.4],
      atlantic: [22, -45, 3.4],
      south: [-70, 60, 3.4],
    };
    const [lat, lon, d] = at[key] ?? at.japan;
    this.stage.controls.target.set(0, 0, 0);
    this.stage.camera.position.copy(globe(lat, lon, R * d * k));
    this.stage.controls.update();
    this.stage.invalidate();
  }
}
