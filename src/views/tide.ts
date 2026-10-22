import * as THREE from 'three';
import { equatorialVector } from '../astro/coords';
import { bodiesAt } from '../astro/state';
import { SUN_RATIO } from '../astro/tide';
import { COLORS, arrow, circle, earthMesh, moonMesh, setArrow, sunMesh } from '../three/bodies';
import { earthQuaternion, eqToScene, onGlobe } from '../three/frames';
import type { Stage } from '../three/stage';
import type { CameraPreset, Toggle, View, ViewContext } from './types';

// 潮の満ち引き。地球のまわりの海水が、月の方向とその反対側にふくらむようすを、大きく強調してかく。
// 矢印は起潮力 (月・太陽が引く力の、場所によるちがい)。新月・満月では月と太陽の力が同じ向きにそろって大潮、
// 上弦・下弦では直角になって打ち消しあい小潮になる

const EARTH_R = 2;
const WATER_R = 2.08;
/** 海面のふくらみを何倍に強調するか */
const EXAGGERATE = 0.42;
const MOON_DIST = 9;
const SUN_DIST = 42;
const FORCE_POINTS = 16;

const TOGGLES: Toggle[] = [
  { key: 'moonForce', label: '月(つき)の力(ちから)' },
  { key: 'sunForce', label: '太陽(たいよう)の力(ちから)' },
  { key: 'arrows', label: '力(ちから)の矢印(やじるし)' },
  { key: 'place', label: '観察(かんさつ)地点(ちてん)' },
  { key: 'labels', label: '名前(なまえ)' },
];

const CAMERAS: CameraPreset[] = [
  { key: 'top', label: '北(きた)の上(うえ)から' },
  { key: 'tilt', label: 'ななめから' },
  { key: 'far', label: '太陽(たいよう)まで' },
];

export class TideView implements View {
  readonly id = 'tide' as const;
  readonly toggles = TOGGLES;
  readonly cameras = CAMERAS;
  readonly defaults: Record<string, boolean> = { moonForce: true, sunForce: true, arrows: true, place: true, labels: true };

  private readonly earth: THREE.Mesh;
  private readonly water: THREE.Mesh;
  private readonly baseDirs: THREE.Vector3[] = [];
  private readonly moon: THREE.Mesh;
  private readonly sun: THREE.Group;
  private readonly pin: THREE.Mesh;
  private readonly arrows: THREE.ArrowHelper[] = [];
  private readonly arrowGroup = new THREE.Group();
  private readonly labelObjs: THREE.Object3D[] = [];

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x0b1630);
    root.add(new THREE.AmbientLight(0xffffff, 0.55));
    const light = new THREE.PointLight(0xffffff, 2.2, 0, 0);
    root.add(light);
    this.sun = sunMesh(2.2);
    this.sun.add(light);
    root.add(this.sun);
    this.addLabel(this.sun, '太陽(たいよう)', new THREE.Vector3(0, 3.6, 0));

    this.earth = earthMesh(EARTH_R);
    this.pin = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: COLORS.place }));
    this.earth.add(this.pin);
    root.add(this.earth);

    // 海水の層 (頂点を、その向きの海面の高さに合わせて動かす)
    const geo = new THREE.SphereGeometry(WATER_R, 96, 48);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) this.baseDirs.push(new THREE.Vector3().fromBufferAttribute(pos, i).normalize());
    this.water = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.45, depthWrite: false }));
    root.add(this.water);

    this.moon = moonMesh(0.55);
    root.add(this.moon);
    this.addLabel(this.moon, '月(つき)', new THREE.Vector3(0, 0.95, 0));
    root.add(circle(MOON_DIST, COLORS.moonPath, { opacity: 0.35, dashed: true }));

    // 起潮力の矢印 (月の通り道の面の上に、地球をぐるりと囲んでならべる)
    for (let i = 0; i < FORCE_POINTS; i++) {
      const a = arrow(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, COLORS.force, 0.22);
      this.arrows.push(a);
      this.arrowGroup.add(a);
    }
    root.add(this.arrowGroup);

    stage.controls.minDistance = 4;
    stage.controls.maxDistance = 120;
  }

  private addLabel(parent: THREE.Object3D, text: string, at: THREE.Vector3): void {
    const l = this.stage.label(text);
    l.position.copy(at);
    parent.add(l);
    this.labelObjs.push(l);
  }

  update(ms: number, ctx: ViewContext): void {
    const b = bodiesAt(ms);
    const o = ctx.options;
    earthQuaternion(b.gmst, b.eps, this.earth.quaternion);
    this.pin.visible = o.place !== false;
    onGlobe(ctx.place.lat, ctx.place.lon, this.pin.position).multiplyScalar(EARTH_R * 1.01);

    const moonDir = eqToScene(equatorialVector(b.moon), b.eps);
    const sunDir = eqToScene(equatorialVector(b.sun), b.eps);
    this.moon.position.copy(moonDir).multiplyScalar(MOON_DIST);
    this.moon.lookAt(0, 0, 0);
    this.sun.position.copy(sunDir).multiplyScalar(SUN_DIST);

    const km = o.moonForce === false ? 0 : (384_400 / b.moon.dist) ** 3;
    const ks = o.sunForce === false ? 0 : SUN_RATIO / b.sun.dist ** 3;

    // 海面: 向き d の高さは k·(3cos²θ − 1)/2 (θ は月・太陽の方向との角)
    const pos = this.water.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.baseDirs.length; i++) {
      const d = this.baseDirs[i];
      const cm = d.dot(moonDir);
      const cs = d.dot(sunDir);
      const h = (km * (3 * cm * cm - 1) + ks * (3 * cs * cs - 1)) / 2;
      const r = WATER_R + EXAGGERATE * h;
      pos.setXYZ(i, d.x * r, d.y * r, d.z * r);
    }
    pos.needsUpdate = true;
    this.water.geometry.computeVertexNormals();

    // 起潮力: 向き d の場所で k·(3(d·b)b − d) (b は月・太陽の向き)
    this.arrowGroup.visible = o.arrows !== false;
    const normal = new THREE.Vector3().crossVectors(moonDir, new THREE.Vector3(0, 1, 0)).cross(moonDir).normalize();
    const side = new THREE.Vector3().crossVectors(normal, moonDir).normalize();
    const f = new THREE.Vector3();
    for (let i = 0; i < FORCE_POINTS; i++) {
      const a = (i / FORCE_POINTS) * Math.PI * 2;
      const d = moonDir.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
      f.copy(moonDir)
        .multiplyScalar(3 * km * d.dot(moonDir))
        .addScaledVector(sunDir, 3 * ks * d.dot(sunDir))
        .addScaledVector(d, -(km + ks));
      const at = d.clone().multiplyScalar(WATER_R + 0.35);
      this.arrows[i].position.copy(at);
      setArrow(this.arrows[i], f, f.length() * 0.75, 0.22);
    }
    for (const l of this.labelObjs) l.visible = o.labels !== false;
    this.stage.invalidate();
  }

  setCamera(key: string): void {
    const controls = this.stage.controls;
    controls.target.set(0, 0, 0);
    const cam = this.stage.camera.position;
    const k = this.stage.fit(1.1);
    if (key === 'far') cam.set(0, 70, 24).multiplyScalar(k);
    else if (key === 'tilt') cam.set(-8, 10, 14).multiplyScalar(k);
    else cam.set(0, 24, 0.01).multiplyScalar(k);
    controls.update();
    this.stage.invalidate();
  }
}
