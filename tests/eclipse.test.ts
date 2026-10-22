import { describe, expect, it } from 'vitest';
import { localSiderealTime } from '../src/astro/coords';
import { coveredFraction, eclipseAt, nextEclipse, topocentricMoon, sizes } from '../src/astro/eclipse';
import { RAD } from '../src/astro/math';
import { bodiesAt } from '../src/astro/state';
import { equatorialVector } from '../src/astro/coords';

const day = 86_400_000;
const near = (ms: number, y: number, m: number, d: number, h = 12) => Math.abs(ms - Date.UTC(y, m - 1, d, h)) < day;

describe('日食・月食', () => {
  it('2026〜2027 年の日食を順に見つける (NASA の日食の一覧と同じ日)', () => {
    const e1 = nextEclipse(Date.UTC(2026, 0, 1), 'solar');
    expect(near(e1.ms, 2026, 2, 17)).toBe(true);
    expect(e1.type).toBe('annular');
    const e2 = nextEclipse(e1.ms, 'solar');
    expect(near(e2.ms, 2026, 8, 12, 18)).toBe(true);
    expect(e2.type).toBe('total');
    const e3 = nextEclipse(e2.ms, 'solar');
    expect(near(e3.ms, 2027, 2, 6, 16)).toBe(true);
    expect(e3.type).toBe('annular');
    const e4 = nextEclipse(e3.ms, 'solar');
    expect(near(e4.ms, 2027, 8, 2, 10)).toBe(true);
    expect(e4.type).toBe('total');
  });

  it('2026 年の月食: 3 月 3 日は皆既 (日本で見える)、8 月 28 日は部分', () => {
    const l1 = nextEclipse(Date.UTC(2026, 0, 1), 'lunar');
    expect(Math.abs(l1.ms - Date.UTC(2026, 2, 3, 11, 33))).toBeLessThan(20 * 60_000);
    expect(l1.type).toBe('total');
    const l2 = nextEclipse(l1.ms, 'lunar');
    expect(near(l2.ms, 2026, 8, 28, 4)).toBe(true);
    expect(l2.type).toBe('partial');
    // 皆既の始まり (20:04 JST) より前は部分食、後は皆既食
    expect(eclipseAt(Date.UTC(2026, 2, 3, 10, 40), 'lunar')).toBe('partial');
    expect(eclipseAt(Date.UTC(2026, 2, 3, 11, 30), 'lunar')).toBe('total');
  });

  it('2027-08-02 ルクソールでは、月が太陽をすっかりかくす (皆既日食)', () => {
    const ms = Date.UTC(2027, 7, 2, 10, 7);
    const b = bodiesAt(ms);
    const lat = 25.7;
    const lst = localSiderealTime(b.gmst, 32.64);
    const m = topocentricMoon(b, lat, lst);
    const sun = equatorialVector(b.sun);
    const mv = equatorialVector(m);
    const sep = Math.acos(sun[0] * mv[0] + sun[1] * mv[1] + sun[2] * mv[2]) / RAD;
    const z = sizes(b);
    // 地球の中心から見るとずれているが (視差)、ルクソールから見るとほぼ重なる
    expect(sep).toBeLessThan(0.1);
    const moonSemi = (z.moon * b.moon.dist) / m.dist;
    expect(coveredFraction(z.sun, moonSemi, sep)).toBeGreaterThan(0.95);
  });

  it('円の重なりの割合', () => {
    expect(coveredFraction(1, 1, 0)).toBe(1);
    expect(coveredFraction(1, 1, 2.5)).toBe(0);
    expect(coveredFraction(1, 0.5, 0)).toBeCloseTo(0.25);
    expect(coveredFraction(1, 1, 1)).toBeCloseTo(0.391, 2);
  });
});
