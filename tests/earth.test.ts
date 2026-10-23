import { describe, expect, it } from 'vitest';
import { cloudBase, envFreezing, humidity, parcelFreezing, parcelTemp, precipType, saturation } from '../src/earth/air';
import { auroraElevation, auroraSky, geomagLat, ovalGap } from '../src/earth/aurora';
import { RAINBOW_COLORS, deviation, rainbowAngle, rainbowIncidence, rainbowTop, rayPath } from '../src/earth/optics';
import { OMORI_K, VP, VS, arrival, distanceFromPS, psTime, seismogram } from '../src/earth/quake';
import { SEA_KM, depthAt, greenHeight, kmh, travelTime, tsunamiSpeed } from '../src/earth/tsunami';
import { maxWind, typhoonAt, typhoonTrack } from '../src/earth/typhoon';
import { CURRENTS } from '../src/data/currents';
import { placeById } from '../src/data/places';

describe('雲と雨・雪', () => {
  it('気温 25 °C・露点 17 °C の空気は、約 1000 m で雲ができはじめる', () => {
    expect(cloudBase(25, 17)).toBeCloseTo(1000, 0);
  });
  it('雲ができるまでは 100 m で 1 °C、雲の中では 0.5 °C 下がる', () => {
    expect(parcelTemp(1000, 25, 17)).toBeCloseTo(15, 5);
    expect(parcelTemp(3000, 25, 17)).toBeCloseTo(5, 5);
    expect(parcelFreezing(25, 17)).toBeCloseTo(4000, 0);
  });
  it('地上の気温で、雪か雨か', () => {
    expect(precipType(25)).toBe('rain');
    expect(precipType(1)).toBe('snow');
    expect(envFreezing(26)).toBeCloseTo(4000, 0);
  });
  it('飽和水蒸気量 (20 °C で約 17.3 g/m³) と湿度', () => {
    expect(saturation(20)).toBeCloseTo(17.3, 0);
    expect(humidity(20, 20)).toBeCloseTo(100, 5);
    expect(humidity(25, 17)).toBeGreaterThan(55);
    expect(humidity(25, 17)).toBeLessThan(65);
  });
});

describe('地震', () => {
  it('P 波が先に着き、初期微動継続時間は距離に比例する (大森公式)', () => {
    expect(arrival(120, VP)).toBeCloseTo(20, 5);
    expect(arrival(120, VS)).toBeGreaterThan(arrival(120, VP));
    expect(psTime(84)).toBeCloseTo(10, 5);
    expect(OMORI_K).toBeCloseTo(8.4, 1);
    expect(distanceFromPS(psTime(150))).toBeCloseTo(150, 5);
  });
  it('地震計: 波が着く前はゆれず、遠いほどゆれが小さい', () => {
    expect(seismogram(5, 100)).toBe(0);
    const peak = (d: number) => Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(seismogram(i * 0.25, d))));
    expect(peak(50)).toBeGreaterThan(peak(250));
  });
});

describe('津波', () => {
  it('深さ 4000 m の海では、ジェット機なみ (時速約 700 km) で進む', () => {
    expect(tsunamiSpeed(4000)).toBeCloseTo(198, 0);
    expect(kmh(tsunamiSpeed(4000))).toBeGreaterThan(700);
    expect(kmh(tsunamiSpeed(10))).toBeLessThan(40);
  });
  it('浅くなると高くなる (グリーンの法則)', () => {
    expect(greenHeight(1, 4000, 4000)).toBe(1);
    expect(greenHeight(1, 4000, 10)).toBeCloseTo(4.47, 1);
  });
  it('画面の海: 海岸は浅く、沖は深い。海岸まで数十分で着く', () => {
    expect(depthAt(0)).toBe(0);
    expect(depthAt(10)).toBeLessThan(100);
    expect(depthAt(200)).toBe(4000);
    expect(depthAt(SEA_KM)).toBeGreaterThan(4000);
    const t = travelTime(0, 260) / 60;
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(60);
  });
});

