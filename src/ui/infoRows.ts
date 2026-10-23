import { rubyHtml } from './dom';

// 「いまのようす」の表と図の組み立て (info.ts と infoEarth.ts で使う)

export type Row = [label: string, value: string];

export function rows(list: Row[]): string {
  return `<dl class="info-rows">${list.map(([k, v]) => `<div><dt>${rubyHtml(k)}</dt><dd>${rubyHtml(v)}</dd></div>`).join('')}</dl>`;
}

export function figure(title: string, svg: string, note = ''): string {
  return `<figure class="info-fig"><figcaption>${rubyHtml(title)}</figcaption>${svg}${note ? `<p class="info-note">${rubyHtml(note)}</p>` : ''}</figure>`;
}

/** 注意書きだけの段落 */
export const note = (text: string) => `<p class="info-note">${rubyHtml(text)}</p>`;
