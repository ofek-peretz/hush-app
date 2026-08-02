/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH SEES THE REST OF HER WEEK.
 *
 * Founder, 2026-08-02: *"for a footballer — if he turns the watch on during football training, is
 * there a way for the coach to analyse his cardio data and say something about it? And for every
 * sport that involves aerobic work?"*
 *
 * There was not. `ranOwn` carries only what OUR cardio stage recorded, so a ninety-minute match on
 * his wrist did not exist: the coach wrote him a heavy leg day for the morning after, believing he
 * had rested for two days, and every part of that decision was defensible from the sheet it had.
 *
 * ⚠️ THIS REOPENS A RATIFIED RULING — "HealthKit is NOT a model input" (§10.3) — and the reason it
 * survives reopening is that the ruling's own reason did not: it was written when the ENGINE decided
 * everything, and it said "the model's only inputs are actual weight and actual reps". True of a
 * progression model. The opposite of true for a coach, whose first question about a flat athlete is
 * what else she has been doing. Nothing here touches a load.
 *
 * ── THE ONE THAT WOULD HAVE BITTEN ──────────────────────────────────────────────────────────────
 * Her own runs come back through this read too, once the cardio stage writes to Health. A coach told
 * she ran twice on Tuesday would cut her week for a rest she never needed. The de-duplication is by
 * START INSTANT and nothing else: two recorders of one movement disagree by a percent on distance
 * and by seconds on duration, and agree on when it began.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { coachFacts } from '@/domain/coachFacts';
import { preamble } from '@/domain/coachPrompt';
import type { Profile, CardioActivity } from '@/data/local/models';
import type { ExternalWorkout } from '@/platform/health/healthModel';

const profile: Profile = {
  sex: 'male', weightKg: 78, units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: true,
};

const MATCH: ExternalWorkout = {
  kind: 'soccer', at: '2026-08-01T18:00:00.000Z', minutes: 92, kcal: 890, avgHr: 148, km: 9.4,
};

const sheet = (external?: ExternalWorkout[], cardio?: CardioActivity[]) =>
  coachFacts({ profile, plan: null, history: [], ...(external ? { external } : {}), ...(cardio ? { cardio } : {}) });

describe('what her watch recorded reaches the coach', () => {
  it('carries the match, with what the watch actually measured', () => {
    const f = sheet([MATCH]);
    expect(f.alsoDid).toEqual([{ kind: 'soccer', at: MATCH.at, minutes: 92, kcal: 890, avgHr: 148, km: 9.4 }]);
  });

  it('says nothing at all for an athlete with no watch', () => {
    // Absent, not empty: "she has no Health connection" and "she did nothing" are different claims,
    // and only one of them is ours to make.
    expect('alsoDid' in sheet()).toBe(false);
    expect('alsoDid' in sheet([])).toBe(false);
  });

  it('⚠️ never counts her OWN run twice', () => {
    // The same 5 km, recorded by our stage and by Health. One movement, one line.
    const mine: CardioActivity = {
      kind: 'cardio', id: 'c1', gait: 'run', startedAt: '2026-08-02T06:00:00.000Z',
      durationSec: 1620, distanceKm: 5.02, avgPaceSec: 323, splits: [],
    };
    const alsoFromHealth: ExternalWorkout = {
      // Two minutes apart and a different distance — the same run, as two recorders describe it.
      kind: 'running', at: '2026-08-02T06:02:00.000Z', minutes: 27, km: 5.05,
    };
    const f = sheet([alsoFromHealth, MATCH], [mine]);
    expect(f.alsoDid!.map((w) => w.kind)).toEqual(['soccer']);
    expect(f.ranOwn).toHaveLength(1);
  });

  it('keeps a workout that merely happened on the same DAY', () => {
    // The guard is a five-minute window around the start, not a date. She can run in the morning
    // and play in the evening, and both are hers.
    const mine: CardioActivity = {
      kind: 'cardio', id: 'c1', gait: 'run', startedAt: '2026-08-01T06:00:00.000Z',
      durationSec: 1620, distanceKm: 5, avgPaceSec: 324, splits: [],
    };
    expect(sheet([MATCH], [mine]).alsoDid).toHaveLength(1);
  });
});

describe('and the coach is told what to do with it', () => {
  it('names it, and says it is context rather than something to programme', () => {
    const text = preamble();
    expect(text).toContain('"alsoDid"');
    expect(text).toContain('you do not programme it');
  });
});
