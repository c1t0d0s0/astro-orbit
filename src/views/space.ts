import * as THREE from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { SEASON_LON, type SeasonPoint } from '../astro/events';
import { bodiesAt } from '../astro/state';
import { COLORS, axisLine, circle, earthMesh, latitudeRing, moonMesh, polyline, sunMesh } from '../three/bodies';
import { earthQuaternion, eclLonLat, onGlobe } from '../three/frames';
import type { Stage } from '../three/stage';
import type { CameraPreset, Toggle, View, ViewContext, ViewId } from './types';

// 宇宙から見た太陽・地球・月。
// - space: 全体図 (地球の自転と公転、月の公転)
// - seasons: 季節 (春分・夏至・秋分・冬至の地球をならべ、地軸がいつも同じ向きのまま公転するようすを見る)
// - polar: 白夜と極夜 (地球に近づき、北極圏・南極圏と昼夜の境目を見る)
// 大きさと距離は見やすく縮めている (地球と月の大きさの比だけは本当と同じ)

const ORBIT = 20;
const EARTH_R = 1;
const MOON_DIST = 3.6;
const MOON_R = 0.27;
const SUN_R = 2.2;
const DAY = 86_400_000;
/** 北極圏・南極圏の緯度 */
export const ARCTIC = 66.56;

const SEASON_LABEL: Record<SeasonPoint, string> = {
  spring: '春分(しゅんぶん)',
  summer: '夏至(げし)',
  autumn: '秋分(しゅうぶん)',
  winter: '冬至(とうじ)',
};

type Mode = 'space' | 'seasons' | 'polar';
type Follow = 'none' | 'orbit';

const TOGGLES: Record<Mode, Toggle[]> = {
  space: [
    { key: 'labels', label: '名前(なまえ)' },
    { key: 'moonPath', label: '月(つき)の通(とお)り道(みち)' },
    { key: 'place', label: '観察(かんさつ)地点(ちてん)' },
  ],
  seasons: [
    { key: 'ghosts', label: '4つの季節(きせつ)の地球(ちきゅう)' },
    { key: 'notilt', label: '地軸(ちじく)のかたむきをなくす' },
    { key: 'place', label: '観察(かんさつ)地点(ちてん)' },
    { key: 'labels', label: '名前(なまえ)' },
  ],
  polar: [
    { key: 'circles', label: '北極圏(ほっきょくけん)・南極圏(なんきょくけん)' },
    { key: 'place', label: '観察(かんさつ)地点(ちてん)' },
    { key: 'labels', label: '名前(なまえ)' },
  ],
};

const CAMERAS: Record<Mode, CameraPreset[]> = {
  space: [
    { key: 'whole', label: 'ななめ' },
    { key: 'top', label: '真上(まうえ)' },
    { key: 'earth', label: '地球(ちきゅう)に近(ちか)づく' },
  ],
  seasons: [
    { key: 'whole', label: 'ななめ' },
    { key: 'side', label: '真横(まよこ)' },
    { key: 'top', label: '真上(まうえ)' },
    { key: 'earth', label: '地球(ちきゅう)に近(ちか)づく' },
  ],
  polar: [
    { key: 'side', label: '横(よこ)から' },
    { key: 'north', label: '北極(ほっきょく)の上(うえ)から' },
    { key: 'south', label: '南極(なんきょく)の下(した)から' },
    { key: 'sun', label: '太陽(たいよう)の方(ほう)から' },
  ],
};

const DEFAULTS: Record<Mode, Record<string, boolean>> = {
  space: { labels: true, moonPath: true, place: true },
  seasons: { ghosts: true, notilt: false, place: true, labels: true },
  polar: { circles: true, place: true, labels: true },
};

export class SpaceView implements View {
  readonly id: ViewId;
  readonly toggles: readonly Toggle[];
  readonly cameras: readonly CameraPreset[];
  readonly defaults: Record<string, boolean>;

  private readonly earthGroup = new THREE.Group();
  private readonly earth: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly moonPath = new THREE.Group();
  private readonly pin: THREE.Mesh;
  private readonly pinLabel: CSS2DObject;
  private readonly ghosts = new THREE.Group();
  private readonly circles = new THREE.Group();
  private readonly labels: CSS2DObject[] = [];
  private follow: Follow = 'none';
  private readonly lastEarth = new THREE.Vector3();
  private lastAngle = 0;
  private moonPathAt = Number.NaN;
  private ghostYear = Number.NaN;
  private ghostTilt: boolean | null = null;

