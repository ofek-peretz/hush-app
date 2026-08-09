/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH REMEMBERS WHO SHE IS.
 *
 * Founder, 2026-08-02, asking the question this file answers: *"will it not hallucinate over years,
 * given the way we work with it? are we giving it everything it needs to manage the athlete as well
 * as possible?"*
 *
 * It was never going to hallucinate. It was going to FORGET, and the audit found the mechanism.
 *
 * ── WHAT WAS BROKEN ─────────────────────────────────────────────────────────────────────────────
 * The prompt has always told the coach: *"her goal, her history, her injuries are in `brief`."*
 * `domain/athleteBrief` was written for it and imported by nobody. **No caller ever passed it.** The
 * field was empty on every call this product has ever made.
 *
 * That is not a rough edge, because of what else is true:
 *
 *   · the transcript is capped at 40 turns (`COACH_THREAD_CAP`);
 *   · the decision log is capped at 60 (`COACH_LOG_CAP`), and holds decisions, not people;
 *   · **the post-session call sends no conversation at all** — only her record.
 *
 * So "I want to finish a half marathon", said once in the intake, had nowhere to live. Six months
 * later the coach is writing perfectly sound programmes for someone it knows nothing about, and
 * every one of them is defensible in isolation. There is no error state to see.
 *
 * ── AND IT IS THE SAME HOLE AS "REMEMBER WHAT I ASKED FOR" ──────────────────────────────────────
 * "Never give me lunges again." The app learns a standing substitute only from her SWAPPING one by
 * hand, twice (S-69). If she says it in words, the coach honours it that week and forgets it by
 * spring. One field fixes both, because both are the same fact: something true about her that is
 * not a number and not a set she performed.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { parseCoachPlan, COACH_BRIEF_LINES, COACH_BRIEF_LINE_MAX } from '@/domain/coachPlan';
import { coachFacts } from '@/domain/coachFacts';
import { coachRequest } from '@/domain/coachPrompt';
import { COACH_PLAN_SCHEMA } from '@/domain/coachPlan';
import { db } from '@/data/local/db';
import type { Profile } from '@/data/local/models';

const profile: Profile = {
  sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false,
};

const reply = (body: Record<string, unknown>) => JSON.stringify({ say: 'Noted.', ...body });
const HER = [
  'Goal: half marathon in April.',
  'Left shoulder since 2024 — no overhead pressing.',
  'Will not do lunges.',
];

beforeEach(async () => { await db.clearAll(); });

describe('the coach can write down who she is', () => {
  it('reads a brief off a turn that decided nothing', () => {
    // The shape of the turns that carry this: she answers a question, no programme attached.
    const r = parseCoachPlan(reply({ brief: HER }));
    expect(r.ok && r.answer.brief).toEqual(HER);
    expect(r.ok && r.answer.plan).toBeNull();
  });

  it('never lets an empty brief erase the one that is stored', () => {
    // The single way this field can LOSE information instead of carrying it: a turn that sends
    // nothing would overwrite everything the coach has ever learned about her.
    for (const empty of [[], ['', '   ']] as string[][]) {
      const r = parseCoachPlan(reply({ brief: empty }));
      expect({ empty, kept: r.ok && 'brief' in r.answer }).toEqual({ empty, kept: false });
    }
  });

  it('⚠️ caps it — the first live call wrote 7,883 characters of the same fact repeating', () => {
    // `MAX_TOKENS`, a truncated reply, and NO programme on a turn whose `say` promised one. The cap
    // is enforced here as well as declared in the schema, because a cap the answerer can ignore is
    // not a cap either.
    const r = parseCoachPlan(reply({ brief: Array.from({ length: 50 }, () => 'x'.repeat(400)) }));
    expect(r.ok && r.answer.brief!.length).toBe(COACH_BRIEF_LINES);
    expect(r.ok && r.answer.brief!.every((l) => l.length <= COACH_BRIEF_LINE_MAX)).toBe(true);
  });

  it('⚠️ tells the MODEL the bound, in the one field the Worker forwards', () => {
    // The runaway happened because the only cap was in our parse and in prose. `maxItems` is the
    // bound the schema translator actually passes to Gemini — `maxLength` is dropped on the way.
    const brief = (COACH_PLAN_SCHEMA.properties as Record<string, Record<string, unknown>>).brief;
    expect({ type: brief.type, maxItems: brief.maxItems }).toEqual({ type: 'array', maxItems: COACH_BRIEF_LINES });
  });
});

describe('and it survives to the next call', () => {
  it('⚠️ is written even when the turn decided NOTHING — which is most of them', async () => {
    // The turns that teach the coach who she is are answers, not programmes. Writing the brief only
    // alongside a plan would drop exactly the turns it exists for.
    await db.recordCoachAnswer({ plan: null, brief: HER }, '2026-08-02T10:00:00.000Z');
    expect(await db.loadCoachBrief()).toEqual(HER);
  });

  it('is replaced whole by a later turn, never merged', async () => {
    // A merge is a second opinion about what the coach meant. It rewrites; we store what it wrote.
    await db.recordCoachAnswer({ plan: null, brief: HER }, '2026-08-02T10:00:00.000Z');
    await db.recordCoachAnswer({ plan: null, brief: ['Marathon now.', 'Shoulder cleared.'] }, '2026-09-02T10:00:00.000Z');
    expect(await db.loadCoachBrief()).toEqual(['Marathon now.', 'Shoulder cleared.']);
  });

  it('⚠️ reaches the MESSAGE — the sheet is where it has to end up, not the database', () => {
    // The whole defect was a field that existed everywhere except in the bytes that were sent.
    const facts = coachFacts({ profile, plan: null, history: [], brief: HER });
    const sent = coachRequest({ facts, ask: { kind: 'after_session' } })
      .blocks.map((b) => b.text)
      .join('\n');
    expect(sent).toContain('Goal: half marathon in April');
    expect(sent).toContain('Will not do lunges');
  });

  it('rides the call that has no conversation at all', () => {
    // The post-session call sends her record and nothing else — no turns, no transcript. If the
    // brief did not travel on THIS one, none of it would reach the decision that matters most.
    const blocks = coachRequest({
      facts: coachFacts({ profile, plan: null, history: [], brief: HER }),
      ask: { kind: 'after_session' },
    }).blocks;
    const sheet = blocks.find((b) => b.text.startsWith('HER RECORD'))!.text;
    expect(sheet).toContain('Left shoulder since 2024');
  });

  it('says nothing about her when there is nothing to say', () => {
    // A new athlete has no brief, and an absent one must not become an empty string on the sheet:
    // "I know nothing about her yet" and "I know that she is nothing" are different messages.
    const facts = coachFacts({ profile, plan: null, history: [] });
    expect('brief' in facts.athlete).toBe(false);
  });
});

describe('the coach is told what the field is for', () => {
  it('names the standing request, which is the half nothing else in the app can hold', () => {
    const { preamble } = require('@/domain/coachPrompt') as typeof import('@/domain/coachPrompt');
    const text = preamble();
    expect(text).toContain('"brief"');
    // The two things it must say: rewrite it whole, and only when it changed.
    expect(text.toLowerCase()).toContain('standing request');
    expect(text).toContain(String(COACH_BRIEF_LINES));
  });
});
