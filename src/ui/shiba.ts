import { h, rubyHtml } from './dom';

// 柴犬 (このアプリのキャラクター)。理科ラボのハカセと同じ顔で、星もようの帽子をかぶっている。
// 目や輪郭は、画面の明暗に関係なくこの色にする (文字色に合わせると暗い画面で白目になる)
const LINE = '#1c2a4a';
const YELLOW = '#ffd23f';

export interface Look {
  eyes?: 'open' | 'wink' | 'sleep' | 'happy' | 'sparkle' | 'brave';
  mouth?: 'tongue' | 'smile' | 'open';
  /** 星の帽子をかぶるか */
  hat?: boolean;
}

/** 色の指定があればその色、なければ CSS のクラス (暗い画面で少し色を落とす) を使う */
const sparkle = (cx: number, cy: number, r: number, fill = YELLOW) =>
  `<path fill="${fill}" d="M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z"/>`;

const EYE_Y = 69;
const EYE_X = [42, 78];

function eyes(look: Look): string {
  const open = (x: number) =>
    `<ellipse cx="${x}" cy="${EYE_Y}" rx="7.5" ry="8.5" fill="${LINE}"/>` +
      `<circle cx="${x + 2.6}" cy="${EYE_Y - 3.6}" r="3.1" fill="#fff"/>` +
      `<circle cx="${x - 2.6}" cy="${EYE_Y + 3.6}" r="1.5" fill="#fff"/>`;
  const arc = (x: number, up: boolean) =>
    `<path fill="none" stroke="${LINE}" stroke-width="2.8" stroke-linecap="round" d="M${x - 7} ${EYE_Y + (up ? 2 : -1)}Q${x} ${EYE_Y + (up ? -8 : 7)} ${x + 7} ${EYE_Y + (up ? 2 : -1)}"/>`;
  const [l, r] = EYE_X;
  switch (look.eyes ?? 'open') {
    case 'wink':
      return open(l) + arc(r, true);
    case 'sleep':
      return arc(l, false) + arc(r, false);
    case 'happy':
      return arc(l, true) + arc(r, true);
    case 'sparkle':
      return open(l) + open(r) + sparkle(l - 11, EYE_Y - 12, 4.5) + sparkle(r + 11, EYE_Y - 12, 4.5);
    case 'brave':
      return (
        open(l) +
        open(r) +
        `<path fill="none" stroke="${LINE}" stroke-width="3" stroke-linecap="round" d="M33 56L50 60.5M87 56L70 60.5"/>`
      );
    default:
      return open(l) + open(r);
  }
}

function mouth(look: Look): string {
  // 柴犬の鼻は、黒くて大きい
  const nose = `<path fill="${LINE}" d="M53.5 78.6Q60 75.4 66.5 78.6Q64.6 85 60 85.6Q55.4 85 53.5 78.6Z"/><ellipse cx="58.2" cy="79.4" rx="1.6" ry="0.9" fill="#fff" opacity="0.7"/>`;
  const lines = `<path fill="none" stroke="${LINE}" stroke-width="2" stroke-linecap="round" d="M60 85.6V88M60 88C58 92.5 52.5 92.5 51 89M60 88C62 92.5 67.5 92.5 69 89"/>`;
  switch (look.mouth ?? 'tongue') {
    case 'smile':
      return nose + lines;
    case 'open':
      return (
        `<path fill="#8a3b3b" stroke="${LINE}" stroke-width="2" stroke-linejoin="round" d="M51.5 89Q60 102.5 68.5 89Z"/>` +
        `<ellipse class="shiba-tongue" cx="60" cy="95.2" rx="4" ry="2.6"/>` +
        nose +
        `<path fill="none" stroke="${LINE}" stroke-width="2" stroke-linecap="round" d="M60 85.6V89"/>`
      );
    default:
      return `<path class="shiba-tongue" d="M56.2 90.5Q60 99 63.8 90.5Z"/>` + nose + lines;
  }
}

