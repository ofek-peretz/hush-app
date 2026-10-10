# BB-17 — Equipment → catalog Class-A coverage verification — COMPLETION REPORT

> Completion report for **BB-17** (Beta-Readiness §2.3 / `OPEN_ITEMS_EXECUTION_PLAN.md` §3.4: "verify
> equipment→catalog Class-A coverage across the full range of equipment combinations the cohort will
> declare, before they declare them"). **COMPLETE — and RESOLVED, not escalated.** A pure analysis harness
> over the frozen ES-002 catalog proves, as an auditable matrix + regression test, exactly which equipment
> sets can compose a complete 5/5 Class-A session. **No model/behaviour/schema change.** Tests: **188/188**
> model golden (was **179/179**; **+9** in `test_equipment_coverage`, zero re-gold) **+ API pytest 30** →
> canonical gate **PASS**.
>
> **PRODUCT SCOPE RATIFIED (2026-06-12):** Hush V1 is a **gym-based** product; the target environment is a
> **standard commercial gym** (a barbell is always present). The verified catalog fact — *a barbell alone
> covers all 5 Class-A capabilities* — means **the V1 target environment provides complete Class-A
> coverage**. The finding is therefore **satisfied, not a blocker**. Home-gym / dumbbell-only / machine-only
> / bodyweight-only setups are **explicitly out of V1 scope**; their coverage gaps are catalog validation
> only and open **no** catalog-expansion or equipment-aware-composition work.
>
> Date: 2026-06-12 · Build: … + BB-16 seed gate ✅ + **BB-17 equipment coverage ✅ (resolved)** (Schema
> **v10**, unchanged) · Owner: Backend/Model.

---

## 0. Executive summary

| Item | Class | Status | Evidence |
|---|---|---|---|
| **`sim/equipment_coverage.py`** | Pure catalog analysis (new) | ✅ Done | per-(set × capability) coverage; `coverage_report`, `minimal_singletons_for_full_coverage` |
| **`tests/test_equipment_coverage.py`** | Structural-fact tests (new, +8) | ✅ Done | barbell-covers-5/5, per-capability equipment requirements, constrained-set gaps |
| **As-built truth pinned** | Verification | ✅ Done | v1 composition is **equipment-agnostic** (no equipment input/filter; athlete entity has no equipment field) |
| **Coverage matrix** | Finding | ✅ Done | full coverage requires a **barbell**; no non-barbell set reaches 5/5 |
| **V1 target environment (commercial gym)** | Decision | ✅ **RESOLVED** | barbell present ⇒ **complete 5/5 Class-A coverage**; regression-locked |
| **Non-target setups (home/DB/machine/BW only)** | Scope | ✅ **OUT OF SCOPE** | catalog validation only; no remedy work opened |

**Test result:** `==== model golden runner: 188/188 passed ====` + `API pytest rc=0` → `PASS`.
Per-suite adds `test_equipment_coverage: 9`. Suite total **218** (188 model + 30 API).

---

## 1. What was verified (the coverage matrix)

```
declared equipment set              h_push  h_pull  v_push  knee  hip   5/5
full (barbell+dumbbell+machine)        yes     yes     yes   yes   yes   YES
barbell+dumbbell                       yes     yes     yes   yes   yes   YES
barbell only                           yes     yes     yes   yes   yes   YES
dumbbell+machine (no barbell)          yes     yes     yes   yes   NO    no
dumbbell only                          yes     yes     yes   NO    NO    no
machine only                           NO      NO      NO    yes   NO    no
bodyweight only (no equipment)         NO      NO      NO    NO    NO    no
single equipment types that ALONE cover 5/5: ('barbell',)
```

Structural facts (now regression-locked — a catalog edit is a `catalog_version` event that re-trips them):

- **A barbell alone covers all 5** Class-A capabilities; the canonical (df=1.0) exercise for every
  capability **is** the barbell one, so even the calibration (canonical-only) session is intact on a
  barbell. **No non-barbell set reaches 5/5.**
- **`hip_dominant` is barbell-only** (deadlift, romanian_deadlift) → uncoverable without a barbell.
- **`knee_dominant` needs barbell or machine** (back_squat / leg_press) → no dumbbell option.
- **`horizontal_push` / `horizontal_pull` / `vertical_push` need barbell or dumbbell** → no machine option.
- **bodyweight-only → 0/5** (the frozen Class-A catalog has no bodyweight entries).

---

## 2. The as-built truth this verification pins (important)

v1 **composition is equipment-agnostic**: `compose_session` takes no equipment set, `catalog.for_capability`
applies only the *class* constraint (never an equipment filter), and the athlete entity stores **no
equipment field** (verified: `equipment` appears in the codebase only as a catalog `Exercise.equipment`
attribute and as a REPLACE *reason* token — never as a stored athlete capability set).

So the matrix above is the catalog's **latent capacity** — the coverage an equipment-aware composition
*would* have if a declared set were honored. **Today the model does not honor equipment at all**: it
always composes from the canonical/barbell (or preference) exercises. The operational consequence is
sharper than "degenerate session": an athlete **without** a barbell would be prescribed barbell lifts
they cannot perform, with no signal to the model. This harness makes that gap explicit and auditable.

---

## 3. Resolution — V1 product scope (ratified 2026-06-12)

**Hush V1 is a gym-based strength product; the intended environment is a standard commercial gym with
normal strength-training equipment (a barbell is always present).** V1 does **not** target home-gym,
dumbbell-only, machine-only, or bodyweight-only setups.

The relevant V1 question is therefore narrow: *does a standard commercial gym provide complete Class-A
coverage?* The verified catalog fact answers it: **yes** — a barbell alone covers all 5 Class-A
capabilities (and the canonical/calibration session is barbell, so it is intact). This is now
regression-locked by `test_v1_target_environment_commercial_gym_covers_all_class_a` and surfaced in the
harness (`v1_target_environment_covered()` → `True`; the standalone report prints "V1 TARGET ENVIRONMENT
… : YES").

**Consequences (decided):**
- The coverage gaps for non-target sets (the §1 matrix's "no" rows) are **catalog validation only, not
  product requirements** — by design and out of scope.
- **No catalog-expansion project** and **no equipment-aware-composition work** are opened from this
  finding. v1 composition remaining equipment-agnostic is correct at this scope (the gym supplies the
  full canonical set).
- No enrollment equipment-gate is required for correctness — the target environment already guarantees
  coverage. (Any future expansion to non-gym environments would re-open this, and the harness re-proves
  coverage automatically if the catalog ever changes.)

---

## 4. Acceptance criteria

- [x] `sim/equipment_coverage.py` added — pure per-(set × capability) catalog coverage analysis.
- [x] Coverage verified across the full range of declared sets the cohort will present (§2.3), incl.
      the constrained dumbbell-only / machine-only / bodyweight-only / no-barbell cases.
- [x] Structural facts regression-locked (+9 tests); a catalog edit re-trips them by design.
- [x] As-built equipment-agnostic composition pinned (correct at V1 commercial-gym scope).
- [x] **V1 target environment (commercial gym) verified to provide complete 5/5 Class-A coverage** —
      ratified product assumption documented and regression-locked.
- [x] **No model/behaviour/schema/migration change**; 179/179 → **188/188 + API rc=0 → PASS**.
- [x] Non-target setups confirmed **out of scope**; no remedy / catalog-expansion / composition work opened.

---

## 5. Rollback

Code-only, no data. Remove `sim/equipment_coverage.py` + `tests/test_equipment_coverage.py`, their two
MAP entries, and the suite-list entry. Nothing in the frozen model/catalog/composition depends on the
harness — it only reads the catalog.

---

*Completion report only. A pure analysis over the frozen ES-002 catalog: no composition change, no new
input, no schema/migration change (179/179 → 187/187, zero re-gold). Implements the verification half of
BB-17; the remedy is escalated as a product decision (§3). Trace: Beta-Readiness §2.3;
`OPEN_ITEMS_EXECUTION_PLAN.md` BB-17; catalog `ES-002` / `sprint3b1/catalog.py`.*
