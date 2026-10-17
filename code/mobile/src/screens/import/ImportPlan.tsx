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

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Arrive, Button } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { currentLocale } from '@/i18n';
import { color, font, space } from '@/design/tokens';
import { runImport, type ImportResult } from '@/domain/runImport';
import { applySuggestion, toProgram, reviewFindings } from '@/domain/importedPlan';
import { startImport, settledImport, clearImport, watchImport } from '@/domain/pendingImport';
import { balanceAuthoredWeek, type BalanceChange } from '@/data/api/fixtureModel';
import { exerciseDisplayName } from '@/data/exercises';
import type { Program } from '@/data/local/models';
import { askCoach } from '@/platform/coach/coachClient';
import { pickCoachImages } from '@/platform/coach/coachImage';
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
 *
 * ⛔ AND A LINE WITH A SET COUNT IS A LIFT, NEVER A DAY'S NAME (audit, 2026-08-18). The first
 * non-blank line of every block was taken as the session name whatever it said, so an athlete who
 * pasted "Bench 4x8 / Squat 5x5 / …" straight out of a message thread — no headers, because nobody
 * writes headers in a message — lost her first exercise into the day's TITLE. Her programme came
 * back one lift short, with the missing one printed as a heading, and nothing said it had happened:
 * a silent edit to her week, by the one feature that exists to refuse silent edits. A line carrying
 * a sets×reps pair is a lift; the day is then simply numbered.
 */
/** The sets×reps mark: `4x8`, `4 x 8`, `4x`, `4 sets`. The count is the FIRST number of the pair. */
const SETS_MARK = /(\d{1,2})\s*(?:x|×|\s+sets?\b)/i;

