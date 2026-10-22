import { nextPhase, seasonPoint, type MoonPhase, type SeasonPoint } from '../astro/events';
import { DAY_MS } from '../astro/time';
import { SPEEDS, spanWindow, speedByKey, type Clock, type Span } from '../core/clock';
import { h, rubyHtml } from './dom';
import { SPAN_LABEL, dateTimeLabel } from './text';

// タイムラプスの操作: 日付と時刻、スライダー、再生・一時停止、速さ、範囲 (1 日・1 か月・1 年)、「いま」、ジャンプ

const SEASON_JUMPS: [SeasonPoint, string][] = [
  ['spring', '春分(しゅんぶん)'],
  ['summer', '夏至(げし)'],
  ['autumn', '秋分(しゅうぶん)'],
  ['winter', '冬至(とうじ)'],
];
const PHASE_JUMPS: [MoonPhase, string][] = [
  ['new', '新月(しんげつ)'],
  ['first', '上弦(じょうげん)'],
  ['full', '満月(まんげつ)'],
  ['last', '下弦(かげん)'],
];
const STEPS = 1000;
/** 1 回の「すすむ・もどる」で動かす時間 */
const STEP_MS: Record<Span, number> = { day: 3_600_000, month: DAY_MS, year: 7 * DAY_MS };

export interface TimebarOptions {
  clock: Clock;
  /** 観察地点の時刻の差 (時間)。日付の表示とスライダーの範囲に使う */
  tz: () => number;
  span: Span;
  onSpan?(span: Span): void;
}

export interface Timebar {
  el: HTMLElement;
  setSpan(span: Span): void;
  /** 再生中でなければ、画面を時刻に合わせて書きなおす (場所を変えたときなど) */
  refresh(): void;
  dispose(): void;
}

function button(label: string, attrs: Record<string, string> = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'btn btn-small', ...attrs });
  b.innerHTML = rubyHtml(label);
  return b;
}

export function timebar(opts: TimebarOptions): Timebar {
  const { clock } = opts;
  let span = opts.span;
  let win = spanWindow(clock.ms, span, opts.tz());

  const date = h('span', { class: 'clock-date' });
  const time = h('span', { class: 'clock-time' });
  const slider = h('input', { type: 'range', min: '0', max: String(STEPS), step: '1', class: 'time-slider', 'aria-label': '時刻' });
  const ticks = h('div', { class: 'time-ticks', 'aria-hidden': 'true' });
  const back = button('◀', { 'aria-label': 'もどる' });
  const play = h('button', { type: 'button', class: 'btn btn-primary btn-play', 'aria-label': '再生' });
  const fwd = button('▶', { 'aria-label': 'すすむ' });
  const now = button('いま');
  const speed = h('select', { class: 'select', 'aria-label': '速さ' }, ...SPEEDS.map((s) => h('option', { value: s.key }, s.label.replace(/\(([ぁ-ん]+)\)/g, ''))));
  const spans = h('div', { class: 'seg', role: 'group', 'aria-label': 'スライダーの範囲' });
  const spanButtons = (['day', 'month', 'year'] as Span[]).map((s) => {
    const b = button(SPAN_LABEL[s]);
    b.classList.add('seg-btn');
    b.addEventListener('click', () => setSpan(s, true));
    spans.append(b);
    return [s, b] as const;
  });

  const jumps = h('div', { class: 'jumps' });
  const tzOff = () => opts.tz() * 3_600_000;
  for (const [which, label] of SEASON_JUMPS) {
    const b = button(label, { class: 'chip chip-btn' });
    b.addEventListener('click', () => {
      // その年の二十四節気の日の、その場所の正午
      const year = new Date(clock.ms + tzOff()).getUTCFullYear();
      const t = seasonPoint(year, which) + tzOff();
      const d = new Date(t);
      jump(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12) - tzOff());
    });
    jumps.append(b);
  }
  for (const [which, label] of PHASE_JUMPS) {
    const b = button(label, { class: 'chip chip-btn' });
    b.addEventListener('click', () => jump(nextPhase(clock.ms, which)));
    jumps.append(b);
  }

  function jump(ms: number): void {
    clock.setPlaying(false);
    win = spanWindow(ms, span, opts.tz());
    clock.set(ms);
  }

  function setSpan(s: Span, user = false): void {
    span = s;
    win = spanWindow(clock.ms, span, opts.tz());
    for (const [k, b] of spanButtons) b.setAttribute('aria-pressed', String(k === s));
    drawTicks();
    render();
    if (user) opts.onSpan?.(s);
  }

  function drawTicks(): void {
    const labels: string[] = [];
    if (span === 'day') for (let i = 0; i <= 24; i += 6) labels.push(`${i}時`);
    else if (span === 'month') {
      const days = Math.round(win.length / DAY_MS);
      for (const d of [1, 8, 15, 22, days]) labels.push(`${d}日`);
    } else for (const m of [1, 4, 7, 10, 12]) labels.push(`${m}月`);
    ticks.replaceChildren(...labels.map((l) => h('span', {}, l)));
  }

  let lastDate = '';
  let lastTime = '';
  function render(): void {
    // 再生していて範囲の外に出たら、次の範囲に進める
    if (clock.ms < win.start || clock.ms >= win.start + win.length) {
      win = spanWindow(clock.ms, span, opts.tz());
      drawTicks();
    }
    const label = dateTimeLabel(clock.ms, opts.tz());
    if (label.date !== lastDate) date.textContent = lastDate = label.date;
    if (label.time !== lastTime) time.textContent = lastTime = label.time;
    slider.value = String(Math.round(((clock.ms - win.start) / win.length) * STEPS));
    play.textContent = clock.playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', clock.playing ? '一時停止' : '再生');
    play.setAttribute('aria-pressed', String(clock.playing));
    if (speed.value !== clock.speed.key) speed.value = clock.speed.key;
  }

  slider.addEventListener('input', () => {
    clock.setPlaying(false);
    clock.set(win.start + (Number(slider.value) / STEPS) * win.length);
  });
  play.addEventListener('click', () => clock.setPlaying(!clock.playing));
  back.addEventListener('click', () => clock.set(clock.ms - STEP_MS[span]));
  fwd.addEventListener('click', () => clock.set(clock.ms + STEP_MS[span]));
  now.addEventListener('click', () => jump(Date.now()));
  speed.addEventListener('change', () => clock.setSpeed(speedByKey(speed.value)));

  const unsubscribe = clock.subscribe(render);
  setSpan(span);

  const el = h(
    'section',
    { class: 'timebar', 'aria-label': '時間の操作' },
    h('p', { class: 'clock-label', 'aria-live': 'off' }, date, time),
    h('div', { class: 'time-track' }, slider, ticks),
    h('div', { class: 'time-controls' }, h('div', { class: 'time-buttons' }, back, play, fwd, now), speed),
    h('div', { class: 'time-row' }, spans),
    jumps,
  );

  return {
    el,
    setSpan: (s) => setSpan(s),
    refresh: () => {
      win = spanWindow(clock.ms, span, opts.tz());
      drawTicks();
      render();
    },
    dispose: unsubscribe,
  };
}
