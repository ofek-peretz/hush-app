# Backend contracts the client needs (exact specs)

The client is wired against the **real** backend (`implementation/api`). These are
the precise contracts the backend must add to complete the connection. Nothing
here is invented client-side; until each exists, the client degrades honestly
(stays silent / falls back to the fixture for that surface).

All endpoints are athlete-scoped (Bearer token, `athlete_id` derived from token).

---

## C1 — Capability Portrait (blocker B2)

**DONE (data):** `GET /capabilities` is implemented in `implementation/api/routers/reads.py`
(read-only over `capability_state`, tested, suite green). Returns the real per-capability
state:
```
GET /capabilities  -> 200
{ "capabilities": [ { "capability": "horizontal_push", "score": <raw latent S>, "confidence": 0–100 }, … 5 … ] }
```
`still_learning` is derived client-side (`confidence < 30`).

**RESOLVED (Decision 2, 2026-06-14).** The Portrait is PURELY RELATIVE to the athlete's
strongest confident capability — not a population/percentile/score/standard. `barFraction`
divides each capability's value by the strongest-confident value, so the raw latent score's
absolute scale is IRRELEVANT and `GET /capabilities` is sufficient as-is. Compare uses
client-stored snapshots (onboarding baseline + unlock), so no backend snapshot-history endpoint
is required for v1. `HttpModelClient.portraitSnapshot` now returns a real snapshot. B2 closed.

---

## C2 — Program / strategy structure (blocker B1)

**DONE (data):** `GET /strategy` is implemented (`reads.py`, read-only over `strategy_state`,
default-on-absence, tested):
```
GET /strategy -> 200
{ "weekly_frequency": int, "weekly_volume": str, "primary_focus": cap|null, "secondary_focus": cap|null }
```
Client uses `weekly_frequency` for the Program screen.

**REMAINING — product decision D-B1 (structural):** the backend composes ONE session at a
time and has NO multi-day calendar / rest-day concept (the athlete trains when they open a
session). The spec's Home "today's day" + Program "day list" assume a multi-day plan. Decision:
either (a) v1 ships a session-at-a-time Home/Program (use `/sessions/today` + `/strategy`,
drop the day-list), or (b) the backend gains a real plan/calendar surface. No invention until
chosen; `generateProgram` currently presents the composed session as a single "Today" day.

---

## C3 — Reason-line delta (precise value for the increase/decrease line)

