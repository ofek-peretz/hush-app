/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE REVIEW IS TOLD THE TRUTH, AND DECIDES FOR ITSELF (founder, 2026-09-28).
 *
 * *"כן, תכתוב לסקירה פרומפט ייעודי אבל אל תשפיע על ההחלטות של הבינה אלא תן לה את חופש הפעולה על
 * סמך מה שהמשתמש מזין לבינה."*
 *
 * The plan review was sent the retired coach's 19,687-character doctrine, which contradicted itself
 * and the review's own schema. `domain/reviewPrompt` replaced it. This law holds what it must stay:
 *
 *   1. It is the review's prompt — the coach doctrine is not in it, nor fields the reply cannot have.
 *   2. It carries no coaching opinion: no checklist, no "should" — only what is true.
 *   3. What it says each edit does is what the app does (driven through `applyPlanSuggestion`).
 *   4. Every day carries HER number for it, the empty ones too — the day an edit lands on.
 *   5. Her words go last, labelled as hers; her language is named.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { EXERCISES, isSwapOnly } from '@/data/exercises';
import { coachFacts } from '@/domain/coachFacts';
import { coachPlanFromProgram } from '@/domain/enginePlan';
import { addDay, addLift, blankDraft, togglePair, isPaired, BUILDER_SETS_DEFAULT, BUILDER_SETS_MAX, BUILDER_SETS_MIN } from '@/domain/planBuilder';
import { applyPlanSuggestion, PLAN_REVIEW_SCHEMA } from '@/domain/planReview';
import { reviewRequest } from '@/domain/reviewPrompt';
import type { Program } from '@/data/local/models';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const name = (l: string) => `Day ${l}`;

/** A week with a superset on day 1, an EMPTY day 2, and two lifts on day 3. */
function week(): Program {
  let d = blankDraft('law', name);
  d = addDay(addDay(d, name), name);
  d = addLift(addLift(addLift(d, 0, 'bb_bench_press'), 0, 'bb_row'), 0, 'lateral_raise');
  d = togglePair(d, 0, 0);
  return addLift(addLift(d, 2, 'bb_back_squat'), 2, 'leg_curl');
}

function request(draft: Program, ask?: string, language = 'he') {
  const profile = { sex: 'female', weightKg: 62, repBand: '8-12', healthConnected: false } as never;
  const facts = coachFacts({ profile, plan: coachPlanFromProgram(draft, []), history: [], language } as never);
  return reviewRequest({ facts, draft, ...(ask ? { ask } : {}) });
}
const text = (r: ReturnType<typeof request>) => r.blocks.map((b) => b.text).join('\n');
const sheet = (r: ReturnType<typeof request>) =>
  JSON.parse(/HER SHEET:\n(.*)\n/.exec(r.blocks[1].text)![1]) as { programme: { number: number; name: string; items: unknown[] }[] };

