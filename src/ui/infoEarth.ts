import { localSiderealTime, toHorizontal } from '../astro/coords';
import { bodiesAt } from '../astro/state';
import { cloudBase, envFreezing, envTemp, humidity, parcelFreezing, parcelTemp, precipType } from '../earth/air';
import { auroraSky, geomagLat, ovalLat } from '../earth/aurora';
import { rainbowAngle, rainbowTop } from '../earth/optics';
import { OMORI_K, VP, VS } from '../earth/quake';
import { SOURCE_KM, depthAt, frontAt, greenHeight, kmh, travelTime, tsunamiSpeed } from '../earth/tsunami';
import { maxWind, strengthName, typhoonAt } from '../earth/typhoon';
import { STATIONS, eruption, stationTimes } from '../views/solid';
import { RAIN, flood } from '../views/water';
import { CLOUD_T, STORM_T, airOf, cloudTop, parcelHeight, stormStage } from '../views/weather';
import type { ViewContext, ViewId } from '../views/types';
import { airChart, seismoChart } from './chartEarth';
import { rubyHtml } from './dom';
import { figure, note, rows, type Row } from './infoRows';
import { VIEWS, direction, elapsedLabel } from './text';

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

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;

function cloudInfo(ms: number, ctx: ViewContext): string {
  const t = ms / 1000;
  const winter = !!ctx.options.winter;
  const { t0, dew } = airOf(winter);
  const base = cloudBase(t0, dew);
  const z = parcelHeight(t, winter);
  const rising = t < CLOUD_T.rise;
  const state =
    t < CLOUD_T.rise * 0.6
      ? '空気(くうき)のかたまりが上(あ)がって冷(ひ)えている'
      : t < CLOUD_T.rain
        ? '雲(くも)ができて、上(うえ)へ育(そだ)っている'
        : t < CLOUD_T.stop
          ? precipType(t0) === 'snow'
            ? '雪(ゆき)がふっている'
            : '雨(あめ)がふっている'
          : 'ふりやんだ';
  const list: Row[] = [
    ['はじまりから', elapsedLabel(ms, 7_200_000)],
    ['いま', state],
    ['地上(ちじょう)の空気(くうき)', `気温(きおん) ${t0}℃・露点(ろてん) ${dew}℃・湿度(しつど) 約(やく)${Math.round(humidity(t0, dew))}%`],
  ];
  if (rising) list.push(['空気(くうき)のかたまり', `高(たか)さ ${km(z)}・${Math.round(parcelTemp(z, t0, dew))}℃`]);
  list.push(
    ['雲(くも)ができはじめる高(たか)さ', `約(やく)${km(base)} (気温(きおん)が露点(ろてん)まで下(さ)がる高(たか)さ)`],
    ['雲(くも)のてっぺん', t > CLOUD_T.rise * 0.6 ? `約(やく)${km(cloudTop(t, winter))}` : 'まだ雲(くも)はない'],
    ['雲(くも)の中(なか)で氷(こおり)になる高(たか)さ', `約(やく)${km(parcelFreezing(t0, dew))}より上(うえ)`],
    ['まわりの空気(くうき)が0℃の高(たか)さ', envFreezing(t0) > 50 ? `約(やく)${km(envFreezing(t0))}` : '地上(ちじょう)でも0℃近(ちか)く'],
  );
  return (
    rows(list) +
    figure(
      '高(たか)さと気温(きおん)',
      airChart(t0, dew, rising ? z : null, (h) => envTemp(h, t0), (h) => parcelTemp(h, t0, dew), base),
      '赤(あか)い線(せん)が上(あ)がる空気(くうき)のかたまり、灰色(はいいろ)の線(せん)がまわりの空気(くうき)。雲(くも)ができるまでは100mで約(やく)1℃、雲(くも)の中(なか)では約(やく)0.5℃下(さ)がります。かたまりのほうが暖(あたた)かいあいだは、軽(かる)いので上(あ)がり続(つづ)けます。',
    )
  );
}

