import type { Place } from '../astro/events';

/** 観察する場所。tz は、その場所でふだん使う時刻と世界時の差 (夏時間は考えない) */
export interface NamedPlace extends Place {
  id: string;
  name: string;
}

export const PLACES: readonly NamedPlace[] = [
  { id: 'tokyo', name: '東京(とうきょう)', lat: 35.68, lon: 139.77, tz: 9 },
  { id: 'sapporo', name: '札幌(さっぽろ)', lat: 43.06, lon: 141.35, tz: 9 },
  { id: 'naha', name: '那覇(なは)', lat: 26.21, lon: 127.68, tz: 9 },
  { id: 'singapore', name: 'シンガポール (赤道(せきどう)の近く)', lat: 1.29, lon: 103.85, tz: 8 },
  { id: 'sydney', name: 'シドニー (南半球(みなみはんきゅう))', lat: -33.87, lon: 151.21, tz: 10 },
  { id: 'chiayi', name: '嘉義(かぎ) (台湾(たいわん)・北回帰線(きたかいきせん)の上(うえ))', lat: 23.44, lon: 120.45, tz: 8 },
  { id: 'rockhampton', name: 'ロックハンプトン (オーストラリア・南回帰線(みなみかいきせん)の上(うえ))', lat: -23.44, lon: 150.51, tz: 10 },
  { id: 'luxor', name: 'ルクソール (エジプト)', lat: 25.7, lon: 32.64, tz: 2 },
  { id: 'tromso', name: 'トロムソ (北極圏(ほっきょくけん))', lat: 69.65, lon: 18.96, tz: 1 },
  { id: 'northpole', name: '北極点(ほっきょくてん)', lat: 90, lon: 0, tz: 0 },
  { id: 'showa', name: '昭和基地(しょうわきち) (南極(なんきょく))', lat: -69.0, lon: 39.58, tz: 3 },
];

export const DEFAULT_PLACE = PLACES[0];

export const placeById = (id: string) => PLACES.find((p) => p.id === id);

/** 好きな場所 (緯度・経度だけ)。時刻の差は経度から決める */
export function customPlace(lat: number, lon: number, name = '自分(じぶん)で決(き)めた場所(ばしょ)'): NamedPlace {
  const clampLat = Math.max(-90, Math.min(90, lat));
  const wrapLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { id: 'custom', name, lat: clampLat, lon: wrapLon, tz: Math.round(wrapLon / 15) };
}
