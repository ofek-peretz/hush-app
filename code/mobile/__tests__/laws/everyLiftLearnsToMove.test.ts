/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY LIFT LEARNS TO MOVE — the motion-coverage ratchet.
 *
 * ⛔ FOUNDER MANDATE (2026-08-23, the world-class pass): the person this product is for — *"כל אדם
 * שירשם לחדר הכושר"* — stands in front of a machine she has never seen, holding a phone that says
 * a name. 18 of 117 lifts demonstrated themselves; the other 99 were a name and a silhouette. The
 * motion standard (MOTION_FORM_STANDARD_V1) was ratified for the WHOLE catalogue; this law makes
 * the rollout a ratchet instead of an intention.
 *
 * ── WHAT IT PINS ────────────────────────────────────────────────────────────────────────────────
 *   1. Every registered rig VALIDATES — the full registry sweep, not just the benchmark files. A
 *      rig whose FormSpec fails is a demonstration contradicting Hush's own cues (§0: the
 *      animation IS the cues, drawn).
 *   2. Every rig demonstrates a lift the catalogue actually prescribes — no orphan rigs.
 *   3. Coverage may only GROW. The floor is the count at the last authoring pass; raising it is
 *      what "done" means for a batch, and a deleted rig fails the build by name.
 *   4. Canon is canon: two identical reps (§0 corollary 2), and every rig keys `Pose.j` with the
 *      joints its own chains declare — a chain naming a joint the pose never sets renders nothing.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { EXERCISE_MOTION } from '@/motion/registry';
import { validate } from '@/motion/formspec';
import { exerciseById } from '@/data/exercises';