function stormInfo(ms: number): string {
  const t = ms / 1000;
  const stage = stormStage(t);
  const list: Row[] = [
    ['はじまりから', elapsedLabel(ms, 3_600_000)],
    ['積乱雲(せきらんうん)', stage === 'growing' ? '発達(はったつ)中(ちゅう) (強(つよ)い上昇気流(じょうしょうきりゅう))' : stage === 'mature' ? 'いちばん強(つよ)い (大雨(おおあめ)・雷(かみなり))' : 'おとろえている (下降気流(かこうきりゅう)が強(つよ)い)'],
    ['雷(かみなり)', t >= STORM_T.bolt[0] && t < STORM_T.bolt[1] ? '光(ひか)っている' : 'なし'],
    ['竜巻(たつまき)', t >= STORM_T.tornado[0] && t < STORM_T.tornado[1] ? '発生(はっせい)している' : 'なし'],
  ];
  return (
    rows(list) +
    note(
      '雷(かみなり)が光(ひか)ってから音(おと)が聞(き)こえるまでの秒数(びょうすう) × 340 m が、雷(かみなり)までのおよその距離(きょり)です (音(おと)は1秒(びょう)に約(やく)340m進(すす)む)。ゴロゴロと聞(き)こえたら、すぐに建物(たてもの)や車(くるま)の中(なか)へ。',
    )
  );
}

const latLon = (lat: number, lon: number) => `${lat >= 0 ? '北緯(ほくい)' : '南緯(なんい)'}${Math.abs(lat).toFixed(0)}°・${lon >= 0 ? '東経(とうけい)' : '西経(せいけい)'}${Math.abs(lon).toFixed(0)}°`;

function typhoonInfo(ms: number): string {
  const day = ms / 86_400_000;
  const s = typhoonAt(day);
  const next = typhoonAt(day + 0.25);
  // 進む向き (北から時計回りの方位)
  const az = (Math.atan2((next.lon - s.lon) * Math.cos((s.lat * Math.PI) / 180), next.lat - s.lat) * 180) / Math.PI;
  const wind = maxWind(s.pressure);
  const state = !s.alive ? (day < 1 ? '熱帯低気圧(ねったいていきあつ) (まだ台風(たいふう)ではない)' : '温帯低気圧(おんたいていきあつ)に変(か)わった') : `${strengthName(wind)}台風(たいふう)`;
  return (
    rows([
      ['はじまりから', elapsedLabel(ms, 10 * 86_400_000)],
      ['いま', state],
      ['中心(ちゅうしん)の位置(いち)', latLon(s.lat, s.lon)],
      ['中心気圧(ちゅうしんきあつ)', `${Math.round(s.pressure)} hPa`],
      ['最大風速(さいだいふうそく) (目安(めやす))', `秒速(びょうそく)約(やく)${wind} m`],
      ['進(すす)む向(む)き', `${direction(((az % 360) + 360) % 360)}へ`],
    ]) +
    note(
      '中心付近(ちゅうしんふきん)の最大風速(さいだいふうそく)が秒速(びょうそく)17.2m以上(いじょう)になった熱帯低気圧(ねったいていきあつ)を台風(たいふう)といいます。暖(あたた)かい海(うみ)からの水蒸気(すいじょうき)がエネルギーのもとなので、日本(にほん)の近(ちか)くの冷(つめ)たい海(うみ)や陸(りく)に来(く)ると弱(よわ)まります。',
    )
  );
}

