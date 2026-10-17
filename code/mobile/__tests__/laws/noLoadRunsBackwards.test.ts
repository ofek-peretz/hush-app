/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * NO LOAD IN THIS CATALOGUE MAY RUN BACKWARDS, AND NO STATION MAY CLAIM A WEIGHT IT DOES NOT HAVE.
 *
 * Two stations came back on 2026-08-02 (founder: *"these are common exercises — so if an athlete
 * wants to do them, they just don't exist? that isn't serious"*), and each is listed the way it is
 * for a reason that is invisible from the entry itself. Both are one careless edit from being
 * wrong, and neither would fail anything else in the suite.
 *
 * ── 1 · AN ASSIST MACHINE INVERTS THE LOAD AXIS ─────────────────────────────────────────────────
 * More weight on an assisted pull-up is EASIER. Everything in this app that reasons about a load
 * assumes the opposite: Loop 1 would answer a strong set by adding assistance, the rail would cap
 * her at her weakest, `observedLoads` would read a rising ladder as progress, and the milestone
 * ladders would celebrate it. So the assist machines carry NO load at all — they are bodyweight
 * lifts, and the coach says in words how much help to take.
 *
 * ── 2 · A SMITH CARRIAGE IS NOT AN OLYMPIC BAR ──────────────────────────────────────────────────
 * `barbell` means "20 kg plus what you put on it", and every figure the athlete reads includes that
 * 20. A Smith carriage is counterbalanced and runs 7–20 kg depending on the machine, so filing the
 * Smith as a barbell would add a fabricated 20 kg to every set she is shown, in every gym, for ever.
 * It is a plate-loaded machine: the plates are stated, and nothing else is claimed.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { EXERCISES, exerciseById } from '@/data/exercises';
import { startingWeight } from '@/domain/startingLoad';
import { loadSetup } from '@/domain/loadPresentation';

const ASSISTED = EXERCISES.filter((e) => e.id.startsWith('assisted_'));
const SMITH = EXERCISES.filter((e) => e.id.startsWith('smith_'));

describe('an assisted lift carries no load', () => {
  it('is in the catalogue at all — the standard tool for everyone who cannot yet do a pull-up', () => {
    expect(ASSISTED.map((e) => e.id).sort()).toEqual(['assisted_dip', 'assisted_pull_up']);
  });

  it('⚠️ never has a load to prescribe, in any of the four places one could appear', () => {
    for (const e of ASSISTED) {
      expect({ id: e.id, bodyweight: e.bodyweight, baseKg: e.baseKg, bwScaled: e.bwScaled })
        .toEqual({ id: e.id, bodyweight: true, baseKg: undefined, bwScaled: undefined });
      // …and the cold start agrees, for every athlete: there is no opening number to invert.
      expect({ id: e.id, opens: startingWeight(e, { sex: 'female', weightKg: 62 }) })
        .toEqual({ id: e.id, opens: null });
    }
  });

  it('is a REGRESSION, so a busy loaded lift is never answered with it', () => {
    // Offering the assist machine to someone whose bench is taken reads as the app losing
    // confidence in her. It is reachable the day she asks for it, and never before.
    for (const e of ASSISTED) expect({ id: e.id, regression: e.regression }).toEqual({ id: e.id, regression: true });
  });
});

describe('a Smith machine states its plates and claims nothing else', () => {
  it('is in the catalogue — the most-used rack in most gyms', () => {
    expect(SMITH.length).toBeGreaterThanOrEqual(5);
  });

  it('⚠️ is never filed as a BARBELL, which would add a bar weight that is not there', () => {
    for (const e of SMITH) {
      expect({ id: e.id, equipment: e.equipment, loadStyle: e.loadStyle })
        .toEqual({ id: e.id, equipment: 'machine', loadStyle: 'plate_loaded' });
    }
  });

  it('opens on a load she can physically build, and one that is only plates', () => {
    for (const e of SMITH) {
      const kg = startingWeight(e, { sex: 'female', weightKg: 62 })!;
      const setup = loadSetup(e.id, kg, 'kg')!;
      expect({ id: e.id, style: setup.style, buildable: setup.plates != null })
        .toEqual({ id: e.id, style: 'plate_loaded', buildable: true });
    }
  });
});

describe('the good morning is a lift again', () => {
  it('exists, and is the barbell hinge it always was', () => {
    // Deleted 2026-07-05 because a GENERATOR would assign it. There is no generator; a coach
    // decides who gets it, and an athlete can ask for it by name.
    const gm = exerciseById('good_morning')!;
    expect({ muscle: gm.muscle, pattern: gm.pattern, equipment: gm.equipment })
      .toEqual({ muscle: 'Hamstrings', pattern: 'hinge', equipment: 'barbell' });
  });
});
