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

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Arrive, Button, TextField, useToast } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { color, font } from '@/design/tokens';
import { tg } from '@/i18n';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { libraryPool, refusalBlock, cleanPicks } from '@/domain/exerciseLibrary';
import { exerciseDisplayName, type MuscleGroup } from '@/data/exercises';

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
    /* The canonical order is typed `readonly string[]` (it lives in the engine, which must not
       import the catalogue's types — layering). Every name in it IS a MuscleGroup, and this is the
       one seam where the two vocabularies meet — so it is asserted once here, not cast four times
       at the call sites below. */
    () => CANONICAL_MUSCLE_ORDER.filter((m) => (app.profile?.bodyMap ?? {})[m] !== 'off') as MuscleGroup[],
    [app.profile?.bodyMap],
  );
  const refusedSet = useMemo(() => new Set(refused), [refused]);

  /*
   * ════ ⛔ SEARCH (2026-08-23, the world-class pass) ════
   *
   * 117 lifts behind ten accordions meant that finding ONE — the whole reason she opened this
   * screen — was open-and-scan, ten times. Every competitor's library leads with a search field,
   * and they are right to: a library's first verb is FIND.
   *
   * ⚠️ IT SEARCHES HER LANGUAGE AND THE CATALOGUE'S, both. `exerciseDisplayName` resolves the
   * locale (Hebrew names live in `he.json` since 2026-08-21), and the English `name` stays
   * searchable beside it because gym vocabulary is bilingual in practice — an athlete whose app
   * speaks Hebrew still types "RDL". Matching only English would make search useless for the
   * Hebrew athlete — the same defect the import's `locale` bug shipped, one surface over.
   *
   * ⚠️ AND IT SEARCHES ONLY WHAT THE SCREEN OFFERS: her trainable muscles' pools. A hit on an OFF
   * muscle would be a door to a decision this screen deliberately does not host (the header:
   * "picking lifts for a muscle that will not be trained is planning for a world that does not
   * exist").
   */
  const [query, setQuery] = useState('');
  const hits = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (q.length < 2) return null; // one letter matches half the catalogue — noise, not search
    const out: { muscle: MuscleGroup; id: string; name: string }[] = [];
    for (const m of muscles) {
      for (const e of libraryPool(m)) {
        const spoken = exerciseDisplayName(e.id);
        if (spoken.toLocaleLowerCase().includes(q) || e.name.toLocaleLowerCase().includes(q)) {
          out.push({ muscle: m, id: e.id, name: spoken });
        }
      }
    }
    return out;
  }, [query, muscles]);

  /*
   * ⛔ WHAT SHE HAS SAID, WITHOUT OPENING TEN DOORS (founder, 2026-08-19).
   *
   * Every row here is a closed accordion with nothing on it, so the screen had no state at all: to
   * find out whether she had ever picked anything she had to open all ten and count. The per-muscle
   * note answers it one muscle at a time; this answers it for the page, above the list, where the
   * question is actually asked.
   *
   * ⚠️ REFUSALS ARE COUNTED AS DISTINCT IDS, not summed per muscle. `refusedIds` is flat and a
   * lift can sit in more than one muscle's pool, so adding the rows up would report a refusal twice.
   */
  const totals = useMemo(() => {
    let picks = 0;
    const no = new Set();
    for (const m of muscles) {
      picks += (picked[m] ?? []).length;
      for (const e of libraryPool(m)) if (refusedSet.has(e.id)) no.add(e.id);
    }
    return { picked: picks, refused: no.size };
  }, [muscles, picked, refusedSet]);

  const stanceOf = (muscle: MuscleGroup, id: string): Stance =>
    refusedSet.has(id) ? 'refused' : (picked[muscle] ?? []).includes(id) ? 'picked' : 'none';

  const setStance = (muscle: MuscleGroup, id: string, next: Stance) => {
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
      for (const m of new Set([...muscles, ...(Object.keys(picked) as MuscleGroup[])])) {
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
      /*
       * ⛔ THE CONSEQUENCE IS SHOWN, NOT DESCRIBED (founder, device QA 2026-08-23: *"עדיין לא הבנתי
       * מה קורה אם אני לוחץ בחר על תרגיל מסוים… זה סתם יושב שם"*).
       *
       * The save already rebuilt her week around the choice — and the proof of that was a toast
       * that outlived itself in two seconds. When a rebuild actually happened, the screen now walks
       * her to the Program tab, where the lift she just chose is sitting in the week it changed.
       * A save that could NOT rebuild (a week she brought) stays put — navigating would show a week
       * that deliberately did not change, which reads as the save failing.
       */
      if (rebuilt) navigation?.navigate?.('HomeTabs', { screen: 'Program' });
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
        <View>
          {/* ⛔ WHAT SAVING WILL DO, BEFORE IT DOES IT (design review 2026-09-01 · F7). The button
              committed her choices sight-unseen; one line above it now states the decision being
              saved, in the counts she just made. Silent when nothing changed — the button is
              disabled then anyway. */}
          {touched && (totals.picked > 0 || totals.refused > 0) ? (
            <Text style={styles.saveSummary}>
              {[
                totals.picked > 0 ? tg('library.countPicked', { n: totals.picked }) : '',
                totals.refused > 0 ? tg('library.countRefused', { n: totals.refused }) : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          <Button
            variant="primary"
            size="lg"
            block
            label={tg('library.save')}
            onPress={() => void save()}
            disabled={!touched || busy}
          />
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/*
          The library's first verb — see the search note at the derivation.

          ✦ AND IT CARRIES A MAGNIFIER (2026-08-27). This app writes a field's value on a RULE
          rather than inside a box (founder 2026-07-12, and it is right — a bordered well is the one
          place an instrument looks like everybody else's app). The cost is that a field with no
          box AND no label has nothing left to identify it: this is the only `TextField` in the
          product without a `label`, and its 24-point placeholder sat under a rule directly beneath
          a real heading, reading as a second heading. The screen's first verb looked like furniture.
        */}
        <TextField
          block
          leading={<Icon name="search" size={19} color={color.textMuted} strokeWidth={1.8} />}
          value={query}
          onChangeText={setQuery}
          placeholder={tg('library.search')}
          accessibilityLabel={tg('library.search')}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          style={styles.search}
        />

        {hits ? (
          hits.length === 0 ? (
            /* Honest, and it names the query — "nothing" with no subject reads as a broken screen. */
            <Text style={styles.noMatches}>{tg('library.noMatches', { q: query.trim() })}</Text>
          ) : (
            <View style={styles.results}>
              {hits.map((h) => {
                const st = stanceOf(h.muscle, h.id);
                return (
                  <View key={h.id} style={styles.lift}>
                    <View style={styles.resultText}>
                      {/* The muscle rides as an eyebrow — a flat list loses the accordion's context,
                          and "Row" under Back and "Row" under Shoulders are different decisions. */}
                      <Text style={styles.resultMuscle}>{tg(`muscle.${h.muscle}`)}</Text>
                      <Text style={styles.liftName} numberOfLines={1}>{bidi(h.name)}</Text>
                    </View>
                    <View style={styles.rungs}>
                      {(['picked', 'refused'] as Stance[]).map((s) => {
                        const isOn = st === s;
                        return (
                          <Pressable
                            key={s}
                            accessibilityRole="button"
                            accessibilityLabel={`${h.name} — ${tg(`library.stance.${s}`)}`}
                            accessibilityState={{ selected: isOn }}
                            onPress={() => setStance(h.muscle, h.id, isOn ? 'none' : s)}
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
            </View>
          )
        ) : null}

        {/* ⛔ THE LAW OF THE SCREEN, BEFORE THE SCREEN (design review 2026-09-01). "A pick is not a
            promise" (S-64) sat at the very BOTTOM of the scroll — under ten groups and under the
            sticky footer, so the one sentence that explains what choosing DOES was the least
            reachable line here. A rule reads before the objects it governs. */}
        {hits ? null : <Text style={styles.note}>{tg('library.note')}</Text>}

        {hits ? null : totals.picked > 0 || totals.refused > 0 ? (
          <Text style={styles.summary}>
            {[
              totals.picked > 0 ? tg('library.countPicked', { n: totals.picked }) : '',
              totals.refused > 0 ? tg('library.countRefused', { n: totals.refused }) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}

        {hits ? null : muscles.map((m) => {
          const isOpen = open === m;
          // Read once: the row's counts, the row's note and the open list are all this same pool.
          const pool = libraryPool(m);
          const mine = picked[m] ?? [];
          const no = pool.filter((e) => refusedSet.has(e.id)).length;
          /*
           * What the row carries, in one string, because it is both DRAWN and ANNOUNCED.
           *
           * ⛔ AND THE ANNOUNCEMENT IS WHY IT HAD TO BE. With the English muscle names finally
           * correct, the Back row and the scaffold's back arrow both said "Back" and nothing else —
           * two buttons, one word, one of them a navigation. A row that says "Back — 9 lifts" is
           * not ambiguous, and it is the sentence a screen reader wanted from it anyway.
           */
          const note =
            mine.length > 0 || no > 0
              ? [
                  mine.length > 0 ? tg('library.countPicked', { n: mine.length }) : '',
                  no > 0 ? tg('library.countRefused', { n: no }) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              : tg('library.countLifts', { n: pool.length, count: pool.length });
          return (
            <View key={m} style={styles.group}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${tg(`muscle.${m}`)} — ${note}`}
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setOpen((cur) => (cur === m ? null : m))}
                style={styles.groupHead}
              >
                <Text style={styles.groupName}>{tg(`muscle.${m}`)}</Text>
                {/*
                  What she has said about this muscle, without opening it.

                  ⛔ AND WHEN SHE HAS SAID NOTHING, HOW MANY LIFTS ARE IN THERE. The row used to
                  carry nothing at all until she had an opinion — "a row of zeros is noise" — which
                  left ten identical names and no reason to believe any of them opened onto
                  anything. A count is not a zero: it is the one fact she cannot get without tapping.
                */}
                <Text style={styles.groupNote}>{note}</Text>
                {/* ⛔ AND A DISCLOSURE MARK. Ten hairlined names with no chevron read as a list of
                    labels, not as ten doors — the vertical chevron because this opens in place and
                    goes nowhere (`Icon`'s own note: horizontal chevrons are directional). */}
                <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={18} color={color.textMuted} />
              </Pressable>

              {isOpen ? (
                <View style={styles.lifts}>
                  {pool.map((e) => {
                    const st = stanceOf(m, e.id);
                    return (
                      <View key={e.id} style={styles.lift}>
                        {/* ⛔ `e.name` IS THE CATALOGUE'S ENGLISH — data, not a spoken name. This row
                            printed it raw to a Hebrew athlete since the screen shipped: the exact
                            class `everyLiftHasAHebrewName` was written for, on a path its sweep did
                            not cover (a direct read, not a `?? exerciseDisplayName` fallback). Found
                            2026-08-23 while the search row beside it was being built correctly. */}
                        <Text style={styles.liftName} numberOfLines={1}>{bidi(exerciseDisplayName(e.id))}</Text>
                        <View style={styles.rungs}>
                          {/*
                           * ⛔ TWO CHIPS, AND THEY SAY WHAT THEY DO (founder, device QA 2026-08-23,
                           * his third pass at this screen: *"יש שם פלוס או מינוס אבל מה זה אומר
                           * בכלל?"*).
                           *
                           * The three-rung control ("לעולם לא · — · בחר") was the body map's gesture
                           * transplanted — and it did not survive the trip. "—" read as a minus with
                           * no meaning, "בחר" said an action but not its consequence, and he read
                           * the row as arithmetic. So the middle rung is GONE as a control: two
                           * chips, each named for its consequence ("יבוא ראשון" / "להסתיר"), and
                           * pressing a lit chip takes the answer back. `none` survives as the
                           * STATE — no chip lit — which is what the absence of a decision looks
                           * like everywhere else in the world.
                           *
                           * (The 2026-08-19 rule stands underneath: the accent belongs to a
                           * decision, never to its absence — unlit chips carry no moss.)
                           */}
                          {(['picked', 'refused'] as Stance[]).map((s) => {
                            const isOn = st === s;
                            return (
                              <Pressable
                                key={s}
                                accessibilityRole="button"
                                accessibilityLabel={`${exerciseDisplayName(e.id)} — ${tg(`library.stance.${s}`)}`}
                                accessibilityState={{ selected: isOn }}
                                onPress={() => setStance(m, e.id, isOn ? 'none' : s)}
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

      </ScrollView>
    </OnboardingScaffold>
  );
}

export default ExerciseLibrary;

const styles = StyleSheet.create({
  search: { marginBottom: 16 },
  results: { gap: 2 },
  resultText: { flex: 1, minWidth: 0, gap: 1 },
  resultMuscle: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'left' },
  noMatches: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textSecondary, textAlign: 'left', paddingVertical: 12 },
  /* paddingBottom 28 → 56: the last group and the explainer must clear the footer fade. */
  body: { paddingTop: 8, paddingBottom: 56 },

  /* The page's own answer to "what have I said" — see `totals`. */
  saveSummary: { fontFamily: font.sans, fontSize: 17, color: color.textSecondary, textAlign: 'center', marginBottom: 10 },
  summary: { fontFamily: font.sans, fontSize: 17, color: color.textSecondary, paddingBottom: 14, textAlign: 'left' },

  group: { borderBottomWidth: 1, borderBottomColor: color.borderControl },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  /*
   * ⛔ THIS WAS MONO WITH 1.4 OF TRACKING, AND IT CARRIES A WORD (seen on the running screen,
   * 2026-08-19). In English "Chest" merely read wide; in Hebrew the tracking pulls the letters of
   * "יד אחורית" apart into "יד  אחורית" — JetBrains Mono has no Hebrew at all, so the glyphs fall
   * back and the spacing is applied to a face that never agreed to it. `monoCarriesNoWords` is the
   * law for exactly this and could not see it: it scans for `t(` inside the tag and this row is fed
   * by `tg(`. The law now knows both; this row is sans, like every other name in the product.
   */
  groupName: { flex: 1, fontFamily: font.sansMedium, fontSize: 17, color: color.textPrimary, textAlign: 'left' },
  groupNote: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'right' },

  lifts: { paddingBottom: 14 },
  lift: { paddingVertical: 10 },
  liftName: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, marginBottom: 8, textAlign: 'left' },

  rungs: { flexDirection: 'row', gap: 8 },
  rung: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: color.borderControl },
  rungOn: { backgroundColor: color.accent, borderColor: color.accent },
  /* ⛔ `rungHere` is DELETED with the middle rung it dressed (device QA 2026-08-23) — the absence
     of a decision is now the absence of a lit chip, not a third control. */
  // A refusal is not an accent — it is the one rung that takes work away, and it reads as itself.
  rungNo: { backgroundColor: color.textMuted, borderColor: color.textMuted },
  rungText: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, textAlign: 'center' },
  rungTextOn: { color: color.onPaper },

  refusal: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, marginTop: 12, textAlign: 'left' },
  /* At the TOP of the list now (marginTop 22 → 0/14): the rule reads before the objects it governs. */
  note: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, marginTop: 4, marginBottom: 14, textAlign: 'left' },
});