function rainbowInfo(ms: number, ctx: ViewContext): string {
  const b = bodiesAt(ms);
  const sun = toHorizontal(b.sun, ctx.place.lat, localSiderealTime(b.gmst, ctx.place.lon));
  const top = rainbowTop(sun.alt);
  const anti = (sun.az + 180) % 360;
  const see =
    sun.alt < -1
      ? '見(み)えない (太陽(たいよう)が地平線(ちへいせん)の下(した))'
      : top <= 0
        ? `見(み)えない (太陽(たいよう)が${Math.round(rainbowAngle(1.333))}°より高(たか)いので、虹(にじ)は地平線(ちへいせん)の下(した))`
        : `${direction(anti)}の空(そら)に見(み)える (てっぺんの高(たか)さ 約(やく)${Math.round(top)}°)`;
  return (
    rows([
      ['観察(かんさつ)地点(ちてん)', ctx.place.name],
      ['太陽(たいよう)', sun.alt > -1 ? `${direction(sun.az)}の空(そら)、高(たか)さ ${Math.round(sun.alt)}°` : '地平線(ちへいせん)の下(した)'],
      ['虹(にじ)', see],
    ]) +
    note('虹(にじ)は、太陽(たいよう)と反対(はんたい)の点(てん) (対日点(たいじつてん)) を中心(ちゅうしん)にした半径(はんけい)約(やく)42°の円(えん)の上(うえ)に見(み)えます。太陽(たいよう)が低(ひく)い朝(あさ)や夕方(ゆうがた)ほど、虹(にじ)は高(たか)く大(おお)きく見(み)えます。')
  );
}

const REACH_ROWS: [string, string, string, string][] = [
  ['上流(じょうりゅう)', '速(はや)い。川(かわ)はばはせまい', '大(おお)きく角(かど)ばった石(いし)', 'けずるはたらき (しん食(しょく)) が大(おお)きい。V字谷(じこく)'],
  ['中流(ちゅうりゅう)', 'ややゆるやか', '丸(まる)みのある石(いし)・砂利(じゃり)', '運(はこ)ぶはたらき (運搬(うんぱん))。扇状地(せんじょうち)・川原(かわら)'],
  ['下流(かりゅう)', 'ゆるやか。川(かわ)はばは広(ひろ)い', '小(ちい)さく丸(まる)い石(いし)・砂(すな)・どろ', '積(つ)もらせるはたらき (たい積(せき)) が大(おお)きい。三角州(さんかくす)'],
];

function riverInfo(ms: number): string {
  const t = ms / 1000;
  const f = flood(t);
  const weather = t >= RAIN[0] && t < RAIN[1] ? '山(やま)で大雨(おおあめ)がふっている' : t < RAIN[0] ? '晴(は)れ' : '雨(あめ)はやんだ';
  const r = rubyHtml;
  const table = `<table class="info-table"><thead><tr><th></th><th>${r('流(なが)れ')}</th><th>${r('石(いし)')}</th><th>${r('おもなはたらき')}</th></tr></thead><tbody>${REACH_ROWS.map(
    ([n, flow, stone, work]) => `<tr><th>${r(n)}</th><td>${r(flow)}</td><td>${r(stone)}</td><td>${r(work)}</td></tr>`,
  ).join('')}</tbody></table>`;
  return (
    rows([
      ['はじまりから', elapsedLabel(ms, 2 * 86_400_000)],
      ['天気(てんき)', weather],
      ['川(かわ)の水(みず)の量(りょう)', f > 0.05 ? `ふだんの約(やく)${(1 + 5 * f).toFixed(0)}倍(ばい) (増水(ぞうすい)している)` : 'ふだんどおり'],
      ['流(なが)れる速(はや)さ', f > 0.05 ? 'ふだんより速(はや)い。大(おお)きな石(いし)も転(ころ)がって運(はこ)ばれる' : 'ふだんどおり'],
    ]) +
    figure('上流(じょうりゅう)・中流(ちゅうりゅう)・下流(かりゅう)のちがい', table) +
    note('川(かわ)が曲(ま)がっているところでは、外(そと)がわは流(なが)れが速(はや)くて深(ふか)くけずられ (がけになる)、内(うち)がわは流(なが)れがおそくて石(いし)や砂(すな)が積(つ)もります (川原(かわら)になる)。')
  );
}

