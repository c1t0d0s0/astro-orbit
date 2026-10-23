// 空気のかたまりが上がるときの気温と、雲・雨・雪。高さは m、気温は °C

/** 雲ができる前 (かわいた空気) は 100 m 上がるごとに約 1 °C 下がる */
export const DRY_LAPSE = 10 / 1000;
/** 雲ができてからは、水蒸気が水になるときに熱を出すので、100 m で約 0.5 °C */
export const MOIST_LAPSE = 5 / 1000;
/** まわりの空気の気温の下がり方 (平均 100 m で 0.65 °C) */
export const ENV_LAPSE = 6.5 / 1000;
/** 露点は、上がる空気の中でも 100 m で約 0.2 °C 下がる。そのため雲ができはじめる高さは 125 m × (気温 − 露点) */
export const BASE_PER_DEG = 125;

/** 気温 t0・露点 dew の空気が上がったとき、雲ができはじめる高さ (雲の底の高さ) */
export const cloudBase = (t0: number, dew: number) => Math.max(0, BASE_PER_DEG * (t0 - dew));

/** 地上で気温 t0・露点 dew の空気のかたまりが、高さ z まで上がったときの気温 */
export function parcelTemp(z: number, t0: number, dew: number): number {
  const base = cloudBase(t0, dew);
  if (z <= base) return t0 - DRY_LAPSE * z;
  return t0 - DRY_LAPSE * base - MOIST_LAPSE * (z - base);
}

/** 空気のかたまりが 0 °C になる高さ (雲の中で、これより上は氷のつぶ) */
export function parcelFreezing(t0: number, dew: number): number {
  const base = cloudBase(t0, dew);
  const tb = t0 - DRY_LAPSE * base;
  if (tb <= 0) return t0 / DRY_LAPSE;
  return base + tb / MOIST_LAPSE;
}

/** まわりの空気の気温 (地上が t0) */
export const envTemp = (z: number, t0: number) => t0 - ENV_LAPSE * z;

/** まわりの空気が 0 °C になる高さ。雪はこれより下でとけはじめる */
export const envFreezing = (t0: number) => Math.max(0, t0 / ENV_LAPSE);

/** 地上に雪のまま落ちるか、とけて雨になるか (地上の気温が 2 °C くらいより低いと雪のことが多い) */
export const precipType = (t0: number): 'snow' | 'rain' => (t0 <= 2 ? 'snow' : 'rain');

/** 水蒸気をふくめる量 (飽和水蒸気量 g/m³)。テテンスの式から */
export function saturation(t: number): number {
  const e = 6.1078 * 10 ** ((7.5 * t) / (t + 237.3));
  return (217 * e) / (t + 273.15);
}

/** 湿度 (%) */
export const humidity = (t: number, dew: number) => Math.min(100, (saturation(dew) / saturation(t)) * 100);
