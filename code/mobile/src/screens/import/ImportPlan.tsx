/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PROGRAMME SHE ALREADY HAS — the door.
 *
 * ⛔ FOUNDER, 2026-08-11: *"אני רוצה לאפשר לאנשים להעלות תוכנית קיימת שלהם."*
 *
 * Two ways in, and the order on the screen is the order of how people actually arrive:
 *
 *   · a PHOTOGRAPH — of a coach's sheet, a screenshot, a page from a notebook. This is the common
 *     case and it is why the AI is in this feature at all;
 *   · TYPED — because a paste from a message thread is one tap and needs no model at all.
 *
 * ⚠️ WHAT THIS SCREEN DOES NOT DO: it does not decide anything. It collects, calls `runImport`, and
 * hands the result to `ImportReview`. Every promise in this feature — her set counts survive, her
 * order survives, nothing is fixed silently — lives in the domain and is tested there. This file is
 * the part that can be redesigned without touching any of it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, font, space } from '@/design/tokens';
import { runImport, type ImportResult } from '@/domain/runImport';
import { startImport, settledImport, clearImport } from '@/domain/pendingImport';
import { balanceAuthoredWeek, type BalanceChange } from '@/data/api/fixtureModel';
import { exerciseDisplayName } from '@/data/exercises';
import type { Program } from '@/data/local/models';
import { askCoach } from '@/platform/coach/coachClient';
import { pickCoachImage } from '@/platform/coach/coachImage';
import { ImportReview } from './ImportReview';
import { useApp } from '@/state/stores/appStore';

/**
 * Her typed programme → the shape the domain reads.
 *
 * ⛔ DELIBERATELY DUMB, and it must stay that way. A blank line starts a session; a line that is not
 * blank is a lift, and a trailing `4x8` or `4 x 8` or `4 sets` is its set count. Anything cleverer
 * here is a second parser competing with the model's, in a file nobody tests as hard.
 *
 * ⚠️ THE SET COUNT IS ONLY TAKEN WHEN IT IS UNAMBIGUOUS. "Bench 4x8" is four sets of eight. "Bench
 * 8-10 reps" has no set count, and must come back WITHOUT one so the review asks her — a guess here
 * is a number she never wrote, which is the one thing this feature cannot do.
 */
