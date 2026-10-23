import * as THREE from 'three';
import { equatorialVector } from '../astro/coords';
import { bodiesAt } from '../astro/state';
import { GEOMAG_POLE, OVAL_WIDTH, ovalLat } from '../earth/aurora';
import { COLORS, earthMesh, polyline, sunMesh } from '../three/bodies';
import { earthQuaternion, eqToScene, onGlobe } from '../three/frames';
import type { Stage } from '../three/stage';
import { Labels, Particles, hash, smooth } from './parts';
import type { CameraPreset, Toggle, View, ViewContext } from './types';

// オーロラ。本当の日時の太陽の向きと地球の自転で、太陽風・地球の磁力線・オーロラの輪 (オーロラオーバル) をかく。
// 地球の磁石の軸は自転の軸から約 9° かたむいているので、輪は 1 日の間にゆれ動く。輪は夜のがわで明るく光る

const R = 2;
const SUN_DIST = 30;

const TOGGLES: Toggle[] = [
  { key: 'wind', label: '太陽風(たいようふう)' },
  { key: 'field', label: '磁力線(じりょくせん)' },
  { key: 'aurora', label: 'オーロラの輪(わ)' },
  { key: 'storm', label: '太陽風(たいようふう)が強(つよ)いとき' },
  { key: 'place', label: '観察(かんさつ)地点(ちてん)' },
  { key: 'labels', label: '名前(なまえ)' },
];
const CAMERAS: CameraPreset[] = [
  { key: 'space', label: '宇宙(うちゅう)から' },
  { key: 'north', label: '北極(ほっきょく)の上(うえ)から' },
  { key: 'south', label: '南極(なんきょく)の上(うえ)から' },
  { key: 'night', label: '夜(よる)のがわ' },
];

/** 地球の中での向き (半径 1) → 地磁気の北極を +y にした座標の、地磁気緯度 mlat・地磁気経度 mlon の点 */
function magBasis(): { axis: THREE.Vector3; e1: THREE.Vector3; e2: THREE.Vector3 } {
  const axis = onGlobe(GEOMAG_POLE.lat, GEOMAG_POLE.lon);
  const e1 = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
  const e2 = axis.clone().cross(e1).normalize();
  return { axis, e1, e2 };
}

const RING_SEG = 120;

export class AuroraView implements View {
  readonly id = 'aurora' as const;
  readonly toggles = TOGGLES;
  readonly cameras = CAMERAS;
  readonly defaults: Record<string, boolean> = { wind: true, field: true, aurora: true, storm: false, place: true, labels: true };

