/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE EXERCISE LIBRARY — the lifts she wants, and the ones she never wants to see again.
 *
 * ⛔ FOUNDER, 2026-08-16: *"תרגילים אהובים או שנואים או ספרייה של תרגילים — במקום או בנוסף?"*
 *
 * The engine has honoured both declarations since the same morning: `programAssembly` gives her
 * picks the leading seats for a muscle and fills what the volume still affords behind them, and
 * treats a refusal as a GATE no score may overrule. Every one of those code paths was reachable
 * only from a test. This is the door — and a feature nothing can reach is not a feature, which is
 * the thing `everythingBuiltCanBeReached` exists to keep saying.
 *
 * ── WHY IT WEARS THE BODY MAP'S CLOTHES ─────────────────────────────────────────────────────────
 * Three rungs under a name, one of them lit. It is the same gesture as a muscle's off / normal /
 * emphasis, because it is the same KIND of decision one level down: how much of my week does this
 * get. Learning it twice would be learning it once too often.
 *
 *     REFUSE   ·   —   ·   PICK
 *
 * The middle rung is the absence of a decision, and it really does leave: a pick taken back must
 * vanish from the saved object, exactly as `normal` must leave the body map, or the engine cannot
 * tell "she changed her mind" from "she never said".
 *
 * ── ⛔ THE TWO THINGS THIS SCREEN REFUSES TO LET HER DO ─────────────────────────────────────────
 *   · **Refuse the last lift of a muscle she left ON** (`refusalBlock`). The assembler survives it
 *     by ignoring the refusals, and surviving is not the same as being honest: she would tap, see
 *     the lift marked refused, and be given it anyway. Refused at the tap, with a sentence.
 *   · **Believe a pick is a promise.** How many of her picks appear is decided by the muscle's
 *     volume and the hour, exactly as it is for the engine's own choices — so the screen says that
 *     out loud rather than implying a guarantee S-64 will break.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────────────────────────
 * A muscle she switched OFF has no section. Picking lifts for a muscle that will not be trained is
 * a decision with no consequence, and the body map is one tap away and is where that is decided.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, useToast } from '@/components/ds';
import { color, font } from '@/design/tokens';
import { tg } from '@/i18n';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { libraryPool, refusalBlock, cleanPicks } from '@/domain/exerciseLibrary';

/** Her three answers about a lift. The middle one is the absence of an answer — see the header. */
type Stance = 'refused' | 'none' | 'picked';