The reason copy is "Up [Δ] from last week." The client currently derives Δ from
its own local history (the athlete's last logged weight). The authoritative Δ
should come from the model. Add to `GET /recommendations/{id}/why`:

```
"previous_weight": float | null     // the load this is measured against; Δ = recommended_weight − previous_weight
```

(Also: inline the decision on each block to avoid N+1 `/why` calls — add
`decision_type`, `predicted_reps_to_failure`, `prediction_confidence`,
`previous_weight` to `BlockOut`.)

---

## C4 — Forecast → receipt records (blocker B4; unblocks Hold Receipt #9)

The client's forecast→receipt asymmetry (loud when right, silent when wrong) has
no backend counterpart. The model knows the prediction and learns the outcome;
expose it as evaluable forecast records:

```
GET /forecasts?state=pending  -> 200
{ "forecasts": [ {
    "id": string,
    "type": "increase" | "hold" | "portrait",
    "capability": "<capability>",
    "predicted_value": float,          // weight (hold/increase) or score target (portrait)
    "predicted_reps": int | null,
    "due": "<ISO8601 | session_id>",   // hold/portrait horizon — REQUIRED for the dated hold forecast
    "state": "pending" | "hit" | "miss" | "void"
} ] }
```

UPDATE (2026-06-15, #9 closed client-side): the **hold receipt loop is now complete
on the client**. Holds are HORIZONLESS (ratified 2026-06-14 — "You'll pass it.", no
date), so the earlier "dated hold forecast / weeks-to-breakthrough" requirement is
**obsolete**: the held weight + target reps from `/recommendations/{id}/why` are
sufficient. The client now stakes a durable PENDING hold forecast when one is
delivered (fixture AND the real `/why` path via `decisionMap.holdForecast` at
actionable confidence) and resolves it on a LATER session when the athlete EXCEEDS
the held weight — HIT surfaces the receipt, a non-pass stays silently PENDING (the
asymmetry). No backend forecast surface is required for the hold loop in v1.

`GET /forecasts` (above) remains useful for SERVER-SIDE forecast bookkeeping and
cross-device resolution, but is **no longer a blocker** for the hold receipt.

UPDATE (2026-06-15, C4 IMPLEMENTED server-side): `GET /forecasts[?state=pending|hit|miss|void]`
is now live in `app/routers/reads.py` as a **derived, reconstructable** view — each forecast is
computed from the persisted recommendation (decision + prediction) and resolved against the
persisted observation (outcome). No new table, no new product semantics: it mirrors the ratified
asymmetry and the client `decisionMap` rules. It returns `predicted_value`/`predicted_reps`/
`predicted_reps_to_failure`/`issued_week`/`state` per forecast (the `due` field is dropped — holds
are horizonless). This proves the reconstruction guarantee: no forecast is ever lost; it is
derivable from the audit chain alone. The **client does NOT consume it in v1** (the client's local
resolution remains authoritative for the receipts the athlete sees in-session); the endpoint serves
audit / research / future cross-device reconciliation. NOTE: `type: "portrait"` is intentionally not
derived server-side — the Portrait forecast is a client-only commitment with no backend recommendation.

---

## C5 — Program-change surface (blocker B4)

The Program change card (applied load-change + Undo; frame-change + veto) has no
backend surface. Decisions live per-block today.

```
GET  /program/changes -> 200  { "changes": [ {
   "id": string, "kind": "load" | "frame",
   "target": "<capability/load noun>",   // e.g. "chest load"
   "undoable": bool, "vetoable": bool } ] }
POST /program/changes/{id}/undo   -> 200   // load: revert forward only (never rewrite logged history)
POST /program/changes/{id}/veto   -> 200   // frame: revert the frame
```

UPDATE (2026-06-15, C5 client write-path wired): the client now CONSUMES the write
path. `ModelClient.undoChange({id})` → `POST /program/changes/{id}/undo` and
`vetoChange({id})` → `POST /program/changes/{id}/veto` (HttpModelClient); the
fixture no-ops. The Program screen calls them on Undo / "Keep as is", optimistic +
best-effort (a failure is telemetered, never blocks the UI). Frame "Got it" is a
client-only acknowledgement (the change stays — nothing to persist). The remaining
gap is purely backend: `GET /program/changes` + the two POST endpoints above, and
the `programChanges` read (currently returns `[]` on the HTTP client, B4). Receipt
linkage for a frame-outcome forecast still depends on the `GET /forecasts` surface
(C4) and is backend-blocked.

RESOLVED (2026-06-15, founder decision): a program change may be **acknowledged,
vetoed, or ignored**; **all responses are stored as DATA** for learning + trust
measurement and **must never directly alter model state or future recommendations**
(the purpose is trust measurement, NOT user-controlled progression). This removes the
earlier "override-pin" question — there is none. Implementation:
 - The revert-style `undoChange`/`vetoChange` model methods + the POST
   `/program/changes/{id}/{undo,veto}` contract are **withdrawn** (they implied model
   mutation, now explicitly disallowed). Removed from `ModelClient`/fixture/HTTP.
 - Responses are recorded as research events on the EXISTING durable, append-only,
   non-model pipeline: client `track('program_change_response', { changeId, kind,
   target, action })` → `POST /telemetry` → `athlete_event`. `action ∈
   {acknowledged | vetoed | ignored}`. The Program screen records acknowledged
   ("Got it") / vetoed ("Keep as is" or load "Undo") on action, and **ignored** for
   any change shown but left un-acted-upon when the athlete leaves the screen. The
   card removal is purely cosmetic — it changes no program.
 - Locked by `test_program_change_responses_are_data_only_never_model_state`
   (model tables byte-identical across the response; all three actions persist).
Still backend-pending (separate, NOT this decision): `GET /program/changes` to SURFACE
changes on the HTTP path (returns `[]` today, B4) — derivable, but tied to the
session-at-a-time-vs-multi-day-plan product question. The RESPONSE path (this decision)
is fully closed in code.

---

## C6 — Enrollment / token (blocker B3, OD-3)

Tokens are minted out-of-band by the operator (`auth.py`: no public
registration). The client onboarding needs a consent-enrollment endpoint that
creates the athlete and returns a bearer token to the device:

```
POST /enroll  (no auth) -> 201
  body: { sex, age, experience, bodyweight_kg, consent: {version, accepted_at} }
  -> { "athlete_id": string, "token": "<bearer>" }
```

Client stores the token (`config.setToken`) then `resetModelSelection()` so the
HTTP model activates. If enrollment stays operator-only, define how the operator
delivers the token to the device (deep link / paste) and the client intake screen.
