import './styles.css';
import { restoreStore, startCloud } from './cloud';
import { guideById } from './guides';
import { renderHome } from './ui/home';
import { ACCOUNT, VIEW_ORDER } from './ui/text';
import type { Target } from './ui/viewer';
import type { ViewId } from './views/types';

// 前にログインしていた人がいれば、通信を待たずに、この端末に残っているその人の写しで画面を出す
restoreStore();

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;
/** 画面を切りかえた回数。3D の部品を読みこんでいる間に、別の画面へ移ったかを調べる */
let routeId = 0;

const isView = (id: string): id is ViewId => (VIEW_ORDER as readonly string[]).includes(id);

/** 3D の画面 (three.js をふくむ) は大きいので、はじめて使うときに読みこむ。ホームの表示はおそくならない */
async function viewer(target: Target, id: number): Promise<void> {
  const { renderViewer, takeResume } = await import('./ui/viewer');
  if (id !== routeId) return;
  const resume = takeResume();
  cleanup = renderViewer(app, target, resume);
  if (!resume) window.scrollTo(0, 0);
}

function route(): void {
  cleanup?.();
  cleanup = null;
  const id = ++routeId;
  const hash = location.hash;
  let m: RegExpMatchArray | null;

  // #/view/<画面> 3D で自由に見る / #/guide/<解説> 解説
  if ((m = hash.match(/^#\/view\/([a-z]+)$/)) && isView(m[1])) void viewer({ view: m[1] }, id);
  else if ((m = hash.match(/^#\/guide\/([a-z0-9-]+)$/)) && guideById(m[1])) void viewer({ guide: guideById(m[1])! }, id);
  else {
    renderHome(app);
    window.scrollTo(0, 0);
  }
}

window.addEventListener('hashchange', route);
route();

// 最初の画面を出してから、ログインと Firestore の準備をする (Firebase の設定がないビルドでは何もしない)
void startCloud({
  // ログインやほぞんの状態が変わった。状態を出しているのはホームだけ
  onStatus: () => {
    if (app.querySelector('.home')) renderHome(app);
  },
  // Firestore から取りこんで、手元の記録が変わった。ホームならかき直す (3D の画面は、見ている途中なのでそのまま)
  onData: () => {
    if (app.querySelector('.home')) renderHome(app);
  },
  askMigrate: () => confirm(ACCOUNT.askMigrate),
});
