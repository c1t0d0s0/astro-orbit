import * as THREE from 'three';
import { bodiesAt } from '../astro/state';
import { COLORS, arrow, circle, earthMesh, moonMesh } from '../three/bodies';
import { earthQuaternion, eclLonLat, onGlobe } from '../three/frames';
import type { Stage } from '../three/stage';
import type { CameraPreset, Toggle, View, ViewContext } from './types';

// 月の満ち欠け。地球を中心に、月の公転を北 (黄道の北) の上からながめる。
// 太陽の光は右から左など、いつも決まった向きから来るように、カメラは太陽の方向に合わせて回す。
// 右下の小さな窓は「地球から見た月」(北半球の人が南の空を見たときの向き。南半球では上下左右が逆)

const ORBIT = 7;
const EARTH_R = 1.1;
const MOON_R = 0.5;
/** 新月・三日月・上弦… の位置にならべる月 (太陽と月の黄経の差) */
const GHOSTS: [number, string][] = [
  [0, '新月(しんげつ)'],
  [45, '三日月(みかづき)'],
  [90, '上弦(じょうげん)の月(つき)'],
  [135, ''],
  [180, '満月(まんげつ)'],
  [225, ''],
  [270, '下弦(かげん)の月(つき)'],
  [315, ''],
];
const GHOST_LAYER = 1;

const TOGGLES: Toggle[] = [
  { key: 'ghosts', label: '8つの位置(いち)の月(つき)' },
  { key: 'inset', label: '地球(ちきゅう)から見(み)た月(つき)' },
  { key: 'south', label: '南半球(みなみはんきゅう)から見(み)る' },
  { key: 'labels', label: '名前(なまえ)' },
];

const CAMERAS: CameraPreset[] = [
  { key: 'top', label: '北(きた)の上(うえ)から' },
  { key: 'tilt', label: 'ななめから' },
];

export class MoonView implements View {
  readonly id = 'moon' as const;
  readonly toggles = TOGGLES;
  readonly cameras = CAMERAS;
  readonly defaults: Record<string, boolean> = { ghosts: true, inset: true, south: false, labels: true };

