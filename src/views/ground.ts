import * as THREE from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { equatorialVector, localSiderealTime } from '../astro/coords';
import { coveredFraction, sizes, topocentricMoon } from '../astro/eclipse';
import { localMidnight, seasonPoint, type SeasonPoint } from '../astro/events';
import { cos, sin } from '../astro/math';
import { bodiesAt } from '../astro/state';
import { CONSTELLATIONS, STARS, starByName } from '../data/sky';
import { COLORS, circle, polyline } from '../three/bodies';
import { skyMatrix } from '../three/frames';
import type { Stage } from '../three/stage';
import { moonMaterial } from '../three/moonShader';
import { glowTexture } from '../three/textures';
import type { CameraPreset, Toggle, View, ViewContext } from './types';

// 地上から見た空。観察地点を中心にした「透明半球」を外からながめるか、中に立って見上げる。
// 地上の画面の向きは x が東、y が真上、z が南

const R = 10;
const DAY = 86_400_000;

const SEASON_COLOR: Record<SeasonPoint, number> = {
  spring: COLORS.equinox,
  summer: COLORS.summer,
  autumn: COLORS.equinox,
  winter: COLORS.winter,
};

const TOGGLES: Toggle[] = [
  { key: 'sunPath', label: '今日(きょう)の太陽(たいよう)の通(とお)り道(みち)' },
  { key: 'seasonPaths', label: '春分(しゅんぶん)・夏至(げし)・冬至(とうじ)の通(とお)り道(みち)' },
  { key: 'moonPath', label: '月(つき)の通(とお)り道(みち)' },
  { key: 'stars', label: '星(ほし)' },
  { key: 'daystars', label: '昼(ひる)でも星(ほし)を見(み)る' },
  { key: 'lines', label: '星座(せいざ)の線(せん)' },
  { key: 'trails', label: '星(ほし)の動(うご)いたあと' },
  { key: 'pole', label: '天(てん)の北極(ほっきょく)・南極(なんきょく)' },
];

const CAMERAS: CameraPreset[] = [
  { key: 'outside', label: '外(そと)から' },
  { key: 'south', label: '南(みなみ)を見(み)る' },
  { key: 'north', label: '北(きた)を見(み)る' },
  { key: 'east', label: '東(ひがし)を見(み)る' },
  { key: 'west', label: '西(にし)を見(み)る' },
  { key: 'up', label: '真上(まうえ)を見(み)る' },
  { key: 'sunTrack', label: '太陽(たいよう)を追(お)う (ズーム)' },
  { key: 'moonTrack', label: '月(つき)を追(お)う (ズーム)' },
];

/** 追いかけるときの視野 (°)。この視野では、太陽と月を本当の大きさでかく */
const TRACK_FOV = 2.6;
/** 月は太陽より少し手前にかく (日食で、月が太陽の前に来るように) */
const MOON_AT = 0.98;

/** 空の色 (太陽の高度で変わる) */
function skyColor(alt: number, out: THREE.Color): THREE.Color {
  const night = new THREE.Color(0x0b1630);
  const dusk = new THREE.Color(0x3c3f78);
  const day = new THREE.Color(0x6fa8e6);
  if (alt <= -12) return out.copy(night);
  if (alt <= -2) return out.copy(night).lerp(dusk, (alt + 12) / 10);
  if (alt <= 8) return out.copy(dusk).lerp(day, (alt + 2) / 10);
  return out.copy(day);
}

