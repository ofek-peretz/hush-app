/**
 * GENDERED HEBREW — the whole chain (founder 2026-07-12).
 *
 * Hebrew conjugates the second person, so the app cannot address an athlete at all until it
 * knows who it is speaking to. `i18n/gender.ts` publishes that, `useCopy` feeds it to i18next as
 * `context`, and `tg()` does the same for the callers that are not screens (notifications, the
 * rest haptics, the Live Activity — the exact places that were still saying "התכונן" to a woman).
 *
 * The cue library is the one surface that CANNOT ride on `context`: the cues are an indexed array,
 * and a context suffix would ask for `cues.bb_bench_press.0_female` — a path that cannot exist
 * inside a JSON array. It selects the feminine ARRAY instead. This file pins all of it, because
 * the failure mode is silent: the wrong gender is not an error, it is just wrong.
 */
import i18next from 'i18next';
import { initI18n, tg } from '@/i18n';
import { setGender, getGender, resetGender } from '@/i18n/gender';
import { exerciseCues } from '@/data/exercises';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';

beforeAll(async () => {
  await initI18n();
  await i18next.changeLanguage('he');
});

afterEach(() => {
  resetGender();
});

describe('the store', () => {
  it('defaults to masculine — the app as it shipped, for an athlete we do not know', () => {
    expect(getGender()).toBe('male');
  });

  it('an unknown sex is masculine, never a crash and never a guess', () => {
    setGender(undefined);
    expect(getGender()).toBe('male');
    setGender(null);
    expect(getGender()).toBe('male');
  });
});

describe('tg() — the copy that does not go through a screen', () => {
  it('conjugates the rest-over notification for the athlete it is buzzing', () => {
    setGender('male');
    const m = tg('notifications.restWarnBody');
    setGender('female');
    const f = tg('notifications.restWarnBody');
    expect(m).toContain('התכונן');
    expect(f).toContain('התכונני');
    expect(m).not.toEqual(f);
  });

  it('leaves an ungendered line alone in both persons', () => {
    setGender('male');
    const m = tg('notifications.restDoneTitle');
    setGender('female');
    expect(tg('notifications.restDoneTitle')).toEqual(m);
  });

  it('interpolates while it conjugates (the two must not fight)', () => {
    setGender('female');
    expect(tg('workout.setOfM', { n: 2, m: 4 })).toContain('2');
  });
});

/**
 * THE VERBS THE ATHLETE PRESSES (founder 2026-07-13). A woman picked "נקבה" and the button under
 * her thumb still said "המשך", and Home still said "התחל אימון". The buttons are where the app
 * addresses her most often and most directly — they were the last masculine surface left.
 */
describe('the buttons speak to the person who is pressing them', () => {
  it('onboarding Continue is המשיכי for a woman', () => {
    setGender('male');
    expect(tg('ob.continue')).toBe('המשך');
    setGender('female');
    expect(tg('ob.continue')).toBe('המשיכי');
  });

  it("Home's Begin / Continue conjugate too — with the workout's name intact", () => {
    setGender('female');
    expect(tg('home.begin', { name: 'Push A' })).toContain('התחילי');
    expect(tg('home.begin', { name: 'Push A' })).toContain('Push A');
    expect(tg('home.continueWorkout', { name: 'Push A' })).toContain('המשיכי');
  });

  /**
   * The law is WITH, not AT — Hush never makes the athlete its object ('אותך').
   *
   * It used to also require the exact phrase 'להתחיל איתך', which pinned ONE SENTENCE rather than
   * the law. That sentence ("With these I know where to start you — the loads that athletes built
   * like you actually lift") was cut on 2026-07-17 under the founder's ruling that a caption which
   * explains a control nobody asked about is a caption nobody reads: three wheels labelled Age /
   * Height / Weight do not need two lines of preamble. The replacement states the fact and stops.
   *
   * The ban survives, in every locale key that addresses her — a positive phrase-match would only
   * ever pin the current wording again.
   */
  it("Hush never makes the athlete its object — 'אותך' appears nowhere", () => {
    for (const g of ['male', 'female'] as const) {
      setGender(g);
      for (const k of ['ob.bodySub', 'ob.sexWhy', 'ob.trainSub', 'ob.healthSub', 'ob.mapSub']) {
        expect({ key: k, copy: tg(k) }).toEqual({ key: k, copy: expect.not.stringContaining('אותך') });
      }
    }
  });
});

