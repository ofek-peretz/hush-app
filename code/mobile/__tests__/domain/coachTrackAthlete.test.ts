/**
 * The coach track, the trainee's pure rules (`domain/coachTrackAthlete`) — the door, the swap for
 * today, the update card, the link's facts and a refusal in words. (2026-09-17)
 */
// @ts-nocheck

import en from '@/i18n/locales/en.json';
import he from '@/i18n/locales/he.json';
import {
  appliedSwaps,
  coachWeekNumber,
  diffCount,
  inviteCodeFromUrl,
  isInviteCode,
  joinErrorKey,
  normalizeInviteCode,
  groupedLineCount,
  swapForToday,
  updateCardGroups,
  weekdayOfLocalDay,
} from '@/domain/coachTrackAthlete';
import type { PlannedSession } from '@/domain/coachPlan';

describe('the door — which links are a coach’s invite', () => {
  it.each([
    ['hush://coach?c=ABC234', 'ABC234'],
    ['hush://coach?c=abc234', 'ABC234'],
    ['hush://coach/?x=1&c=ABC234', 'ABC234'],
    ['https://getferrox.com/c/ABC234', 'ABC234'],
    ['https://getferrox.com/c/abc234/', 'ABC234'],
    ['https://hush-identity.example.workers.dev/c/ABC234', 'ABC234'],
    ['https://getferrox.com/c?c=ABC234', 'ABC234'],
    ['http://localhost:8081/c/ABC234', 'ABC234'],
  ])('%s → %s', (url, code) => {
    expect(inviteCodeFromUrl(url)).toBe(code);
  });

  it.each([
    'hush://pair?c=ABC234', // the pair's link shares the param and is not an invite
    'https://getferrox.com/pair?c=ABC234',
    'https://getferrox.com/circle?c=ABC234',
    'https://getferrox.com/coach/join?c=ABC234', // an API path under /c… is never an invite
    'https://getferrox.com/config',
    'https://getferrox.com/c/ABC23', // too short
    'https://getferrox.com/c/ABC2345', // too long
    'https://getferrox.com/c/ABC1O4', // 1 and O are not in the alphabet — never "close enough"
    'https://getferrox.com/plan?p=xyz',
    'https://getferrox.com/',
    '',
    null,
    undefined,
    'not a url',
  ])('%s → null', (url) => {
    expect(inviteCodeFromUrl(url as string)).toBeNull();
  });

  it('what she types is filtered to the alphabet the server reads, six at most', () => {
    expect(normalizeInviteCode(' abc-234x ')).toBe('ABC234');
    expect(normalizeInviteCode('io10lL')).toBe('');
    expect(isInviteCode('ABC234')).toBe(true);
    expect(isInviteCode('ABC23')).toBe(false);
    expect(isInviteCode('abc234')).toBe(false);
  });
});

const day = (): PlannedSession => ({
  name: 'Upper',
  blocks: [
    { rounds: 4, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [6, 8], load: 80, coachNote: 'Shoulder blades back' }] },
    { rounds: 3, items: [{ kind: 'reps', ex: 'bb_row', reps: [8, 10], load: 60 }, { kind: 'reps', ex: 'lat_pulldown', reps: [10, 12], load: 50 }] },
  ],
});

describe('⛔ ruling 4 — the swap for today changes the session, never its shape', () => {
  it('replaces the lift, drops the load decided for the other one and the note written about it', () => {
    const before = day();
    const after = swapForToday(before, [{ from: 'bb_bench_press', to: 'db_bench_press' }]);
    expect(after.blocks[0]).toEqual({ rounds: 4, items: [{ kind: 'reps', ex: 'db_bench_press', reps: [6, 8], load: null }] });
    // the rest of the day, the sets, the band and the superset are the coach's, untouched
    expect(after.blocks[1]).toEqual(before.blocks[1]);
    expect(after.name).toBe(before.name);
    // the input is not mutated
    expect(before.blocks[0].items[0].ex).toBe('bb_bench_press');
  });

  it('ignores a swap of a lift not in the day, onto a lift already in it, or onto the same lift', () => {
    const d = day();
    expect(swapForToday(d, [{ from: 'squat', to: 'leg_press' }])).toBe(d);
    expect(swapForToday(d, [{ from: 'bb_row', to: 'lat_pulldown' }])).toBe(d);
    expect(swapForToday(d, [{ from: 'bb_row', to: 'bb_row' }])).toBe(d);
    const two = swapForToday(d, [{ from: 'bb_row', to: 'db_row' }, { from: 'bb_bench_press', to: 'db_row' }]);
    expect(two.blocks.flatMap((b) => b.items.map((i) => i.ex))).toEqual(['bb_bench_press', 'db_row', 'lat_pulldown']);
  });

  it('records only the swaps that landed', () => {
    const d = day();
    const swaps = [{ from: 'bb_row', to: 'db_row' }, { from: 'squat', to: 'leg_press' }];
    expect(appliedSwaps(d, swapForToday(d, swaps), swaps)).toEqual([{ from: 'bb_row', to: 'db_row' }]);
  });
});

