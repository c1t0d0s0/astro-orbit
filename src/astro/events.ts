import { eclipticToEquatorial, localSiderealTime, toHorizontal, type Equatorial } from './coords';
import { norm180, norm360 } from './math';
import { moonPosition } from './moon';
import { bodiesAt } from './state';
import { sunPosition } from './sun';
import { DAY_MS, gmst, julianDay, msFromJulianDay, obliquity } from './time';

// 二十四節気・月の満ち欠け・日の出入りなど、「いつ起きるか」を探す

const YEAR = 365.2422;
const MONTH = 29.530589;

/** 太陽の黄経が target° になる時刻 (guess の近く) */
export function whenSunLon(target: number, guessMs: number): number {
  let jd = julianDay(guessMs);
  for (let i = 0; i < 8; i++) jd += (norm180(target - sunPosition(jd).lon) * YEAR) / 360;
  return msFromJulianDay(jd);
}

export type SeasonPoint = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASON_LON: Record<SeasonPoint, number> = { spring: 0, summer: 90, autumn: 180, winter: 270 };
const SEASON_MONTH: Record<SeasonPoint, number> = { spring: 2, summer: 5, autumn: 8, winter: 11 };

/** その年の春分・夏至・秋分・冬至の時刻 */
export function seasonPoint(year: number, which: SeasonPoint): number {
  return whenSunLon(SEASON_LON[which], Date.UTC(year, SEASON_MONTH[which], 21));
}

/** 月と太陽の黄経の差 (0〜360°) */
const elongation = (jd: number) => norm360(moonPosition(jd).lon - sunPosition(jd).lon);

/** 月と太陽の黄経の差が target° になる時刻 (guess の近く) */
function whenPhase(target: number, guessJd: number): number {
  let jd = guessJd;
  for (let i = 0; i < 12; i++) {
    const step = (norm180(target - elongation(jd)) * MONTH) / 360;
    jd += step;
    if (Math.abs(step) < 1e-6) break;
  }
  return jd;
}

export type MoonPhase = 'new' | 'first' | 'full' | 'last';
export const PHASE_ANGLE: Record<MoonPhase, number> = { new: 0, first: 90, full: 180, last: 270 };

/** ms より後で、はじめて月がその形になる時刻 */
export function nextPhase(ms: number, which: MoonPhase): number {
  const jd = julianDay(ms);
  const target = PHASE_ANGLE[which];
  let found = whenPhase(target, jd + (norm360(target - elongation(jd)) * MONTH) / 360);
  if (found <= jd + 1e-4) found = whenPhase(target, found + MONTH);
  return msFromJulianDay(found);
}

/** 月齢 (前の新月からの日数) */
export function moonAge(ms: number): number {
  const jd = julianDay(ms);
  let newMoon = whenPhase(0, jd - (elongation(jd) * MONTH) / 360);
  if (newMoon > jd) newMoon = whenPhase(0, newMoon - MONTH);
  return jd - newMoon;
}

// ---- 日の出・日の入り ----

export interface Place {
  lat: number;
  lon: number;
  /** その場所の時刻と世界時の差 (時間)。日本は 9 */
  tz: number;
}

/** 太陽・月の高度 (°)。太陽だけなら月の計算はしない (1 年分のグラフなどで何万回もよぶので) */
export function altitudeOf(body: 'sun' | 'moon', ms: number, place: Place): number {
  if (body === 'moon') {
    const b = bodiesAt(ms);
    return toHorizontal(b.moon, place.lat, localSiderealTime(b.gmst, place.lon)).alt;
  }
  const jd = julianDay(ms);
  const eq: Equatorial = eclipticToEquatorial(sunPosition(jd).lon, 0, obliquity(jd));
  return toHorizontal(eq, place.lat, localSiderealTime(gmst(jd), place.lon)).alt;
}

/** 日の出・日の入りの高度。太陽の半径と大気による浮き上がりの分だけ、地平線より下 */
const SUN_H0 = -0.833;

export interface DayInfo {
  /** 日の出・日の入りの時刻 (ms)。その日にないときは null */
  rise: number | null;
  set: number | null;
  /** 昼の長さ (時間) */
  daylight: number;
  /** 一日中しずまない (白夜) / 一日中のぼらない (極夜) */
  polar: 'day' | 'night' | null;
  /** 南中 (いちばん高くなったとき) の時刻と高度 */
  noon: number;
  noonAlt: number;
}

/** その場所の時刻で、その日の 0 時 */
export function localMidnight(ms: number, tz: number): number {
  const local = ms + tz * 3_600_000;
  return local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - tz * 3_600_000;
}

/** その日 (その場所の時刻で 0 時〜24 時) の太陽 */
export function dayInfo(ms: number, place: Place): DayInfo {
  const start = localMidnight(ms, place.tz);
  const step = 10 * 60_000;
  const f = (t: number) => altitudeOf('sun', t, place) - SUN_H0;
  const cross = (a: number, b: number) => {
    let fa = f(a);
    for (let i = 0; i < 20; i++) {
      const mid = (a + b) / 2;
      const fm = f(mid);
      if (fm > 0 === fa > 0) {
        a = mid;
        fa = fm;
      } else b = mid;
    }
    return (a + b) / 2;
  };

  let rise: number | null = null;
  let set: number | null = null;
  let up = 0;
  let noon = start;
  let noonAlt = -90;
  let prev = f(start);
  let upSince = prev > 0 ? start : null;
  for (let t = start + step; t <= start + DAY_MS; t += step) {
    const v = f(t);
    if (v + SUN_H0 > noonAlt) {
      noonAlt = v + SUN_H0;
      noon = t;
    }
    if (prev <= 0 && v > 0) {
      const c = cross(t - step, t);
      rise ??= c;
      upSince = c;
    } else if (prev > 0 && v <= 0) {
      const c = cross(t - step, t);
      set = c;
      up += c - (upSince ?? start);
      upSince = null;
    }
    prev = v;
  }
  if (upSince !== null) up += start + DAY_MS - upSince;
  // 10 分ごとに見た中でいちばん高いところの前後を、くわしく探す
  for (let span = step; span > 1000; span /= 2) {
    for (const t of [noon - span / 2, noon + span / 2]) {
      const a = altitudeOf('sun', t, place);
      if (a > noonAlt) {
        noonAlt = a;
        noon = t;
      }
    }
  }
  const polar = rise === null && set === null ? (prev > 0 ? 'day' : 'night') : null;
  return { rise, set, daylight: up / 3_600_000, polar, noon, noonAlt };
}

/** 月の出・月の入り (その場所の時刻で、その日の 0 時〜24 時)。ない日は null */
export function moonRiseSet(ms: number, place: Place): { rise: number | null; set: number | null } {
  const start = localMidnight(ms, place.tz);
  const step = 15 * 60_000;
  // 月の中心が地平線に来たとき (視差と大気の浮き上がりで、おおよそ +0.13°)
  const f = (t: number) => altitudeOf('moon', t, place) - 0.13;
  let rise: number | null = null;
  let set: number | null = null;
  let prev = f(start);
  for (let t = start + step; t <= start + DAY_MS; t += step) {
    const v = f(t);
    if (prev > 0 !== v > 0) {
      let a = t - step;
      let b = t;
      for (let i = 0; i < 16; i++) {
        const mid = (a + b) / 2;
        if (f(mid) > 0 === prev > 0) a = mid;
        else b = mid;
      }
      if (v > 0) rise ??= (a + b) / 2;
      else set ??= (a + b) / 2;
    }
    prev = v;
  }
  return { rise, set };
}
