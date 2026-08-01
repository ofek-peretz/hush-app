/**
 * ════ THE WATCH SPEAKS HER LANGUAGE, AND THE PHONE IS THE ONE THAT KNOWS IT ════
 *
 * The founder overturned his own ruling: *"about my decision on Hebrew — I'd like you to change it,
 * and do the same RTL as the phone."* `WatchCopy.swift` had said the opposite in its header for a
 * year: *"the watch target has no i18n runtime; v1 is English only, so these are constants."*
 *
 * The obvious implementation is a second copy of every string in Swift, keyed on locale. It is 111
 * constants — 222 strings, hand-maintained, in a language the copy lint cannot read, drifting from
 * `he.json` within a week. And Hebrew here is GENDERED: a Swift dictionary would either duplicate
 * `tg`'s machinery or address every woman as a man, on the surface she looks at most mid-workout.
 *
 * So the phone resolves the copy and sends it. That is the law the loads already follow — the phone
 * is the sole authority and the watch renders what it is handed (S-48). This stops making an
 * exception of words.
 */
import fs from 'fs';
import path from 'path';

import { I18nManager } from 'react-native';

import { initI18n, setLocale } from '@/i18n';
import { setGender } from '@/i18n/gender';
import { watchCopyPack, WATCH_TEMPLATE_KEYS } from '@/platform/watch/watchCopyPack';
import { makeStateEnvelope } from '@/platform/watch/protocol';
import en from '@/i18n/locales/en.json';
import he from '@/i18n/locales/he.json';

beforeAll(async () => {
  await initI18n();
});

describe('what crosses to the wrist', () => {
  it('sends every `watch.*` key BOTH copy files hold', () => {
    const sent = Object.keys(watchCopyPack().s).sort();
    // `_female` variants are not keys of their own — `tg` resolves them behind the base key.
    const base = (o: object) => Object.keys(o).filter((k) => !k.endsWith('_female')).sort();
    expect(sent).toEqual(base((en as { watch: object }).watch));
    expect(sent).toEqual(base((he as { watch: object }).watch));
  });

  it('⚠️ leaves NO string on the wrist that the phone cannot translate', () => {
    /*
     * This is the one that matters, and it is the one that will rot.
     *
     * `WatchCopy.swift` held 111 constants; `watch.*` held 43, and only 30 of those were the same
     * string. So a pack sent as-is would have translated less than a third of the wrist — and a
     * screen that is one-third Hebrew reads worse than one that is honestly English.
     *
     * A constant added to the Swift without a key here is invisible: it compiles, it renders, and
     * it is in the wrong language for exactly the athletes who asked for Hebrew.
     */
    const swift = fs.readFileSync(
      path.join(__dirname, '..', '..', 'targets', 'watch', 'WatchCopy.swift'), 'utf8',
    );
    const sent = new Set(Object.keys(watchCopyPack().s));
    const asked = [...swift.matchAll(/\bL\("(\w+)"/g)].map((m) => m[1]);
    expect(asked.length).toBeGreaterThan(100);
    expect(asked.filter((k) => !sent.has(k))).toEqual([]);
  });

  it('⚠️ keeps NO string on the wrist that does not go through the lookup', () => {
    /*
     * The other half, and the one a future edit will breach: a constant declared the OLD way —
     * `static let save = "Save"` — compiles, renders, and is in English for exactly the athletes
     * who asked for Hebrew. Nothing else would catch it.
     *
     * Lists of WIRE VALUES are not copy and are allowed: `painAreaValues` is what the wrist sends
     * BACK, and it is English on purpose.
     */
    const swift = fs.readFileSync(
      path.join(__dirname, '..', '..', 'targets', 'watch', 'WatchCopy.swift'), 'utf8',
    );
    const literals = [...swift.matchAll(/static (?:let|var) (\w+)[^\n]*= *"/g)].map((m) => m[1]);
    expect(literals).toEqual([]);
  });

  it('names the body map’s muscles in her language, keyed by the map’s own word', () => {
    // She taps "Chest"; the wire carries `Chest` and the phone needs no interpretation. What she
    // READS is the phone's own `muscle.*` — the same word the body map on the phone shows her.
    const m = watchCopyPack().m;
    expect(Object.keys(m).sort()).toEqual(Object.keys((en as { muscle: object }).muscle).sort());
  });

  it('keeps the placeholders in the strings that take one', () => {
    /*
     * "{{n}} lifts" travels as a TEMPLATE. The number is not known when the pack is built, and
     * rebuilding a hundred strings to change one would be absurd — so the watch substitutes, which
     * is a search-and-replace rather than an i18n runtime.
     *
     * Resolved eagerly they arrive as " lifts", with the number silently gone.
     */
    const s = watchCopyPack().s;
    for (const key of WATCH_TEMPLATE_KEYS) {
      expect({ key, hasPlaceholder: /\{\{\w+\}\}/.test(s[key]) }).toEqual({ key, hasPlaceholder: true });
    }
  });

  it('states the direction as a FACT rather than leaving the wrist to guess', () => {
    /*
     * A watch that infers direction from the characters it received gets it wrong on the first
     * mixed line — and every line here is mixed, because exercise names stay English by their own
     * ruling. The flag is the phone's own layout direction, which every screen on this side obeys.
     */
    expect(watchCopyPack().rtl).toBe(I18nManager.isRTL);
    expect(typeof watchCopyPack().locale).toBe('string');
  });
});

describe('it is HER copy, not the app’s', () => {
  it('resolves the gendered form, because Hebrew conjugates the second person', async () => {
    /*
     * A wrist handed the base form would address every woman as a man in every string — and the
     * base form IS the masculine one (the gender audit, 2026-07-28). This is the whole reason the
     * resolution has to happen on the phone rather than in a Swift dictionary.
     *
     * `swapHint` is the one `watch.*` string that currently conjugates. If a second is added this
     * test does not need to know; what it holds is that the pack went through `tg`.
     */
    await setLocale('he');
    setGender('female');
    const female = watchCopyPack().s;
    setGender('male');
    const male = watchCopyPack().s;
    expect(Object.keys(female)).toEqual(Object.keys(male));
    expect(female.swapHint).not.toBe(male.swapHint);
    await setLocale('en');
    setGender('male');
  });

  it('sends HER language, not the phone’s build language', async () => {
    await setLocale('he');
    expect(watchCopyPack().locale).toBe('he');
    expect(/[֐-׿]/.test(watchCopyPack().s.begin)).toBe(true);
    await setLocale('en');
  });
});

describe('how it travels', () => {
  it('rides the LOBBY envelope, never a mirror frame', () => {
    /*
     * A mirror is published many times a second during a rest. The pack is a kilobyte that changes
     * when she changes her language — which is to say almost never. The lobby is published on every
     * return to Today: often enough that a language change reaches the wrist before her next
     * workout, rare enough to cost nothing.
     */
    const withCopy = makeStateEnvelope(null, 1, Date.now(), { workoutId: null, workoutName: '', muscles: '' } as never, null, watchCopyPack());
    expect(withCopy.copy?.s.begin.length).toBeGreaterThan(0);
  });

  it('is OMITTED, not sent as null, when there is none', () => {
    // An older watch binary installs asynchronously from the phone app, so a phone that has updated
    // talks to an older wrist for a while. An absent field means "use the English you shipped
    // with"; a null field is a new shape for it to decode.
    const plain = makeStateEnvelope(null, 1, Date.now());
    expect('copy' in plain).toBe(false);
  });
});
