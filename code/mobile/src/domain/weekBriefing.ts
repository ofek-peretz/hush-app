/**
 * THE WEEK'S BRIEFING — what Hush DID, said out loud, on Home (founder 2026-07-13).
 *
 * The founder's finding, and it is the deepest one in the product: "the app still doesn't say what
 * it does. It looks like it gives a great workout experience, not like anybody is managing a
 * training programme." He is right, and the fix is not a tutorial. A tutorial teaches the
 * interface; what has to be taught is the PRODUCT — and the only thing that teaches that is the
 * product narrating its own decisions, in its own voice, at the moment it makes them.
 *
 * The engine already decides every week: it raises loads, it matches a load back down to what was
 * actually demonstrated, it swaps a lift, it holds. All of it was recorded (v4Engine.lastUpdate),
 * all of it was reachable — two taps deep, inside a screen nobody knew existed. This module turns
 * that record into ONE sentence in the first person, which Home prints where the athlete cannot
 * miss it.
 *
 * The voice laws hold: facts, never praise; first person ("I raised…", never "your bench went
 * up"); never a claim we cannot substantiate. When Hush changed nothing, it says so — a steady week
 * is a decision too, and pretending otherwise would make every other sentence here worthless.
 *
 * Pure: keys + params (never rendered strings), so the whole voice is testable and the gender
 * conjugation stays where it belongs — in i18n.
 */
// @ts-nocheck

// 

import type { Line } from '@/domain/voice';
import type { Units } from '@/data/local/models';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { bidi } from '@/i18n/bidi';

/** One slot the engine touched this week — the shape the briefing reads, and nothing more. */
export interface BriefChange {
  /** The lift's display name (English, per the RTL law — isolated for Hebrew copy here). */
  name: string;
  loadFrom: number | null; // kg; null = bodyweight / unmanaged
  loadTo: number | null; // kg
  swapped: boolean;
}

/**
 * Hush's sentence(s) for the week, at most two lines:
 *   1 · what happened to the LOADS (a raise, a match-down, a tuning, or nothing)
 *   2 · what happened to the EXERCISES (a swap), when one happened.
 *
 * `changes === null` means the engine has never run a weekly update for this athlete — week one. The
 * card then says NOTHING (founder 2026-07-13): the promise it used to make here ("I built this from
 * your numbers; on Saturday I read what you lifted and update it") is now made on the screen where
 * the programme is handed over (ob.readyBody), which is where a promise belongs. Repeating it on
 * Home cost the card its top third to say something the athlete had just been told.
 */
export function weekBriefing(changes: BriefChange[] | null, units: Units): Line[] {
  if (changes == null) return [];
  if (changes.length === 0) return [{ key: 'home.briefSteady' }];

  const swaps = changes.filter((c) => c.swapped);
  const loads = changes.filter((c) => !c.swapped && c.loadFrom != null && c.loadTo != null);
  const raises = loads.filter((c) => (c.loadTo as number) > (c.loadFrom as number));
  const matched = loads.filter((c) => (c.loadTo as number) < (c.loadFrom as number));

  const out: Line[] = [];

  if (raises.length > 0) {
    // The headline raise is the BIGGEST STEP, not the heaviest lift: "I put 5 kg on your row" is
    // the news; "your squat is still the heaviest thing you do" is not.
    const head = [...raises].sort(
      (a, b) =>
        (b.loadTo as number) - (b.loadFrom as number) - ((a.loadTo as number) - (a.loadFrom as number)) ||
        (b.loadTo as number) - (a.loadTo as number),
    )[0];
    const params = { lift: bidi(head.name), load: fmtLoad(head.loadTo, units), unit: unitLabel(units) };
    out.push(
      raises.length === 1
        ? { key: 'home.briefRaisedOne', params }
        : { key: 'home.briefRaisedMany', params: { ...params, n: raises.length } },
    );
  } else if (matched.length > 0) {
    // A load coming down is NEVER a setback in this product (v4 law): it is the prescription being
    // matched to what the athlete actually demonstrated. The sentence says that, and says it plainly.
    out.push(
      matched.length === 1
        ? { key: 'home.briefMatchedOne', params: { lift: bidi(matched[0].name) } }
        : { key: 'home.briefMatchedMany', params: { n: matched.length } },
    );
  } else if (swaps.length === 0) {
    // Changed, but neither a load nor an exercise: the engine moved sets or a rep range. Real work,
    // and it must not masquerade as a load change.
    out.push({ key: 'home.briefTuned', params: { n: changes.length } });
  }

  if (swaps.length > 0) {
    out.push(
      swaps.length === 1
        ? { key: 'home.briefSwappedOne', params: { lift: bidi(swaps[0].name) } }
        : { key: 'home.briefSwappedMany', params: { n: swaps.length } },
    );
  }

  return out;
}

/** kg → the athlete's own units, trimmed (62.5 stays 62.5; 60.0 becomes 60). */
function fmtLoad(kg: number | null, units: Units): string {
  if (kg == null) return '';
  return String(+((displayWeight(kg, units) ?? 0).toFixed(2)));
}
