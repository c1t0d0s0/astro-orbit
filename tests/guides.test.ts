import { describe, expect, it } from 'vitest';
import { placeById } from '../src/data/places';
import { GUIDES, resolveWhen } from '../src/guides';
import { VIEWS } from '../src/ui/text';

// 解説のステップが、ある画面・ある場所・ある視点・ある表示の切りかえだけを使っているか
// (画面ごとの切りかえと視点の名前は、views/*.ts の TOGGLES と CAMERAS と同じ)
const TOGGLES: Record<string, string[]> = {
  space: ['labels', 'moonPath', 'place'],
  seasons: ['ghosts', 'notilt', 'place', 'labels'],
  polar: ['circles', 'tropics', 'subsolar', 'place', 'labels'],
  eclipse: ['shadows', 'plane', 'nodes', 'labels'],
  ground: ['sunPath', 'seasonPaths', 'moonPath', 'stars', 'daystars', 'lines', 'trails', 'pole'],
  moon: ['ghosts', 'inset', 'south', 'labels'],
  tide: ['moonForce', 'sunForce', 'arrows', 'place', 'labels'],
};
const CAMERAS: Record<string, string[]> = {
  space: ['whole', 'top', 'earth'],
  seasons: ['whole', 'side', 'top', 'earth'],
  polar: ['side', 'north', 'south', 'sun'],
  ground: ['outside', 'south', 'north', 'east', 'west', 'up', 'sunTrack', 'moonTrack'],
  eclipse: ['tilt', 'side', 'top', 'earth'],
  moon: ['top', 'tilt'],
  tide: ['top', 'tilt', 'far'],
};

describe('解説', () => {
  const now = Date.UTC(2026, 9, 22, 6);
  for (const g of GUIDES) {
    it(`${g.id}: どのステップも、ある画面・場所・視点・切りかえを使う`, () => {
      expect(g.steps.length).toBeGreaterThan(2);
      for (const s of g.steps) {
        expect(VIEWS[s.view]).toBeTruthy();
        if (s.place) expect(placeById(s.place), s.place).toBeTruthy();
        expect(CAMERAS[s.view]).toContain(s.camera ?? VIEWS[s.view].camera);
        for (const key of Object.keys(s.options ?? {})) expect(TOGGLES[s.view], `${g.id}/${s.title}`).toContain(key);
        if (s.when) {
          const tz = s.place ? placeById(s.place)!.tz : 9;
          const t = resolveWhen(s.when, now, tz);
          expect(Number.isFinite(t)).toBe(true);
          // 今年か、いまから 1 か月以内
          expect(Math.abs(t - now)).toBeLessThan(400 * 86_400_000);
        }
        // ふりがなの書き方 「漢字(かな)」 のかっこが閉じている
        for (const text of [s.title, s.easy]) expect(text.split('(').length, text).toBe(text.split(')').length);
      }
    });
  }
});
