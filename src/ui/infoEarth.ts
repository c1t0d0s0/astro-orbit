import { OMORI_K, VP, VS } from '../earth/quake';
import { SOURCE_KM, depthAt, frontAt, greenHeight, kmh, travelTime, tsunamiSpeed } from '../earth/tsunami';
import { STATIONS, eruption, stationTimes } from '../views/solid';
import type { ViewContext, ViewId } from '../views/types';
import { seismoChart } from './chartEarth';
import { rubyHtml } from './dom';
import { figure, note, rows, type Row } from './infoRows';
import { VIEWS, elapsedLabel } from './text';

// 地学の画面の「いまのようす」。地学の画面でなければ null (info.ts が天体の画面の分を出す)

const sec = (s: number) => `${s.toFixed(1)}秒(びょう)`;

function quakeInfo(ms: number): string {
  const t = ms / 1000;
  const list = STATIONS.map((_, i) => stationTimes(i));
  const table: Row[] = list.map((s) => {
    const state = t < s.p ? 'まだゆれていない' : t < s.s ? '初期微動(しょきびどう) (小(ちい)さなゆれ)' : '主要動(しゅようどう) (大(おお)きなゆれ)';
    return [`${s.name}地点(ちてん) (${Math.round(s.d)} km)`, t >= s.p ? `${state}。初期微動継続時間(しょきびどうけいぞくじかん) ${sec(s.s - s.p)}` : state];
  });
  return (
    rows([
      ['地震(じしん)が起(お)きてから', `${t.toFixed(1)}秒(びょう)`],
      ['P波(は)が届(とど)いた範囲(はんい)', `震源(しんげん)から${Math.round(VP * t)} km (秒速(びょうそく)${VP} km)`],
      ['S波(は)が届(とど)いた範囲(はんい)', `震源(しんげん)から${Math.round(VS * t)} km (秒速(びょうそく)${VS} km)`],
      ['地点(ちてん) (震源(しんげん)からの距離(きょり))', 'ゆれ'],
      ...table,
    ]) +
    figure(
      '地震計(じしんけい)の記録(きろく)',
      seismoChart(list, t, 120),
      `黄色(きいろ)の線(せん)がP波(は)、赤(あか)い線(せん)がS波(は)の着(つ)いた時刻(じこく)。その間(あいだ)が初期微動継続時間(しょきびどうけいぞくじかん)で、震源(しんげん)から遠(とお)いほど長(なが)くなります (震源(しんげん)までの距離(きょり) ≒ ${OMORI_K.toFixed(1)} × 初期微動継続時間(しょきびどうけいぞくじかん))。`,
    )
  );
}

function tsunamiInfo(ms: number): string {
  const t = ms / 1000;
  const km = frontAt(t);
  const arrive = travelTime(0, SOURCE_KM);
  const list: Row[] = [['海底(かいてい)が持(も)ち上(あ)がってから', elapsedLabel(ms, 3_600_000)]];
  if (km > 0.5) {
    const h = depthAt(km);
    const v = tsunamiSpeed(h);
    list.push(
      ['津波(つなみ)の先頭(せんとう)', `海岸(かいがん)から約(やく)${Math.round(km)} km`],
      ['そこの海(うみ)の深(ふか)さ', `約(やく)${h >= 1000 ? Math.round(h / 100) * 100 : Math.round(h)} m`],
      ['進(すす)む速(はや)さ', `秒速(びょうそく)約(やく)${Math.round(v)} m (時速(じそく)約(やく)${Math.round(kmh(v) / 10) * 10} km)`],
      ['津波(つなみ)の高(たか)さ (目安(めやす))', `約(やく)${greenHeight(1, depthAt(SOURCE_KM), h).toFixed(1)} m`],
      ['海岸(かいがん)に着(つ)くまで', `あと約(やく)${Math.max(1, Math.round((arrive - t) / 60))}分(ぷん)`],
    );
  } else list.push(['津波(つなみ)の先頭(せんとう)', `海岸(かいがん)に着(つ)いた (起(お)きてから約(やく)${Math.round(arrive / 60)}分(ぷん))`]);
  return (
    rows(list) +
    note('速(はや)さは √(9.8 × 深(ふか)さ) m/秒(びょう)。深(ふか)さ4000 mの海(うみ)ではジェット機(き)なみに速(はや)く、海岸(かいがん)の近(ちか)くでおそくなると、うしろの波(なみ)が追(お)いついて高(たか)くなります。津波(つなみ)は何回(なんかい)もくり返(かえ)しおし寄(よ)せ、2回目(かいめ)以降(いこう)のほうが高(たか)いこともあります。')
  );
}

const VOLCANO_ROWS: [string, string, string, string, string][] = [
  ['たて状(じょう)火山(かざん)', '弱(よわ)い', 'おだやかに溶岩(ようがん)が流(なが)れ出(だ)す', '黒(くろ)っぽい', 'マウナロア (ハワイ)'],
  ['成層火山(せいそうかざん)', '中(ちゅう)くらい', '溶岩(ようがん)と火山灰(かざんばい)を交互(こうご)に出(だ)す', '中間(ちゅうかん)', '富士山(ふじさん)・桜島(さくらじま)'],
  ['溶岩(ようがん)ドーム', '強(つよ)い', '激(はげ)しく爆発(ばくはつ)する。火砕流(かさいりゅう)も', '白(しろ)っぽい', '昭和新山(しょうわしんざん)・雲仙(うんぜん)普賢岳(ふげんだけ)'],
];

function volcanoInfo(ms: number): string {
  const hour = ms / 3_600_000;
  const state =
    eruption('dome', ms / 1000).rise < 1
      ? 'マグマが火道(かどう)を上(あ)がってきている'
      : hour < 8
        ? '噴火(ふんか)が始(はじ)まった。溶岩(ようがん)ドームはふくらんでいる'
        : hour < 12
          ? '溶岩(ようがん)ドームが爆発(ばくはつ)し、くずれて火砕流(かさいりゅう)が起(お)きた'
          : '噴火(ふんか)がおさまってきた。溶岩(ようがん)は冷(ひ)えて固(かた)まっていく';
  const r = rubyHtml;
  const table = `<table class="info-table"><thead><tr><th></th><th>ねばりけ</th><th>${r('噴火(ふんか)')}</th><th>${r('色(いろ)')}</th></tr></thead><tbody>${VOLCANO_ROWS.map(
    ([n, v, how, color, ex]) => `<tr><th>${r(n)}<small>${r(ex)}</small></th><td>${r(v)}</td><td>${r(how)}</td><td>${r(color)}</td></tr>`,
  ).join('')}</tbody></table>`;
  return rows([['はじまりから', elapsedLabel(ms, 86_400_000)], ['いま', state]]) + figure('マグマのねばりけと火山(かざん)', table);
}

export function earthInfoHtml(view: ViewId, ms: number, _ctx: ViewContext): string | null {
  switch (view) {
    case 'quake':
      return quakeInfo(ms);
    case 'tsunami':
      return tsunamiInfo(ms);
    case 'volcano':
      return volcanoInfo(ms);
    default:
      return VIEWS[view].group === 'sky' ? null : '';
  }
}
