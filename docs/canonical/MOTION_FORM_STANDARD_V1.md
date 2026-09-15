# Hush Motion Form Standard — V1

**Date:** 2026-07-06
**Status:** Proposed for ratification (Phase 0.5 — precedes the motion engine).
**Scope:** Defines what "correct" means for every demonstration the Hush Motion System renders,
and how correctness is encoded, enforced, and kept from drifting.
**Supersedes nothing; extends** `docs/analysis/EXERCISE_VIDEO_STRATEGY_2026-07-06.md` after the
founder's 2026-07-06 reframe: the animation is not an illustration that a movement exists — it is
**the canonical Hush demonstration** of the movement.

---

## 0. The governing law

> **The animation is the cues, drawn.**
> Hush already states its technique standard in each exercise's three cues. The demonstration
> must be a faithful drawing of those cues — never more advanced than them, and never in
> contradiction with them. If the figure does anything the cues would correct, the demonstration
> is wrong, even if a textbook would allow it.

This resolves every "expert nuance vs. diagram simplicity" dispute mechanically. Example: real
bench bar paths curve slightly toward the shoulders; Hush's cue says *"Drive the bar straight
up."* The canonical demonstration therefore shows a straight vertical path. The app must never
prescribe one thing and demonstrate another — including disagreeing with itself.

Corollaries:

1. **Correct beats rich.** A simpler animation with correct movement always wins over a richer
   one with compromised movement. No secondary motion (no breathing idle, no head bob, no
   flourish) — every pixel of motion is prescribed movement.
2. **Both reps identical.** The loop shows exactly 2 reps; rep 2 is bit-identical to rep 1. No
   fatigue acting, no variation. Canon does not degrade.
3. **The mental model is the deliverable.** An athlete who watches 2–3 loops should come away
   knowing: where the movement starts, where it ends, what travels along what path, what stays
   still, and how fast each direction is. Those five things are the spec, below.

## 1. What every demonstration must encode

Five properties, each *measurable on the rendered skeleton* (not vibes):

| Property | Encoding | Enforced by |
|---|---|---|
| **Range of motion** | Canonical start and end positions defined as joint/bar predicates (e.g. "bar contacts chest line", "hip crease below knee top") | endpoint keyframes + validator |
| **Start/end positions** | The loop opens and closes at the true setup position, held for a settle beat | timeline structure |
| **Bar/hand path** | Path predicate per lift (vertical within tolerance; fixed x) | validator, sampled every frame |
| **Body position** | Invariants — what must NOT move (row hinge angle, bench hips, pulldown lean) | validator, sampled every frame |
| **Tempo** | Explicit per-phase durations: controlled eccentric, endpoint hold, decisive concentric | FormSpec `tempo`, single source |

### The FormSpec — correctness as data

Correctness is not "tests I remembered to write." Every exercise carries a typed `FormSpec`,
validated by **one generic engine** that samples the interpolated timeline and asserts every
predicate — in jest, on every commit. A keyframe edit that breaks canon fails CI.

```ts
interface FormSpec {
  tempo: { eccentricMs: number; bottomHoldMs: number; concentricMs: number; topHoldMs: number };
  start: PosePredicate[];        // what defines the setup position
  end:   PosePredicate[];        // what defines the working endpoint
  path:  { track: 'bar' | 'hand'; kind: 'vertical'; xTolerance: number };
  invariants: Invariant[];       // hold for the WHOLE rep, sampled every frame
}

type PosePredicate =            // examples — all measurable on the skeleton
  | { kind: 'contact'; a: 'bar'; b: 'chestLine' | 'torso' | 'collarboneLine' }
  | { kind: 'jointBelow'; a: 'hip'; b: 'knee'; byAtLeast: number }     // squat depth
  | { kind: 'angleAt'; joint: Joint; deg: number; tol: number };      // e.g. elbow 175±3 at lockout

type Invariant =
  | { kind: 'segmentAngleFixed'; segment: 'torso' | 'shank'; tolDeg: number } // row hinge
  | { kind: 'pointFixed'; point: 'hip' | 'ankle' | 'head'; tolPx: number }    // bench hips, planted feet
  | { kind: 'angleNever'; joint: 'elbow' | 'knee'; aboveDeg: number };        // no hyperextension
```

