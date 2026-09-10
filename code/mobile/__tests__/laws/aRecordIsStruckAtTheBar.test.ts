/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A RECORD IS STRUCK AT THE BAR — founder mandate, 2026-08-24 (the review's table-stakes row:
 * "PR וחגיגת שיאים — חלקי: אין רגע-שיא בתוך הסשן").
 *
 * ONE definition of "record", shared with the share card — the founder's own screenshot ("NEW
 * BEST · 60 kg" beside "PERSONAL BESTS 0") is what two definitions of "best" cost once. This law
 * holds the predicate and its boundaries:
 *   · strictly above a KNOWN peak, ≥1 real rep — a first-ever load is the CARD's record, never
 *     the beat's (a beat on every lift of session one is confetti, not information);
 *   · a warm-up bridge never strikes it; her live session's own sets are never their own baseline;
 *   · the beat SPEAKS even on a band-less step — a silence on a PR is the one silence nobody wants.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';
import { priorPeakKg, isRecordSet } from '@/domain/setRecord';
import type { Session } from '@/data/local/models';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const session = (id: string, sets: Partial<Session['sets'][number]>[]): Session =>
  ({
    id, programDayId: 'd', startedAt: '2026-08-01T10:00:00.000Z', state: 'SAVED', earlyFinish: false,
    sets: sets.map((s, i) => ({ exerciseId: 'bb_bench_press', setIndex: i, recommendedWeight: 60, recommendedReps: 8, actualWeight: 60, actualReps: 8, edited: false, persistedAt: '', ...s })),
  }) as unknown as Session;

describe('the peak is her logged past, working sets only, live session excluded', () => {
  it('reads the heaviest real set; warm-up bridges and zero-rep rows never count', () => {
    const history = [
      session('a', [{ actualWeight: 60 }, { actualWeight: 80, actualReps: 1 }]),
      session('b', [{ actualWeight: 100, isApproach: true, isWarmup: true }, { actualWeight: 90, actualReps: 0 }]),
    ];
    expect(priorPeakKg(history, 'bb_bench_press')).toBe(80);
    expect(priorPeakKg(history, 'bb_back_squat')).toBeNull(); // no past → no baseline
  });

  it('the live session is never its own baseline', () => {
    const history = [session('live', [{ actualWeight: 200 }]), session('old', [{ actualWeight: 80 }])];
    expect(priorPeakKg(history, 'bb_bench_press', 'live')).toBe(80);
  });
});

describe('the record speaks ONCE — on the set that struck it, never on the sets after it', () => {
  /*
   * The review find of 2026-08-24: with history alone as the baseline, the record repeated on
   * every set at the new weight — and a fact repeated on a fixed interval stops being read (the
   * house law, verbatim). The baseline is everything logged BEFORE the current set: history's
   * peak AND the live session's own earlier sets, composed by `recordBaselineKg`.
   */
  const { livePeakKg, recordBaselineKg } = require('@/domain/setRecord');
  const liveSet = (w: number, extra = {}) => ({ exerciseId: 'bb_bench_press', actualWeight: w, actualReps: 8, ...extra });

  it('set 1 strikes; sets 2–4 at the same new weight stay silent', () => {
    const historyPeak = 60;
    // Set 1 (nothing live yet): 62.5 > 60 → record.
    expect(isRecordSet(62.5, 8, recordBaselineKg(historyPeak, livePeakKg([], 'bb_bench_press')))).toBe(true);
    // Set 2 (set 1 logged): baseline is now 62.5 → silence.
    expect(isRecordSet(62.5, 8, recordBaselineKg(historyPeak, livePeakKg([liveSet(62.5)], 'bb_bench_press')))).toBe(false);
    // …but a HEAVIER set later in the same session strikes again — a second record is a second fact.
    expect(isRecordSet(65, 8, recordBaselineKg(historyPeak, livePeakKg([liveSet(62.5)], 'bb_bench_press')))).toBe(true);
  });

  it('the live peak ignores bridges and zero-rep rows, exactly like the history peak', () => {
    expect(livePeakKg([liveSet(100, { isApproach: true }), liveSet(90, { actualReps: 0 })], 'bb_bench_press')).toBeNull();
  });

  it('the view composes the baseline from BOTH halves — pinned where it is built', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).toContain('recordBaselineKg(');
    expect(store).toContain("livePeakKg(state.session?.sets ?? [], current.exerciseId)");
  });

  it('a wrist-logged record answers identically — same rule, either device', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).toContain('isRecordSet(weight, reps, view.priorPeakKg)');
    const flow = read('src/screens/session/SessionFlow.tsx');
    expect(flow).toContain("...(logged.record ? { record: true } : {})");
  });
});

describe('the strike rule — strictly above a known peak, at least one real rep', () => {
  it('82.5 over 80 strikes; 80 over 80 holds; a first-ever load is the card’s record, not the beat’s', () => {
    expect(isRecordSet(82.5, 1, 80)).toBe(true);
    expect(isRecordSet(80, 12, 80)).toBe(false);
    expect(isRecordSet(60, 8, null)).toBe(false);
    expect(isRecordSet(82.5, 0, 80)).toBe(false);
    expect(isRecordSet(null, 8, 80)).toBe(false);
  });
});

describe('the beat is wired, guarded, and never silent on a PR', () => {
  const flow = read('src/screens/session/SessionFlow.tsx');
  it('the stage asks the shared predicate, never a second definition', () => {
    expect(flow).toContain("isRecordSet(tgt.recommendedWeight, tgt.recommendedReps, session.priorPeakKg)");
    expect(flow).toContain('!session.setLabel?.warmup &&');
  });
  it('a record speaks even where no band exists — the fourth state is not silence', () => {
    /* Since the 2026-08-26 ruling every working set speaks (the capture is the beat), so a
       record cannot be silenced by the predicate; what can regress is the CROWN — the record
       line on the capture — and that is the probe now. */
    expect(flow).toContain('confirm.record ?');
    /* The record line rides UNCONDITIONALLY on both remaining beat states now (capture and
       lift-done), so the fourth-state guard is simply its presence in each. */
    expect((flow.match(/\{recordLine\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('the word exists in both of her languages', () => {
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    const he = JSON.parse(read('src/i18n/locales/he.json'));
    expect(en.workout.recordStruck).toBeTruthy();
    expect(he.workout.recordStruck).toBeTruthy();
  });
});
