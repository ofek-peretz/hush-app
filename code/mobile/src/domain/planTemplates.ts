/**
 * planTemplates — the PROVEN STARTING SHELVES (founder mandate 2026-08-26: close the library gap,
 * and close it better than the competition).
 *
 * ════ WHY A TEMPLATE HERE IS NOT A HEVY TEMPLATE ════
 *
 * Hevy's Explore and every routine PDF on earth share one defect: they are DEAD DOCUMENTS. A
 * template names exercises and set counts, and the athlete is left alone with the two questions
 * that actually decide the workout — what weight, and does this fit my hour. Hush's rails answer
 * both the moment a template is chosen: it materializes THROUGH the builder's own algebra
 * (`blankDraft`/`addLift`/`setLiftSets` — so it is valid by construction, priced by
 * `builderMinutes`, advised by `builderAdvice`), and the engine seeds every load from her profile
 * at session time exactly as it does for an imported coach plan. **A shelf here is alive the
 * second it is touched.**
 *
 * Curation rules (why these eight and not eighty):
 *  · every id is the CATALOGUE's own — `everyTemplateIsBuildable` proves each exists and builds;
 *  · hypertrophy-sane by this product's own laws: compounds first, isolation after, no day over
 *    the hour, every day a real session (the law prices every day at 25–70 minutes);
 *  · each shelf answers a REASON someone walks in with ("I want PPL", "I only have dumbbells",
 *    "give me the big five"), not a marketing name;
 *  · set counts live in the builder's own [1..8]; she can reshape everything after — a template
 *    is a starting draft, never a contract. Saving seals it `authored`, the same passport an
 *    imported week carries.
 */

//

import type { Program } from '@/data/local/models';
import { addDay, addLift, blankDraft, renameDay, setLiftSets, togglePair } from '@/domain/planBuilder';