export function parseTypedPlan(text: string): { sessions: { name: string; lifts: { name: string; sets?: number }[] }[] } {
  const sessions: { name: string; lifts: { name: string; sets?: number }[] }[] = [];
  let current: { name: string; lifts: { name: string; sets?: number }[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    if (!current) {
      current = { name: line, lifts: [] };
      sessions.push(current);
      continue;
    }
    // `4x8`, `4 x 8`, `4x`, `4 sets` — the set count is the FIRST number of a sets×reps pair.
    const m = line.match(/(\d{1,2})\s*(?:x|×|\s+sets?\b)/i);
    const name = line.replace(/[\s—–-]*\d{1,2}\s*(?:x|×)\s*\d{0,3}.*$/i, '').replace(/[\s—–-]*\d{1,2}\s+sets?.*$/i, '').trim();
    const sets = m ? Number(m[1]) : undefined;
    if (name) current.lifts.push({ name, ...(sets && sets > 0 ? { sets } : {}) });
  }
  return { sessions: sessions.filter((s) => s.lifts.length > 0) };
}

export function ImportPlan({
  navigation,
  route,
}: {
  navigation?: { goBack?: () => void; navigate?: (name: string, params?: unknown) => void; replace?: (name: string, params?: unknown) => void };
  route?: { params?: { inputs?: unknown; fromOnboarding?: boolean; review?: boolean } };
}) {
  const { t, locale } = useCopy();
  const app = useApp();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [phase, setPhase] = useState<'reading' | 'matching' | null>(null);
  const [balanced, setBalanced] = useState<{ program: Program; changes: BalanceChange[] } | null>(null);

  /*
   * ⛔ THE REPORT LANDS AS SOON AS IT EXISTS, and the leftovers call finishes underneath it.
   *
   * `onReady` fires the moment the local match is done — which is the whole programme and the whole
   * report. She starts reading immediately; the suggested alternatives for the handful of names we
   * could not place arrive a few seconds later and update the screen she is already on. On the typed
   * path where everything matched there is no call at all, and this is instant.
   *
   * ⚠️ `busy` IS CLEARED BY `onReady`, NOT BY THE PROMISE. Leaving it set until the second call
   * resolves would mean the buttons on a fully-rendered report stayed disabled while we waited for
   * something optional — which is the exact friction the callback exists to remove.
   */
  /*
   * ⛔ FROM THE INTAKE, SHE DOES NOT WAIT HERE AT ALL (founder 2026-08-11).
   *
   * The whole point of the door being on the first question is that the read runs UNDERNEATH the
   * rest of onboarding. So from onboarding this screen hands the work to `pendingImport` and sends
   * her straight back to the intake — the report is met later, on the build step, which is a waiting
   * screen already.
   *
   * From the PROFILE there is no intake to get on with, so it runs inline and shows the report here.
   */
  const startAndReturn = (input: Parameters<typeof runImport>[1]) => {
    startImport(askCoach as never, { ...input, locale: locale === 'he' ? 'he' : 'en' });
    navigation?.goBack?.();
  };

  const run = async (input: Parameters<typeof runImport>[1]) => {
    setBusy(true);
    setPhase('reading');
    setFailed(null);
    const out = await runImport(askCoach as never, {
      ...input,
      locale: locale === 'he' ? 'he' : 'en',
      onPhase: setPhase,
      onReady: (partial) => {
        setResult(partial);
        setBusy(false);
      },
    });
    setBusy(false);
    setPhase(null);
    if (!out.ok) {
      setFailed(t(`import.fail.${out.reason}`));
      return;
    }
    setResult(out);
  };

  const photograph = async () => {
    const img = await pickCoachImage();
    if (!img) return; // she backed out — not a failure, and never reported as one
    if (fromOnboarding) return startAndReturn({ images: [img] });
    await run({ images: [img] });
  };

  /*
   * ⛔ "KEEP MINE" IS THE WHOLE FEATURE. It saves the programme exactly as `runImport` built it —
   * stamped `authored`, which `engineMayRebuild` then reads for ever. Nothing between here and disk
   * touches its shape.
   */
  /*
   * ⛔ WHERE SHE GOES AFTERWARDS IS THE END OF THE CHAIN, AND IT DIFFERS BY DOOR.
   *
   * From the PROFILE she already has an account and a week; adopting replaces it and `goBack` puts
   * her on the screen she came from, which now shows her programme.
   *
   * From ONBOARDING the intake is not finished — no profile has been written and the app is still
   * inside the onboarding navigator. Going "back" would strand her on the body map with a programme
   * already saved and no way to complete. So she goes FORWARD to `BuildingProgramme` with the relay
   * this screen was handed, which writes her profile and leaves the intake — and thanks to
   * `engineMayRebuild` reading the week already on disk, it builds nothing over the top of it.
   */
  /*
   * Opened from the intake? There is no `inputs` relay any more — the build step reads the pending
   * import from the module — so this is simply "am I inside onboarding", which the caller states.
   */
  const fromOnboarding = !!route?.params?.fromOnboarding;
  /*
   * The build step sends her back here once the pending import has landed — see
   * `BuildingProgramme`. The screen then opens straight on the report rather than on the collector.
   */
  const reviewPending = !!route?.params?.review;
  useEffect(() => {
    if (!reviewPending) return;
    void settledImport().then((r) => {
      if (r?.ok) setResult(r);
      else if (r) setFailed(t(`import.fail.${r.reason}`));
    });
  }, [reviewPending, t]);
  const onboardingInputs = route?.params?.inputs;
  const keepThis = async (program) => {
    setBusy(true);
    await app.adoptImportedProgram(program);
    setBusy(false);
    /*
     * ⛔ THE INTAKE IS NOT FINISHED YET. `ProgramCreated`'s own CTA is what calls
     * `completeOnboarding`, and that call now reads the week already on disk and builds nothing over
     * it (`engineMayRebuild`). So she goes FORWARD to the screen that names her programme, exactly
     * as a generated week does — the only difference is whose week it is.
     */
    clearImport();
    if (onboardingInputs) navigation?.replace?.('ProgramCreated', { inputs: onboardingInputs });
    else navigation?.goBack?.();
  };
  const keep = () => (result?.ok ? keepThis(result.program) : undefined);

  /*
   * ⚠️ SHE SEES WHAT CHANGED BEFORE IT IS SAVED. `balanceAuthoredWeek` can REMOVE a lift when a day
   * cannot fit any other way — a real change to her coach's programme, made at her request, and one
   * she is owed the sentence for. So the result is put back on the review rather than written
   * straight to disk, and the findings become the list of what we did.
   */
  const balance = async () => {
    if (!result?.ok) return;
    setBusy(true);
    const { program, changes } = balanceAuthoredWeek(result.program, app.profile?.bodyMap);
    setBusy(false);
    setBalanced({ program, changes });
  };

  if (balanced) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t('import.balancedTitle')}</Text>
          <Text style={styles.sub}>
            {balanced.changes.length === 0 ? t('import.balancedNothing') : t('import.balancedCount', { n: balanced.changes.length })}
          </Text>
          {balanced.changes.map((c, i) => (
            <Text key={`${c.exerciseId}-${i}`} style={styles.changeLine}>
              {c.kind === 'lift_removed'
                ? t('import.changeRemoved', { name: exerciseDisplayName(c.exerciseId), day: c.day })
                : t(c.kind === 'sets_trimmed' ? 'import.changeTrimmed' : 'import.changeRaised', {
                    name: exerciseDisplayName(c.exerciseId),
                    from: c.from,
                    to: c.to,
                  })}
            </Text>
          ))}
        </ScrollView>
        <View style={styles.footer}>
          <Button
            variant="primary"
            size="lg"
            block
            label={t('import.useBalanced')}
            onPress={() => void keepThis(balanced.program)}
            disabled={busy}
          />
          <View style={{ height: 10 }} />
          {/* Her original is one tap away, and it is still exactly what she brought. */}
          <Button variant="ghost" size="lg" block label={t('import.backToMine')} onPress={() => setBalanced(null)} disabled={busy} />
        </View>
      </SafeAreaView>
    );
  }

  if (result?.ok) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ImportReview
          title={result.title}
          sessionCount={result.sessionCount}
          liftCount={result.liftCount}
          findings={result.findings}
          onKeep={() => void keep()}
          /*
           * ⛔ BALANCE MINE — her structure, our arithmetic. `balanceAuthoredWeek` keeps every
           * decision that was hers (which exercises, which days, what order) and fixes only what the
           * report named: a session past her hour, a muscle under the dose. It stays `authored`, so
           * one adjustment is not the same as handing the week over.
           */
          onBalance={() => void balance()}
          busy={busy}
        />
        {failed ? <Text style={styles.failed}>{failed}</Text> : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/*
        ⛔ THERE WAS NO WAY BACK (founder, 2026-08-12: *"רק תוודא שיש כפתור חזרה אחורה כי אני לא
        רואה כזה במסך"*). Opened from You it is a pushed screen with the platform's own gesture and
        nothing drawn; opened from onboarding it had neither. A screen that can be entered and not
        left is the one shape a modal must never take.
      */}
      {navigation?.goBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => navigation?.goBack?.()}
          hitSlop={10}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={2} />
        </Pressable>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('import.title')}</Text>
        <Text style={styles.sub}>{t('import.sub')}</Text>

        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ THE CAMERA IS THE SCREEN, NOT A BUTTON ON IT (founder, 2026-08-12)

            *"מסך עצום שהכל דחוס למעלה שוב. תתפרש על המסך הזה ותעצב אותו — במקום חלונית של לצלם
            תעשה פקד ענק של תמונה שלחיצה עליו פותחת את האפשרות לעלות תמונה."*

          Photographing the sheet is what this screen is FOR — typing it out is the fallback for
          someone with no paper. It was a 56-point button with the fallback given twice the room
          underneath it, and four hundred points of black below both.

          A frame she taps: dashed, the shape of the thing she is about to put in it, tall enough
          to be the subject of the page. The typed box keeps its place beneath the "or", smaller
          than the act it is an alternative to.
          ════════════════════════════════════════════════════════════════════════════════════════
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('import.photograph')}
          onPress={() => void photograph()}
          disabled={busy}
          style={({ pressed }) => [styles.shot, pressed && styles.shotPressed, busy && styles.shotBusy]}
        >
          <View style={styles.shotMark}>
            <Icon name="share" size={26} color={color.up} strokeWidth={2} />
          </View>
          <Text style={styles.shotTitle}>{t('import.photograph')}</Text>
          <Text style={styles.shotSub}>{t('import.photographSub')}</Text>
        </Pressable>

        <Text style={styles.or}>{t('import.or')}</Text>

        {/*
          ⛔ THE TYPED PATH IS THE SAME KIND OF THING (founder, 2026-08-12: *"גם למסך הכתיבה תעצב את
          זה באותה צורה כי זה נראה חיוור לידו"*). A hairline box beside a dashed moss frame reads as
          a disabled field, not as the other way in. Same radius, same rim, same wash — the two
          differ in what they ASK for, not in how much they matter.

          ⛔ AND "READ MINE" LEFT THE FOOTER WITH IT. It sat at the very bottom of a scrolling page,
          three hundred points below the box it acted on, disabled until she typed — *"מי רואה את זה
          בכלל?"* The act belongs against the thing it acts on, and it appears when there is
          something to act on.
        */}
        <View style={[styles.typeBox, typed.trim().length > 0 && styles.typeBoxOn]}>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            multiline
            placeholder={t('import.typePlaceholder')}
            placeholderTextColor={color.textDisabled}
            editable={!busy}
            accessibilityLabel={t('import.typeLabel')}
          />
          {typed.trim().length > 0 ? (
            <Button
              variant="primary"
              size="lg"
              block
              label={t('import.readMine')}
              onPress={() => (fromOnboarding ? startAndReturn({ week: parseTypedPlan(typed) }) : void run({ week: parseTypedPlan(typed) }))}
              disabled={busy}
            />
          ) : null}
        </View>

        {busy ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={color.textPrimary} />
            {/* One honest sentence about what is happening, rather than a spinner that says nothing. */}
            {phase ? <Text style={styles.waitingText}>{t(`import.phase.${phase}`)}</Text> : null}
          </View>
        ) : null}
        {failed ? <Text style={styles.failed}>{failed}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        {/*
          ⛔ AND THE OTHER DIRECTION LIVES HERE (founder, 2026-08-12). He merged "bring" and "send"
          into one door on the You screen — *"אני רוצה שתאחד לפקד אחד יפה וגדול"* — and one door has
          to reach both acts. A fork at the tap (`hasPlan ? Share : Import`) read well and locked an
          athlete who already had a week out of the importer entirely.
        */}
        {!fromOnboarding && navigation?.navigate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('planShare.title')}
            /* ⚠️ WRITTEN PLAINLY so `everyScreenIsReachable` can see it — the optional-chained
               form is a door the graph scanner cannot find, which is the same as no door. */
            onPress={() => navigation?.navigate ? navigation.navigate('SharePlan') : undefined}
            style={({ pressed }) => [styles.sendMine, pressed && styles.sendMinePressed]}
          >
            <Text style={styles.sendMineLabel}>{t('planShare.title')}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { paddingHorizontal: space.gutter, paddingTop: 20, paddingBottom: 32 },
  title: { fontFamily: font.serifMedium, fontSize: 34, color: color.textPrimary, lineHeight: 42 },
  sub: { fontFamily: font.sans, fontSize: 20, color: color.textDim, marginTop: 12, lineHeight: 28 },
  /* ⛔ THE CAMERA FRAME — see the note at the markup. Dashed, moss, and the tallest thing here. */
  shot: {
    marginTop: 30,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 26,
    borderRadius: 22,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(169,196,159,0.45)',
    backgroundColor: 'rgba(169,196,159,0.06)',
  },
  shotPressed: { backgroundColor: 'rgba(169,196,159,0.14)' },
  shotBusy: { opacity: 0.5 },
  shotMark: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(169,196,159,0.14)',
  },
  shotTitle: { fontFamily: font.sansSemibold, fontSize: 24, lineHeight: 30, color: color.textPrimary, textAlign: 'center' },
  shotSub: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textMuted, textAlign: 'center', maxWidth: 280 },
  or: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'center', marginVertical: 22 },
  back: { alignSelf: 'flex-start', margin: 12, padding: 8, borderRadius: 20 },
  backPressed: { backgroundColor: 'rgba(241,238,229,0.08)' },
  /* ⛔ THE OTHER WAY IN, at the same weight — see the note at the markup. */
  typeBox: {
    gap: 16,
    padding: 16,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(241,238,229,0.16)',
    backgroundColor: 'rgba(241,238,229,0.03)',
  },
  typeBoxOn: { borderColor: 'rgba(169,196,159,0.45)', backgroundColor: 'rgba(169,196,159,0.06)' },
  input: {
    minHeight: 200,
    fontFamily: font.sans,
    fontSize: 19,
    lineHeight: 26,
    color: color.textPrimary,
    textAlignVertical: 'top',
  },
  waiting: { marginTop: 18, alignItems: 'center' },
  waitingText: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, marginTop: 10 },
  changeLine: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, marginTop: 10, lineHeight: 22 },
  failed: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, marginTop: 16, paddingHorizontal: space.gutter },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 20, gap: 8 },
  sendMine: { paddingVertical: 14, alignItems: 'center', borderRadius: 14 },
  /* ⛔ A WASH, NEVER A FADE (A.13) — written as `opacity: 0.7` and caught in the same run. */
  sendMinePressed: { backgroundColor: 'rgba(169,196,159,0.12)' },
  sendMineLabel: { fontFamily: font.sansMedium, fontSize: 19, color: color.up, textAlign: 'center' },
});

export default ImportPlan;
