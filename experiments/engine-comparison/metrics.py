"""
Metrics — every number the founder asked for, computed from the common SessionRecord stream
and the athlete's ground truth. The yardstick that makes the two engines comparable is the
athlete's TRUE capacity: the heaviest weight they could do for the goal's bottom reps when
fresh, true_target_weight = load_for_reps(bottom, true_1RM). Everything is measured against
real strength, not against either model's internal beliefs.
"""
from __future__ import annotations
import statistics as st

from hush_model.capability.reference_strength import reference_strength
from hush_model.capability.epley import load_for_reps, rm1_from
from engines import SessionRecord, CAPABILITY, DIFFICULTY

STEP = 2.5                 # barbell step; a "sharp jump" is more than one step in a session
NOCHANGE_RUN = 6           # >= 6 sessions (~2 weeks) with no increase = a "stuck" stretch
PLATEAU_RUN = 6            # first no-increase run of this length = "time to first plateau"


def true_target_weight(true_score: float, bottom_reps: int) -> float:
    """Heaviest weight the athlete can do for `bottom_reps` reps when FRESH (ground truth)."""
    rm1 = reference_strength(CAPABILITY, true_score) * DIFFICULTY
    return load_for_reps(bottom_reps, rm1)


def best_e1rm(rec: SessionRecord) -> float:
    """Demonstrated 1RM-equivalent from the best working set this session (Epley)."""
    return max((rm1_from(rec.weight, r) for r in rec.reps), default=0.0)


def _slope(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    den = sum((x - mx) ** 2 for x in xs)
    return 0.0 if den == 0 else sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den


def compute(records: list[SessionRecord]) -> dict:
    if not records:
        return {}
    bottom = records[0].target_reps
    weights = [r.weight for r in records]
    weeks = [r.week for r in records]
    deltas = [weights[i] - weights[i - 1] for i in range(1, len(weights))]

    # --- ground-truth efficiency: prescribed weight vs true capacity for the target reps ---
    eff = [r.weight / true_target_weight(r.true_score, bottom) for r in records]
    e1rms = [best_e1rm(r) for r in records]
    min_reps = [min(r.reps) for r in records]

    # ── Progression Quality ──
    e1rm_change = e1rms[-1] - e1rms[0]
    weight_change = weights[-1] - weights[0]
    rate_kg_wk = _slope(weeks, weights)
    # time to first plateau: first index starting a run of PLATEAU_RUN with no increase
    first_plateau_week = None
    run = 0
    for i in range(1, len(weights)):
        run = run + 1 if weights[i] <= weights[i - 1] + 1e-9 else 0
        if run >= PLATEAU_RUN:
            first_plateau_week = weeks[i - run + 1]
            break

    # ── Decision Quality ── (classified by observable behavior, identical rule for both engines)
    n = len(records)
    n_inc = sum(1 for d in records if d.decision == "increase")
    n_dec = sum(1 for d in records if d.decision == "decrease")
    n_hold = sum(1 for d in records if d.decision == "hold")
    # an increase is "too aggressive" if the athlete then misses the bottom on any set
    aggressive = 0
    successful_inc = 0
    for i, r in enumerate(records):
        if r.decision == "increase":
            if min_reps[i] < bottom:
                aggressive += 1
            else:
                successful_inc += 1
    training_failures = sum(1 for i in range(n) if min_reps[i] < bottom)

    # ── Stability ──
    sign = lambda x: (x > 1e-9) - (x < -1e-9)
    nonzero = [sign(d) for d in deltas if sign(d) != 0]
    direction_changes = sum(1 for i in range(1, len(nonzero)) if nonzero[i] != nonzero[i - 1])
    volatility = st.pstdev(deltas) if len(deltas) > 1 else 0.0
    # deload streaks (>= 2 consecutive decreases)
    deload_streaks = 0
    max_deload_streak = 0
    cur = 0
    for d in records:
        if d.decision == "decrease":
            cur += 1
            max_deload_streak = max(max_deload_streak, cur)
        else:
            if cur >= 2:
                deload_streaks += 1
            cur = 0
    if cur >= 2:
        deload_streaks += 1
    # overload events: prescribed weight above the athlete's TRUE fresh capacity for the target
    overload_events = sum(1 for r in records if r.weight > true_target_weight(r.true_score, bottom) + 1e-9)

    # ── Athlete Experience ──
    longest_nochange = 0
    cur = 0
    stuck_sessions = 0
    runs = []
    for i in range(1, len(weights)):
        if weights[i] <= weights[i - 1] + 1e-9:
            cur += 1
        else:
            runs.append(cur)
            cur = 0
    runs.append(cur)
    for rlen in runs:
        longest_nochange = max(longest_nochange, rlen)
        if rlen >= NOCHANGE_RUN:
            stuck_sessions += rlen
    sharp_jumps = sum(1 for d in deltas if abs(d) > STEP + 1e-9)
    # non-intuitive decisions:
    #  (a) increase right after a failed (missed-bottom) session
    #  (b) decrease right after a session where the athlete owned the top of the range
    #  (c) NO increase despite >=3 consecutive sessions owning the top
    counterintuitive = 0
    top = bottom + 2
    consec_top = 0
    for i, r in enumerate(records):
        owned_top = all(x >= top for x in r.reps)
        if i > 0:
            prev = records[i - 1]
            if r.decision == "increase" and min(prev.reps) < bottom:
                counterintuitive += 1
            if r.decision == "decrease" and all(x >= top for x in prev.reps):
                counterintuitive += 1
            if r.decision != "increase" and consec_top >= 3:
                counterintuitive += 1
        consec_top = consec_top + 1 if owned_top else 0

    return {
        "sessions": n,
        # progression quality
        "e1rm_start": e1rms[0], "e1rm_end": e1rms[-1], "e1rm_change": e1rm_change,
        "weight_start": weights[0], "weight_end": weights[-1], "weight_change": weight_change,
        "rate_kg_per_week": rate_kg_wk,
        "first_plateau_week": first_plateau_week,
        # how well the prescribed load tracks true strength (1.0 = on target for the goal reps)
        "efficiency_mean": st.mean(eff), "efficiency_end": eff[-1],
        "efficiency_min": min(eff), "efficiency_max": max(eff),
        # decision quality (as % of sessions)
        "pct_increase": 100 * n_inc / n, "pct_decrease": 100 * n_dec / n,
        "pct_hold": 100 * n_hold / n,
        "pct_increase_aggressive": (100 * aggressive / n_inc) if n_inc else 0.0,
        "pct_increase_success": (100 * successful_inc / n_inc) if n_inc else 0.0,
        "pct_training_failure": 100 * training_failures / n,
        # stability
        "direction_changes": direction_changes, "volatility_kg": volatility,
        "deload_streaks": deload_streaks, "max_deload_streak": max_deload_streak,
        "overload_events": overload_events, "pct_overload": 100 * overload_events / n,
        # athlete experience
        "longest_nochange_sessions": longest_nochange,
        "stuck_sessions": stuck_sessions, "pct_stuck": 100 * stuck_sessions / n,
        "sharp_jumps": sharp_jumps,
        "counterintuitive": counterintuitive, "pct_counterintuitive": 100 * counterintuitive / n,
        # raw series for plotting
        "_weeks": weeks, "_weights": weights, "_e1rms": e1rms,
        "_efficiency": eff, "_true_target": [true_target_weight(r.true_score, bottom) for r in records],
        "_min_reps": min_reps,
    }
