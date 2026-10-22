import { nextPhase, seasonPoint } from '../astro/events';
import { moon } from './moon';
import { polar } from './polar';
import { seasons } from './seasons';
import { stars } from './stars';
import { sunpath } from './sunpath';
import { tide } from './tide';
import type { Guide, When } from './types';

export type { Guide, Step, When } from './types';

export const GUIDES: readonly Guide[] = [seasons, sunpath, polar, moon, stars, tide];

export const guideById = (id: string) => GUIDES.find((g) => g.id === id);

/** その場所 (時刻の差 tz) で、その日の hour 時 */
function atHour(ms: number, hour: number, tz: number): number {
  const d = new Date(ms + tz * 3_600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour) - tz * 3_600_000;
}

/** 解説のステップの時刻を、いま (now) をもとに決める */
export function resolveWhen(when: When, now: number, tz: number): number {
  const year = new Date(now + tz * 3_600_000).getUTCFullYear();
  if ('season' in when) return atHour(seasonPoint(year, when.season), when.hour, tz);
  if ('phase' in when) {
    const t = nextPhase(now, when.phase);
    return when.hour === undefined ? t : atHour(t, when.hour, tz);
  }
  return Date.UTC(year, when.month - 1, when.day, when.hour) - tz * 3_600_000;
}
