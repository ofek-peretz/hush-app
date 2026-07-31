import {
  athleteBrief,
  briefIsComplete,
  clampNeeds,
  missingFrom,
  ATHLETE_BRIEF_VERSION,
  type BriefNeeds,
} from '@/domain/athleteBrief';

/**
 * The brief is what a conversation leaves behind. Its whole design is a split, and these tests are
 * mostly about defending that split:
 *
 *   · `needs`  — the few facts a SCREEN reads. Short on purpose.
 *   · `brief`  — everything else, in the coach's own words, never parsed and never rendered.
 *
 * The moment anything here defines an enum of goals it has re-created the four-button picklist that
 * flattened "I want to be a better footballer" and "I have a wedding in four months" into the same
 * value. So there is a test for the absence of that, which is unusual and deliberate.
 */

const needs: BriefNeeds = { daysPerWeek: 4, minutes: 55, units: 'kg', weightKg: 62, sex: 'female' };

describe('what a conversation leaves behind', () => {
  it('keeps the handful of facts a screen actually reads', () => {
    const b = athleteBrief({ needs, brief: 'x', at: '2026-07-31T12:00:00.000Z' });
    expect(b.v).toBe(ATHLETE_BRIEF_VERSION);
    expect(b.needs).toEqual({ daysPerWeek: 4, minutes: 55, units: 'kg', weightKg: 62, sex: 'female' });
  });

  it('keeps everything else as the coach wrote it, untouched', () => {
    // Deliberately unstructured, deliberately specific. A form could not have held any of this.
    const brief =
      'Plays 5-a-side Thursdays, in season until March. Wants to stop getting outrun late in games. ' +
      'Right hamstring tweaked twice last year, both times sprinting cold. Hates machines, likes ' +
      'barbell work. Says the gym is 10 minutes from work so Tuesdays and Thursdays are realistic.';
    const b = athleteBrief({ needs, brief, at: '2026-07-31T12:00:00.000Z' });
    expect(b.brief).toBe(brief); // byte for byte — nothing summarises the summariser
  });

  it('stores no goal, no experience level and no computed score', () => {
    const b = athleteBrief({ needs, brief: 'anything', at: '2026-07-31T12:00:00.000Z' });
    const keys = Object.keys(b.needs);
    for (const banned of ['goal', 'experience', 'level', 'trainingAge', 'score', 'portrait']) {
      expect({ banned, present: keys.includes(banned) }).toEqual({ banned, present: false });
    }
    // The whole object is four things: a version, the app's needs, the coach's words, a timestamp.
    expect(Object.keys(b).sort()).toEqual(['at', 'brief', 'needs', 'v']);
  });

  it('sends nothing the conversation happened to accumulate', () => {
    const noisy = {
      ...needs,
      email: 'someone@example.com',
      transcript: ['every', 'message'],
      deviceId: 'ABC-123',
    } as unknown as BriefNeeds;
    const json = JSON.stringify(athleteBrief({ needs: noisy, brief: 'x', at: 'now' }));
    for (const leak of ['example.com', 'transcript', 'ABC-123']) {
      expect({ leak, present: json.includes(leak) }).toEqual({ leak, present: false });
    }
  });
});

describe('can the app draw a week yet', () => {
  it('names only what a SCREEN cannot do without', () => {
    expect(missingFrom({})).toEqual(['daysPerWeek', 'minutes', 'units']);
    expect(missingFrom({ daysPerWeek: 4, minutes: 55, units: 'kg' })).toEqual([]);
    expect(briefIsComplete(needs)).toBe(true);
  });

  it('does not require a bodyweight or a sex — she may decline both', () => {
    expect(briefIsComplete({ daysPerWeek: 3, minutes: 45, units: 'lb' })).toBe(true);
  });

  it('treats a nonsense number as missing rather than as an answer', () => {
    expect(missingFrom({ daysPerWeek: 0, minutes: 55, units: 'kg' })).toEqual(['daysPerWeek']);
    expect(missingFrom({ daysPerWeek: NaN, minutes: 55, units: 'kg' })).toEqual(['daysPerWeek']);
    expect(missingFrom({ daysPerWeek: 4, minutes: 55, units: 'stone' as never })).toEqual(['units']);
  });
});

describe('the bounds are about calendars and clocks, not training', () => {
  it('clamps a week to seven days and a session to a real length', () => {
    expect(clampNeeds({ ...needs, daysPerWeek: 12 }).daysPerWeek).toBe(7);
    expect(clampNeeds({ ...needs, daysPerWeek: 0 }).daysPerWeek).toBe(1);
    expect(clampNeeds({ ...needs, minutes: -30 }).minutes).toBe(10);
    expect(clampNeeds({ ...needs, minutes: 9999 }).minutes).toBe(240);
  });

  it('has NO opinion about anything a coach would actually decide', () => {
    // Two sessions a week of twenty minutes, and six of ninety, both pass untouched. If this file
    // ever starts nudging those it has become a second opinion about training.
    expect(clampNeeds({ ...needs, daysPerWeek: 2, minutes: 20 })).toMatchObject({ daysPerWeek: 2, minutes: 20 });
    expect(clampNeeds({ ...needs, daysPerWeek: 6, minutes: 90 })).toMatchObject({ daysPerWeek: 6, minutes: 90 });
  });

  it('clamps rather than rejects — a typo must not end the conversation', () => {
    // Rejecting would mean the intake failed over a slip and the athlete starts again.
    expect(() => athleteBrief({ needs: { ...needs, minutes: 0 }, brief: '', at: 'now' })).not.toThrow();
    expect(athleteBrief({ needs: { ...needs, minutes: 0 }, brief: '', at: 'now' }).needs.minutes).toBe(10);
  });
});
