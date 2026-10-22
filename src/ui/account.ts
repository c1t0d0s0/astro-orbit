import { cloudAvailable, getSync } from '../cloud';
import { h, withRuby } from './dom';
import { ACCOUNT } from './text';

/**
 * ホームのアカウント欄。Google でログインすると、記録を Firestore に保存して、
 * ほかのブラウザや端末でも同じ記録でつづけられる。Firebase の設定がないビルドでは何も出さない。
 */
export function accountBox(): HTMLElement | null {
  if (!cloudAvailable) return null;
  const t = ACCOUNT;
  const sync = getSync();
  const box = h('section', { class: 'account', 'aria-labelledby': 'account-title' }, Object.assign(withRuby('h2', '', t.title), { id: 'account-title' }));

  // Firebase のコードを読みこんでいる間・ログインしているか確かめている間
  if (!sync || sync.status === 'loading') {
    box.append(h('p', { class: 'account-status' }, t.loading));
    return box;
  }

  if (sync.uid === null) {
    const error = h('p', { class: 'account-error', role: 'alert' });
    const button = h('button', { type: 'button', class: 'btn btn-primary' }, t.signIn);
    button.addEventListener('click', async () => {
      button.disabled = true;
      error.textContent = '';
      try {
        await sync.signIn();
      } catch (err) {
        // 自分でログインの画面をとじたときは、何も言わない
        const code = (err as { code?: string })?.code ?? '';
        // 原因を調べられるよう、Firebase のエラーの名前も小さくそえる (README の「ログインできないとき」を参照)
        if (!/popup-closed-by-user|cancelled-popup-request/.test(code)) error.textContent = code ? `${t.signInFailed} (${code})` : t.signInFailed;
        button.disabled = false;
      }
    });
    box.append(withRuby('p', 'account-note', t.note), button, error);
    return box;
  }

  const statusText = { syncing: t.saving, synced: t.saved, offline: t.offline }[sync.status as 'syncing' | 'synced' | 'offline'];
  const signOut = h('button', { type: 'button', class: 'btn' }, t.signOut);
  signOut.addEventListener('click', async () => {
    signOut.disabled = true;
    if ((await sync.signOut()) === 'unsynced') {
      if (confirm(t.signOutUnsynced)) await sync.signOut(true);
      else signOut.disabled = false;
    }
  });
  box.append(
    h(
      'p',
      { class: 'account-state' },
      h('b', {}, t.signedIn),
      h('span', { class: `account-status is-${sync.status}`, role: 'status' }, statusText ?? ''),
    ),
    signOut,
  );
  return box;
}
