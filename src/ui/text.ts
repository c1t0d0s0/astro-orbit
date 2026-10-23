import type { Span } from '../core/clock';
import type { ViewId } from '../views/types';

// 画面に出す文。「漢字(かんじ)」と書くと、説明が「かんたん」のときにふりがなが付く

/** ホームで、解説と画面を分けて並べる分野 */
export type ViewGroup = 'sky' | 'weather' | 'water' | 'solid' | 'space';

export const GROUPS: readonly { id: ViewGroup; title: string }[] = [
  { id: 'sky', title: '太陽(たいよう)・地球(ちきゅう)・月(つき)' },
  { id: 'weather', title: '天気(てんき)と空(そら)' },
  { id: 'water', title: '川(かわ)と海(うみ)' },
  { id: 'solid', title: '大地(だいち)の動(うご)き' },
  { id: 'space', title: '空(そら)の上(うえ)と宇宙(うちゅう)' },
];

/**
 * 現象の時間。雲のでき方や地震の波のように、日時に結びつかない現象の画面では、
 * 時刻 (ms) を「はじまりからの時間」として使う
 */
export interface Timeline {
  /** はじまりからおわりまで (ms) */
  length: number;
  /** えらべる速さ (SPEEDS の key) */
  speeds: readonly string[];
}

export interface ViewMeta {
  title: string;
  lead: string;
  group: ViewGroup;
  /** 時間のはじめの設定 (現象の時間の画面では span は使わない) */
  span: Span;
  speed: string;
  camera: string;
  /** あれば、日時ではなく現象の時間で動く */
  timeline?: Timeline;
  /** 3D の画面の下に出す注意書き。なければ、大きさと距離を縮めていることと操作のしかた */
  note?: string;
}

export const DEFAULT_NOTE = '大(おお)きさと距離(きょり)は、見(み)やすく縮(ちぢ)めています。ドラッグで回(まわ)す・2本指(ほんゆび)やホイールで拡大(かくだい)';

