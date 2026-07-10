/**
 * Haptics — intentional impacts that punctuate the real moments of a workout, built ONLY from
 * impact/selection feedback. Hush never uses the buzzy iOS notification haptic (it conflicts with
 * the calm instrument feel) — the same rule the Apple Watch taxonomy follows (see
 * `platform/watch/watchHaptics.ts`). The phone events mirror that taxonomy so the two surfaces feel
 * like one product: a set is a single light tap; rest-over is a soft ascending double; the workout
 * close is the signature (two soft taps, a pause, one sustained beat).
 */
import * as Haptics from 'expo-haptics';

const I = Haptics.ImpactFeedbackStyle;
/** Schedule a follow-on impact (for the few multi-beat patterns). */
function beat(ms: number, style: Haptics.ImpactFeedbackStyle): void {
  setTimeout(() => void Haptics.impactAsync(style), ms);
}

/** Begin a workout — a confident medium tap as the stage takes over. */
export function workoutStart(): void {
  void Haptics.impactAsync(I.Medium);
}

/** A set is logged (Complete Set) — a single light tap (mirrors the watch `set_complete`). */
export function setLogged(): void {
  void Haptics.impactAsync(I.Light);
}

/** Rest is over — a soft ascending double, the "go" signal (mirrors the watch `rest_complete`).
 *  Never a notification haptic. */
export function restFinished(): void {
  void Haptics.impactAsync(I.Soft);
  beat(120, I.Medium);
}

/**
 * The rest "Approach" countdown — escalating single taps over the final seconds of rest, resolving
 * into the GO signal (`restFinished` / `exerciseAdvance`). Awareness, not alarm: ONE soft whisper at
 * 7s gives the athlete an unhurried window to wrap up and approach the station, then a rising 3-2-1
 * (light → medium → rigid) builds readiness so they launch into the set on the GO without staring at
 * the screen. The whole pattern is single transients, distinct from every other workout haptic.
 *
 * NOTE: these Core Haptics fire only while the app is foregrounded + awake (JS timers suspend when
 * locked/backgrounded). The locked/background 7s-warning + rest-over cue is delivered by the
 * OS-level local-notification backstop in `platform/restHaptics.ts` (the notification handler
 * suppresses those alerts in the foreground so they never double with these beats). When a watch
 * workout is active the watch OWNS the wrist-down countdown and the phone backstop stands down.
 * See `platform/watch/watchHaptics.ts` (`rest_countdown`).
 */
export const REST_APPROACH_BEATS: readonly number[] = [7, 3, 2, 1];

/** Fire one Approach beat for a given seconds-remaining threshold (rising salience toward 0). */
export function restApproach(secondsLeft: number): void {
  const style = secondsLeft >= 7 ? I.Soft : secondsLeft >= 3 ? I.Light : secondsLeft >= 2 ? I.Medium : I.Rigid;
  void Haptics.impactAsync(style);
}

/** A new exercise begins (a transition rest ended) — a gentle-firm triple, distinct from the
 *  between-sets GO double (mirrors the watch `exercise_complete`). */
export function exerciseAdvance(): void {
  void Haptics.impactAsync(I.Medium);
  beat(150, I.Medium);
  beat(300, I.Medium);
}

/** A small confirmation (swap chosen, sheet acknowledged). */
export function confirm(): void {
  void Haptics.impactAsync(I.Light);
}

/** A wheel-picker detent / selection change — the lightest tick. */
export function selection(): void {
  void Haptics.selectionAsync();
}

/** Fired once on the Well Done screen when a workout was actually completed — the signature close
 *  (two soft taps, a pause, one sustained beat), mirroring the watch `workout_complete`. */
export function wellDone(): void {
  void Haptics.impactAsync(I.Soft);
  beat(120, I.Soft);
  beat(620, I.Heavy);
}

/** A milestone lands (founder 2026-07-10 — the one licensed loud moment): a plate locking onto
 *  the bar. One heavy strike as the emblem stamps in, then a short rigid settle. Rare by
 *  construction (the rarity law), so its weight stays meaningful. */
export function milestone(): void {
  void Haptics.impactAsync(I.Heavy);
  beat(180, I.Rigid);
}
