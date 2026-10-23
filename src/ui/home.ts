import { getSeen, getSettings, saveSettings } from '../core/storage';
import { GUIDES } from '../guides';
import { accountBox } from './account';
import { h, rubyHtml, setRuby, withRuby } from './dom';
import { VIEW_ICON } from './icons';
import { placePicker } from './place';
import { guide, shiba } from './shiba';
import { GROUPS, VIEWS, VIEW_ORDER, type ViewGroup } from './text';

/** 方眼ノートのマスに「地学観測」と書いた、タイトルのかざり */
function crest(): HTMLElement {
  return h('div', { class: 'crest', 'aria-hidden': 'true' }, ...['地', '学', '観', '測'].map((ch, i) => h('span', { class: i === 1 ? 'crest-cell crest-cross' : 'crest-cell' }, ch)));
}

function viewCard(id: (typeof VIEW_ORDER)[number]): HTMLElement {
  const meta = VIEWS[id];
  const icon = h('span', { class: 'card-icon' });
  icon.innerHTML = VIEW_ICON[id];
  return h('a', { class: 'card view-card', href: `#/view/${id}` }, icon, h('span', { class: 'card-text' }, withRuby('span', 'card-title', meta.title), withRuby('span', 'card-lead', meta.lead)));
}

function guideCard(g: (typeof GUIDES)[number], seen: boolean): HTMLElement {
  const icon = h('span', { class: 'card-icon' });
  icon.innerHTML = VIEW_ICON[g.steps[0].view];
  const chip = seen ? h('span', { class: 'chip chip-small chip-seen' }, '見た') : null;
  return h(
    'a',
    { class: `card guide-card${seen ? ' is-seen' : ''}`, href: `#/guide/${g.id}` },
    icon,
    h(
      'span',
      { class: 'card-text' },
      h('span', { class: 'card-head' }, withRuby('span', 'card-title', g.title), chip),
      withRuby('span', 'card-lead', g.lead),
      withRuby('span', 'card-grade', `${g.grade}・${g.steps.length}ステップ`),
    ),
  );
}

/** 分野ごとに見出しをつけて並べる (カードがない分野は出さない) */
function grouped<T>(items: readonly T[], groupOf: (item: T) => ViewGroup, card: (item: T) => HTMLElement, listCls: string): HTMLElement[] {
  return GROUPS.flatMap(({ id, title }) => {
    const list = items.filter((x) => groupOf(x) === id);
    return list.length ? [h('div', { class: 'card-group' }, withRuby('h3', 'card-group-title', title), h('div', { class: listCls }, ...list.map(card)))] : [];
  });
}

export function renderHome(root: HTMLElement): void {
  const settings = getSettings();
  setRuby(!settings.detail);
  const seen = getSeen();

  const level = h('div', { class: 'seg', role: 'group', 'aria-label': '説明のレベル' });
  for (const [detail, label, note] of [
    [false, 'かんたん', 'ふりがな付き'],
    [true, 'くわしく', '中学生向け'],
  ] as const) {
    const b = h('button', { type: 'button', class: 'btn btn-small seg-btn', 'aria-pressed': String(settings.detail === detail) }, label, h('small', {}, note));
    b.addEventListener('click', () => {
      saveSettings({ detail });
      renderHome(root);
    });
    level.append(b);
  }

  const howto = h('details', { class: 'howto' }, h('summary', {}, 'つかいかた'));
  const list = h('ul');
  list.innerHTML = [
    '「解説(かいせつ)」は、ハカセの説明(せつめい)にそって、ステップごとに3Dの画面(がめん)が切(き)りかわります。',
    '「3Dで見(み)る」では、時間(じかん)のスライダーや再生(さいせい)ボタンで、日時(にちじ)を自由(じゆう)に動(うご)かせます。',
    '画面(がめん)はドラッグで回(まわ)せます。2本指(ほんゆび)やマウスのホイールで拡大(かくだい)できます。',
    '太陽(たいよう)・月(つき)・星(ほし)の位置(いち)は、本当(ほんとう)の日時(にちじ)に合(あ)わせて計算(けいさん)しています。大(おお)きさと距離(きょり)は、見(み)やすく縮(ちぢ)めています。',
    '雲(くも)・川(かわ)・地震(じしん)などの画面(がめん)では、時間(じかん)は「はじまりから何分(なんぷん)」で進(すす)みます。',
  ]
    .map((t) => `<li>${rubyHtml(t)}</li>`)
    .join('');
  howto.append(list);

  root.replaceChildren(
    h(
      'main',
      { class: 'home' },
      h(
        'div',
        { class: 'home-main' },
        h(
          'header',
          { class: 'hero' },
          crest(),
          h('div', { class: 'hero-text' }, h('h1', { class: 'brand' }, '地学ビューア'), withRuby('p', 'lead', '宇宙(うちゅう)・空(そら)・海(うみ)・大地(だいち)のしくみを、3Dで見(み)てたしかめよう。')),
          shiba(),
        ),
        guide('教科書(きょうかしょ)の図(ず)ではわかりにくいことも、ぐるっと回(まわ)して見(み)ればわかるよ。まずは「解説(かいせつ)」から見(み)てみよう！', { cls: 'home-guide' }),
        h(
          'section',
          { class: 'cards', 'aria-labelledby': 'guides-title' },
          withRuby('h2', '', '解説(かいせつ)：なぜ？を3Dで'),
          ...grouped(GUIDES, (g) => VIEWS[g.steps[0].view].group, (g) => guideCard(g, seen[g.id] !== undefined), 'card-list'),
        ),
        h(
          'section',
          { class: 'cards', 'aria-labelledby': 'views-title' },
          withRuby('h2', '', '3Dで自由(じゆう)に見(み)る'),
          ...grouped(VIEW_ORDER, (id) => VIEWS[id].group, viewCard, 'card-list view-list'),
        ),
      ),
      h(
        'div',
        { class: 'home-side' },
        h('section', { class: 'panel-section' }, withRuby('h2', '', '観察(かんさつ)する場所(ばしょ)'), placePicker(settings.place, (p) => saveSettings({ place: p }))),
        h('section', { class: 'panel-section' }, withRuby('h2', '', '説明(せつめい)のレベル'), level),
        accountBox(),
        howto,
      ),
    ),
  );
  // h2 の id (aria-labelledby 用)
  const [g, v] = root.querySelectorAll('.cards h2');
  g?.setAttribute('id', 'guides-title');
  v?.setAttribute('id', 'views-title');
}
