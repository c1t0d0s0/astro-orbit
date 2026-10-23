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
};

export const VIEW_ORDER: readonly ViewId[] = ['space', 'seasons', 'ground', 'polar', 'moon', 'eclipse', 'tide'];

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
  if (length <= 3 * 86_400_000) return `${Math.floor(min / 60)}時間${String(min % 60).padStart(2, '0')}分`;
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
