# Hush Training Engine — MVP Specification (v4: observation-driven, frozen)

> **Final pass applied.** Rail now caps *implied e1RM demand*, not raw load (100→105 verified reachable). Removed systemic-drop and sustained-drop deloads. Removed FAVORITE. Reduced advanced STALL_WINDOW 8→6. Added a hard per-session set cap. Replaced swap scoring with LOCKED+tenure+observed-mismatch.
>
> **Post-freeze removal (satisfaction/engagement layer):** Removed the weekly satisfaction signal, `satisfaction_history`, `engagement_mode`, `human_review_flag`, and all engagement-mode logic. Rationale: it solved no unique problem — manual exercise replacement, the hard session cap, and the reactive engine (repricing/hold/volume limits/absence) already cover difficulty and duration, and subjective weekly ratings should not drive training decisions. The engine now reacts ONLY to completed training history, profile data, and explicit athlete actions (locks, replacements, profile edits).

**Status:** Frozen. This architecture is the result of removing every component that could not justify its existence by either (1) measurable outcome improvement in simulation, or (2) explicit athlete-experience protection. Nothing that merely "the model wanted" survived.

**Scope:** A deterministic weekly engine that generates an athlete's complete training program from that athlete's own completed history. No machine learning, no Bayesian inference, no ongoing population priors, no fatigue inference, no future prediction.

## The two governing principles

1. **The athlete comes before the model.** The objective is long-term athlete success — trust, adherence, enjoyment, and results together. A physiologically optimal program that causes the athlete to quit is a failure. Whenever optimization and the athlete's experience conflict, the athlete wins.
2. **React to reality; do not predict it.** The prescription is a hypothesis; the completed work is the truth. Hush observes what the athlete actually did and adapts — it never estimates fatigue, recovery, capability ceilings, future performance, or progress velocity, because those are unobservable and every attempt to model them reintroduced conservatism or churn.

## What was removed, and why (the design record)

| Removed | Reason |
|---|---|
| Per-pattern fatigue inference | Read noise (set-variance, rep-decay) as fatigue, withdrew training, and — by stalling adaptation while load crept — *caused* the injuries it aimed to prevent. |
| Trajectory / future-progress / velocity / ceiling estimation | Fed unobservables into decisions; made no decision possible that observed history couldn't make directly. |
| Maintenance state | Falsification showed identical gains, safety, and thrash with vs. without it; the volume cap + load rail + repricing already produce holding behavior at the limit. |
| Scheduled (calendar) deloads | Withdrew training from thriving athletes on a week-number, not evidence — a model rhythm imposed on the athlete. |
| Aggression dial | Ablation showed no measurable benefit in any athlete cell and no safety role. |
| Systemic-drop deload (60% of patterns down in one week → deload) | It was fatigue inference at the multi-pattern level: a one-week broad drop is usually a shared benign cause (sleep/stress/timing) that rebounds on its own, and a genuine over-reach is already handled by per-pattern repricing pulling every load down to demonstrated capability. It named a latent cause the engine cannot observe; removed. |
| Sustained-drop deload (single pattern down ≥3 wk → deload) | Same pattern again: observe decline → infer hidden cause → withdraw volume. Repricing already lowers the load weekly, progression already stops, HOLD already holds, injury/absence modes already exist. Its only unique act (cutting volume on one declining lift) solves no problem those don't; removed, taking SUSTAINED_DROP_WEEKS with it. |
| Swap benefit/cost scoring (tiers, threshold, favorite/tenure/churn arithmetic) | Solved nothing the simpler rule doesn't: LOCKED protects attachment (stated, not guessed), a 4-week minimum tenure prevents churn, and observed mismatch is the real trigger. The arithmetic was unvalidated false precision; removed in favor of LOCKED + tenure + observed-mismatch. |

## Two-justification rule (the freeze gate)

Every component below is labeled **[Progression]** (measurable outcome), **[Safety]**, or **[Experience]** (athlete-experience protection). No other justification is permitted.

---

## 1. Components and their justification