  private readonly labels: Labels;
  private readonly earth: THREE.Mesh;
  private readonly sun: THREE.Group;
  private readonly pin: THREE.Mesh;
  private readonly ovals: THREE.Mesh[] = [];
  private readonly field = new THREE.Group();
  private readonly wind: Particles;
  private readonly inflow: Particles;
  private readonly shell: THREE.Mesh;
  private readonly mag = magBasis();
  private ovalKey = '';
  private camKey = 'space';

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x050a18);
    this.labels = new Labels(stage);
    root.add(new THREE.AmbientLight(0xffffff, 0.18));
    const light = new THREE.PointLight(0xffffff, 2.6, 0, 0);
    this.sun = sunMesh(2.4);
    this.sun.add(light);
    root.add(this.sun);
    this.labels.add(this.sun, '太陽(たいよう)', [0, 3.8, 0], 'is-sun');

    this.earth = earthMesh(R);
    root.add(this.earth);
    this.pin = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: COLORS.place }));
    this.earth.add(this.pin);

    // オーロラの輪 (北と南)。高さ約 100〜300 km のカーテンの形 (高さは強調)
    for (const sign of [1, -1]) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RING_SEG + 1) * 2 * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array((RING_SEG + 1) * 2 * 3), 3));
      const idx: number[] = [];
      for (let i = 0; i < RING_SEG; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.userData.sign = sign;
      this.ovals.push(m);
      this.earth.add(m);
    }
    const { axis } = this.mag;
    this.labels.add(this.earth, 'オーロラの輪(わ)', axis.clone().multiplyScalar(R * 1.25), 'is-small');

    // 磁気圏 (太陽風がぶつかって、地球の磁場がおしこめられている範囲) の目安
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 30; i++) {
      const y = 6 - i * 1.1;
      prof.push(new THREE.Vector2(Math.sqrt(Math.max(0, (6 - y) * 7)), y));
    }
    this.shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), new THREE.MeshBasicMaterial({ color: 0x6f8fd8, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    root.add(this.shell);

    root.add(this.field);
    this.wind = new Particles(700, 0.6, { opacity: 0.9, color: 0xffe08a, additive: true });
    this.inflow = new Particles(120, 0.2, { opacity: 0.95, color: 0x9dffb8, additive: true });
    root.add(this.wind.points, this.inflow.points);
    this.labels.add(root, '太陽風(たいようふう)', [0, 0, 0], 'is-small');
    this.labels.add(root, '地球(ちきゅう)の磁力線(じりょくせん)', [0, 0, 0], 'is-small');

    stage.controls.minDistance = R * 1.5;
    stage.controls.maxDistance = 120;
  }

  update(ms: number, ctx: ViewContext): void {
    const o = ctx.options;
    const b = bodiesAt(ms);
    const storm = !!o.storm;
    earthQuaternion(b.gmst, b.eps, this.earth.quaternion);
    this.earth.updateMatrixWorld();
    const sunDir = eqToScene(equatorialVector(b.sun), b.eps).normalize();
    this.sun.position.copy(sunDir).multiplyScalar(SUN_DIST);
    this.pin.visible = o.place !== false;
    this.pin.position.copy(onGlobe(ctx.place.lat, ctx.place.lon)).multiplyScalar(R * 1.01);

    // 磁気圏は太陽と反対の向きにのびる
    this.shell.position.copy(sunDir).multiplyScalar(R * 2.6);
    this.shell.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir);
    this.shell.visible = o.field !== false;

    // 地球の中の太陽の向き (オーロラが夜のがわで光るように)
    const inv = this.earth.quaternion.clone().invert();
    const sunLocal = sunDir.clone().applyQuaternion(inv);
    this.drawOvals(sunLocal, storm, o.aurora !== false, ms);

    // 磁力線 (地磁気の軸を含む面の上の、双極子の形)。昼のがわはおしつぶされ、夜のがわは長くのびる
    const key = `${Math.round(ms / 600_000)}:${o.field}`;
    if (key !== this.ovalKey) {
      this.ovalKey = key;
      this.drawField(sunDir, o.field !== false);
    }

    // 太陽風: 太陽からふいてきて、磁気圏をよけて流れる
    const axisW = this.mag.axis.clone().applyQuaternion(this.earth.quaternion);
    const side1 = new THREE.Vector3().crossVectors(sunDir, axisW).normalize();
    const side2 = new THREE.Vector3().crossVectors(sunDir, side1).normalize();
    const speed = storm ? 2 : 1;
    const P = 2 * 3_600_000;
    for (let i = 0; i < this.wind.n; i++) {
      if (o.wind === false) {
        this.wind.hide(i);
        continue;
      }
      const u = 26 - ((((ms * speed) / P + hash(i, 1)) % 1) + 1) % 1 * 50;
      const a = hash(i, 2) * Math.PI * 2;
      let rr = Math.sqrt(hash(i, 3)) * 14;
      // 磁気圏のふち (太陽のがわで地球から約 6) より内がわには入れない
      const wall = u > 6 ? 0 : Math.sqrt((6 - u) * 7) + 0.4;
      if (rr < wall) rr = wall + (rr / Math.max(wall, 0.01)) * 0.6;
      const p = sunDir.clone().multiplyScalar(u).addScaledVector(side1, Math.cos(a) * rr).addScaledVector(side2, Math.sin(a) * rr);
      this.wind.set(i, p.x, p.y, p.z);
    }
    this.wind.done();

    // 夜のがわの磁力線にそって、極のまわりへ入ってくるつぶ
    for (let i = 0; i < this.inflow.n; i++) {
      if (o.wind === false || o.aurora === false) {
        this.inflow.hide(i);
        continue;
      }
      const sign = i % 2 ? 1 : -1;
      const f = (((ms * speed) / (P / 3) + hash(i, 4)) % 1 + 1) % 1;
      const L = 7 + hash(i, 5) * 3;
      const lam0 = Math.acos(Math.sqrt(1 / L));
      const lam = f * lam0 * sign;
      const r = L * Math.cos(lam) ** 2 * R;
      const phi = (hash(i, 6) - 0.5) * 1.6;
      // 夜のがわ (太陽と反対) の向き
      const night = sunDir.clone().negate().addScaledVector(axisW, -sunDir.clone().negate().dot(axisW)).normalize();
      const across = new THREE.Vector3().crossVectors(axisW, night).normalize();
      const dir = night.clone().multiplyScalar(Math.cos(phi)).addScaledVector(across, Math.sin(phi));
      const p = dir.multiplyScalar(r * Math.cos(lam)).addScaledVector(axisW, r * Math.sin(lam));
      if (p.length() < R * 1.02) {
        this.inflow.hide(i);
        continue;
      }
      this.inflow.set(i, p.x, p.y, p.z);
    }
    this.inflow.done();

    // ラベルの位置
    this.labels.list[2].position.copy(sunDir).multiplyScalar(18).addScaledVector(side1, 7);
    this.labels.list[3].position.copy(axisW).multiplyScalar(R * 3).addScaledVector(sunDir, -R * 3.5);
    this.labels.show(o.labels !== false);
    this.labels.list[2].visible = this.labels.list[2].visible && o.wind !== false;
    this.labels.list[3].visible = this.labels.list[3].visible && o.field !== false;
    this.labels.list[1].visible = this.labels.list[1].visible && o.aurora !== false;
    if (this.camKey !== 'space') this.setCamera(this.camKey);
    this.labels.occlude(this.stage.camera.position, R);
    this.stage.invalidate();
  }

  /** 地球の裏がわの名前は、カメラを回したときにもかくす */
  frame(): void {
    if (this.labels.occlude(this.stage.camera.position, R)) this.stage.invalidate();
  }

  private drawOvals(sunLocal: THREE.Vector3, storm: boolean, show: boolean, ms: number): void {
    const { axis, e1, e2 } = this.mag;
    const c = new THREE.Color();
    const green = new THREE.Color(0x5cf08a);
    const red = new THREE.Color(0xff5a7a);
    for (const m of this.ovals) {
      m.visible = show;
      if (!show) continue;
      const sign = m.userData.sign as number;
      const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
      const col = m.geometry.getAttribute('color') as THREE.BufferAttribute;
      const colat = ((90 - ovalLat(storm)) * Math.PI) / 180;
      for (let i = 0; i <= RING_SEG; i++) {
        const phi = (i / RING_SEG) * Math.PI * 2;
        // 輪は夜のがわで赤道のほうへ少し広がる
        const dir = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi));
        const night = Math.max(0, -dir.dot(sunLocal));
        const th = colat + night * ((OVAL_WIDTH * 0.6 * Math.PI) / 180);
        const p = axis.clone().multiplyScalar(sign * Math.cos(th)).addScaledVector(dir, Math.sin(th)).normalize();
        pos.setXYZ(2 * i, p.x * R * 1.012, p.y * R * 1.012, p.z * R * 1.012);
        pos.setXYZ(2 * i + 1, p.x * R * 1.07, p.y * R * 1.07, p.z * R * 1.07);
        // 明るさ: 夜のがわ (とくに真夜中のがわ) で明るい。少しゆらゆらさせる
        const dark = smooth(0.15, -0.35, p.dot(sunLocal));
        const flicker = 0.75 + 0.25 * Math.sin(phi * 9 + ms / 900_000);
        const k = (0.08 + 0.92 * dark) * flicker * (storm ? 1.3 : 1);
        c.copy(green).multiplyScalar(k);
        col.setXYZ(2 * i, c.r, c.g, c.b);
        c.copy(storm ? red : green).multiplyScalar(k * (storm ? 0.8 : 0.25));
        col.setXYZ(2 * i + 1, c.r, c.g, c.b);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      m.geometry.computeBoundingSphere();
    }
  }

  private drawField(sunDir: THREE.Vector3, show: boolean): void {
    for (const ch of [...this.field.children]) {
      (ch as THREE.Line).geometry.dispose();
      ((ch as THREE.Line).material as THREE.Material).dispose();
      this.field.remove(ch);
    }
    this.field.visible = show;
    if (!show) return;
    const axisW = this.mag.axis.clone().applyQuaternion(this.earth.quaternion);
    const ref = Math.abs(axisW.dot(sunDir)) > 0.95 ? new THREE.Vector3(1, 0, 0) : sunDir;
    const u1 = ref.clone().addScaledVector(axisW, -ref.dot(axisW)).normalize();
    const u2 = new THREE.Vector3().crossVectors(axisW, u1).normalize();
    for (let k = 0; k < 8; k++) {
      const phi = (k / 8) * Math.PI * 2;
      const dir = u1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(u2, Math.sin(phi));
      const toSun = dir.dot(sunDir);
      for (const L of [2, 3.5, 5.5]) {
        const lam0 = Math.acos(Math.sqrt(1 / L));
        const pts: THREE.Vector3[] = [];
        for (let j = 0; j <= 48; j++) {
          const lam = -lam0 + (2 * lam0 * j) / 48;
          // 昼のがわはつぶれ、夜のがわはのびる
          const squash = toSun > 0 ? 1 - 0.28 * toSun * (L / 5.5) : 1 + 0.9 * -toSun * (L / 5.5) ** 1.5;
          const r = L * Math.cos(lam) ** 2 * R * squash;
          pts.push(dir.clone().multiplyScalar(r * Math.cos(lam)).addScaledVector(axisW, r * Math.sin(lam) * (1 / Math.max(0.6, squash) ** 0.3)));
        }
        this.field.add(polyline(pts, 0x8fa8d8, { opacity: 0.45 }));
      }
    }
  }

  setCamera(key: string): void {
    this.camKey = key;
    const cam = this.stage.camera;
    const c = this.stage.controls;
    const k = this.stage.fit(1.2);
    c.target.set(0, 0, 0);
    const north = new THREE.Vector3(0, 1, 0).applyQuaternion(this.earth.quaternion);
    const sunDir = this.sun.position.clone().normalize();
    if (key === 'north' || key === 'south') {
      // 極の真上から。太陽が画面の上に来るようにする
      const s = key === 'north' ? 1 : -1;
      cam.position.copy(north).multiplyScalar(s * R * 4.2 * k);
      cam.up.copy(sunDir);
    } else if (key === 'night') {
      cam.position.copy(sunDir).multiplyScalar(-R * 3.4 * k).addScaledVector(north, R * 1.6 * k);
      cam.up.set(0, 1, 0);
    } else {
      // 太陽と地球の両方が入るように、その間を横から見る
      const side = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
      c.target.copy(sunDir).multiplyScalar(12);
      cam.position.copy(c.target).addScaledVector(side, 62 * k).add(new THREE.Vector3(0, 20 * k, 0));
      cam.up.set(0, 1, 0);
    }
    c.update();
    this.stage.invalidate();
  }

  dispose(): void {
    this.stage.camera.up.set(0, 1, 0);
  }
}
