// 角度は度 (°) であつかう。三角関数だけ、ここでラジアンにする

export const RAD = Math.PI / 180;
export const sin = (deg: number) => Math.sin(deg * RAD);
export const cos = (deg: number) => Math.cos(deg * RAD);
export const asin = (x: number) => Math.asin(Math.max(-1, Math.min(1, x))) / RAD;
export const atan2 = (y: number, x: number) => Math.atan2(y, x) / RAD;

/** 0 ≤ x < 360 にする */
export const norm360 = (deg: number) => ((deg % 360) + 360) % 360;
/** −180 < x ≤ 180 にする */
export const norm180 = (deg: number) => {
  const d = norm360(deg);
  return d > 180 ? d - 360 : d;
};

export type Vec3 = [number, number, number];

/** 経度・緯度の向きの単位ベクトル (x: 経度 0°、z: 北) */
export const fromLonLat = (lon: number, lat: number): Vec3 => [cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat)];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
