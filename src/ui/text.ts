import type { Span } from '../core/clock';
import type { ViewId } from '../views/types';

// 画面に出す文。「漢字(かんじ)」と書くと、説明が「かんたん」のときにふりがなが付く

export interface ViewMeta {
  title: string;
  lead: string;
  /** 時間のはじめの設定 */
  span: Span;
  speed: string;
  camera: string;
}

export const VIEWS: Record<ViewId, ViewMeta> = {
  space: {
    title: '宇宙(うちゅう)から見(み)た太陽(たいよう)・地球(ちきゅう)・月(つき)',
    lead: '地球(ちきゅう)は自転(じてん)しながら太陽(たいよう)のまわりを回(まわ)り、月(つき)は地球(ちきゅう)のまわりを回(まわ)っています。',
    span: 'month',
    speed: 'qday',
    camera: 'whole',
  },
  seasons: {
    title: '季節(きせつ)と地軸(ちじく)のかたむき',
    lead: '地軸(ちじく)はいつも同(おな)じ向(む)きにかたむいたまま、地球(ちきゅう)は1年(ねん)で太陽(たいよう)のまわりを1周(しゅう)します。',
    span: 'year',
    speed: 'week',
    camera: 'whole',
  },
  polar: {
    title: '白夜(びゃくや)と極夜(きょくや)',
    lead: '北極(ほっきょく)や南極(なんきょく)の近(ちか)くでは、一日中(いちにちじゅう)しずまない太陽(たいよう)や、一日中(いちにちじゅう)のぼらない太陽(たいよう)が見(み)られます。',
    span: 'day',
    speed: 'hour',
    camera: 'side',
  },
  ground: {
    title: '地上(ちじょう)から見(み)た空(そら)',
    lead: '太陽(たいよう)・月(つき)・星(ほし)が、空(そら)をどう動(うご)いて見(み)えるかをたしかめます。場所(ばしょ)や季節(きせつ)を変(か)えてみよう。',
    span: 'day',
    speed: 'min',
    camera: 'outside',
  },
  moon: {
    title: '月(つき)の満(み)ち欠(か)け',
    lead: '月(つき)は太陽(たいよう)の光(ひかり)を反射(はんしゃ)して光(ひか)っています。地球(ちきゅう)のまわりを回(まわ)ると、光(ひか)って見(み)える部分(ぶぶん)が変(か)わります。',
    span: 'month',
    speed: 'qday',
    camera: 'top',
  },
  tide: {
    title: '潮(しお)の満(み)ち引(ひ)き',
    lead: '海(うみ)の水(みず)は、月(つき)と太陽(たいよう)に引(ひ)かれて、地球(ちきゅう)の2か所(しょ)でふくらみます。',
    span: 'month',
    speed: 'hour',
    camera: 'top',
  },
};

export const VIEW_ORDER: readonly ViewId[] = ['space', 'seasons', 'ground', 'polar', 'moon', 'tide'];

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

export const hoursLabel = (h: number) => {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}時間${String(total % 60).padStart(2, '0')}分`;
};
