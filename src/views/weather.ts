import * as THREE from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { cloudBase, envFreezing, envTemp, parcelFreezing, parcelTemp, precipType } from '../earth/air';
import { TYPHOON_DAYS, typhoonAt, typhoonTrack } from '../earth/typhoon';
import { arrow, earthMesh, polyline, setArrow } from '../three/bodies';
import { onGlobe } from '../three/frames';
import type { Stage } from '../three/stage';
import { glowTexture } from '../three/textures';
import { Labels, Particles, hash, placeCamera, smooth } from './parts';
import type { CameraPreset, Toggle, View, ViewContext } from './types';

// 天気: 雲のでき方と雨・雪 (cloud)、積乱雲と雷・竜巻 (storm)、台風 (typhoon)。どれも「はじまりからの時間」で動く

const MIN = 60;

/** 地上の空気 (夏の晴れた日 / 冬) */
export const AIR = {
  summer: { t0: 25, dew: 17 },
  winter: { t0: 1, dew: -3 },
};
export const airOf = (winter: boolean) => (winter ? AIR.winter : AIR.summer);

/** 雲の画面の進み方 (秒): 空気のかたまりが上がる → 雲が育つ → 雨や雪が降る */
export const CLOUD_T = { rise: 30 * MIN, grow: 75 * MIN, rain: 70 * MIN, stop: 115 * MIN };

/** 雲のてっぺんの高さ (m) */
export function cloudTop(t: number, winter: boolean): number {
  const { t0, dew } = airOf(winter);
  const base = cloudBase(t0, dew);
  const max = winter ? 4000 : 7500;
  return base + (max - base) * smooth(CLOUD_T.rise * 0.8, CLOUD_T.grow, t);
}

/** 空気のかたまりの高さ (m)。雲の底より少し上まで上がったら、雲の一部になる */
export function parcelHeight(t: number, winter: boolean): number {
  const { t0, dew } = airOf(winter);
  return cloudBase(t0, dew) * 1.4 * smooth(0, CLOUD_T.rise, t);
}

/** 空の背景に、太陽の光る丸をかく */
function sunSprite(size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

/** 地面 (x-z 面の円) */
function groundDisc(r: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.CircleGeometry(r, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color }));
}

// ======== 雲・雨・雪 ========
// 地面から高さ 10 km までの空。1 は 1 km。日なたであたためられた空気のかたまりが上がり、
// ふくらんで冷え、露点 (雲の底) で雲つぶができる。0 °C より上では氷のつぶになり、大きくなって落ちる

const CLOUD_TOGGLES: Toggle[] = [
  { key: 'ruler', label: '高(たか)さと気温(きおん)' },
  { key: 'freezing', label: '0℃の高(たか)さ' },
  { key: 'updraft', label: '上昇気流(じょうしょうきりゅう)' },
  { key: 'winter', label: '冬(ふゆ)の雲(くも)' },
  { key: 'labels', label: '名前(なまえ)' },
];
const CLOUD_CAMERAS: CameraPreset[] = [
  { key: 'side', label: '横(よこ)から' },
  { key: 'tilt', label: 'ななめから' },
  { key: 'cloud', label: '雲(くも)に近(ちか)づく' },
];
const CLOUD_N = 900;
const RAIN_N = 420;

export class CloudView implements View {
  readonly id = 'cloud' as const;
  readonly toggles = CLOUD_TOGGLES;
  readonly cameras = CLOUD_CAMERAS;
  readonly defaults: Record<string, boolean> = { ruler: true, freezing: true, updraft: true, winter: false, labels: true };