/**
 * ⛔ THE RATCHET. Raised at every authoring batch; may never move down.
 *   18 → the pre-mandate library (benchmarks + presses + rows)
 *   22 → 2026-08-23, the hinge family (bb_deadlift · bb_rdl · db_rdl · good_morning)
 *   29 → 2026-08-24, THE TWO ARC FAMILIES — the first rigs whose tracked point rides no rail:
 *        curl (bb · db · cable · single-arm cable) and lateral_raise (db · cable · machine).
 *        Authored as the MoveKit purchase was paused: the catalogue's 37 movement PATTERNS are
 *        what remains, not 96 unrelated lifts, because a family file covers every member of its
 *        pattern at once. Curls are drawn from the SIDE and raises from the FRONT for the same
 *        reason in mirror — a sagittal rotation folds into depth face-on, and a frontal one
 *        vanishes from the side.
 *   37 → 2026-08-25, the second arc batch: elbow_extension_pushdown (cable · single-arm · machine)
 *        and the whole calf_straight family (standing · smith · dumbbell · single-leg · leg-press).
 *        The pushdown is the curl run backwards — same camera, same pinned elbow, opposite travel.
 *        The calf raise is the first rig authored around a REP TOO SMALL TO SEE: nothing bends, the
 *        rigid body is translated off a raised block, and the block's top edge is the fixed line the
 *        eye measures the heel against. Framing, not exaggeration.
 *   42 → 2026-08-25, THE MACHINE HALL: knee_extension + seated knee_flexion (one file, one seat,
 *        one pivot, the sign flipped — so the two machines that face each other in every gym are
 *        drawn as one hall and cannot drift apart), and squat_supported (leg press · single-leg
 *        press · hack squat), whose foot plate rides a RAIL (`path: 'line'`) with the knee solved
 *        by IK between a fixed hip and the travelling foot. The leg press is the first rig whose
 *        endpoint is deliberately NOT full extension: `angleNever` caps the knee below lockout,
 *        because the catalogue cue says "don't lock out hard" and §0 forbids the drawing from
 *        teaching the opposite of the words on the same card.
 *   49 → 2026-08-25, the BODY-TRAVELS batch: the pull-up family (pull_up · chin_up ·
 *        assisted_pull_up — the lat pulldown INVERTED: the grip is fixed and the body rises,
 *        elbows solved by IK from the travelling shoulder; kipping is forbidden by freezing the
 *        torso angle and the hip's X) and the thrust family (hip_thrust · machine_hip_thrust ·
 *        single_leg_hip_thrust · glute_bridge — one skeleton at two shoulder heights; the bench
 *        members finish at the flat table, the floor bridge finishes with the hips ABOVE the
 *        shoulders, because that is where a bridge actually finishes).
 *        Two geometry lessons paid for here: a pull-up's TOP is a HEIGHT (chin over bar), not an
 *        elbow angle — at a wide grip the "top angle" has no solution; and the bridge's finish
 *        line is not the thrust's, by exactly the height of the bench.
 *   52 → 2026-08-25, the lunge family (bulgarian_split_squat · walking_lunge · reverse_lunge):
 *        split stance, hip tracked VERTICALLY ("drop straight down" as the path constraint), front
 *        knee ~90° at an honest depth, both feet pinned. `step_up` was authored, FAILED — its rear
 *        foot must leave the floor, which this model cannot say — and was excised rather than bent:
 *        an uncovered lift is a silhouette; a wrongly-drawn one is a false demonstration.
 *   57 → 2026-08-25, fly + rear_delt in one file (pec_deck · cable_fly · incline_db_fly ·
 *        rear_delt_fly · reverse_pec_deck): the lateral raise's rigid soft-elbow arm turned 90°
 *        into the transverse plane, drawn face-on as the straight horizontal chord that plane
 *        projects to. The two deck machines are ONE station sat in two directions, authored as
 *        one sweep with the sign flipped. Projection lesson: the soft-elbow ANGLE is only a fact
 *        at the wide (in-plane) end — at the hug the arm folds into depth and the projected angle
 *        collapses — so the angle predicate lives at the wide end and `angleNever` (which only an
 *        OPENING elbow can trip) polices the whole rep.
 *   62 → 2026-08-25, shrug + crunch: bb/db_shrug (the calf raise of the shoulders — one girdle
 *        translates, arms held long by predicate so a shrug cannot become a curl) and
 *        sit_up · cable_crunch · machine_crunch (one mechanism: the trunk rotates about a pinned
 *        hip while `Pose.trunkBow` — used for the first time — bows the silhouette, so the figure
 *        CURLS instead of hinging; a straight-trunk "crunch" is the hip-flexor fault the cues warn
 *        against). `bicycle_crunch` is excised like the step-up: it alternates sides with a twist
 *        this one-plane mechanism cannot say truthfully.
 *   65 → 2026-08-25, squat COMPLETED (front · goblet · smith) — the benchmark's own skeleton,
 *        exported as `squatCore(rom, carryDX)`: the torso lean is solved so the CARRY stays over
 *        the mid-foot, so one number per member and the front squat's more upright torso falls out
 *        of the same equation instead of a tuned lean. The smith's rail is drawn full-height — the
 *        machine states the vertical, she squats. The benchmark's own geometry is untouched
 *        (its 50 motion tests prove it).
 *   68 → 2026-08-25, hinge COMPLETED (sumo · trap-bar · cable pull-through; single_leg_rdl still
 *        open — a counterbalancing rear leg is its own skeleton). Sumo is the conventional pull
 *        drawn ~10° taller: stance width is a frontal-plane fact that folds into depth from the
 *        side camera, so the drawing carries the shape and the written cues carry the stance.
 *        The trap bar makes `hand.x = BAR_X` literally true — that is the hex bar's entire point.
 *        The pull-through reuses the RDL's skeleton with rom REVERSED (the machine holds her in
 *        the hinge; the squeeze is the concentric) and only the hands re-solved to the rope.
 *   73 → 2026-08-25, every curl in the catalogue: hammer + reverse ride the standing family (a
 *        neutral grip IS drawable side-on — the dumbbell shows end-on; the overhand bar is the
 *        bar-curl silhouette and the wrist fact lives in the cues, the sumo rule), and
 *        preacher · concentration · incline get `positionedCurl` — the pad decides the elbow, the
 *        elbow decides the lift. Angle lesson: the interior elbow is measured against the ARM'S
 *        OWN TILT, so a sweep that crosses the arm line passes through 180° and trips the
 *        hyperextension invariant mid-rep — φ ranges are derived from target angles per member.
 *   77 → 2026-08-25, front_raise (db · cable — the lateral raise's arm swung into the sagittal
 *        plane, so the camera flips to the SIDE; the cable member's pulley is LOW AND BEHIND so
 *        the pull works the whole arc, which is the machine's reason to exist) and calf_bent
 *        (seated · seated-db — the standing calf inverted: the KNEE is held down and only the
 *        heel swings, with the bent knee asserted at BOTH ends because the bend IS the pattern:
 *        it slackens the gastrocnemius and hands the soleus the work).
 *   83 → 2026-08-25, the two kickbacks + overhead triceps: elbow_extension_overhead (cable · db ·
 *        skullcrusher — the elbow fixed HIGH, forearm hinging behind the head; the standing form
 *        clipped the frame at lockout so the cable/db members are SEATED, which is also the gym's
 *        own canonical form — the frame and the form agreed), the glute kickback pair (a leg-sized
 *        lateral-raise arm about a pinned hip, torso frozen at its hinge so the low back cannot
 *        finish it), and triceps_kickback on the hinged skeleton pushdown.ts promised it.
 *   90 → 2026-08-25, the machine-hall closers: abduction + adduction (seated pair = ONE machine
 *        sat two ways, front view — the third "frontal sweeps need the front camera" family — plus
 *        the standing single-leg cable pair on the same builder), back_extension (the good morning
 *        turned into furniture: the pad clamps the pelvis and the finish window's ceiling IS the
 *        anti-hyperextension cue), and the two remaining leg curls (lying face-down with "hips
 *        DOWN" pinned as the invariant it is; standing single-leg at the station). nordic_curl
 *        stays open — its whole BODY is the falling lever, a different mechanism.
 *   94 → 2026-08-25, THE PLANK CORE: push_up · diamond · decline · inverted_row on one new
 *        skeleton — a rigid ankle→shoulder line pivoting about planted toes, elbows by IK, and the
 *        standard's own `colinear` predicate holding the plank across the whole rep (sag AND pike
 *        both fail the build). The inverted row is the same body slung UNDER the bar with the
 *        reach's sign flipped — the row as the push-up's mirror, drawn as exactly that. The top
 *        height is BISECTED from the target elbow angle (the pull-up's lesson, third appearance:
 *        the shoulder's horizontal offset rides its height, so a typed reach can overshoot the
 *        arm). pike_push_up stays open: it exists to break the plank line this file enforces.
 *   98 → 2026-08-25, THE SUPPORT CORE: the dips (chest · assisted · bench · machine). The bar
 *        members are the pull-up upside-down — grip fixed, body translating, elbows driving BACK —
 *        with the chest dip's forward lean AUTHORED (the card's own cue) rather than accidental.
 *        The machine dip anchors the body and moves the handles (the pulldown's relation). Every
 *        vertical offset in the file is solved from a target elbow angle via one shared
 *        `vGapFor(deg, dx)` — the pull-up's lesson promoted to a file-level rule.
 *   102 → 2026-08-25, the builder-riders: smith_overhead_press and smith_bench_press (each its
 *        benchmark's own rig with the rails drawn — the machine balances, she presses; authored by
 *        WRAPPING the base rig's decor, zero re-authoring), incline_machine_press (the lying
 *        builder at raise 12 with fixed handles), and single_arm_cable_row (the seated builder,
 *        whose hinged lean IS the card's "let the shoulder travel forward"). Five lifts, five
 *        first-run passes, because the builders were already validated.
 *   106 → 2026-08-25, the last of the stations: smith_row (the t-bar's hinge on rails — the rails
 *        erase the t-bar's arc, which is the honest difference), incline_db_row (the chest pad
 *        OWNS the hinge — the row family's own invariant made literal), straight_arm_pulldown
 *        (the lat's long-arm sweep; a rigid arm cannot become a pushdown), and landmine_press —
 *        the first rig whose PATH belongs to the equipment: the hand rides the circle the anchored
 *        bar allows, with the lockout angle intersected numerically between the bar's circle and
 *        the arm's reach. Twelve remain, and every one needs a mechanism this library has not
 *        built yet (hanging bodies, kneeling rollouts, twists, counterbalances).
 *   113 → 2026-08-25, the hard tail's first half: leg_raise ×3 (one rigid-leg sweep, three
 *        stations — hanging, captain's chair, lying), rotation ×2 (russian_twist + cable_woodchop:
 *        the one plane no rig had drawn, face-on, with THE REP AS THE CYCLE so alternation and
 *        two-identical-reps stop conflicting), and anti_extension ×2 (ab_wheel — the wheel's
 *        position FALLS OUT of the unfold, and the geometry forced the honest piked start, twice;
 *        dead_bug — the far-side pair pinned mid-air, "the other half of the bug, dead still").
 *   118 → 2026-08-25, THE CATALOGUE IS COMPLETE. The hard tail fell to the mechanisms the library
 *        had earned: nordic_curl (the body as a falling lever — and the invariant had to become
 *        knee–hip–shoulder COLINEARITY, because the line rotates and a frozen segment angle is the
 *        wrong question), single_leg_rdl (the back-extension's see-saw, free-standing), pike_push_up
 *        (the plank's named exception on its own fold, hand solved from the long-arm start, the
 *        shoulder pressing down its own line), step_up (the travelling rear foot at last, with the
 *        calf raise's dropped scene so a body standing tall on a box fits the frame), and
 *        bicycle_crunch — unlocked by the russian twist's rule that THE REP IS THE CYCLE, so the
 *        alternation that once made it undrawable is simply what one rep is.
 *        Every lift the engine can prescribe now demonstrates itself, validated and framed.
 */