export interface TemplateLift {
  ex: string;
  sets: number;
  /**
   * ⛔ COUPLE THIS LIFT WITH THE ONE AFTER IT — a superset, exactly as her finger would write it
   * (founder 2026-08-31, on the AI door: *"במידה והיא מציעה סופר סט"*).
   *
   * A shelf and the model's week both land here, and until today neither could say the one thing
   * the seam in the builder can. The mark is carried, never trusted: `materializeTemplate` puts it
   * on through `togglePair`, so every clause of the pen's law binds it — no chains, adjacent seats
   * only, and the partners' set counts synced (the runner's `rounds` is ONE number, so the second
   * lift's `sets` above is overruled by the first's when the two are coupled).
   */
  pair?: boolean;
}
export interface TemplateDay {
  /** i18n suffix under `builder.templates.dayNames.` — resolved AT materialization, because a
   *  day's name is plain renameable data in storage, never a live key. */
  nameKey: string;
  lifts: TemplateLift[];
}
export interface PlanTemplate {
  /** i18n home: `builder.templates.<id>.name` / `.tag`. */
  id: string;
  days: TemplateDay[];
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'ppl',
    days: [
      {
        nameKey: 'push',
        lifts: [
          { ex: 'bb_bench_press', sets: 4 },
          { ex: 'bb_overhead_press', sets: 3 },
          { ex: 'incline_db_press', sets: 3 },
          { ex: 'lateral_raise', sets: 3 },
          { ex: 'triceps_pushdown', sets: 3 },
        ],
      },
      {
        nameKey: 'pull',
        lifts: [
          { ex: 'bb_row', sets: 4 },
          { ex: 'lat_pulldown', sets: 3 },
          { ex: 'cable_row', sets: 3 },
          { ex: 'face_pull', sets: 3 },
          { ex: 'db_curl', sets: 3 },
        ],
      },
      {
        nameKey: 'legs',
        lifts: [
          { ex: 'bb_back_squat', sets: 4 },
          { ex: 'bb_rdl', sets: 3 },
          { ex: 'leg_press', sets: 3 },
          { ex: 'leg_curl', sets: 3 },
          { ex: 'standing_calf_raise', sets: 4 },
        ],
      },
    ],
  },
  {
    id: 'upper_lower',
    days: [
      {
        nameKey: 'upperA',
        lifts: [
          { ex: 'bb_bench_press', sets: 4 },
          { ex: 'bb_row', sets: 4 },
          { ex: 'db_shoulder_press', sets: 3 },
          { ex: 'lat_pulldown', sets: 3 },
          { ex: 'triceps_pushdown', sets: 3 },
          { ex: 'db_curl', sets: 3 },
        ],
      },
      {
        nameKey: 'lowerA',
        lifts: [
          { ex: 'bb_back_squat', sets: 4 },
          { ex: 'bb_rdl', sets: 3 },
          { ex: 'leg_press', sets: 3 },
          { ex: 'leg_curl', sets: 3 },
          { ex: 'standing_calf_raise', sets: 4 },
        ],
      },
      {
        nameKey: 'upperB',
        lifts: [
          { ex: 'incline_db_press', sets: 4 },
          { ex: 'cable_row', sets: 4 },
          { ex: 'lateral_raise', sets: 3 },
          { ex: 'pull_up', sets: 3 },
          { ex: 'skullcrusher', sets: 3 },
          { ex: 'hammer_curl', sets: 3 },
        ],
      },
      {
        nameKey: 'lowerB',
        lifts: [
          { ex: 'trap_bar_deadlift', sets: 3 },
          { ex: 'hack_squat', sets: 3 },
          { ex: 'walking_lunge', sets: 3 },
          { ex: 'seated_leg_curl', sets: 3 },
          { ex: 'seated_calf_raise', sets: 4 },
        ],
      },
    ],
  },
  /*
   * ⛔ THE SHELF WAS 3s AND ONE 4 (founder 2026-08-29): *"למה יש אפשרות רק של 3 ו 4 אימונים ולא של
   * 3-5 אימונים עם התוכניות הטובות ביותר לחדר הכושר?"*
   *
   * He read the gap exactly. Eight shelves, seven of them three days and one four — so an athlete
   * who trains five times a week, which is the commonest serious gym week there is, found nothing
   * on the shelf that was HERS and was pushed to the blank sheet. Nothing structural caused it:
   * `addDay` is unbounded, the engine builds 2–6, and the card's day count is derived. It was
   * simply what had been authored.
   *
   * The three below close 3–4–5 with the splits gyms actually run, not with filler:
   *   · `ppl_ul`     — PPL + Upper/Lower. The consensus five-day hypertrophy week: every muscle
   *                    twice, the second pass shorter, one rest day inside it.
   *   · `bro_split`  — one muscle a day. Unfashionable in writing and universal in practice, and
   *                    the only shelf where shoulders and arms get a whole session each.
   *   · `body_part_4`— chest+triceps / back+biceps / shoulders+abs / legs. The four-day classic,
   *                    genuinely different from Upper/Lower rather than a reshuffle of it.
   *
   * ⚠️ Same curation rules as the eight above, and `everyShelfBuilds` prices every day of them.
   */
  {
    id: 'ppl_ul',
    days: [
      {
        nameKey: 'push',
        lifts: [
          { ex: 'bb_bench_press', sets: 4 },
          { ex: 'bb_overhead_press', sets: 3 },
          { ex: 'incline_db_press', sets: 3 },
          { ex: 'lateral_raise', sets: 3 },
          { ex: 'triceps_pushdown', sets: 3 },
        ],
      },
      {
        nameKey: 'pull',
        lifts: [
          { ex: 'bb_row', sets: 4 },
          { ex: 'lat_pulldown', sets: 3 },
          { ex: 'cable_row', sets: 3 },
          { ex: 'face_pull', sets: 3 },
          { ex: 'db_curl', sets: 3 },
        ],
      },
      {
        nameKey: 'legs',
        lifts: [
          { ex: 'bb_back_squat', sets: 4 },
          { ex: 'bb_rdl', sets: 3 },
          { ex: 'leg_press', sets: 3 },
          { ex: 'leg_curl', sets: 3 },
          { ex: 'standing_calf_raise', sets: 4 },
        ],
      },
      {
        nameKey: 'upper',
        lifts: [
          { ex: 'incline_bb_press', sets: 4 },
          { ex: 'pull_up', sets: 3 },
          { ex: 'db_shoulder_press', sets: 3 },
          { ex: 'cable_row', sets: 3 },
          { ex: 'skullcrusher', sets: 3 },
          { ex: 'hammer_curl', sets: 3 },
        ],
      },
      {
        nameKey: 'lower',
        lifts: [
          { ex: 'hack_squat', sets: 4 },
          { ex: 'trap_bar_deadlift', sets: 3 },
          { ex: 'walking_lunge', sets: 3 },
          { ex: 'seated_leg_curl', sets: 3 },
          { ex: 'seated_calf_raise', sets: 4 },
        ],
      },
    ],
  },
  {
    id: 'bro_split',
    days: [
      {
        nameKey: 'chest',
        lifts: [
          { ex: 'bb_bench_press', sets: 4 },
          { ex: 'incline_db_press', sets: 4 },
          { ex: 'pec_deck', sets: 3 },
          { ex: 'cable_fly', sets: 3 },
          { ex: 'chest_dip', sets: 3 },
        ],
      },
      {
        nameKey: 'back',
        lifts: [
          { ex: 'pull_up', sets: 4 },
          { ex: 'bb_row', sets: 4 },
          { ex: 'lat_pulldown', sets: 3 },
          { ex: 'cable_row', sets: 3 },
          { ex: 'straight_arm_pulldown', sets: 3 },
        ],
      },
      {
        nameKey: 'legs',
        lifts: [
          { ex: 'bb_back_squat', sets: 4 },
          { ex: 'leg_press', sets: 4 },
          { ex: 'bb_rdl', sets: 3 },
          { ex: 'leg_curl', sets: 3 },
          { ex: 'standing_calf_raise', sets: 4 },
        ],
      },
      {
        nameKey: 'shoulders',
        lifts: [
          { ex: 'bb_overhead_press', sets: 4 },
          { ex: 'db_shoulder_press', sets: 3 },
          { ex: 'lateral_raise', sets: 4 },
          { ex: 'rear_delt_fly', sets: 3 },
          { ex: 'bb_shrug', sets: 3 },
        ],
      },
      {
        nameKey: 'arms',
        lifts: [
          { ex: 'bb_curl', sets: 4 },
          { ex: 'skullcrusher', sets: 4 },
          { ex: 'hammer_curl', sets: 3 },
          { ex: 'triceps_pushdown', sets: 3 },
          { ex: 'preacher_curl', sets: 3 },
        ],
      },
    ],
  },
  {
    id: 'body_part_4',
    days: [
      {
        nameKey: 'chestTriceps',
        lifts: [
          { ex: 'bb_bench_press', sets: 4 },
          { ex: 'incline_db_press', sets: 3 },
          { ex: 'pec_deck', sets: 3 },
          { ex: 'triceps_pushdown', sets: 3 },
          { ex: 'overhead_triceps_ext', sets: 3 },
        ],
      },
      {
        nameKey: 'backBiceps',
        lifts: [
          { ex: 'bb_row', sets: 4 },
          { ex: 'lat_pulldown', sets: 3 },
          { ex: 'cable_row', sets: 3 },
          { ex: 'db_curl', sets: 3 },
          { ex: 'hammer_curl', sets: 3 },
        ],
      },
      {
        nameKey: 'shouldersAbs',
        lifts: [
          { ex: 'bb_overhead_press', sets: 4 },
          { ex: 'lateral_raise', sets: 3 },
          { ex: 'rear_delt_fly', sets: 3 },
          { ex: 'bb_shrug', sets: 3 },
          { ex: 'cable_crunch', sets: 3 },
        ],
      },
      {
        nameKey: 'legs',
        lifts: [
          { ex: 'bb_back_squat', sets: 4 },
          { ex: 'bb_rdl', sets: 3 },
          { ex: 'leg_press', sets: 3 },
          { ex: 'leg_curl', sets: 3 },
          { ex: 'standing_calf_raise', sets: 4 },
        ],
      },
    ],
  },
  {
    id: 'full_body',
    days: [
      {
        nameKey: 'fullA',
        lifts: [
          { ex: 'bb_back_squat', sets: 4 },
          { ex: 'bb_bench_press', sets: 4 },
          { ex: 'cable_row', sets: 3 },
          { ex: 'lateral_raise', sets: 3 },
          { ex: 'cable_crunch', sets: 3 },
        ],
      },
      {
        nameKey: 'fullB',
        lifts: [
          { ex: 'bb_deadlift', sets: 3 },
          { ex: 'bb_overhead_press', sets: 4 },
          { ex: 'lat_pulldown', sets: 3 },
          { ex: 'leg_curl', sets: 3 },
          { ex: 'db_curl', sets: 3 },
        ],
      },
      {
        nameKey: 'fullC',
        lifts: [
          { ex: 'leg_press', sets: 4 },
          { ex: 'incline_db_press', sets: 3 },
          { ex: 'db_row', sets: 3 },
          { ex: 'triceps_pushdown', sets: 3 },
          { ex: 'standing_calf_raise', sets: 3 },
        ],
      },
    ],
  },
  {
    id: 'machines',
    days: [
      {
        nameKey: 'upperA',
        lifts: [
          { ex: 'machine_chest_press', sets: 4 },
          { ex: 'machine_row', sets: 4 },
          { ex: 'machine_shoulder_press', sets: 3 },
          { ex: 'machine_lateral_raise', sets: 3 },
          { ex: 'machine_triceps_ext', sets: 3 },
        ],
      },
      {
        nameKey: 'lowerA',
        lifts: [
          { ex: 'leg_press', sets: 4 },
          { ex: 'seated_leg_curl', sets: 3 },
          { ex: 'leg_extension', sets: 3 },
          { ex: 'machine_hip_thrust', sets: 3 },
          { ex: 'leg_press_calf_raise', sets: 4 },
        ],
      },
      {
        nameKey: 'upperB',
        lifts: [
          { ex: 'incline_machine_press', sets: 4 },
          { ex: 'lat_pulldown', sets: 4 },
          { ex: 'reverse_pec_deck', sets: 3 },
          { ex: 'pec_deck', sets: 3 },
          { ex: 'machine_crunch', sets: 3 },
        ],
      },
    ],
  },
  {
    id: 'home_dumbbells',
    days: [
      {
        nameKey: 'push',
        lifts: [
          { ex: 'db_bench_press', sets: 4 },
          { ex: 'db_shoulder_press', sets: 3 },
          { ex: 'lateral_raise', sets: 3 },
          { ex: 'db_overhead_triceps_ext', sets: 3 },
          { ex: 'push_up', sets: 3 },
        ],
      },
      {
        nameKey: 'pull',
        lifts: [
          { ex: 'db_row', sets: 4 },
          { ex: 'incline_db_row', sets: 3 },
          { ex: 'rear_delt_fly', sets: 3 },
          { ex: 'db_curl', sets: 3 },
          { ex: 'hammer_curl', sets: 3 },
        ],
      },
      {
        nameKey: 'legs',
        lifts: [
          { ex: 'goblet_squat', sets: 4 },
          { ex: 'db_rdl', sets: 3 },
          { ex: 'walking_lunge', sets: 3 },
          { ex: 'db_calf_raise', sets: 4 },
          { ex: 'dead_bug', sets: 3 },
        ],
      },
    ],
  },
  {
    id: 'bodyweight',
    days: [
      {
        nameKey: 'push',
        lifts: [
          { ex: 'push_up', sets: 4 },
          { ex: 'pike_push_up', sets: 3 },
          { ex: 'chest_dip', sets: 3 },
          { ex: 'diamond_push_up', sets: 3 },
        ],
      },
      {
        nameKey: 'pull',
        lifts: [
          { ex: 'pull_up', sets: 4 },
          { ex: 'inverted_row', sets: 3 },
          { ex: 'chin_up', sets: 3 },
          { ex: 'hanging_leg_raise', sets: 3 },
        ],
      },
      {
        nameKey: 'legs',
        lifts: [
          { ex: 'bulgarian_split_squat', sets: 4 },
          { ex: 'glute_bridge', sets: 3 },
          { ex: 'nordic_curl', sets: 3 },
          { ex: 'single_leg_calf_raise', sets: 4 },
          { ex: 'bicycle_crunch', sets: 3 },
        ],
      },
    ],
  },
  {
    id: 'big_five',
    days: [
      {
        nameKey: 'strengthA',
        lifts: [
          { ex: 'bb_back_squat', sets: 5 },
          { ex: 'bb_bench_press', sets: 5 },
          { ex: 'bb_row', sets: 4 },
        ],
      },
      {
        nameKey: 'strengthB',
        lifts: [
          { ex: 'bb_deadlift', sets: 4 },
          { ex: 'bb_overhead_press', sets: 4 },
          { ex: 'pull_up', sets: 4 },
        ],
      },
      {
        nameKey: 'strengthC',
        lifts: [
          { ex: 'front_squat', sets: 4 },
          { ex: 'incline_bb_press', sets: 4 },
          { ex: 'cable_row', sets: 4 },
          { ex: 'ab_wheel', sets: 3 },
        ],
      },
    ],
  },
  {
    id: 'glutes_legs',
    days: [
      {
        nameKey: 'glutesA',
        lifts: [
          { ex: 'hip_thrust', sets: 4 },
          { ex: 'bb_back_squat', sets: 4 },
          { ex: 'hip_abduction', sets: 3 },
          { ex: 'standing_calf_raise', sets: 3 },
        ],
      },
      {
        nameKey: 'glutesB',
        lifts: [
          { ex: 'bb_rdl', sets: 4 },
          { ex: 'bulgarian_split_squat', sets: 3 },
          { ex: 'cable_kickback', sets: 3 },
          { ex: 'leg_curl', sets: 3 },
        ],
      },
      {
        nameKey: 'glutesC',
        lifts: [
          { ex: 'leg_press', sets: 4 },
          { ex: 'cable_pull_through', sets: 3 },
          { ex: 'walking_lunge', sets: 3 },
          { ex: 'seated_calf_raise', sets: 3 },
          { ex: 'machine_crunch', sets: 3 },
        ],
      },
    ],
  },
];