  private readonly labels: Labels;
  private readonly parcel: THREE.Mesh;
  private readonly parcelLabel: CSS2DObject;
  private readonly cloud: Particles;
  private readonly rain: Particles;
  private readonly ruler = new THREE.Group();
  private readonly rulerLabels: CSS2DObject[] = [];
  private readonly freezing: THREE.Mesh;
  private readonly freezingLabel: CSS2DObject;
  private readonly baseLine: THREE.Line;
  private readonly baseLabel: CSS2DObject;
  private readonly updraft = new THREE.Group();
  private readonly ground: THREE.Mesh;
  private winterKey = '';

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x7fb2e5);
    this.labels = new Labels(stage);
    root.add(new THREE.AmbientLight(0xffffff, 0.9));
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(6, 10, 4);
    root.add(light);
    const sun = sunSprite(3);
    sun.position.set(9, 10, -6);
    root.add(sun);

    this.ground = groundDisc(14, 0x6f9a55);
    root.add(this.ground);
    // 家と木 (大きさの目安ではなく、地面だとわかるように)
    for (const [x, z] of [[-3, 2], [2.5, 3], [4, -2], [-4.5, -3]]) {
      const tree = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0x3f7a3a }));
      tree.position.set(x, 0.3, z);
      root.add(tree);
    }

    // 高さの目盛り (左はし)。気温は、まわりの空気の気温
    root.add(this.ruler);
    this.ruler.add(polyline([new THREE.Vector3(-5.6, 0, 0), new THREE.Vector3(-5.6, 10, 0)], 0xffffff, { opacity: 0.8 }));
    for (let km = 0; km <= 10; km += 1) {
      this.ruler.add(polyline([new THREE.Vector3(-5.8, km, 0), new THREE.Vector3(-5.4, km, 0)], 0xffffff, { opacity: 0.8 }));
      if (km % 2 === 0) {
        const l = stage.label('', 'is-small');
        l.position.set(-6.8, km, 0);
        this.ruler.add(l);
        this.rulerLabels.push(l);
      }
    }

    // 0 °C の高さ (まわりの空気が 0 °C になる高さ。雪はこれより下でとけて雨になる)
    this.freezing = new THREE.Mesh(new THREE.PlaneGeometry(16, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    root.add(this.freezing);
    this.freezingLabel = stage.label('0℃の高(たか)さ', 'is-small is-cold');
    this.freezingLabel.position.set(6.5, 0, 0);
    this.freezing.add(this.freezingLabel);
    // 雲の底 (雲ができはじめる高さ)
    this.baseLine = polyline([new THREE.Vector3(-5.4, 0, 0), new THREE.Vector3(6, 0, 0)], 0xffffff, { dashed: true, opacity: 0.9 });
    root.add(this.baseLine);
    this.baseLabel = this.labels.add(this.baseLine, '雲(くも)ができはじめる高(たか)さ', [-3.4, 0.3, 0], 'is-small');

    // 空気のかたまり
    this.parcel = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshLambertMaterial({ color: 0xffc4a0, transparent: true, opacity: 0.45, depthWrite: false }));
    root.add(this.parcel);
    this.parcelLabel = this.labels.add(this.parcel, '', [0, 1.6, 0], 'is-small');

    // 上昇気流 (日なたの地面であたためられた空気が上がる)
    for (const x of [-1.2, 0, 1.2]) this.updraft.add(arrow(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 0.2, 0.5), 1.4, 0xff8a5b, 0.3));
    this.labels.add(this.updraft, '上昇気流(じょうしょうきりゅう)', [2.6, 0.9, 0.5], 'is-small');
    root.add(this.updraft);

    this.cloud = new Particles(CLOUD_N, 1.5, { opacity: 0.8 });
    this.rain = new Particles(RAIN_N, 0.22, { opacity: 0.95 });
    root.add(this.cloud.points, this.rain.points);

    stage.controls.minDistance = 4;
    stage.controls.maxDistance = 60;
    stage.controls.maxPolarAngle = Math.PI * 0.52;
  }

  update(ms: number, ctx: ViewContext): void {
    const o = ctx.options;
    const t = ms / 1000;
    const winter = !!o.winter;
    const { t0, dew } = airOf(winter);
    const base = cloudBase(t0, dew) / 1000;
    const iceAt = parcelFreezing(t0, dew) / 1000;
    const melt = envFreezing(t0) / 1000;
    const top = cloudTop(t, winter) / 1000;

    // 夏と冬で、空と地面の色・目盛りの気温を変える
    const key = String(winter);
    if (key !== this.winterKey) {
      this.winterKey = key;
      this.stage.background.setHex(winter ? 0x9fb0c2 : 0x7fb2e5);
      (this.ground.material as THREE.MeshLambertMaterial).color.setHex(winter ? 0xe8eef2 : 0x6f9a55);
      this.rulerLabels.forEach((l, i) => this.stage.setLabelText(l, `${i * 2}km ${Math.round(envTemp(i * 2000, t0))}℃`));
    }
    this.ruler.visible = o.ruler !== false;
    this.freezing.visible = o.freezing !== false && melt > 0.05;
    this.freezing.position.y = melt;
    this.baseLine.position.y = base;
    this.baseLine.visible = t > CLOUD_T.rise * 0.6;

    // 空気のかたまり: 上がるほどまわりの気圧が下がるので、ふくらんで冷える
    const z = parcelHeight(t, winter) / 1000;
    this.parcel.visible = t < CLOUD_T.rise * 1.1;
    this.parcel.position.set(0, Math.max(0.35, z), 0);
    this.parcel.scale.setScalar(0.35 * (1 + z * 0.45));
    (this.parcel.material as THREE.MeshLambertMaterial).color.setHex(z < base ? 0xffc4a0 : 0xffffff);
    this.stage.setLabelText(this.parcelLabel, `空気(くうき)のかたまり ${Math.round(parcelTemp(z * 1000, t0, dew))}℃`);
    this.updraft.visible = o.updraft !== false && t < CLOUD_T.stop;

    // 雲つぶ: 雲の底からてっぺんまで。かたまりは高さで太さを変える (もくもくした形)
    const c = new THREE.Color();
    const maxTop = (winter ? 4000 : 7500) / 1000;
    const raining = t > CLOUD_T.rain;
    for (let i = 0; i < CLOUD_N; i++) {
      const h = base + hash(i, 1) * (maxTop - base);
      if (z < base * 0.98 || h > top) {
        this.cloud.hide(i);
        continue;
      }
      const f = (h - base) / Math.max(0.01, maxTop - base);
      const r = (winter ? 3.2 : 1.6) + 1.4 * Math.sin(Math.PI * Math.min(1, f * 1.15)) ** 0.7;
      const a = hash(i, 2) * Math.PI * 2;
      const rr = r * Math.sqrt(hash(i, 3));
      this.cloud.set(i, Math.cos(a) * rr, h + 0.15, Math.sin(a) * rr * 0.8);
      // 0 °C より上は氷のつぶ (少し青白く)。雨が降るころは、下のほうが暗い灰色になる
      if (h > iceAt) c.setHex(0xeaf2ff);
      else c.setHex(0xffffff).multiplyScalar(raining ? 0.72 + 0.28 * f : 0.95 + 0.05 * f);
      this.cloud.color(i, c);
    }
    this.cloud.done();

    // 雨・雪: 雲の中で大きくなった氷のつぶが落ちる。0 °C の高さより下でとけると雨、とけなければ雪
    const snowAtGround = precipType(t0) === 'snow';
    const fallFrom = Math.min(top, Math.max(iceAt + 0.5, base + 1));
    const falling = raining && t < CLOUD_T.stop;
    for (let i = 0; i < RAIN_N; i++) {
      if (!falling) {
        this.rain.hide(i);
        continue;
      }
      const period = snowAtGround ? 15 * MIN : 6 * MIN;
      const frac = ((t + hash(i, 4) * period) % period) / period;
      const y = fallFrom * (1 - frac);
      const a = hash(i, 5) * Math.PI * 2;
      const rr = 2.2 * Math.sqrt(hash(i, 6));
      const sway = snowAtGround ? Math.sin(t / 40 + i) * 0.15 : 0;
      this.rain.set(i, Math.cos(a) * rr + sway, y, Math.sin(a) * rr * 0.8);
      const snow = snowAtGround || y > melt;
      this.rain.color(i, c.setHex(snow ? 0xffffff : 0x2f7de0));
    }
    this.rain.done();
    (this.rain.points.material as THREE.PointsMaterial).size = snowAtGround ? 0.32 : 0.22;

    this.labels.show(o.labels !== false);
    this.baseLabel.visible = this.baseLine.visible && o.labels !== false;
    this.stage.invalidate();
  }

  setCamera(key: string): void {
    if (key === 'tilt') placeCamera(this.stage, [12, 8, 16], [0, 3.5, 0], 1.1);
    else if (key === 'cloud') placeCamera(this.stage, [4, 3, 7], [0, 2.2, 0], 1.1);
    else placeCamera(this.stage, [0, 4.5, 20], [0, 4.2, 0], 1.1);
  }
}

