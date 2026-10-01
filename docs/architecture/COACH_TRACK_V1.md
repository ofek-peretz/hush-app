# THE COACH TRACK — the coach writes the week, FERROX runs the loads

**DESIGN, 2026-09-17.** Plan page (screens, laws, pricing): https://claude.ai/artifact/5KGtRKXC6sqC45gQZo9Ryp

Founder, 2026-08-11: *"זה הפתח גם למסלול המאמנים שיוצרים תוכנית עבור המתאמן שלהם."*
Founder, 2026-09-17: *"אני רוצה להוסיף מסלול למאמנים שנותנים למתאמנים שלהם להתאמן איתנו."*

---

## 1 · THE FOUR RULINGS (founder, 2026-09-17)

1. **The coach pays.** Free up to `COACH_FREE_SEATS` (2) linked trainees; Coach 10 / 30 / 100 via
   StoreKit. A trainee linked to a coach gets Pro for as long as the link lives.
   *Server half built 2026-09-18 — `POST /coach/plan`, §4 and §6. Laws:
   `aCoachWithASeatFreeIsNeverSoldOne` (the phone) and `theCoachPlanCannotBeSelfGranted` (the
   worker). The App Store Connect products and the `APPLE_IAP_*` secrets remain founder ops.*
2. **The coach works in the app first.** Coach accounts get a fifth tab, `Athletes`. Desktop (Expo
   web) is phase 2.
3. **The coach sees every set from the link date on.** Bodyweight and cardio only when the trainee
   switched them on. Never pre-link history, Health data, GPS.
4. **The trainee may swap a lift for TODAY only**, and the coach sees the swap. Only the coach
   changes the week.

## 2 · THE EIGHT LAWS (each one a jest law)

| # | Law | Test |
|---|---|---|
| 1 | The engine never rewrites a coach's week (`authored: 'coach'` joins `athlete_or_coach` behind `engineMayRebuild`). | `aWeekSheBroughtIsNotOursToRewrite` (extended) |
| 2 | A new version lands on the first day not yet started — never under an active session. | `aCoachUpdateNeverLandsMidSession` |
| 3 | No upload blocks a set. Uploads are a queue drained after save; failures stay queued, silent. | `theCoachUploadIsASink` |
| 4 | The coach sees only link-date-onward, allow-listed fields; the server rebuilds every payload field by field. | `theCoachSeesTheAllowListAndNothingElse` |
| 5 | The trainee swaps for today, never rewrites; the AI review offers no week edits on a coach's week. | `theTraineeSwapsButNeverRewrites` |
| 6 | Unlinking takes nothing: the week stays on the phone as `authored: 'coach'`, the coach loses access at once, server data is purged 30 days after. One coach at a time. | `unlinkingTakesNothing` |
| 7 | No chat. A per-lift `note` of at most 140 characters is the only prose a coach sends. | `theCoachHasANoteNotAChat` |
| 8 | Account deletion cascades (coach → all links ended; trainee → uploads deleted). | `theCoachSeesTheAllowListAndNothingElse` |

## 3 · THE WIRE (exact shapes — server and app validate independently)

All ids below are opaque. **The coach never learns the trainee's `sub`**: a trainee is addressed by
`linkId`.