/* 118 → 123 (2026-08-26): the bodybuilding shelf — ez_bar_curl · bb_curl_21 ·
   cable_rope_hammer_curl · spider_curl · rope_pushdown. Choice-only in the catalogue, fully
   demonstrated like everything else: the founder's condition for growing the shelf at all. */
/* 123 → 136 (2026-08-26): the bodybuilding floor, batch 2 — both rooms of it. The glute shelf
   (smith_hip_thrust · frog_pump · donkey_kick · curtsy_lunge · db_sumo_squat) and the
   classic-physique shelf (decline_bb_press · db_fly · smith_incline_press · low_cable_fly ·
   db_pullover · close_grip_pulldown · meadows_row · cable_upright_row). Ten ride existing family
   builders; donkey_kick (the quadruped), db_pullover (the supine long-arm sweep) and
   cable_upright_row (the folding front-view pull) author the three mechanisms their families
   lacked. Choice-only in the catalogue, fully demonstrated — the standing condition. */
/* 136 → 138 → 141 (2026-09-10). The bodyweight-only room's quad lifts — bw_squat (the goblet's upright
   solve, empty hands forward) and split_squat (the lunge family, both feet planted, no implement) —
   then the KETTLEBELL family: kb_goblet_squat and kb_rdl ride their families' own skeletons with the
   mass hung below the grip, and kb_swing re-authors only the ARM on the audited hinge body. */
