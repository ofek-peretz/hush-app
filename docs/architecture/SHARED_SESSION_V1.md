# THE SHARED SESSION — two athletes, one bar, one clock

**AS BUILT, 2026-08-31.** Design ratified and shipped in one session; every claim below is held by a
test named beside it.

> **11.2 · SHARED SESSION · YOUR TURN**
> *"Same bar, alternating sets. The screen shows whose turn it is and holds each person's own
> weight — never side-by-side to rank, but stacked to hand off."*
> — `_v7_handoff/HUSH_V7_ALL_DARK.html`, written long before there was a wire to carry it.

Founder, 2026-08-31: *"אם נניח ואני רוצה ללכת להתאמן עם אחי ושנעשה את אותו האימון בסנכרון מושלם."*

---

## 0 · WHAT IT IS, IN ONE PARAGRAPH

Two people open a room with a six-letter code. One of them starts her workout as she does every
other day; the other adopts its **shape** — the same lifts, the same order, the same set counts —
and his own engine prices every load from his own body. From then on the stage carries one extra
row: whose turn it is, where the other one is, and what goes on the bar next. They alternate. The
pair ends when the workout does.

---

## 1 · THE FOUR RULINGS (founder, 2026-08-31)

1. **A mid-session SWAP is proposed. The pair survives either answer.**
2. **The guest's session counts in full** — his engine folds every set, his week ticks.
3. **Two people.** Not three, not six.
4. **A Durable Object on `hush-identity`.**

---

## 2 · THE LAW: WHAT CROSSES THE WIRE

