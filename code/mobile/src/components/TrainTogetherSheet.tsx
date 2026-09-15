/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * TRAIN TOGETHER — the room, before the bar. (2026-08-31)
 *
 * §11.1's screen and §11.2's lobby, folded into one sheet, because they are one moment: two people
 * are standing next to each other in a gym and one of them is about to say six letters out loud.
 * Splitting that across two screens would be two taps for one sentence.
 *
 * ── ⛔ THE HOST DOES NOT START FROM HERE, AND THAT IS THE WHOLE DESIGN ──────────────────────────
 *
 * She opens a room, her partner walks in, and then she presses **Begin — the same Begin she presses
 * every other day of her life.** Nothing about her start path changes: same gate, same day-swap
 * bookkeeping, same `startCoach`. The pair notices a live session and publishes its shape.
 *
 * That is not a shortcut, it is a risk decision. The start path is the single most load-bearing
 * flow in the product and it is guarded in four places; a second door into it, written for a social
 * feature, is exactly the shape of the "side door around the fourteen" the founder found in August.
 * So the pair does not open one. It waits by the door she already uses.
 *
 * The GUEST is the one place a start is composed here (`beginAsGuest`), and it goes through
 * `sessionStore.start` — the doorway, not a door: the paywall gate and the one-session guard are
 * inside it and cannot be routed around.
 *
 * ── WHAT SHE READS, AT EVERY STAGE ─────────────────────────────────────────────────────────────
 *   idle      → two doors: open a room, or walk into one.
 *   waiting   → the code, large, and the plain fact that nobody else is in the room yet.
 *   ready     → who is here, and what to do next (which is: begin, as usual).
 *   planReady → the guest only: what he is about to adopt, and the button that adopts it.
 *   live      → a workout is running; the sheet holds only the door out.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';

import { BottomSheet, SHEET_SETTLE } from '@/components/BottomSheet';
import { Arrive, Button, Legend, Switch } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { usePair, type PairView } from '@/state/stores/pairStore';
import { SHARED_CODE_LENGTH } from '@/domain/sharedSession';
import { color, font, stage, space } from '@/design/tokens';

export interface TrainTogetherSheetProps {
  onClose: () => void;
  /**
   * What Begin does on THIS screen — the caller's own start path, unchanged and unwrapped.
   * Absent where a workout cannot be started from (the sheet then simply says what to do next
   * rather than offering a button that would have to lie about where it leads).
   */
  onBegin?: () => void;
  /**
   * ⛔ THE GUEST'S SESSION IS LIVE AND HE IS STILL LOOKING AT HOME.
   *
   * `beginAsGuest` composes and starts a workout; it cannot navigate, because a store has no
   * navigator and a sheet has no business holding one. The host never needed this — her Begin is
   * the caller's own `onStart`, which has always navigated — and that asymmetry is exactly how the
   * guest ended up starting a real session onto a screen that never opened.
   */
  onStarted?: () => void;
  /** Her free fourteen are spent. The caller opens the paywall — never a button that does nothing. */
  onGated?: () => void;
  /** The harness's seam — the gallery hands this sheet a `PairView` so §11.1/§11.2's lobby can be
   *  reviewed without two phones and a gym. See the same note on `PairStrip`. Never passed by the app. */
  pair?: PairView;
}