  constructor(
    private readonly stage: Stage,
    private readonly mode: Mode,
  ) {
    this.id = mode;
    this.toggles = TOGGLES[mode];
    this.cameras = CAMERAS[mode];
    this.defaults = DEFAULTS[mode];
    const root = stage.root;
    stage.background.set(0x0b1630);
    stage.controls.minDistance = 1.6;
    stage.controls.maxDistance = 140;

    // 太陽と、太陽から出る光
    const sun = sunMesh(SUN_R);
    root.add(sun);
    root.add(new THREE.PointLight(0xffffff, 3.4, 0, 0));
    root.add(new THREE.AmbientLight(0xffffff, mode === 'space' ? 0.12 : 0.07));
    this.addLabel(sun, '太陽(たいよう)', new THREE.Vector3(0, SUN_R + 1.2, 0));
    root.add(circle(ORBIT, COLORS.orbit, { opacity: 0.6 }));

    // 地球。earthGroup は公転の位置、earth は自転とかたむき
    this.earth = earthMesh(EARTH_R);
    this.earth.add(axisLine(EARTH_R * 2.8));
    if (mode === 'polar') {
      // 地球に近づいて見る画面だけ、地軸の北と南に名前をつける (遠くからだと重なって読めない)
      this.addLabel(this.earth, '北(きた)', new THREE.Vector3(0, EARTH_R * 1.6, 0), 'is-small');
      this.addLabel(this.earth, '南(みなみ)', new THREE.Vector3(0, -EARTH_R * 1.6, 0), 'is-small');
    }
    this.earth.add(latitudeRing(0, EARTH_R * 1.005, COLORS.equator, { opacity: 0.6 }));
    this.circles.add(latitudeRing(ARCTIC, EARTH_R * 1.006, COLORS.arctic), latitudeRing(-ARCTIC, EARTH_R * 1.006, COLORS.arctic));
    this.circles.add(latitudeRing(23.44, EARTH_R * 1.006, COLORS.tropic, { opacity: 0.7 }), latitudeRing(-23.44, EARTH_R * 1.006, COLORS.tropic, { opacity: 0.7 }));
    if (mode === 'polar') {
      this.addLabel(this.circles, '北極圏(ほっきょくけん)', new THREE.Vector3(0.4, EARTH_R * 0.93, 0), 'is-small is-arctic');
      this.addLabel(this.circles, '南極圏(なんきょくけん)', new THREE.Vector3(0.4, -EARTH_R * 0.93, 0), 'is-small is-arctic');
    }
    this.earth.add(this.circles);
    this.pin = new THREE.Mesh(new THREE.SphereGeometry(mode === 'polar' ? 0.045 : 0.07, 16, 8), new THREE.MeshBasicMaterial({ color: COLORS.place }));
    this.pinLabel = stage.label('', 'is-place');
    this.pinLabel.center.set(0, 1.2);
    this.pin.add(this.pinLabel);
    this.earth.add(this.pin);
    this.earthGroup.add(this.earth);
    if (mode !== 'polar') this.addLabel(this.earthGroup, '地球(ちきゅう)', new THREE.Vector3(0, -EARTH_R * 1.9, 0));
    root.add(this.earthGroup);

    // 月 (地球のまわり)
    this.moon = moonMesh(MOON_R);
    this.addLabel(this.moon, '月(つき)', new THREE.Vector3(0, MOON_R + 0.35, 0), 'is-small');
    this.earthGroup.add(this.moonPath);
    root.add(this.moon);
    if (mode !== 'space') {
      this.moon.visible = false;
      this.moonPath.visible = false;
    }
    root.add(this.ghosts);
  }

  private addLabel(parent: THREE.Object3D, text: string, at: THREE.Vector3, cls = ''): CSS2DObject {
    const l = this.stage.label(text, cls);
    l.position.copy(at);
    parent.add(l);
    this.labels.push(l);
    return l;
  }

  update(ms: number, ctx: ViewContext): void {
    const b = bodiesAt(ms);
    const o = ctx.options;
    const eps = o.notilt ? 0 : b.eps;

    // 地球は、太陽から見て、地球から見た太陽の反対側にある
    const earthPos = eclLonLat(b.sun.lon + 180, 0).multiplyScalar(ORBIT);
    if (this.follow === 'orbit') {
      // 地球についていく。太陽との位置関係が変わらないよう、公転した角度だけカメラも回す
      const cam = this.stage.camera.position;
      const target = this.stage.controls.target;
      const angle = Math.atan2(-earthPos.z, earthPos.x);
      const offset = cam.clone().sub(target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle - this.lastAngle);
      target.add(earthPos.clone().sub(this.lastEarth));
      cam.copy(target).add(offset);
      this.lastAngle = angle;
    }
    this.lastEarth.copy(earthPos);
    this.earthGroup.position.copy(earthPos);
    earthQuaternion(b.gmst, eps, this.earth.quaternion);

    // 観察地点
    this.pin.visible = o.place !== false;
    onGlobe(ctx.place.lat, ctx.place.lon, this.pin.position).multiplyScalar(EARTH_R);
    this.stage.setLabelText(this.pinLabel, ctx.place.name.replace(/ \(.*\)$/, ''));
    this.circles.visible = this.mode === 'polar' ? o.circles !== false : false;

    // 月
    if (this.mode === 'space') {
      const dir = eclLonLat(b.moon.lon, b.moon.lat);
      this.moon.position.copy(earthPos).addScaledVector(dir, MOON_DIST);
      this.moon.lookAt(earthPos);
      this.moonPath.visible = o.moonPath !== false;
      if (this.moonPath.visible && !(Math.abs(ms - this.moonPathAt) < 2 * DAY)) this.buildMoonPath(ms);
    }

    if (this.mode === 'seasons') {
      this.ghosts.visible = o.ghosts !== false;
      const year = new Date(ms).getUTCFullYear();
      if (this.ghosts.visible && (year !== this.ghostYear || this.ghostTilt !== !!o.notilt)) this.buildGhosts(year, eps, !!o.notilt);
    }

    for (const l of this.labels) l.visible = o.labels !== false;
    this.stage.invalidate();
  }

