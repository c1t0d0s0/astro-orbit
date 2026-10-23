import { DAY_MS } from '../astro/time';

// 画面の時刻。タイムラプスの再生・スライダー・ジャンプはどれも、この時刻を変える

/** 再生の速さ (実際の 1 秒で、画面の中の時間がどれだけ進むか) */
export interface Speed {
  key: string;
  label: string;
  ms: number;
}

export const SPEEDS: readonly Speed[] = [
  { key: 'real', label: 'ふつうの速(はや)さ', ms: 1000 },
  { key: 'sec10', label: '10倍(ばい)の速(はや)さ', ms: 10_000 },
  { key: 'min1', label: '1秒(びょう)で1分(ぷん)', ms: 60_000 },
  { key: 'min', label: '1秒(びょう)で10分(ぷん)', ms: 600_000 },
  { key: 'hour', label: '1秒(びょう)で1時間(じかん)', ms: 3_600_000 },
  { key: 'qday', label: '1秒(びょう)で6時間(じかん)', ms: DAY_MS / 4 },
  { key: 'day', label: '1秒(びょう)で1日(にち)', ms: DAY_MS },
  { key: 'week', label: '1秒(びょう)で1週間(しゅうかん)', ms: 7 * DAY_MS },
  { key: 'month', label: '1秒(びょう)で1か月(げつ)', ms: 30 * DAY_MS },
];

export const speedByKey = (key: string) => SPEEDS.find((s) => s.key === key) ?? SPEEDS[3];

/** スライダーで動かせる範囲 */
export type Span = 'day' | 'month' | 'year';

export class Clock {
  ms: number;
  playing = false;
  speed: Speed = SPEEDS[3];
  /** 時刻の範囲 (現象の時間の画面で、はじまりからおわりまで)。null なら日時でかぎりなし */
  range: [number, number] | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(ms = Date.now()) {
    this.ms = ms;
  }

  /** 時刻・再生の状態が変わったら知らせてもらう。もどり値をよぶと外れる */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  set(ms: number): void {
    if (!Number.isFinite(ms)) return;
    this.ms = this.range ? Math.min(Math.max(ms, this.range[0]), this.range[1]) : ms;
    this.emit();
  }

  setPlaying(playing: boolean): void {
    // おわりまで進んでいたら、はじめから再生する
    if (playing && this.range && this.ms >= this.range[1]) this.ms = this.range[0];
    this.playing = playing;
    this.emit();
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.emit();
  }

  /** 毎フレームよぶ。再生中なら時刻を進める */
  tick(dt: number): void {
    if (!this.playing) return;
    this.ms += dt * this.speed.ms;
    // 現象の時間は、おわりで止める
    if (this.range && this.ms >= this.range[1]) {
      this.ms = this.range[1];
      this.playing = false;
    }
    this.emit();
  }
}

/** その場所の時刻で、ms をふくむ範囲 (1 日・1 か月・1 年) の始まりと長さ */
export function spanWindow(ms: number, span: Span, tz: number): { start: number; length: number } {
  const off = tz * 3_600_000;
  const d = new Date(ms + off);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (span === 'day') {
    const start = Date.UTC(y, m, d.getUTCDate()) - off;
    return { start, length: DAY_MS };
  }
  if (span === 'month') {
    const start = Date.UTC(y, m, 1) - off;
    return { start, length: Date.UTC(y, m + 1, 1) - off - start };
  }
  const start = Date.UTC(y, 0, 1) - off;
  return { start, length: Date.UTC(y + 1, 0, 1) - off - start };
}
