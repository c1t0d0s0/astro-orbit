import { speedByKey, Clock } from '../core/clock';
import { getSettings, markSeen, saveSettings } from '../core/storage';
import { placeById, type NamedPlace } from '../data/places';
import { resolveWhen, type Guide } from '../guides';
import { Stage } from '../three/stage';
import { EclipseView } from '../views/eclipse';
import { GroundView } from '../views/ground';
import { MoonView } from '../views/moon';
import { RainbowView } from '../views/rainbow';
import { QuakeView, TsunamiView, VolcanoView } from '../views/solid';
import { SpaceView } from '../views/space';
import { TideView } from '../views/tide';
import { CurrentView, RiverView } from '../views/water';
import { CloudView, StormView, TyphoonView } from '../views/weather';
import type { View, ViewContext, ViewId } from '../views/types';
import { h, homeButton, plain, rubyHtml, setRuby } from './dom';
import { infoHtml } from './info';
import { placePicker } from './place';
import { guide as shibaGuide } from './shiba';
import { timebar } from './timebar';
import { DEFAULT_NOTE, VIEWS } from './text';

// 3D の画面。「3D で見る」(自由に操作) と「解説」(ステップごとに、時刻・場所・視点を切りかえる) の両方で使う

/** step は、はじめに見せる解説のステップ (0 から) */
export type Target = { view: ViewId } | { guide: Guide; step?: number };

/** 説明のレベルを切りかえたときなどに、同じ状態でかき直すための情報 */
interface Resume {
  step: number;
  ms: number;
}

let pendingResume: Resume | null = null;

