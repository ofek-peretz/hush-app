// @ts-nocheck
// 
import { parseCoachPlan } from '@/domain/coachPlan';
import { coachFacts } from '@/domain/coachFacts';
import { db } from '@/data/local/db';
import type { Profile } from '@/data/local/models';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A HOLD IS A DECISION, AND IT EXPLAINS ITSELF LIKE ANY OTHER.
 *
 * ⛔ FOUND BY TESTING THE FOUNDER'S OWN FOUNDATION STONES, 2026-08-02. He listed the free hand
 * himself, and holding is on the list beside raising and lowering:
 *
 *   > *"if the system thinks it should go down — it may; if it thinks it should raise the weight —
 *   > it may; **if it thinks it should stay on the same weight — it may** […] therefore every
 *   > decision the system makes must explain why."*
 *
 * Asked to hold a load for a fortnight, the coach did it correctly: it attached NO programme,
 * because nothing changed and the prompt says not to re-send an unchanged week. And it wrote the
 * reason — *"staying at 40 so you can consolidate ten clean reps before we go up."*
 *
 * **The app threw the sentence away, in two places at once.** `parseCoachPlan` read `notes` a
 * hundred lines below its own early return for a turn with no `sessions`, and `recordCoachAnswer`
 * returned before writing them. So the one decision she is least able to understand on her own —
 * nothing visibly happened — was the one decision that arrived at the "Why?" screen as silence.
 *
 * The shape is the same one the brief already had to solve: **the turns that decide nothing are not
 * the turns that carry nothing.**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const profile: Profile = { sex: 'male', units: 'kg', daysPerWeek: 2, healthConnected: false };
const facts = coachFacts({ profile, plan: null, history: [], language: 'he' });

/** What the coach actually returned when asked to hold — prose and reason, no programme. */
const HELD = JSON.stringify({
  say: 'הבנתי, נישאר עם 40 ק״ג בלחיצת החזה בשבועיים הקרובים.',
  notes: [{ ex: 'bb_bench_press', say: 'מחזיק על 40 כדי לבסס 10 חזרות נקיות בכל הסטים לפני שנעלה.' }],
});

describe('a turn that changes nothing', () => {
  beforeEach(() => db.clearAll());

  it('⚠️ its reason survives the parse', () => {
    const r = parseCoachPlan(HELD, facts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // No programme — correct, and the point.
    expect(r.answer.plan).toBeNull();
    // …and the reason is still here.
    expect(r.answer.notes).toEqual([
      { ex: 'bb_bench_press', say: 'מחזיק על 40 כדי לבסס 10 חזרות נקיות בכל הסטים לפני שנעלה.' },
    ]);
  });

  it('⚠️ its reason reaches the log the "Why?" screen reads', async () => {
    const r = parseCoachPlan(HELD, facts);
    if (!r.ok) throw new Error('unparseable');
    await db.recordCoachAnswer(r.answer, '2026-08-02T20:00:00.000Z');

    const log = await db.loadCoachLog();
    expect(log.map((d) => ({ ex: d.ex, say: d.say }))).toEqual([
      { ex: 'bb_bench_press', say: 'מחזיק על 40 כדי לבסס 10 חזרות נקיות בכל הסטים לפני שנעלה.' },
    ]);
  });

  it('and a turn that truly says nothing writes nothing', async () => {
    // The guard on the other side: an ordinary answered question is not a decision, and a log full
    // of chat would bury the decisions it exists to hold.
    const r = parseCoachPlan(JSON.stringify({ say: 'כן, ריצה ביום שאין אימון זה בסדר גמור.' }), facts);
    if (!r.ok) throw new Error('unparseable');
    await db.recordCoachAnswer(r.answer, '2026-08-02T20:00:00.000Z');
    expect(await db.loadCoachLog()).toEqual([]);
  });

  it('a plan still carries its own reasons, exactly as before', async () => {
    // The fix must not have moved them off the programme — both paths write to the same log.
    const withPlan = JSON.stringify({
      say: 'הורדתי ל-37.5.',
      sessions: [{ name: 'A', blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 37.5 }] }] }],
      notes: [{ ex: 'bb_bench_press', say: 'חוזרים למשקל שבו העבודה הייתה נקייה.' }],
    });
    const r = parseCoachPlan(withPlan, facts);
    if (!r.ok) throw new Error('unparseable');
    await db.recordCoachAnswer(r.answer, '2026-08-02T20:00:00.000Z');
    expect((await db.loadCoachLog()).map((d) => d.say)).toEqual(['חוזרים למשקל שבו העבודה הייתה נקייה.']);
  });
});