export function templateById(id: string): PlanTemplate | null {
  return PLAN_TEMPLATES.find((x) => x.id === id) ?? null;
}

/**
 * Build the template into a REAL builder draft, through the builder's own verbs — so a template
 * cannot express anything the pen cannot. Day names are resolved to the athlete's locale HERE
 * (storage holds plain names she can rename; a live i18n key in storage would re-translate under
 * her after she took ownership).
 */
export function materializeTemplate(tpl: PlanTemplate, dayName: (nameKey: string) => string): Program {
  let d = blankDraft(`built_tpl_${tpl.id}_${Date.now()}`);
  tpl.days.forEach((day, di) => {
    if (di > 0) d = addDay(d);
    d = renameDay(d, di, dayName(day.nameKey));
    day.lifts.forEach((l, li) => {
      d = addLift(d, di, l.ex);
      d = setLiftSets(d, di, li, l.sets);
    });
    /*
     * ⚠️ THE PAIRS GO ON AFTER THE WHOLE DAY STANDS, and in seat order. `togglePair` syncs the
     * partner's set count, so a pair written while the day is still being filled would be undone by
     * the next `setLiftSets`; and it REFUSES a chain, so three marks in a row couple the first two
     * and the refusal is a no-op rather than a throw. Nothing here can express what the pen cannot.
     */
    day.lifts.forEach((l, li) => {
      if (l.pair && li < day.lifts.length - 1) d = togglePair(d, di, li);
    });
  });
  return d;
}