export function TrainTogetherSheet({ onClose, onBegin, onStarted, onGated, pair: fixture }: TrainTogetherSheetProps) {
  const { t } = useCopy();
  const live = usePair();
  const pair = fixture ?? live;
  const [entering, setEntering] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);

  const name = pair.partnerName;
  const lifts = pair.plan?.lifts.length ?? 0;

  const body = (() => {
    switch (pair.stage) {
      case 'idle':
        /*
         * ⛔ NO ACCOUNT IS A DOOR, NOT A DEAD END.
         *
         * A room needs an identity so the two phones can know each other. An athlete who has the
         * app and has never signed in used to be told her brother's perfectly good code opened no
         * room — a sentence she would have acted on by reading the code out again, for ever. Now
         * the two doors stand down and the front door takes their place.
         */
        if (pair.signedIn === false) {
          return (
            <>
              <DoorRow
                title={t('pair.signIn')}
                sub={t('pair.signInSub')}
                last
                onPress={() => {
                  setBusy(true);
                  void pair.signIn().then((ok) => setSignInFailed(!ok)).finally(() => setBusy(false));
                }}
              />
              {signInFailed ? <Text style={styles.note}>{t('pair.signInFailed')}</Text> : null}
            </>
          );
        }
        return (
          <>
            <DoorRow title={t('pair.open')} sub={t('pair.openSub')} onPress={() => {
              setBusy(true);
              void pair.open().finally(() => setBusy(false));
            }} />
            <DoorRow title={t('pair.join')} sub={t('pair.joinSub')} onPress={() => setEntering((v) => !v)} last={!entering} />
            {entering ? (
              <View style={styles.codeRow}>
                <TextInput
                  style={styles.codeInput}
                  value={typed}
                  onChangeText={(v) => setTyped(v.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={SHARED_CODE_LENGTH}
                  /* A SAMPLE CODE, not a word — the same six glyphs in every language, which is why
                     the literal is the honest placeholder and the mono face is right for it. */
                  placeholder="ABC234"
                  placeholderTextColor={color.textTertiary}
                  accessibilityLabel={t('pair.join')}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('pair.join')}
                  disabled={typed.trim().length < SHARED_CODE_LENGTH || busy}
                  onPress={() => {
                    setBusy(true);
                    void pair.join(typed.trim()).finally(() => setBusy(false));
                  }}
                  style={({ pressed }) => [
                    styles.codeGo,
                    (typed.trim().length < SHARED_CODE_LENGTH || busy) && styles.codeGoOff,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Icon name="chevronRight" size={18} color={color.textPrimary} />
                </Pressable>
              </View>
            ) : null}
            {/* ⛔ NAMED LITERALLY, NOT ASSEMBLED. A key built from a template string is a key no
                scan can find — `nothingIsBuiltForNobody` reads the source for the key itself, and
                three real, reachable sentences looked like dead copy the moment they were
                interpolated. Three `t(…)` calls cost a line and stay findable. */}
            {pair.failure === 'not_found' ? <Text style={styles.note}>{t('pair.notFound')}</Text> : null}
            {pair.failure === 'pair_full' ? <Text style={styles.note}>{t('pair.full')}</Text> : null}
            {pair.failure === 'unavailable' ? <Text style={styles.note}>{t('pair.unavailable')}</Text> : null}
            {/* `signed_out` draws no line: the branch above has already replaced the whole state
                with the front door, which is the answer rather than a description of the problem. */}
          </>
        );

      case 'waiting':
        return (
          <>
            {/* The code is a FACT she reads out loud — printed plainly, at the size of a thing
                somebody across a bench has to hear correctly the first time. */}
            <Legend style={styles.legend}>{t('pair.codeLabel')}</Legend>
            <Text style={styles.code} accessibilityLabel={(pair.code ?? '').split('').join(' ')}>
              {pair.code}
            </Text>
            <Text style={styles.note}>{t('pair.alone')}</Text>
            {/* ⛔ THE CODE STILL WORKS WHEN THE LINK DOES NOT, and both are in one message. A
                custom scheme opens the app for somebody who HAS it and does nothing for anybody
                else, so the message never relies on the link alone (`pairLink`). */}
            <Button
              variant="secondary"
              block
              label={t('pair.shareInvite')}
              onPress={() => void pair.invite()}
              style={styles.act}
            />
            <PrivacyRow />
          </>
        );

      case 'ready':
        return (
          <>
            <Text style={styles.head}>{name ? t('pair.here', { name: bidi(name) }) : t('pair.hereAnon')}</Text>
            <LeadRow />
            {/* The host needs no second sentence — `LeadRow` above already says whose lifts these
                are, and a line repeating it under the button that changes it read as a stutter on
                glass (eye-pass, 2026-08-31). The GUEST is told what he is waiting for, and a host
                with nowhere to begin is told where the beginning is rather than left in silence. */}
            {pair.role === 'guest' ? <Text style={styles.note}>{t('pair.guestWaiting')}</Text> : null}
            {pair.role === 'host' && !onBegin ? <Text style={styles.note}>{t('pair.hostElsewhere')}</Text> : null}
            <PrivacyRow />
            {pair.role === 'host' && onBegin ? (
              <Button
                variant="primary"
                size="lg"
                block
                label={t('pair.hostBegin')}
                onPress={onBegin}
                style={styles.act}
              />
            ) : null}
          </>
        );

      case 'planReady':
        return (
          <>
            <Text style={styles.head}>
              {name ? t('pair.guestReady', { name: bidi(name), lifts }) : t('pair.guestReadyAnon', { lifts })}
            </Text>
            <LeadRow />
            <Text style={styles.note}>{t('pair.guestBeginSub')}</Text>
            <PrivacyRow />
            <Button
              variant="primary"
              size="lg"
              block
              disabled={busy}
              label={t('pair.guestBegin')}
              onPress={() => {
                setBusy(true);
                void pair.beginAsGuest().then((outcome) => {
                  if (outcome === 'gated') {
                    onClose();
                    onGated?.();
                    return;
                  }
                  if (outcome !== 'started') return; // already running, or lifts this build cannot run
                  onClose();
                  onStarted?.();
                }).finally(() => setBusy(false));
              }}
              style={styles.act}
            />
          </>
        );

      case 'live':
      default:
        return (
          <>
            <Text style={styles.head}>{name ? t('pair.here', { name: bidi(name) }) : t('pair.hereAnon')}</Text>
            <PrivacyRow />
          </>
        );
    }
  })();

  return (
    <BottomSheet onClose={onClose}>
      <Arrive order={0} after={SHEET_SETTLE}>
        <Legend style={styles.legend}>{t('pair.title')}</Legend>
        <Text style={styles.title}>{t('pair.sub')}</Text>
      </Arrive>
      <View style={styles.body}>{body}</View>
      {pair.stage !== 'idle' ? (
        <Button variant="ghost" block label={t('pair.leave')} onPress={() => { pair.leave(); onClose(); }} style={styles.leave} />
      ) : (
        <Button variant="ghost" block label={t('common.close')} onPress={onClose} style={styles.leave} />
      )}
    </BottomSheet>
  );

  /**
   * ⛔ WHOSE WORKOUT THIS IS, SAID OUT LOUD.
   *
   * It was always decided — whoever opened the room leads — and never stated, so two people paired
   * without either screen naming the workout they were about to do together. The sentence is the
   * feature; the button under it only exists because once you read the sentence you immediately
   * want the other answer.
   */
  function LeadRow() {
    const mine = pair.role === 'host';
    return (
      <View style={styles.lead}>
        <Text style={styles.leadLine}>
          {mine ? t('pair.leadYours') : name ? t('pair.leadTheirs', { name: bidi(name) }) : t('pair.leadTheirs', { name: '—' })}
        </Text>
        {/* Offered only before there IS a workout — after that the lead is settled, because the
            turn's tie-break hangs off it and a lead that moved mid-session would jump the
            alternation. The room refuses it too; this is the half she can see. */}
        {pair.canHandOverLead ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mine ? t('pair.leadGive', { name: name ?? '' }) : t('pair.leadTake')}
            onPress={pair.handOverLead}
            style={({ pressed }) => [styles.leadSwap, pressed && styles.rowPressed]}
          >
            <Text style={styles.leadSwapLabel}>
              {mine ? t('pair.leadGive', { name: bidi(name ?? '') }) : t('pair.leadTake')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  /**
   * ⛔ THE ONE PRIVACY CONTROL, AND IT IS ONE TAP, ON THE SCREEN WHERE THE DECISION IS MADE.
   *
   * `domain/sharedSession`'s header argues why the number on the bar crosses at all — it is a fact
   * about the equipment they are both touching, live, never stored. This is the other half of that
   * argument: it crosses because she left it crossing, and turning it off costs her one tap here,
   * at the moment she is deciding who she is training with, rather than three taps in a settings
   * screen she would have to already know about.
   */
  function PrivacyRow() {
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: pair.loadsPrivate }}
        accessibilityLabel={t('pair.loadsPrivate')}
        onPress={() => pair.setLoadsPrivate(!pair.loadsPrivate)}
        style={({ pressed }) => [styles.privacy, pressed && styles.rowPressed]}
      >
        <View style={styles.privacyText}>
          <Text style={styles.privacyTitle}>{t('pair.loadsPrivate')}</Text>
          <Text style={styles.privacySub}>{t('pair.loadsPrivateSub')}</Text>
        </View>
        <Switch checked={pair.loadsPrivate} onChange={pair.setLoadsPrivate} accessibilityLabel={t('pair.loadsPrivate')} />
      </Pressable>
    );
  }
}

function DoorRow({ title, sub, onPress, last }: { title: string; sub: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.rowPressed]}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  legend: { marginBottom: 10, textAlign: 'left' },
  title: { fontFamily: font.serif, fontSize: 27, lineHeight: 31, color: stage.ink0, textAlign: 'left' },
  body: { marginTop: 18 },

  head: { fontFamily: font.serif, fontSize: 23, lineHeight: 28, color: stage.ink0, textAlign: 'left' },
  note: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: stage.ink2, marginTop: 8, textAlign: 'left' },

  /* Read across a bench, so it is the biggest thing on the sheet and it is mono — six glyphs that
     must not be confusable with one another (`SHARED_CODE_ALPHABET` drops 0/O and 1/I/L). */
  code: { fontFamily: font.mono, fontSize: 40, lineHeight: 46, letterSpacing: 6, color: stage.ink0, marginTop: 6, textAlign: 'left' }, // latin-ok — SHARED_CODE_ALPHABET is A–Z2–9 in every language

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,238,229,0.10)',
  },
  rowLast: { borderBottomWidth: 0 },
  // A press changes the SURFACE, never the content (`aPressNeverDimsWhatYouPressed`).
  rowPressed: { backgroundColor: color.fillSubtle },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: font.sans, fontSize: 19, lineHeight: 23, color: stage.ink0, textAlign: 'left' },
  rowSub: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: stage.ink2, marginTop: 2, textAlign: 'left' },

  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 15 },
  codeInput: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: color.fillSubtle,
    paddingHorizontal: space[4], // rtl-ok — a symmetric inset on a centred six-glyph field
    /* ⚠️ SANS, WHILE THE BIG READ-ALOUD CODE ABOVE IS MONO — the same split `Together.joinInput`
       already made for the identical control, and for two reasons. She is typing this one while
       looking at her own keyboard, so glyph disambiguation buys nothing; and `monoCarriesNoWords`
       cannot tell a `<TextInput>` from a `<Text>` (its regex matches the prefix), so a mono field
       anywhere near a translated string reads as a Hebrew word on a face with no Hebrew. */
    fontFamily: font.sansSemibold,
    fontSize: 22,
    letterSpacing: 4, // latin-ok — the field only ever holds six Latin glyphs
    color: stage.ink0,
    textAlign: 'center',
  },
  codeGo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillSubtle,
  },
  codeGoOff: { opacity: 0.4 },

  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.10)',
  },
  privacyText: { flex: 1 },
  privacyTitle: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: stage.ink0, textAlign: 'left' },
  privacySub: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: color.textTertiary, marginTop: 2, textAlign: 'left' },

  lead: { marginTop: 14 },
  leadLine: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: stage.ink1, textAlign: 'left' },
  /* A press, not a button: the lead is a fact with an alternative, not an act the screen is for. */
  leadSwap: { alignSelf: 'flex-start', marginTop: 4, paddingVertical: 8, paddingHorizontal: 2, borderRadius: 8 }, // rtl-ok — a symmetric inset
  leadSwapLabel: { fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 21, color: color.textPrimary, textAlign: 'left' },

  act: { marginTop: 20 },
  leave: { marginTop: 20 },
});
