import * as THREE from 'three';
import { sizes } from '../astro/eclipse';
import { asin, sin } from '../astro/math';
import { bodiesAt } from '../astro/state';
import { centuries } from '../astro/time';
import { COLORS, arrow, circle, earthMesh, polyline, sunMesh } from '../three/bodies';
import { earthQuaternion, eclLonLat, onGlobe } from '../three/frames';
import { moonMaterial } from '../three/moonShader';
import type { Stage } from '../three/stage';
import type { CameraPreset, Toggle, View, ViewContext } from './types';

// 日食と月食。地球を中心に、月の公転と、地球・月の影をかく。
// 月の通り道は黄道 (地球の公転の面) から 5.1° かたむいていて、新月・満月がその交わるところ (交点) の近くに
// 来たときだけ、太陽・地球・月が一直線にならんで食が起こる。
// 見やすくするため、地球と月を大きく、月の通り道のかたむきを 5 倍にかく。かたむきを 5 倍にすると、
// この画面の大きさで「影に月がかかる」のと、本当の食が起こるのが、ほぼ同じになる (地球の半径 0.6・月の距離 7)

const ORBIT = 7;
const EARTH_R = 0.6;
/** 地球と月の大きさの比は本当と同じ */
const MOON_R = EARTH_R * 0.2724;
/** 月の通り道のかたむきを何倍にかくか */
export const TILT = 5;
/** 月の通り道のかたむき (°) */
const INCLINATION = 5.145;
const EARTH_KM = 6378.14;
const MOON_KM = 1737.4;
const SUN_KM = 695_700;
const AU_KM = 149_597_870;

const TOGGLES: Toggle[] = [
  { key: 'shadows', label: '地球(ちきゅう)と月(つき)の影(かげ)' },
  { key: 'plane', label: '黄道面(こうどうめん) (地球(ちきゅう)の公転(こうてん)の面(めん))' },
  { key: 'nodes', label: '交点(こうてん)' },
  { key: 'labels', label: '名前(なまえ)' },
];

const CAMERAS: CameraPreset[] = [
  { key: 'tilt', label: 'ななめから' },
  { key: 'side', label: '真横(まよこ)から' },
  { key: 'top', label: '北(きた)の上(うえ)から' },
  { key: 'earth', label: '地球(ちきゅう)と月(つき)に近(ちか)づく' },
];

/** 月の公転の面と黄道が交わる点 (昇交点) の黄経 (°) */
const ascendingNode = (jd: number) => 125.0445479 - 1934.1362891 * centuries(jd);

/** 円すい (または円すい台) を、底の中心が原点、y の向きにのびる形で作る */
function cone(r0: number, r1: number, length: number, color: number, opacity: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r1, r0, length, 48, 1, true).translate(0, length / 2, 0);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
}

/**
 * 月の影が地球に落ちたところを暗くする、地球より少し大きい透明な球。
 * 月の中心から影の向き axis にのびる、本影 (先が細くなる) と半影 (広がる) の円すいの中を暗くぬる
 */
