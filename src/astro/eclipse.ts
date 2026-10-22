import { equatorialVector, type Equatorial } from './coords';
import { nextPhase } from './events';
import { asin, dot, RAD, type Vec3 } from './math';
import { bodiesAt, type Bodies } from './state';

// 日食と月食 (Meeus『天文アルゴリズム』54 章の考え方を、角度で簡単にしたもの)。
// 新月・満月のたびに、月と太陽 (月食では地球の影の中心) の角度がいちばん近くなるときを探し、
// 月・太陽・地球の影の見かけの大きさとくらべて、食が起こるかを決める

/** 地球の赤道半径 (km) */
export const EARTH_KM = 6378.14;
const MOON_KM = 1737.4;
/** 1 天文単位のときの太陽の見かけの半径 (°) */
const SUN_SEMI_1AU = 0.26656;
/** 1 天文単位のときの太陽の地平視差 (°) */
const SUN_PARALLAX_1AU = 0.002443;

/** 月・太陽の見かけの大きさと、地球の影の大きさ (°。地球の中心から見て) */
export interface Sizes {
  /** 太陽・月の見かけの半径 */
  sun: number;
  moon: number;
  /** 月の地平視差 (地球の半径が、月から見てどれだけの角度か) */
  moonParallax: number;
  /** 月の距離での、地球の本影・半影の半径 */
  umbra: number;
  penumbra: number;
}

export function sizes(b: Bodies): Sizes {
  const sun = SUN_SEMI_1AU / b.sun.dist;
  const moonParallax = asin(EARTH_KM / b.moon.dist);
  const ps = SUN_PARALLAX_1AU / b.sun.dist;
  // 大気のため、影は計算より 2% ほど大きくなる (Danjon の補正)
  return {
    sun,
    moon: asin(MOON_KM / b.moon.dist),
    moonParallax,
    umbra: 1.02 * (moonParallax + ps - sun),
    penumbra: 1.02 * (moonParallax + ps + sun),
  };
}

const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) / RAD;

/** 月の中心と、太陽 (solar) または地球の影の中心 (lunar) の角度 (°。地球の中心から見て) */
export function separation(b: Bodies, kind: 'solar' | 'lunar'): number {
  const sun = equatorialVector(b.sun);
  const target: Vec3 = kind === 'solar' ? sun : [-sun[0], -sun[1], -sun[2]];
  return angle(equatorialVector(b.moon), target);
}

export type EclipseType = 'total' | 'annular' | 'partial' | 'penumbral';

export interface Eclipse {
  kind: 'solar' | 'lunar';
  type: EclipseType;
  /** 食がいちばん深くなる時刻 (地球の中心から見て) */
  ms: number;
}

/** 時刻 ms の、日食・月食の状態 (地球の中心から見て)。食が起きていなければ null */
export function eclipseAt(ms: number, kind: 'solar' | 'lunar'): EclipseType | null {
  const b = bodiesAt(ms);
  const z = sizes(b);
  const d = separation(b, kind);
  if (kind === 'lunar') {
    if (d < z.umbra - z.moon) return 'total';
    if (d < z.umbra + z.moon) return 'partial';
    if (d < z.penumbra + z.moon) return 'penumbral';
    return null;
  }
  // 日食: 月の影がどこか地球に落ちているか。影の中心が地球に当たっていれば、皆既か金環が見える場所がある
  if (d > z.moonParallax + z.moon + z.sun) return null;
  if (d > z.moonParallax) return 'partial';
  return z.moon > z.sun ? 'total' : 'annular';
}

/** 時刻 t のまわり ±hours 時間で、separation がいちばん小さくなる時刻 (黄金分割で探す) */
function closest(t: number, kind: 'solar' | 'lunar', hours = 8): number {
  let a = t - hours * 3_600_000;
  let b = t + hours * 3_600_000;
  const g = (Math.sqrt(5) - 1) / 2;
  const f = (x: number) => separation(bodiesAt(x), kind);
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  while (b - a > 30_000) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

/**
 * ms より後で、はじめて起こる日食 (solar) か月食 (lunar)。食のいちばん深いときが ms から 1 時間以内のものは数えない
 * (見つけた食の時刻をそのままわたして、次の食を探せるように)。
 * 半影月食 (うすく暗くなるだけで、目ではほとんど分からない) は、includePenumbral のときだけ数える
 */
export function nextEclipse(ms: number, kind: 'solar' | 'lunar', includePenumbral = false): Eclipse {
  let t = ms;
  for (let i = 0; i < 40; i++) {
    const phase = nextPhase(t, kind === 'solar' ? 'new' : 'full');
    const best = closest(phase, kind);
    const type = eclipseAt(best, kind);
    if (type && (includePenumbral || type !== 'penumbral') && best > ms + 3_600_000) return { kind, type, ms: best };
    t = phase + 86_400_000;
  }
  throw new Error('食が見つかりません');
}

/**
 * 観察地点から見た月の位置 (地心視差を考える)。月は近いので、地球のどこから見るかで 1° ほどずれる。
 * 日食のように、月と太陽のわずかな重なりを見るときに必要
 */
export function topocentricMoon(b: Bodies, lat: number, lst: number): Equatorial & { dist: number } {
  const m = equatorialVector(b.moon).map((v) => (v * b.moon.dist) / EARTH_KM) as Vec3;
  const o: Vec3 = [Math.cos(lat * RAD) * Math.cos(lst * RAD), Math.cos(lat * RAD) * Math.sin(lst * RAD), Math.sin(lat * RAD)];
  const t: Vec3 = [m[0] - o[0], m[1] - o[1], m[2] - o[2]];
  const r = Math.hypot(...t);
  return { ra: ((Math.atan2(t[1], t[0]) / RAD) % 360 + 360) % 360, dec: Math.asin(t[2] / r) / RAD, dist: r * EARTH_KM };
}

/** 2 つの円 (半径 r1・r2、中心の間 d) の重なった面積が、円 1 の何割か (日食で太陽がかくれた割合) */
export function coveredFraction(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r2 - r1)) return r2 >= r1 ? 1 : (r2 * r2) / (r1 * r1);
  const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const c = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return (a + b - c) / (Math.PI * r1 * r1);
}

/** 観察地点から見た日食で、太陽がかくれている割合 (0〜1。太陽が地平線の下なら 0) */
export function sunCovered(ms: number, lat: number, lst: number): number {
  const b = bodiesAt(ms);
  const z = sizes(b);
  const m = topocentricMoon(b, lat, lst);
  const sun = equatorialVector(b.sun);
  const sep = angle(sun, equatorialVector(m));
  return coveredFraction(z.sun, (z.moon * b.moon.dist) / m.dist, sep);
}