| Component | Class | One-line justification |
|---|---|---|
| Reprice-to-demonstrated | Progression | Removing it cost ~15% of 5-yr gains; matches load to reality after a miss. |
| Volume levers | Progression | Removing it cost ~18% of gains; primary stimulus increment on a stall. |
| Load progression (beat→load, meet→reps) | Progression | The basic forward motion; without it nothing advances. |
| Cold-start seed (week-1 only, then discarded) | Progression (transient) | Saves ~2 calibration weeks, then permanently exits — zero influence after week 1. |
| Hard load rail | Safety | Prevents a prescription's implied e1RM from exceeding demonstrated strength by more than one small step — climbs in proven increments, forbids untested jumps. |
| Per-session set cap | Experience | Without it, volume-first progression at advanced ceilings produces 114-min sessions — an adherence killer; caps sessions at ~60-65 min and reconciles weekly volume with the one-hour product constraint. |
| Observation-only recovery triggers | Safety | Reduces training only on observed evidence of a real problem. |
| Stall window | Experience | Prevents reacting to one noisy week; protects trust and program stability. |
| Patient hold | Experience | At the cap, holds and re-tests instead of churning; protects confidence/familiarity. |
| Range change | Experience | A variety/freshness lever (no measured strength effect); adherence support. |
| Adherence gate | Experience | Never progress on a week that didn't really happen; ease friction instead. |
| Preference / lock model | Experience | Protects identity and gym reality — the things that keep athletes training for years. |
| Swap rule (tenure + observed mismatch) | Experience | Unlocked exercises run ≥4 wk then swap only if demonstrably failing; LOCKED gives full athlete control. Replaced the unvalidated scoring arithmetic. |
| Gym-flow assembler | Experience | The program is judged during execution; a miserable in-gym flow fails. |

---

## 2. Movement patterns
`HORIZONTAL_PUSH, HORIZONTAL_PULL, VERTICAL_PUSH, VERTICAL_PULL, KNEE_DOMINANT, HIP_DOMINANT, CORE` — one chosen exercise per pattern at a time.

---

## 3. Data model

### 3.1 Profile (onboarding)
```json
{"sex":"male|female","age":0,"bodyweight_kg":0.0,
 "training_age":"novice|intermediate|advanced",
 "goal":"strength|hypertrophy|general_fitness",
 "variety_preference":"low|medium|high","workout_count":4,
 "available_equipment":["barbell","dumbbell","machine","cable","bodyweight"],
 "gym_busyness":"low|medium|high"}
```

### 3.2 Per-pattern state
```json
{"pattern":"HORIZONTAL_PUSH","current_exercise_id":"barbell_bench_press",
 "current_load_kg":80.0,"current_sets":3,"rep_target":5,"rep_range":[5,8],
 "locked":false,"tenure_weeks":4,
 "history":[{"week":12,"sets":[{"load":80,"reps":6,"failed":false}],
             "e1rm_week":96.0,"volume_load":0.0,"completed_sets":3,"prescribed_sets":3}],
 "flat_weeks":0,"miss_streak":0,"levers_tried":[],"hold_mode":false,
 "weeks_since_swap":4,"calibrating":true}
```
**Not present:** any fatigue flag, aggression dial, maintenance flag, trajectory, ceiling estimate, or stored seed (the seed is discarded at calibration exit — §4.4).

### 3.3 Global
```json
{"days_since_last_session":0}
```
(No satisfaction, engagement, or review fields — the engine holds no subjective/affective state.)

---

## 4. Initialization

### 4.1 Starting volume (sets/pattern/week)
novice 8 / intermediate 10 / advanced 12 (major); CORE 6/8/10.

### 4.2 Rep range by goal
strength [3,6] t5 · hypertrophy [8,12] t8 · general_fitness [6,12] t8 · CORE [10,15] t12.

