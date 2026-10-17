/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ✦ THE WORKOUT ENDS ON WHAT COMES NEXT, AND PROGRESS OPENS ON HOW FAR SHE HAS COME (founder
 * 2026-09-28, approving the review: *"'בפעם הבאה' ו'מאז שהתחלת' — מאשר"*).
 *
 *   · Well Done's poster carries NEXT TIME — the engine's raises for her next visit, from the same
 *     record Today will print (never the last set repeated: that promise was once false).
 *   · The workout that closed her week says so ("Week complete") — the rotation's moment.
 *   · Progress opens on SINCE YOU STARTED — the three loaded lifts that moved most, start → now.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initI18n, tg } from '@/i18n';
import { SessionEarned } from '@/screens/session/WellDone';
import { ProgressLifts } from '@/screens/progress/ProgressLifts';

jest.mock('@/state/stores/appStore', () => ({ useApp: () => ({ profile: { units: 'kg' } }) }));
jest.mock('@/platform/telemetry', () => ({ track: async () => {} }));

const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
beforeAll(async () => {
  await initI18n();
});

function words(el): string {
  let r;
  act(() => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  const out: string[] = [];
  // One <Text> is one string however it is built inside: since 2026-09-29 a figure's separator is a
  // nested <Text> in the sans (`ds/Figure`), and "31.5" is still one number to a reader.
  const flat = (n) => (n == null ? '' : typeof n === 'string' ? n : Array.isArray(n) ? n.map(flat).join('') : (n.children ?? []).map(flat).join(''));
  const walk = (n) => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n.type === 'Text') return void out.push(flat(n));
    n.children?.forEach(walk);
  };
  walk(r.toJSON());
  act(() => r.unmount());
  return out.join(' | ').replace(/[⁦-⁩]/g, '');
}

const line = (key, from, to, held = false) => ({ key, name: key, from, to, held, reason: { key: 'explain.progressLoad.textMet', params: { delta: 2.5 } } });

function finish(over = {}) {
  return (
    <SessionEarned
      savedLegend="SAVED"
      partial={false}
      durationLabel="52"
      kcal={410}
      tonnes={4.2}
      poster={null}
      workoutName="Upper A"
      units="kg"
      decisions={[line('Bench', '80', '82.5'), line('Row', '60', '60', true), line('Squat', '100', '105'), line('Curl', '12', '13'), line('Press', '40', '42.5')]}
      volume={[]}
      onDone={() => {}}
      onRecord={() => {}}
      {...over}
    />
  );
}

describe('Well Done — next time', () => {
  it('the raises the engine decided, on the poster, three at most, holds left out', () => {
    const said = words(finish());
    expect(said.toUpperCase()).toContain(tg('complete.nextTime').toUpperCase());
    // Since 2026-09-29 (design audit) the RAISE is the figure and the landing rides under the
    // name: "Bench · 80 → 82.5 · +2.5 kg". The same three raises, the same holds left out.
    expect(said).toContain('80 → 82.5');
    expect(said).toContain('+2.5 kg');
    expect(said).toContain('100 → 105');
    expect(said).toContain('+5 kg');
    expect(said).toContain('12 → 13');
    expect(said).not.toContain('40 → 42.5'); // the fourth raise waits in the ledger
    expect(said).not.toContain('60 → 60'); // a hold is not "next time"
  });

  it('no raise, no block — a verdict it cannot state is not drawn', () => {
    const said = words(finish({ decisions: [line('Row', '60', '60', true)] }));
    expect(said.toUpperCase()).not.toContain(tg('complete.nextTime').toUpperCase());
  });

  it('the workout that closed her week says so', () => {
    expect(words(finish({ weekClosed: true })).toUpperCase()).toContain(tg('complete.weekClosed').toUpperCase());
    expect(words(finish()).toUpperCase()).not.toContain(tg('complete.weekClosed').toUpperCase());
  });
});

describe('Progress — since you started', () => {
  const AGG = { liftedKg: 5200, workouts: 9, weeks: 3, raises: 6, kcal: 3100, cardioKm: 0, minutes: 480, weeklyTonnes: [1, 2, 2] };
  const e = (exerciseId, a, b, mode = 'load') => ({ exerciseId, initialPeakKg: a, periodPeakKg: b, deltaKg: b - a, currentKg: b, mode });

  it('the three loaded lifts that moved most lead the page, biggest first', () => {
    const said = words(
      <ProgressLifts
        loaded
        units="kg"
        aggregate={AGG}
        entries={[e('db_curl', 10, 12), e('bb_back_squat', 80, 100), e('bb_bench_press', 60, 70), e('pull_up', 5, 9, 'reps'), e('lat_pulldown', 50, 55)]}
        onLog={() => {}}
      />,
    );
    const head = said.split(tg('progress.everyLift').toUpperCase())[0];
    expect(head.toUpperCase()).toContain(tg('progress.sinceStart').toUpperCase());
    expect(head).toContain('+20 kg');
    expect(head).toContain('+10 kg');
    expect(head).toContain('+5 kg');
    expect(head).not.toContain('+2 kg'); // the fourth waits in the table below
    expect(head.indexOf('+20 kg')).toBeLessThan(head.indexOf('+10 kg'));
  });

  it('on a first week, before anything has moved, it is simply not there', () => {
    const said = words(<ProgressLifts loaded units="kg" aggregate={AGG} entries={[e('bb_bench_press', 60, 60)]} onLog={() => {}} />);
    expect(said.toUpperCase()).not.toContain(tg('progress.sinceStart').toUpperCase());
  });
});