describe('the update card', () => {
  const diff = {
    added: [{ day: 'Upper', ex: 'db_shoulder_press' }],
    removed: [{ day: 'Upper', ex: 'military_press' }],
    changed: [{ day: 'Lower', ex: 'bb_back_squat', sets: [3, 4] }],
    moved: [],
  };
  it('counts every change and lists what left, then what arrived, then what changed', () => {
    expect(diffCount(diff)).toBe(3);
    expect(updateCardGroups(diff)).toEqual([
      { day: 'Upper', lines: [{ sign: '−', ex: 'military_press' }, { sign: '+', ex: 'db_shoulder_press' }] },
      { day: 'Lower', lines: [{ sign: '~', ex: 'bb_back_squat', detail: '3→4' }] },
    ]);
    // The cap counts LINES, never groups — a day header is not one of her changes.
    expect(groupedLineCount(updateCardGroups(diff, 2))).toBe(2);
    expect(updateCardGroups(diff, 2)).toHaveLength(1);
  });

  /**
   * ⛔ EVERY LINE IS PLACED ON A DAY (2026-09-18). `CoachDiffLift.day` reached the card and was
   * thrown away, so on a four-day week "− Military press" named the lift and hid the workout. With
   * one change the group is a caption; with twelve it is the axis the week is organised by.
   */
  it('groups by day, and a day appears once however many lines hang under it', () => {
    const many = {
      added: [{ day: 'Push', ex: 'a' }, { day: 'Push', ex: 'b' }, { day: 'Legs', ex: 'c' }],
      removed: [{ day: 'Push', ex: 'd' }],
      changed: [],
      moved: [],
    };
    const groups = updateCardGroups(many, 10);
    expect(groups.map((g) => g.day)).toEqual(['Push', 'Legs']);
    expect(groups[0].lines.map((l) => `${l.sign}${l.ex}`)).toEqual(['−d', '+a', '+b']);
    expect(groups[1].lines).toEqual([{ sign: '+', ex: 'c' }]);
    // One change is still one group — the day it happened on is the thing she could not read.
    const one = updateCardGroups({ added: [{ day: 'Pull', ex: 'x' }], removed: [], changed: [], moved: [] });
    expect(one).toEqual([{ day: 'Pull', lines: [{ sign: '+', ex: 'x' }] }]);
  });

  /**
   * ⛔ `~` MUST CARRY THE FIGURES THAT MOVED (2026-09-18). The card's one job on a changed lift is
   * to say WHAT changed, and it printed a tilde and a name — while `CoachDiffChange` had been
   * carrying `[was, now]` for both sets and band since the day it was written.
   */
  it('a re-prescribed lift prints the figures that moved, and nothing when only the note did', () => {
    const line = (changed) => updateCardGroups({ added: [], removed: [], changed: [changed], moved: [] })[0].lines[0];
    expect(line({ day: 'A', ex: 'x', sets: [3, 4] }).detail).toBe('3→4');
    expect(line({ day: 'A', ex: 'x', band: [[6, 8], [8, 10]] }).detail).toBe('6–8→8–10');
    expect(line({ day: 'A', ex: 'x', sets: [3, 4], band: [[6, 8], [8, 10]] }).detail).toBe('3×6–8→4×8–10');
    // A single-number band is one number, never "8–8".
    expect(line({ day: 'A', ex: 'x', band: [[8, 8], [10, 10]] }).detail).toBe('8→10');
    // Words are not mono's material: a note-only change has no figure and says nothing numeric.
    expect(line({ day: 'A', ex: 'x', note: true }).detail).toBeUndefined();
  });

  /**
   * ⛔ AN ORDER THAT MOVED IS A CHANGE SHE IS TOLD ABOUT (2026-09-18). `moved` counts, so a pure
   * reorder passes the `diffCount === 0` gate Home draws the card behind — and it arrives as a
   * SENTENCE under its day, because there is no one lift it is about.
   */
  it('an order line counts, carries no lift, and sits under the day it is about', () => {
    const d = {
      added: [],
      removed: [],
      changed: [],
      moved: [{ day: 'Push', kind: 'lifts' }, { day: 'Legs', kind: 'day', to: 1 }],
    };
    expect(diffCount(d)).toBe(2);
    expect(updateCardGroups(d)).toEqual([
      { day: 'Push', lines: [{ sign: '⇅', ex: '', order: 'lifts' }] },
      { day: 'Legs', lines: [{ sign: '⇅', ex: '', order: 'day', to: 1 }] },
    ]);
    // …and a week that truly changed nothing still counts nothing and produces no group.
    expect(diffCount({ added: [], removed: [], changed: [], moved: [] })).toBe(0);
    expect(updateCardGroups({ added: [], removed: [], changed: [], moved: [] })).toEqual([]);
  });

  /** An update written to disk before `moved` existed must not make the card throw on read. */
  it('survives a pending update stored by an older build, with no `moved` at all', () => {
    const legacy = { added: [{ day: 'Push', ex: 'x' }], removed: [], changed: [] };
    expect(diffCount(legacy)).toBe(1);
    expect(updateCardGroups(legacy)).toEqual([{ day: 'Push', lines: [{ sign: '+', ex: 'x' }] }]);
  });

  /** ⛔ LAW 7 — no chat, so the ask leaves through her own WhatsApp. Both locales carry the words. */
  it('the dropped-lift ask and the message it sends exist in both languages', () => {
    for (const tree of [en, he]) {
      expect(typeof tree.coachTrack.athlete.updateDroppedAsk).toBe('string');
      /*
       * ⛔ THE ACT'S LABEL MAY NOT CARRY HIS NAME (2026-09-18) — it used to be required to.
       * "בקש מ{{coach}} להחליף" renders as "בקש מDani Azoulay להחליף" for a Latin name: a Hebrew
       * one-letter prefix glued to a Latin run comes out the wrong way round, which is the fault
       * this pass already removed from the invite and the update titles. The card's title names
       * him; the label says the act. The MESSAGE below still greets him, where a space keeps the
       * two scripts apart.
       */
      expect(tree.coachTrack.athlete.updateDroppedAsk).not.toContain('{{coach}}');
      const msg = tree.coachTrack.athlete.updateDroppedMessage;
      for (const v of ['{{coach}}', '{{ex}}', '{{day}}']) expect(msg).toContain(v);
    }
    // The order lines say it in words, in both languages, and the day move names the seat.
    for (const tree of [en, he]) {
      expect(typeof tree.coachTrack.athlete.updateOrderLifts).toBe('string');
      expect(tree.coachTrack.athlete.updateOrderDay).toContain('{{n}}');
    }
  });
  it('reads the weekday of a local day', () => {
    expect(weekdayOfLocalDay('2026-09-17')).toBe(4); // a Thursday
    expect(weekdayOfLocalDay('17/09/2026')).toBeNull();
  });
});

