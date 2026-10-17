/**
 * ⛔ THE DAY IS NAMED IN HER LANGUAGE — AND STORED IN THE ENGINE'S (founder 2026-09-28, approving the
 * Today review: Hebrew day names on the first screen of the app).
 *
 * The local week names its days "Upper A", "Lower B", "Full Body C". Those strings are KEYS — the
 * engine seats the weekly core by parsing them and `healWeekCompletion` matches a finished session to
 * its day by them — so they stay English on disk and become words only where something draws them
 * (`i18n/dayTitle`). This law holds both halves: the words, and the keys still matching.
 */
import fs from 'fs';
import path from 'path';

import { initI18n, setLocale } from '@/i18n';
import { dayTitle, sameDayName } from '@/i18n/dayTitle';
import { healWeekCompletion } from '@/domain/weekCadence';
import he from '@/i18n/locales/he.json';

const ROOT = path.join(__dirname, '..', '..');

/** A Hebrew translator over the real locale file — the words she would read. */
function heT(key: string, opts?: Record<string, unknown>): string {
  const raw = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], he);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? ''));
}

describe('⛔ the day is named in her language', () => {
  /*
   * ⚠️ AMENDED 2026-09-30 (design audit; the founder's free hand). The letter used to be KEPT Latin —
   * "פלג עליון A" — and it was the one foreign glyph in a Hebrew serif title on the app's first screen,
   * while the voice already said it as "אלף". A Hebrew name counts its days in Hebrew letters now.
   */
  it("the engine's three day shapes read in Hebrew, the letter in Hebrew too", () => {
    expect(dayTitle('Upper A', heT)).toBe('פלג עליון א׳');
    expect(dayTitle('Lower B', heT)).toBe('פלג תחתון ב׳');
    expect(dayTitle('Full Body C', heT)).toBe('גוף מלא ג׳');
  });

  it('a Hebrew name the model wrote with a Latin letter reads in Hebrew; an English name is left alone', () => {
    expect(dayTitle('עליון A', heT)).toBe('עליון א׳');
    expect(dayTitle('כוח B', heT)).toBe('כוח ב׳');
    for (const name of ['Push A', 'Workout B', 'אימון רגליים', 'עליון א׳']) expect(dayTitle(name, heT)).toBe(name);
  });

  it('a name the model wrote, or she typed, is hers and passes through untouched', () => {
    for (const name of ['Upper body strength', 'אימון רגליים', 'Push A', 'Workout A', '']) {
      expect(dayTitle(name, heT)).toBe(name);
    }
    expect(dayTitle(null, heT)).toBe('');
  });

  it('a translator that is not up yet leaves the name as it was, never blank', () => {
    expect(dayTitle('Upper A', () => '')).toBe('Upper A');
    expect(dayTitle('Upper A', (k) => k)).toBe('Upper A');
  });

  it('every surface that draws a day name draws it through `dayTitle`', () => {
    const read = (f: string) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    // Today, the watch lobby and the standalone wrist plan all read `coachWorkouts`.
    expect(read('screens/home/Home.tsx')).toMatch(/coachWeek\(coachPlan\)\.map\(\(w\) => \(\{ \.\.\.w, name: dayTitle\(w\.name\) \}\)\)/);
    // The mirror twice (wrist + lock screen + island), the saved frame, the summary, and the resume line.
    expect(read('state/stores/sessionStore.tsx').match(/workoutName: dayTitle\(/g)?.length).toBe(5);
    expect(read('components/WeekColumn.tsx')).toMatch(/bidi\(dayTitle\(w\.name\)\)/);
    expect(read('screens/program/ProgramTab.tsx')).toMatch(/bidi\(dayTitle\(w\.name\)\)/);
    expect(read('screens/session/WellDone.tsx')).toMatch(/bidi\(dayTitle\(workoutName\)\)/);
    expect(read('screens/history/History.tsx')).toMatch(/dayTitle\(sessionDayName\(s\)\)/);
  });
});

describe('⛔ …and the keys still match', () => {
  beforeAll(async () => {
    await initI18n();
    await setLocale('he');
  });
  afterAll(async () => {
    await setLocale('en');
  });

  it('a session the wrist saved under the DRAWN name still finishes its day', () => {
    expect(dayTitle('Upper A')).toBe('פלג עליון א׳');
    expect(sameDayName('פלג עליון א׳', 'Upper A')).toBe(true);
    expect(sameDayName('פלג עליון א׳', 'Lower A')).toBe(false);
    // …and one an OLDER build's wrist saved under the Latin letter is still that same day.
    expect(sameDayName('פלג עליון A', 'Upper A')).toBe(true);
    expect(sameDayName('פלג עליון A', 'פלג עליון א׳')).toBe(true);
    expect(sameDayName('פלג עליון A', 'Lower A')).toBe(false);

    const program = {
      days: [
        { id: 'day_1', name: 'Upper A', completed: false, exercises: [] },
        { id: 'day_2', name: 'Lower A', completed: false, exercises: [] },
      ],
    } as never;
    const now = Date.parse('2027-01-15T10:00:00Z');
    const set = { exerciseId: 'bb_bench_press', actualReps: 8, actualWeight: 60 };
    // The wrist drew "פלג עליון A" from the lobby and recorded the workout under it.
    const session = {
      id: 's1',
      programDayId: 'coach_0',
      programDayName: 'פלג עליון A',
      startedAt: '2027-01-15T08:00:00Z',
      state: 'SAVED',
      prescribed: 2,
      finishedByAthlete: true,
      sets: [set, set],
    } as never;
    const healed = healWeekCompletion(program, [session], now - 3_600_000 * 24, now) as { days: { completed: boolean }[] } | null;
    expect(healed?.days.map((d) => d.completed)).toEqual([true, false]);
  });
});
