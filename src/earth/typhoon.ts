// 画面で見せる台風 (ある年の夏から秋の、よくある進み方をもとにした例)。
// 赤道の北の暖かい海で生まれ、太平洋高気圧のふちを回って北西へ進み、日本の近くで偏西風に流されて北東へ向きを変える

export interface TyphoonState {
  lat: number;
  lon: number;
  /** 中心気圧 (hPa) */
  pressure: number;
  /** 強い風の範囲の半径 (km) */
  radius: number;
  /** 台風かどうか (生まれる前と、温帯低気圧に変わったあとは false) */
  alive: boolean;
}

/** [日, 緯度, 経度, 中心気圧, 半径 km] */
const TRACK: [number, number, number, number, number][] = [
  [0, 10.5, 148, 1004, 150],
  [1, 12, 145, 996, 200],
  [2, 14, 141.5, 980, 280],
  [3, 16.5, 137.5, 955, 350],
  [4, 19.5, 133.5, 935, 400],
  [5, 23, 130.5, 925, 420],
  [6, 26.5, 129, 935, 450],
  [7, 30, 130.5, 950, 480],
  [7.5, 32.5, 132.5, 960, 500],
  [8, 35.5, 136, 975, 520],
  [8.5, 38.5, 140.5, 985, 560],
  [9, 41.5, 146, 990, 600],
  [10, 45, 156, 996, 650],
];

export const TYPHOON_DAYS = 10;
/** この日から台風になる / この日に温帯低気圧に変わる */
const BORN = 0.6;
const GONE = 9.2;

export function typhoonAt(day: number): TyphoonState {
  const d = Math.max(0, Math.min(TRACK[TRACK.length - 1][0], day));
  let i = 0;
  while (i < TRACK.length - 2 && TRACK[i + 1][0] <= d) i++;
  const [d0, la0, lo0, p0, r0] = TRACK[i];
  const [d1, la1, lo1, p1, r1] = TRACK[i + 1];
  const f = (d - d0) / (d1 - d0);
  const mix = (a: number, b: number) => a + (b - a) * f;
  return { lat: mix(la0, la1), lon: mix(lo0, lo1), pressure: mix(p0, p1), radius: mix(r0, r1), alive: d >= BORN && d < GONE };
}

/** 進路 (0.25 日ごと) */
export const typhoonTrack = () => Array.from({ length: TYPHOON_DAYS * 4 + 1 }, (_, i) => typhoonAt(i / 4));

/** 中心気圧から、中心近くの最大風速 (m/s) の目安 (まわりの気圧を 1010 hPa として、気圧の差の平方根に比例) */
export const maxWind = (pressure: number) => Math.round(5.4 * Math.sqrt(Math.max(0, 1010 - pressure)));

/** 台風の強さの階級 (最大風速 m/s から。気象庁の呼び方) */
export function strengthName(wind: number): string {
  if (wind >= 54) return '猛烈(もうれつ)な';
  if (wind >= 44) return '非常(ひじょう)に強(つよ)い';
  if (wind >= 33) return '強(つよ)い';
  return '';
}