describe('the link', () => {
  it('counts the week of the link from the day she joined', () => {
    const since = '2026-09-02T09:00:00.000Z';
    expect(coachWeekNumber(since, Date.parse('2026-09-02T10:00:00.000Z'))).toBe(1);
    expect(coachWeekNumber(since, Date.parse('2026-09-17T10:00:00.000Z'))).toBe(3);
    expect(coachWeekNumber('garbage', Date.now())).toBeNull();
  });

  it('⛔ every refusal a trainee can meet has its own words, in both languages', () => {
    const errors = ['bad_code', 'seats_full', 'already_linked', 'self', 'coach_not_configured', 'unavailable', 'signed_out', 'too_many_invites', 'not_found', 'forbidden', 'invalid', 'network'];
    const at = (tree, key) => key.split('.').reduce((n, k) => (n ? n[k] : undefined), tree);
    for (const e of errors) {
      const key = joinErrorKey(e);
      expect(typeof at(en, key)).toBe('string');
      expect(typeof at(he, key)).toBe('string');
    }
    // offline and "it is us" are never said as each other
    expect(joinErrorKey('network')).not.toBe(joinErrorKey('unavailable'));
    expect(joinErrorKey('seats_full')).not.toBe(joinErrorKey('bad_code'));
    expect(at(he, joinErrorKey('seats_full'))).toContain('המאמן מלא כרגע');
  });

  /**
   * ⛔ AN ERROR SAYS WHAT TO DO NEXT (2026-09-18). Four of these were a diagnosis and a full stop —
   * "המאמן מלא כרגע." / "This is your own invite." — which leaves her holding a code and no move.
   * Every refusal a trainee can be shown now carries a second sentence with the next step in it.
   */
  it('every refusal a trainee meets is more than a diagnosis', () => {
    const at = (tree, key) => key.split('.').reduce((n, k) => (n ? n[k] : undefined), tree);
    for (const e of ['bad_code', 'seats_full', 'self', 'already_linked', 'unavailable', 'network', 'signed_out']) {
      for (const tree of [en, he]) {
        const said = at(tree, joinErrorKey(e));
        // Two sentences: what happened, and what she does about it.
        expect(said.replace(/\.$/, '').split(/[.—]/).filter((s) => s.trim().length > 2).length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
