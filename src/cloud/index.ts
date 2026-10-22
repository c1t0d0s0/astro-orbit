import { rememberedUid, useStore } from '../core/storage';
import { firebaseConfig, useEmulator } from './config';
import { Sync, type SyncHooks } from './sync';

/** Firebase の設定が入っているビルドか。入っていなければ、ログインの入り口は出さない */
export const cloudAvailable = firebaseConfig !== null;

let sync: Sync | null = null;

/** ログイン・同期の本体。Firebase のコードを読みこみ終わるまでは null */
export function getSync(): Sync | null {
  return sync;
}

/**
 * アプリを開いたらすぐによぶ。前にログインしていた人がいれば、通信を待たずに、
 * この端末に残っているその人の写しを使って画面を出せるようにする。
 */
export function restoreStore(): void {
  if (cloudAvailable) useStore(rememberedUid());
}

/** 最初の画面を出したあとでよぶ。Firebase のコードを別ファイルとして読みこんで、同期を始める */
export async function startCloud(hooks: SyncHooks): Promise<void> {
  if (!firebaseConfig) return;
  const { createFirebase } = await import('./firebase');
  const { remote, auth } = createFirebase(firebaseConfig, useEmulator);
  sync = new Sync(remote, auth, hooks);
  sync.start();
  // 画面をとじる前・かくれる前に、たまっている変更を送っておく
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void sync?.flush();
  });
  window.addEventListener('online', () => void sync?.flush());
}
