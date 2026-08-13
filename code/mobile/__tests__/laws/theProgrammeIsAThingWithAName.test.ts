// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';
import { parseCoachPlan, COACH_PLAN_SCHEMA } from '@/domain/coachPlan';
import { preamble } from '@/domain/coachPrompt';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SHE RECEIVES IS A THING WITH A NAME.
 *
 * ⛔ FOUNDER, 2026-08-04, on the product feeling like a generic AI app:
 *
 *   > *"My model from the start of development was to be the SPOTIFY of the fitness world, and right
 *   > now I don't recognise my product."*
 *
 * The sharpest thing about Discover Weekly is not the algorithm. It is that what arrives is a MADE
 * OBJECT — a name, a cover, a shape — and the intelligence behind it is invisible. **A playlist
 * without a name is a list of songs.** Hush already had the week. It did not have the thing that
 * turns a week into a programme she is ON: something to call it.
 *
 * ── ⚠️ OPTIONAL ON PURPOSE ──────────────────────────────────────────────────────────────────────
 * A coach forced to name everything writes "Your Personalized Fitness Journey". `title` is optional
 * in the schema, absent is a real state, and every surface falls back to what it drew before. That
 * is what keeps the name meaning something when it IS there.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const reply = (extra: Record<string, unknown>) => JSON.stringify({
  say: 'x',
  sessions: [{ name: 'Upper A', blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 40 }] }] }],
  ...extra,
});

describe('the name travels with the programme', () => {
  it('⛔ is parsed onto the plan', () => {
    const r = parseCoachPlan(reply({ title: 'Twelve weeks to the half', why: 'You gave me a date, so the lifting serves the running.' }));
    expect(r.ok).toBe(true);
    expect(r.ok && r.answer.plan).toMatchObject({
      title: 'Twelve weeks to the half',
      why: 'You gave me a date, so the lifting serves the running.',
    });
  });

  it('⚠️ an empty title is dropped, not stored as ""', () => {
    // A blank title is worse than none: every surface would draw an empty heading where it used to
    // fall back to something sensible.
    const r = parseCoachPlan(reply({ title: '   ', why: '' }));
    expect(r.ok && r.answer.plan).not.toHaveProperty('title');
    expect(r.ok && r.answer.plan).not.toHaveProperty('why');
  });

  it('and a plan with no title parses exactly as before', () => {
    const r = parseCoachPlan(reply({}));
    expect(r.ok).toBe(true);
    expect(r.ok && r.answer.plan).not.toHaveProperty('title');
  });

  it('⚠️ the coach commits to the name BEFORE it writes the week', () => {
    /*
     * `propertyOrdering` is what the model fills in, in order. A title written after the sessions is
     * a label stuck on afterwards; one written before is a decision the programme then serves.
     */
    const keys = Object.keys(COACH_PLAN_SCHEMA.properties);
    expect(keys.indexOf('title')).toBeLessThan(keys.indexOf('sessions'));
    expect(keys.indexOf('why')).toBeLessThan(keys.indexOf('sessions'));
  });

  it('is not required — the coach may have nothing worth calling it', () => {
    expect(COACH_PLAN_SCHEMA.required).toEqual(['say']);
  });
});