```ts
/** A week as a coach sends it. The server rebuilds it field by field. */
interface CoachWeekWire {
  v: 1;
  title?: string;                 // ≤ 60 chars
  days: Array<{                   // 1..7 days
    name: string;                 // ≤ 40 chars
    lifts: Array<{                // 1..14 lifts
      ex: string;                 // catalogue exercise id, /^[a-z0-9_]{1,64}$/
      sets: number;               // int 1..10
      band: [number, number];     // ints, 1 ≤ lo ≤ hi ≤ 50
      note?: string;              // ≤ 140 chars — law 7
      pairNext?: boolean;         // superset with the next lift
    }>;
  }>;
}

interface WeekEnvelope {
  version: number;                // 1, 2, 3 … per link
  sentAt: string;                 // ISO
  coachName: string;
  week: CoachWeekWire;
}

/** One saved workout, as the trainee's phone uploads it. */
interface SessionUpload {
  id: string;                     // the local Session.id, ≤ 64 — idempotency key
  at: string;                     // ISO start
  day: string;                    // ≤ 40, the day's name
  weekVersion?: number;           // which coach version it was trained from
  minutes: number;                // int 0..600
  early: boolean;                 // ended early
  sets: Array<{                   // ≤ 120; warm-ups and approach sets excluded
    ex: string;
    load: number | null;          // kg, 0..1000, null = bodyweight
    reps: number;                 // int 0..100
  }>;
  swaps?: Array<{ from: string; to: string }>;   // ≤ 14 — law 5
  skipped?: string[];             // exercise ids, ≤ 14
  pain?: string[];                // body areas, each ≤ 24, ≤ 6
  bodyweightKg?: number;          // DROPPED server-side unless consent.bodyweight
}

interface CardioUpload {          // DROPPED server-side unless consent.cardio
  id: string; at: string; kind: 'run' | 'walk'; metres: number; seconds: number;
}

interface Consent { bodyweight: boolean; cardio: boolean }
```

## 4 · ENDPOINTS (`hush-identity`, bearer session token as today)

| Method · path | Caller | Body → answer |
|---|---|---|
| `GET /coach/me` | anyone signed in | → `{ coach?: {name, seats, used}, plan?: PlanWire \| null, athleteOf?: {linkId, coachName, since, consent} }` |
| `POST /coach/enroll` | anyone | `{name}` → `{coach, plan}` — idempotent; renames |
| `POST /coach/plan` | coach | `{productId, transactionId}` → `{coach, plan}` · 400 `bad_request` · 404 `transaction_not_found` · 409 `plan_mismatch` · 409 `plan_inactive` · 409 `plan_claimed` · 503 `billing_not_configured` · 503 `billing_unavailable` |
| `POST /coach/invite` | coach | → `{code, url, expiresAt}` — single-use, 7 days · 409 `seats_full` · 429 `too_many_invites` |
| `POST /appstore/notifications` | Apple (unauthenticated) | `{signedPayload}` → 204 · 401 `bad_signature` — renewal and loss, see §6 |
| `POST /coach/join` | trainee | `{code, name, sex?, days?, consent}` → `{linkId, coachName, since, week?: WeekEnvelope}` · 404 `bad_code` · 409 `seats_full` · 409 `already_linked` · 409 `self` |
| `GET /coach/roster` | coach | → `{athletes: [{linkId, name, sex?, days?, since, weekVersion?, recent: SessionUpload[] (last 14 days)}]}` |
| `GET /coach/athlete?l=` | coach | → `{linkId, name, sex?, days?, since, consent, bodyweightKg?, week?: WeekEnvelope, sessions: SessionUpload[] (≤200 newest), cardio?: CardioUpload[]}` |
| `PUT /coach/athlete/week?l=` | coach | `{week}` → `{version, sentAt}` |
| `POST /coach/athlete/remove?l=` | coach | → `{ok}` |
| `GET /coach/templates` · `POST /coach/templates` · `POST /coach/templates/delete` | coach | `{name, week}` ≤ 50 templates |
| `GET /me/coach/week?since=N` | trainee | → `{week?: WeekEnvelope}` (absent when not newer) |
| `POST /me/coach/sessions` | trainee | `{sessions: SessionUpload[] ≤ 20, cardio?: CardioUpload[] ≤ 20}` → `{accepted}` — idempotent on id |
| `POST /me/coach/consent` | trainee | `{consent}` → `{ok}` |
| `POST /me/coach/leave` | trainee | → `{ok}` |