describe('1 · it is the review’s own prompt', () => {
  const all = text(request(week(), 'שנה משהו'));

  it('the review is asked with it, and the coach doctrine no longer has a review branch', () => {
    const wire = read('src/platform/coach/planReview.ts');
    expect(wire).toContain('reviewRequest({ facts, draft,');
    expect(wire).not.toMatch(/coachRequest\(/);
    expect(read('src/domain/coachPrompt.ts')).not.toMatch(/case 'plan_review'|kind: 'plan_review'/);
  });

  it('carries none of the retired coach’s doctrine, and no field the reply cannot have', () => {
    for (const gone of ['You are Hush', 'WHAT YOU ARE FOR', 'YOUR HAND IS FREE', 'WHEN SHE IS HURT', '"sessions"', '"next"', '"hurts"', '"learned"', '"brief" is your only memory']) {
      expect({ gone, present: all.includes(gone) }).toEqual({ gone, present: false });
    }
    expect(all.length).toBeLessThan(16_000);
  });

  it('the cached half is first, identical for every athlete — her sheet and her words below it', () => {
    const a = request(week(), 'א');
    const b = request(addLift(week(), 2, 'db_curl'), 'ב', 'en');
    expect(a.blocks[0].text).toBe(b.blocks[0].text);
    expect(a.blocks[0].cache).toBe(true);
    expect(a.blocks[1].cache).toBeUndefined();
  });
});

describe('2 · ⛔ no coaching opinion — the decisions are the model’s', () => {
  it('no checklist, no "should", no verdict it is steered towards', () => {
    const stable = request(week()).blocks[0].text.split('\nCATALOGUE\n')[0];
    for (const opinion of ['coverage', 'balance', 'dose', 'improve', 'should', 'best', 'smallest set', 'respect', 'honest', 'verdict', 'not a doctor', 'safe']) {
      expect({ opinion, present: stable.toLowerCase().includes(opinion) }).toEqual({ opinion, present: false });
    }
  });

  it('an empty list is allowed, and said as a fact — never as the answer to give', () => {
    expect(request(week()).blocks[0].text).toContain('It may be empty.');
  });
});

describe('3 · what it says each edit does is what the app does', () => {
  const stable = request(week()).blocks[0].text;

  it('every verb the schema allows is described, with the builder’s own numbers', () => {
    for (const verb of PLAN_REVIEW_SCHEMA.properties.suggestions.items.properties.do.enum) {
      expect({ verb, described: stable.includes(`· "${verb}" — `) }).toEqual({ verb, described: true });
    }
    expect(stable).toContain(`with ${BUILDER_SETS_DEFAULT} working sets`);
    expect(stable).toContain(`(${BUILDER_SETS_MIN} to ${BUILDER_SETS_MAX})`);
  });

  it('"add" goes at the end of the day with the default sets — and not twice on one day', () => {
    const w = week();
    const after = applyPlanSuggestion(w, { day: 3, do: 'add', ex: 'db_curl', say: 'x' });
    const last = after.days[2].slots[after.days[2].slots.length - 1];
    expect(last.exerciseId).toBe('db_curl');
    expect(last.setCount).toBe(BUILDER_SETS_DEFAULT);
    expect(applyPlanSuggestion(after, { day: 3, do: 'add', ex: 'db_curl', say: 'x' })).toEqual(after);
  });

  it('"swap" keeps the seat and its sets; "to" already on the day is refused', () => {
    const w = applyPlanSuggestion(week(), { day: 3, do: 'sets', ex: 'leg_curl', n: 5, say: 'x' });
    const swapped = applyPlanSuggestion(w, { day: 3, do: 'swap', ex: 'leg_curl', to: 'seated_leg_curl', say: 'x' });
    expect(swapped.days[2].slots[1]).toMatchObject({ exerciseId: 'seated_leg_curl', setCount: 5 });
    expect(applyPlanSuggestion(w, { day: 3, do: 'swap', ex: 'leg_curl', to: 'bb_back_squat', say: 'x' })).toEqual(w);
  });

  it('"pair" moves "to" under "ex" and supersets them; a lift already in one is refused', () => {
    const w = addLift(week(), 2, 'db_curl');
    const paired = applyPlanSuggestion(w, { day: 3, do: 'pair', ex: 'bb_back_squat', to: 'db_curl', say: 'x' });
    expect(paired.days[2].slots.map((s) => s.exerciseId).slice(0, 2)).toEqual(['bb_back_squat', 'db_curl']);
    expect(isPaired(paired, 2, 0)).toBe(true);
    expect(applyPlanSuggestion(w, { day: 1, do: 'pair', ex: 'bb_bench_press', to: 'lateral_raise', say: 'x' })).toEqual(w);
  });

  it('the catalogue is every lift the app knows — the easier versions included', () => {
    const lines = stable.split('\nCATALOGUE\n')[1].split('\n').map((l) => l.split(' = ')[0]);
    const every = EXERCISES.filter((e) => !e.id.startsWith('_')).map((e) => e.id);
    expect(lines.sort()).toEqual([...every].sort());
    expect(every.some(isSwapOnly)).toBe(true);
  });
});

describe('4 · ⛔ every day carries HER number for it — the day an edit lands on', () => {
  it('an empty day in the middle keeps its place, so day 3 is her third day', () => {
    const w = week();
    const days = sheet(request(w)).programme;
    expect(days.map((d) => d.number)).toEqual([1, 2, 3]);
    expect(days[1]).toEqual({ number: 2, name: w.days[1].name, items: [] });
    expect(days[2].name).toBe(w.days[2].name);
    // …and an edit written against that number lands there.
    const after = applyPlanSuggestion(w, { day: days[2].number, do: 'remove', ex: 'leg_curl', say: 'x' });
    expect(after.days[2].slots.map((s) => s.exerciseId)).toEqual(['bb_back_squat']);
  });

  it('the prompt says so', () => {
    expect(request(week()).blocks[0].text).toContain('Every day carries "number", its number in her week: the "day" of');
  });
});

describe('5 · her words last and labelled; her language named', () => {
  it('what she asked is the last block, labelled as hers', () => {
    const r = request(week(), 'יש לי כאב בכתף');
    expect(r.blocks[r.blocks.length - 1].text).toBe('WHAT SHE ASKED FOR, in her own words:\nיש לי כאב בכתף');
  });

  it('with nothing asked, she asked for an opinion — and nothing more is said about what to think', () => {
    const r = request(week());
    expect(r.blocks[r.blocks.length - 1].text).toBe('She asked for your opinion of this week, without a request of her own.');
  });

  it('her language is named, not tagged', () => {
    expect(request(week()).blocks[1].text).toContain('she reads this app in HEBREW ("he")');
    expect(request(week(), undefined, 'en').blocks[1].text).toContain('she reads this app in ENGLISH ("en")');
  });
});
