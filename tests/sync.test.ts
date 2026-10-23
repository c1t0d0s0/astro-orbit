import { beforeEach, describe, expect, it } from 'vitest';
import { Sync, type AuthPort, type Remote, type SyncHooks } from '../src/cloud/sync';
import { mergeSnapshots } from '../src/core/merge';
import { emptySnapshot, fromAppDoc, toAppDoc, type Snapshot } from '../src/core/snapshot';
import { exportSnapshot, getSeen, getSettings, markSeen, rememberedUid, saveSettings, useStore } from '../src/core/storage';
import { PLACES } from '../src/data/places';

/** テスト用の localStorage。current を入れかえると、別の端末になる */
const memory = { current: new Map<string, string>() };
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memory.current.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.current.set(k, v),
    removeItem: (k: string) => void memory.current.delete(k),
    key: (i: number) => [...memory.current.keys()][i] ?? null,
    get length() {
      return memory.current.size;
    },
  },
});

/** メモリ上の Firestore。fail を true にすると、通信できない状態になる */
class FakeCloud implements Remote {
  data = new Map<string, Snapshot>();
  fail = false;
  writes = 0;
  // Firestore に入れて出したのと同じように、形を確かめながらもどす
  private copy = (s: Snapshot) => fromAppDoc(JSON.parse(JSON.stringify(toAppDoc(s, 0))));
  async load(uid: string) {
    if (this.fail) throw new Error('offline');
    const s = this.data.get(uid);
    return s ? this.copy(s) : null;
  }
  async save(uid: string, snapshot: Snapshot) {
    if (this.fail) throw new Error('offline');
    this.writes++;
    this.data.set(uid, this.copy(snapshot));
  }
}

class FakeAuth implements AuthPort {
  private cb: ((uid: string | null) => void) | null = null;
  next = 'kid1';
  onUser(cb: (uid: string | null) => void) {
    this.cb = cb;
    cb(null);
  }
  async signIn() {
    this.cb?.(this.next);
  }
  async signOut() {
    this.cb?.(null);
  }
}

const hooks = (migrate = true): SyncHooks => ({ onStatus() {}, onData() {}, askMigrate: () => migrate });
const settle = () => new Promise((r) => setTimeout(r, 0));

function device(cloud: FakeCloud, migrate = true) {
  const auth = new FakeAuth();
  const sync = new Sync(cloud, auth, hooks(migrate), { debounceMs: 0, retryMs: 5 });
  sync.start();
  return { auth, sync };
}

beforeEach(() => {
  memory.current = new Map();
  useStore(null);
});

describe('記録の合わせ方', () => {
  it('設定はあとから変えたほう、見た解説は両方 (早いほうの時刻)', () => {
    const a: Snapshot = { settings: { place: PLACES[0], detail: false, at: 10 }, seen: { seasons: 5, tide: 9 } };
    const b: Snapshot = { settings: { place: PLACES[4], detail: true, at: 20 }, seen: { seasons: 7, polar: 3 } };
    const m = mergeSnapshots(a, b);
    expect(m.settings?.place.id).toBe('sydney');
    expect(m.seen).toEqual({ polar: 3, seasons: 5, tide: 9 });
    expect(mergeSnapshots(b, a)).toEqual(m);
    expect(mergeSnapshots(m, m)).toEqual(m);
    expect(mergeSnapshots(m, emptySnapshot())).toEqual(m);
  });

  it('Firestore の形に入れて出しても同じ。くずれた値はすてる', () => {
    const s: Snapshot = { settings: { place: PLACES[5], detail: true, at: 1 }, seen: { stars: 2 } };
    expect(fromAppDoc(JSON.parse(JSON.stringify(toAppDoc(s, 0))))).toEqual(s);
    const broken = fromAppDoc({ settings: { seen: { ok: 1, 'BAD ID': 2, neg: -1 }, place: { id: 'x', name: 'x', lat: 200, lon: 0, tz: 0 }, detail: true, at: 1 } });
    expect(broken).toEqual({ settings: null, seen: { ok: 1 } });
  });
});

describe('ログインと同期', () => {
  it('ログインすると、この端末の記録をアカウントにうつし、別の端末でも同じになる', async () => {
    const cloud = new FakeCloud();
    saveSettings({ place: PLACES[1], detail: true });
    markSeen('seasons');
    const one = device(cloud);
    await settle();
    await one.sync.signIn();
    await one.sync.flush();
    expect(one.sync.status).toBe('synced');
    expect(rememberedUid()).toBe('kid1');
    expect(cloud.data.get('kid1')?.settings?.place.id).toBe('sapporo');
    // ログインなしの記録は、うつしたので消えている
    useStore(null);
    expect(getSeen()).toEqual({});

    // 別の端末
    memory.current = new Map();
    useStore(null);
    const two = device(cloud);
    await settle();
    await two.sync.signIn();
    await two.sync.flush();
    expect(getSettings().place.id).toBe('sapporo');
    expect(Object.keys(getSeen())).toEqual(['seasons']);

    // そこで見た解説は、Firestore にも入る
    markSeen('tide');
    await two.sync.flush();
    expect(Object.keys(cloud.data.get('kid1')!.seen).sort()).toEqual(['seasons', 'tide']);
  });

  it('通信できないときは offline になり、つながったら送る', async () => {
    const cloud = new FakeCloud();
    const one = device(cloud);
    await settle();
    await one.sync.signIn();
    await one.sync.flush();
    cloud.fail = true;
    markSeen('moon');
    await one.sync.flush();
    expect(one.sync.status).toBe('offline');
    expect(await one.sync.signOut()).toBe('unsynced');
    cloud.fail = false;
    await one.sync.flush();
    expect(one.sync.status).toBe('synced');
    expect(cloud.data.get('kid1')!.seen.moon).toBeGreaterThan(0);
  });

  it('ログアウトすると、この端末の写しを消して、ログインなしの記録にもどる', async () => {
    const cloud = new FakeCloud();
    const one = device(cloud);
    await settle();
    await one.sync.signIn();
    markSeen('stars');
    await one.sync.flush();
    expect(await one.sync.signOut()).toBe('ok');
    await settle();
    expect(rememberedUid()).toBeNull();
    expect(exportSnapshot()).toEqual(emptySnapshot());
    expect([...memory.current.keys()].some((k) => k.startsWith('geoscience-viewer:u:'))).toBe(false);
  });
});