| Crosses | Never crosses |
|---|---|
| The lift list and its order, with set counts | History, records, tonnage, one-rep maxes |
| Each athlete's **count of sets finished**, per lift | Rep bands, engine decisions, reasons |
| Presence — `lifting` / `resting` / `paused` / `done` | Bodyweight, sex, the body map, the profile |
| A first name (already `domain/circle`'s allow-list) | Anything not named in `SHARED_PROGRESS_KEYS` |
| **The number going on the bar next — see §2.1** | Any other weight, ever |

Enforced twice, in two implementations a law compares: `payloadIsWithinAllowList` refuses to *send*
a frame carrying an unlisted key, and the Durable Object rebuilds every field by hand on arrival.
A tampered client cannot relay a fact this file did not name.

### 2.1 ⚠️ The one weight that crosses, and why

`domain/circle` and `domain/planShare` both keep a hard law: **no load leaves the phone.** `bar`
breaks it on purpose, and the argument is narrow:

Those laws are about **stored, published facts about an athlete's training** — a feed, a card, a
week. This is not that. Two brothers are at one bench and the most useful sentence either of them
says out loud is *"strip it to thirty."* The number on the bar is not a fact about her; it is a fact
about **the equipment they are both touching.** So:

- it is the **current lift's next set** and nothing else — no history, no best, no total;
- it is **never stored**: not in KV, not in the Durable Object, not in either phone's record. It is
  relayed between two open sockets and dropped. The room has no `state.storage` call in it, and a
  law reads the file to say so;
- it **names the lift it is for** (`SharedBar.exerciseId`), and the reading screen refuses to print
  it beside a different one — a confident, plausible, wrong weight is the defect class this codebase
  hunts hardest;
- it is **optional at the type level**, because one tap turns it off. With it off the hand-off still
  reads: the row keeps the name, the state and the set count, and the plates are his business.

---

## 3 · THE DECISION THE WHOLE THING RESTS ON: STATE, NOT DELTAS

A phone never sends *"I finished a set."* It sends **how many sets it has finished, of every lift**,
every time anything changes and every 20 seconds besides. `SharedProgress.done` is a whole vector.

That one choice deletes the family of bugs this feature would otherwise be made of:

| Failure | Cost |
|---|---|
| A frame is **lost** on gym wifi | Nothing — the next one carries the truth |
| A frame is **duplicated** | Nothing — applying it twice is applying it once |
| A frame arrives **out of order** | Nothing — the older is dropped |
| A phone was **asleep four minutes** | Nothing — it sends where it is |
| The socket **died and redialled** | The entire reconnect protocol is "re-send my last frame" |

There is no reconciliation algorithm because there is nothing to reconcile. Whose turn it is, which
station the pair is at, how far each of them is through it — **all derived, on both phones, from the
same two vectors** (`sharedStanding`). Nothing negotiates, so *"we both think it's our turn"* is not
a bug that can be written.

The keep-alive is also the liveness signal: a frame's `at` is what tells the other screen the
partner has gone quiet. One mechanism, two jobs.

---

## 4 · THE TWO RULES THAT MAKE IT FEEL RIGHT

### 4.1 The turn is derived, not assigned

```
turnAtLift(hostDone, guestDone, sets):
  neither has sets left → nobody
  one has finished      → the other keeps the bar
  otherwise             → hostDone <= guestDone ? host : guest
```

Host, guest, host, guest — falling out of a comparison rather than a negotiation. Both phones hold
the same two numbers, so they cannot answer differently.

### 4.2 ⛔ A partner can only LENGTHEN a rest, never shorten one

- He racks it after 40 s → **she still rests the 90 s the engine prescribed.** A free bar is not a
  reason to be recovered, and the engine keeps its authority over recovery exactly as it has it
  alone.
- He is still under the bar when her 90 s is up → **she waits**, and the rest readout says *the bar
  is taken* rather than READY over an occupied bench.

`sharedRestEndsAt` answers `null` for the second case — no instant, so no countdown to a moment the
app invented.

---

## 5 · THE ARCHITECTURE, AS BUILT

| Layer | File | What it owns |
|---|---|---|
| Rules | `src/domain/sharedSession.ts` | The allow-list, the turn, the rest, the vectors, the readers. Pure, zero imports. |
| Wire (client) | `src/platform/sharedClient.ts` | The socket, the backoff, the fence on the way out. Never on the path between an athlete and her set. |
| Wire (server) | `server/hush-identity/src/index.ts` → `HushPairRoom` | One Durable Object per pair. Validates a frame and hands it to the other socket. Nothing else. |
| Join | `src/state/stores/pairStore.tsx` | Reads the live session, publishes a count, derives the standing. A spectator, never an authority. |
| Stage | `src/components/PairStrip.tsx` | §11.2's row. |
| Lobby | `src/components/TrainTogetherSheet.tsx` | The code, the join, the privacy tap. |
| Swap | `src/components/PairSwapSheet.tsx` | His proposal, and the two answers to it. |

### 5.1 Authority

- The **host** owns the plan's structure. Only the host may publish one; `v` rises on every change.
- **Each phone** owns its own loads, logs, record and engine fold.
- **Nothing arriving on the wire may log a set, move a cursor, change a load, or end a workout.**
  The wrist's protocol settled this for this codebase — *"Watch → Phone: INTENTS, never state"* — and
  a partner is further away than a wrist, not closer.
- The one thing a partner can cause needs her finger: a swap she is asked about and accepts.

### 5.2 The room

- Entered with a **single-use ticket** (60 s), minted by an authenticated POST. The 90-day session
  token never appears in a URL.
- The **role is decided server-side** from the ticket. A phone cannot name itself host — and since
  the host takes every tie in §4.1, one that could would be one that takes the bar whenever it liked.
- A **reconnect replaces** the same athlete's socket rather than counting as a third person.
- No hibernation, deliberately: everything the room knows lives in two fields, so there is no
  serialisation and therefore no storage. A pair is one live workout; the duration cost is a
  rounding error and the guarantee reads in one glance.
- `pair:<code>` in KV holds a code and who opened it, for **4 hours**. No lift, no set, no load.

### 5.3 ⛔ Circle membership is NOT required

The first draft of this document said a pair could only form between two circle members. That was
wrong on friction: joining a circle is a standing commitment, and *"let's train together now"* is
not. A pair needs a signed-in athlete and a six-letter code that expires with the workout.

---

## 6 · THE GUEST

He adopts a **shape**, never a prescription — `domain/planShare`'s standing law at a shorter
distance: *"the receiver's own engine seeds every load from their own body."*

`fixtureModel.sessionTargets` ignores the day id and answers for the whole catalogue, which is what
makes this need no new pricing path: his **learned load** where he has trained the lift, his
**cold start** (`domain/startingLoad` — sex × bodyweight, nothing else) where he never has. Loop 1
runs on his phone exactly as always.

His session goes through `sessionStore.start`, which is the **doorway rather than a door**: the
paywall gate and the one-session guard are inside it and cannot be routed around. `Session.partners`
is stamped at start — the field whose own header predicted this: *"the record's shape is the
contract, not the mechanism."*

**The week's tick:** the session takes the id of *his own* queued workout when he has one today, and
a synthetic id when he does not. Either way the engine folds every set and the workout counts. When
his week has nothing queued it marks nothing — inventing a mapping between two different programmes
to tick a box would be a lie about which workout he did.

---

## 7 · EVERY WAY IT COMES APART

| # | What happens | The answer |
|---|---|---|
| 1 | One goes to the bathroom | Pause is local. The partner sees `paused`. Nobody is dragged. |
| 2 | One wants a different lift | Proposed (ruling 1), answered, and a question nobody reads is a decline after 25 s. |
| 3 | One finishes early | The pair dissolves in silence; the other trains on. `partners` is already stamped. |
| 4 | Different set counts | The shared plan is the only index either side counts against. |
| 5 | An app is killed | `sessionRecovery` salvages as it always did. The pair is gone; the workout is not. |
| 6 | **No signal** | Backoff redial; both phones run full local sessions; the strip says the link is down and the workout carries on. |
| 7 | Duplicate / stale delivery | `acceptsFrame` + `SHARED_INTENT_TTL_MS` (the wrist's own 15 s, for the wrist's own reason). |
| 8 | Clocks disagree | Every frame is ordered by its **sender's** clock; nothing subtracts one phone's time from another's. |
| 9 | A wrist is live too | wrist → its own phone → the pair. The wrist never talks to the pair, and v1 shows it no partner. No protocol bump. |
| 10 | **Any other drift** | See below. |

### 7.1 ⛔ One rule covers every drift, including the ones nobody thought of

**The pair may only speak about the lift she is actually standing at** (`atSameStation` — her current
lift, or the one a rest is leading into). The moment the two workouts diverge — a lift moved later
because the rack was busy, a warm-up bridge, one of them a station ahead, a swap half-applied — the
strip stops talking about turns and says only where her partner is.

That is why there is no list of drift cases in the code. There is one predicate.

### 7.2 ⛔ The log button is never disabled

It was tempting to lock it while the bar is his — it would make the turn feel authoritative. It
would also put the app between an athlete and a set she has just performed, which this screen may
never do. Two people at one bench are not in lockstep. **The pair changes the wording, never the
permission**, and an out-of-turn log simply moves the turn — which is what a state-carrying wire
makes safe.

---

## 8 · FOUR DEFECTS FOUND IN SELF-REVIEW, AND CLOSED

Recorded because each is a shape worth recognising again:

1. **A partner one plan-version behind was ignored for ever.** `acceptsFrame` ordered by plan
   version first, so a phone that had not yet received a swap had *every* frame dropped — and the
   only thing that could un-freeze him was a frame being refused. Now ordered by the sender's own
   clock, with `behindOnPlan` surfaced one layer up where the judgement belongs.
2. **A socket write inside a React state updater.** Harmless in practice (the room refuses a
   non-advancing plan) — but "harmless because the far end catches it" is not where a rule belongs.
   Moved to its own effect.
3. **The strip fell silent on transition rests** — the one rest where *who is up, and at what
   weight* is the entire content of the screen. `atSameStation` now reads current **or next**.
4. **The advertised bar could name the wrong lift.** A number computed from her own next set,
   printed under the pair's station heading, is wrong exactly when they are not at the same station.
   The bar now carries its `exerciseId` and the reader refuses to place it otherwise.

---

## 9 · WHAT HOLDS IT UP

| Test | What it proves |
|---|---|
| `__tests__/domain/sharedSession.test.ts` | The arithmetic — turn alternation, the rest asymmetry swept over 900 pairs, vectors under lost / duplicated / reordered frames, the fence, the readers. |
| `__tests__/laws/theBarIsSharedAndNothingElseIs.test.ts` | The six cross-file promises, including the app's and the worker's allow-lists agreeing key for key, and the room having no storage call in it. |
| `__tests__/render/theSharedStageHandsOffTheBar.test.tsx` | The real `SessionFlow`, with a partner in context, in ten states — including *training alone draws none of it*. |
| Gallery §11.2 → 11.2i | Nine reviewable states, mounted with fixtures. |

Whole suite at the time of writing: **382 suites, 3802 tests, green**, plus `tsc`, `lint:copy`,
`lint:rtl`, `lint:hooks`.

---

## 10 · THE SECOND ROUND — eight questions, eight pieces of work (2026-08-31)

The founder asked eight questions about the built feature. Two of them turned out to be defects
rather than questions, and the rest turned into the work below. Every one of them started as
something the code could not answer, which is the most reliable signal there is that it was wrong.

| # | What changed |
|---|---|
| 1 | **The lead is named.** Whoever opens the room leads — always true, never stated. The lobby now says *"the workout runs on your lifts"* and offers to swap it, and the room refuses the swap once a plan exists (the turn's tie-break hangs off the role). |
| 2 | **The invite is a link.** `hush://pair?c=CODE` through the system share sheet, carrying the code beside it — because a custom scheme does nothing for somebody without the app. Root answers it, joins silently, and Home makes the room visible. |
| 3 | **No account is a front door.** It used to answer `not_found` — "that code opened no room" — about a perfectly good code. `'signed_out'` is its own answer now, and the sheet replaces both doors with Sign in with Apple. |
| 4 | **The community is a SUM.** "11 workouts between you this week", plus who she trained with. No ranking, no tonnage — see §10.1. It needed no new field on the wire. |
| 5 | **The row says how much longer.** *"Dana · on the bar · last set"* — the hand-off moment the founder named, answered with the one fact the count already held. |
| 6 | **The privacy choice is remembered** (`OwnedPreferences.pairLoadsPrivate`). A privacy decision that resets is not a decision. |
| 7 | **§11.2 has a door in Together too** — and no `onBegin` there, because a workout still starts from Today through the ordinary Begin. |
| 8 | **One shared hour reads as one kind of thing** in both histories. |

**And two outright defects, fixed:**
- ⛔ **The host's record did not say who she trained with.** `partners` was stamped only on the guest, so the poster and the story card named a partner on one phone and nobody on the other, for the same hour.
- ⛔ **A guest with a spent trial pressed Begin and got silence.** Now the paywall, from the same `source: 'gate'` as every other door.

### 10.1 ⛔ Why the league is a sum and not a leaderboard

The founder asked for *"ליגה מקומית בין חברים של כמה משקל הורם"*. Two arguments decided the shape,
and the second is the stronger one:

1. §11.2's own design law is *"never side-by-side to rank"*, and the competitive finding this whole
   surface came from reads *"belonging works; feeds do not belong here."*
2. **Tonnage is a measure that fights the engine.** It rewards bodyweight, big lifts, and loading
   more than you can carry — while Loop 1 exists to take weight *off* the bar when the reps do not
   arrive. A leaderboard would pay an athlete to disobey the coach, on the one screen built to make
   her feel part of something.

So everybody is on one side of the number. It also cost nothing to carry — `done` already crosses
the wire — which is the tell that it was the right fact to pick.

### 10.2 What the eye-pass caught that no test could

The screens were walked on the web build, in Hebrew. Four defects were visible only there:

- a full stop inside a cream primary button (*"Now start your workout."*);
- `leadGive` reading *"שירוץ על של Dana"* — two prepositions in a row;
- `hostBeginSub` restating the new lead line directly under the button that changes it;
- ⛔ and the sharpest: **two sentences counting the same thing with different numbers**, four lines
  apart on Together (`3 אימונים משותפים` and `6 אימונים עם…`). Both readers now come off one call to
  `togetherCount`; the count is said once and the names sit under it with no second number.

---

## 11 · SHIPPED — the worker is live (2026-08-31)

```
hush-identity  ·  https://hush-identity.hush-app.workers.dev
Version ID     ·  843e2588-11be-4d41-99e7-1e73daf030d6
Bindings       ·  PAIR_ROOM (HushPairRoom, Durable Object) · HUSH_KV · ID_LIMIT
```

**Verified live, after the deploy:** `/circle`, `/auth/apple` and every circle endpoint behave
exactly as before (the diff was purely additive — all four circle handlers are byte-identical);
`/pair/open`, `/pair/join` and `/pair/room` answer 401 without credentials; a bad ticket is
refused by name.

**⛔ `new_sqlite_classes`, not `new_classes`.** The first deploy was rejected outright — *"in order
to use Durable Objects with a free plan, you must create a namespace using a `new_sqlite_classes`
migration"* (Cloudflare API code 10097). It names the storage backend, which this room never
touches, so it costs nothing; but a `new_classes` in `wrangler.toml` is a deploy that fails, and a
law now holds it still.

### 11.1 ⛔ The room, driven — the layer that had never executed

Every other claim about the pair was held by a unit test or by reading a file. The room only runs
when **two WebSockets are open at once**, and until it was deployed it had never run, on any
machine, once. `server/hush-identity/driveRoom.mjs` drives it against the real `workerd`:

| | |
|---|---|
| the role is server-decided, for both sides | ✓ |
| **both** sides learn somebody arrived — the joiner too | ✓ |
| the host publishes the structure, the guest receives it | ✓ |
| **a guest cannot publish a plan** | ✓ |
| a whole progress vector is relayed, with the bar naming its lift | ✓ |
| **the server strips what the allow-list does not name** (`actualWeight`, `bodyweight`, `email` — gone) | ✓ |
| a presence that is not one of the four words is refused whole | ✓ |
| a plan version that did not advance cannot un-swap a lift | ✓ |
| the lead moves before a plan exists, and is final after | ✓ |
| the old host cannot publish; the new one can | ✓ |
| a swap proposal and its answer both cross | ✓ |
| **a third phone is told `pair_full`, not silently dropped** | ✓ |
| **a spent ticket opens nothing the second time** | ✓ |
| the survivor is told the other one left | ✓ |

### 11.2 The invite now reaches a phone with no app on it

A `hush://` scheme link is grey text to somebody who has not installed the app — which is the one
recipient who most needs it to do something. Three pieces, and it needs all three:

1. `GET /.well-known/apple-app-site-association` — public, `application/json`, `T6ZRTBRT2U.com.hushfitness.app`, scoped to `/pair*` and nothing else on this origin;
2. `associatedDomains: ["applinks:hush-identity.hush-app.workers.dev"]` in `app.json` — **ships in the binary, so the association only holds from the next build onward**;
3. `GET /pair?c=CODE` — a landing page for the browser that opens it anyway: the code, large; "open in the app"; and the App Store.

The code echoed into that page is **filtered to the invite alphabet**, not escaped — there is one
shape a pair code can have, and nothing that survives the filter can close a tag.

---

## 12 · THE FAILURE MATRIX, WALKED — two real clients, one real room

Founder, on the phrase "still owed": *"מה זה אומר שורות מטריצת הכשל הזה. למה אתה לא יכול לטפל
בזה"* — a fair challenge, and the honest answer was that **the boundary had been drawn too
generously.** Most of §7 needs no gym at all. It needs two copies of the shipping client talking
through a real room, which is `server/hush-identity/drivePair.mjs`.

⛔ It transpiles `src/platform/sharedClient.ts` and drives THAT (`buildClientForDriving.mjs`) —
a second implementation of the protocol would only prove that the second implementation works. Two
imports are stubbed and only two, both native seams with nothing to do with the protocol.

**⛔ Every row is checked against one property:** after the scenario, both sides derive
`sharedStanding` independently and must agree about whose turn it is and which station they are at.
A row that ends with the two screens disagreeing has broken the promise the design rests on,
however reasonable the intermediate steps looked.

| §7 row | Driven | Result |
|---|---|---|
| 1 · one of them pauses | he publishes `paused` mid-station | she sees it; **her own turn is untouched** |
| 2 · a swap | proposed across the wire, declined | both told, nothing changed |
| 3 · he finishes and leaves | socket closed, then ten minutes of silence | she is told he left; silence becomes *carry on alone*, not a frozen screen |
| 4 · set counts | eight sets alternating over one station | four each, **nobody did five**, and the pair advanced together |
| 6 · **no signal** | his socket ripped out mid-workout, then a reconnect on a fresh ticket | **her workout is unaffected**; he re-sends where he is and both are correct again, with nothing replayed |
| 7 · a stale frame | a minute-old frame delivered late | **his count cannot walk backwards** |
| 8 · clock skew | his clock ten minutes fast | still delivered, still ordered, both screens still agree |
| 10 · drift | she finishes a station he has not | **both name the same one station**, and it is his turn |

`driveRoom.mjs` covers the room's own half — the allow-list strip, the third-phone refusal, the
single-use ticket, the lead handover. Between the two: **39 assertions against the real runtime** — 23 across two clients, 16 inside the room.

### 12.1 What genuinely still needs two phones

Two rows and one question, and no amount of this reaches them:

- **Row 5 · the app is killed.** `sessionRecovery` owns the salvage and has its own tests; what is
  not driven is the whole thing happening on a phone iOS decided to reclaim.
- **Row 9 · a wrist is live too.** Needs a watch.
- **iOS suspending a socket without ever firing a close event** — the failure mode a desktop
  runtime does not have. `poke()` on foreground exists for exactly this and is the one mechanism
  here that has never met the thing it was written for.
- **A gym access point dropping packets rather than connections**, and 400 phones on one radio.
- **Whether any of it is legible at arm's length, on glass, under gym lights.**

---

## 13 · SHIPPED — build 64 (2026-08-31)

```
iOS production · buildNumber 65 · com.hushfitness.app          ← the one to install
https://expo.dev/accounts/ofekperetz1/projects/hush/builds/dd584fd3-c886-436b-a593-3427f4a53a54

iOS production · buildNumber 64 — SUPERSEDED, do not install
https://expo.dev/accounts/ofekperetz1/projects/hush/builds/2741f0ea-e7e7-4b8f-8919-8ea7b0d342f2
```

⚠️ **64 PREDATES §14.1** — it carries the Begin that could not begin. It was built before the app
was walked, which is the wrong order and is why 65 exists.

Neither has been submitted anywhere. A build is an artefact; distribution is a separate decision.

`EXPO_PUBLIC_CIRCLE_URL` is set in the EAS **production** environment to the worker deployed above,
so this build carries the pair: `pairAvailable()` is true, the "train together" door draws on Today
and in Together, and the room is reachable.

### 13.1 ⛔ The one thing that did not ship, and why

Two builds failed before this one, both with the same error:

```
Provisioning profile "…AppStore…" doesn't support the Associated Domains capability.
Provisioning profile "…AppStore…" doesn't include the com.apple.developer.associated-domains entitlement.
```

`associatedDomains` in `app.json` requires the **Associated Domains capability on the App ID**, and
EAS cannot add it without Apple Developer credentials — a portal action, not a code change. It was
removed so the pair could ship, and a law now asserts its absence rather than its presence, so the
next person to add it back without the capability fails a test instead of a build.

**⚠️ THE LINK IS STILL `https`, AND THAT IS THE BETTER TRADE.** Without the entitlement it opens the
worker's landing page, which offers "open in the app" (a `hush://` button `Root` answers) and an App
Store button. Somebody WITH the app pays one extra tap; somebody WITHOUT it can now install —
which the scheme link it replaced could never offer at all. **The day the capability is enabled the
same link starts opening the app directly, with no code change.**

To enable it: Apple Developer → Identifiers → `com.hushfitness.app` → Associated Domains → on, then
`npx eas build` (EAS regenerates the profile), and put `associatedDomains` back in `app.json`.

---

## 14 · THE APP, WALKED — no crashes (2026-08-31)

The gallery proves a screen RENDERS with fixtures. It does not prove the real containers wire up:
Home with a live `PairProvider`, Together's container, `Root`'s link effect, the sheet mounted from
two different screens. So the app itself was run and walked.

| Walked | Result |
|---|---|
| cold boot with `PairProvider` mounted | clean — zero console errors |
| Today, real containers | renders; the "train together" door draws |
| the sheet, opened from Home | opens, and correctly shows the **sign-in door** (no identity session in that browser) |
| the sheet, closed | closes clean |
| Together, real container | renders with §11.2's door in it |
| the sheet, opened from Together | mounts from the second call site too |

Console across the whole walk: **no `TypeError`, no `ReferenceError`, no hook errors, no React
error boundaries.** (The web build's standing noise — `direction` style props, `useNativeDriver`,
require cycles — is pre-existing and web-only.)

### 14.1 ⛔ And the walk found one, which is why it was worth doing

**A Begin that could not begin.** Home handed the sheet its own `onStart` unconditionally — and
`onStart` returns early with no queued workout and on a resting week. So in those states the host's
Begin was a cream primary button that did nothing at all: the gated-guest defect from §10, one
screen over, invisible to every test.

Fixed three ways, and the third is the one worth remembering:

1. `onBegin` is passed only when a start would happen;
2. a host with nowhere to begin is told where the beginning is, instead of being left in silence;
3. ⛔ **the door itself still draws.** A guest needs no workout of his own — he adopts his partner's
   and his own engine prices it — so the row hides only for a real conflict (an interrupted
   workout), never for an empty week. Hiding it there would have closed the guest path to anybody
   whose own week happened to be done.

---

## 15 · TO SHIP A CHANGE TO IT



```
cd server/hush-identity
npx wrangler deploy
```

The DO binding and the `v1` (`new_sqlite_classes`) migration are already in `wrangler.toml`, and
`EXPO_PUBLIC_CIRCLE_URL` is already set in EAS production — the pair speaks to the same worker and
the same session as the circle, so a build with a circle has a pair and a build without one has
neither (`pairAvailable()`).

Before believing a copy change, **walk the gallery in Hebrew**: `npx expo start --web`, then
`#11.2` through `#11.7`. Four defects on this feature were visible only there and in no test.
