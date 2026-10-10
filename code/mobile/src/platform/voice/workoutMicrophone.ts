/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE WORKOUT HOLDS NO MICROPHONE — this is the product, not a stopgap.
 * (founder, 2026-10-10: *"מאשר"*, and the same evening, to "the coach's voice is the product, the
 * number is a detail": *"אני מסכים"*)
 *
 * What his phone said, with Spotify, Sony WH-1000XM5 and iOS 26.3.1:
 *   > *"לחצתי על בדיקת קול המוזיקה נחלשה."*
 *   > *"התחלתי אימון והמוזיקה נעצרה … חזרתי לספוטיפיי להמשיך את המוזיקה וחזרתי ל-FERROX, אבל איך
 *   > שהמאמנת התחילה לדבר המוזיקה שוב נעצרה לגמרי."*
 *
 * With no microphone the coach speaks and his music is lowered and given back — the Waze of the
 * gym, working. With the microphone held (every workout of build 77) the coach's first word stops
 * his music outright, and it stays stopped until the workout lets go of the audio. On that phone it
 * is one or the other, and a workout with no music is not a workout he will do.
 *
 * So the workout takes the half that works: the coach speaks, the music is lowered for the line,
 * nothing listens, and a set is marked where it always could be — the lock screen, the wrist, the
 * stage. The microphone's own code is untouched and still walked by its laws
 * (`theVoiceSurvivesThePhone` turns this on).
 *
 * What the phone answered when it was asked WHICH act stops the music (build 78's measurement, three
 * identical runs; `docs/canonical/FERROX_VOICE_SCREENPLAY.md` §11): not the microphone. It is the
 * category being changed from playback to record on a session that is already active — a record
 * session with no microphone stopped Spotify the same way, and one activated FRESH (let go, state the
 * category, activate) did not, microphone running. That is the way back the day there is a reason
 * for one. It does not bring the duck with it: a line still cannot lower his music under a held
 * microphone, and a coach he cannot hear over his music is no coach — which is why this stays off.
 *
 * ⛔ Not to be turned on by a fix elsewhere. The journal he sent the same day shows a second,
 * unrelated defect — the microphone is not opened when the stage mounts a moment before iOS calls
 * the app active (`ear state=not_on_glass`, then `ear_down why=locked`). Repairing that while this
 * stands would only make the music stop in every workout instead of some.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function workoutHoldsMicrophone(): boolean {
  return false;
}