function currentInfo(ms: number): string {
  return (
    rows([
      ['はじまりから', elapsedLabel(ms, 365 * 86_400_000)],
      ['暖流(だんりゅう) (赤(あか))', '赤道(せきどう)に近(ちか)い暖(あたた)かい海(うみ)から流(なが)れてくる海流(かいりゅう)'],
      ['寒流(かんりゅう) (青(あお))', '北極(ほっきょく)や南極(なんきょく)に近(ちか)い冷(つめ)たい海(うみ)から流(なが)れてくる海流(かいりゅう)'],
      ['黒潮(くろしお)', '日本(にほん)の南(みなみ)を北東(ほくとう)へ流(なが)れる暖流(だんりゅう)。はば約(やく)100km、速(はや)いところで秒速(びょうそく)約(やく)2m'],
      ['親潮(おやしお)', '千島列島(ちしまれっとう)から南(みなみ)へ流(なが)れる寒流(かんりゅう)。栄養分(えいようぶん)が多(おお)く、プランクトンや魚(さかな)が多(おお)い'],
    ]) +
    note('黒潮(くろしお)と親潮(おやしお)がぶつかる三陸沖(さんりくおき)の「潮目(しおめ)」は、世界(せかい)有数(ゆうすう)の漁場(ぎょじょう)です。暖流(だんりゅう)が流(なが)れる近(ちか)くの陸地(りくち)は、冬(ふゆ)でも比較的(ひかくてき)暖(あたた)かくなります。')
  );
}

function auroraInfo(ms: number, ctx: ViewContext): string {
  const b = bodiesAt(ms);
  const { lat, lon, name } = ctx.place;
  const sun = toHorizontal(b.sun, lat, localSiderealTime(b.gmst, lon));
  const storm = !!ctx.options.storm;
  const m = geomagLat(lat, lon);
  const sky = auroraSky(m, sun.alt, storm);
  const dark = sun.alt <= -10;
  return (
    rows([
      ['観察(かんさつ)地点(ちてん)', name],
      ['地磁気緯度(ちじききど)', `${m >= 0 ? '北' : '南'} ${Math.abs(m).toFixed(0)}° (オーロラの輪(わ)は約(やく)${ovalLat(storm)}°)`],
      ['空(そら)の明(あか)るさ', dark ? '暗(くら)い夜(よる)' : sun.alt > 0 ? '昼(ひる)' : '夕方(ゆうがた)か明(あ)け方(がた) (まだ明(あか)るい)'],
      ['オーロラ', sky === 'overhead' ? '頭(あたま)の上(うえ)に見(み)えそう' : sky === 'low' ? '低(ひく)い空(そら)に見(み)えそう' : dark ? 'この場所(ばしょ)からは見(み)えない' : '空(そら)が明(あか)るくて見(み)えない'],
    ]) +
    note(
      'オーロラの色(いろ)は、光(ひか)る空気(くうき)の種類(しゅるい)と高(たか)さで決(き)まります。高(たか)さ100〜200kmの酸素(さんそ)は緑(みどり)、200km以上(いじょう)の酸素(さんそ)は赤(あか)、窒素(ちっそ)はピンクやむらさきに光(ひか)ります。オーロラの強(つよ)さは太陽(たいよう)の活動(かつどう)で変(か)わるので、この画面(がめん)の「見(み)えそう」は目安(めやす)です。',
    )
  );
}

export function earthInfoHtml(view: ViewId, ms: number, ctx: ViewContext): string | null {
  switch (view) {
    case 'aurora':
      return auroraInfo(ms, ctx);
    case 'river':
      return riverInfo(ms);
    case 'current':
      return currentInfo(ms);
    case 'cloud':
      return cloudInfo(ms, ctx);
    case 'storm':
      return stormInfo(ms);
    case 'typhoon':
      return typhoonInfo(ms);
    case 'rainbow':
      return rainbowInfo(ms, ctx);
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