export const VIEWS: Record<ViewId, ViewMeta> = {
  space: {
    group: 'sky',
    title: '宇宙(うちゅう)から見(み)た太陽(たいよう)・地球(ちきゅう)・月(つき)',
    lead: '地球(ちきゅう)は自転(じてん)しながら太陽(たいよう)のまわりを回(まわ)り、月(つき)は地球(ちきゅう)のまわりを回(まわ)っています。',
    span: 'month',
    speed: 'qday',
    camera: 'whole',
  },
  seasons: {
    group: 'sky',
    title: '季節(きせつ)と地軸(ちじく)のかたむき',
    lead: '地軸(ちじく)はいつも同(おな)じ向(む)きにかたむいたまま、地球(ちきゅう)は1年(ねん)で太陽(たいよう)のまわりを1周(しゅう)します。',
    span: 'year',
    speed: 'week',
    camera: 'whole',
  },
  polar: {
    group: 'sky',
    title: '白夜(びゃくや)と極夜(きょくや)',
    lead: '北極(ほっきょく)や南極(なんきょく)の近(ちか)くでは、一日中(いちにちじゅう)しずまない太陽(たいよう)や、一日中(いちにちじゅう)のぼらない太陽(たいよう)が見(み)られます。',
    span: 'day',
    speed: 'hour',
    camera: 'side',
  },
  ground: {
    group: 'sky',
    title: '地上(ちじょう)から見(み)た空(そら)',
    lead: '太陽(たいよう)・月(つき)・星(ほし)が、空(そら)をどう動(うご)いて見(み)えるかをたしかめます。場所(ばしょ)や季節(きせつ)を変(か)えてみよう。',
    span: 'day',
    speed: 'min',
    camera: 'outside',
    note: 'ドラッグで回(まわ)す・見回(みまわ)す',
  },
  moon: {
    group: 'sky',
    title: '月(つき)の満(み)ち欠(か)け',
    lead: '月(つき)は太陽(たいよう)の光(ひかり)を反射(はんしゃ)して光(ひか)っています。地球(ちきゅう)のまわりを回(まわ)ると、光(ひか)って見(み)える部分(ぶぶん)が変(か)わります。',
    span: 'month',
    speed: 'qday',
    camera: 'top',
  },
  eclipse: {
    group: 'sky',
    title: '日食(にっしょく)と月食(げっしょく)',
    lead: '太陽(たいよう)・地球(ちきゅう)・月(つき)が一直線(いっちょくせん)にならぶと、月(つき)や地球(ちきゅう)の影(かげ)が落(お)ちて、日食(にっしょく)や月食(げっしょく)が起(お)こります。',
    span: 'month',
    speed: 'qday',
    camera: 'tilt',
    note: '地球(ちきゅう)・月(つき)の大(おお)きさと、月(つき)の通(とお)り道(みち)のかたむきを強調(きょうちょう)しているので、この画面(がめん)では食(しょく)が本当(ほんとう)より長(なが)く続(つづ)きます。時刻(じこく)は「いまのようす」で',
  },
  tide: {
    group: 'sky',
    title: '潮(しお)の満(み)ち引(ひ)き',
    lead: '海(うみ)の水(みず)は、月(つき)と太陽(たいよう)に引(ひ)かれて、地球(ちきゅう)の2か所(しょ)でふくらみます。',
    span: 'month',
    speed: 'hour',
    camera: 'top',
  },
  cloud: {
    group: 'weather',
    title: '雲(くも)のでき方(かた)と雨(あめ)・雪(ゆき)',
    lead: 'あたためられた空気(くうき)が上(あ)がると、ふくらんで冷(ひ)え、水蒸気(すいじょうき)が水(みず)や氷(こおり)のつぶになって雲(くも)ができます。',
    span: 'day',
    speed: 'min1',
    camera: 'side',
    timeline: { length: 7_200_000, speeds: ['min1', 'min'] },
    note: '1目盛(めも)りは高(たか)さ1km。雲(くも)つぶや雨(あめ)つぶは、見(み)えるように大(おお)きくかいています',
  },
  storm: {
    group: 'weather',
    title: '積乱雲(せきらんうん)と雷(かみなり)・竜巻(たつまき)',
    lead: '強(つよ)い上昇気流(じょうしょうきりゅう)で、雲(くも)が高(たか)さ10km以上(いじょう)にまでのびた積乱雲(せきらんうん)。大雨(おおあめ)・雷(かみなり)・竜巻(たつまき)を起(お)こします。',
    span: 'day',
    speed: 'min1',
    camera: 'side',
    timeline: { length: 3_600_000, speeds: ['sec10', 'min1', 'min'] },
    note: '1目盛(めも)りは約(やく)1km。竜巻(たつまき)は大(おお)きくかいています。雷(かみなり)は止(と)めていても光(ひか)ります',
  },
  typhoon: {
    group: 'weather',
    title: '台風(たいふう)の一生(いっしょう)',
    lead: '暖(あたた)かい海(うみ)で生(う)まれた台風(たいふう)が、うずをまきながら進(すす)み、向(む)きを変(か)えていくようすを見(み)ます。',
    span: 'day',
    speed: 'qday',
    camera: 'space',
    timeline: { length: 10 * 86_400_000, speeds: ['hour', 'qday', 'day'] },
    note: 'よくある進(すす)み方(かた)をもとにした例(れい)です。台風(たいふう)の雲(くも)は少(すこ)し大(おお)きくかいています',
  },
  rainbow: {
    group: 'weather',
    title: '虹(にじ)の見(み)える場所(ばしょ)',
    lead: '虹(にじ)は、太陽(たいよう)を背(せ)にして、雨(あめ)がふっている方向(ほうこう)に見(み)えます。本当(ほんとう)の日時(にちじ)の太陽(たいよう)の位置(いち)で、虹(にじ)の高(たか)さをたしかめます。',
    span: 'day',
    speed: 'min',
    camera: 'behind',
    note: '雨(あめ)はいつもふっていることにしています。ドラッグで回(まわ)す・2本指(ほんゆび)やホイールで拡大(かくだい)',
  },
  river: {
    group: 'water',
    title: '流(なが)れる水(みず)のはたらき',
    lead: '川(かわ)の水(みず)は、土地(とち)をけずり、石(いし)や砂(すな)を運(はこ)び、積(つ)もらせます。山(やま)から海(うみ)まで、川(かわ)と土地(とち)のようすを見(み)ます。',
    span: 'day',
    speed: 'hour',
    camera: 'whole',
    timeline: { length: 2 * 86_400_000, speeds: ['min', 'hour', 'qday'] },
    note: '横(よこ)の1目盛(めも)りは約(やく)1km。高(たか)さや川(かわ)はばは強調(きょうちょう)しています。ドラッグで回(まわ)す・2本指(ほんゆび)やホイールで拡大(かくだい)',
  },
  current: {
    group: 'water',
    title: '海流(かいりゅう)',
    lead: '海(うみ)の水(みず)は、決(き)まった向(む)きに大(おお)きく流(なが)れています。暖(あたた)かい暖流(だんりゅう)と冷(つめ)たい寒流(かんりゅう)が、日本(にほん)のまわりにも流(なが)れています。',
    span: 'day',
    speed: 'week',
    camera: 'japan',
    timeline: { length: 365 * 86_400_000, speeds: ['day', 'week', 'month'] },
    note: '流(なが)れの速(はや)さは、本当(ほんとう)よりずっと速(はや)くしています。通(とお)り道(みち)は目安(めやす)です',
  },
  quake: {
    group: 'solid',
    title: '地震(じしん)のゆれの伝(つた)わり方(かた)',
    lead: '地下(ちか)で岩盤(がんばん)がずれると、P波(は)とS波(は)の2つの波(なみ)がまわりに広(ひろ)がります。速(はや)いP波(は)が先(さき)に着(つ)きます。',
    span: 'day',
    speed: 'real',
    camera: 'tilt',
    timeline: { length: 120_000, speeds: ['real', 'sec10'] },
    note: '1目盛(めも)りは実際(じっさい)の約(やく)20km。ドラッグで回(まわ)す・2本指(ほんゆび)やホイールで拡大(かくだい)',
  },
  tsunami: {
    group: 'solid',
    title: '津波(つなみ)の伝(つた)わり方(かた)',
    lead: '海(うみ)の底(そこ)が持(も)ち上(あ)がると、海(うみ)の水(みず)全体(ぜんたい)が動(うご)いて津波(つなみ)になります。深(ふか)い海(うみ)ほど速(はや)く進(すす)みます。',
    span: 'day',
    speed: 'min1',
    camera: 'tilt',
    timeline: { length: 3_600_000, speeds: ['sec10', 'min1', 'min'] },
    note: '海(うみ)の深(ふか)さは約(やく)10倍(ばい)、津波(つなみ)の高(たか)さはもっと大(おお)きく強調(きょうちょう)しています。ドラッグで回(まわ)す・2本指(ほんゆび)やホイールで拡大(かくだい)',
  },
  volcano: {
    group: 'solid',
    title: '火山(かざん)とマグマのねばりけ',
    lead: 'マグマのねばりけによって、火山(かざん)の形(かたち)や噴火(ふんか)のしかた、溶岩(ようがん)の色(いろ)がちがいます。',
    span: 'day',
    speed: 'hour',
    camera: 'all',
    timeline: { length: 86_400_000, speeds: ['min', 'hour'] },
    note: '形(かたち)のちがいがわかるように、大(おお)きさをそろえてならべています。ドラッグで回(まわ)す・2本指(ほんゆび)やホイールで拡大(かくだい)',
  },
  aurora: {
    group: 'space',
    title: 'オーロラ',
    lead: '太陽(たいよう)からふいてくるつぶ (太陽風(たいようふう)) が、地球(ちきゅう)の磁場(じば)にみちびかれて、北極(ほっきょく)や南極(なんきょく)のまわりの空(そら)を光(ひか)らせます。',
    span: 'day',
    speed: 'min',
    camera: 'space',
    note: '地球(ちきゅう)のまわりの磁場(じば)やオーロラの高(たか)さは、見(み)やすく縮(ちぢ)めたり強調(きょうちょう)したりしています。ドラッグで回(まわ)す・2本指(ほんゆび)やホイールで拡大(かくだい)',
  },
};

