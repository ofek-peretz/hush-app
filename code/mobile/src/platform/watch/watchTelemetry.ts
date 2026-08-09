/**
 * Watch research-dataset capture (non-native). Pure builders that produce the
 * `{ type, data }` records the watch experience emits, so every watch-side event
 * lands in the SAME durable, append-only telemetry pipeline as everything else
 * (track → backend `athlete_event`). Keeping them as builders makes the payloads
 * consistent and unit-testable; the native controller (or its bridge back to the
 * phone) simply forwards each record to `track`.
 *
 * What this captures (the felt + seen journey, reconstructable end-to-end):
 *  - which screen the athlete saw (and, via seq/ts, for how long),
 *  - which haptic fired on the wrist and why,
 *  - the Finish confirmation being shown and answered,
 *  - Exercise Busy being applied from the watch.
 * Lifecycle + intent acceptance/rejection are already captured by WatchSession.
 */
// @ts-nocheck

// 

import { WATCH_EVENTS } from '@/platform/events';
import type { WatchScreen } from './watchPresentation';
import { hapticForEvent, type WatchHapticEvent } from './watchHaptics';

export interface TelemetryRecord {
  type: string;
  data: Record<string, unknown>;
}

/** The athlete was shown a watch screen. */
export function screenPresentedEvent(screen: WatchScreen): TelemetryRecord {
  return {
    type: WATCH_EVENTS.screenPresented,
    data: {
      kind: screen.kind,
      disabled: !!screen.disabled,
      reconnecting: !!screen.reconnecting,
    },
  };
}

/** A haptic fired on the wrist. Records the triggering event and the resolved
 *  pattern so the felt-progress signal is in the dataset. */
export function hapticEvent(event: WatchHapticEvent): TelemetryRecord {
  return {
    type: WATCH_EVENTS.haptic,
    data: { event, pattern: hapticForEvent(event).id },
  };
}

/** The Finish Workout? confirmation was presented. */
export function finishPromptedEvent(): TelemetryRecord {
  return { type: WATCH_EVENTS.finishPrompted, data: {} };
}

/** The Finish confirmation was answered. */
export function finishResolvedEvent(answer: 'yes' | 'no'): TelemetryRecord {
  return { type: WATCH_EVENTS.finishResolved, data: { answer } };
}

/** Exercise Busy (equipment-occupied) was applied from the watch. */
export function exerciseDeferredEvent(): TelemetryRecord {
  return { type: WATCH_EVENTS.exerciseDeferred, data: {} };
}
