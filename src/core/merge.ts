import type { Settings, Snapshot } from './snapshot';

// 2 か所にある記録 (たとえば、この端末と Firestore) を 1 つに合わせる。
// どの関数も、同じものを 2 回合わせても変わらず、a と b を入れかえても同じ結果になる。
// そのため、何回やっても・どの順でやっても、記録がこわれたり二重にふえたりしない。

/** 決め手がないときに、いつも同じほうをえらぶための比べ方 */
const pickStable = <T>(a: T, b: T): T => (JSON.stringify(a) <= JSON.stringify(b) ? a : b);

/** 設定: あとから変えたほう */
export function mergeSettings(a: Settings | null, b: Settings | null): Settings | null {
  if (!a || !b) return a ?? b;
  if (a.at !== b.at) return a.at > b.at ? a : b;
  return pickStable(a, b);
}

/** 見た解説: 両方を合わせる。同じものは、はじめて見た (早いほうの) 時刻 */
export function mergeSeen(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) out[id] = Math.min(a[id] ?? Infinity, b[id] ?? Infinity);
  return out;
}

export function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  return { settings: mergeSettings(a.settings, b.settings), seen: mergeSeen(a.seen, b.seen) };
}

/** 記録の中身が同じか (ならび順のちがいは気にしない) */
export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return JSON.stringify(mergeSnapshots(a, a)) === JSON.stringify(mergeSnapshots(b, b));
}