export const VIEW_ORDER: readonly ViewId[] = ['space', 'seasons', 'ground', 'polar', 'moon', 'eclipse', 'tide', 'cloud', 'storm', 'typhoon', 'rainbow', 'river', 'current', 'quake', 'tsunami', 'volcano', 'aurora'];

export const SPAN_LABEL: Record<Span, string> = { day: '1日(にち)', month: '1か月(げつ)', year: '1年(ねん)' };

export const ACCOUNT = {
  title: '記録(きろく)のほぞん',
  note: 'Googleでログインすると、観察(かんさつ)する場所(ばしょ)や、見(み)た解説(かいせつ)の記録(きろく)が、ほかの端末(たんまつ)でも同(おな)じになります。ログインしなくても使(つか)えます。',
  signIn: 'Googleでログイン',
  signedIn: 'ログイン中',
  signOut: 'ログアウト',
  loading: 'たしかめています…',
  saving: 'ほぞん中…',
  saved: 'ほぞんずみ',
  offline: 'まだほぞんできていません。つながったらほぞんします。',
  askMigrate:
    'この端末の記録を、アカウントにうつしますか？\n\n「OK」… うつす（アカウントの記録と合わせます）\n「キャンセル」… うつさない（端末の記録はそのままのこります）',
  signOutUnsynced: 'まだほぞんできていない記録があります。今ログアウトすると、その分はなくなります。ログアウトしますか？',
  signInFailed: 'ログインできませんでした。もういちどためしてください。',
};

