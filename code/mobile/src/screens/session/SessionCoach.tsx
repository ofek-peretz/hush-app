/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH, INSIDE THE WORKOUT — one door where there used to be several.
 *
 * ⛔ FOUNDER, 2026-08-02:
 *
 *   > *"I was wondering whether to add an AI window and remove SWAP. Then during the workout you
 *   > can just ask the coach for anything in the chat window and it happens — so there's also a way
 *   > to skip an exercise, or anything else."*
 *
 *   > *"Good idea and I agree with it, but still keep the window open for conversation in case the
 *   > athlete wants to say something else."*
 *
 * ── WHY THIS IS THE RIGHT SHAPE AND THE PURE VERSION IS NOT ─────────────────────────────────────
 * Replacing the swap disc with a blank text field would cost two things a text field cannot pay
 * back:
 *
 *   · SPEED — a swap today is instant and local (`swapPool`, no model). Through the coach it is
 *     1.5–12s, measured, with observed stalls to the Cloudflare wall. She is standing at a loaded
 *     bar. Making the commonest action five seconds slower is a downgrade whatever else it buys.
 *   · TELLING — the swap disc is how she learnt a swap was permitted at all. An empty box teaches
 *     nothing, which is the founder's own law ("let the control speak") pointed at the thing that
 *     replaced the control.
 *
 * So the three anticipated asks are CHIPS — the old controls, moved inside the door, still instant
 * and still local. Typing is for the half only the coach can serve, and that half is unbounded.
 *
 * ── ⛔ AND "IT HAPPENS" IS REAL HERE ────────────────────────────────────────────────────────────
 * The coach's answer carries `today` (`domain/liveRevision`), and this screen applies it to the
 * running session before she takes another set. That path did not exist before: `askCoachToRevise`
 * wrote next week's programme, and the workout she was in was untouchable.
 *
 * ⚠️ WHAT IT REFUSES TO DO IS CLAIM A CHANGE IT DID NOT MAKE. `reviseToday` returns how many edits
 * landed; an edit naming a lift she has already finished lands zero, and then she is told so. The
 * coach announcing a change that did not happen is the exact failure the post-session call taught
 * us to treat as its own outcome.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoachChat, type CoachTurn } from '@/screens/coach/CoachChat';
import { useSession } from '@/state/stores/sessionStore';
import { useCopy } from '@/i18n/useCopy';
import { askCoachInSession } from '@/platform/coach/afterSession';
import { exerciseDisplayName } from '@/data/exercises';
import { isSwapMoment } from '@/domain/swapPool';
import { stage } from '@/design/tokens';
import * as haptics from '@/platform/haptics';

let seq = 0;
const turnId = () => `sc-${Date.now()}-${seq++}`;

