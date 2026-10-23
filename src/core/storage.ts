import { mergeSeen } from './merge';
import { defaultSettings, emptySnapshot, validSeen, validSettings, type Settings, type Snapshot } from './snapshot';

// 記録を置く場所。ログインしていない人の記録は GUEST_PREFIX の下。
// ログイン中の人の記録 (Firestore の写し) は、人ごとに別の場所に置き、ログアウトしたら消す。
const GUEST_PREFIX = 'geoscience-viewer:v1:';
const USER_PREFIX = 'geoscience-viewer:u:';
const userPrefix = (uid: string) => `${USER_PREFIX}${uid}:`;
const ACTIVE_UID_KEY = 'geoscience-viewer:auth-uid';

let prefix = GUEST_PREFIX;
let listener: ((key: string) => void) | null = null;
let muted = false;

/** 読み書きする記録を切りかえる。uid が null ならログインなしの記録 */
export function useStore(uid: string | null): void {
  prefix = uid ? userPrefix(uid) : GUEST_PREFIX;
}

/** 今、読み書きしているのがだれの記録か。ログインなしの記録なら null */
export function currentUid(): string | null {
  return prefix === GUEST_PREFIX ? null : prefix.slice(USER_PREFIX.length, -1);
}

/** この端末で、さいごにログインしていた人。次に開いたとき、通信を待たずにその人の写しを出すために使う */
export function rememberedUid(): string | null {
  try {
    return localStorage.getItem(ACTIVE_UID_KEY);
  } catch {
    return null;
  }
}

export function rememberUid(uid: string | null): void {
  try {
    if (uid) localStorage.setItem(ACTIVE_UID_KEY, uid);
    else localStorage.removeItem(ACTIVE_UID_KEY);
  } catch {
    /* 無視 */
  }
}

/** 記録が書きかわったら知らせてもらう (Firestore に送るため)。key は「settings」「seen」 */
export function onStorageChange(cb: ((key: string) => void) | null): void {
  listener = cb;
}

// localStorage が使えない環境 (プライベートブラウズなど) でも使えるよう、失敗は無視する
function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(prefix + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(prefix + key);
    else localStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    /* 保存できなくても続行 */
  }
  if (!muted) listener?.(key);
}

// ---- 設定 ----

export function getSettings(): Settings {
  return validSettings(read('settings')) ?? defaultSettings();
}

export function saveSettings(change: Partial<Omit<Settings, 'at'>>): Settings {
  const next: Settings = { ...getSettings(), ...change, at: Date.now() };
  write('settings', next);
  return next;
}

// ---- 見た解説 ----

export function getSeen(): Record<string, number> {
  return validSeen(read('seen'));
}

export function markSeen(id: string): void {
  const seen = getSeen();
  if (seen[id] === undefined) write('seen', mergeSeen(seen, { [id]: Date.now() }));
}

// ---- 記録をまるごと出し入れする (ログイン・Firestore との同期で使う) ----

export function exportSnapshot(): Snapshot {
  return { ...emptySnapshot(), settings: validSettings(read('settings')), seen: getSeen() };
}

/**
 * 今の場所の記録を、わたされた内容に入れかえる。
 * Firestore から取りこんだ結果を書くためのものなので、「書きかわった」という知らせは出さない。
 */
export function importSnapshot(s: Snapshot): void {
  muted = true;
  try {
    write('settings', s.settings);
    write('seen', s.seen);
  } finally {
    muted = false;
  }
}

/** その人の記録 (uid が null ならログインなしの記録) を、この端末から消す */
export function clearStore(uid: string | null): void {
  const at = uid ? userPrefix(uid) : GUEST_PREFIX;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(at)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* 無視 */
  }
}
