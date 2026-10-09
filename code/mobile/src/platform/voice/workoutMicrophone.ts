/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE WORKOUT HOLDS NO MICROPHONE — until a phone shows one way for it to live with her music.
 * (founder, 2026-10-10: *"מאשר"*)
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
 * (`theVoiceSurvivesThePhone` turns this on); what is asked of the phone in the meantime is WHICH
 * act stops the music (`platform/voice/voiceMeasure`), and whether any way of holding the microphone
 * does not.
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
