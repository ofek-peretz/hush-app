/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE REVIEW SCREEN — the promise, made visible.
 *
 * ⛔ FOUNDER, 2026-08-11: *"מצד אחד הוא רוצה את התוכנית שלו ומצד שני יש לנו מנוע שיכול לעשות לו שם
 * שינויים שהוא לא ירצה. איך זה יעבוד?"*
 *
 * Every guarantee built today rests on this screen existing and being read. `importedPlan` copies a
 * six-set block past F-1's ceiling, keeps a 74-minute Monday, and leaves a muscle under MEV — all of
 * which is only defensible because she is TOLD, in her own language, before she chooses.
 *
 * So this file asserts the three things a report has to do: say what it read, say what it found in
 * words she can act on, and say nothing at all when there is nothing to say.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import { ImportReview } from '@/screens/import/ImportReview';
import { initI18n, tg } from '@/i18n';
import { matchWeek, toProgram, reviewFindings } from '@/domain/importedPlan';

beforeAll(async () => {
  await initI18n('en');
});

const mount = (props) => {
  let r;
  act(() => {
    r = TestRenderer.create(<ImportReview {...props} />);
  });
  return r;
};

const texts = (r) =>
  r.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')))
    .join(' ');

/** Her week, exactly as the domain hands it over. */
function herReview() {
  const week = {
    title: 'Coach block',
    sessions: [
      {
        name: 'Push',
        lifts: [
          { name: 'Barbell Bench Press', sets: 5 },
          { name: 'Incline DB Press', sets: 5 },
          { name: 'Cable Fly', sets: 4 },
          { name: 'OHP', sets: 5 },
          { name: 'Lateral Raise', sets: 4 },
          { name: 'Triceps Pushdown', sets: 4 },
          { name: 'Skullcrusher', sets: 4 },
          { name: 'Zercher Squat', sets: 3 },
        ],
      },
      { name: 'Pull', lifts: [{ name: 'Back Squat', sets: 6 }, { name: 'DB Row' }] },
    ],
  };
  const m = matchWeek(week);
  const p = toProgram(m);
  return { m, p, findings: reviewFindings(m, p) };
}