/** 説明のレベルを切りかえる前の状態 (一度だけ取り出せる) */
export function takeResume(): Resume | undefined {
  const r = pendingResume ?? undefined;
  pendingResume = null;
  return r;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function makeView(stage: Stage, id: ViewId): View {
  switch (id) {
    case 'ground':
      return new GroundView(stage);
    case 'moon':
      return new MoonView(stage);
    case 'tide':
      return new TideView(stage);
    case 'eclipse':
      return new EclipseView(stage);
    case 'cloud':
      return new CloudView(stage);
    case 'storm':
      return new StormView(stage);
    case 'typhoon':
      return new TyphoonView(stage);
    case 'rainbow':
      return new RainbowView(stage);
    case 'river':
      return new RiverView(stage);
    case 'current':
      return new CurrentView(stage);
    case 'quake':
      return new QuakeView(stage);
    case 'tsunami':
      return new TsunamiView(stage);
    case 'volcano':
      return new VolcanoView(stage);
    default:
      return new SpaceView(stage, id);
  }
}

/** ふりがな付きのボタン */
function rubyButton(label: string, cls: string): HTMLButtonElement {
  const b = h('button', { type: 'button', class: cls });
  b.innerHTML = rubyHtml(label);
  return b;
}

export function renderViewer(root: HTMLElement, target: Target, resume?: Resume): () => void {
  const settings = getSettings();
  setRuby(!settings.detail);
  const guideMode = 'guide' in target;
  const guide = guideMode ? target.guide : null;
  const firstView: ViewId = guide ? guide.steps[0].view : (target as { view: ViewId }).view;

  // ---- 画面の骨組み ----
  const title = h('h1', { class: 'viewer-title' });
  const levelBtn = rubyButton(settings.detail ? 'くわしく' : 'かんたん', 'btn btn-small level-btn');
  levelBtn.setAttribute('aria-label', `説明のレベル: ${settings.detail ? 'くわしく' : 'かんたん'} (おすと切りかわる)`);
  const stageEl = h('div', { class: 'stage' });
  const cameraBar = h('div', { class: 'camera-bar', role: 'group', 'aria-label': '視点' });
  const stageNote = h('p', { class: 'stage-note' });
  // 地球の上の赤い点 (観察地点) の名前。点といっしょに回ると速いときに読めないので、画面のすみに固定して出す
  const legend = h('p', { class: 'stage-legend', hidden: true });
  const guideBox = h('section', { class: 'guide-box', 'aria-live': 'polite' });
  const toggleBox = h('div', { class: 'toggles', role: 'group', 'aria-label': '表示の切りかえ' });
  const infoBox = h('div', { class: 'info' });
  const placeBox = h('section', { class: 'panel-section place-box' });
  const lead = h('p', { class: 'viewer-lead' });

  const panel = h('aside', { class: 'panel' });
  root.replaceChildren(
    h(
      'main',
      { class: 'viewer' },
      h('header', { class: 'bar viewer-bar' }, homeButton(), title, levelBtn),
      h('div', { class: 'viewer-body' }, h('section', { class: 'stage-area', 'aria-label': '3D の画面' }, stageEl, h('div', { class: 'stage-top' }, cameraBar, legend), stageNote), panel),
    ),
  );

  let stage: Stage;
  try {
    stage = new Stage(stageEl);
  } catch {
    stageEl.append(h('p', { class: 'stage-error' }, 'この端末やブラウザでは 3D の画面 (WebGL) を表示できません。ほかのブラウザでためしてください。'));
    panel.append(lead);
    return () => {};
  }

  // ---- 状態 ----
  const clock = new Clock(resume?.ms ?? Date.now());
  let place: NamedPlace = settings.place;
  let view: View | null = null;
  let viewId: ViewId = firstView;
  /** いまの時計が、現象の時間 (はじまりからの ms) か。はじめは日時 */
  let processClock = false;
  const ctx: ViewContext = { place, detail: settings.detail, options: {} };
  let stepIndex = resume?.step ?? ('guide' in target ? (target.step ?? 0) : 0);

  const bar = timebar({ clock, tz: () => place.tz, span: VIEWS[firstView].span });

  // ---- 表示の切りかえ・視点 ----
  function drawToggles(): void {
    toggleBox.replaceChildren(
      ...view!.toggles.map((t) => {
        const b = rubyButton(t.label, 'chip chip-btn');
        b.setAttribute('aria-pressed', String(!!ctx.options[t.key]));
        b.addEventListener('click', () => {
          ctx.options[t.key] = !ctx.options[t.key];
          b.setAttribute('aria-pressed', String(ctx.options[t.key]));
          refresh();
        });
        return b;
      }),
    );
  }

  function drawCameras(active: string): void {
    cameraBar.replaceChildren(
      ...view!.cameras.map((c) => {
        const b = rubyButton(c.label, 'btn btn-small btn-camera');
        b.setAttribute('aria-pressed', String(c.key === active));
        b.addEventListener('click', () => {
          view!.setCamera(c.key, ctx);
          for (const x of cameraBar.children) x.setAttribute('aria-pressed', String(x === b));
        });
        return b;
      }),
    );
  }

  function setView(id: ViewId, options?: Record<string, boolean>): void {
    view?.dispose?.();
    stage.clear();
    // 前の画面のカメラの設定を、はじめにもどす
    stage.camera.layers.set(0);
    stage.camera.fov = 45;
    stage.camera.updateProjectionMatrix();
    Object.assign(stage.controls, { rotateSpeed: 1, enableZoom: true, minPolarAngle: 0, maxPolarAngle: Math.PI });
    view = makeView(stage, id);
    viewId = id;
    ctx.options = { ...view.defaults, ...options };
    const meta = VIEWS[id];
    title.innerHTML = rubyHtml(guide ? guide.title : meta.title);
    stageNote.innerHTML = rubyHtml(meta.note ?? DEFAULT_NOTE);
    // 日時の画面と現象の時間の画面を行き来したら、時計をそれぞれのはじめにもどす
    const process = !!meta.timeline;
    clock.range = meta.timeline ? [0, meta.timeline.length] : null;
    if (process !== processClock) {
      processClock = process;
      clock.setPlaying(false);
      clock.set(process ? 0 : Date.now());
    }
    bar.setTimeline(meta.timeline ?? null);
    // 現象の時間の画面には、観察する場所がない
    placeBox.hidden = process;
    drawToggles();
  }

  // ---- 時刻が変わったら、3D と情報をかき直す (情報は 1 秒に 4 回まで) ----
  let infoTimer: ReturnType<typeof setTimeout> | null = null;
  let infoAt = 0;
  function drawInfo(): void {
    infoTimer = null;
    infoAt = performance.now();
    infoBox.innerHTML = infoHtml(viewId, clock.ms, ctx);
  }
  let legendHtml = '';
  function drawLegend(): void {
    // 地上・虹の画面と、現象の時間の画面には赤い点がない。表示を切りかえて点を消したときも出さない
    const show = viewId !== 'ground' && viewId !== 'rainbow' && !VIEWS[viewId].timeline && ctx.options.place !== false;
    const html = show ? `<span class="legend-dot" aria-hidden="true"></span>${rubyHtml(`赤(あか)い点(てん)：${ctx.place.name}`)}` : '';
    if (html !== legendHtml) {
      legendHtml = html;
      legend.innerHTML = html;
      legend.hidden = !show;
    }
  }

  function refresh(): void {
    drawLegend();
    view?.update(clock.ms, ctx);
    if (infoTimer) return;
    const wait = Math.max(0, 250 - (performance.now() - infoAt));
    infoTimer = setTimeout(drawInfo, wait);
  }
  const unsubscribe = clock.subscribe(refresh);
  const offFrame = stage.onFrame((dt) => {
    clock.tick(dt);
    view?.frame?.(dt);
  });

  function setPlace(p: NamedPlace): void {
    place = p;
    ctx.place = p;
    bar.refresh();
    refresh();
  }

  // ---- 自由に操作する画面 ----
  function startFree(id: ViewId): void {
    const meta = VIEWS[id];
    setView(id);
    lead.innerHTML = rubyHtml(meta.lead);
    clock.setSpeed(speedByKey(meta.speed));
    bar.setSpan(meta.span);
    view!.update(clock.ms, ctx);
    view!.setCamera(meta.camera, ctx);
    drawCameras(meta.camera);
    placeBox.replaceChildren(
      h('h2', {}, '観察する場所'),
      placePicker(place, (p) => {
        saveSettings({ place: p });
        setPlace(p);
      }),
    );
    refresh();
  }

  // ---- 解説 ----
  function showStep(i: number, keepTime = false): void {
    const g = guide!;
    stepIndex = i;
    const step = g.steps[i];
    const p = step.place ? placeById(step.place)! : settings.place;
    place = p;
    ctx.place = p;
    if (!view || viewId !== step.view) setView(step.view, step.options);
    else {
      ctx.options = { ...view.defaults, ...step.options };
      drawToggles();
    }
    const meta = VIEWS[step.view];
    clock.setPlaying(false);
    clock.setSpeed(speedByKey(step.speed ?? meta.speed));
    if (!keepTime) clock.set(step.when ? resolveWhen(step.when, Date.now(), p.tz) : clock.ms);
    bar.setSpan(step.span ?? meta.span);
    const camera = step.camera ?? meta.camera;
    view!.update(clock.ms, ctx);
    view!.setCamera(camera, ctx);
    drawCameras(camera);
    if (step.play && !reducedMotion() && !keepTime) clock.setPlaying(true);
    refresh();

    const last = i === g.steps.length - 1;
    const prev = rubyButton('‹ まえ', 'btn btn-small');
    prev.disabled = i === 0;
    prev.addEventListener('click', () => showStep(i - 1));
    const next = rubyButton(last ? 'おわり' : 'つぎへ ›', 'btn btn-primary btn-small');
    next.addEventListener('click', () => (last ? finish() : showStep(i + 1)));
    const again = rubyButton('もう一度(いちど)', 'btn btn-small');
    again.addEventListener('click', () => showStep(i));
    guideBox.replaceChildren(
      h('p', { class: 'step-count' }, `${i + 1} / ${g.steps.length}`),
      Object.assign(h('h2', { class: 'step-title' }), { innerHTML: rubyHtml(step.title) }),
      shibaGuide(settings.detail ? step.detail : step.easy, { cls: 'step-guide' }),
      h('div', { class: 'step-nav' }, prev, again, next),
    );
    placeBox.replaceChildren(Object.assign(h('p', { class: 'place-meta' }), { innerHTML: rubyHtml(`観察(かんさつ)地点(ちてん)：${p.name}`) }));
  }

  function finish(): void {
    const g = guide!;
    markSeen(g.id);
    clock.setPlaying(false);
    const again = rubyButton('はじめから見(み)る', 'btn btn-small');
    again.addEventListener('click', () => showStep(0));
    const free = h('a', { class: 'btn btn-small', href: `#/view/${g.steps[0].view}` });
    free.innerHTML = rubyHtml('3Dで自由(じゆう)に見(み)る');
    const home = h('a', { class: 'btn btn-primary btn-small', href: '#/' }, 'ホームへ');
    guideBox.replaceChildren(
      h('p', { class: 'step-count' }, 'おわり'),
      Object.assign(h('h2', { class: 'step-title' }), { innerHTML: rubyHtml(g.title) }),
      shibaGuide(
        settings.detail
          ? '最後まで見ました。時刻や場所を変えて、自分でもたしかめてみよう。'
          : 'さいごまで見(み)たね！ 時刻(じこく)や場所(ばしょ)を変(か)えて、自分(じぶん)でもたしかめてみよう。',
        { happy: true, cls: 'step-guide' },
      ),
      h('div', { class: 'step-nav' }, again, free, home),
    );
  }

  // ---- 組み立て ----
  // パネルは「説明と時間の操作」と「表示・いまのようす・場所」の 2 つに分ける。広い画面では 2 列にならべる
  function panelColumns(main: HTMLElement[]): HTMLElement[] {
    return [
      h('div', { class: 'panel-col panel-main' }, ...main),
      h(
        'div',
        { class: 'panel-col panel-sub' },
        h('section', { class: 'panel-section' }, h('h2', {}, '表示'), toggleBox),
        h('section', { class: 'panel-section' }, h('h2', {}, 'いまのようす'), infoBox),
        placeBox,
      ),
    ];
  }

  if (guide) {
    lead.innerHTML = rubyHtml(guide.lead);
    panel.append(...panelColumns([guideBox, bar.el]));
    showStep(Math.min(stepIndex, guide.steps.length - 1), resume !== undefined);
    if (resume) clock.set(resume.ms);
  } else {
    panel.append(...panelColumns([lead, bar.el]));
    startFree(firstView);
    if (resume) clock.set(resume.ms);
  }

  // 説明のレベルを切りかえる。同じステップ・同じ時刻のまま、画面をかき直してもらう (main.ts の route)
  levelBtn.addEventListener('click', () => {
    saveSettings({ detail: !getSettings().detail });
    pendingResume = { step: stepIndex, ms: clock.ms };
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  levelBtn.title = plain('説明のレベルを切りかえる');
  return () => {
    unsubscribe();
    offFrame();
    bar.dispose();
    if (infoTimer) clearTimeout(infoTimer);
    view?.dispose?.();
    stage.dispose();
  };
}