export function ExerciseLibrary({ navigation }: { navigation: any; route?: any }) {
  const app = useApp();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [refused, setRefused] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  /** Still on screen? `saveLibrary` awaits a programme rebuild, which she can walk away from. */
  const aliveRef = React.useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  /** Her declarations as they stand. Loaded once; this screen is the only writer. */
  useEffect(() => {
    let alive = true;
    void db.loadPreferences().then((p) => {
      if (!alive) return;
      setPicked({ ...(p?.chosenByMuscle ?? {}) });
      setRefused([...(p?.refusedIds ?? [])]);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Only muscles she left ON — see the header.
  const muscles = useMemo(
    () => CANONICAL_MUSCLE_ORDER.filter((m) => (app.profile?.bodyMap ?? {})[m] !== 'off'),
    [app.profile?.bodyMap],
  );
  const refusedSet = useMemo(() => new Set(refused), [refused]);

  const stanceOf = (muscle: string, id: string): Stance =>
    refusedSet.has(id) ? 'refused' : (picked[muscle] ?? []).includes(id) ? 'picked' : 'none';

  const setStance = (muscle: string, id: string, next: Stance) => {
    setBlocked(null);
    if (next === 'refused' && refusalBlock(muscle, id, refusedSet)) {
      // ⛔ Stated, not silently dropped — the whole reason `refusalBlock` exists. Same shape as the
      // body map's refusal line, and the same reason: a dead tap teaches her the screen is broken.
      setBlocked(muscle);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    void Haptics.selectionAsync().catch(() => {});
    setTouched(true);
    setRefused((prev) => (next === 'refused' ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
    setPicked((prev) => {
      const mine = (prev[muscle] ?? []).filter((x) => x !== id);
      // Her ORDER is the order she picked them in — `pickExercises` reads it as her seating plan.
      if (next === 'picked') mine.push(id);
      const out = { ...prev };
      if (mine.length === 0) delete out[muscle];
      else out[muscle] = mine;
      return out;
    });
  };

  const save = async () => {
    if (!touched || busy) return;
    setBusy(true);
    try {
      // A pick she later refused is dropped here rather than argued with on screen — `cleanPicks`
      // owns that reading, and it also drops ids a release has since removed from the catalogue.
      const clean: Record<string, string[]> = {};
      /*
       * ⛔ EVERY MUSCLE SHE HAS EVER PICKED FOR, NOT ONLY THE ONES ON TODAY (caught in review).
       *
       * `saveLibrary` replaces `chosenByMuscle` wholesale, and this used to build it from the ON
       * muscles only — so picking three chest lifts, switching Chest off on the body map, and then
       * saving anything at all in here DELETED those picks for ever. Her refusals survived that
       * (`refusedIds` is flat), which made the asymmetry worse: switch Chest back on and only the
       * refusals came back.
       *
       * A muscle being off is a statement about THIS week, not about what she likes. The picks for
       * an off muscle are carried through untouched and are waiting the day she turns it back on.
       */
      for (const m of new Set([...muscles, ...Object.keys(picked)])) {
        const kept = cleanPicks(m, picked[m] ?? [], refusedSet);
        if (kept.length > 0) clean[m] = kept;
      }
      const rebuilt = await app.saveLibrary(clean, refused);
      // ⚠️ THE TOAST SAYS WHAT ACTUALLY HAPPENED. A week she brought is not ours to rewrite, so the
      // save lands and the programme does not — and claiming a rebuild there would be the exact
      // class of false claim this screen was audited for.
      if (!aliveRef.current) return;
      toast.show(tg(rebuilt ? 'library.saved' : 'library.savedNoRebuild'));
      setTouched(false);
    } catch {
      if (!aliveRef.current) return;
      // ⛔ A THROW USED TO BE AN UNHANDLED REJECTION: no toast, no error, `touched` still true — she
      // pressed Save and literally nothing happened. Storage can fail; silence about it may not.
      toast.show(tg('library.saveFailed'));
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  return (
    <OnboardingScaffold
      onBack={() => navigation?.goBack?.()}
      title={tg('library.title')}
      sub={tg('library.sub')}
      headGap={18}
      bodyTop={18}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          label={tg('library.save')}
          onPress={() => void save()}
          disabled={!touched || busy}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {muscles.map((m) => {
          const isOpen = open === m;
          const mine = picked[m] ?? [];
          const no = libraryPool(m).filter((e) => refusedSet.has(e.id)).length;
          return (
            <View key={m} style={styles.group}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tg(`muscle.${m}`)}
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setOpen((cur) => (cur === m ? null : m))}
                style={styles.groupHead}
              >
                <Text style={styles.groupName}>{tg(`muscle.${m}`)}</Text>
                {/* What she has said about this muscle, without opening it. Absent when she has
                    said nothing — a row of zeros is noise, not information. */}
                {mine.length > 0 || no > 0 ? (
                  <Text style={styles.groupNote}>
                    {mine.length > 0 ? tg('library.countPicked', { n: mine.length }) : ''}
                    {mine.length > 0 && no > 0 ? ' · ' : ''}
                    {no > 0 ? tg('library.countRefused', { n: no }) : ''}
                  </Text>
                ) : null}
              </Pressable>

              {isOpen ? (
                <View style={styles.lifts}>
                  {libraryPool(m).map((e) => {
                    const st = stanceOf(m, e.id);
                    return (
                      <View key={e.id} style={styles.lift}>
                        <Text style={styles.liftName} numberOfLines={1}>{bidi(e.name)}</Text>
                        <View style={styles.rungs}>
                          {(['refused', 'none', 'picked'] as Stance[]).map((s) => {
                            const isOn = st === s;
                            return (
                              <Pressable
                                key={s}
                                accessibilityRole="button"
                                accessibilityLabel={`${e.name} — ${tg(`library.stance.${s}`)}`}
                                accessibilityState={{ selected: isOn }}
                                onPress={() => setStance(m, e.id, s)}
                                style={[styles.rung, isOn && (s === 'refused' ? styles.rungNo : styles.rungOn)]}
                              >
                                <Text style={[styles.rungText, isOn && styles.rungTextOn]}>
                                  {tg(`library.stance.${s}`)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}

                  {blocked === m ? (
                    <Text style={styles.refusal}>{tg('library.lastLift', { muscle: tg(`muscle.${m}`) })}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}

        {/* ⛔ A PICK IS NOT A PROMISE (S-64). Said plainly, because the alternative is her counting
            her picks against next week's session and finding the engine short. */}
        <Text style={styles.note}>{tg('library.note')}</Text>
      </ScrollView>
    </OnboardingScaffold>
  );
}

export default ExerciseLibrary;

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 28 },

  group: { borderBottomWidth: 1, borderBottomColor: color.borderControl },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  groupName: { flex: 1, fontFamily: font.mono, fontSize: 17, letterSpacing: 1.4, color: color.textPrimary, textAlign: 'left' },
  groupNote: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'right' },

  lifts: { paddingBottom: 14 },
  lift: { paddingVertical: 10 },
  liftName: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, marginBottom: 8, textAlign: 'left' },

  rungs: { flexDirection: 'row', gap: 8 },
  rung: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: color.borderControl },
  rungOn: { backgroundColor: color.accent, borderColor: color.accent },
  // A refusal is not an accent — it is the one rung that takes work away, and it reads as itself.
  rungNo: { backgroundColor: color.textMuted, borderColor: color.textMuted },
  rungText: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, textAlign: 'center' },
  rungTextOn: { color: color.onPaper },

  refusal: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, marginTop: 12, textAlign: 'left' },
  note: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, marginTop: 22, textAlign: 'left' },
});