// ======== 積乱雲・雷・竜巻 ========
// 1 は 1 km。強い上昇気流で雲が高さ 12 km (対流圏のてっぺん) までのび、かなとこ雲が広がる。
// 雲の中の氷のつぶがぶつかり合って電気が分かれ、雷が光る。回転する上昇気流の下に、竜巻がのびることがある

const STORM_TOGGLES: Toggle[] = [
  { key: 'charge', label: '雲(くも)の中(なか)の電気(でんき)' },
  { key: 'lightning', label: '雷(かみなり)' },
  { key: 'tornado', label: '竜巻(たつまき)' },
  { key: 'wind', label: '風(かぜ)の流(なが)れ' },
  { key: 'labels', label: '名前(なまえ)' },
];
const STORM_CAMERAS: CameraPreset[] = [
  { key: 'side', label: '横(よこ)から' },
  { key: 'below', label: '地上(ちじょう)から見上(みあ)げる' },
  { key: 'top', label: '上(うえ)から' },
];
const STORM_N = 1500;
const BASE_KM = 1.2;
const TROPOPAUSE = 12;

/** 積乱雲の進み方 (秒)。発達 → 成熟 (雷・大雨・竜巻) → おとろえる */
export const STORM_T = { grow: 15 * MIN, rain: [20 * MIN, 50 * MIN], bolt: [16 * MIN, 50 * MIN], tornado: [30 * MIN, 46 * MIN] } as const;

