import { localSiderealTime, toHorizontal } from '../astro/coords';
import { dayInfo, moonAge, moonRiseSet, nextPhase, type MoonPhase } from '../astro/events';
import { bodiesAt } from '../astro/state';
import { tideName, tideRange } from '../astro/tide';
import type { ViewContext, ViewId } from '../views/types';
import { beamChart, daylightChart, tideChart } from './chart';
import { h, rubyHtml } from './dom';
import { dateTimeLabel, direction, hoursLabel, phaseName, seasonName, shortDate, timeLabel } from './text';

// 画面ごとの「いまのようす」(数字とグラフ)。時刻が変わるたびに書きなおす (再生中は 1 秒に数回まで)

type Row = [label: string, value: string];

const TIDE_LABEL = { spring: '大潮(おおしお)', middle: '中潮(なかしお)', neap: '小潮(こしお)' };
const PHASE_LABEL: Record<MoonPhase, string> = { new: '新月(しんげつ)', first: '上弦(じょうげん)', full: '満月(まんげつ)', last: '下弦(かげん)' };

function rows(list: Row[]): string {
  return `<dl class="info-rows">${list.map(([k, v]) => `<div><dt>${rubyHtml(k)}</dt><dd>${rubyHtml(v)}</dd></div>`).join('')}</dl>`;
}

function figure(title: string, svg: string, note = ''): string {
  return `<figure class="info-fig"><figcaption>${rubyHtml(title)}</figcaption>${svg}${note ? `<p class="info-note">${rubyHtml(note)}</p>` : ''}</figure>`;
}

/** 春分・夏至・冬至の通り道の色 (views/ground.ts の COLORS と同じ) */
const LEGEND =
  '<p class="legend">' +
  [
    ['#ff7a6b', '夏至(げし) (6月(がつ)ごろ)'],
    ['#7fd18b', '春分(しゅんぶん)・秋分(しゅうぶん)'],
    ['#7fb4ff', '冬至(とうじ) (12月(がつ)ごろ)'],
  ]
    .map(([c, t]) => `<span><i style="background:${c}"></i>${rubyHtml(t)}</span>`)
    .join('') +
  '</p>';

const deg = (v: number) => `${Math.round(v)}°`;

/** 太陽・月の、いまの高さと方位 */
function skyNow(ms: number, ctx: ViewContext) {
  const b = bodiesAt(ms);
  const lst = localSiderealTime(b.gmst, ctx.place.lon);
  return { b, sun: toHorizontal(b.sun, ctx.place.lat, lst), moon: toHorizontal(b.moon, ctx.place.lat, lst) };
}

/** 太陽の高さ・昼の長さ (白夜・極夜もふくめて) */
function dayRows(ms: number, ctx: ViewContext, notilt = false): Row[] {
  const tz = ctx.place.tz;
  if (notilt) {
    return [
      ['昼(ひる)の長(なが)さ', '一年中(いちねんじゅう) 約(やく)12時間(じかん)'],
      ['南中高度(なんちゅうこうど)', `一年中(いちねんじゅう) ${deg(90 - Math.abs(ctx.place.lat))}`],
    ];
  }
  const d = dayInfo(ms, ctx.place);
  const out: Row[] = [];
  if (d.polar === 'day') out.push(['昼(ひる)の長(なが)さ', '24時間(じかん) (白夜(びゃくや)：太陽(たいよう)がしずまない)']);
  else if (d.polar === 'night') out.push(['昼(ひる)の長(なが)さ', '0時間(じかん) (極夜(きょくや)：太陽(たいよう)がのぼらない)']);
  else {
    out.push(['日(ひ)の出(で)', timeLabel(d.rise, tz)], ['日(ひ)の入(い)り', timeLabel(d.set, tz)], ['昼(ひる)の長(なが)さ', hoursLabel(d.daylight)]);
  }
  out.push(['南中高度(なんちゅうこうど)', `${deg(d.noonAlt)} (${timeLabel(d.noon, tz)}ごろ)`]);
  return out;
}

function moonRows(ms: number, ctx: ViewContext): Row[] {
  const { b } = skyNow(ms, ctx);
  const rs = moonRiseSet(ms, ctx.place);
  return [
    ['月(つき)の形(かたち)', `${phaseName(b.phase)} (月齢(げつれい) ${moonAge(ms).toFixed(1)})`],
    ['光(ひか)って見(み)える部分(ぶぶん)', `${Math.round(b.illum * 100)}%`],
    ['月(つき)の出(で)・月(つき)の入(い)り', `${timeLabel(rs.rise, ctx.place.tz)} ・ ${timeLabel(rs.set, ctx.place.tz)}`],
  ];
}

