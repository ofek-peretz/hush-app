/**
 * Watch haptic taxonomy + event mappings (non-native — the canonical spec the
 * native WatchKit layer conforms to). Pure data + pure functions, fully testable.
 *
 * Hush never uses a buzzy notification haptic. Each pattern has exactly one job,
 * and the FIVE major progress events (set / rest / exercise / workout / connection
 * lost) are mutually distinguishable by rhythm and intensity alone, so a trained
 * athlete can run a whole session by feel without looking. The Workout Complete
 * pattern is the signature: the only one with an internal pause AND a sustained
 * beat — unmistakable as "the session is fully complete".
 *
 * See WATCH_EXPERIENCE_SPEC.md §3.
 */

export type HapticPatternId =
  | 'set_complete'
  | 'rest_complete'
  | 'exercise_complete'
  | 'workout_complete'
  | 'connection_lost'
  | 'receipt'
  | 'settle'
  | 'affirm'
  | 'action_ack';

export type HapticIntensity = 'light' | 'soft' | 'gentle_firm' | 'warm' | 'low';

/** One beat of a pattern. `gapBeforeMs` spaces beats; `sustained` marks a long
 *  held beat (used only by the Workout Complete signature). */
export interface HapticBeat {
  gapBeforeMs: number;
  intensity: HapticIntensity;
  sustained?: boolean;
}

export interface HapticPattern {
  id: HapticPatternId;
  /** Human label for the native implementer. */
  label: string;
  beats: HapticBeat[];
  /** One of the five required, mutually-distinct major progress events. */
  major: boolean;
  /** Whether it is felt with the wrist down (key for the gym). */
  firesWristDown: boolean;
}

export const HAPTICS: Record<HapticPatternId, HapticPattern> = {
  set_complete: {
    id: 'set_complete',
    label: 'single light tap',
    beats: [{ gapBeforeMs: 0, intensity: 'light' }],
    major: true,
    firesWristDown: true,
  },
  rest_complete: {
    id: 'rest_complete',
    label: 'soft ascending double — the go signal',
    beats: [
      { gapBeforeMs: 0, intensity: 'soft' },
      { gapBeforeMs: 120, intensity: 'gentle_firm' },
    ],
    major: true,
    firesWristDown: true,
  },
  exercise_complete: {
    id: 'exercise_complete',
    label: 'even gentle-firm triple — a closed phase',
    beats: [
      { gapBeforeMs: 0, intensity: 'gentle_firm' },
      { gapBeforeMs: 150, intensity: 'gentle_firm' },
      { gapBeforeMs: 150, intensity: 'gentle_firm' },
    ],
    major: true,
    firesWristDown: true,
  },
  workout_complete: {
    id: 'workout_complete',
    label: 'signature: two soft taps, a pause, one sustained warm beat',
    beats: [
      { gapBeforeMs: 0, intensity: 'soft' },
      { gapBeforeMs: 120, intensity: 'soft' },
      { gapBeforeMs: 500, intensity: 'warm', sustained: true },
    ],
    major: true,
    firesWristDown: true,
  },
  connection_lost: {
    id: 'connection_lost',
    label: 'single low, longer, descending tap — soft, never alarming',
    beats: [{ gapBeforeMs: 0, intensity: 'low', sustained: true }],
    major: true,
    firesWristDown: true,
  },
  // ---- Supporting (lower-frequency, user-initiated contexts) ----
  receipt: {
    id: 'receipt',
    label: 'firm even warm double — Hush was right',
    beats: [
      { gapBeforeMs: 0, intensity: 'warm' },
      { gapBeforeMs: 140, intensity: 'warm' },
    ],
    major: false,
    firesWristDown: true,
  },
  settle: {
    id: 'settle',
    label: 'single soft longer tap — the workout stilled',
    beats: [{ gapBeforeMs: 0, intensity: 'soft', sustained: true }],
    major: false,
    firesWristDown: false,
  },
  affirm: {
    id: 'affirm',
    label: 'single gentle tap — back',
    beats: [{ gapBeforeMs: 0, intensity: 'gentle_firm' }],
    major: false,
    firesWristDown: false,
  },
  action_ack: {
    id: 'action_ack',
    label: 'light tap — a sent intent registered (mirrors set_complete by design)',
    beats: [{ gapBeforeMs: 0, intensity: 'light' }],
    major: false,
    firesWristDown: false,
  },
};

/** The events that produce a haptic, named at the point they occur. */
export type WatchHapticEvent =
  | 'set_logged' // the phone confirmed a completed set (incl. adjusted reps)
  | 'rest_elapsed' // the rest timer reached zero
  | 'ready_tapped' // the athlete ended rest early
  | 'exercise_boundary' // entered Exercise Complete
  | 'workout_saved' // entered Workout Complete
  | 'connection_lost'
  | 'reconnected'
  | 'paused'
  | 'resumed'
  | 'receipt_earned'
  | 'exercise_busy_applied';

const EVENT_TO_PATTERN: Record<WatchHapticEvent, HapticPatternId> = {
  set_logged: 'set_complete',
  rest_elapsed: 'rest_complete',
  ready_tapped: 'action_ack',
  exercise_boundary: 'exercise_complete',
  workout_saved: 'workout_complete',
  connection_lost: 'connection_lost',
  reconnected: 'affirm',
  paused: 'settle',
  resumed: 'affirm',
  receipt_earned: 'receipt',
  exercise_busy_applied: 'action_ack',
};

/** The haptic pattern for an event. When a set both logs AND earns a receipt, the
 *  caller fires `receipt_earned` (the receipt supersedes the plain set tick). */
export function hapticForEvent(event: WatchHapticEvent): HapticPattern {
  return HAPTICS[EVENT_TO_PATTERN[event]];
}