export function stormStage(t: number): 'growing' | 'mature' | 'dying' {
  if (t < STORM_T.rain[0]) return 'growing';
  if (t < STORM_T.rain[1]) return 'mature';
  return 'dying';
}

const inWindow = (t: number, w: readonly [number, number]) => t >= w[0] && t < w[1];

export class StormView implements View {
  readonly id = 'storm' as const;
  readonly toggles = STORM_TOGGLES;
  readonly cameras = STORM_CAMERAS;
  readonly defaults: Record<string, boolean> = { charge: true, lightning: true, tornado: true, wind: false, labels: true };

  private readonly labels: Labels;
  private readonly cloud: Particles;
  private readonly rain: Particles;
  private readonly debris: Particles;
  private readonly charges = new THREE.Group();
  private readonly plus: THREE.Mesh[] = [];
  private readonly bolt: THREE.Line;
  private readonly funnel: THREE.Mesh;
  private readonly wind = new THREE.Group();
  private readonly ambient: THREE.AmbientLight;
  private boltOn = false;
  private nextFlash = 1;
  private flashLeft = 0;
  private tornadoOn = false;
  private spin = 0;
  private lightningOn = true;

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x6d8fb3);
    this.labels = new Labels(stage);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.85);
    root.add(this.ambient);
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(-6, 14, 6);
    root.add(light);
    root.add(groundDisc(18, 0x6a9250));
    this.labels.add(root, '対流圏(たいりゅうけん)のてっぺん (高(たか)さ約(やく)12km)', [-9, TROPOPAUSE + 0.3, 0], 'is-small');
    root.add(polyline([new THREE.Vector3(-12, TROPOPAUSE, 0), new THREE.Vector3(12, TROPOPAUSE, 0)], 0xffffff, { dashed: true, opacity: 0.5 }));

    this.cloud = new Particles(STORM_N, 2.2, { opacity: 0.75 });
    this.rain = new Particles(500, 0.2, { opacity: 0.9, color: 0x2f7de0 });
    this.debris = new Particles(160, 0.25, { opacity: 0.9, color: 0x6b5a48 });
    root.add(this.cloud.points, this.rain.points, this.debris.points);

    // 電気: 雲の上のほうに + (小さな氷の結晶)、まん中に − (あられ)。地面には + が引きよせられる
    const dot = (color: number) => new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color }));
    for (let i = 0; i < 28; i++) {
      const top = i < 12;
      const ground = i >= 22;
      const m = dot(top || ground ? 0xff4d4d : 0x3d7bff);
      const a = hash(i, 11) * Math.PI * 2;
      const r = (ground ? 3.5 : 1.6) * Math.sqrt(hash(i, 12));
      m.position.set(Math.cos(a) * r, ground ? 0.25 : top ? 8.5 + hash(i, 13) * 2 : 4 + hash(i, 13) * 1.6, Math.sin(a) * r * 0.8);
      if (top || ground) this.plus.push(m);
      this.charges.add(m);
    }
    this.labels.add(this.charges, '＋ (氷(こおり)の結晶(けっしょう))', [3.6, 9.5, 0], 'is-small is-warm');
    this.labels.add(this.charges, '− (あられ)', [3.4, 4.8, 0], 'is-small is-cold');
    root.add(this.charges);

    // 雷の光 (位置は光るたびに変える)
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xfff6b0 }));
    this.bolt.visible = false;
    root.add(this.bolt);

    // 竜巻 (雲の底から地面へのびるろうと)
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 20; i++) {
      const y = i / 20;
      pts.push(new THREE.Vector2(0.14 + 0.9 * y ** 2.4, y));
    }
    this.funnel = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshLambertMaterial({ color: 0x8c8f96, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.funnel.position.set(-1.8, 0, 0.6);
    root.add(this.funnel);
    this.labels.add(this.funnel, '竜巻(たつまき)', [-1.6, 0.4, 0], 'is-small');

    // 風: 雲の中の上昇気流 (オレンジ) と、雨といっしょにふき下りる下降気流 (青)
    for (const x of [-0.8, 0.8]) this.wind.add(arrow(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 1, 0), 9, 0xff8a5b, 0.6));
    for (const x of [2.2, 3]) this.wind.add(arrow(new THREE.Vector3(0, -1, 0), new THREE.Vector3(x, 6, 0), 5.3, 0x5ab0ff, 0.5));
    this.wind.add(arrow(new THREE.Vector3(1, 0, 0), new THREE.Vector3(3, 0.4, 0), 3, 0x5ab0ff, 0.4));
    this.labels.add(this.wind, '上昇気流(じょうしょうきりゅう)', [-2.4, 6, 0], 'is-small is-warm');
    this.labels.add(this.wind, '下降気流(かこうきりゅう)', [4.6, 3, 0], 'is-small is-cold');
    root.add(this.wind);

    stage.controls.minDistance = 3;
    stage.controls.maxDistance = 70;
    stage.controls.maxPolarAngle = Math.PI * 0.52;
  }

  update(ms: number, ctx: ViewContext): void {
    const o = ctx.options;
    const t = ms / 1000;
    const g = smooth(0, STORM_T.grow, t);
    const top = BASE_KM + 1 + (TROPOPAUSE - BASE_KM - 1) * g;
    const anvil = 2 + 7 * smooth(STORM_T.grow * 0.9, 32 * MIN, t);
    const fade = 1 - smooth(48 * MIN, 60 * MIN, t);

    // 雲: 柱の部分と、てっぺんで横に広がるかなとこ雲 (上空の風で東 +x へのびる)
    const c = new THREE.Color();
    for (let i = 0; i < STORM_N; i++) {
      const inAnvil = i % 4 === 0;
      let x: number;
      let y: number;
      let z: number;
      const a = hash(i, 1) * Math.PI * 2;
      if (inAnvil) {
        if (top < TROPOPAUSE - 0.6) {
          this.cloud.hide(i);
          continue;
        }
        const r = anvil * Math.sqrt(hash(i, 2));
        x = Math.cos(a) * r * 1.2 + anvil * 0.35;
        z = Math.sin(a) * r * 0.7;
        y = TROPOPAUSE - 0.8 + hash(i, 3) * 1.1 - (r / anvil) * 0.6;
      } else {
        const h = BASE_KM + hash(i, 3) * (TROPOPAUSE - BASE_KM);
        // 柱は、おとろえると下のほうから消えていく
        if (h > top || h < BASE_KM + (1 - fade) * 8) {
          this.cloud.hide(i);
          continue;
        }
        const r = (2.4 + 0.6 * Math.sin(h * 1.3)) * Math.sqrt(hash(i, 2));
        x = Math.cos(a) * r;
        z = Math.sin(a) * r * 0.85;
        y = h + 0.2;
      }
      this.cloud.set(i, x, y, z);
      // 底のほうは暗い灰色、てっぺんは白
      const k = Math.min(1, (y - BASE_KM) / 8);
      c.setHex(0xffffff).multiplyScalar(0.5 + 0.5 * k);
      this.cloud.color(i, c);
    }
    this.cloud.done();

    // 大雨 (下降気流といっしょに)
    const raining = inWindow(t, STORM_T.rain);
    for (let i = 0; i < this.rain.n; i++) {
      if (!raining) {
        this.rain.hide(i);
        continue;
      }
      const period = 3 * MIN;
      const frac = ((t + hash(i, 4) * period) % period) / period;
      const a = hash(i, 5) * Math.PI * 2;
      const r = 2.6 * Math.sqrt(hash(i, 6));
      this.rain.set(i, 1.2 + Math.cos(a) * r, BASE_KM * (1 - frac), Math.sin(a) * r * 0.8);
    }
    this.rain.done();

    this.charges.visible = o.charge !== false && t > 10 * MIN && t < 52 * MIN;
    this.lightningOn = o.lightning !== false && inWindow(t, STORM_T.bolt);
    if (!this.lightningOn) this.setBolt(false);

    this.tornadoOn = o.tornado !== false && inWindow(t, STORM_T.tornado);
    // 竜巻は、雲の底から少しずつのびて地面にとどく
    const reach = smooth(STORM_T.tornado[0], STORM_T.tornado[0] + 3 * MIN, t) * (1 - smooth(STORM_T.tornado[1] - 3 * MIN, STORM_T.tornado[1], t));
    this.funnel.visible = this.tornadoOn && reach > 0.02;
    this.funnel.scale.set(1, BASE_KM * reach, 1);
    this.funnel.position.y = BASE_KM * (1 - reach);
    this.placeDebris(reach);

    this.wind.visible = !!o.wind && t < 52 * MIN;
    this.labels.show(o.labels !== false);
    this.stage.invalidate();
  }

  /** 竜巻の根もとで回る土ぼこり */
  private placeDebris(reach: number): void {
    for (let i = 0; i < this.debris.n; i++) {
      if (!this.funnel.visible || reach < 0.95) {
        this.debris.hide(i);
        continue;
      }
      const a = hash(i, 7) * Math.PI * 2 + this.spin * (1.5 + hash(i, 8));
      const r = 0.2 + hash(i, 9) * 0.6;
      this.debris.set(i, this.funnel.position.x + Math.cos(a) * r, hash(i, 10) * 0.45, this.funnel.position.z + Math.sin(a) * r);
    }
    this.debris.done();
  }

  private setBolt(on: boolean): void {
    if (on === this.boltOn) return;
    this.boltOn = on;
    this.bolt.visible = on;
    this.ambient.intensity = on ? 1.6 : 0.85;
    this.stage.background.setHex(on ? 0x9db6d2 : 0x6d8fb3);
    this.stage.invalidate();
  }

  /** 雲の − の部分から地面へ、ぎざぎざの線 */
  private newBolt(): void {
    const pts: THREE.Vector3[] = [];
    let x = (Math.random() - 0.3) * 3;
    let z = (Math.random() - 0.5) * 2;
    const toGround = Math.random() < 0.6;
    const y1 = toGround ? 0 : 7 + Math.random() * 2;
    for (let y = 4.4; toGround ? y > y1 : y < y1; y += toGround ? -0.35 : 0.35) {
      pts.push(new THREE.Vector3(x, y, z));
      x += (Math.random() - 0.5) * 0.6;
      z += (Math.random() - 0.5) * 0.4;
    }
    pts.push(new THREE.Vector3(x, y1, z));
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }

  /** 雷の光と竜巻の回転は、時刻が止まっていても、本当の時間で動かす */
  frame(dt: number): void {
    if (this.lightningOn) {
      if (this.flashLeft > 0) {
        this.flashLeft -= dt;
        if (this.flashLeft <= 0) this.setBolt(false);
      } else {
        this.nextFlash -= dt;
        if (this.nextFlash <= 0) {
          this.newBolt();
          this.setBolt(true);
          this.flashLeft = 0.12;
          this.nextFlash = 1.2 + Math.random() * 2.5;
        }
      }
    }
    if (this.funnel.visible) {
      this.spin += dt * 4;
      this.funnel.rotation.y = this.spin;
      this.placeDebris(1);
      this.stage.invalidate();
    }
  }

  setCamera(key: string): void {
    if (key === 'below') placeCamera(this.stage, [3, 0.5, 6.5], [-1.2, 3.2, 0], 1);
    else if (key === 'top') placeCamera(this.stage, [0, 34, 0.01], [0, 0, 0], 1.2);
    else placeCamera(this.stage, [0, 7, 30], [1, 6, 0], 1.2);
  }
}