export function parseTypedPlan(text: string): { sessions: { name: string; lifts: { name: string; sets?: number }[] }[] } {
  const sessions: { name: string; lifts: { name: string; sets?: number }[] }[] = [];
  let current: { name: string; lifts: { name: string; sets?: number }[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    if (!current && !SETS_MARK.test(line)) {
      current = { name: line, lifts: [] };
      sessions.push(current);
      continue;
    }
    if (!current) {
      // She wrote no header for this block. "Day 1" is a name we made up ABOUT the day, which is
      // honest; taking her bench press for the title would have been a name made up out of her week.
      current = { name: `Day ${sessions.length + 1}`, lifts: [] };
      sessions.push(current);
    }
    const m = line.match(SETS_MARK);
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
  route?: { params?: { inputs?: unknown; fromOnboarding?: boolean; review?: boolean; coachAsk?: string } };
}) {
  const { t } = useCopy();
  /* ⛔ THIS WAS `const { t, locale } = useCopy()` — and `useCopy` returns no `locale`, so it was
     `undefined` on every device and `locale === 'he'` was false for every Hebrew athlete: her
     import ran in English no matter what her app spoke. `@ts-nocheck` hid it from the day the
     screen was written. `currentLocale()` is the app's actual language, one import away. */
  const locale = currentLocale();
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
  /*
   * ⛔ IT USED TO START THE READ AND CALL `goBack()` IN THE SAME BREATH — AND THAT IS THE BUG THE
   * FOUNDER MET (2026-08-29): *"בניתי תוכנית עם gemini ושלחתי את זה לאפשרות של צילום תוכנית האימון
   * וזה לא עובד זה ישר יוצא מהמסך."*
   *
   * The read was working. Nothing on the screen said so: she picked a photograph, the screen
   * dismissed itself instantly, `busy` was never set on this path, `Start` shows no pending state,
   * and the report only surfaces minutes later on the build step. An instant silent dismissal is
   * indistinguishable from a crash, and it is worse than one — a crash at least tells her to try
   * again, while this taught her the feature is broken.
   *
   * ⚠️ THE 08-11 RULING IS KEPT, NOT REVERSED. *"בזמן שהבינה מייבאת את התוכנית שלו הוא עובר את
   * תהליך הONBORDING"* — the work still lives in `pendingImport`, a module precisely so it survives
   * screen transitions, and she may still walk away and meet the report on the build step. What
   * changed is that the screen no longer walks away FOR her: it stays, watches the same pending
   * read, and shows the phase it is in and then the report itself.
   *
   * ⚠️ AND `startImport` NO-OPS ON A SECOND CALL, which used to be invisible for the same reason:
   * photograph → exit → come back → photograph again started nothing at all and dismissed the
   * screen anyway. Standing still makes the running state the thing she sees, and the control that
   * would have started a second read is disabled while it runs.
   */
  const startAndWatch = (input: Parameters<typeof runImport>[1]) => {
    setFailed(null);
    setBusy(true);
    setPhase('reading');
    startImport(askCoach as never, { ...input, locale: locale === 'he' ? 'he' : 'en' });
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

  /**
   * ⛔ SHE ACCEPTED A SUGGESTION. Repair the MATCH and rebuild from it — never append a slot to the
   * programme, because the match still knows which session she wrote the lift in, in what order and
   * with what set count, and the programme no longer does.
   *
   * ⚠️ THE FINDINGS ARE RECOMPUTED TOO. "I couldn't find X" has to stop being on screen the moment X
   * is in her week, or the report contradicts the programme underneath it.
   */
  const accept = (name: string, exerciseId: string) => {
    setResult((prev) => {
      if (!prev?.ok) return prev;
      const matched = applySuggestion(prev.matched, name, exerciseId);
      if (matched === prev.matched) return prev; // nothing carried that name — say nothing, do nothing
      const program = toProgram(matched);
      return {
        ...prev,
        matched,
        program,
        findings: reviewFindings(matched, program),
        suggestions: prev.suggestions.filter((sg) => sg.name !== name),
        // ⚠️ COUNTED THE WAY `runImport` COUNTS THEM — what was READ, not what survived matching.
        // Two definitions of "9 exercises" in one flow is how the figure starts moving when she
        // accepts a suggestion that changed nothing about how much of her sheet we read.
        sessionCount: matched.sessions.length,
        liftCount: matched.sessions.reduce((n, s) => n + s.lifts.length, 0),
      };
    });
  };

  const photograph = async () => {
    /*
     * ⚠️ WRAPPED, BECAUSE THE PICKER CAN REJECT. `pickCoachImages` opens a native module and then
     * decodes a full-resolution photograph; a HEIC the manipulator refuses, or a module missing
     * from an older binary under an OTA update, threw into a `void`ed promise — no message, no
     * spinner, nothing. Silence was already this screen's whole defect; it does not get a second
     * way to be silent.
     */
    let picked;
    try {
      picked = await pickCoachImages();
    } catch {
      setFailed(t('import.fail.unreadable'));
      return;
    }
    if (!picked?.length) return; // she backed out — not a failure, and never reported as one
    if (fromOnboarding) return startAndWatch({ images: picked });
    await run({ images: picked });
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

  /*
   * ⛔ THE SCREEN WATCHES THE READ IT STARTED (2026-08-29) — the other half of the fix at
   * `startAndWatch`.
   *
   * `pendingImport` already published a phase, a partial report and a settled result to anyone who
   * asked; nothing ever asked. This subscribes for as long as the screen is mounted, so the
   * onboarding path shows exactly what the inline path has always shown — "reading your plan",
   * then "matching", then the report — while the work itself stays in the module and survives her
   * walking away.
   *
   * ⚠️ IT DRIVES `busy`/`phase`/`result`/`failed` ONLY WHILE THE MODULE IS DOING SOMETHING. `idle`
   * is left alone deliberately: `clearImport` sets it, and reacting to that would wipe a report the
   * athlete is reading at the moment she adopts it.
   */
  useEffect(() => {
    if (!fromOnboarding) return;
    return watchImport((st) => {
      if (st.phase === 'running') {
        setBusy(!st.partial);
        setPhase(st.step);
        if (st.partial) setResult(st.partial);
        return;
      }
      if (st.phase === 'done') {
        setBusy(false);
        setPhase(null);
        if (st.result.ok) setResult(st.result);
        else setFailed(t(`import.fail.${st.result.reason}`));
      }
    });
  }, [fromOnboarding, t]);
  const onboardingInputs = route?.params?.inputs;
  const keepThis = async (program: Program) => {
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
    /*
     * ════════════════════════════════════════════════════════════════════════════════════════
     * ⛔ WHERE SHE GOES DEPENDS ON HOW MUCH OF HER WE KNOW, AND THE FORK KNEW NOTHING.
     *
     * Three doors reach this line and they are not the same situation:
     *
     *   · FROM THE INTAKE'S BUILD STEP (`review: true`) the relay exists — every question has been
     *     answered — so she goes forward to the screen that names her programme.
     *   · FROM THE PROFILE she already has an account and a week; `goBack` puts her on the screen
     *     she came from, now showing hers.
     *   · ⛔ FROM THE FORK (`Start` → *"כבר יש לי אחת"*) THERE IS NO RELAY AT ALL, and until
     *     2026-08-30 this fell to `goBack` — **which is the fork.** She photographed her programme,
     *     watched it read, pressed "keep mine", and landed back on *"איפה מתחילים?"* with an
     *     authored week on disk, no profile, and nothing on screen acknowledging any of it. Then
     *     whichever door she pressed next either overwrote the week (`saveBuiltProgram` is
     *     deliberately ungated) or revealed a different one she would never train.
     *
     *     It was invisible while this screen dismissed itself the instant the read STARTED — the
     *     adoption happened minutes later, on the build step, where the relay does exist. Making
     *     the screen stay (the founder's *"זה ישר יוצא מהמסך"*) moved the adoption to the fork and
     *     brought its missing relay with it.
     *
     * She has answered nothing yet, so she carries on INTO the intake — and `PlanBuilder` now sees
     * the authored week on disk and takes her straight to the reveal rather than offering three
     * doors to rewrite it.
     * ════════════════════════════════════════════════════════════════════════════════════════
     */
    if (onboardingInputs) {
      /* ⚠️ RE-STAMPED FROM THE WEEK SHE ACTUALLY BROUGHT, exactly as `PlanBuilder.onSave` does.
         `daysPerWeek` on the relay is whatever she answered at the ask step; her coach's sheet may
         say something else, and the WEEK is the later and truer answer. Everything downstream cuts
         from it — the first bucket, the week notice, the emphasis budget. */
      const days = program.days.filter((d) => !d.isRest).length;
      navigation?.replace?.('ProgramCreated', {
        inputs: { ...(onboardingInputs as Record<string, unknown>), ...(days > 0 ? { daysPerWeek: days } : {}) },
      });
      return;
    }
    if (fromOnboarding) {
      navigation?.navigate?.('AboutYou');
      return;
    }
    navigation?.goBack?.();
  };
  const keep = () => (result?.ok ? keepThis(result.program) : undefined);

  /**
   * ⛔ "NO — CARRY ON WITH THE ONE YOU BUILT ME" (founder 2026-08-30).
   *
   * This screen can ARRIVE UNINVITED: she photographed a sheet at the fork, walked on into the
   * intake, chose who writes her week, and the landed import replaced the build she was watching.
   * Both other acts adopt the photograph — so without this, a picture she may have taken of the
   * wrong page silently overrides the door she chose three minutes earlier, and the only way out
   * was an edge swipe back to step 2 of 3.
   *
   * ⚠️ IT DISCARDS THE READ RATHER THAN DEFERRING IT. `clearImport` means the build step will not
   * meet it a second time — being asked twice about a photograph she has already declined is the
   * same interruption wearing a second face.
   *
   * ⚠️ AND IT RETURNS HER TO THE SAME BUILD, `coachAsk` included: nothing is spent yet (the build
   * waits for a running import before it calls the model), so this is the first and only call, on
   * exactly the sentence she typed.
   */
  const declineImport = () => {
    clearImport();
    navigation?.replace?.('BuildingProgramme', {
      inputs: onboardingInputs,
      ...(route?.params?.coachAsk != null ? { coachAsk: route.params.coachAsk } : {}),
    });
  };

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
          {...(reviewPending && onboardingInputs ? { onDecline: declineImport } : {})}
          suggestions={result.suggestions}
          onAccept={accept}
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
        {/*
          ✦ IT ARRIVES (2026-08-27). `Arrive` was built for the founder's largest note — a screen
          should ARRIVE, not appear (2026-08-12) — and reached six screens out of forty-seven. This
          one asks an athlete to hand her OWN programme to a stranger's app; the two ways in should
          land after the sentence that promises what will happen to it, not beside it. Three beats:
          the promise, the camera, the page she can type.
        */}
        <Arrive order={0}>
          <Text style={styles.title}>{t('import.title')}</Text>
          <Text style={styles.sub}>{t('import.sub')}</Text>
        </Arrive>

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
        <Arrive order={1}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('import.photograph')}
            onPress={() => void photograph()}
            disabled={busy}
            style={({ pressed }) => [styles.shot, pressed && styles.shotPressed, busy && styles.shotBusy]}
          >
            {/*
              ⚠️ IT WORE THE EXPORT MARK. `share` is documented in `components/Icon` as "a tray with an
              arrow OUT of it — sending a plan link", and it sat at the centre of the control for
              bringing a programme IN. The arrow pointed the wrong way through the whole feature.
              There is no camera in the `IconName` union, so this is the plus inside the dashed frame —
              the affordance every phone uses for "put something here", and the frame around it is
              already the shape of the photograph.
            */}
            <View style={styles.shotMark}>
              <Icon name="camera" size={26} color={color.up} strokeWidth={1.9} />
            </View>
            <Text style={styles.shotTitle}>{t('import.photograph')}</Text>
            <Text style={styles.shotSub}>{t('import.photographSub')}</Text>
          </Pressable>
        </Arrive>

        <Arrive order={2}>
          <Text style={styles.or}>{t('import.or')}</Text>
        </Arrive>

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
              onPress={() => (fromOnboarding ? startAndWatch({ week: parseTypedPlan(typed) }) : void run({ week: parseTypedPlan(typed) }))}
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
  /* ⚠️ EVERY TEXT STYLE HERE DECLARES ITS ALIGNMENT (lint-rtl rule 2). An omitted `textAlign` is
     iOS's `natural`, which RN does not flip — so the whole import flow froze to the left edge in
     Hebrew, on the one screen an athlete arrives at holding her coach's sheet. 'left' IS the
     logical start and mirrors; 'center' where the container centres. */
  title: { fontFamily: font.serifMedium, fontSize: 34, color: color.textPrimary, lineHeight: 42, textAlign: 'left' },
  sub: { fontFamily: font.sans, fontSize: 20, color: color.textDim, marginTop: 12, lineHeight: 28, textAlign: 'left' },
  /* ⛔ THE CAMERA FRAME — see the note at the markup. Dashed, moss, and the tallest thing here. */
  shot: {
    marginTop: 30,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 26,
    borderRadius: 22,
    /*
     * ════════════════════════════════════════════════════════════════════════════════════════
     * ⛔ THE DASHED BORDER IS GONE (2026-08-27), AND THE `+` WENT WITH IT.
     *
     * A dashed rectangle with a plus in the middle is the DESKTOP FILE-DROP idiom — it is what a
     * web upload widget looks like, and its meaning is "drag something here / empty slot / not
     * filled in yet". **There is no drag-and-drop on a phone.** She taps it. So the borrowed
     * metaphor bought nothing and cost the screen its confidence: one of the two ways an athlete
     * can bring her OWN programme into this product was drawn as a vacancy.
     *
     * ⚠️ AND IT IS THE SAME RULING THE FOUNDER ALREADY MADE ABOUT INPUTS (2026-07-12): *"the
     * bordered well read as a generic form field — the one place the instrument looked like
     * everybody else's app."* The dotted drop-zone is that pattern's twin. This product's material
     * is a hairline and a wash, and a primary path is drawn in it like everything else it offers.
     *
     * The moss stays: this is where a decision lands, and moss is the colour of a decision here.
     * What changes is that the card now looks like a thing you press rather than a hole to fill.
     * ════════════════════════════════════════════════════════════════════════════════════════
     */
    borderWidth: 1,
    borderColor: 'rgba(169,196,159,0.42)',
    backgroundColor: 'rgba(169,196,159,0.07)',
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
    textAlign: 'left',
    textAlignVertical: 'top',
  },
  waiting: { marginTop: 18, alignItems: 'center' },
  waitingText: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, marginTop: 10, textAlign: 'center' },
  changeLine: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, marginTop: 10, lineHeight: 22, textAlign: 'left' },
  failed: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, marginTop: 16, paddingHorizontal: space.gutter, textAlign: 'left' },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 20, gap: 8 },
  sendMine: { paddingVertical: 14, alignItems: 'center', borderRadius: 14 },
  /* ⛔ A WASH, NEVER A FADE (A.13) — written as `opacity: 0.7` and caught in the same run. */
  sendMinePressed: { backgroundColor: 'rgba(169,196,159,0.12)' },
  sendMineLabel: { fontFamily: font.sansMedium, fontSize: 19, color: color.up, textAlign: 'center' },
});

export default ImportPlan;