function nextPhases(ms: number, tz: number): Row {
  const list = (['new', 'first', 'full', 'last'] as MoonPhase[]).map((p) => [p, nextPhase(ms, p)] as const).sort((a, b) => a[1] - b[1]);
  return ['つぎの月(つき)の形(かたち)', list.map(([p, t]) => `${PHASE_LABEL[p]} ${shortDate(t, tz)}`).join('、')];
}

export function infoHtml(view: ViewId, ms: number, ctx: ViewContext): string {
  const { place } = ctx;
  const { b, sun, moon } = skyNow(ms, ctx);
  const south = place.lat < 0;
  const where = place.name;
  switch (view) {
    case 'space':
      return rows([
        ['観察(かんさつ)地点(ちてん)', `${where}：${sun.alt > 0 ? '昼(ひる)' : sun.alt > -6 ? '夕方(ゆうがた)か明(あ)け方(がた)' : '夜(よる)'}`],
        ['季節(きせつ)', `${seasonName(b.sun.lon, south)} (${south ? '南半球(みなみはんきゅう)' : '北半球(きたはんきゅう)'})`],
        ['太陽(たいよう)までの距離(きょり)', `約(やく)${(b.sun.dist * 14960).toFixed(0)}万km`],
        ['月(つき)までの距離(きょり)', `約(やく)${(b.moon.dist / 10000).toFixed(1)}万km`],
        ...moonRows(ms, ctx).slice(0, 1),
      ]);
    case 'seasons': {
      const notilt = !!ctx.options.notilt;
      const d = dayInfo(ms, place);
      const noonAlt = notilt ? 90 - Math.abs(place.lat) : d.noonAlt;
      return (
        rows([['観察(かんさつ)地点(ちてん)', where], ['季節(きせつ)', `${seasonName(b.sun.lon, south)}`], ...dayRows(ms, ctx, notilt)]) +
        figure('お昼(ひる)の光(ひかり)の当(あ)たり方(かた)', beamChart(noonAlt)) +
        figure(`${where}の昼(ひる)の長(なが)さ (1年(ねん))`, daylightChart(place, ms, notilt), notilt ? '地軸(ちじく)がかたむいていなければ、一年中(いちねんじゅう)、昼(ひる)と夜(よる)の長(なが)さは同(おな)じです。' : '')
      );
    }
    case 'polar':
      return (
        rows([['観察(かんさつ)地点(ちてん)', `${where} (緯度(いど) ${place.lat.toFixed(1)}°)`], ['いまの太陽(たいよう)の高(たか)さ', deg(sun.alt)], ...dayRows(ms, ctx)]) +
        figure(`${where}の昼(ひる)の長(なが)さ (1年(ねん))`, daylightChart(place, ms))
      );
    case 'ground':
      return (
        (ctx.options.seasonPaths ? LEGEND : '') +
        rows([
          ['観察(かんさつ)地点(ちてん)', where],
          ['太陽(たいよう)', sun.alt > -1 ? `${direction(sun.az)}の空(そら)、高(たか)さ ${deg(sun.alt)}` : '地平線(ちへいせん)の下(した)'],
          ...dayRows(ms, ctx),
          ['月(つき)', moon.alt > -1 ? `${direction(moon.az)}の空(そら)、高(たか)さ ${deg(moon.alt)}` : '地平線(ちへいせん)の下(した)'],
          ...moonRows(ms, ctx),
        ]) +
        figure('いまの太陽(たいよう)の光(ひかり)の当(あ)たり方(かた)', beamChart(sun.alt))
      );
    case 'moon':
      return rows([...moonRows(ms, ctx), nextPhases(ms, place.tz)]);
    case 'tide': {
      const range = tideRange(ms, place.lat, place.lon);
      return (
        rows([
          ['いまの潮(しお)', `${TIDE_LABEL[tideName(b.phase)]} (${phaseName(b.phase)})`],
          ['1日(にち)の満(み)ち引(ひ)きの大(おお)きさ', `${(range * 100 / 1.5).toFixed(0)} (月(つき)だけのときを100とした目安(めやす))`],
          nextPhases(ms, place.tz),
        ]) +
        figure(
          `${where}の海面(かいめん)の高(たか)さ (前後(ぜんご)24時間(じかん))`,
          tideChart(place, ms),
          '計算(けいさん)による目安(めやす)です。実際(じっさい)の海(うみ)では、陸(りく)や海(うみ)の深(ふか)さのせいで、満潮(まんちょう)の時刻(じこく)が数時間(すうじかん)ずれたり、高(たか)さが変(か)わったりします。',
        )
      );
    }
  }
}

/** 日付と時刻の表示 (タイムバーの上) */
export function clockLabel(ms: number, tz: number): HTMLElement {
  const { date, time } = dateTimeLabel(ms, tz);
  return h('p', { class: 'clock-label' }, h('span', { class: 'clock-date' }, date), h('span', { class: 'clock-time' }, time));
}
