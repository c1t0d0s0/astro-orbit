import { DEFAULT_PLACE, type NamedPlace } from '../data/places';

// ---- 手元の記録の形 ----

/** 設定 (どの端末でも同じにする) */
export interface Settings {
  /** 観察する場所 */
  place: NamedPlace;
  /** 説明を「くわしく」(中学生向け) にするか。false なら「かんたん」 */
  detail: boolean;
  /** さいごに変えた時刻 (ミリ秒)。2 か所の記録を合わせるときは、新しいほうを使う */
  at: number;
}

/** 1 人分の記録の全部。ログインなしの記録も、ログイン中の人の記録も、この形であつかう */
export interface Snapshot {
  /** 設定を一度も変えていなければ null */
  settings: Settings | null;
  /** 最後まで見た解説。値は、はじめて最後まで見た時刻 */
  seen: Record<string, number>;
}

export const emptySnapshot = (): Snapshot => ({ settings: null, seen: {} });

export const defaultSettings = (): Settings => ({ place: DEFAULT_PLACE, detail: false, at: 0 });

/** 記録が 1 つでもあるか */
export const hasRecords = (s: Snapshot) => s.settings !== null || Object.keys(s.seen).length > 0;

// ---- Firestore に保存する形 (学習アプリで共通) ----
//
//   users/{uid}                  その人の情報 (全アプリ共通)。名前やメールアドレスは入れない
//   users/{uid}/apps/{appId}     アプリごとの記録のまとめ (AppDoc)
//
// このアプリの appId は "geoscience-viewer"。ほかのアプリと同じ Firebase プロジェクトを使っても、記録はまざらない。

export const SCHEMA = 1;
export const APP_ID = 'geoscience-viewer';

export interface AppDoc {
  schema: number;
  updatedAt: number;
  /** その日の目標を達成した日 (このアプリでは使わない) */
  activeDays: string[];
  /** やりとげた教材の id。このアプリでは、最後まで見た解説 */
  completed: string[];
  /** 手に入れたごほうび (このアプリでは使わない) */
  inventory: Record<string, { paid: number }>;
  /** 使ったポイント (このアプリでは使わない) */
  spent: Record<string, number>;
  /** アプリごとの設定。seen に解説を見た時刻、place・detail・at に設定 */
  settings: Record<string, unknown>;
}

export function toAppDoc(s: Snapshot, now: number): AppDoc {
  return {
    schema: SCHEMA,
    updatedAt: now,
    activeDays: [],
    completed: Object.keys(s.seen).sort(),
    inventory: {},
    spent: {},
    settings: { seen: { ...s.seen }, ...(s.settings ? { place: s.settings.place, detail: s.settings.detail, at: s.settings.at } : {}) },
  };
}

const validId = (id: string) => /^[a-z0-9-]{1,64}$/.test(id);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 保存されていた場所。形がくずれていたら null */
export function validPlace(p: unknown): NamedPlace | null {
  const x = p as Partial<NamedPlace> | null;
  if (!x || typeof x.id !== 'string' || !validId(x.id) || typeof x.name !== 'string' || x.name.length > 80) return null;
  if (!finite(x.lat) || !finite(x.lon) || !finite(x.tz) || Math.abs(x.lat) > 90 || Math.abs(x.lon) > 180 || Math.abs(x.tz) > 14) return null;
  return { id: x.id, name: x.name, lat: x.lat, lon: x.lon, tz: x.tz };
}

/** 保存されていた設定。形がくずれていたら null */
export function validSettings(v: unknown): Settings | null {
  const x = v as Partial<Settings> | null;
  const place = validPlace(x?.place);
  if (!x || !place || typeof x.detail !== 'boolean' || !finite(x.at)) return null;
  return { place, detail: x.detail, at: x.at };
}

export function validSeen(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof v !== 'object' || v === null) return out;
  for (const [id, at] of Object.entries(v)) if (validId(id) && finite(at) && at > 0) out[id] = at;
  return out;
}

/** Firestore から読んだものは形がくずれているかもしれないので、1 つずつ確かめながらもどす */
export function fromAppDoc(doc: Partial<AppDoc> | null | undefined): Snapshot {
  const settings = (doc?.settings ?? {}) as Record<string, unknown>;
  return { settings: validSettings(settings), seen: validSeen(settings.seen) };
}