describe('虹', () => {
  it('主虹は約 42°、副虹は約 51°。赤は外がわ、むらさきは内がわ', () => {
    expect(rainbowAngle(1.333)).toBeCloseTo(42, 0);
    expect(rainbowAngle(1.333, 2)).toBeGreaterThan(50);
    expect(rainbowAngle(1.333, 2)).toBeLessThan(52);
    const red = RAINBOW_COLORS[0].n;
    const violet = RAINBOW_COLORS[RAINBOW_COLORS.length - 1].n;
    expect(rainbowAngle(red)).toBeGreaterThan(rainbowAngle(violet));
    expect(rainbowAngle(red, 2)).toBeLessThan(rainbowAngle(violet, 2));
  });
  it('光が集まる入射角で、曲がる角度がいちばん小さい', () => {
    const n = 1.333;
    const i0 = rainbowIncidence(n, 1);
    expect(deviation(i0, n, 1)).toBeLessThan(deviation(i0 + 0.05, n, 1));
    expect(deviation(i0, n, 1)).toBeLessThan(deviation(i0 - 0.05, n, 1));
  });
  it('雨つぶの中の光の道すじは、出ていく向きが虹の角度に合う', () => {
    const n = 1.333;
    const pts = rayPath(n, Math.sin(rainbowIncidence(n, 1)), 1);
    const [a, b] = pts.slice(-2);
    // 入ってきた向き (+x) と、出ていく向きの角度 = 180° − 42°
    const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    expect(180 - Math.abs(ang)).toBeCloseTo(rainbowAngle(n), 0);
    // 反射する点は雨つぶの表面の上
    for (const p of pts.slice(1, -1)) expect(Math.hypot(p[0], p[1])).toBeCloseTo(1, 6);
  });
  it('太陽が 42° より高いと、虹は地平線の下', () => {
    expect(rainbowTop(10)).toBeCloseTo(32, 0);
    expect(rainbowTop(50)).toBeLessThan(0);
  });
});

describe('オーロラ', () => {
  const tromso = placeById('tromso')!;
  const tokyo = placeById('tokyo')!;
  it('地磁気緯度: トロムソは約 67°、東京は約 27°', () => {
    expect(geomagLat(tromso.lat, tromso.lon)).toBeGreaterThan(64);
    expect(geomagLat(tromso.lat, tromso.lon)).toBeLessThan(69);
    expect(geomagLat(tokyo.lat, tokyo.lon)).toBeGreaterThan(24);
    expect(geomagLat(tokyo.lat, tokyo.lon)).toBeLessThan(30);
  });
  it('トロムソの夜は輪の下、昼や東京では見えない', () => {
    const m = geomagLat(tromso.lat, tromso.lon);
    expect(ovalGap(m, false)).toBe(0);
    expect(auroraSky(m, -20, false)).toBe('overhead');
    expect(auroraSky(m, 5, false)).toBeNull();
    expect(auroraSky(geomagLat(tokyo.lat, tokyo.lon), -30, true)).toBeNull();
  });
  it('輪から遠いほど低い空に見える', () => {
    expect(auroraElevation(0)).toBe(90);
    expect(auroraElevation(3)).toBeGreaterThan(auroraElevation(6));
  });
});

describe('台風と海流', () => {
  it('台風は南の海で生まれて北へ進み、いちばん強いときは 950 hPa より低い', () => {
    const track = typhoonTrack();
    expect(track[0].lat).toBeLessThan(15);
    expect(track[track.length - 1].lat).toBeGreaterThan(40);
    expect(Math.min(...track.map((s) => s.pressure))).toBeLessThan(950);
    expect(typhoonAt(0).alive).toBe(false);
    expect(typhoonAt(5).alive).toBe(true);
    expect(maxWind(925)).toBeGreaterThan(44);
  });
  it('海流の通り道は、緯度・経度の範囲に入っている', () => {
    for (const c of CURRENTS) {
      expect(c.path.length).toBeGreaterThan(1);
      for (const [lat, lon] of c.path) {
        expect(Math.abs(lat)).toBeLessThanOrEqual(90);
        expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('津波の進み方', () => {
  it('はじめは起こったところにあり、時間がたつと海岸へ近づいて高くなる', async () => {
    const { frontAt, surfaceAt, SOURCE_KM } = await import('../src/earth/tsunami');
    expect(frontAt(0)).toBe(SOURCE_KM);
    expect(frontAt(600)).toBeLessThan(SOURCE_KM);
    expect(frontAt(600)).toBeGreaterThan(frontAt(1200));
    expect(frontAt(3 * 3600)).toBe(0);
    const near = travelTime(SOURCE_KM, 5);
    expect(surfaceAt(5, near, near)).toBeGreaterThan(surfaceAt(200, travelTime(SOURCE_KM, 200), travelTime(SOURCE_KM, 200)));
  });
});
