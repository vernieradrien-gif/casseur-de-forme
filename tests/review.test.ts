import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/game/config';
import { createState } from '../src/game/state';
import { askReview, reviewDue } from '../src/review';
import { defaultExtra, defaultSettings, deserialize, serialize } from '../src/storage/save';

const DAY = 86_400_000;
const cfg = BALANCE.review;

describe('demande d’avis Google Play', () => {
  it('pas avant le niveau prévu, puis tout de suite après une victoire', () => {
    const extra = defaultExtra();
    expect(reviewDue(extra, cfg.firstAtLevel - 1, 0)).toBe(false);
    expect(reviewDue(extra, cfg.firstAtLevel, 0)).toBe(true);
  });

  it('espacée de plusieurs semaines et limitée en nombre', () => {
    const extra = defaultExtra();
    let now = 1_000 * DAY;
    askReview(extra, now);
    expect(extra.reviewAsks).toBe(1);
    expect(reviewDue(extra, 40, now + DAY)).toBe(false);
    expect(reviewDue(extra, 40, now + cfg.minDaysBetween * DAY)).toBe(true);
    for (let i = 1; i < cfg.maxAsks; i++) {
      now += cfg.minDaysBetween * DAY;
      askReview(extra, now);
    }
    expect(extra.reviewAsks).toBe(cfg.maxAsks);
    expect(reviewDue(extra, 200, now + 1000 * DAY)).toBe(false);
  });

  it('les demandes déjà faites sont gardées dans la sauvegarde', () => {
    const extra = { ...defaultExtra(), reviewAsks: 2, reviewAskedAt: 123_456 };
    const back = deserialize(JSON.parse(JSON.stringify(serialize(createState(1), defaultSettings(), extra))));
    expect(back.extra.reviewAsks).toBe(2);
    expect(back.extra.reviewAskedAt).toBe(123_456);
  });
});