function shadowShell(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 1.004, 96, 48),
    new THREE.ShaderMaterial({
      uniforms: {
        moonPos: { value: new THREE.Vector3() },
        axis: { value: new THREE.Vector3(1, 0, 0) },
        moonR: { value: MOON_R },
        umbraLen: { value: 1 },
        penSlope: { value: 0 },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform vec3 moonPos;
        uniform vec3 axis;
        uniform float moonR;
        uniform float umbraLen;
        uniform float penSlope;
        varying vec3 vWorld;
        void main() {
          vec3 d = vWorld - moonPos;
          float t = dot(d, axis);
          if (t <= 0.0) discard;
          float r = length(d - t * axis);
          float pen = moonR + t * penSlope;
          float umb = moonR * (1.0 - t / umbraLen);
          float a = 0.55 * (1.0 - smoothstep(pen * 0.35, pen, r));
          if (umb > 0.0) a = max(a, 0.95 * (1.0 - smoothstep(umb * 0.8, max(umb, 0.004) * 1.2, r)));
          if (a < 0.01) discard;
          gl_FragColor = vec4(0.0, 0.0, 0.02, a);
        }`,
      transparent: true,
      depthWrite: false,
    }),
  );
}

export class EclipseView implements View {
  readonly id = 'eclipse' as const;
  readonly toggles = TOGGLES;
  readonly cameras = CAMERAS;
  readonly defaults: Record<string, boolean> = { shadows: true, plane: true, nodes: true, labels: true };

  private readonly earth: THREE.Mesh;
  private readonly pin: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly moonMat: THREE.ShaderMaterial;
  private readonly light = new THREE.DirectionalLight(0xffffff, 3);
  private readonly sun: THREE.Group;
  private readonly rays = new THREE.Group();
  private readonly turn = new THREE.Group();
  private readonly plane = new THREE.Group();
  private readonly orbit = new THREE.Group();
  private readonly nodes = new THREE.Group();
  private readonly shadows = new THREE.Group();
  private readonly earthUmbra = new THREE.Group();
  private readonly earthPenumbra = new THREE.Group();
  private readonly moonUmbra = new THREE.Group();
  private readonly moonPenumbra = new THREE.Group();
  private readonly shell: THREE.Mesh;
  private readonly labelObjs: THREE.Object3D[] = [];
  private nodeAt = Number.NaN;
  private sunAngle = 0;

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    stage.background.set(0x0b1630);
    root.add(new THREE.AmbientLight(0xffffff, 0.08));
    root.add(this.light, this.light.target);

    this.earth = earthMesh(EARTH_R);
    this.pin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: COLORS.place }));
    this.earth.add(this.pin);
    root.add(this.earth);
    this.addLabel(root, '地球(ちきゅう)', new THREE.Vector3(0, -EARTH_R - 0.45, 0));

    this.moonMat = moonMaterial();
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 48, 24).rotateY(-Math.PI / 2), this.moonMat);
    this.addLabel(this.moon, '月(つき)', new THREE.Vector3(0, MOON_R + 0.3, 0));
    root.add(this.moon);

    // 太陽 (遠く) と、太陽の光の矢印 (いつも画面の右から来るように、カメラといっしょに回す)
    this.sun = sunMesh(1.4);
    root.add(this.sun);
    for (let i = -2; i <= 2; i++) this.rays.add(arrow(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(ORBIT + 4.2, 0, i * 1.8), 2.4, 0xffd75e, 0.4));
    this.addLabel(this.rays, '太陽(たいよう)の光(ひかり)', new THREE.Vector3(ORBIT + 3.4, 0, -4.9), 'is-sun');
    this.turn.add(this.rays);
    root.add(this.turn);

    // 黄道面 (地球の公転の面)
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(ORBIT * 1.25, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.plane.add(disc, circle(ORBIT * 1.25, 0x9fc4ff, { opacity: 0.35 }));
    this.addLabel(this.plane, '黄道面(こうどうめん)', new THREE.Vector3(-ORBIT * 0.9, 0, ORBIT * 0.75), 'is-small');
    root.add(this.plane, this.orbit, this.nodes);

    // 影。円すいはどれも y の向きにのびる形で作り、影の向きに回す
    this.earthUmbra.add(cone(EARTH_R, 0, 1, 0x000000, 0.42));
    this.earthPenumbra.add(cone(EARTH_R, EARTH_R, 1, 0x1c2a4a, 0.16));
    this.moonUmbra.add(cone(MOON_R, 0, 1, 0x000000, 0.5));
    this.moonPenumbra.add(cone(MOON_R, MOON_R, 1, 0x1c2a4a, 0.18));
    this.addLabel(this.earthUmbra, '地球(ちきゅう)の影(かげ)', new THREE.Vector3(0.5, ORBIT * 1.55, 0), 'is-small');
    this.addLabel(this.moonUmbra, '月(つき)の影(かげ)', new THREE.Vector3(0.35, ORBIT * 0.45, 0), 'is-small');
    this.shadows.add(this.earthUmbra, this.earthPenumbra, this.moonUmbra, this.moonPenumbra);
    root.add(this.shadows);
    this.shell = shadowShell();
    root.add(this.shell);

    stage.controls.minDistance = 1.5;
    stage.controls.maxDistance = 80;
  }

  private addLabel(parent: THREE.Object3D, text: string, at: THREE.Vector3, cls = ''): void {
    const l = this.stage.label(text, cls);
    l.position.copy(at);
    parent.add(l);
    this.labelObjs.push(l);
  }

  /** 月の位置 (黄緯を TILT 倍にする) */
  private moonAt(lon: number, lat: number, out = new THREE.Vector3()): THREE.Vector3 {
    return eclLonLat(lon, lat * TILT, out).multiplyScalar(ORBIT);
  }

  /** 月の通り道と、交点 (昇交点・降交点) を結ぶ線 */
  private buildOrbit(node: number): void {
    for (const g of [this.orbit, this.nodes]) {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      g.clear();
    }
    const pts: THREE.Vector3[] = [];
    for (let lon = 0; lon <= 360; lon += 2) pts.push(this.moonAt(lon, asin(sin(INCLINATION) * sin(lon - node))));
    this.orbit.add(polyline(pts, COLORS.moonPath, { opacity: 0.6 }));
    const a = this.moonAt(node, 0);
    const d = this.moonAt(node + 180, 0);
    this.nodes.add(polyline([a, d], 0xffe36e, { opacity: 0.7, dashed: true }));
    for (const p of [a, d]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
      dot.position.copy(p);
      this.nodes.add(dot);
      const l = this.stage.label('交点(こうてん)', 'is-small is-pole');
      l.position.copy(p).add(new THREE.Vector3(0, 0.35, 0));
      this.nodes.add(l);
    }
  }

  update(ms: number, ctx: ViewContext): void {
    const b = bodiesAt(ms);
    const o = ctx.options;
    const z = sizes(b);
    const sunDir = eclLonLat(b.sun.lon, 0);
    const anti = sunDir.clone().negate();
    this.light.position.copy(sunDir).multiplyScalar(50);
    this.sun.position.copy(sunDir).multiplyScalar(40);

    earthQuaternion(b.gmst, b.eps, this.earth.quaternion);
    onGlobe(ctx.place.lat, ctx.place.lon, this.pin.position).multiplyScalar(EARTH_R);
    this.pin.visible = o.place !== false;

    const node = ascendingNode(b.jd);
    if (!(Math.abs(node - this.nodeAt) < 0.3)) {
      this.nodeAt = node;
      this.buildOrbit(node);
    }
    this.plane.visible = o.plane !== false;
    this.nodes.visible = o.nodes !== false;

    const moonPos = this.moonAt(b.moon.lon, b.moon.lat);
    this.moon.position.copy(moonPos);
    this.moon.lookAt(0, 0, 0);

    // 月にかかる地球の影 (この画面の大きさで計算する。地球の影の半径は、地球の半径の 0.73 倍ほど)
    const umbraR = EARTH_R * (z.umbra / z.moonParallax);
    const penR = EARTH_R * (z.penumbra / z.moonParallax);
    const u = this.moonMat.uniforms;
    u.sunDir.value.copy(sunDir);
    const dir = moonPos.clone().normalize();
    u.center.value.copy(dir);
    u.geo.value.copy(dir);
    u.axis.value.copy(anti);
    u.umbra.value = Math.atan(umbraR / ORBIT);
    u.penumbra.value = Math.atan(penR / ORBIT);
    u.k.value = 1;

    // 影の円すい
    this.shadows.visible = o.shadows !== false;
    const up = new THREE.Vector3(0, 1, 0);
    const toward = new THREE.Quaternion().setFromUnitVectors(up, anti);
    // 地球の本影: 月の距離で半径 umbraR になるように細くなり、その先でとがる
    const earthUmbraLen = (ORBIT * EARTH_R) / (EARTH_R - umbraR);
    this.earthUmbra.quaternion.copy(toward);
    this.earthUmbra.children[0].scale.set(1, earthUmbraLen, 1);
    this.earthPenumbra.quaternion.copy(toward);
    this.reshape(this.earthPenumbra, EARTH_R, EARTH_R + (penR - EARTH_R) * 1.5, ORBIT * 1.5);

    // 月の本影の長さ (本当の長さを、地球の表面までの距離との比のまま、この画面にうつす)
    const realUmbra = (b.sun.dist * AU_KM * MOON_KM) / (SUN_KM - MOON_KM);
    const toSurface = moonPos.length() - EARTH_R;
    const moonUmbraLen = toSurface * (realUmbra / (b.moon.dist - EARTH_KM));
    // 月の半影は、地球のあたりで半径が「太陽の見かけの半径 × 月の距離 + 月の半径」になるように広がる
    const penAtEarth = ((Math.tan((z.sun * Math.PI) / 180) * b.moon.dist + MOON_KM) / EARTH_KM) * EARTH_R;
    const penSlope = (penAtEarth - MOON_R) / toSurface;
    this.moonUmbra.position.copy(moonPos);
    this.moonUmbra.quaternion.copy(toward);
    this.moonUmbra.children[0].scale.set(1, moonUmbraLen, 1);
    this.moonPenumbra.position.copy(moonPos);
    this.moonPenumbra.quaternion.copy(toward);
    this.reshape(this.moonPenumbra, MOON_R, MOON_R + penSlope * toSurface * 1.1, toSurface * 1.1);
    // 月の影は、新月のころだけ見せる (地球の反対がわにのびていると、ごちゃごちゃして見える)
    const nearNew = anti.dot(moonPos.clone().normalize()) < -0.5;
    this.moonUmbra.visible = nearNew;
    this.moonPenumbra.visible = nearNew;

    // 地球の上の月の影
    const s = (this.shell.material as THREE.ShaderMaterial).uniforms;
    s.moonPos.value.copy(moonPos);
    s.axis.value.copy(anti);
    s.moonR.value = MOON_R;
    s.umbraLen.value = moonUmbraLen;
    s.penSlope.value = penSlope;
    this.shell.visible = nearNew;

    // 光の矢印とカメラを、太陽の向きに合わせて回す (太陽の光がいつも画面の右から来るように)
    const angle = Math.atan2(-sunDir.z, sunDir.x);
    this.turn.rotation.y = angle;
    this.stage.camera.position.applyAxisAngle(up, angle - this.sunAngle);
    this.stage.controls.target.applyAxisAngle(up, angle - this.sunAngle);
    this.sunAngle = angle;

    for (const l of this.labelObjs) l.visible = o.labels !== false;
    this.stage.invalidate();
  }

  /** 半影の円すい台の形を変える (形がほとんど変わらないときは、作りなおさない) */
  private reshape(group: THREE.Group, r0: number, r1: number, length: number): void {
    const mesh = group.children[0] as THREE.Mesh;
    const key = [r0, r1, length].map((v) => v.toFixed(3)).join(':');
    if (mesh.userData.key === key) return;
    mesh.userData.key = key;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.CylinderGeometry(r1, r0, length, 48, 1, true).translate(0, length / 2, 0);
  }

  setCamera(key: string): void {
    const controls = this.stage.controls;
    const k = this.stage.fit(1.5);
    // 太陽が +x にあるときの位置。あとで太陽の向きの分だけ回す
    let pos: THREE.Vector3;
    const target = new THREE.Vector3();
    switch (key) {
      case 'side':
        // 太陽を右にして、黄道面の真横から (月が影の上を通るか下を通るかが分かる)
        pos = new THREE.Vector3(0, 0.6, 17 * k);
        break;
      case 'top':
        pos = new THREE.Vector3(0, 19 * k, 0.01);
        break;
      case 'earth': {
        // 地球と、いまの月の両方が入るように、そのあいだを横から見る (この場合だけ、月の向きから直接決める)
        const toMoon = this.moon.position.clone().setY(0).normalize();
        const mid = toMoon.clone().multiplyScalar(3.2);
        const side = new THREE.Vector3().crossVectors(toMoon, new THREE.Vector3(0, 1, 0));
        controls.target.copy(mid);
        this.stage.camera.position.copy(mid).addScaledVector(side, 9.5 * k).add(new THREE.Vector3(0, 2.5 * k, 0));
        controls.update();
        this.stage.invalidate();
        return;
      }
      default:
        pos = new THREE.Vector3(-4 * k, 10 * k, 19 * k);
    }
    const up = new THREE.Vector3(0, 1, 0);
    controls.target.copy(target.applyAxisAngle(up, this.sunAngle));
    this.stage.camera.position.copy(pos.applyAxisAngle(up, this.sunAngle));
    controls.update();
    this.stage.invalidate();
  }
}
