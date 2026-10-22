import type { MoonPhase, SeasonPoint } from '../astro/events';
import type { Span } from '../core/clock';
import type { ViewId } from '../views/types';

/** 解説のステップで見せる時刻 */
export type When =
  /** 今年のその二十四節気の日の、その場所の hour 時 */
  | { season: SeasonPoint; hour: number }
  /**
   * いま (after があればその日 (世界時の YYYY-MM-DD)) のあとで、はじめて月がその形になる時刻
   * (hour があれば、その日のその場所の hour 時)
   */
  | { phase: MoonPhase; hour?: number; after?: string }
  /** 決まった時刻 (世界時の YYYY-MM-DDTHH:MM)。日食・月食など、その日でないと見られないもの */
  | { at: string }
  /** いまの時刻 */
  | { now: true }
  /** 今年の month 月 day 日の、その場所の hour 時 */
  | { month: number; day: number; hour: number };

export interface Step {
  title: string;
  /** かんたん (ふりがな付き、小学生向け) */
  easy: string;
  /** くわしく (中学生向け) */
  detail: string;
  view: ViewId;
  /** 観察地点 (PLACES の id)。なければ、自分の観察地点 */
  place?: string;
  when?: When;
  camera?: string;
  options?: Record<string, boolean>;
  span?: Span;
  speed?: string;
  play?: boolean;
}

export interface Guide {
  id: string;
  title: string;
  lead: string;
  /** 教科書の単元 (学年の目安) */
  grade: string;
  steps: Step[];
}