export function SessionCoach({ onClose, onSwap }: {
  onClose: () => void;
  /**
   * Open the swap picker. Owned by `SessionFlow` — the picker is a screen-level overlay and the
   * chip only asks for it, so the swap she gets from the chat is byte-identical to the one the
   * disc used to give her.
   */
  onSwap?: () => void;
}) {
  const { t } = useCopy();
  const session = useSession();
  /*
   * ⛔ THE KEY POINTS ARE THE OPENING TURN, not a second sheet behind a second control.
   *
   * They were their own read-only sheet for half a day (founder 2026-08-02, and it was his idea).
   * When the same disc became a conversation, a briefing that only lives behind a control she can
   * no longer reach is a feature deleted by accident — so it opens the thread instead, which is
   * also where a coach would put it: it says what it wants from her, then the floor is hers.
   *
   * `useState(() => …)` and not a plain value: this is the thread's SEED. Recomputing it on every
   * render would re-seed the conversation under her mid-sentence.
   */
  const [turns, setTurns] = useState<CoachTurn[]>(() =>
    session.emphases.map((e) => ({
      id: `sc-open-${e.ex}`,
      by: 'coach' as const,
      text: `${exerciseDisplayName(e.ex)} — ${e.say}`,
    })),
  );
  const [busy, setBusy] = useState(false);

  const exId = session.currentExerciseId;
  const exName = session.currentExercise?.name ?? exerciseDisplayName(exId);

  /** Say something in the coach's voice without spending a call — a chip's confirmation. */
  const speak = useCallback((text: string) => {
    setTurns((prev) => [...prev, { id: turnId(), by: 'coach', text }]);
  }, []);

  /*
   * ⛔ THE CHIPS DO NOT CALL THE MODEL. They are the controls that used to live in the chrome,
   * running the same local code they always ran — which is the whole reason they survived the move.
   * `swap` is offered only where it was legal before (`isSwapMoment`); a swap mid-exercise would
   * strand the sets she has already logged against a lift that is no longer there.
   */
  const chips: { label: string; onPress: () => void }[] = [];
  const swap = onSwap;
  if (exId) {
    if (swap && isSwapMoment((session.setLabel?.n ?? 1) - 1)) {
      chips.push({
        label: t('sessionCoach.chipSwap'),
        onPress: () => { haptics.setLogged(); onClose(); swap(); },
      });
    }
    chips.push({
      label: t('sessionCoach.chipSkip'),
      onPress: () => {
        const landed = session.reviseToday([{ do: 'drop', ex: exId }]);
        haptics.setLogged();
        // The last exercise standing cannot be dropped — `applyLiveEdit` refuses to empty the
        // session — so she is told that rather than left looking at an unchanged screen.
        speak(landed > 0 ? t('sessionCoach.skipped', { name: exName }) : t('sessionCoach.cannotSkip'));
      },
    });
    /*
     * ⚠️ ONLY WHERE IT CAN ACTUALLY DO SOMETHING. `markEquipmentOccupied` returns silently unless
     * she is at the START of an exercise (`exerciseSetIndex === 0`) and something remains to move
     * past — so offering it on set 2 was a chip that closed the window and did nothing.
     *
     * The condition is also true to the world: if she is on set 2 she is holding the equipment, so
     * "it's taken" is not a thing she can mean.
     */
    const atStart = (session.setLabel?.n ?? 1) === 1;
    const somethingAfter = (session.exerciseProgress?.index ?? 0) < (session.exerciseProgress?.total ?? 1) - 1;
    if (atStart && somethingAfter) {
      chips.push({
        label: t('sessionCoach.chipBusy'),
        onPress: () => { haptics.setLogged(); onClose(); session.markEquipmentOccupied(); },
      });
    }
  }

  const send = useCallback(
    (text: string, images?: { mime: string; data: string }[]) => {
      const mine: CoachTurn = { id: turnId(), by: 'athlete', text, pending: true };
      setTurns((prev) => [...prev, mine]);
      setBusy(true);
      /*
       * The ask names the workout she is in — which lift, which set, what is left — because `today`
       * is only meaningful against a running session and the coach has no other way to know one is
       * running. Without this it would answer about next week, correctly and uselessly.
       */
      const where = [
        `She is MID-WORKOUT, on ${exerciseDisplayName(exId)}`,
        session.setLabel ? `, set ${session.setLabel.n} of ${session.setLabel.m}` : '',
        session.globalProgress ? ` (step ${session.globalProgress.index + 1} of ${session.globalProgress.total})` : '',
        '. Still to come today: ',
        session.sessionExerciseIds.map(exerciseDisplayName).join(', '),
        '. She says: ',
      ].join('');
      void askCoachInSession(`${where}"${text}"`, images)
        .then((update) => {
          setTurns((prev) => prev.map((tn) => (tn.id === mine.id ? { ...tn, pending: false } : tn)));
          const landed = update.today?.length ? session.reviseToday(update.today) : 0;
          if (update.say) speak(update.say);
          /*
           * ⚠️ A SCREEN THAT CHANGES UNDER HER WITH NOTHING SAID IS ALARMING — the prompt asks the
           * coach to explain every edit, and this is what happens when it does not. `say` is
           * required by the schema so it should never be missing, but "should never" is how the
           * post-session call came back describing a programme it had not attached.
           */
          if (!update.say && landed > 0) speak(t('sessionCoach.changed'));
          // ⚠️ Said ONLY when the coach asked for changes and none of them landed. Silence here is
          // the app letting her walk away believing her workout changed when it did not.
          if (update.today?.length && landed === 0) speak(t('sessionCoach.nothingChanged'));
          if (!update.say && !update.today?.length) {
            setTurns((prev) =>
              prev.map((tn) => (tn.id === mine.id ? { ...tn, failed: true, reason: t('coach.notSent') } : tn)),
            );
          }
        })
        .finally(() => setBusy(false));
    },
    [exId, session, speak, t],
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <CoachChat
          turns={turns}
          busy={busy}
          onSend={send}
          chips={chips}
          invitation={t('sessionCoach.invitation')}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: stage[0] },
  safe: { flex: 1 },
});