describe('the prompt asks for a name that could only be hers', () => {
  it('⛔ says what a title IS, and forbids one that fits anybody', () => {
    expect(preamble()).toMatch(/never one that would fit any athlete/);
  });

  it('and says when to send it, so it is not rewritten every week', () => {
    // A name that changes weekly was never a name; one that never changes is one she stops reading.
    expect(preamble()).toMatch(/Send both on the FIRST[\s\S]{0,20}programme, then only when the direction changes/);
  });

  it('⚠️ demonstrates no title — the founder\'s own ruling on examples', () => {
    // `thePromptShowsNoExamples` holds the general case; this is the instance for the newest field.
    expect(preamble()).not.toMatch(/"title"\s*:\s*"/);
  });
});

describe('and it reaches two screens, not one', () => {
  it('⛔ the programme she just received carries it', () => {
    /*
     * ⛔ THE NAME IS THE ENGINE'S NOW (founder 2026-08-10, option b). The coach's `title` and `why`
     * were what made a programme a thing with a name; the coach is out of the build, so the name is
     * composed from the two facts that made her week HERS — how it splits, and what she leads with.
     *
     * ⚠️ AND THE `why` LINE IS GONE WITH NO REPLACEMENT, deliberately. A generated sentence about why
     * this week suits her would be a claim nothing measured. The name states the shape; it does not
     * argue for it.
     */
    const src = read('src/screens/onboarding/ProgramCreated.tsx');
    expect(src).toContain('{named ? (');
    expect(src).toContain('programmeName(');
    /*
     * ⚠️ MATCHED AGAINST CODE, NOT PROSE. The file's header still EXPLAINS what `coachPlan` was and
     * why it went — an assertion that cannot tell an explanation from an instruction fails on its own
     * documentation, which this one did on its first run.
     */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('coachPlan');
  });

  it('⛔ …and NOT on Today, which is the screen that has to be about today', () => {
    /*
     * ════ THIS LAW USED TO REQUIRE THE OPPOSITE, AND BOTH VERSIONS ARE RIGHT IN THEIR TURN ════
     *
     * It asserted `programTitle={coachPlan?.title ?? null}` on `Home` and a 38px serif drawing it —
     * won on 2026-08-04, when Today led with "MONDAY · UP NEXT" and could not answer *what am I on?*
     * at all.
     *
     * ⛔ FOUNDER, 2026-08-12, after measuring the finished screen: *"תוריד את שם התוכנית."*
     *
     * The fix outgrew its reason. A programme's name never changes, and it was taking **50 pixels of
     * the first fold, every morning, for the life of the programme** — above a week whose first
     * workout began a fifth of the way down the screen. The same argument that put it there (*a
     * screen should be biggest where it changes*) is what took it away one level up.
     *
     * ⚠️ THE NAME IS NOT DELETED FROM THE PRODUCT, and that distinction is the whole of this file.
     * `ProgramCreated` hands it to her by name the day it is made — the beat that turns a week into
     * a thing she was given — and `programmeName` composes it from the programme rather than from a
     * model. What went is a permanent fact charging daily rent.
     */
    expect(read('src/screens/home/Home.tsx')).not.toMatch(/programTitle=\{/);
    expect(read('src/screens/home/HomeView.tsx')).not.toMatch(/styles\.programName/);
    // …and Today leads with the week it is in, not with a caption about the programme.
    expect(read('src/screens/home/HomeView.tsx')).toContain("t('home.weekLabel', { n: props.weekNumber })");
  });

  it('⛔ …but NOT the coach’s paragraph, because the engine does not write one', () => {
    /*
     * ════ THIS ASSERTION USED TO REQUIRE A LINE THAT COULD ONLY EVER BE NULL ════
     *
     * It read: *"…and its REASON with it, which is the half that was never drawn anywhere she
     * looks"* — and it pinned `programWhy={coachPlan?.why ?? null}` into `Home.tsx`. True when the
     * coach wrote the programme and wrote a paragraph about it. **`domain/enginePlan` leaves `why`
     * deliberately absent** (R7: Hush never states a reason it did not measure), so from the day the
     * engine took the week that expression was null on every device in existence.
     *
     * ⚠️ SO THE LAW WAS GREEN ON A DEAD LINE, and the only place the paragraph was ever seen again
     * was a gallery fixture that invented one — *"You gave me a date, so the lifting serves the
     * running…"* — which is what the founder read on 2026-08-12 and asked about. A law that checks a
     * prop is WIRED cannot tell you whether anything ever arrives through it.
     *
     * The NAME is real and is asserted above: `enginePlan` sets `title` from `programmeName`. The
     * reason is refused, and this is now the assertion that keeps it refused rather than the one
     * that demanded it.
     */
    expect(read('src/domain/enginePlan.ts')).toContain('`why` is left absent');
    expect(read('src/screens/home/Home.tsx')).not.toMatch(/programWhy=\{/);
  });

  it('and both fall back cleanly when there is no name', () => {
    // The absent case is the common one for an athlete whose coach has not renamed her programme.
    expect(read('src/screens/home/HomeView.tsx')).toContain("`${restWeekday} · ${t('home.upNext')}`");
  });
});
