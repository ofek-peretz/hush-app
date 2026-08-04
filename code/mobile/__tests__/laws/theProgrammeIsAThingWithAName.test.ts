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
    const src = read('src/screens/onboarding/ProgramCreated.tsx');
    expect(src).toContain('{coachPlan?.title ? (');
    expect(src).toContain('{coachPlan.why ? <Text style={styles.programWhy}>');
  });

  it('⚠️ and so does TODAY, where she looks every morning', () => {
    /*
     * Drawn only on the day it arrives, a name is an announcement rather than a thing she is doing.
     *
     * ⚠️ IT WAS THE EYEBROW AND IT IS THE HEADLINE NOW (founder 2026-08-04, the week-column
     * rebuild). Same law, moved up: the name went from replacing "MONDAY · UP NEXT" in the chrome's
     * mono to being the largest type on the screen, in the coach's serif. The old assertion pinned
     * `.toUpperCase()`, which was about the eyebrow's styling and not about the law at all.
     */
    expect(read('src/screens/home/Home.tsx')).toContain('programTitle={coachPlan?.title ?? null}');
    expect(read('src/screens/home/HomeView.tsx')).toContain('<Text style={styles.programName}');
    // …and its REASON with it, which is the half that was never drawn anywhere she looks.
    expect(read('src/screens/home/Home.tsx')).toContain('programWhy={coachPlan?.why ?? null}');
    expect(read('src/screens/home/HomeView.tsx')).toContain('<Text style={styles.programWhy}');
  });

  it('and both fall back cleanly when there is no name', () => {
    // The absent case is the common one for an athlete whose coach has not renamed her programme.
    expect(read('src/screens/home/HomeView.tsx')).toContain("`${restWeekday} · ${t('home.upNext')}`");
  });
});