const WEEK = '日月火水木金土';

/** その場所の時刻で「2026年10月22日(木) 15:04」 */
export function dateTimeLabel(ms: number, tz: number): { date: string; time: string } {
  const d = new Date(ms + tz * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEK[d.getUTCDay()]})`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

export const timeLabel = (ms: number | null, tz: number) => (ms === null ? 'なし' : dateTimeLabel(ms, tz).time);

export function shortDate(ms: number, tz: number): string {
  const d = new Date(ms + tz * 3_600_000);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

/** 世界時との差 (UTC+9 など) */
export const tzLabel = (tz: number) => `UTC${tz >= 0 ? '+' : '−'}${Math.abs(tz)}`;

const DIR16 = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
/** 方位 (°) → 「南南東」など */
export const direction = (az: number) => DIR16[Math.round(az / 22.5) % 16];

/** 月の形の名前 (太陽と月の黄経の差から) */
export function phaseName(phase: number): string {
  if (phase < 12 || phase >= 348) return '新月(しんげつ)';
  if (phase < 75) return '三日月(みかづき)のころ';
  if (phase < 105) return '上弦(じょうげん)の月(つき)';
  if (phase < 168) return '満月(まんげつ)に近(ちか)づく月(つき)';
  if (phase < 192) return '満月(まんげつ)';
  if (phase < 255) return '欠(か)けていく月(つき)';
  if (phase < 285) return '下弦(かげん)の月(つき)';
  return '明(あ)け方(がた)の細(ほそ)い月(つき)';
}

/** 地球から見た太陽の黄経から、季節の目安 */
export function seasonName(lon: number, south: boolean): string {
  const names = south ? ['秋(あき)', '冬(ふゆ)', '春(はる)', '夏(なつ)'] : ['春(はる)', '夏(なつ)', '秋(あき)', '冬(ふゆ)'];
  return names[Math.floor((((lon + 45) % 360) + 360) % 360 / 90)];
}

/** 現象の時間 (はじまりからの ms) を「3分20秒」「5時間20分」「3日と6時間」にする。length はその画面の長さ */
export function elapsedLabel(ms: number, length: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (length <= 3_600_000) return sec < 60 ? `${sec}秒` : `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`;
  const min = Math.floor(sec / 60);
  if (length <= 3 * 86_400_000) return min < 60 ? `${min}分` : `${Math.floor(min / 60)}時間${String(min % 60).padStart(2, '0')}分`;
  const hour = Math.floor(min / 60);
  return `${Math.floor(hour / 24)}日と${hour % 24}時間`;
}

/** スライダーの目盛りの「30秒」「1.5時間」「5日」 */
export function elapsedTick(ms: number, length: number): string {
  if (length <= 3_600_000) {
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}秒`;
    return sec % 60 ? `${Math.floor(sec / 60)}分${sec % 60}秒` : `${sec / 60}分`;
  }
  if (length <= 3 * 86_400_000) return `${+(ms / 3_600_000).toFixed(1)}時間`;
  return `${Math.round(ms / 86_400_000)}日`;
}

export const hoursLabel = (h: number) => {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}時間${String(total % 60).padStart(2, '0')}分`;
};
