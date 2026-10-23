type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | EventListener> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === 'function') el.addEventListener(key.replace(/^on/, ''), value);
    else if (value === true) el.setAttribute(key, '');
    else if (value !== false) el.setAttribute(key, String(value));
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

/** 画面の左上に置く、ホームにもどるボタン */
export function homeButton(): HTMLElement {
  return h('a', { class: 'back home-btn', href: '#/', 'aria-label': 'ホームにもどる' }, h('span', { 'aria-hidden': 'true' }, '‹'), 'ホーム');
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let showRuby = true;

/** ふりがなを付けるか (説明が「かんたん」のときだけ付ける) */
export function setRuby(on: boolean): void {
  showRuby = on;
}

/** 桁そろえの U+2007 を、数字と同じ幅の見えない 0 にした HTML (フォントに U+2007 がなくても幅がそろう) */
export const digitsHtml = (text: string) => escapeHtml(text).replace(/\u2007/g, '<span class="digit-pad">0</span>');

/** 「漢字(かんじ)」をふりがな付きの HTML にする。ふりがなを付けないときは、よみを消す */
export function rubyHtml(text: string): string {
  return digitsHtml(text).replace(/([一-龠々ヶ]+)\(([ぁ-ん]+)\)/g, showRuby ? '<ruby>$1<rt>$2</rt></ruby>' : '$1');
}

/** ふりがなのよみを消した文 (aria-label や title などに使う) */
export const plain = (text: string) => text.replace(/([一-龠々ヶ]+)\(([ぁ-ん]+)\)/g, '$1');

export function withRuby<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text: string) {
  const el = h(tag, { class: cls });
  el.innerHTML = rubyHtml(text);
  return el;
}

/** 改行で分けた文を、段落ごとにふりがな付きでならべる */
export function paragraphs(cls: string, text: string): HTMLElement {
  return h('div', { class: cls }, ...text.split('\n').map((line) => withRuby('p', '', line)));
}

/** 問題の図。SVG はこのアプリの中で組み立てたものだけをわたすこと */
export function figure(svg: string): HTMLElement {
  const el = h('div', { class: 'figure' });
  el.innerHTML = svg;
  return el;
}

