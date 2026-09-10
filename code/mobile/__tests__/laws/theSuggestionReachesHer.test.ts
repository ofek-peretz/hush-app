/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WE ASKED, WE PAID FOR THE ANSWER, AND NOBODY SHOWED IT TO HER.
 *
 * When a lift in her imported programme is not in our catalogue, `runImport` asks the model about it,
 * verifies every id it answers against the catalogue, drops anything invented, and writes a sentence
 * in her language explaining each one. Until 2026-08-16 **nothing rendered any of it**: the second
 * model call ran on every import with a leftover and its result was discarded, while
 * `importPrompt` said in its own header *"she taps to accept it"* — and the tap did not exist.
 *
 * ── WHY AN ACCEPT AND NOT AN AUTO-APPLY ─────────────────────────────────────────────────────────
 * A verified id proves the lift EXISTS. It does not prove it is the one she meant. The founder's
 * standing law is that the AI has one job — reading a programme she already has — so it may propose
 * and never place.
 *
 * ── WHY THE MATCH IS REBUILT AND NOT THE PROGRAMME PATCHED ──────────────────────────────────────
 * `MatchedWeek` still knows which SESSION she wrote the lift in, in what order and with what set
 * count. The `Program` does not — an unmatched lift was dropped before it ever became a slot. So an
 * accept repairs the match and re-runs `toProgram`, and the lift lands where she put it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { applySuggestion, matchWeek, toProgram, reviewFindings } from '@/domain/importedPlan';

const SRC = path.join(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Her sheet: two lifts we carry, and one we do not. */
const week = {
  sessions: [
    { name: 'Push', lifts: [{ name: 'Barbell Bench Press' }, { name: 'Zercher Thruster', sets: 4 }] },
    { name: 'Pull', lifts: [{ name: 'Barbell Row' }] },
  ],
};

describe('⛔ the suggestion reaches the screen', () => {
  it('ImportReview accepts suggestions and an accept handler', () => {
    const src = read('screens/import/ImportReview.tsx');
    expect(src).toMatch(/suggestions\?:\s*ImportSuggestion\[\]/);
    expect(src).toMatch(/onAccept\?:/);
    // …and actually renders them, rather than accepting a prop it ignores.
    expect(src).toMatch(/props\.onAccept\?\.\(/);
  });

  it('ImportPlan passes them down and handles the accept', () => {
    const src = read('screens/import/ImportPlan.tsx');
    expect(src).toMatch(/suggestions=\{result\.suggestions\}/);
    expect(src).toMatch(/onAccept=\{accept\}/);
    expect(src).toMatch(/applySuggestion\(/);
  });

  it('⚠️ the outcome carries the MATCH, or an accept has nowhere to put the lift', () => {
    expect(read('domain/runImport.ts')).toMatch(/matched:\s*MatchedWeek/);
  });
});

describe('⛔ accepting one puts the lift back where she wrote it', () => {
  it('lands in the session it came from, with her set count', () => {
    const matched = matchWeek(week);
    expect(matched.unmatched).toContain('Zercher Thruster');
    const before = toProgram(matched);
    expect(before.days[0].slots.length).toBe(1); // the unplaced lift was dropped

    const repaired = applySuggestion(matched, 'Zercher Thruster', 'front_squat');
    const after = toProgram(repaired);
    const push = after.days[0];
    expect(push.slots.map((s) => s.exerciseId)).toContain('front_squat');
    expect(push.slots.find((s) => s.exerciseId === 'front_squat').setCount).toBe(4);
    // The OTHER day is untouched — an accept repairs one name, not her week.
    expect(after.days[1].slots).toEqual(before.days[1].slots);
  });

  it('⛔ never places a lift the catalogue does not carry', () => {
    const matched = matchWeek(week);
    expect(applySuggestion(matched, 'Zercher Thruster', 'not_a_real_lift')).toBe(matched);
  });

  it('⚠️ a name nothing carries changes nothing, by reference', () => {
    const matched = matchWeek(week);
    expect(applySuggestion(matched, 'A Lift She Never Wrote', 'front_squat')).toBe(matched);
  });

  it('⛔ and the report stops saying "I could not find this" once it is found', () => {
    const matched = matchWeek(week);
    const said = reviewFindings(matched, toProgram(matched));
    expect(said.some((f) => f.kind === 'unmatched_lift' && f.subject === 'Zercher Thruster')).toBe(true);

    const repaired = applySuggestion(matched, 'Zercher Thruster', 'front_squat');
    const now = reviewFindings(repaired, toProgram(repaired));
    expect(now.some((f) => f.kind === 'unmatched_lift' && f.subject === 'Zercher Thruster')).toBe(false);
  });

  it('⚠️ every lift she wrote under that name is repaired at once', () => {
    const twice = matchWeek({
      sessions: [
        { name: 'A', lifts: [{ name: 'Pec Fly Thing' }] },
        { name: 'B', lifts: [{ name: 'Pec Fly Thing' }] },
      ],
    });
    const repaired = applySuggestion(twice, 'Pec Fly Thing', 'pec_deck');
    const p = toProgram(repaired);
    expect(p.days[0].slots[0].exerciseId).toBe('pec_deck');
    expect(p.days[1].slots[0].exerciseId).toBe('pec_deck');
  });

  it('⚠️ the week stays HERS — an accept never hands it to the engine', () => {
    const repaired = applySuggestion(matchWeek(week), 'Zercher Thruster', 'front_squat');
    expect(toProgram(repaired).authored).toBe('athlete_or_coach');
  });
});
