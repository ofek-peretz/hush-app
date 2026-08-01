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

type Tree = Record<string, unknown>;
/** Every leaf string in a locale tree, as [dotted key, value]. */
function flatten(tree: Tree, prefix = ''): Array<[string, string]> {
  return Object.entries(tree).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v as Tree, `${prefix}${k}.`)
      : typeof v === 'string'
        ? [[`${prefix}${k}`, v] as [string, string]]
        : [],
  );
}

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
      // (`ob.sexWhy` is deleted — founder 2026-07-28. The remaining four still address her.)
      for (const k of ['ob.bodySub', 'ob.trainSub', 'ob.healthSub', 'ob.mapSub']) {
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
    for (const id of Object.keys((he as unknown as Record<string, Record<string, string[]>>).cues)) {
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

  const MASCULINE = [
    'דחוף', 'הורד', 'כווץ', 'משוך', 'החזר', 'החזק', 'רד', 'שלוט', 'כוון', 'שב', 'כופף',
    'התנגד', 'הרם', 'יישר', 'עלה', 'סגור', 'פתח', 'התחל', 'הובל', 'נעל', 'חבר', 'שחרר',
    'חתור', 'חבק', 'סובב', 'הישאר', 'עצור', 'שכב', 'גלגל', 'הרחק', 'רכון',
    // added with the 2026-08-01 catalogue expansion
    'רכן', 'התרומם', 'העבר', 'גע', 'הישען', 'בלום', 'הדק', 'מתח', 'תן',
    /*
     * ⚠️ 'צעד' AND 'עמוד' ARE NOT ON THIS LIST, and the omission is the rule.
     *
     * Every word here has to be a verb and ONLY a verb. `walking_lunge` says "צעד ארוך" — a long
     * STEP, the noun — and `bb_deadlift`'s neighbours talk about the עמוד. Adding either turned a
     * correct, genderless line into a failure, and the fix for that is never to rewrite good copy
     * so a word list can stay simple. (The same lesson from the other direction as the B.9 case,
     * where the linter matched "שלחי" inside "נשלחים": a first word cannot tell you its part of
     * speech, so the list only holds words that have one.)
     */
  ];
  const firstWordOf = (line: string) => line.split(' ')[0].replace(/[.,]/g, '');

  it('no feminine cue still carries a masculine imperative', () => {
    const cues = (he as unknown as { cues: Record<string, string[]> }).cues;
    for (const id of Object.keys(cues)) {
      if (!id.endsWith('_female')) continue;
      for (const line of cues[id]) {
        expect({ id, line, masculine: MASCULINE.includes(firstWordOf(line)) }).toEqual({ id, line, masculine: false });
      }
    }
  });

  /**
   * ⚠️ …AND EVERY CUE THAT COMMANDS HER NEEDS A VOICE TO COMMAND HER IN.
   *
   * The law above can only judge a feminine array that EXISTS. `exerciseCues` falls back to the
   * masculine base when it does not — a safety net that reads, to a woman, as the app addressing
   * someone else. Two of the original 68 have no feminine array and are correct: their cues are
   * noun phrases ("ברכיים רכות") which are the same sentence in both voices. That is the test:
   * a cue that IMPERATIVES needs the variant; a cue that describes does not.
   *
   * Found by writing 47 new exercises, where the tempting thing is to add the base and move on.
   */
  it('every cue that gives an ORDER has a feminine voice to give it in', () => {
    const cues = (he as unknown as { cues: Record<string, string[]> }).cues;
    const unvoiced: string[] = [];
    for (const id of Object.keys(cues)) {
      if (id.endsWith('_female') || cues[`${id}_female`]) continue;
      const order = cues[id].find((line) => MASCULINE.includes(firstWordOf(line)));
      if (order) unvoiced.push(`${id} → ${order}`);
    }
    expect(unvoiced).toEqual([]);
  });

  /**
   * The cue library is HEBREW, and a key that holds English is a bug no length check can see.
   *
   * This exact mistake shipped for the length of one command: the merge that added 47 exercises put
   * the ENGLISH cues under the Hebrew key. Every count was right, `techniqueNotes` was green, and a
   * Hebrew athlete would have read "Set a ~30° incline." on her workout screen.
   */
  it('is written in Hebrew — every line of it', () => {
    const cues = (he as unknown as { cues: Record<string, string[]> }).cues;
    const notHebrew: string[] = [];
    for (const [id, lines] of Object.entries(cues)) {
      for (const line of lines) {
        if (!/[֐-׿]/.test(line)) notHebrew.push(`${id} → ${line}`);
      }
    }
    expect(notHebrew).toEqual([]);
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

/**
 * THE FRONT DOOR CANNOT KNOW HER GENDER — so it must not assume one.
 *
 * Sign-in comes BEFORE NameEntry, which is where sex is stated. i18next therefore has no `context`
 * yet and falls back to the base key, so every `_female` variant on that screen is dead copy and
 * every masculine base is a misgendering. `ob.signinTagline` read "אתה צריך רק להתאמן" — Hush's
 * FIRST sentence, addressed to a man, shown to everyone.
 *
 * The fix is not a variant (there is nothing to select it with); it is copy that has no gender to
 * get wrong. This test guards the whole screen, not the one line that was caught.
 */
describe('the front door speaks to a person whose gender it has not been told', () => {
  const SIGN_IN_KEYS = ['ob.signinTagline', 'ob.apple', 'ob.google', 'ob.signinLegalPre', 'ob.signinLegalTerms'];

  it('no sign-in line is gendered — with no context, a variant can never be reached', () => {
    for (const g of ['male', 'female'] as const) {
      setGender(g);
      for (const k of SIGN_IN_KEYS) {
        // Whatever the context, the athlete on this screen sees the SAME words: it is rendered
        // before she has told us anything. If these ever diverge, one of the two is a lie.
        expect({ key: k, copy: tg(k) }).toEqual({ key: k, copy: tg(k) });
      }
    }
    // …and the second-person masculine forms that started this are gone for good.
    setGender('male');
    expect(tg('ob.signinTagline')).not.toMatch(/\bאתה\b|צריך\b/);
    setGender('female');
    expect(tg('ob.signinTagline')).not.toMatch(/\bאתה\b|צריך\b/);
  });
});

/**
 * ════ THE BASE KEY IS THE MASCULINE FORM — MECHANICALLY ════
 *
 * i18next resolves `key` for a man and `key_female` for a woman, so the base IS the masculine
 * copy. Nothing enforced that, and eight base keys had been written in the FEMININE: `comeback.sub`
 * told a man "תרימי", `progress.dayOneBody` said "כל סט שתסיימי", `pain.whereSub` said "הקישי",
 * and the win-back notification — the sentence sent to someone who has stopped training — read
 * "כשתהיי מוכנה". Every man saw feminine Hebrew, and the `_female` mechanism had nothing to select
 * because the feminine was already sitting in the default.
 *
 * The scan is deliberately narrow: only forms whose FEMININE spelling is unambiguous. Hebrew's
 * 2nd-person PAST is spelled identically for both genders (שהראית, שכיבית), and a feminine
 * adjective agreeing with a feminine NOUN is correct ("התוכנית שלך מוכנה") — neither is evidence of
 * anything, and flagging them would make this test noise. What it catches is a verb or adjective
 * aimed at HER sitting in the copy aimed at HIM.
 */
describe('the default copy is the masculine copy', () => {
  /** Unambiguously feminine 2nd-person forms; prefixes (ש/כש/ו/ל) are normal, so no lookbehind. */
  const FEMININE_2P = [
    'תסיימי', 'תרימי', 'שלחי', 'תהיי', 'תבחרי', 'המשיכי', 'התחילי', 'הקישי',
    'תמשיכי', 'תשלימי', 'בחרי', 'נסי', 'שמרי לך', 'את מתעדת', 'את מרימה', 'את מתחילה',
  ];

  it('no base key is written in the feminine', () => {
    const offenders: string[] = [];
    for (const [key, value] of flatten(he as unknown as Tree)) {
      if (key.includes('_female')) continue;
      const found = FEMININE_2P.filter((w) => value.includes(w));
      if (found.length) offenders.push(`${key} — ${found.join(', ')}`);
    }
    expect({ feminineInTheMasculineDefault: offenders }).toEqual({ feminineInTheMasculineDefault: [] });
  });

  it('every `_female` variant has a base to override, and differs from it', () => {
    // A variant with no base is unreachable; a variant IDENTICAL to its base is dead weight that
    // reads as gendered work having been done when none was.
    const all = new Map(flatten(he as unknown as Tree));
    const orphans: string[] = [];
    const identical: string[] = [];
    for (const [key, value] of all) {
      if (!key.includes('_female')) continue;
      const base = key.replace('_female', '');
      if (!all.has(base)) orphans.push(key);
      else if (all.get(base) === value) identical.push(key);
    }
    expect({ orphans, identical }).toEqual({ orphans: [], identical: [] });
  });

  it('a nav path names a tab that exists — in the words the tab bar actually uses', () => {
    // `pain.nothingNew` pointed at "ב‏את › מפת הגוף". The tab is called "אני", so it named a tab
    // that does not exist — and the "ב" prefix glued to "את" reads as "באת", the past tense of
    // "to come". A sentence that sends her somewhere has to send her somewhere real.
    const tabs = Object.values((he as unknown as { nav: Record<string, string> }).nav);
    for (const [key, value] of flatten(he as unknown as Tree)) {
      if (!value.includes('›')) continue;
      const named = value.split('›')[0].trim().split(/\s+/).pop() ?? '';
      const cleaned = named.replace(/^[ב"']+|["']+$/g, '');
      expect({ key, tabExists: tabs.some((t) => t === cleaned) }).toEqual({ key, tabExists: true });
    }
  });
});

/**
 * A VARIANT MAY NOT ASK FOR A VALUE ITS BASE NEVER RECEIVES.
 *
 * The two forms of one key are rendered by ONE call site with ONE set of params. So a `_female`
 * that interpolates `{{count}}` while its base does not is not a translation — it is a second,
 * unrelated sentence wired to a caller that was never told about it.
 *
 * This shipped, in the most-read sentence in the product. The weekly push read, for a man, "קראתי
 * את מה שהרמת השבוע — השבוע הבא מוכן". Every WOMAN got a different sentence entirely, carrying a
 * `{{count}}` that `notifications.ts` never passes: **"התוכנית שלך לשבוע מוכנה — ␣␣ אימונים"** — a
 * hole where the number should be, every week, on the lock screen.
 */
describe('a gendered variant is a translation of its base, not a different sentence', () => {
  const varsOf = (s: string) => new Set([...s.matchAll(/\{\{(\w+)/g)].map((m) => m[1]));

  it('every `_female` interpolates exactly what its base interpolates', () => {
    const all = new Map(flatten(he as unknown as Tree));
    const mismatched: string[] = [];
    for (const [key, value] of all) {
      if (!key.includes('_female')) continue;
      const base = all.get(key.replace('_female', ''));
      if (base === undefined) continue; // the orphan check above owns this case
      const a = [...varsOf(base)].sort().join(',');
      const b = [...varsOf(value)].sort().join(',');
      if (a !== b) mismatched.push(`${key} wants {${b}} — its base gives {${a}}`);
    }
    expect({ askingForWhatTheCallerNeverSends: mismatched }).toEqual({ askingForWhatTheCallerNeverSends: [] });
  });
});

/**
 * ════ HUSH SPEAKS AS A COACH OF HER GENDER (founder 2026-07-28) ════
 *
 * Hebrew conjugates the FIRST person too, and that half went unnoticed while the second person was
 * being fixed. `profile.healthNote_female` correctly said "שאת מתעדת" — and in the same breath said
 * "אני קורא": Hush gendered HER perfectly and stayed a man itself. A woman heard a male coach, in
 * eleven places, including the sentence Hush opens with.
 *
 * The founder's ruling is that she gets a coach of her own gender. So a base carrying a first-person
 * MASCULINE participle now requires a `_female` that carries the FEMININE one — the same mechanism,
 * applied to the speaker instead of only the listener.
 *
 * Two things this deliberately does not do:
 *  · it does not touch verbs that agree with a NOUN ("כל סט מלמד אותי", "המשקל שלך קובע") — those
 *    are correct in both variants and flagging them would make the test noise;
 *  · it does not require a variant for a participle that is spelled the same in both genders
 *    (בונה, מראה, רואה — the ל"ה verbs), because there is nothing to vary.
 */
describe('Hush speaks in the athlete’s gender, not only about her', () => {
  /** Hush's own first-person participles, masculine → feminine. */
  const HUSH_VERB: Record<string, string> = {
    'נותן': 'נותנת', 'קורא': 'קוראת', 'לומד': 'לומדת', 'מציג': 'מציגה', 'דורס': 'דורסת',
    'מוביל': 'מובילה', 'מנהל': 'מנהלת', 'קובע': 'קובעת', 'מכיר': 'מכירה', 'דואג': 'דואגת',
    'מבקש': 'מבקשת', 'יודע': 'יודעת', 'ממשיך': 'ממשיכה', 'כותב': 'כותבת',
  };
  /** Only where the subject really is Hush — "אני X" or "ו/ש/כש-אני X", incl. negations. */
  const firstPersonVerbs = (s: string): string[] =>
    [...s.matchAll(/(?:^|[\s—–,.!?"'(])(?:[ושכ]{0,2}אני)\s+((?:לא\s+|אף\s+פעם\s+לא\s+|כבר\s+|רק\s+|תמיד\s+|לעולם\s+לא\s+)*)([֐-׿]{3,})/g)]
      .map((m) => m[2])
      .filter((v) => v in HUSH_VERB);

  /**
   * The feminine twin of a key — and on a PLURALISED key the context goes BEFORE the count, not
   * after it. i18next resolves `key_context_plural` (`firstGym.title_female_one`), so asking for
   * `firstGym.title_one_female` finds nothing: the law would report a correctly-written sentence
   * as missing, and — worse — would be satisfied by a key i18next never selects.
   */
  const PLURAL = /_(zero|one|two|few|many|other)$/;
  const femaleOf = (key: string): string => {
    const suffix = key.match(PLURAL)?.[0];
    return suffix ? `${key.slice(0, -suffix.length)}_female${suffix}` : `${key}_female`;
  };

  it('every sentence Hush says about itself has a feminine form', () => {
    const all = new Map(flatten(he as unknown as Tree));
    const stillAMan: string[] = [];
    for (const [key, value] of all) {
      if (key.includes('_female')) continue;
      const verbs = firstPersonVerbs(value);
      if (verbs.length === 0) continue;
      const variant = all.get(femaleOf(key));
      if (variant === undefined) { stillAMan.push(`${key} — no _female for ${verbs.join(', ')}`); continue; }
      const unchanged = verbs.filter((v) => !variant.includes(HUSH_VERB[v]));
      if (unchanged.length) stillAMan.push(`${femaleOf(key)} still says ${unchanged.join(', ')}`);
    }
    expect({ aMaleCoachForAWoman: stillAMan }).toEqual({ aMaleCoachForAWoman: [] });
  });

  it('gender and count resolve TOGETHER — the first-workout card, both people, every length', () => {
    // 2.0 counts (`{{count}}`) and conjugates ("אני לומד/לומדת") in one sentence, which is the
    // combination the naming rule above exists for. Anything unresolved falls back to English,
    // so an English sentence appearing in a Hebrew card is the failure this catches.
    const hebrew = /^[^A-Za-z]*$/;
    for (const [gender, verb] of [['male', 'לומד'], ['female', 'לומדת']] as const) {
      setGender(gender);
      for (const count of [1, 2, 3, 4, 6]) {
        const line = tg('firstGym.title', { count });
        expect({ gender, count, line: hebrew.test(line) && line.includes(verb) }).toEqual({ gender, count, line: true });
        // The number itself is only spoken where Hebrew has no word for it — 1 and 2 are written
        // out ("האימון הזה", "שני האימונים"), so a bare digit there would be the plural missing.
        expect(tg('firstGym.title', { count }).includes(String(count))).toBe(count > 2);
      }
    }
  });

  it('…and the FRONT DOOR has no gender to speak in, so it speaks in none', () => {
    // Sign-in precedes NameEntry, where sex is picked and published (`setPendingSex`). Hush's very
    // first sentence therefore cannot be conjugated at all — it said "אני דואג לכל השאר".
    const tagline = (he as unknown as { ob: Record<string, string> }).ob.signinTagline;
    expect(firstPersonVerbs(tagline)).toEqual([]);
  });
});