// ======== 台風 ========
// 地球儀の上の台風。半径 5 の地球 (1 は約 1270 km)。北半球では反時計回りのうず。
// 赤道の北の暖かい海で生まれ、太平洋高気圧のふちを回って北上し、日本の近くで偏西風に流されて北東へ進む

const R = 5;
const TYPHOON_TOGGLES: Toggle[] = [
  { key: 'track', label: '進路(しんろ)' },
  { key: 'winds', label: '高気圧(こうきあつ)と偏西風(へんせいふう)' },
  { key: 'sst', label: '海面(かいめん)の水温(すいおん)' },
  { key: 'south', label: '南半球(みなみはんきゅう)のうず' },
  { key: 'labels', label: '名前(なまえ)' },
];
const TYPHOON_CAMERAS: CameraPreset[] = [
  { key: 'space', label: '宇宙(うちゅう)から' },
  { key: 'japan', label: '日本(にほん)の近(ちか)く' },
  { key: 'follow', label: '台風(たいふう)を追(お)う' },
];

let spiralTex: THREE.Texture | null = null;
/** 台風の雲 (うずまき・目つき) のテクスチャ。反時計回りのうず */
function spiralTexture(): THREE.Texture {
  if (spiralTex) return spiralTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const cx = S / 2;
  const glow = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
  glow.addColorStop(0, 'rgba(255,255,255,0)');
  glow.addColorStop(0.07, 'rgba(255,255,255,0)');
  glow.addColorStop(0.12, 'rgba(255,255,255,0.98)');
  glow.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  // らせんの雲の帯
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineCap = 'round';
  for (let arm = 0; arm < 4; arm++) {
    g.beginPath();
    for (let k = 0; k <= 80; k++) {
      const f = k / 80;
      const r = cx * (0.12 + 0.85 * f);
      // 外から中心へ反時計回りに巻きこむ (canvas の y は下向きなので、角度を負にする)
      const a = -(arm * Math.PI) / 2 - f * Math.PI * 1.6;
      const x = cx + r * Math.cos(a);
      const y = cx - r * Math.sin(a);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.lineWidth = 9;
    g.stroke();
  }
  spiralTex = new THREE.CanvasTexture(c);
  spiralTex.colorSpace = THREE.SRGBColorSpace;
  return spiralTex;
}

let sstTex: THREE.Texture | null = null;
/** 海面の水温の目安 (赤道に近いほど暖かい。台風が生まれるのは約 27 °C 以上の海) */
export function sstTexture(): THREE.Texture {
  if (sstTex) return sstTex;
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y / H) * 180;
    for (let x = 0; x < W; x += 4) {
      const lon = (x / W) * 360 - 180;
      // 西太平洋は暖かい (暖水プール)、東の端は冷たい
      const west = lon > 100 || lon < -170 ? 3 : lon > -120 && lon < -70 ? -3 : 0;
      const temp = 29 - 0.012 * lat * lat + west;
      const k = Math.max(0, Math.min(1, (temp - 22) / 8));
      if (k <= 0) continue;
      g.fillStyle = `rgba(${Math.round(255)},${Math.round(140 - 90 * k)},${Math.round(60 - 40 * k)},${(0.06 + 0.3 * k).toFixed(2)})`;
      g.fillRect(x, y, 4, 1);
    }
  }
  sstTex = new THREE.CanvasTexture(c);
  sstTex.colorSpace = THREE.SRGBColorSpace;
  return sstTex;
}