/** 星もようのとんがり帽子 (天文ハカセ) */
const STAR_HAT =
  `<g stroke="${LINE}" stroke-width="2.5" stroke-linejoin="round">` +
  `<path fill="#2b3f7a" d="M33 33Q52 -4 76 -14Q72 8 88 33Q60 41 33 33Z"/>` +
  `<path fill="#4a62b0" d="M31 31Q60 40 90 31L92 37Q60 47 29 37Z"/></g>` +
  sparkle(55, 16, 5) +
  sparkle(70, 2, 3.6) +
  sparkle(74, 24, 3) +
  `<circle cx="76" cy="-14" r="4.2" fill="${YELLOW}" stroke="${LINE}" stroke-width="2"/>`;

/**
 * 柴犬の顔 (たて 110 × よこ 120 の中にかく)。ぴんと立った三角の耳、白いほおと口もと、
 * まゆの丸いもようが目じるし。
 */
export function shibaFace(look: Look = {}): string {
  return (
    `<g stroke="${LINE}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">` +
    // 耳
    `<path class="shiba-fur" d="M25 52C19 38 20 22 27 9C39 14 49 24 54 37ZM95 52C101 38 100 22 93 9C81 14 71 24 66 37Z"/>` +
    // 頭 (ほおがふっくらしている)
    `<path class="shiba-fur" d="M60 28C35 28 17 43 16 64C15 74 11 78 9 84C16 86 22 91 29 97C38 104 49 107 60 107C71 107 82 104 91 97C98 91 104 86 111 84C109 78 105 74 104 64C103 43 85 28 60 28Z"/></g>` +
    `<path class="shiba-pink" d="M29 42C27 33 28 25 31 18C38 22 43 28 46 35ZM91 42C93 33 92 25 89 18C82 22 77 28 74 35Z"/>` +
    // 白いほおと口もと
    `<path class="shiba-light" d="M17 79C22 68 33 64 44 70C48 73 51 71 52 66C54 58 66 58 68 66C69 71 72 73 76 70C87 64 98 68 103 79C105 82 107 83 109 84C103 87 98 91 91 96.5C82 103 71 105.5 60 105.5C49 105.5 38 103 29 96.5C22 91 17 87 11 84C13 83 15 82 17 79Z"/>` +
    // まゆの丸いもよう
    `<ellipse class="shiba-light" cx="42" cy="54.5" rx="5.2" ry="3.4" transform="rotate(-12 42 54.5)"/>` +
    `<ellipse class="shiba-light" cx="78" cy="54.5" rx="5.2" ry="3.4" transform="rotate(12 78 54.5)"/>` +
    `<ellipse class="shiba-pink" cx="27" cy="83" rx="6.5" ry="4" opacity="0.7"/>` +
    `<ellipse class="shiba-pink" cx="93" cy="83" rx="6.5" ry="4" opacity="0.7"/>` +
    eyes(look) +
    mouth(look) +
    (look.hat ? STAR_HAT : '')
  );
}

/** ハカセ (このアプリの柴犬)。星の帽子をかぶっている */
const HAKASE: Look = { hat: true, mouth: 'smile' };

/** ホームなどに出す柴犬 */
export function shiba(look: Look = HAKASE): HTMLElement {
  const el = h('div', { class: 'shiba' });
  el.innerHTML = `<svg viewBox="0 -20 120 146" role="img" aria-label="しばいぬのハカセ">${shibaFace(look)}</svg>`;
  return el;
}

/** 柴犬のハカセが、ふきだしで話す。text はふりがな付きの文 (rubyHtml) */
export function guide(text: string, opts: { happy?: boolean; cls?: string } = {}): HTMLElement {
  const look: Look = opts.happy ? { ...HAKASE, eyes: 'happy', mouth: 'open' } : HAKASE;
  const bubble = h('div', { class: 'bubble-text' });
  bubble.innerHTML = text
    .split('\n')
    .map((line) => `<p>${rubyHtml(line)}</p>`)
    .join('');
  return h('div', { class: `guide${opts.cls ? ` ${opts.cls}` : ''}`, role: 'status' }, shiba(look), h('div', { class: 'bubble' }, bubble));
}
