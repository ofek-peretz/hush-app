/**
 * Exercise demo videos (Launch Roadmap item 5).
 *
 * The media SEAM + per-exercise mapping. Content is DEFERRED (founder decision 2026-06-24: build
 * the player, supply files later) — the map below is empty, so every exercise gracefully falls back
 * to the existing vector form-guide until a source is added.
 *
 * To add content, drop an entry keyed by exercise id — no other code changes; the player and the
 * "Form" affordance read this map:
 *   • remote (streamed, updatable without a release, needs hosting + network):
 *       bb_bench_press: { kind: 'remote', uri: 'https://cdn.hush.app/demos/bb_bench_press.mp4' }
 *   • bundled (offline, instant, grows the binary, needs a release to update):
 *       bb_bench_press: { kind: 'bundled', module: require('../../../assets/exercise-videos/bb_bench_press.mp4') }
 */
// @ts-nocheck

// 


/** A resolvable demo-video source for an exercise. */
export type VideoSource =
  | { kind: 'remote'; uri: string }
  | { kind: 'bundled'; module: number };

/** Per-exercise demo videos, keyed by exercise id. EMPTY until content is supplied. */
export const EXERCISE_VIDEO: Record<string, VideoSource> = {
  // (content deferred — see file header)
};

/** The demo-video source for an exercise, or null when none is available (→ form-guide fallback). */
export function exerciseVideoSource(exerciseId: string | null | undefined): VideoSource | null {
  if (!exerciseId) return null;
  return EXERCISE_VIDEO[exerciseId] ?? null;
}

/** Whether an exercise has a demo video (drives the "Watch"/"Form" affordance + fallback). */
export function hasExerciseVideo(exerciseId: string | null | undefined): boolean {
  return exerciseVideoSource(exerciseId) != null;
}