FormSpecs are defined per **category template** (horizontal press, squat pattern, hinge row,
vertical pull, …aligned with the catalog's capability patterns) and inherited by each exercise
with per-exercise overrides — 60 exercises, a handful of templates, one validator.

### Canonical tempo (all categories, V1)

Eccentric **2000 ms** · endpoint hold **400 ms** · concentric **1100 ms** · top reset **500 ms**
≈ 4 s/rep → 2 reps + settle ≈ 8.5 s loop. Matches the cue language ("lower with control",
"control the return") and the motion law *confirms, never performs*. Per-exercise overrides
allowed only where a cue demands it.

## 2. Canonical definitions — the four benchmarks

*(These instantiate the founder's category definitions as measurable predicates. Each line cites
the cue it draws.)*

### Barbell Bench Press — template: horizontal press
- **Start/end of rep:** lockout — bar over shoulder line, elbows ~175° (never ≥178°).
- **Bottom:** bar **contacts the chest line** (visible meeting + 400 ms hold) — *"Lower to the chest with control."*
- **Path:** vertical, x fixed ±1.5 units — *"Drive the bar straight up."*
- **Invariants:** hips and shoulders fixed on bench; head fixed; **feet planted, zero movement** — *"Keep your feet planted."*
- **Camera (Amendment 7, 2026-07-08):** FRONT-VIEW from the head-end — the spotter's frame. The
  lying press's stroke is world-vertical, so face-on it lives fully in the drawing plane, with
  canonical 25/23 in-plane arms at lockout (the old side view's abduction license retires at the
  top; the one projected fold, per §3.4 rule 3, is the humerus tucking toward the feet at the
  chest). The frame adds what the side view never stated: both arms, both plates, the straddle
  over the end-on bench, and the **rack goalpost**. All predicates above are unchanged.

### Barbell Back Squat — template: squat pattern
- **Start/end of rep:** standing tall — hips and knees fully extended, bar over midfoot.
- **Bottom:** **hip crease below knee top** (`hip.y > knee.y + 2`) + hold — one unambiguous depth, every rep.
- **Path:** bar vertical over midfoot ±1.5 — the balance line the athlete should feel.
- **Invariants:** torso angle at any %-of-ascent within ±5° of the same %-of-descent (**no
  good-morning squat** — hips and chest rise together, *"Drive up evenly"*); heels never leave
  the floor; knee travel forward is set at the bottom keyframe and never wobbles laterally
  (single plane by construction).

### Barbell Row — template: hinge row
- **Start/end of rep:** dead hang — elbows ~175°, bar below shoulders at arms' length.
- **Top:** bar **contacts the torso at the lower-rib point** + hold — *"Pull to your lower ribs."*
- **Path:** vertical ±1.5 under the shoulder.
- **Invariants:** **torso angle fixed at 45° ± 3° for the entire rep** — the defining rule
  (*"Hinge to about 45°"*); knee angle fixed (soft, set once); head on the torso line (neutral
  neck, no craning).

### Lat Pulldown — template: vertical pull
- **Start/end of rep:** full stretch — elbows ~175°, arms long overhead, visible lat stretch.
- **Bottom:** bar reaches the **collarbone line** + hold — *"Pull to the collarbone"*, and never
  lower (a chest-bounce endpoint would contradict the cue).
- **Path:** bar vertical ±2 in front of the face.
- **Invariants:** torso lean fixed at ~15° ± 3° (**no swing** — *"Tall chest"*); hips fixed on
  seat; thighs fixed under pad; elbows travel down-and-back, never flaring forward past the bar
  line at the bottom.

Every remaining exercise gets the same treatment when its category template is instantiated —
the four above are the patterns most of the catalog inherits from.

## 3. The three decisions (recommendations)

### 3.1 Does Duotone remain the right skin? — **Yes, with one amendment.**

Correctness lives in the pose data and the FormSpec — the skin only determines how *verifiable*
correctness is to the athlete's eye. Duotone's depth reading (near limb dark, far limb faint) is
genuinely useful for body-position comprehension, and its capsule weight keeps it feeling like
Hush rather than embedded media. Its one weakness for the new goal: thicker limbs make exact
endpoints slightly softer to read.

**Amendment — range ticks:** the dashed bar path gains two short perpendicular ticks at
the canonical endpoints. The bar dot visibly touches each tick every rep; the 400 ms endpoint
hold happens exactly on the tick. Range of motion stops being something the athlete infers and
becomes something the drawing *states* — pure instrument language, borrowed from the Technical
direction's vocabulary. No joint nodes, no other Technical elements migrate.

> **Amendment 8 (founder, 2026-07-17) — THE OCHRE IS OFF THE CLIPS. The "~2 % ochre budget" this
> paragraph used to grant is REVOKED; the budget is now zero.** The READOUT law retired the accent
> hue from the product (the ochre survives as the HushMark seal alone), and a clip is the product
> speaking. `signal`/`signalInk` are deleted from `motion/types.ts` as well as the palette, so an
> accent hue in a clip is a compile error rather than a matter of taste.
>
> **What states the range instead:** the same ink as the bar (`ink0`), and the dash. The ochre was
> only ever here because every ink value was already spoken for — near limbs `ink0`, trunk `ink1`,
> far limbs `ink4`, equipment `ink3` — so with the ladder full, hue was the one axis left. That is
> the same bandage the app's SegmentedControl ochre turned out to be. A technical drawing states a
> dimension in the SAME pencil and distinguishes it by LINE TYPE; nothing else in the frame is
> dashed, and at a 19 % duty cycle the dash cannot compete with a solid limb. Drawing the ticks in
> the bar's own ink is what makes "the dot visibly touches each tick" read as contact rather than
> coincidence: one instrument, one pencil.

Emphasis mechanism at contact: **the hold is the emphasis.** No flashes, no pulses — motion
confirms, never performs.

**Amendment 2 (2026-07-07) — the Duotone Athlete (skin v2).** The duotone language (near side
dark `ink0`, far side faint `ink4`, no shading, no 3D) is unchanged; what the strokes describe
changed. The trunk is a **filled silhouette** generated around the hip→shoulder spine (glutes,
lumbar hollow, chest mass, trap slope — one profile that also renders the hinge and the lying
bench arch); limbs are **tapered capsules** (thigh 13 → ankle 6.5; shoulder 9 → wrist 5,
diameters) closed with a fist at the bar; feet are planted wedges with a soft ground shadow.
All rigs share one canonical anthropometry (`src/motion/anthro.ts`: arm = trunk = 48u, thigh 40,
shank 37; a rig may document a projected foreshortening, e.g. the bench humerus). Equipment is
true-scale: a 45cm plate is r16, drawn as a transparent **ghost disc** (rim + sleeve hub + bar
dot) in front of the figure — behind-the-head z-order concession only where the rim would cross
the face (back squat draws the head above the plate). Poses, FormSpecs, tempo, and the validator
are untouched by the skin.

**Amendment 3 (2026-07-07) — the knockout seam + honest dumbbell (skin v2.1).** Pre-rollout
first-principles review of the visual language found one systemic weakness: the working limb
(`ink0`) dissolved into the trunk (`ink1`) wherever it crossed the body — in seated, overhead,
and press rigs the very limb the demonstration exists to show was the least readable element.
The fix is the classic pictogram **knockout seam**: every near-plane element (working arm, near
leg, head, fist) is drawn over a copy of itself widened by a 2u `paper1` gap. Over the pale
media field the seam is near-invisible; over the dark body it becomes the crisp gap that keeps
the moving limb readable — contrast appears exactly where mass overlaps mass, by construction.
In `view:'front'` there is no far side, so both limbs draw after the trunk in `ink1` with the
same seam. Side-view far limbs stay faint (`ink4`), behind the trunk, seamless. Second: the
end-on dumbbell was retuned to HONEST scale in the barbell's ghost grammar — a working dumbbell
head ≈18cm → **r8** ghost disc (barbell plate r16), solid handle-end center; size hierarchy
alone now says barbell vs dumbbell. Poses, FormSpecs, tempo, and the validator remain untouched
by the skin.

### 3.2 Is the current architecture sufficient? — **Yes, structurally — upgraded in one place.**

The planned pipeline (pose keyframes + 2-bone IK contact constraints + interpolation) already
guarantees hands-on-bar and single-plane motion by construction. The upgrade this reframe
demands: form rules stop being per-exercise test code and become the **FormSpec data layer**
(§1) with one generic validator. The keyframes must *satisfy* the spec; the spec — not the
animation — is the canonical statement of Hush technique. It doubles as documentation, and
future exercises inherit canon from their category template instead of re-deciding it.

The IK also gains one derived guarantee for free: since limbs are solved from the bar path and
the FormSpec fixes the path and the invariants, most form errors become *unrepresentable* rather
than merely detected — a row whose torso angle is an invariant cannot be authored with a moving
hinge without the validator failing the build.

### 3.3 Is there a better visual approach for "canonical demonstration"? — **No — this one, held to a harder standard.**

The objective shift changes what the motion must satisfy, not what medium can satisfy it. Under
the single-operator constraint the alternatives (3D, AI video) got *worse* for canon — canon
requires exact, repeatable, testable positions, which is precisely what numeric skeletons give
and stochastic or hand-animated pipelines don't. What the shift genuinely adds is:

- the FormSpec layer (§1) — adopted;
- range ticks (§3.1) — adopted;
- endpoint holds and canonical tempo as normative, not stylistic — adopted;
- rejected: muscle highlighting, multi-view v1, annotation overlays — richness that doesn't
  serve the mental model, and clutter risks contradicting the paper/ink restraint.

### 3.4 View selection — the camera is a CATEGORY property (ratified 2026-07-07 · posture primacy ratified 2026-07-08)

Every rig draws from exactly one of two cameras — `view: 'side'` (default) or `view: 'front'`
(the symmetric frontal figure) — and **the view belongs to the template, never to an individual
exercise.** All members of a template share one camera; a member may not override it. Founder
directive: future exercises inherit their camera by category.

**Posture primacy (founder ratification, 2026-07-08).** The primary recognition signal is the
**defining posture**, not the movement path: a gym-goer names an exercise from what the body
instantly looks like, and reads the trajectory second. This was always rule 2's engine — the
rack goalpost and the face-pull goalpost that forced the frontal camera are *postures* — and it
is now the explicit ordering: **stage the defining posture first; stage the stroke inside
whatever camera holds it.** Two consequences: (a) a posture is only "defining" if it names THIS
exercise — a posture that equally names another family fails the primary rule itself (Amendment
5's no-shared-signature law applies to postures before cameras are even compared); (b) when the
posture-camera and the stroke-camera genuinely conflict, posture wins and the stroke degrades to
a projected fold at one endpoint (the face pull precedent — its reach travels partly along the
camera axis, accepted for the goalpost).

The selection rule, in order:

1. **Side view is the default.** Most gym movements articulate in the sagittal plane — presses
   on benches, rows, hinges, squats, curls, extensions — and the side camera shows their joint
   fold, path, and depth landmarks at full length.
2. **A rig MUST be front-view when its defining recognition cue lives in the frontal plane** —
   when the fold, flare, or silhouette that *identifies* the movement points along the side
   camera's axis and would foreshorten to nothing. The proof case is press_vertical: the rack
   position (elbows ~90°, upper arms parallel to the floor) is a fold into depth that side view
   cannot draw — the 2-bone IK crushes the arm and the start frame vanishes. Same class:
   **face_pull** (the goalpost finish — both elbows flared at shoulder height, forearms up — is
   a TWO-ARM frontal silhouette; a single side-view arm reads as a curl, proven twice in founder
   review), hip_abduction, lateral_raise, and any defining ROTATION that only projects face-on
   (the Arnold spin rides its template's front view). **Recognition outranks projection**
   (founder directive 2026-07-07): the test is "does the nameless silhouette identify the
   exercise at a glance," not "is every segment strictly projected."
3. **When neither plane holds the whole movement**, keep the view that holds the *recognition
   endpoint* and let the other endpoint be a projected fold — e.g. the front-view face pull's
   reaching start: arms toward the viewer-side pulley project shortened, which is honest
   projection and costs nothing, because the start is not the identifying frame.
4. FormSpec predicates are always stated in the drawing plane; the validator is view-agnostic.
   Where an endpoint is a projected fold, its predicates assert POSITION (contact points), not
   in-plane joint angles (the front-view face pull's reach asserts hands-together-at-the-rope,
   not an arm-length angle).
5. **Among stagings that hold the defining posture, the working stroke must live in the drawing
   plane** *(the depth-stroke theorem — proven by the frontal chest-press prototype, founder
   exploration 2026-07-07; SUBORDINATED to posture primacy 2026-07-08)*. The projection is
   orthographic, so a stroke along the camera axis leaves no pixels — and worse, it is
   AMBIGUOUS: extension away from the camera and flexion toward it render identically frame by
   frame. A projected fold is permitted at ONE endpoint (rule 3); the stroke between the
   endpoints should not be — but where posture and stroke genuinely conflict, **posture wins**
   (posture-primacy consequence (b); the face pull is the precedent). This rule is a tiebreaker
   and a warning, no longer an absolute.

   *The chest-press resolution (2026-07-08), recorded as the worked example:* the conflict there
   was **illusory on both sides**. The frontal chest press's "winning posture" — elbows wide at
   chest height, face-on — is the pec deck fly's reserved signature, so it fails posture primacy
   consequence (a): it names the wrong exercise before the stroke is even considered. And the
   side view's "losing posture" was an authoring flaw, not a camera property: the arm was drawn
   TUCKED (full-length 25/23), folding the elbow 24u below the shoulder into the deep vertical V
   that reads as elbow-flexion (curl/row language). A machine chest press holds its elbows at
   ~60° flare; side-projected honestly (upper arm 12, forearm 22 — the same documented abduction
   license as the bench benchmark's 20/22), the elbow coils FLAT BEHIND the hand at chest height:
   the loaded press-Z, a posture owned by pressing in the side plane. Posture primacy, applied
   with Amendment-5 rigor, selects the side camera for the horizontal press — and demands the
   posture be authored as the press posture within it. *(The camera half of this resolution was
   SUPERSEDED the same day by Amendment 7 below — the founder converted the question from a
   per-rig trade into a product identity decision. The posture findings stand: the frontal home
   posture must be authored apart from the fly's signature, and the tucked arm remains the
   documented mis-authoring.)*

**AMENDMENT 7 (founder directive, 2026-07-08) — the frontal identity families.** The camera for
every **chest-family and shoulder-family** exercise is `view: 'front'`, as a **product decision**:
these movements' identity lives in upper-body SYMMETRY, and their family must be obvious from
posture, symmetry, and overall visual impression before biomechanics or equipment are even read.
This is a directive, not the outcome of rules 1–5 — it covers press_horizontal, press_vertical
(already frontal), the chest and shoulder members of arc_fly (pec deck, cable/machine flies,
lateral and front raises, rear-delt flies), and **any future chest or shoulder movement**. Members
still may not override their template's camera; what changed is how the template's camera is
assigned for these two families. Two stagings implement it:

- **Lying presses — the head-end camera (the spotter's frame).** A lying press's stroke is
  world-vertical, so face-on it stays fully in the drawing plane: rule 5 is SATISFIED, not
  bought off — this is the one frontal staging where a chest press draws its entire path, with
  canonical in-plane arms at lockout. The supine body draws as the chest cross-section (the
  frontal trunk profile over a short spine), the head nested at its center crown-toward-camera
  (the featureless-head license of Amendment 4's "turn the athlete"), legs straddling the end-on
  bench. The one projected fold (rule 3) is at the chest endpoint: the humerus tucks toward the
  feet as the implement descends (documented 25 → 17; 14 on the close grip), which stacks the
  forearms vertically under the grip — the classic frontal bottom. Barbell members draw the
  **rack goalpost** (uprights + J-hooks); incline members raise the shoulder line against a
  visible reclined pad; dumbbell members converge honestly toward the top and carry no rack.

- **Toward-camera strokes — the PERSPECTIVE LICENSE.** Where the press axis is the camera axis
  (the seated machine chest press), orthographic projection leaves no pixels — that finding
  stands, and rule 5 is hereby scoped to it: *the depth-stroke theorem is a theorem about
  orthographic projection.* The frontal staging therefore draws **depth as scale**:
  `screen = center + offset · D/(D−depth)` (machine chest press: D = 72, true stroke 30). The
  fists (`Pose.fistR`), handles, and press-arm struts GROW as they near the viewer; the elbow
  flare sweeps from wide-at-the-chest to gone-behind-the-fists; the stack rides the true 3D
  stroke 1:1, and the range ticks live on the tower — the one in-plane image of the depth
  stroke, where the plate top lands on a tick at each endpoint hold. FormSpec predicates for
  projected endpoints stay positional (rule 4), and the true stroke is exposed to the validator
  as a measurable `stroke` pseudo-joint, so the depth axis is data, not vibes. The license is
  narrow: it exists to draw a stroke the camera cannot otherwise show, never to decorate — and
  the perspective center, D, and stroke are declared constants, honest and testable.

  *Signature separation (Amendment 5 rigor):* the frontal chest press's home posture is authored
  apart from the pec deck's reserved signature — the press shows GRIPPED handles with the elbow
  UNFOLDING toward the viewer and scale change along the stroke; the fly keeps frozen elbows
  sweeping wing pads through a wide arc with no scale change. The pec deck's reserved registry
  entry is refined accordingly (§3.5).

### 3.5 The Recognition Layer — equipment is a first-class component (ratified 2026-07-07 · rewritten by Amendment 4, same day)

**The founder's reframe:** the catalog had been optimizing for **pose recognition**; the product
requirement is **exercise recognition**. A half-second glance at a nameless demonstration must
answer three questions:

1. What is the body doing? *(the motion layer — already governed by §§0–3)*
2. What equipment is being used?
3. **Where does the resistance come from?**

The proof case is the frontal face pull: the goalpost silhouette is correct (which proves §3.4's
camera rules), but with the machine behind the camera the drawing carried no statement that this
is a *cable* exercise — the same pose could be any elbows-beside-the-head movement. The failure
was never the camera; the resistance source had become invisible.

**Amendment 4 (founder directive, 2026-07-07): recognition first, reduction second.** The first
version of this section kept minimalism as the governing objective ("the *minimum* visual context
for instant recognition… never a complete machine"). That order is now inverted. Every equipment
family starts from **the clearest possible representation of the exercise** — the complete
station where the station is what identifies the exercise — and is simplified only afterwards,
and only where removal does not weaken recognition. Designing minimal and adding recognition back
has proven the harder direction; it is no longer permitted.

**The recognition test.** Cover the athlete: a gym-goer must still be able to name the station
from the equipment alone. Machine exercises are *named after their machines* — the machine is the
exercise's noun and the movement is its verb, and a canonical demonstration draws both. A drawing
that fails the covered-athlete test is under-specified no matter how clean it looks.

**Every station makes four statements** (the force-chain law below is the third, retained
verbatim from the original ratification):

1. **Frame** — the machine stands on the floor: uprights, base feet, ground contact. A machine
   that floats reads as marks, not a machine.
2. **Resistance** — the mass is visible whenever the camera can honestly see it: the weight
   stack in its tower, the plates on the sleeve or shaft. On cable/selectorized machines the
   **selected plate rides the cable**: the top slab visibly rises with the pull and settles on
   the return, in exact proportion to handle travel — the resistance is not a symbol, it moves.
3. **Transmission** — the taut force chain from resistance to fist (the table below).
4. **Interface** — seat, pads, footplates, handles: where the body meets the machine. A pad that
   anchors the athlete is part of the form statement and is drawn **attached to the frame**,
   never floating in space.

**The law: the force chain is drawn.** Every demonstration must visibly connect
**resistance source → transmission → athlete** in every frame of the loop:

- **Barbell:** plates → bar → fist. *(Side view: the true-scale ghost plate + end-on bar dot.
  Front view: the bar crossing the frame + edge-on plate slabs.)*
- **Dumbbell:** dumbbell → fist. *(The honest r8 ghost disc / side-on handle / front projection.)*
- **Cable:** weight stack → pulley → cable → handle → fist. The cable is TAUT from a stated
  origin; when the station is in frame, a **simplified weight stack** sits in its tower.
- **Lever machine:** frame/pivot → press arm → handle → fist. The lever must **track the handle**
  through the whole rep — a static lever that detaches from its moving handle breaks the chain.
- **Rail machine:** rail → carriage → handle → fist. The handle visibly rides its rail (slider +
  link), never floats beside it.
- **T-bar / landmine:** floor pivot → lever shaft (drawn in the BAR voice, never the cable
  stroke) → plates near the handle.
- **Bodyweight (future templates):** the anchor — bar, floor, dip bars — is the resistance
  statement.

*The shroud license (Amendment 4):* where the real machine encloses its routing — selectorized
presses and lever rows hide their cables inside the frame — the drawing may too. The chain then
reads **frame-fused**: the mechanical member (ram, arm, carriage) visibly enters the frame, the
stack tower is part of that same frame, and the selected plate moves in exact sync with the
handle — which is precisely what a gym-goer's eye sees. Cable stations (pulldown, cable rows,
face pull, pushdowns) draw their routing explicitly, pulley by pulley. Drawing an invented
external cable on a machine that hides its own would be decoration, not honesty.

**Staging: turn the athlete, not the machine** *(Amendment 4 — supersedes the "camera-side
origins" rule)*. When the machine stands where the camera does, the rig is staged with the
athlete **facing the station**, camera behind them: the figure is the unchanged frontal figure
(the head has no facial features, so a front-view body reads identically from behind), and the
complete station draws in the far plane — honestly occluded by the athlete's body where it
passes behind it, visible everywhere else. The proof case is face_pull: mast rising past the
head to the top of the frame, high pulley above the head, rope V taut from the pulley to both
fists. Near-camera mount stubs and rope-from-the-frame-edge devices are retired — they stated
an origin without ever drawing the machine.

**Recognition sets the floor; restraint sets the voice.** Equipment stays in the established
quiet machine voice (`ink3` structure strokes, `paper3` upholstery, slab stacks, ghost plate
mass); the athlete remains the hero and the only dark, richly drawn element. Recognition comes
from **completeness of silhouette**, never from contrast or detail rendering — a complete
machine in the quiet voice does not compete with the figure, so drawing all of it does not
violate §0 corollary 1. Simplification happens after the recognition test passes, and may only
remove what the naming does not need (fasteners, gussets, cosmetic bends) — never one of the
four statements.

**System property, not per-exercise fixes.** The recognition grammar belongs to the **equipment
family** exactly as the camera belongs to the category (§3.4). A rig states which family it
draws; the family defines the **canonical station** (its four statements and its signature
silhouette), and members parameterize it — pulley height, pad position, handle travel. Audits
run across the whole catalog against this section — individual exercises may not invent their
own equipment language. The station assemblies live in `src/motion/machines.ts`; the shared
vocabulary (plates, cables, pulleys, pads, benches) stays in `src/motion/kit.ts`.

**Amendment 5 (founder review of the equipment pass, 2026-07-07): one station, one signature.**
Amendment 4 made the force chain visible; the founder's review of that pass moved the question
from *"how much equipment is shown"* to *"how distinct does each equipment family feel."* The
strongest systems recognize at three levels — athlete silhouette, movement silhouette,
**equipment silhouette** — and the third has its own test, stricter than the covered-athlete
naming test: with the athlete covered and no motion playing, each station must be distinguishable
**from every other station in the catalog**. Three laws:

1. **The stack is the shared voice, never the identity.** All weight stacks look alike — in the
   drawing as in a real gym — so a station may not rely on its tower for naming. Identity lives
   in the **interface and linkage**: the pads, arms, benches, and attachments the body meets.
2. **Each equipment family owns exactly one signature** — the element a gym-goer would name the
   machine by — and **no two families may share it**. The signature must survive the
   covered-athlete test *and* thumbnail scale. A station whose first read matches another
   family's signature is mis-drawn even if every one of Amendment 4's four statements is present:
   the proof case is the shoulder press, whose rail-and-carriage staging made all four statements
   and still read as a **Smith machine** (the full-height gate with a sliding crossbar is the
   Smith's signature, and is now reserved for it — the shoulder press draws twin press arms
   folding up from short side pillars instead, moving it from rail-machine to lever-machine
   grammar in the force-chain table).
3. **The attachment is a word.** Cable attachments are how gym-goers tell cable exercises apart,
   so each draws its true silhouette, never a generic tick: the pulldown's wide bar with
   **downswept tips**, the seated row's **V-grip yoke** (the cable attaches at the apex — never
   6u short of it), the face pull's **ball-ended rope**.

*The signature registry (ratified · machine chest press and bench stations re-ratified under
Amendment 7, 2026-07-08):* lat pulldown = cantilevered high beam + swept-tip bar + thigh pad ·
seated cable row = long low bench + braced footplate + low exit pulley + V-grip · machine row =
floating chest pad on its column + pull arm folding from a high pivot · machine chest press =
**high-back seat** (the pad runs past the shoulder to head height) + twin GROWING handles at
chest height on perspective press-arm struts (front view, §3.4 Am. 7) · barbell bench station =
**the rack goalpost** (two uprights + J-hooks framing the athlete) + end-on bench + full bar
crossing the frame (front view; the incline adds its reclined back pad; dumbbell benches carry
NO rack — the empty-handed bench is their statement) · machine shoulder press = twin folding
press arms beside the shoulders (front view) · face pull = height-adjustable mast + high pulley
+ ball-ended rope V · t-bar row = floor hinge + lever shaft in the bar voice + plates at the
working end.

*Reserved signatures (rollout families — the signature is designed before the exercise ships,
so no future station can collide):* pec deck = twin wing pads sweeping face-on **with frozen
elbows through a wide arc, no scale change** (refined by Am. 7 to stay disjoint from the
frontal press's unfolding-elbow + growing-handle read) · leg extension = shin roller in front
of the seat · leg curl = ankle roller over an angled bench · leg press = 45° sled rails with
the footplate above the athlete · cable pushdown = high pulley + short straight bar at standing
height · Smith machine = the full-height gate + sliding crossbar.

### 3.6 Temporal staging — the clock is a camera (Amendment 6, founder presentation review 2026-07-07)

The founder's one-second test ("hide the labels; the first word must be *Press*") is a claim
about the **emphasized phase**: in a 4-second rep, whatever the slow 2-second stroke does is what
the exercise reads as. The camera (§3.4) stages the movement in space; the tempo stages it in
time — and a rig can pass every spatial rule and still tell the wrong story if its clock leads
with the wrong stroke.

**The diagnosis.** In side view, a horizontal press and a horizontal pull collapse spatially:
seated athlete, fixed torso, hands traveling horizontally. The discriminator that remains is
temporal — *which direction the emphasized stroke travels relative to the body*. Every
press_vertical rig opens at the rack and PRESSES through its 2s stroke (this — more than the
symmetry — is why the machine shoulder press reads "press" instantly). machine_chest_press had
copied the barbell bench's rep anchor (rom 0 = lockout), so its emphasized stroke traveled
**toward the torso — the pull's direction** — and the side view duly read "row". The machine was
never the problem; the front-view camera was investigated and rejected (the press axis IS the
camera axis: the lockout points at the lens, both arm segments foreshorten to nothing, and §3.4
rule 3 cannot rotate a toward-camera endpoint into the drawing plane — the recognition endpoint
must be *reachable* in-plane). The side camera was right; the clock was wrong. *(§3.4 Amendment 7
later moved the family to the front view under the perspective license — the orthographic finding
here stands, and this section's LAW is camera-independent: the machine still opens at the chest
and presses first, now toward the viewer.)*

**The law.** *The loop opens where the equipment honestly rests, and the emphasized 2s stroke is
therefore the rep's first working action.*

- **Barbell presses** rest at lockout — the unrack is real — so they open at lockout and lower
  first (bench, inclines, overhead barbell from the front-rack).
- **Selectorized machines** rest with the stack seated and the handles home, so they open at the
  body and PRESS first (machine_chest_press: rom 0 = handles at the chest, rom 1 = lockout). A
  machine physically cannot begin at lockout; borrowing the barbell's anchor was a modeling
  error, not a style choice.
- **Rows and pulldowns** rest with the stack seated and the arms long, so they open at the
  stretch and PULL first — which they already did.
- `startAt: 'bottom'` remains the mechanism for lifts whose canonical rom keeps lockout at 0 but
  whose rep opens at the stretch (deadlift from the floor).

A useful corollary for authoring: **presses press first; pulls pull first.** If the emphasized
stroke of a press travels toward the body, the rep anchor is wrong.

## 4. The category model (ratification artifact — requested 2026-07-06)

### 4.0 Three mechanics, twenty templates, sixty exercises

Every demonstration in the catalog — current and future — is one of **three mechanics**:

- **Mechanic A — the implement travels; the body is anchored.** Presses, rows, pulldowns,
  isolations. The FormSpec tracks the implement's path; the invariants pin the body.
- **Mechanic B — the body travels about a fixed contact.** Squats, hinges, bridges, calf
  raises, bodyweight push/pull. The FormSpec tracks a body landmark (hip, chest, heel); the
  invariants pin the contact points (feet, hands, pads) and the alignment rules.
- **Mechanic C — static hold.** No current catalog member (no planks in V1); reserved. Tempo
  degenerates to a single `holdMs`; ROM degenerates to one position held.

A **template** is a mechanic plus a parameterization (what travels, between which endpoints,
what is pinned). An **exercise** is a template plus parameters (bench angle, grip, stance,
cable origin) and — rarely — predicate overrides. Adding a future exercise means choosing a
template and filling parameters; inventing a new template is a deliberate, reviewed event
(expected a handful per year at most, e.g. `static_hold` when planks arrive).

**Global defaults (every template inherits; overrides are per-template, listed below):**
- Tempo: eccentric **2000 ms** → endpoint hold **400 ms** → concentric **1100 ms** → top reset
  **500 ms**; loop = 2 identical reps ≈ 8.5 s. Rep order is eccentric-first unless the lift
  starts at its stretch (`concentric_first`, e.g. deadlift from the floor).
- Extension endpoints: "straight" joints at 175° ± 3°, never ≥ 178° (no hyperextension) —
  applies to every lockout and every dead-hang.
- Path: vertical within ± 1.5 units unless the template declares an arc (isolations that
  rotate about a single joint declare `arc(center=joint, radius=segment)` — the radius is the
  limb, so the arc is exact by construction; the "path constraint" becomes *the pivot joint
  must not move*).
- Camera: side view. Templates whose information is frontal declare `view: front`.
- Range ticks sit on the tracked path at the two canonical endpoints; the 400 ms hold lands
  exactly on the tick.

### 4.1 Mechanic A templates — implement travels

| Template | Start → End (canonical ROM) | Path / tracked point | Stability & invariants | Members (params) |
|---|---|---|---|---|
| **press_horizontal** | Lockout (elbow 175°) ↔ **bar/handle contacts chest line**; rep anchor per §3.6 — barbell/db members open at lockout (the unrack), machine_chest_press opens at the chest (the stack rests there) and **presses first**. **FRONT-VIEW per §3.4 Am. 7 (frontal identity family)**: lying members from the head-end camera (world-vertical stroke fully in-plane; humerus tuck at the chest is the one rule-3 fold, 25→17, close grip 14; barbell members draw the rack goalpost, incline members the reclined pad, db members no rack), the seated machine under the **perspective license** (depth as scale, D=72) | vertical at fixed grip x on benches (the incline groove tilts along the DEPTH axis, so it projects vertical from the head-end camera — honest); a slight converging `line` per hand for dumbbells (the honest arc); the machine's true 3D stroke is the **`stroke` pseudo-joint** (30u, `horizontal`), its only in-plane image the 1:1 stack ride | hips+shoulders on bench/pad, head fixed, feet planted (zero movement); symmetry by construction (left mirrors right); db members draw BOTH dumbbells | bb_bench_press · incline_bb_press (raised shoulder line, upper-chest contact) · db_bench_press · incline_db_press · machine_chest_press (seated; perspective press) · close_grip_bench (grip param) — **6** |
| **press_vertical** | **Rack position → lockout overhead**, presented FRONT-VIEW (the rack — elbows ~90°, upper arms parallel to the floor, forearms vertical — is a depth fold a side view cannot draw; the Arnold rotation only reads face-on). Barbell racks lower: bar at the chin, elbows bent under it (~55°) | vertical, hands | torso vertical ±3° (no layback), hips/knees fixed, head still | bb_overhead_press (front-rack) · db_shoulder_press (goalpost, dumbbells side-on) · machine_shoulder_press (goalpost, twin folding press arms per §3.5 Am. 5) · arnold_press (**palms-in → palms-forward spin drawn by honest projection**, path unchanged) — **4** *(re-authored per founder movement-accuracy review 2026-07-07)* |
| **pull_row** | Arms long (elbow 175°) → **handle contacts torso landmark** | vertical (hinged) or horizontal (seated/supported), handle | **torso: frozen ±3° where the body is braced** (bb_row's strict hinge — its defining cue; db_row's bench support; machine_row's chest pad; face_pull standing tall) **or a small AUTHORED torso contribution where real technique includes one, capped by the invariant** (t_bar_row: 8° hip drive about fixed hips, ≤10°; cable_row: 15° controlled hinge — reach forward at the stretch, finish tall — ≤18°); knees fixed *(members split per founder movement-accuracy review 2026-07-07)* | bb_row (45° hinge, lower ribs) · t_bar_row (chest, hip drive) · db_row (bench-supported, hip) · cable_row (seated hinge, waist) · machine_row (chest pad, elbows back) · face_pull (**FRONT-VIEW per §3.4 rule 2** — rope from a high pulley pulled into the goalpost: elbows flared at shoulder height, forearms up, hands beside the head; staged FACING the station per §3.5 Amendment 4 — camera behind the athlete, mast + high pulley + rope V drawn in the far plane) — **6** |
| **pull_vertical** | Full overhead stretch (elbow 175°, lats long) → **bar at collarbone line, never lower** | vertical, bar | torso lean frozen ~15° ±3° (no swing), hips on seat, thighs under pad | lat_pulldown — **1** |
| **arc_fly** | Arms open/low → arms together / **raised to shoulder height, never higher**. **FRONT-VIEW per §3.4 Am. 7** (frontal identity family — flare and symmetry ARE the identity; staging authored at rollout, pec deck against its refined reserved signature: frozen elbows, wide arc, no scale change) | arc about shoulder; **elbow angle frozen (soft, ~160°)** | shoulder (pivot) fixed; torso fixed; no shrug (shoulder y constant) | pec_deck · cable_fly · rear_delt_fly (reverse direction) · lateral_raise (endpoint = shoulder height per cue) · cable_lateral_raise — **5** |
| **elbow_flexion** | Elbow 175° at side → full flexion (~55°) | arc about elbow; **elbow point pinned ±1** (the "no swinging" cue as geometry) | torso vertical fixed; shoulder fixed; wrist neutral | bb_curl · db_curl · hammer_curl (grip param) · preacher_curl (elbow pinned on pad param) — **4** |
| **elbow_extension** | Full flexion → elbow 175° lockout | arc about elbow; elbow pinned ±1 | upper-arm orientation param is **frozen** (at side / overhead / lying-vertical); torso fixed | triceps_pushdown (upper arm at side) · overhead_triceps_ext (overhead) · skullcrusher (lying, upper arm vertical) — **3** |
| **knee_extension** | Knee ~90° seated → knee 175° | arc about knee; knee pinned | hips on seat, torso fixed ("sit tall") | leg_extension — **1** |
| **knee_flexion** | Knee 175° → full curl (~60°) | arc about knee; knee pinned | **hips down/fixed** (the defining fault is hip lift) | leg_curl — **1** |
| **sled_press** | Knees ~90° (sled low) → knees 175°-minus (per cue "don't lock out hard": endpoint 168° ±3 for leg_press) | **linear along the machine rail** (declared axis), sled/platform | back flat on pad (torso angle = rail-frame constant), hips never rise off pad, heels planted on platform | leg_press · hack_squat (body rides the sled — same rail geometry) — **2** |
| **hip_arc** | Limb at neutral → limb at canonical arc endpoint | arc about hip; hip pinned; torso frozen | pelvis fixed (no rocking) | hip_abduction (**front view**, knees out) · cable_kickback (heel back, slight fixed forward hinge) · hanging_leg_raise (hang anchor = hands; "no swing" = shoulder pinned) — **3** |
| **crunch_flexion** | Spine long → spine flexed (chest toward pelvis) | arc of the chest landmark about a **fixed hip point** ("hips fixed" cue as geometry) | hips pinned ±1; arms ride, never pull | cable_crunch (kneeling) · machine_crunch (seated, chest on pad) — **2** |

### 4.2 Mechanic B templates — body travels

| Template | Start → End (canonical ROM) | Path / tracked point | Stability & invariants | Members (params) |
|---|---|---|---|---|
| **squat_bilateral** | Standing tall (hip+knee 175°) → **hip crease below knee top** (`hip.y > knee.y + 2`) | bar/load vertical over mid-foot ±1.5 | heels never leave floor; **torso angle at any % of ascent within ±5° of same % of descent** (no good-morning); single plane | bb_back_squat (bar on traps) · front_squat (bar on front delts, more upright torso param) · goblet_squat (load at chest) — **3** |
| **squat_single_leg** | Standing split → **rear knee just above floor** (front knee ~90°) | load/torso vertical (front-shank tracks toes) | front heel planted; torso lean frozen ±5°; "drop straight down" = hip x fixed ±2 | bulgarian_split_squat (rear foot elevated param) · walking_lunge (step param; loop shows one canonical rep in place + step note) — **2** |
| **hinge** | Standing tall → **bar below knee / torso ~horizontal-limit for the variant**, bar never drifts from legs | bar vertical, **within 2 units of the leg line** ("keep the bar close") | knees soft & frozen after setup; back flat (neutral spine — torso drawn straight, never curled); shins vertical at RDL bottom | bb_rdl · db_rdl · bb_deadlift (**concentric_first**, from floor, ROM floor→lockout) · sumo_deadlift (stance param, concentric_first) · cable_pull_through (cable origin behind) · back_extension (hips pinned on pad; torso is the moving segment) — **6** |
| **bridge** | Hips on/near floor-bench → **hip lockout** (shoulder-hip-knee line straight, 175°) | hip landmark vertical arc about shoulders | shoulders anchored (bench/floor), feet planted, shins ~vertical at top | hip_thrust (bench param) · glute_bridge (floor param) — **2** |
| **calf_raise** | **Heel below platform edge (full stretch)** → full rise onto ball of foot | heel landmark vertical; ball-of-foot pinned | knee angle frozen (straight standing / 90° seated / on-sled param); no bounce (hold at both ends: bottom hold 400 ms **and** top hold 400 ms per "pause at the top") | standing_calf_raise · seated_calf_raise · leg_press_calf_raise (sled param) — **3** |
| **bodyweight_push** | Elbow 175° → **chest to floor line / deep dip stretch** | chest landmark vertical; hands pinned | body line straight head-to-anchor ±3° for the whole rep (push-up plank line; dip forward-lean frozen) | push_up · knee_push_up (pivot = knees param) · chest_dip (vertical, depth = shoulder below elbow) — **3** |
| **bodyweight_pull** | Dead hang (elbow 175°) → **chin over bar** | chest/chin landmark vertical; hands pinned on bar | no kip: hip x fixed ±2; legs quiet | pull_up · chin_up (grip param) — **2** |
| **rollout** | Kneeling, wheel under shoulders → **wheel at controlled max, hips open, body line straight** | wheel horizontal along floor | hips never sag below the shoulder-knee line ("brace hard"); knees pinned | ab_wheel — **1** |

**Coverage check: 6+4+6+1+5+4+3+1+1+2+3+2 (A) + 3+2+6+2+3+3+2+1 (B) = 60 / 60.** Every
member is parameters only — zero bespoke predicate sets in the current catalog. Templates
with one member (pull_vertical, knee_extension, knee_flexion, rollout) are kept separate
because their mechanics are genuinely distinct, not because they needed exceptions.

### 4.3 Why this stays sound over 5 years

- **New exercise, existing pattern** (the overwhelming case — a new curl, press, or squat
  variant): template + parameters, canon inherited, nothing re-decided.
- **New pattern** (rare — e.g. planks → `static_hold`): a new template is a reviewed,
  deliberate addition of one table row, not an accumulation of per-exercise rules.
- **Drift is structurally blocked**: predicates live in templates; an exercise can only
  *tighten or parameterize* them. The validator runs template predicates on every exercise's
  timeline in CI, so a pose edit that violates its category fails the build — the same
  mechanism from §1, now guaranteed uniform across categories.

## 5. Ready state for Phase 1

On ratification of this standard, the first animated benchmark (Barbell Bench Press) is built
against: Duotone skin + range ticks · FormSpec `horizontal press` template instantiated per §2 ·
validator running in jest · filmstrip + GIF harness for visual QC. Success = the founder can
watch the loop and check every §2 bench predicate with their own eyes, and CI can check them
without eyes.
