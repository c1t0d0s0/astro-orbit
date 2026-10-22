import type { ViewId } from '../views/types';

// ホームのカードの小さな絵 (48 × 48)。色は CSS のクラスで決める

const svg = (body: string) => `<svg class="icon" viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
const earth = (cx: number, cy: number, r: number, tilt = 0) =>
  `<g transform="rotate(${tilt} ${cx} ${cy})"><circle class="i-earth" cx="${cx}" cy="${cy}" r="${r}"/><path class="i-land" d="M${cx - r * 0.5} ${cy - r * 0.3}q${r * 0.4} ${-r * 0.4} ${r * 0.7} 0t${r * 0.5} ${r * 0.6}q${-r * 0.5} ${r * 0.3} ${-r * 0.9} ${-r * 0.1}z"/><line class="i-axis" x1="${cx}" y1="${cy - r - 4}" x2="${cx}" y2="${cy + r + 4}"/></g>`;

export const VIEW_ICON: Record<ViewId, string> = {
  space: svg(`<ellipse class="i-orbit" cx="24" cy="26" rx="20" ry="9"/><circle class="i-sun" cx="24" cy="26" r="6"/>${earth(42, 28, 3.6, 23)}<circle class="i-moon" cx="38" cy="21" r="1.6"/>`),
  seasons: svg(`<circle class="i-sun" cx="24" cy="24" r="5"/><ellipse class="i-orbit" cx="24" cy="24" rx="20" ry="8"/>${earth(6, 24, 3.2, 23)}${earth(42, 24, 3.2, 23)}${earth(24, 32, 3.2, 23)}`),
  ground: svg(`<path class="i-dome" d="M4 36A20 20 0 0 1 44 36"/><path class="i-path" d="M9 36Q24 4 39 36"/><circle class="i-sun" cx="24" cy="15" r="3.6"/><line class="i-ground" x1="2" y1="36" x2="46" y2="36"/>`),
  polar: svg(`${earth(24, 26, 15, 23)}<g transform="rotate(23 24 26)"><ellipse class="i-arctic" cx="24" cy="12.2" rx="6" ry="1.6"/></g><path class="i-night" d="M24 11A15 15 0 0 1 24 41A9 15 0 0 0 24 11Z" transform="rotate(23 24 26)"/>`),
  moon: svg(`${earth(24, 24, 5)}<circle class="i-orbit" cx="24" cy="24" r="15"/><circle class="i-moon" cx="39" cy="24" r="3.4"/><path class="i-night" d="M39 20.6A3.4 3.4 0 0 0 39 27.4Z"/><circle class="i-moon" cx="9" cy="24" r="3.4"/><path class="i-night" d="M9 20.6A3.4 3.4 0 0 0 9 27.4Z"/>`),
  eclipse: svg(`<circle class="i-sun" cx="10" cy="24" r="7"/><path class="i-shadow" d="M34 18L47 21V27L34 30Z"/>${earth(34, 24, 6)}<circle class="i-moon-dark" cx="22" cy="24" r="2.6"/>`),
  tide: svg(`<ellipse class="i-sea" cx="20" cy="24" rx="15" ry="11"/>${earth(20, 24, 8)}<circle class="i-moon" cx="43" cy="24" r="3"/>`),
};