const RIGGED_FLOOR = 146;

const rigs = Object.entries(EXERCISE_MOTION);

describe('every lift learns to move', () => {
  it(`⛔⛔ coverage never shrinks — at least ${RIGGED_FLOOR} lifts demonstrate themselves`, () => {
    expect(rigs.length).toBeGreaterThanOrEqual(RIGGED_FLOOR);
  });

  it('⛔ every registered rig validates against its own FormSpec — the full sweep', () => {
    const failures: string[] = [];
    for (const [id, rig] of rigs) {
      const res = validate(rig, 120);
      if (!res.ok) failures.push(`${id}: ${res.violations.map((v) => v.detail).join(' · ')}`);
    }
    expect(failures).toEqual([]);
  });

  it('⛔ every rig demonstrates a lift the catalogue prescribes, under its own name', () => {
    for (const [id, rig] of rigs) {
      expect(rig.id).toBe(id);
      expect(exerciseById(id)).toBeTruthy();
    }
  });

  it('canon is two identical reps — unless the rig is a protocol whose reps differ', () => {
    /*
     * The law was written before `Tempo.repRanges` existed and it asserted a flat 2 everywhere.
     * `bb_curl_21` is a 21s curl: bottom half, top half, then full, three DELIBERATELY unequal
     * reps, and the clip has to show that or it is not the exercise. So the law states the real
     * invariant — two identical reps is the default, and a rig may declare otherwise only by
     * declaring the ranges that make its reps different.
     */
    for (const [id, rig] of rigs) {
      const t = rig.formspec.tempo;
      if (t.repRanges) {
        expect(t.repRanges.length).toBe(t.reps);
        for (const [a, b] of t.repRanges) {
          expect(b).toBeGreaterThan(a);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThanOrEqual(1);
        }
        continue;
      }
      expect(`${id}:${t.reps}`).toBe(`${id}:2`);
    }
  });

  it('every chain joint exists in the pose, at both endpoints — nothing renders as nothing', () => {
    for (const [id, rig] of rigs) {
      const names = [
        ...rig.chains.torso,
        ...rig.chains.neck,
        rig.chains.head,
        ...(rig.chains.nearArm ?? []),
        ...(rig.chains.farArm ?? []),
        ...(rig.chains.nearLeg ?? []),
        ...(rig.chains.farLeg ?? []),
        ...(rig.chains.nearFoot ?? []),
        ...(rig.chains.farFoot ?? []),
      ];
      for (const rom of [0, 0.5, 1]) {
        const j = rig.poseAt(rom).j;
        for (const n of names) {
          if (!j[n]) throw new Error(`${id}: chain joint "${n}" missing from pose at rom ${rom}`);
        }
      }
    }
  });
});
