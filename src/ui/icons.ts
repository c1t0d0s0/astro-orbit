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
  quake: svg(`<path class="i-rock" d="M2 22H46V44H2Z"/><path class="i-plate" d="M28 22H46V30L28 40Z"/><path class="i-ground" d="M2 22H28"/><circle class="i-wave-p" cx="27" cy="30" r="12"/><circle class="i-wave-s" cx="27" cy="30" r="7"/><circle class="i-magma" cx="27" cy="30" r="2"/>`),
  tsunami: svg(`<path class="i-rock" d="M2 30Q14 30 22 40L46 42V46H2Z"/><path class="i-sea" d="M2 24H46V42L22 40Q14 30 2 30Z"/><path class="i-water" d="M2 24H14Q20 24 22 15Q24 24 30 24H46"/>`),
  volcano: svg(`<path class="i-ash" d="M22 10a6 5 0 0 1 9-3a5 5 0 0 1 8 4a4 4 0 0 1-2 7H24a4 4 0 0 1-2-8Z"/><path class="i-rock" d="M2 42L19 20H29L46 42Z"/><path class="i-magma" d="M22 20H26L27 42H21Z"/><line class="i-ground" x1="2" y1="42" x2="46" y2="42"/>`),
  tide: svg(`<ellipse class="i-sea" cx="20" cy="24" rx="15" ry="11"/>${earth(20, 24, 8)}<circle class="i-moon" cx="43" cy="24" r="3"/>`),
};
