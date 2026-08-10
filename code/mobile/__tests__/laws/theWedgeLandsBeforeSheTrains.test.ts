// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE THING THAT MAKES THIS PRODUCT DIFFERENT IS ON THE FIRST SCREEN SHE MEETS.
 *
 * ⛔ FOUNDER'S PLAN, move 4: *"the advantage has to show up in the first 60 seconds — before she
 * closes the app for the first time."*
 *
 * The four-week simulation produced this on the FIRST programme, before she had trained once:
 *
 *   > *"landmine_press → Replaces barbell overhead press to allow overhead pushing without shoulder
 *   > clicking."*
 *
 * That is the whole wedge. Every app can hand her a plan; Fitbod hands her a plan. **Only one that
 * decided the programme can tell her why a lift is in it.** And she never saw it: `notes` went to
 * the coach log, which surfaces in the Why sheet and the Saturday letter — one behind a tap, the
 * other six days away.
 *
 * ── ⚠️ A REASON IS NOT AN INSTRUCTION ───────────────────────────────────────────────────────────
 * The row shows both and they are different things. `say` is HOW to do the lift — "a rep short of
 * failure". A note is WHY the lift is there at all. Any app can write the first.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const week = () => read('src/components/PlanWeek.tsx');

describe('the coach\'s reason rides with the lift', () => {
  it('⛔ the week draws the plan notes, not just the item instructions', () => {
    expect(week()).toContain('const reasons = React.useMemo(');
    expect(week()).toContain('{reasons.get(r.exerciseId) ? (');
  });

  it('⚠️ and BOTH are shown — they answer different questions', () => {
    // Losing `say` to make room for the reason would trade "how hard" for "why" and leave her
    // without the one the coach writes on nearly every item.
    expect(week()).toContain('{rows[i]?.say ?');
    expect(week()).toContain('styles.reason');
  });

  it('is silent on a lift the coach did not explain', () => {
    // Most lifts need no defence. A row that says "—" where a reason would be is worse than a row
    // that says nothing: it advertises an absence.
    expect(week()).toMatch(/reasons\.get\(r\.exerciseId\) \? \(/);
  });

  it('takes the FIRST note per lift, so a repeated one cannot stack', () => {
    // The coach may write about the same lift twice across a week's decisions. Two italic lines
    // under one row reads as a stutter.
    expect(week()).toContain('if (n.ex && !m.has(n.ex)) m.set(n.ex, n.say);');
  });

  it('⚠️ wears the coach\'s own face, not the app\'s', () => {
    // The serif italic its notes carry on the Why sheet and in the Saturday letter. One voice with
    // one face everywhere it speaks — she never has to work out who is talking.
    expect(week()).toMatch(/reason: \{ fontFamily: font\.serif, fontStyle: 'italic'/);
  });

  it('⛔ and the screen it lands on is the one she meets first', () => {
    // `ProgramCreated` is the last step of onboarding — the plan, before she has trained once.
    /*
     * ⛔ `PlanWeek` IS GONE FROM THIS SCREEN (founder 2026-08-10) — nobody scrolled to it. The wedge
     * this law is about is the REASON riding with the lift, and it still lands where she meets it:
     * on Today and inside the session. What is asserted here is that she is not moved past her
     * programme unmet — she meets it by name.
     */
    expect(read('src/screens/onboarding/ProgramCreated.tsx')).not.toContain('<PlanWeek');
    expect(read('src/screens/onboarding/BuildingProgramme.tsx')).toContain("navigation.replace('ProgramCreated'");
  });

  it('⚠️ and it is visible in the gallery, which is how this was checked at all', () => {
    /*
     * 1.5 mounts `ProgramCreated`, which reads the plan from the db — and the harness has no db, so
     * the week it exists to present had never been visible in here. Same blind spot that hid the
     * coach disc and the wheel: what the gallery cannot drive, nobody looks at.
     */
    expect(read('src/screens/dev/gallery.tsx')).toContain("{ id: '1.5b'");
    expect(read('src/screens/dev/gallery.tsx')).toContain('Replaces barbell overhead press');
  });
});