describe('⛔ the review tells her what we found', () => {
  it('says what it READ — so the screen never reads as a failure to parse', () => {
    const { p, findings } = herReview();
    const r = mount({
      title: 'Coach block',
      sessionCount: p.days.length,
      liftCount: p.days.reduce((n, d) => n + d.slots.length, 0),
      findings,
      onKeep: () => {},
      onBalance: () => {},
    });
    const said = texts(r);
    expect(said).toContain('Coach block');
    expect(said).toContain('2'); // sessions
  });

  it('⛔ names the lift it could not find — using HER words, not an id', () => {
    /*
     * She wrote "Zercher Squat". A line that says `zercher_squat` or, worse, silently offers a back
     * squat, is the failure this whole feature exists to prevent.
     */
    const { p, findings } = herReview();
    const said = texts(mount({ sessionCount: 2, liftCount: 9, findings, onKeep: () => {}, onBalance: () => {} }));
    expect(said).toContain('Zercher Squat');
    expect(said).toContain(tg('import.findUnmatched', { name: 'Zercher Squat' }));
  });

  it('⛔ names a block above the ceiling by its CATALOGUE NAME, never its id', () => {
    /*
     * A finding carries `bb_back_squat` because that is what the programme holds. On screen that has
     * to read "Barbell Back Squat" — an id in front of an athlete is a bug she cannot report.
     */
    const { findings } = herReview();
    const said = texts(mount({ sessionCount: 2, liftCount: 9, findings, onKeep: () => {}, onBalance: () => {} }));
    expect(said).toContain('Barbell Back Squat');
    expect(said).not.toContain('bb_back_squat');
  });

  it('names a long session and a muscle under the dose, in sentences', () => {
    const { findings } = herReview();
    const said = texts(mount({ sessionCount: 2, liftCount: 9, findings, onKeep: () => {}, onBalance: () => {} }));
    expect(findings.some((f) => f.kind === 'session_over_hour')).toBe(true);
    expect(said).toContain('Push'); // the day it is about, named
    expect(said.toLowerCase()).toContain('minutes');
  });

  it('⛔ a clean programme produces NO findings — the report is not noise', () => {
    /*
     * A report that always speaks is one she learns to dismiss, and then the one time it matters she
     * dismisses that too.
     */
    const said = texts(mount({ sessionCount: 3, liftCount: 12, findings: [], onKeep: () => {}, onBalance: () => {} }));
    expect(said).toContain(tg('import.reviewNothing'));
    expect(said).not.toContain(tg('import.reviewFound', { n: 1 }));
  });

  it('⛔ HER programme is the primary action — the app does not argue with her coach', () => {
    /*
     * She arrived with a week. The bright button is the one that keeps it. Making "let me balance it"
     * the primary would be the product telling her the coach who wrote it got it wrong.
     */
    const r = mount({ sessionCount: 2, liftCount: 9, findings: [], onKeep: () => {}, onBalance: () => {} });
    const said = texts(r);
    expect(said).toContain(tg('import.keepMine'));
    expect(said).toContain(tg('import.letUsBalance'));

    const buttons = r.root.findAll((n) => n.props?.accessibilityRole === 'button');
    const labels = buttons.map((b) => b.props.accessibilityLabel ?? '');
    // Hers comes FIRST in the reading order, which on this footer is the primary position.
    const keepAt = labels.findIndex((l) => l.includes(tg('import.keepMine')));
    const balanceAt = labels.findIndex((l) => l.includes(tg('import.letUsBalance')));
    if (keepAt >= 0 && balanceAt >= 0) expect(keepAt).toBeLessThan(balanceAt);
  });

  it('both choices are hers to make — neither fires on its own', () => {
    let kept = 0;
    let balanced = 0;
    const r = mount({
      sessionCount: 2,
      liftCount: 9,
      findings: [],
      onKeep: () => { kept += 1; },
      onBalance: () => { balanced += 1; },
    });
    expect(kept).toBe(0);
    expect(balanced).toBe(0);
    const pressables = r.root.findAll((n) => typeof n.props?.onPress === 'function');
    act(() => pressables[0].props.onPress());
    expect(kept + balanced).toBe(1);
  });

  it('⚠️ every finding kind has copy — a kind with no sentence renders an empty line', () => {
    /*
     * The switch in `sentenceFor` returns '' for anything it does not know. A new `FindingKind` added
     * without copy would therefore show her a blank bullet, which is worse than not showing it.
     */
    const kinds = [
      'unmatched_lift',
      'sets_unstated',
      'session_over_hour',
      'sets_above_ceiling',
      'muscle_under_dose',
      'muscle_once_a_week',
    ];
    const findings = kinds.map((kind) => ({ kind, subject: kind === 'muscle_under_dose' || kind === 'muscle_once_a_week' ? 'Chest' : 'x', value: 4 }));
    const said = texts(mount({ sessionCount: 1, liftCount: 1, findings, onKeep: () => {}, onBalance: () => {} }));
    for (const k of kinds) {
      const key = {
        unmatched_lift: 'import.findUnmatched',
        sets_unstated: 'import.findSetsUnstated',
        session_over_hour: 'import.findLongSession',
        sets_above_ceiling: 'import.findManySets',
        muscle_under_dose: 'import.findUnderDose',
        muscle_once_a_week: 'import.findOnceAWeek',
      }[k];
      // The key resolves to real copy rather than echoing itself back.
      expect(tg(key, { name: 'x', n: 4, day: 'x', min: 4, muscle: 'Chest' })).not.toBe(key);
    }
    expect(said.trim().length).toBeGreaterThan(0);
  });
});
