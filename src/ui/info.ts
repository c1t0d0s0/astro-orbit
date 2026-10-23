import { localSiderealTime, toHorizontal } from '../astro/coords';
import { eclipseAt, nextEclipse, sunCovered, topocentricMoon, type Eclipse, type EclipseType } from '../astro/eclipse';
import { dayInfo, moonAge, moonRiseSet, nextPhase, type MoonPhase } from '../astro/events';
import { bodiesAt } from '../astro/state';
import { tideName, tideRange } from '../astro/tide';
import type { ViewContext, ViewId } from '../views/types';
import { beamChart, daylightChart, tideChart } from './chart';
import { h, rubyHtml } from './dom';
import { earthInfoHtml } from './infoEarth';
import { figure, rows, type Row } from './infoRows';
import { dateTimeLabel, direction, hoursLabel, phaseName, seasonName, shortDate, timeLabel } from './text';

// 画面ごとの「いまのようす」(数字とグラフ)。時刻が変わるたびに書きなおす (再生中は 1 秒に数回まで)


const TIDE_LABEL = { spring: '大潮(おおしお)', middle: '中潮(なかしお)', neap: '小潮(こしお)' };
const PHASE_LABEL: Record<MoonPhase, string> = { new: '新月(しんげつ)', first: '上弦(じょうげん)', full: '満月(まんげつ)', last: '下弦(かげん)' };


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
  // 月は、観察地点から見た位置 (視差で 1° ほど低く見える)
  return { b, lst, sun: toHorizontal(b.sun, ctx.place.lat, lst), moon: toHorizontal(topocentricMoon(b, ctx.place.lat, lst), ctx.place.lat, lst) };
}

const SOLAR_NAME: Record<EclipseType, string> = {
  total: '皆既日食(かいきにっしょく)',
  annular: '金環日食(きんかんにっしょく)',
  partial: '部分日食(ぶぶんにっしょく)',
  penumbral: '部分日食(ぶぶんにっしょく)',
};
const LUNAR_NAME: Record<EclipseType, string> = {
  total: '皆既月食(かいきげっしょく)',
  annular: '皆既月食(かいきげっしょく)',
  partial: '部分月食(ぶぶんげっしょく)',
  penumbral: '半影月食(はんえいげっしょく)',
};

/** 次の日食・月食 (探すのに少し時間がかかるので、同じ日のあいだは前の結果を使う) */
const eclipseCache = new Map<string, Eclipse>();
function nextOf(ms: number, kind: 'solar' | 'lunar'): Eclipse {
  const key = `${kind}:${Math.floor(ms / 86_400_000)}`;
  let e = eclipseCache.get(key);
  if (!e || e.ms <= ms) {
    e = nextEclipse(ms, kind);
    eclipseCache.set(key, e);
  }
  return e;
}

function eclipseRows(ms: number, tz: number): Row[] {
  const solar = nextOf(ms, 'solar');
  const lunar = nextOf(ms, 'lunar');
  const nowSolar = eclipseAt(ms, 'solar');
  const nowLunar = eclipseAt(ms, 'lunar');
  const now = nowSolar
    ? `日食(にっしょく)が起(お)きている (地球(ちきゅう)のどこかで${SOLAR_NAME[nowSolar]})`
    : nowLunar && nowLunar !== 'penumbral'
      ? `${LUNAR_NAME[nowLunar]}が起(お)きている`
      : '食(しょく)は起(お)きていない';
  const fmt = (e: Eclipse, names: Record<EclipseType, string>) => `${dateTimeLabel(e.ms, tz).date} ${dateTimeLabel(e.ms, tz).time}ごろ ${names[e.type]}`;
  return [
    ['いま', now],
    ['つぎの日食(にっしょく)', `${fmt(solar, SOLAR_NAME)} (見(み)える場所(ばしょ)はかぎられる)`],
    ['つぎの月食(げっしょく)', `${fmt(lunar, LUNAR_NAME)} (月(つき)が出(で)ている場所(ばしょ)ならどこでも見(み)える)`],
  ];
}

const latLabel = (lat: number) => (Math.abs(lat) < 0.05 ? '赤道(せきどう) (0°)' : lat > 0 ? `北緯(ほくい) ${lat.toFixed(1)}°` : `南緯(なんい) ${(-lat).toFixed(1)}°`);

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
  const earth = earthInfoHtml(view, ms, ctx);
  if (earth !== null) return earth;
  const { place } = ctx;
  const { b, sun, moon, lst } = skyNow(ms, ctx);
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
        rows([
          ['観察(かんさつ)地点(ちてん)', `${where} (緯度(いど) ${place.lat.toFixed(1)}°)`],
          ['いまの太陽(たいよう)の高(たか)さ', deg(sun.alt)],
          ...dayRows(ms, ctx),
          ['太陽(たいよう)が真上(まうえ)に来(く)る緯度(いど)', latLabel(b.sun.dec)],
        ]) +
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
          ...groundEclipse(ms, ctx, lst, sun.alt, moon.alt),
        ]) +
        figure('いまの太陽(たいよう)の光(ひかり)の当(あ)たり方(かた)', beamChart(sun.alt))
      );
    case 'eclipse':
      return rows([
        ['月(つき)の形(かたち)', phaseName(b.phase)],
        ['月(つき)の黄道(こうどう)からのずれ', `${b.moon.lat >= 0 ? '北' : '南'}へ ${Math.abs(b.moon.lat).toFixed(1)}° (画面(がめん)では5倍(ばい)にかいています)`],
        ...eclipseRows(ms, place.tz),
      ]);
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
     default:
      return '';
  }
}

/** 地上から見た日食・月食 (起きているときだけ) */
function groundEclipse(ms: number, ctx: ViewContext, lst: number, sunAlt: number, moonAlt: number): Row[] {
  const out: Row[] = [];
  const covered = sunAlt > -1 ? sunCovered(ms, ctx.place.lat, lst) : 0;
  if (covered > 0.001) out.push(['日食(にっしょく)', `太陽(たいよう)の ${Math.round(covered * 100)}% がかくれている`]);
  const lunar = eclipseAt(ms, 'lunar');
  if (lunar && moonAlt > -1) out.push(['月食(げっしょく)', `${LUNAR_NAME[lunar]}のとちゅう`]);
  return out;
}

/** 日付と時刻の表示 (タイムバーの上) */
export function clockLabel(ms: number, tz: number): HTMLElement {
  const { date, time } = dateTimeLabel(ms, tz);
  return h('p', { class: 'clock-label' }, h('span', { class: 'clock-date' }, date), h('span', { class: 'clock-time' }, time));
}
