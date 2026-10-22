import { describe, expect, it } from 'vitest';
import { eclipticToEquatorial } from '../src/astro/coords';
import { dayInfo, moonAge, nextPhase, seasonPoint } from '../src/astro/events';
import { moonPosition } from '../src/astro/moon';
import { bodiesAt } from '../src/astro/state';
import { sunPosition } from '../src/astro/sun';
import { obliquity } from '../src/astro/time';
import { tideName, tideRange } from '../src/astro/tide';

const TOKYO = { lat: 35.6581, lon: 139.7414, tz: 9 };
const hm = (ms: number, tz: number) => {
  const d = new Date(ms + tz * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
};
const minutes = (h: number, m: number) => h * 60 + m;

describe('太陽と月の位置 (Meeus の例題)', () => {
  it('太陽: 1992-10-13 0h TD は 視黄経 199.909°・赤緯 −7.785°', () => {
    const jd = 2448908.5;
    const s = sunPosition(jd);
    expect(s.lon).toBeCloseTo(199.90988, 2);
    expect(s.dist).toBeCloseTo(0.99766, 3);
    expect(eclipticToEquatorial(s.lon, 0, obliquity(jd)).dec).toBeCloseTo(-7.78507, 1);
  });

  it('月: 1992-04-12 0h TD は 黄経 133.163°・黄緯 −3.229°・距離 368,410 km', () => {
    const m = moonPosition(2448724.5);
    expect(Math.abs(m.lon - 133.162655)).toBeLessThan(0.3);
    expect(Math.abs(m.lat - -3.229126)).toBeLessThan(0.1);
    expect(Math.abs(m.dist - 368409.7)).toBeLessThan(500);
  });
});

describe('二十四節気と月の満ち欠け', () => {
  // 国立天文台 暦要項 2026 年 (日本時間): 春分 3/20 23:46、夏至 6/21 17:24、秋分 9/23 9:05、冬至 12/22 5:50
  const cases = [
    ['spring', Date.UTC(2026, 2, 20, 14, 46)],
    ['summer', Date.UTC(2026, 5, 21, 8, 24)],
    ['autumn', Date.UTC(2026, 8, 23, 0, 5)],
    ['winter', Date.UTC(2026, 11, 21, 20, 50)],
  ] as const;
  for (const [which, expected] of cases) {
    it(`2026 年の ${which} を 1 時間以内で求める`, () => {
      expect(Math.abs(seasonPoint(2026, which) - expected)).toBeLessThan(3_600_000);
    });
  }

  it('新月のあと、上弦・満月・下弦が約 7.4 日ずつで来る', () => {
    const start = Date.UTC(2026, 0, 1);
    const n = nextPhase(start, 'new');
    const q1 = nextPhase(n, 'first');
    const f = nextPhase(n, 'full');
    const q3 = nextPhase(n, 'last');
    const days = (a: number, b: number) => (b - a) / 86_400_000;
    expect(days(n, q1)).toBeGreaterThan(6);
    expect(days(n, q1)).toBeLessThan(9);
    expect(days(n, f)).toBeGreaterThan(13.5);
    expect(days(n, f)).toBeLessThan(16);
    expect(days(n, q3)).toBeGreaterThan(20.5);
    expect(days(n, q3)).toBeLessThan(24);
    expect(bodiesAt(f).illum).toBeGreaterThan(0.99);
    expect(bodiesAt(n).illum).toBeLessThan(0.01);
    expect(moonAge(f)).toBeGreaterThan(13.5);
    expect(moonAge(n + 3_600_000)).toBeLessThan(0.1);
  });

  it('2026-01-03 は満月 (国立天文台: 1/3 19:03 日本時間)', () => {
    const f = nextPhase(Date.UTC(2026, 0, 1), 'full');
    expect(Math.abs(f - Date.UTC(2026, 0, 3, 10, 3))).toBeLessThan(30 * 60_000);
  });
});

describe('日の出・日の入り', () => {
  it('東京の夏至: 日の出 4:25・日の入り 19:00 ごろ、昼は約 14.6 時間', () => {
    const d = dayInfo(Date.UTC(2026, 5, 21, 3), TOKYO);
    expect(Math.abs(hm(d.rise!, 9) - minutes(4, 25))).toBeLessThan(3);
    expect(Math.abs(hm(d.set!, 9) - minutes(19, 0))).toBeLessThan(3);
    expect(d.daylight).toBeCloseTo(14.58, 0);
    expect(d.noonAlt).toBeCloseTo(90 - 35.66 + 23.44, 0);
  });

  it('東京の冬至: 日の出 6:47・日の入り 16:32 ごろ、南中高度は約 31°', () => {
    const d = dayInfo(Date.UTC(2026, 11, 22, 3), TOKYO);
    expect(Math.abs(hm(d.rise!, 9) - minutes(6, 47))).toBeLessThan(3);
    expect(Math.abs(hm(d.set!, 9) - minutes(16, 32))).toBeLessThan(3);
    expect(d.noonAlt).toBeCloseTo(90 - 35.66 - 23.44, 0);
  });

  it('北緯 70° では、夏至は白夜・冬至は極夜。南極の昭和基地は逆', () => {
    const tromso = { lat: 69.65, lon: 18.96, tz: 1 };
    const showa = { lat: -69.0, lon: 39.58, tz: 3 };
    expect(dayInfo(Date.UTC(2026, 5, 21, 12), tromso).polar).toBe('day');
    expect(dayInfo(Date.UTC(2026, 11, 21, 12), tromso).polar).toBe('night');
    expect(dayInfo(Date.UTC(2026, 5, 21, 12), showa).polar).toBe('night');
    expect(dayInfo(Date.UTC(2026, 11, 21, 12), showa).polar).toBe('day');
    expect(dayInfo(Date.UTC(2026, 5, 21, 12), tromso).daylight).toBeCloseTo(24, 5);
  });

  it('赤道では、一年中、昼と夜がほぼ 12 時間ずつ', () => {
    for (const month of [0, 3, 6, 9]) {
      expect(Math.abs(dayInfo(Date.UTC(2026, month, 15, 6), { lat: 0, lon: 103.8, tz: 8 }).daylight - 12.1)).toBeLessThan(0.2);
    }
  });
});

describe('潮の満ち引き', () => {
  it('新月・満月のころは、上弦・下弦のころより潮の高低差が大きい (大潮と小潮)', () => {
    const start = Date.UTC(2026, 0, 1);
    const springs = [nextPhase(start, 'new'), nextPhase(start, 'full')].map((t) => tideRange(t, 0, 140));
    const neaps = [nextPhase(start, 'first'), nextPhase(start, 'last')].map((t) => tideRange(t, 0, 140));
    expect(Math.min(...springs)).toBeGreaterThan(Math.max(...neaps) * 1.5);
    expect(tideName(bodiesAt(nextPhase(start, 'full')).phase)).toBe('spring');
    expect(tideName(bodiesAt(nextPhase(start, 'first')).phase)).toBe('neap');
  });
});