/** 星の点の材質。等級で大きさ、色指数で色を変え、opacity で全体の明るさを変える */
function starMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 1 }, scale: { value: 1 } },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float scale;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      uniform float opacity;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.15, d);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor, a * opacity);
      }`,
    transparent: true,
    depthWrite: false,
  });
}

/** B−V 色指数から星の色 (青白い 〜 赤い) */
function starColor(bv: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (bv + 0.3) / 2.0));
  return new THREE.Color().setHSL(0.6 - t * 0.55, 0.55 + t * 0.2, 0.86 - t * 0.12);
}

export class GroundView implements View {
  readonly id = 'ground' as const;
  readonly toggles = TOGGLES;
  readonly cameras = CAMERAS;
  readonly defaults: Record<string, boolean> = {
    sunPath: true,
    seasonPaths: false,
    moonPath: false,
    stars: true,
    daystars: false,
    lines: true,
    trails: false,
    pole: false,
  };

  /** 天球 (星・星座の線・天の極)。赤道座標で作り、時刻と場所に合わせて回す */
  private readonly celestial = new THREE.Group();
  private readonly stars: THREE.Points;
  private readonly starMat: THREE.ShaderMaterial;
  private readonly lines: THREE.LineSegments;
  private readonly lineLabels: CSS2DObject[] = [];
  private readonly pole = new THREE.Group();
  private readonly sun = new THREE.Group();
  private readonly moon: THREE.Mesh;
  private readonly moonMat: THREE.ShaderMaterial;
  private readonly paths = new THREE.Group();
  private readonly sunPath = new THREE.Group();
  private readonly moonPath = new THREE.Group();
  private readonly trails = new THREE.Group();
  private readonly ground: THREE.Mesh<THREE.CircleGeometry, THREE.MeshLambertMaterial>;
  private readonly dome: THREE.Mesh;
  private readonly person: THREE.Group;
  private readonly skyColor = new THREE.Color();
  private inside = false;
  /** 太陽か月を追いかけているか */
  private track: 'sun' | 'moon' | null = null;
  private readonly sunBall: THREE.Mesh;
  private readonly glow: THREE.Sprite;
  /** 日食で太陽がかくれている割合 (0〜1)。info に出す */
  covered = 0;
  private pathKey = '';
  private seasonKey = '';
  private moonKey = '';
  private trailKey = '';

  constructor(private readonly stage: Stage) {
    const root = stage.root;
    root.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
    sunLight.position.set(3, 10, 4);
    root.add(sunLight);

    // 地面と方位
    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(R, 96).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x5f8a4e, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
    );
    root.add(this.ground);
    root.add(circle(R, 0xe8f0e0, { opacity: 0.8 }));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xe8f0e0, transparent: true, opacity: 0.35 });
    root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-R, 0.01, 0), new THREE.Vector3(R, 0.01, 0), new THREE.Vector3(0, 0.01, -R), new THREE.Vector3(0, 0.01, R)]), lineMat));
    for (const [name, x, z, cls] of [
      ['北(きた)', 0, -1, 'is-north'],
      ['東(ひがし)', 1, 0, ''],
      ['南(みなみ)', 0, 1, 'is-south'],
      ['西(にし)', -1, 0, ''],
    ] as const) {
      const l = stage.label(name, `is-dir ${cls}`);
      l.position.set(x * R * 1.06, 0.2, z * R * 1.06);
      root.add(l);
    }

    // 透明半球 (高度 30°・60° の線と、子午線)
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
    );
    root.add(this.dome);
    for (const alt of [30, 60]) {
      const ring = circle(R * cos(alt), 0xffffff, { opacity: 0.18 });
      ring.position.y = R * sin(alt);
      root.add(ring);
    }
    const meridian: THREE.Vector3[] = [];
    for (let a = 0; a <= 180; a += 3) meridian.push(new THREE.Vector3(0, R * sin(a), R * cos(a)));
    root.add(polyline(meridian, 0xffffff, { opacity: 0.18 }));

    // 観察する人
    this.person = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.9, 16), new THREE.MeshLambertMaterial({ color: 0xff7a5c }));
    body.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshLambertMaterial({ color: 0xffd9b8 }));
    head.position.y = 1.1;
    this.person.add(body, head);
    root.add(this.person);

    // 星
    const pos: number[] = [];
    const col: number[] = [];
    const size: number[] = [];
    for (const s of STARS) {
      const v = equatorialVector({ ra: s.ra, dec: s.dec });
      pos.push(v[0] * R * 1.4, v[1] * R * 1.4, v[2] * R * 1.4);
      const c = starColor(s.bv);
      col.push(c.r, c.g, c.b);
      size.push(Math.max(1.6, 7.5 - s.mag * 1.35));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
    this.starMat = starMaterial();
    this.stars = new THREE.Points(geo, this.starMat);
    this.celestial.add(this.stars);

    // 星座の線と名前
    const seg: number[] = [];
    for (const c of CONSTELLATIONS) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let n = 0;
      for (const [a, b] of c.lines) {
        const sa = starByName(a);
        const sb = starByName(b);
        if (!sa || !sb) continue;
        for (const s of [sa, sb]) {
          const v = equatorialVector(s);
          seg.push(v[0] * R * 1.4, v[1] * R * 1.4, v[2] * R * 1.4);
          cx += v[0];
          cy += v[1];
          cz += v[2];
          n++;
        }
      }
      const l = stage.label(c.name, 'is-constellation');
      l.position.set(cx, cy, cz).normalize().multiplyScalar(R * 1.4);
      this.celestial.add(l);
      this.lineLabels.push(l);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    this.lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x9fb8e8, transparent: true, opacity: 0.5, depthWrite: false }));
    this.celestial.add(this.lines);

    // 天の北極・南極 (地軸をのばした先)
    const axis = polyline([new THREE.Vector3(0, 0, -R * 1.4), new THREE.Vector3(0, 0, R * 1.4)], COLORS.axis, { opacity: 0.8, dashed: true });
    const north = stage.label('天(てん)の北極(ほっきょく)', 'is-pole');
    north.position.set(0, 0, R * 1.02);
    const south = stage.label('天(てん)の南極(なんきょく)', 'is-pole');
    south.position.set(0, 0, -R * 1.02);
    const equator = circle(R * 1.0, COLORS.axis, { opacity: 0.35, dashed: true });
    equator.rotation.x = Math.PI / 2;
    this.pole.add(axis, north, south, equator);
    this.celestial.add(this.pole);
    this.celestial.matrixAutoUpdate = false;
    root.add(this.celestial);

    // 太陽と月
    // 大きさは update で決める (半径 1 の球を拡大する)
    this.sunBall = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: 0xffe07a }));
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
    this.sun.add(this.sunBall, this.glow);
    root.add(this.sun);
    this.moonMat = moonMaterial();
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32).rotateY(-Math.PI / 2), this.moonMat);
    root.add(this.moon);

    root.add(this.paths, this.sunPath, this.moonPath, this.trails);
    stage.controls.minDistance = 0.01;
  }

  /** 赤道座標の向きを地上の画面の向きにする行列 (時刻・場所ごと) */
  private matrix = new THREE.Matrix4();

  private last: { ms: number; ctx: ViewContext } | null = null;

  update(ms: number, ctx: ViewContext): void {
    this.last = { ms, ctx };
    const b = bodiesAt(ms);
    const o = ctx.options;
    const { lat, lon } = ctx.place;
    const lst = localSiderealTime(b.gmst, lon);
    skyMatrix(lat, lst, this.matrix);
    this.celestial.matrix.copy(this.matrix);
    this.celestial.matrixWorldNeedsUpdate = true;

    const sunDir = new THREE.Vector3(...equatorialVector(b.sun)).applyMatrix4(this.matrix);
    // 月は近いので、地球の中心から見た向き (geo) と、観察地点から見た向き (moonDir) が 1° ほどちがう
    const geoMoon = new THREE.Vector3(...equatorialVector(b.moon)).applyMatrix4(this.matrix);
    const topo = topocentricMoon(b, lat, lst);
    const moonDir = new THREE.Vector3(...equatorialVector(topo)).applyMatrix4(this.matrix);
    const sunAlt = Math.asin(sunDir.y) / (Math.PI / 180);

    // 太陽と月は、本当の見かけの大きさを k 倍してかく (追いかけてズームしたときは本当の大きさ)
    const z = sizes(b);
    const moonSemi = (z.moon * b.moon.dist) / topo.dist;
    const k = this.magnify();
    const rad = Math.PI / 180;
    this.sun.position.copy(sunDir).multiplyScalar(R);
    this.sunBall.scale.setScalar(R * Math.tan(z.sun * k * rad));
    this.glow.scale.setScalar(R * Math.tan(z.sun * k * rad) * 5.5);
    this.moon.position.copy(moonDir).multiplyScalar(R * MOON_AT);
    this.moon.scale.setScalar(R * MOON_AT * Math.tan(moonSemi * k * rad));
    this.moon.lookAt(0, 0, 0);
    const u = this.moonMat.uniforms;
    u.sunDir.value.copy(sunDir);
    u.center.value.copy(moonDir);
    u.geo.value.copy(geoMoon);
    u.axis.value.copy(sunDir).negate();
    u.umbra.value = z.umbra * rad;
    u.penumbra.value = z.penumbra * rad;
    u.k.value = k;

    // 日食: 太陽がかくれた割合。皆既に近づくと空が暗くなり、星が見える
    const sep = Math.acos(Math.max(-1, Math.min(1, sunDir.dot(moonDir)))) / rad;
    this.covered = sunAlt > -1 ? coveredFraction(z.sun, moonSemi, sep) : 0;
    const eclipseDark = this.covered < 0.8 ? this.covered * 0.12 : 0.1 + ((this.covered - 0.8) / 0.2) * 0.85;
    if (this.track) this.aim(this.track === 'sun' ? sunDir : moonDir);
    // 地面の下にあるときは、外から見るときだけうすく見せる
    this.sun.visible = sunDir.y > -0.02 || !this.inside;
    this.moon.visible = moonDir.y > -0.02 || !this.inside;

    // 空の明るさと星
    skyColor(sunAlt, this.skyColor).lerp(new THREE.Color(0x0b1630), Math.min(1, eclipseDark));
    this.stage.background.copy(this.inside ? this.skyColor : this.skyColor.clone().lerp(new THREE.Color(0x0b1630), 0.55));
    (this.dome.material as THREE.MeshBasicMaterial).opacity = this.inside ? 0 : 0.08;
    // 夜は地面も暗くする
    const light = Math.max(0, Math.min(1, (sunAlt + 8) / 14)) * (1 - eclipseDark);
    this.ground.material.color.setHex(0x5f8a4e).multiplyScalar(0.3 + 0.7 * light);
    const dark = Math.max(0, Math.min(1, (-sunAlt - 2) / 10), this.covered > 0.97 ? eclipseDark : 0);
    const starOpacity = o.daystars ? 1 : dark;
    this.stars.visible = o.stars !== false && starOpacity > 0.01;
    this.starMat.uniforms.opacity.value = starOpacity;
    this.starMat.uniforms.scale.value = Math.min(window.devicePixelRatio || 1, 2) * (this.inside ? 1 : 0.8);
    this.lines.visible = this.stars.visible && o.lines !== false;
    (this.lines.material as THREE.LineBasicMaterial).opacity = 0.5 * starOpacity;
    const v = new THREE.Vector3();
    for (const l of this.lineLabels) l.visible = this.lines.visible && l.getWorldPosition(v).y > 0.3;
    this.pole.visible = !!o.pole;

    // 太陽の通り道 (その日の 0 時から 24 時まで)
    this.sunPath.visible = o.sunPath !== false;
    const day = localMidnight(ms, ctx.place.tz);
    const pk = `${day}:${lat}:${lon}`;
    if (this.sunPath.visible && pk !== this.pathKey) {
      this.pathKey = pk;
      this.rebuild(this.sunPath, this.dayPath(day, lat, lon, 'sun'), 0xffd75e);
    }
    this.moonPath.visible = !!o.moonPath;
    if (this.moonPath.visible && pk !== this.moonKey) {
      this.moonKey = pk;
      this.rebuild(this.moonPath, this.dayPath(day, lat, lon, 'moon'), COLORS.moonPath);
    }

    // 春分・夏至・冬至の太陽の通り道 (赤緯が一定の円)
    this.paths.visible = !!o.seasonPaths;
    const year = new Date(ms).getUTCFullYear();
    const sk = `${year}:${lat}`;
    if (this.paths.visible && sk !== this.seasonKey) {
      this.seasonKey = sk;
      this.buildSeasonPaths(year, lat);
    }

    // 星の動いたあと (いままでの 3 時間)
    this.trails.visible = !!o.trails && this.stars.visible;
    const tk = `${Math.round(ms / 60_000)}:${lat}:${lon}`;
    if (this.trails.visible && tk !== this.trailKey) {
      this.trailKey = tk;
      this.buildTrails(lat, lst);
    }
    this.stage.invalidate();
  }

  /** 太陽か月の、その日の 10 分ごとの位置 (地上の画面の向き) */
  private dayPath(day: number, lat: number, lon: number, body: 'sun' | 'moon'): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const m = new THREE.Matrix4();
    for (let t = day; t <= day + DAY; t += 10 * 60_000) {
      const b = bodiesAt(t);
      const lst = localSiderealTime(b.gmst, lon);
      skyMatrix(lat, lst, m);
      pts.push(new THREE.Vector3(...equatorialVector(body === 'sun' ? b.sun : topocentricMoon(b, lat, lst))).applyMatrix4(m).multiplyScalar(R * (body === 'sun' ? 1 : MOON_AT)));
    }
    return pts;
  }

  /** 地面より上は実線、下は点線 (外から見たときだけ) にする */
  private rebuild(group: THREE.Group, pts: THREE.Vector3[], color: number): void {
    this.disposeGroup(group);
    let run: THREE.Vector3[] = [];
    let above = pts[0].y >= 0;
    const flush = () => {
      if (run.length > 1) group.add(polyline(run, color, above ? { opacity: 0.95 } : { opacity: 0.35, dashed: true }));
    };
    for (const p of pts) {
      if (p.y >= 0 !== above) {
        run.push(p);
        flush();
        above = p.y >= 0;
        run = [run[run.length - 2] ?? p];
      }
      run.push(p);
    }
    flush();
  }

  private buildSeasonPaths(year: number, lat: number): void {
    this.disposeGroup(this.paths);
    for (const which of ['summer', 'spring', 'winter'] as SeasonPoint[]) {
      const dec = bodiesAt(seasonPoint(year, which)).sun.dec;
      const pts: THREE.Vector3[] = [];
      const m = skyMatrix(lat, 0);
      for (let ra = 0; ra <= 360; ra += 3) pts.push(new THREE.Vector3(...equatorialVector({ ra, dec })).applyMatrix4(m).multiplyScalar(R));
      const g = new THREE.Group();
      this.rebuild(g, pts, SEASON_COLOR[which]);
      this.paths.add(g);
    }
  }

  /** 明るい星の、いままでの 3 時間の動き (赤緯一定の円の一部) */
  private buildTrails(lat: number, lst: number): void {
    this.disposeGroup(this.trails);
    const seg: number[] = [];
    const m = new THREE.Matrix4();
    const prev = new THREE.Vector3();
    const cur = new THREE.Vector3();
    for (const s of STARS) {
      if (s.mag > 2.6) continue;
      const v = equatorialVector(s);
      for (let i = 0; i < 18; i++) {
        skyMatrix(lat, lst - i * 2.5, m);
        cur.set(...v).applyMatrix4(m).multiplyScalar(R * 1.39);
        if (i > 0 && cur.y > 0 && prev.y > 0) seg.push(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z);
        prev.copy(cur);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    this.trails.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.55, depthWrite: false })));
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    group.clear();
  }

  /** 太陽・月を何倍の大きさでかくか。視野がせまい (ズームしている) ほど本当の大きさに近づける */
  private magnify(): number {
    return Math.max(1, Math.min(12, this.stage.camera.fov / 6));
  }

  /** 追いかけている天体のほうへ、カメラを向ける */
  private aim(dir: THREE.Vector3): void {
    const controls = this.stage.controls;
    controls.target.copy(this.stage.camera.position).addScaledVector(dir, 0.01);
    controls.update();
  }

  setCamera(key: string, ctx: ViewContext): void {
    const cam = this.stage.camera;
    const controls = this.stage.controls;
    this.track = key === 'sunTrack' ? 'sun' : key === 'moonTrack' ? 'moon' : null;
    if (key === 'outside') {
      this.inside = false;
      cam.fov = 45;
      controls.target.set(0, 2, 0);
      // 南半球では、太陽が北の空を通るので、北がわから見る
      const k = this.stage.fit(1.45);
      cam.position.set(R * 0.5 * k, R * 1.15 * k, (ctx.place.lat < 0 ? -1 : 1) * R * 2.3 * k);
      controls.minDistance = 6;
      controls.maxDistance = 90;
      controls.enableZoom = true;
      controls.rotateSpeed = 1;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI * 0.62;
      this.person.visible = true;
      this.ground.material.opacity = 0.92;
    } else {
      // 地面に立って見上げる。カメラのすぐ前に回転の中心を置き、ドラッグで見回す
      this.inside = true;
      cam.fov = this.track ? TRACK_FOV : 70;
      const dir = { south: [0, 0.35, 1], north: [0, 0.35, -1], east: [1, 0.35, 0], west: [-1, 0.35, 0], up: [0.001, 1, 0.12] }[key] ?? [0, 0.35, 1];
      // 追いかけてズームするときは、目の高さのずれも見えてしまうので、太陽・月の位置の中心 (原点) から見る
      const eye = new THREE.Vector3(0, this.track ? 0.001 : 0.3, 0);
      controls.target.copy(eye).add(new THREE.Vector3(...dir).normalize().multiplyScalar(0.01));
      cam.position.copy(eye);
      controls.minDistance = 0.01;
      controls.maxDistance = 0.01;
      controls.enableZoom = false;
      controls.rotateSpeed = -0.4;
      controls.minPolarAngle = 0.02;
      controls.maxPolarAngle = Math.PI * 0.98;
      this.person.visible = false;
      this.ground.material.opacity = 1;
    }
    cam.updateProjectionMatrix();
    controls.update();
    // 大きさと向きを、新しい視野に合わせてかき直す
    if (this.last) this.update(this.last.ms, this.last.ctx);
    this.stage.invalidate();
  }
}