```ts
/** What `/coach/me` and `/coach/plan` say about the money. Null = he never bought anything. */
interface PlanWire {
  productId: string;                                     // hush.coach.10|30|100.month
  seats: number;                                         // the ENFORCED number — same as coach.seats
  renewsAt: string | null;                               // ISO; null once nothing is running
  state: 'active' | 'grace' | 'expired' | 'over_limit';  // `over_limit` is derived, never stored
}
```

Deep link: `hush://coach?c=CODE`, universal `https://getferrox.com/c/CODE` (and the identity origin).

## 5 · STORAGE

D1 database `ferrox-coach`, bound as `COACH_DB` on `hush-identity`, beside `HUSH_KV`. Tables:
`coaches`, `coach_links`, `coach_invites`, `coach_weeks`, `coach_sessions`, `coach_cardio`,
`coach_templates` (`migrations/0001_coach.sql`). A daily cron purges rows of links ended more than
30 days ago.

`migrations/0002_coach_plan.sql` (2026-09-18) adds five columns to `coaches` beside `seat_limit` —
`plan_product_id`, `plan_txn` (Apple's `originalTransactionId`, partial-UNIQUE), `plan_state`,
`plan_renews_at`, `plan_event_at` — and nothing else. There is no plan table, no history and no
cleanup: a plan is one row's worth of "why is `seat_limit` that number".

## 6 · WHAT THE SERVER SETTLED (2026-09-17, `server/hush-identity/src/coach.ts`)

Where §3–§4 were silent, the server decided — the app must match these.

- **Bounds are refused, never trimmed.** A string over its cap (name, title, day, note, pain area)
  refuses the payload; length is JS `.length`. Names are 1..40 after trimming. `band`, `sets`,
  `reps`, `minutes`, `seconds`, `weekVersion`, `days` must be JSON integers.
- **Rounding.** `load` → 0.01 kg; `bodyweightKg` accepted in 20..400, → 0.1 kg; `metres` → 1 m
  (0..1 000 000); `seconds` 0..86 400. `pairNext` on a day's last lift is dropped.
- **Errors.** No/unknown session → 401 `unauthorized`. Coach routes for a non-coach → 403
  `not_coach`. Unknown or ended link on a coach route → 404 `not_found`. `/me/coach/week|sessions|consent`
  without a live link → 404 `not_linked` (`/me/coach/leave` is idempotent, always `{ok}`). Bad week
  → 400 `bad_week`; other bad bodies → 400 `bad_request`. 51st template → 409 `templates_full`. More
  than 20 open invites → 429 `too_many_invites`. No `COACH_DB` → 503 `coach_not_configured`; D1
  trouble → 503 `unavailable`. `/coach/me` with neither role → `{}`.
- **Join.** Checks in order: `bad_code` (unknown, expired, used, or its coach deleted) → `self` →
  body → `already_linked` → `seats_full`. A refused join does not burn the invite. Her own retry of a
  code she already used answers the same `linkId`. `consent` absent = both false.
- **Seats are checked at the invite AND at the join** (amended 2026-09-18; until then, at the join
  only). A coach whose roster is full — or who is over his limit — gets 409 `seats_full` from
  `POST /coach/invite`, and an invite he minted while paying cannot be spent once he is over. A code
  handed to a trainee that the server then refuses in front of her is a promise we made and broke.
- **Invite.** `url` is `https://getferrox.com/c/CODE`. Codes are the pair alphabet, 6 chars,
  case-insensitive on join.
- **Uploads.** A session or run that fails its reader, or started before the link's `since`, is
  dropped and the batch still answers 200 (re-sending cannot fix it). `accepted` counts stored plus
  already-present items, sessions and runs together. First copy of an `id` wins. Cardio without
  consent is not read at all.
- **Consent withdrawn erases**: stored `bodyweight_kg` is nulled and stored runs are deleted.
- **Weeks.** `version` is computed in the insert; the newest 20 versions are kept per link.
- **Templates.** `POST /coach/templates {name, week}` upserts by name → `{template: {id, name, week,
  updatedAt}}`; `GET` → `{templates: [...]}` newest first; `POST /coach/templates/delete` takes
  `{id}` or `{name}` → `{ok}`.
- **Account deletion (law 8)** runs before any KV delete; if D1 fails the deletion answers 503. As a
  coach: live links ended, invites + templates deleted, name blanked, the row purged after 30 days.
  As a trainee: sessions + runs deleted, links ended, name blanked.
- **THE COACH PAYS — the plan (2026-09-18, `src/appleBilling.ts` + `POST /coach/plan`).**
  - **Only Apple raises a seat limit.** The body carries `{productId, transactionId}` (the phone's
    `originalTransactionId`) and nothing that counts. The server asks Apple's App Store Server API
    `GET /inApps/v1/subscriptions/{transactionId}` — production first, sandbox on a 404 — with an
    ES256 JWT it signs from the In-App Purchase key, and reads the answer off the **signed**
    transaction: bundle id `com.hushfitness.app`, the product id, the original transaction id, the
    expiry and any revocation. The seat count is `COACH_TIER_SEATS[verified.productId]` (10/30/100).
  - **Verified means a chain to Apple Root CA - G3.** Every JWS — the API's `signedTransactionInfo`
    and every App Store Server Notification — is refused unless each `x5c` certificate is in date,
    each is signed by the next, the last one's public key is Apple's root key **byte for byte**
    (pinned in the source), and the body verifies under the leaf. This is the boundary `index.ts`
    named on 2026-09-01 and it is now cashed: the notification route is entitlement-grade.
  - **Refusals.** `bad_request` (400) an unknown product or a malformed transaction id ·
    `transaction_not_found` (404) Apple knows no such transaction · `plan_mismatch` (409) the body
    named a different tier than Apple signed · `plan_inactive` (409) expired, refunded or revoked ·
    `plan_claimed` (409) that `original_transaction_id` already belongs to another coach (a read,
    and a partial UNIQUE index behind it) · `billing_not_configured` (503) the `APPLE_IAP_*` secrets
    are absent — nothing is logged · `billing_unavailable` (503) Apple could not be reached, which
    is never read as "not valid".
  - **States.** `active` · `grace` (Apple status 4 — the card is being retried and the seats stay) ·
    `expired` · `over_limit`. `over_limit` is **derived at read** from `used > seats` and is never
    stored: a lapsed plan with three athletes and a 100→10 downgrade with thirty are the same
    situation. `plan` is `null` for a coach who never bought anything.
  - **⛔ SEATS MAY DROP BELOW LIVE LINKS, AND NOTHING IS DELETED.** `EXPIRED`, `REFUND`, `REVOKE`,
    `GRACE_PERIOD_EXPIRED` and a `DID_FAIL_TO_RENEW` without the `GRACE_PERIOD` subtype put
    `seat_limit` back to NULL (the free two). `DID_RENEW`, `SUBSCRIBED`, `OFFER_REDEEMED` and
    `DID_CHANGE_RENEWAL_PREF` restore the tier; auto-renew switched off takes nothing until the
    month he paid for ends. The coach keeps every athlete, every week and every upload — he goes
    `over_limit`, cannot invite (409 `seats_full`), and is whole again the moment he renews or drops
    under the limit. Her training week is not the thing his card failed to pay for.
  - **Replays.** Apple re-sends for three days, so every write carries the event's `signedDate` and
    an older event is ignored (`plan_event_at`). A notification for a transaction no coach here has
    claimed creates nothing.
- **Universal links.** The association claims `/c/*` and `/c` — never a bare `/c*`, which would
  also claim `/circle`, `/config` and every `/coach/…` API path on the identity origin. Both origins
  answer `GET /c/CODE` and `GET /c?c=CODE`.