/** 地球の上の、緯度 lat・経度 lon の点 (高さ r) */
const globe = (lat: number, lon: number, r = R) => onGlobe(lat, lon).multiplyScalar(r);

/** 地球の表面にそって、東 (east) と北 (north) の向き */
export function tangents(lat: number, lon: number): { east: THREE.Vector3; north: THREE.Vector3; up: THREE.Vector3 } {
  const up = onGlobe(lat, lon);
  const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
  const north = up.clone().cross(east).normalize();
  return { east, north, up };
}

export class TyphoonView implements View {
  readonly id = 'typhoon' as const;
  readonly toggles = TYPHOON_TOGGLES;
  readonly cameras = TYPHOON_CAMERAS;
  readonly defaults: Record<string, boolean> = { track: true, winds: false, sst: false, south: false, labels: true };

  private readonly labels: Labels;
  private readonly storm = new THREE.Group();
  private readonly disc: THREE.Mesh;
  private readonly south = new THREE.Group();
  private readonly southDisc: THREE.Mesh;
  private readonly track = new THREE.Group();
  private readonly winds = new THREE.Group();
  private readonly sst: THREE.Mesh;
  private readonly inflow: THREE.ArrowHelper[] = [];
  private readonly stormLabel: CSS2DObject;
  private follow = false;
  private center = new THREE.Vector3();

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x0b1630);
    this.labels = new Labels(stage);
    root.add(new THREE.AmbientLight(0xffffff, 0.75));
    const light = new THREE.DirectionalLight(0xffffff, 1.1);
    light.position.copy(globe(15, 150, 30));
    root.add(light);
    root.add(earthMesh(R));

    this.sst = new THREE.Mesh(new THREE.SphereGeometry(R * 1.003, 96, 48), new THREE.MeshBasicMaterial({ map: sstTexture(), transparent: true, depthWrite: false }));
    root.add(this.sst);
    this.labels.add(this.sst, '暖(あたた)かい海(うみ) (27℃以上(いじょう))', globe(5, 160, R * 1.05), 'is-small is-warm');

    // 台風の雲 (地球の表面にそって置いた円盤)
    const mat = new THREE.MeshBasicMaterial({ map: spiralTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
    this.storm.add(this.disc);
    for (let i = 0; i < 8; i++) {
      const a = arrow(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.3, 0xffe36e, 0.12);
      this.inflow.push(a);
      this.storm.add(a);
    }
    root.add(this.storm);
    this.stormLabel = this.labels.add(this.storm, '台風(たいふう)', [0, 0, 0], 'is-small');

    // 南半球のうず (オーストラリアの北東。時計回り)
    this.southDisc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 48), mat);
    const sp = globe(-16, 158, R * 1.012);
    this.southDisc.position.copy(sp);
    this.southDisc.lookAt(sp.clone().multiplyScalar(2));
    // 裏返すと、うずの向きが逆 (時計回り) に見える
    this.southDisc.rotateY(Math.PI);
    this.south.add(this.southDisc);
    this.labels.add(this.south, '南半球(みなみはんきゅう)のうず (時計回(とけいまわ)り)', globe(-22, 158, R * 1.05), 'is-small');
    root.add(this.south);

    // 進路 (1 日ごとの印)
    const pts = typhoonTrack().map((s) => globe(s.lat, s.lon, R * 1.008));
    this.track.add(polyline(pts, 0xff5a4e, { opacity: 0.9 }));
    for (let d = 0; d <= TYPHOON_DAYS; d += 2) {
      const s = typhoonAt(d);
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a4e }));
      m.position.copy(globe(s.lat, s.lon, R * 1.008));
      this.track.add(m);
      this.labels.add(this.track, `${d}日(にち)`, globe(s.lat, s.lon + 2.2, R * 1.02), 'is-small');
    }
    root.add(this.track);

    // 太平洋高気圧 (時計回りに風がふき出す) と偏西風 (西から東へ)
    const high = { lat: 31, lon: 155 };
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const lat = high.lat + 9 * Math.sin(a);
      const lon = high.lon + 14 * Math.cos(a);
      const { east, north } = tangents(lat, lon);
      // 時計回り (北から見て): 接線の向き
      const dir = east.clone().multiplyScalar(-Math.sin(a)).addScaledVector(north, Math.cos(a)).negate();
      this.winds.add(arrow(dir, globe(lat, lon, R * 1.01), 0.4, 0x9fd8ff, 0.12));
    }
    this.labels.add(this.winds, '太平洋高気圧(たいへいようこうきあつ)', globe(high.lat, high.lon, R * 1.02), 'is-small');
    for (let lon = 100; lon <= 200; lon += 12) {
      const lat = 43 + 3 * Math.sin(lon / 15);
      this.winds.add(arrow(tangents(lat, lon).east, globe(lat, lon, R * 1.01), 0.55, 0xffffff, 0.14));
    }
    this.labels.add(this.winds, '偏西風(へんせいふう)', globe(47, 170, R * 1.02), 'is-small');
    root.add(this.winds);

    this.labels.add(root, '日本(にほん)', globe(41, 127, R * 1.02), 'is-small');

    stage.controls.minDistance = R * 1.15;
    stage.controls.maxDistance = R * 8;
  }

  update(ms: number, ctx: ViewContext): void {
    const o = ctx.options;
    const day = ms / 86_400_000;
    const s = typhoonAt(day);
    const p = globe(s.lat, s.lon, R * 1.012);
    this.center.copy(p);
    // 生まれる前は小さな雲のかたまり、台風でなくなると (温帯低気圧) ぼやけて広がる
    const k = s.radius / 1270;
    const strength = Math.max(0, Math.min(1, (1008 - s.pressure) / 70));
    this.disc.position.copy(p);
    this.disc.lookAt(p.clone().multiplyScalar(2));
    // 反時計回りに回す (1 日に約 1 回転として見せる)
    this.disc.rotateZ(day * Math.PI * 2);
    this.disc.scale.setScalar(k * 1.6);
    const mat = this.disc.material as THREE.MeshBasicMaterial;
    mat.opacity = s.alive ? 0.55 + 0.45 * strength : 0.35;
    this.southDisc.rotation.z = 0;
    this.southDisc.lookAt(this.southDisc.position.clone().multiplyScalar(2));
    this.southDisc.rotateY(Math.PI);
    this.southDisc.rotateZ(day * Math.PI * 2);

    // 中心に向かって反時計回りにふきこむ風
    const { east, north, up } = tangents(s.lat, s.lon);
    this.inflow.forEach((a, i) => {
      const ang = (i / this.inflow.length) * Math.PI * 2;
      const radial = east.clone().multiplyScalar(Math.cos(ang)).addScaledVector(north, Math.sin(ang));
      const ccw = up.clone().cross(radial);
      a.position.copy(p).addScaledVector(radial, k * 1.3);
      setArrow(a, ccw.multiplyScalar(0.9).addScaledVector(radial, -0.4), 0.22 + 0.25 * strength, 0.1);
      a.visible = s.alive;
    });
    this.stormLabel.position.copy(p).addScaledVector(up, 0.3).addScaledVector(north, -k * 1.9);

    this.track.visible = o.track !== false;
    this.winds.visible = !!o.winds;
    this.sst.visible = !!o.sst;
    this.south.visible = !!o.south;
    this.labels.show(o.labels !== false);
    if (this.follow) this.aim();
    this.labels.occlude(this.stage.camera.position, R);
    this.stage.invalidate();
  }

  /** 地球の裏がわの名前は、カメラを回したときにもかくす */
  frame(): void {
    if (this.labels.occlude(this.stage.camera.position, R)) this.stage.invalidate();
  }

  private aim(): void {
    const dir = this.center.clone().normalize();
    this.stage.controls.target.copy(this.center);
    this.stage.camera.position.copy(dir.multiplyScalar(R * 1.9));
    this.stage.controls.update();
  }

  setCamera(key: string): void {
    this.follow = key === 'follow';
    if (this.follow) this.aim();
    else if (key === 'japan') {
      const at = globe(30, 135);
      const k = this.stage.fit(1.1);
      this.stage.controls.target.copy(at.clone().multiplyScalar(0.9));
      this.stage.camera.position.copy(globe(28, 137, R * (1 + 1.1 * k)));
      this.stage.controls.update();
    } else {
      const k = this.stage.fit(1.1);
      this.stage.controls.target.set(0, 0, 0);
      this.stage.camera.position.copy(globe(22, 145, R * 3.4 * k));
      this.stage.controls.update();
    }
    this.stage.invalidate();
  }
}
