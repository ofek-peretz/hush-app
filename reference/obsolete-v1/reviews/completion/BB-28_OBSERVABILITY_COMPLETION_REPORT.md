# BB-28 — Structured Operational Logging + End-to-End Correlation Id (BACKEND HALF) — Completion Report

Date: 2026-06-12
Owner: Backend
Status: **Backend half COMPLETE** (client half remains Mobile; log shipping/retention/alerting remain Operations — BB-27/29/30)
Gate: `python build/_verify/assemble_and_test.py` → **model golden 188/188 + API pytest 55/55 → PASS**

---

## 1. What BB-28 asks for

> *Structured operational logging + end-to-end correlation id + no-sensitive-values-in-logs rule
> (server & client).* — `HUSH_V1_OPEN_ITEMS.md` §2.5, P1, Before Beta.

A real ~100-athlete TestFlight beta cannot be operated blind: when a device's sync fails or an
operator fields a support ticket, there must be a single id that ties the client's failure to the
server's record of that request, and the server must record requests in a queryable, **non-leaking**
form. This tranche delivers the **server (backend) half**: the correlation id, the structured access
log, and the no-sensitive-values guarantee. The client half (device-side logging) is Mobile; log
shipping/retention/alerting are Operations (BB-27/29/30) and need infra not buildable on this host.

This is additive cross-cutting infrastructure beside the frozen model — **no model number, formula,
schema, migration, or golden changed** (golden stays 188/188; schema stays v10).

## 2. As-built

New pure module **`implementation/api/observability.py`** (assembles to `app/observability.py`;
MAP + `API_TEST_FILES` updated in `build/_verify/assemble_and_test.py`). Three obligations:

1. **End-to-end correlation id.** A **pure-ASGI** middleware (`CorrelationMiddleware`) reads an
   inbound `X-Correlation-Id` (validated — §3) or mints a `req_<hex>` one, binds it to a
   `ContextVar` for the request, echoes it in the `X-Correlation-Id` **response header**, and
   exposes it via `current_correlation_id()`. **`errors.py` now sources the envelope's
   `request_id` from that id** when present (falling back to a freshly minted `req_` id outside a
   request — backward-compatible shape). One string now appears in three places: the response
   header, every `error.request_id`, and the access line. Closes the cross-cutting tracing thread
   (`HUSH_V1_OPEN_ITEMS.md` §7).

   *Why pure-ASGI, not `@app.middleware`/`BaseHTTPMiddleware`:* the latter runs the downstream app
   in a separate anyio task, which breaks `ContextVar` propagation into the endpoint and the
   registered exception handlers. The pure-ASGI form sets the var in the **same coroutine** that
   calls the app, so the id reliably reaches handlers *and* the §15 exception handlers. Added via
   `app.add_middleware(...)` last ⇒ outermost user middleware (inside `ServerErrorMiddleware`,
   outside routing and the exception handlers).

2. **Structured operational logging.** One JSON line per request on logger `hush.api`
   (`configure_logging()` installs a `JsonFormatter` on stdout, `propagate=False`, idempotent;
   called from `create_app`). Fixed, **allowlisted** field set: `method`, `route`, `status`,
   `latency_ms`, plus the envelope keys `ts`/`level`/`logger`/`event`/`correlation_id`. The access
   line fires in a `finally`, so failed/erroring requests are logged too. `route` is the **route
   template** (`/sessions/{session_id}/sets`), captured from `scope["route"].path` — not the
   concrete path — which keeps opaque server-issued ids (`session_id`, `block_id`) and the
   operator-supplied `athlete_id` out of the logs and keeps cardinality low for aggregation. A
   `log_event(event, **fields)` helper lets other backend code emit correlation-tagged operational
   events under the same rule.

3. **No-sensitive-values rule — enforced structurally, not by scrubbing.** The access path logs
   *only* the allowlisted structural fields; there is no code path here that reads a request/response
   body, a header, the bearer token, or any health value (weight/reps/bodyweight/age). The
   guarantee is the absence of a leaking path, asserted by a full-lifecycle test (§4).

## 3. Security hygiene — inbound correlation id is a log-injection vector

A client-supplied id that we echo into the log stream is operator-trusted output, so
`sanitize_inbound()` accepts it only if **non-empty, ≤64 chars, printable ASCII with no
whitespace/control/newline**; anything else is dropped and the server mints its own. This blocks
newline log-forging and data-smuggling through the header.

## 4. Tests — `implementation/api/test_api_observability.py` (+12; API 43 → 55)

- `test_correlation_id_minted_and_echoed` — absent inbound ⇒ `req_…` minted and echoed.
- `test_inbound_correlation_id_is_honored` — safe inbound id echoed verbatim.
- `test_unsafe_inbound_correlation_id_is_rejected_and_minted` — **5 params** (space, newline,
  >64, control char, empty) ⇒ server mints its own.
- `test_error_envelope_request_id_is_the_correlation_id` — 401 envelope `request_id` == response
  header == the access line's `correlation_id`.
- `test_inbound_id_flows_into_error_envelope` — a supplied id surfaces as `error.request_id`.
- `test_access_line_is_json_with_allowlisted_fields_only` — line keys == exactly the allowlist;
  `method`/`route`/`status`/`latency_ms` correct.
- `test_access_line_logs_route_template_not_concrete_id` — templated route logged; the concrete
  session id appears nowhere on any line.
- `test_no_token_or_health_values_in_logs_across_a_full_lifecycle` — drives token + bodyweight
  (93.7) + reps (7) + weights through enroll→session→sets, then asserts the token, `93.7`, and the
  keys `bodyweight`/`actual_reps`/`actual_weight`/`authorization`/`bearer`/`token` appear nowhere in
  the logs, and every line carries only the allowlisted keys.

## 5. Scope boundary (what is deliberately NOT here)

- **Client-side logging** (the "& client" of BB-28) — Mobile.
- **Log shipping / retention / structured-log sink / alerting** — Operations (BB-27 monitoring,
  BB-29 runbook, BB-30 deployed env). The server emits 12-factor stdout JSON for the runtime to
  collect; wiring the collector is infra.
- No new endpoint, schema, migration, or model behaviour. Golden 188/188, schema v10, both
  unchanged.

## 6. Files

- **New:** `implementation/api/observability.py`, `implementation/api/test_api_observability.py`.
- **Edited:** `implementation/api/app_main.py` (configure_logging + add middleware),
  `implementation/api/errors.py` (envelope `request_id` ← correlation id),
  `build/_verify/assemble_and_test.py` (MAP + `API_TEST_FILES`).

**Verification:** `python build/_verify/assemble_and_test.py` → `OVERALL: model 188/188 + API
pytest rc=0 -> PASS` (API suite 55).
