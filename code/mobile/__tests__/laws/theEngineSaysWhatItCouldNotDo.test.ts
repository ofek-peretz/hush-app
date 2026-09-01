/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ENGINE SAYS WHAT IT COULD NOT DO — and it says it where she is standing.
 *
 * ⛔ FOUNDER, 2026-08-12, on what would actually improve her product: the WHY reaching more than one
 * screen, and the two budget verdicts reaching more than one screen.
 *
 * Three facts the engine has known and told nobody but telemetry:
 *
 *   `overBudget`      stamped since 2026-07-21, read by NOTHING until 2026-08-12
 *   `shortOfBudget`   her map cannot fill the hour she asked for
 *   `unavoidable`     no arrangement reaches the effective dose — a two-day week is five sets short
 *
 * A flag nothing draws is not a feature, it is a comment. This file is what stops a third one
 * joining them.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { weekNotice } from '@/domain/weekNotice';
import { weekFindings, unavoidable } from '@/domain/weekQuality';
import { fixtureModel } from '@/data/api/fixtureModel';
import { CANONICAL_MUSCLE_ORDER, SESSION_MIN } from '@/engine/v5/constants';
import { initI18n, tg } from '@/i18n';

const athlete = (over = {}) => ({
  id: 'p1', sex: 'female', units: 'kg', weightKg: 62, startWeightKg: 62,
  daysPerWeek: 4, repBand: '8-10', repBandByMuscle: {},
  memberSince: new Date('2026-01-01').toISOString(), ...over,
});
const build = (over = {}) => fixtureModel.generateProgram(athlete(over));
const offAll = (...m) => Object.fromEntries(m.map((x) => [x, 'off']));

beforeAll(async () => { await initI18n(); });

describe('⛔ the one sentence about her week', () => {
  it('⛔ an ORDINARY week says NOTHING — a note every morning is a note she stops reading', async () => {
    const noisy = [];
    for (const days of [3, 4, 5, 6])
      for (const sex of ['male', 'female'])
        for (const bodyMap of [{}, { Back: 'emphasis' }, { Calves: 'off', Core: 'off' }, offAll('Quads', 'Hamstrings', 'Glutes', 'Calves')]) {
          const p = await build({ daysPerWeek: days, sex, bodyMap });
          const n = weekNotice(p, { bodyMap, daysPerWeek: days }, 60);
          // The legs-off six-day week genuinely cannot fill six sessions — that one SHOULD speak.
          const expected = p.days.some((d) => d.overBudget || d.shortOfBudget);
          if (!expected && n) noisy.push(`${sex} ${days}d ${JSON.stringify(bodyMap)}: ${n.key}`);
        }
    expect(noisy).toEqual([]);
  });

  it('⛔ a TWO-DAY week says the thing no arrangement could fix', async () => {
    /*
     * Two sessions deliver about 49 working sets; nine muscles need 54 to reach the dose. She has
     * been training a week that cannot feed everything she left on, and nothing has ever said so.
     */
    const p = await build({ daysPerWeek: 2 });
    const inputs = { bodyMap: {}, daysPerWeek: 2 };
    expect(unavoidable(weekFindings(p, inputs)).length).toBeGreaterThan(0);
    const n = weekNotice(p, inputs, 60);
    expect(n).not.toBeNull();
    // Since the hour prices the warm-ups (2026-08-25), a two-day full-body week can ALSO carry a
    // day that genuinely cannot fit — and the ranking's own law puts "does not fit today" above
    // "cannot reach the dose". Either sentence is the engine saying the unfixable thing out loud;
    // the thin FINDING itself is asserted unconditionally above.
    expect(n.key.startsWith('weekNotice.thin') || n.key === 'weekNotice.over').toBe(true);
    // …and the sentence resolves to real copy in both languages, with the remedy in it.
    expect(tg(n.key, n.params).length).toBeGreaterThan(20);
    expect(tg(n.key, n.params)).not.toContain(n.key);
  });

  it('⛔ a week her MAP cannot fill says so', async () => {
    // Legs off at six days: the upper body does not own enough distinct work for six hours.
    const p = await build({ daysPerWeek: 6, bodyMap: offAll('Quads', 'Hamstrings', 'Glutes', 'Calves') });
    expect(p.days.some((d) => d.shortOfBudget)).toBe(true);
    const n = weekNotice(p, { bodyMap: offAll('Quads', 'Hamstrings', 'Glutes', 'Calves'), daysPerWeek: 6 }, 60);
    expect(n.key.startsWith('weekNotice.short')).toBe(true);
    expect(String(n.params.floor)).toBe(String(SESSION_MIN));
  });

  it('⛔ only ONE sentence, ever — Today is not a report', async () => {
    /*
     * Three notices stacked on the screen she reads at six in the morning is the nagging the brief
     * bans, and a surface that says three things says none of them. The ranking is by what she
     * would act on first: a day she will run out of time in, then a muscle that is not growing,
     * then a session that finishes early.
     */
    const bodyMap = offAll(...CANONICAL_MUSCLE_ORDER.filter((m) => m !== 'Chest'));
    const p = await build({ daysPerWeek: 2, bodyMap });
    const n = weekNotice(p, { bodyMap, daysPerWeek: 2 }, 60);
    expect(typeof n?.key).toBe('string'); // one object, never a list
  });

  it('nothing to say about nothing', () => {
    expect(weekNotice(null, {})).toBeNull();
    expect(weekNotice(undefined, {})).toBeNull();
  });

  it('⛔ THE CHAIN — every verdict reaches a screen, and the WHY reaches BOTH of them', () => {
    /*
     * ⛔ THE TEST THAT MATTERS MOST HERE. `overBudget` sat in the engine for three weeks, correct
     * and unread, because nothing asserted that a screen drew it. Each link is checked separately so
     * a red run names the one that was cut.
     */
    const fs = require('fs');
    const path = require('path');
    const src = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', p), 'utf8');

    // 1 · the week's sentence, on the screen she opens every morning
    const home = src('screens/home/Home.tsx');
    expect(home).toContain('weekNotice');
    expect(home).toContain('notice={engineNotice}');
    expect(src('screens/home/HomeView.tsx')).toContain('props.notice');

    // 2 · the day's sentence, on the card she reads before training
    const pre = src('screens/plan/PreWorkoutScreen.tsx');
    expect(pre).toContain('shortOfBudget');
    expect(pre).toContain('overBudget');
    expect(src('screens/plan/PreWorkout.tsx')).toContain('props.budgetNote');

    // 3 · and the WHY opens from a row on BOTH screens, not only the card
    expect(home).toContain('WhyHereSheet');
    expect(home).toMatch(/placements\[id\] \? setHereFor\(id\)/);
    expect(pre).toContain('WhyHereSheet');
    expect(src('components/PlanLifts.tsx')).toContain('onWhy ? onWhy(lift.exerciseId) : onForm(lift.exerciseId)');
  });
});