### 4.3 Cold-start seed (the ONLY population input)
A static lookup keyed by (sex, training_age) gives a week-1 load as a fraction of bodyweight per main lift (literature norms initially; replaced by your own users' observed starts as they accumulate). Used to compute the week-1 prescription **and nothing else.**

### 4.4 Seed discard rule (hard requirement)
When a pattern exits CALIBRATING (§5.4), the seed value is **permanently discarded**. After that point the seed must never influence progression, load, volume, exercise, recovery, or any other decision. The athlete's demonstrated history is the sole source of truth. The seed is a temporary first guess, not a prior.

### 4.5 Preferences
Per pattern the athlete may set LOCKED (or not), pick the starting exercise, declare variety_preference and available_equipment. Never prescribe unavailable equipment. Every pattern starts CALIBRATING.

---

## 5. Weekly calculation — observation only

### 5.1 Adherence
`adherence = sessions_completed / sessions_planned`

### 5.2 Progress metric (goal-specific, from completed work)
```
strength:        e1RM (best set, Epley load×(1+reps/30))
hypertrophy:     volume_load AND reps-at-fixed-load; e1RM secondary
general_fitness: adherence + satisfaction + gentle e1RM uptrend
```

### 5.3 Trend (training-age gated)
```
baseline = mean(metric, previous up-to-2 weeks); delta = (now−baseline)/baseline
UP > +0.02 ; FLAT within ±0.02 ; DOWN < −0.02
A FLAT result only acts after the STALL WINDOW (novice 2 / int 4 / adv 6 weeks). [Experience]
Inside the window, FLAT → hold.
```

### 5.4 Demonstrated capability (from completed sets — the core read)
```
best_e1rm = max(load×(1+reps/30)) over completed sets
demonstrated_load_at_target = best_e1rm / (1 + rep_target/30)
hit = best reps ≥ target, no top-set failure
room = best reps ≥ target+1, no failures
missed = top set failed OR best reps < target
```
No variance flag, no decay flag. CALIBRATING exits after 2 in-range weeks → seed discarded (§4.4).

### 5.5 Recovery evidence (unambiguous observed facts ONLY — the deload triggers)
```
extended_absence = days_since_last_session > 10        # fact: they didn't train
injury_flag      = athlete-reported (or rehab mode)    # fact: reported
```
These are the ONLY deload triggers, and both are unambiguous facts — not inferences about internal
state. There is no calendar trigger, no multi-pattern/systemic-drop trigger, and **no sustained-drop
trigger.** A lift that is declining is handled entirely by the reactive core: repricing lowers its
load to demonstrated capability each week, progression stops, and it falls into HOLD (which keeps
re-probing). No additional deload is needed, because a deload's only unique act — cutting *volume* on
a single declining lift — solves no athlete problem that repricing + HOLD don't already solve, and
deciding "down N weeks therefore withdraw volume" is an inference about cause that the engine refuses
to make. (This removal also deletes the SUSTAINED_DROP_WEEKS placeholder entirely.)

### 5.6 (removed) Satisfaction / engagement
The weekly satisfaction question and engagement mode were removed post-freeze. No subjective rating
enters any decision. The engine reacts only to completed history, profile, and explicit athlete actions.

---

## 6. Global decision order

```
1. adherence < 0.67 → hold all, sets −1 (floor MEV), no progression → EMIT, STOP        [Experience]
2. extended_absence → affected patterns load ×0.90, rebuild (continue for others)         [Safety]
3. else → per-pattern loop (§7)
```
There is no step that reduces a thriving athlete on a schedule, no step that deloads on a multi-pattern
drop, and no step that deloads on a sustained single-pattern decline — every drop, broad or persistent,
flows into the per-pattern reactive logic (repricing + HOLD) like any other observed performance. Deloads
occur ONLY on extended absence or an injury/rehab flag (§5.5).

---

## 7. Per-pattern logic (reactive)

```
MISSED (§5.4):                                                                  [Progression]
    miss_streak += 1
    reprice load → demonstrated_load_at_target ; KEEP volume ; KEEP rep_target
    if miss_streak ≥ MISS_ESCALATE AND isolated AND trend==DOWN → consider replace (§8 tenure+mismatch rule)
    # never cut volume, never infer fatigue

BEAT TARGET (room) or trend UP:                                                 [Progression]
    if room: rep_target += 1 (cap at top of range)
    else: load += STEP ; rep_target = bottom of range
    clear levers_tried

FLAT past stall window, target being met:                                       [Progression]
    # GOVERNING PRINCIPLE — Minimum Effective Intervention, athlete-first:
    #   pull the CHEAPEST lever that still produces adaptation, where cost spans
    #   recovery demand + injury risk + psychological/familiarity disruption.
    #   NOT maximum adaptation. The aim is the best long-term athlete experience
    #   while still driving progress. Escalate only when the cheaper lever is
    #   exhausted (volume cap reached) or ineffective for the athlete's goal.
    if sets < volume_ceiling AND session_sets+1 ≤ SESSION_SET_CAP: sets += 1 ; levers_tried += "vol"   # cheapest lever, but only within the session time cap (§11.8)
    elif "load" not tried: load += STEP ; levers_tried += "load"  # medium: more recovery demand, the injury-exposed lever (rail-capped)
    elif "range" not tried: rep_target = bottom ; levers_tried += "range"  [Experience: variety — disruption cost, not a strength tool]
    else: PATIENT HOLD — hold this week; re-test by re-allowing the load lever
          every 4th flat week (single periodic probe)                          [Experience]
    # Two seams to remember:
    #   (a) "cheapest" means cheapest EFFECTIVE lever — near the volume cap, added sets stop
    #       adding stimulus and become mostly fatigue, so load becomes the cheaper effective move.
    #   (b) goal-sensitivity — the cost ranking is universal, but which levers count as "effective"
    #       shifts: load matters more for pure strength, volume is doubly right for hypertrophy.

DOWN (single pattern, first occurrence): hold, re-test next week (treat as off-day; no withdrawal)
```
`STEP` = fixed increment: upper max(2.5, 2.5%×load); lower max(5, 5%×load); isolation half, min 1kg. No dial.

Volume floor/ceiling (sets/pattern/wk): novice [4,12] · int [6,18] · adv [8,22]; CORE [4, 12/16/20].

---

## 8. Exercise change — simple tenure + observed-mismatch rule [Experience]

No scoring, no thresholds, no benefit/cost arithmetic. Attachment is protected by LOCKED (the athlete's
explicit, stated choice — strictly better than a guessed "favorite" weight), and churn is prevented by a
minimum tenure. The replacement decision is a binary driven only by observed performance of the CURRENT
exercise — never by a prediction that some other exercise is theoretically better (that would reintroduce
unobservable modeling).

```
if locked:                         never replace.
elif tenure_weeks < SWAP_MIN_TENURE (4):   never replace.   # still gathering data + protecting familiarity
else:  # tenure ≥ 4 weeks
    if persistent_mismatch(miss_streak ≥ MISS_ESCALATE, isolated to this exercise, no broad cause):
                                   replace it.               # the current exercise is DEMONSTRABLY not working
    else:                          keep it.
```
The athlete can always manually change or LOCK an exercise; the engine only acts when the current choice
is observably failing.

Selection of the replacement: same pattern, equipment available, prefer same compound class, unused in
the last 8 weeks; the new lift starts CALIBRATING.

Rep-range change (a separate variety lever, §7): [8,12]↔[4,6], [5,8]↔[8,12]; reset target to bottom; recompute load.

---

## 9. Deload (only via §5.5 unambiguous facts: extended absence, injury/rehab)
`load ×0.85 ; sets ×0.50 (floor MEV) ; rep_target mid-range ; next week = fresh baseline.`
Applied globally on extended_absence/injury. **Never** triggered by any performance drop — broad or sustained — because repricing + HOLD already handle declining lifts.

---

## 10. Exercise library (static)
```json
{"id":"barbell_bench_press","pattern":"HORIZONTAL_PUSH","is_compound":true,
 "default_rep_range":[5,8],"equipment":"barbell","fatigue_cost":"high",
 "body_region":"upper","swap_group":"horizontal_press","swap_cost_tier":"HIGH"}
```
Tiers: main barbell lifts + weighted pull-up HIGH; secondary compounds MEDIUM; isolation/cable/machine LOW. `fatigue_cost` is an assembler ordering hint only — never a decision signal.

---

## 11. Safety rails [Safety]
1. **Hard load rail (implied-demand form):** never prescribe a top set whose *implied e1RM* (Epley: load×(1+reps/30)) exceeds best demonstrated e1RM by more than RAIL_HEADROOM (default 3%). This caps the *demand* of the prescription, not the raw working-set load, so heavy low-rep work can still climb past demonstrated e1RM by exactly one small step (verified: 100→101→102→…→105 reachable through normal progression, while a jump to an unproven 115 is forbidden). Earlier wording compared working-set load directly to demonstrated e1RM and created a false ceiling for heavy strength athletes.
2. Single load jump ≤ 10% of current load.
3. ≤ +1 set/pattern/week; ≤ 2 patterns get +1 in a week.
4. No swap within 4 weeks of last swap (except CALIBRATING/absence); only via gate.
5. Volume within [MEV, ceiling] except during an evidence-triggered deload.
6. After >10-day gap, resume at ≤90% pre-gap load.
7. Locked exercises never swapped; never prescribe unavailable equipment.
8. **Per-session time cap:** a single session may not exceed SESSION_SET_CAP working sets
   (default 22 ≈ 60–65 min at 40s execution + ~150s compound / ~75s core rest). The volume lever
   (§7) may add a set ONLY if the resulting session stays ≤ cap; otherwise volume is exhausted for
   that pattern and the engine escalates to the load lever. Consequently the EFFECTIVE weekly volume
   ceiling per pattern is min(MRV landmark, SESSION_SET_CAP × frequency) — reconciling the volume
   landmarks (§8.2) with the one-hour product constraint.

   > **SESSION_SET_CAP is a PROXY for session DURATION, not the requirement itself.** The actual
   > product constraint is ~60–65 minutes of working time. A flat set count assumes every set costs the
   > same time, which is false: a heavy-compound set (~190s with rest) costs ~2.5× an isolation/core set
   > (~115s), so at a fixed 22-set cap an all-compound session runs ~70 min while a compound+isolation
   > mix runs ~55 min. The cap is accurate at the *mixed* blend the assembly actually produces (one heavy
   > compound first, then lighter work) and drifts only at the extremes, which is why the fixed proxy is
   > acceptable for MVP. **If real-world usage shows meaningful drift** (sessions consistently over or
   > under the time target for particular athletes or splits), replace the set-count cap with a true
   > time-budget calculation: sum per-set durations using each exercise's compound/isolation class (and
   > the athlete's real rest times if captured), and cap on minutes directly rather than set count.

---

## 12. Constants
```
TREND_BAND=0.02 ; ADHERENCE_MIN=0.67 ; ABSENCE_DAYS=10
STALL_WINDOW={novice:2,intermediate:4,advanced:6}
MISS_ESCALATE=3
RAIL_HEADROOM=0.03   # rail allows implied e1RM up to +3% beyond best demonstrated (one step)
SESSION_SET_CAP=22   # max working sets/session ≈ 60-65 min (default; derive from real rest times if captured)
# REMOVED this pass: SUSTAINED_DROP_WEEKS (sustained-drop deload deleted — repricing+HOLD handle decline)
# REMOVED this pass: SYSTEMIC_FRAC (multi-pattern deload deleted — it was fatigue inference)
DELOAD_LOAD=0.85 ; DELOAD_SETS=0.50 ; LOAD_STEP_CAP=0.10
PATIENT_PROBE_EVERY=4
SWAP_MIN_TENURE=4   # weeks an unlocked exercise must run before it can be replaced
# REMOVED this pass: SWAP_THRESHOLD, SWAP_TIER, TENURE_PER_8WK, CHURN (swap scoring deleted — replaced by tenure + observed mismatch)
# REMOVED this pass: VARIETY_ADJUST (only fed swap-cost arithmetic, now deleted)
# REMOVED post-freeze: SATISFACTION_LOW, SATISFACTION_GOOD (satisfaction/engagement layer deleted)
# REMOVED: VARIANCE_REPS, DECAY_RATIO, BLOCK_LENGTH, aggression dial, all trajectory/ceiling constants
```

---

## 13. Assembler — gym-flow aware [Experience]
Mapping (4 workouts): A: H-Push,H-Pull,Knee,Core · B: V-Push,V-Pull,Hip,Core · C: H-Push,H-Pull,Hip,Core · D: V-Push,V-Pull,Knee,Core. Sets/session = round(weekly/frequency).
Order: (1) highest-fatigue_cost compound first (fresh); (2) order rest to minimize station/equipment changes; (3) superset non-competing movements; (4) isolation/CORE last; (5) gym_busyness high → prefer available equipment early, avoid scarce stations.

---

## 14. Explainability (every change: {observation, conclusion, action})
```
+load:    "Your {ex} hit {top} reps with room, so I added {step}."
+reps:    "Improving but near your limit — one more rep per set first."
+set:     "Your {ex} held steady, so I added a set for more stimulus."
reprice:  "Last week {ex} came in at {done} instead of {prescribed} — that tells me the right
           weight for now. Set to {new}, sets unchanged so you keep training hard."   (never says 'fatigue', never cuts volume)
range:    "{ex} plateaued with full volume — changing the scheme {old}→{new}, keeping the lift."
hold:     "{ex} is steady right now — holding it and re-testing; I'll probe a bump shortly."
swap:     "{old} has missed the mark for three weeks while your other lifts are fine — swapping to {new}."
deload (injury/rehab):   "Given the {area} issue, I've pulled the weight and volume back so you can train around it safely."
absence:  "Over a week off — eased ~10% and we'll rebuild."
adherence:"You did {done} of {planned} — held everything and trimmed volume to make this week finishable."
```

---

## 15. Main loop
```python
def next_week(ath):
    g=ath.global
    if adherence(ath)<0.67: return hold_reduce_friction(ath)
    if absence(ath): apply_absence(ath)
    # no systemic/multi-pattern deload: broad drops flow into per-pattern repricing below
    for p in ath.patterns:
        m=progress_metric(p, ath.goal); trend=classify(m, ath.training_age)  # stall-gated
        cap=demonstrated(p)                                  # from COMPLETED work
        if p.calibrating: d=calibrate(p,cap)                 # exits → discard seed (§4.4)
        elif cap.missed:
            d=reprice_keep_volume(p,cap)                      # NEVER cut volume / infer fatigue
            if p.miss_streak>=3 and isolated(p) and trend=="DOWN": d=consider_swap(p)
        else: d=reactive_progress(p,trend,cap)               # beat/flat-past-window/patient-hold
        if d.is_swap and not swap_allowed(p): d=in_place_fallback(p,d)   # §8: locked? tenure<4? else observed-mismatch only
        decisions.append(d)
    decisions=apply_rails(decisions,ath)                     # §11 hard load rail (implied-e1RM-demand form) does safety
    return assemble_gym_flow(decisions,ath, explained=True)
# No fatigue_flag, no dial, no trajectory, no maintenance, no calendar deload anywhere.
```

---

## 16. Honest limits (carry into real-world testing)
- The whole capability-first case rests on the premise that benign day-noise dominates true fatigue in real performance data. It is *assumed*, not measured. First real cohorts test it: do repriced lifts recover next week (premise holds) or keep sliding (real fatigue present)?
- The simulator models no cost for program churn, instability, or unsafe-but-unlucky-didn't-injure prescriptions — which is *why* the load rail, stall window, and patient hold are kept on experience/safety grounds rather than simulated outcome. Do not let a future simulation that lacks these costs argue them away.
- `STALL_WINDOW` and `MISS_ESCALATE` are the gatekeepers between "off day" and "act"; they are the first dials to tune against real data.
- Life context (sleep, stress, schedule) is invisible to the engine; with the satisfaction question removed, the engine has no affective proxy at all and reacts purely to completed performance. General-population athletes whose limiter is life, not training, are the segment most likely to be under-served — handled (if at all) by explicit athlete actions, not by the engine inferring mood.

This is the smallest architecture that survived every falsification attempt. Build this.
