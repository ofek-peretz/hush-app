/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ACTIVATION FUNNEL HAS NO DARK STEPS.
 *
 * ⛔ THE FINDING (2026-08-23, the world-class pass): onboarding emitted ONE telemetry event
 * (`health_skipped`) — so "where do people give up before their first workout", the single most
 * important question a subscription product has, was unanswerable from the dataset. The fix is
 * `FUNNEL_EVENTS`: one event per step REACHED, plus the fork's `{ door }`; the funnel itself is
 * the differences between counts.
 *
 * ── WHAT THIS LAW PINS ──────────────────────────────────────────────────────────────────────────
 *   1. Every step in the taxonomy is EMITTED by its screen — an event nobody fires is a step that
 *      goes dark the day someone refactors a screen, and dark steps read as "everyone got here".
 *   2. Each step fires on MOUNT, once (`, []`) — a step counted per re-render is a funnel where
 *      every stage exceeds the one before it, which is a graph that argues nothing.
 *   3. The far edges stay OUT: `onboarding_completed` / `session_started` / `session_completed`
 *      already exist; a `funnel_` duplicate would be two names for one fact.
 *   4. No step spies on fields. A step is the granularity a fix can act on; the fork's door is the
 *      one payload, because the two doors are two different products to fix.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { FUNNEL_EVENTS } from '@/platform/events';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Step → the one screen that owns it. Start also owns the fork. */
const STEP_OWNERS: Record<string, string> = {
  startReached: 'screens/onboarding/Start.tsx',
  aboutYouReached: 'screens/onboarding/AboutYou.tsx',
  healthReached: 'screens/onboarding/ConnectHealth.tsx',
  /* ⛔ `bodyMapReached` BECAME `yourWeekReached` (founder 2026-08-29). The body map left the intake
     and the builder took its seat — and a funnel step whose screen is deleted counts nobody while
     reading, in the dataset, as "everyone got here". A renamed step is an honest gap in the series;
     a dark one is a lie in it. */
  yourWeekReached: 'screens/plan/PlanBuilder.tsx',
  buildReached: 'screens/onboarding/BuildingProgramme.tsx',
};

describe('every funnel step is emitted by its screen', () => {
  it.each(Object.entries(STEP_OWNERS))('⛔⛔ %s fires in %s, on mount, once', (step, rel) => {
    const screen = read(rel).replace(/\s+/g, ' ');
    // The call…
    expect(screen).toContain(`void track(FUNNEL_EVENTS.${step})`);
    // …inside a mount-only effect. A step per re-render inflates every stage above the one
    // before it — the graph would argue nothing.
    expect(screen).toContain(`void track(FUNNEL_EVENTS.${step}); }, [])`);
  });

  it('⛔ the fork reports WHICH door — the two doors are two different products to fix', () => {
    const start = read('screens/onboarding/Start.tsx').replace(/\s+/g, ' ');
    expect(start).toContain("void track(FUNNEL_EVENTS.doorChosen, { door: where })");
  });

  it('⛔ and so does the SECOND fork — build it for me · a blank sheet · a shelf', () => {
    /*
     * The intake's last step is three products, not one: an athlete who asks for a week to be built
     * and an athlete who writes her own are failing at different things when they drop out here, and
     * a single count cannot say which. Same reason as the door above, same shape of payload.
     */
    const builder = read('screens/plan/PlanBuilder.tsx').replace(/\s+/g, ' ');
    for (const door of ['engine', 'blank', 'template']) {
      expect(builder).toContain(`void track(FUNNEL_EVENTS.weekDoorChosen, { door: '${door}' })`);
    }
  });

  it('⛔ every event in the taxonomy has an owner here — no step may be added dark', () => {
    // A new FUNNEL_EVENTS entry with no screen firing it counts nobody, which reads as
    // "everyone got here". Adding a step means adding its emitter AND its row above.
    const owned = new Set([...Object.keys(STEP_OWNERS), 'doorChosen', 'weekDoorChosen']);
    expect(Object.keys(FUNNEL_EVENTS).sort()).toEqual([...owned].sort());
  });
});

describe('the far edges stay out of the funnel namespace', () => {
  it('⛔ no funnel_ duplicate of onboarding_completed / session edges exists', () => {
    /*
     * `onboarding_completed`, `session_started`, `session_completed` are already in the dataset —
     * the funnel JOINS to them. Two names for one fact means the next analyst trusts whichever
     * diverged less embarrassingly.
     */
    const values = Object.values(FUNNEL_EVENTS) as string[];
    for (const v of values) {
      expect(v).toMatch(/^funnel_/);
      expect(v).not.toMatch(/completed|onboarding_done|first_workout/);
    }
  });

  it('⚠️ no step carries her answers — a step is the fix granularity, not surveillance', () => {
    // Only the two FORKS have a payload, and it is the door taken, not a field she typed.
    for (const [step, rel] of Object.entries(STEP_OWNERS)) {
      const screen = read(rel).replace(/\s+/g, ' ');
      expect(screen).not.toContain(`void track(FUNNEL_EVENTS.${step}, {`);
    }
  });
});