  /** 前後 2 週間の月の位置をつないだ線 (地球から見た月の通り道) */
  private buildMoonPath(ms: number): void {
    this.moonPathAt = ms;
    this.moonPath.clear();
    const pts: THREE.Vector3[] = [];
    for (let h = -14 * 24; h <= 14 * 24; h += 4) {
      const m = bodiesAt(ms + h * 3_600_000).moon;
      pts.push(eclLonLat(m.lon, m.lat).multiplyScalar(MOON_DIST));
    }
    this.moonPath.add(polyline(pts, COLORS.moonPath, { opacity: 0.55 }));
  }

  /** 春分・夏至・秋分・冬至の地球 (うすく表示)。どれも地軸は同じ向き */
  private buildGhosts(year: number, eps: number, notilt: boolean): void {
    this.ghostYear = year;
    this.ghostTilt = notilt;
    for (const child of [...this.ghosts.children]) {
      child.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
    }
    this.ghosts.clear();
    for (const which of Object.keys(SEASON_LON) as SeasonPoint[]) {
      const g = new THREE.Group();
      g.position.copy(eclLonLat(SEASON_LON[which] + 180, 0).multiplyScalar(ORBIT));
      const e = earthMesh(EARTH_R * 0.8);
      (e.material as THREE.MeshLambertMaterial).transparent = true;
      (e.material as THREE.MeshLambertMaterial).opacity = 0.55;
      earthQuaternion(0, eps, e.quaternion);
      e.add(axisLine(EARTH_R * 2.4));
      g.add(e);
      const l = this.stage.label(SEASON_LABEL[which], 'is-season');
      l.position.set(0, EARTH_R * 1.9, 0);
      g.add(l);
      this.ghosts.add(g);
    }
  }

  setCamera(key: string): void {
    const cam = this.stage.camera;
    const k = this.stage.fit();
    const target = this.stage.controls.target;
    const earth = this.lastEarth;
    this.follow = 'none';
    // 太陽から地球への向きと、それに直角な向き (黄道の面の上)
    const out = earth.clone().normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(out).normalize();
    switch (key) {
      case 'top':
        target.set(0, 0, 0);
        cam.position.set(0, 52 * k, 0.01);
        break;
      case 'side':
        if (this.mode === 'polar') {
          this.followEarth(side.multiplyScalar(5.4 * k).add(new THREE.Vector3(0, 2.2 * k, 0)));
          return;
        }
        target.set(0, 0, 0);
        cam.position.set(0, 3, 50 * k);
        break;
      case 'earth':
        this.followEarth(out.multiplyScalar(-2.2).addScaledVector(side, 5 * k).add(new THREE.Vector3(0, 2.4, 0)));
        return;
      case 'north':
        this.followEarth(new THREE.Vector3(0, 5.6 * k, 0).addScaledVector(out, -0.01));
        return;
      case 'south':
        this.followEarth(new THREE.Vector3(0, -5.6 * k, 0).addScaledVector(out, -0.01));
        return;
      case 'sun':
        this.followEarth(out.multiplyScalar(-5.6 * k).add(new THREE.Vector3(0, 0.8, 0)));
        return;
      default:
        target.set(0, 0, 0);
        cam.position.set(0, 28 * k, 42 * k);
    }
    this.stage.controls.update();
    this.stage.invalidate();
  }

  /** 地球からの位置 offset にカメラを置き、そのあとは地球についていく */
  private followEarth(offset: THREE.Vector3): void {
    this.follow = 'orbit';
    this.lastAngle = Math.atan2(-this.lastEarth.z, this.lastEarth.x);
    this.stage.controls.target.copy(this.lastEarth);
    this.stage.camera.position.copy(this.lastEarth).add(offset);
    this.stage.controls.update();
    this.stage.invalidate();
  }
}