describe('the cue library — the imperatives', () => {
  const BENCH = 'bb_bench_press';

  it('commands a man in the masculine', () => {
    setGender('male');
    expect(exerciseCues(BENCH).join(' ')).toContain('הורד');
  });

  it('commands a woman in the feminine', () => {
    setGender('female');
    const cues = exerciseCues(BENCH).join(' ');
    expect(cues).toContain('הורידי');
    expect(cues).not.toContain('הורד '); // the masculine command is gone, not merely joined
  });

  it('a gender-neutral cue is IDENTICAL in both — we never author a second copy of the same line', () => {
    // "רגליים נטועות ברצפה." is a body-part note, not a command: it has no gender to get wrong.
    setGender('male');
    const m = exerciseCues(BENCH);
    setGender('female');
    const f = exerciseCues(BENCH);
    expect(m[0]).toEqual(f[0]);
  });

  it('an exercise with no feminine variant falls back to its cue, never to English or to nothing', () => {
    setGender('female');
    for (const id of Object.keys((he as Record<string, Record<string, string[]>>).cues)) {
      if (id.endsWith('_female')) continue;
      const cues = exerciseCues(id);
      // Every cue resolves to a real Hebrew line — never a raw dotted key, never empty.
      for (const c of cues) {
        expect(c).toBeTruthy();
        expect(c.startsWith('cues.')).toBe(false);
      }
    }
  });

  it('EVERY feminine array has the same length as the masculine one it replaces', () => {
    // A short feminine array would silently drop a cue for half the athletes.
    const cues = (he as unknown as { cues: Record<string, string[]> }).cues;
    for (const id of Object.keys(cues)) {
      if (!id.endsWith('_female')) continue;
      const base = id.slice(0, -'_female'.length);
      expect({ id, len: cues[id].length }).toEqual({ id, len: cues[base].length });
    }
  });

  it('no feminine cue still carries a masculine imperative', () => {
    const MASCULINE = [
      'דחוף', 'הורד', 'כווץ', 'משוך', 'החזר', 'החזק', 'רד', 'שלוט', 'כוון', 'שב', 'כופף',
      'התנגד', 'הרם', 'יישר', 'עלה', 'סגור', 'פתח', 'התחל', 'הובל', 'נעל', 'חבר', 'שחרר',
      'חתור', 'חבק', 'סובב', 'הישאר', 'עצור', 'שכב', 'גלגל', 'הרחק', 'רכון',
    ];
    const cues = (he as unknown as { cues: Record<string, string[]> }).cues;
    for (const id of Object.keys(cues)) {
      if (!id.endsWith('_female')) continue;
      for (const line of cues[id]) {
        const firstWord = line.split(' ')[0].replace(/[.,]/g, '');
        expect({ id, line, masculine: MASCULINE.includes(firstWord) }).toEqual({ id, line, masculine: false });
      }
    }
  });
});

describe('English is untouched by any of it', () => {
  it('has no gendered variants at all — the language does not need them', () => {
    const walk = (node: unknown, path: string, out: string[]): void => {
      if (node && typeof node === 'object' && !Array.isArray(node)) {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          if (k.endsWith('_female')) out.push(path ? `${path}.${k}` : k);
          walk(v, path ? `${path}.${k}` : k, out);
        }
      }
    };
    const found: string[] = [];
    walk(en, '', found);
    expect(found).toEqual([]);
  });
});
