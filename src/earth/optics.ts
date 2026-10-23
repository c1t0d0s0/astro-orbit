// 虹。雨つぶの中で光が屈折・反射して、太陽と反対の点 (対日点) から約 42° の円の上に光が集まる

/** 光の色ごとの水の屈折率 (赤 〜 むらさき) */
export const RAINBOW_COLORS: readonly { name: string; n: number; color: number }[] = [
  { name: '赤(あか)', n: 1.3311, color: 0xff3b30 },
  { name: 'だいだい', n: 1.3320, color: 0xff9500 },
  { name: '黄(き)', n: 1.3330, color: 0xffd60a },
  { name: '緑(みどり)', n: 1.3345, color: 0x34c759 },
  { name: '青(あお)', n: 1.3365, color: 0x30a2ff },
  { name: 'あい', n: 1.3385, color: 0x4f5bd5 },
  { name: 'むらさき', n: 1.3430, color: 0x9b51e0 },
];

const D = Math.PI / 180;

/** 入射角 i (rad) の光が、雨つぶの中で k 回反射して出ていくときの、曲がった角度 (rad) */
export function deviation(i: number, n: number, k: number): number {
  const r = Math.asin(Math.sin(i) / n);
  return 2 * (i - r) + k * (Math.PI - 2 * r);
}

/** 光が集まる入射角 (曲がる角度がいちばん小さくなる入射角)。cos²i = (n² − 1) / (k(k+2)) */
export const rainbowIncidence = (n: number, k: number) => Math.acos(Math.sqrt((n * n - 1) / (k * (k + 2))));

/** 対日点から虹までの角度 (°)。k = 1 が主虹 (約 42°)、k = 2 が副虹 (約 51°) */
export function rainbowAngle(n: number, k = 1): number {
  const dev = deviation(rainbowIncidence(n, k), n, k) / D;
  return k === 1 ? 180 - dev : dev - 180;
}

/** 太陽の高さ (°) から、虹のてっぺんの高さ (°)。太陽が高すぎると地平線の下になる */
export const rainbowTop = (sunAlt: number, k = 1) => rainbowAngle(1.333, k) - sunAlt;

type V2 = [number, number];

/** 単位円の雨つぶに、左から (+x の向きに) 高さ b で入った光の道すじ (k 回反射) */
export function rayPath(n: number, b: number, k: number): V2[] {
  const dot = (a: V2, c: V2) => a[0] * c[0] + a[1] * c[1];
  // 屈折 (d は進む向き、nrm は入ってくる側を向いた面の法線、eta は屈折率の比)
  const refract = (d: V2, nrm: V2, eta: number): V2 => {
    const ci = -dot(nrm, d);
    const st2 = eta * eta * (1 - ci * ci);
    const k2 = eta * ci - Math.sqrt(Math.max(0, 1 - st2));
    return [eta * d[0] + k2 * nrm[0], eta * d[1] + k2 * nrm[1]];
  };
  let p: V2 = [-Math.sqrt(1 - b * b), b];
  const pts: V2[] = [[p[0] - 1.6, b], p];
  let d = refract([1, 0], p, 1 / n);
  for (let j = 0; j <= k; j++) {
    const s = -2 * dot(p, d);
    p = [p[0] + s * d[0], p[1] + s * d[1]];
    pts.push(p);
    if (j < k) {
      const m = 2 * dot(d, p);
      d = [d[0] - m * p[0], d[1] - m * p[1]];
    }
  }
  const out = refract(d, [-p[0], -p[1]], n);
  pts.push([p[0] + out[0] * 1.6, p[1] + out[1] * 1.6]);
  return pts;
}