  private readonly earth: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly light = new THREE.DirectionalLight(0xffffff, 3);
  private readonly ghosts = new THREE.Group();
  private readonly rays = new THREE.Group();
  private readonly insetCam = new THREE.PerspectiveCamera(5, 1, 0.1, 100);
  private readonly pin: THREE.Mesh;
  private readonly labelObjs: THREE.Object3D[] = [];
  /** カメラを、太陽の向きに合わせて回す角度 (いまの値) */
  private sunAngle = 0;
  private turn = new THREE.Group();

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x0b1630);
    root.add(new THREE.AmbientLight(0xffffff, 0.06));
    root.add(this.light, this.light.target);
    this.light.layers.enableAll();

    this.earth = earthMesh(EARTH_R);
    this.pin = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: COLORS.place }));
    this.earth.add(this.pin);
    root.add(this.earth);
    const el = stage.label('地球(ちきゅう)', '');
    el.position.set(0, -EARTH_R - 0.6, 0);
    root.add(el);
    this.labelObjs.push(el);
    root.add(circle(ORBIT, COLORS.moonPath, { opacity: 0.4, dashed: true }));

    this.moon = moonMesh(MOON_R);
    root.add(this.moon);

    // 新月・上弦・満月・下弦などの位置の月 (うすく。小窓には写さない)
    for (const [phase, name] of GHOSTS) {
      const g = moonMesh(MOON_R * 0.75);
      (g.material as THREE.MeshLambertMaterial).transparent = true;
      (g.material as THREE.MeshLambertMaterial).opacity = 0.55;
      g.userData.phase = phase;
      g.layers.set(GHOST_LAYER);
      if (name) {
        const l = stage.label(name, 'is-small');
        l.position.set(0, -MOON_R - 0.45, 0);
        g.add(l);
        this.labelObjs.push(l);
      }
      this.ghosts.add(g);
    }
    root.add(this.ghosts);
    stage.camera.layers.enable(GHOST_LAYER);

    // 太陽の光 (平行な矢印)
    for (let i = -2; i <= 2; i++) {
      this.rays.add(arrow(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(ORBIT + 5.5, 0, i * 2.2), 3, 0xffd75e, 0.5));
    }
    const sl = stage.label('太陽(たいよう)の光(ひかり)', 'is-sun');
    sl.position.set(ORBIT + 4.5, 0, -6.2);
    this.rays.add(sl);
    this.labelObjs.push(sl);
    this.turn.add(this.rays);
    root.add(this.turn);

    stage.controls.minDistance = 4;
    stage.controls.maxDistance = 60;
    stage.insets = [
      {
        camera: this.insetCam,
        background: new THREE.Color(0x05080f),
        caption: '地球(ちきゅう)から見(み)た月(つき)',
        rect: (w, h) => {
          const s = Math.round(Math.min(w, h) * 0.34);
          return { x: w - s - 10, y: 10, w: s, h: s };
        },
      },
    ];
  }

  update(ms: number, ctx: ViewContext): void {
    const b = bodiesAt(ms);
    const o = ctx.options;
    const sunDir = eclLonLat(b.sun.lon, 0);
    this.light.position.copy(sunDir).multiplyScalar(50);

    earthQuaternion(b.gmst, b.eps, this.earth.quaternion);
    onGlobe(ctx.place.lat, ctx.place.lon, this.pin.position).multiplyScalar(EARTH_R);

    const moonDir = eclLonLat(b.moon.lon, 0);
    this.moon.position.copy(moonDir).multiplyScalar(ORBIT);
    this.moon.lookAt(0, 0, 0);

    // 光の矢印とうすい月は、太陽の向きに合わせて回す (太陽はいつも +x の遠くにある)
    const angle = Math.atan2(-sunDir.z, sunDir.x);
    this.turn.rotation.y = angle;
    this.ghosts.visible = o.ghosts !== false;
    for (const g of this.ghosts.children) {
      g.position.copy(eclLonLat(b.sun.lon + g.userData.phase, 0)).multiplyScalar(ORBIT);
      g.lookAt(0, 0, 0);
    }
    // カメラも、太陽の向きが変わった分だけ回す (太陽の光がいつも同じ方向から来るように見せる)
    const cam = this.stage.camera.position;
    cam.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle - this.sunAngle);
    this.sunAngle = angle;

    // 地球から見た月。北半球の人は月を南の空に見るので、黄道の北が上。南半球の人は北の空に見るので、上下左右が逆
    this.insetCam.position.copy(moonDir).multiplyScalar(EARTH_R * 1.05);
    this.insetCam.up.set(0, o.south ? -1 : 1, 0);
    this.insetCam.lookAt(this.moon.position);
    this.insetCam.fov = (2 * Math.atan(MOON_R * 1.5 / ORBIT) * 180) / Math.PI;
    this.stage.insets[0].caption = o.south ? '南半球(みなみはんきゅう)から見(み)た月(つき)' : '北半球(きたはんきゅう)から見(み)た月(つき)';
    this.stage.insets[0].rect = (w, h) => {
      const s = o.inset === false ? 0 : Math.round(Math.min(w, h) * 0.34);
      return { x: w - s - 10, y: 10, w: Math.max(s, 1), h: Math.max(s, 1) };
    };
    for (const l of this.labelObjs) l.visible = o.labels !== false;
    this.stage.invalidate();
  }

  setCamera(key: string): void {
    const controls = this.stage.controls;
    controls.target.set(0, 0, 0);
    const k = this.stage.fit(1.1);
    const pos = (key === 'tilt' ? new THREE.Vector3(-6, 12, 16) : new THREE.Vector3(0, 24, 0.01)).multiplyScalar(k);
    // 太陽が画面の右にくるように、今の太陽の向きの分だけ回しておく
    this.stage.camera.position.copy(pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.sunAngle));
    controls.update();
    this.stage.invalidate();
  }
}
