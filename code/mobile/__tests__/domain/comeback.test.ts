/**
 * AFTER A GAP (v7 §10) — the welcome, and the two ways it could become the thing it exists to
 * avoid: greeting an absence that is not one, or greeting someone who never left.
 */
// @ts-nocheck

// 

import { COMEBACK_DAYS, comebackAfterGap } from '@/domain/comeback';
import type { Session } from '@/data/local/models';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-27T09:00:00.000Z');

const session = (msAgo: number): Session =>
  ({ id: `s${msAgo}`, startedAt: new Date(NOW - msAgo).toISOString(), sets: [] }) as unknown as Session;

describe('the gap worth greeting', () => {
  it('greets an absence, and says how long it was', () => {
    const c = comebackAfterGap([session(11 * DAY)], NOW);
    expect(c).not.toBeNull();
    expect(c!.daysAway).toBe(11); // the handoff's own eleven quiet days
  });

  it('says NOTHING about an ordinary week away — a product that greets you at four days watches you', () => {
    expect(comebackAfterGap([session(4 * DAY)], NOW)).toBeNull();
    expect(comebackAfterGap([session((COMEBACK_DAYS - 1) * DAY)], NOW)).toBeNull();
    expect(comebackAfterGap([session(COMEBACK_DAYS * DAY)], NOW)).not.toBeNull();
  });

  it('measures from the LAST session, not the first', () => {
    const c = comebackAfterGap([session(200 * DAY), session(12 * DAY), session(90 * DAY)], NOW);
    expect(c!.daysAway).toBe(12);
  });

  it('has nothing to say to someone who never trained — that is a beginning, not a return', () => {
    expect(comebackAfterGap([], NOW)).toBeNull();
  });

  it('does not throw on a session whose date cannot be read', () => {
    const broken = { id: 'x', startedAt: 'not-a-date', sets: [] } as unknown as Session;
    expect(comebackAfterGap([broken], NOW)).toBeNull();
    // …and a good one beside it still answers
    expect(comebackAfterGap([broken, session(30 * DAY)], NOW)!.daysAway).toBe(30);
  });
});
