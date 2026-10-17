/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PEN, WRITING SOMEBODY ELSE'S WEEK — the plan builder in for-mode. (the coach track, 2026-09-17)
 *
 * ⛔ RULING 2: the coach works in the app, with *the same builder, a "for" header and the trainee's
 * facts*. So this is not a second editor. It is `PlanBuilderView` — the same rows, the same algebra,
 * the same demonstrations, the same clock and advice — handed a `forAthlete` and a container whose
 * every write goes to the WIRE.
 *
 * ── ⛔ NOTHING HERE MAY TOUCH THE PROGRAMME ON THIS PHONE ─────────────────────────────────────────
 * The phone in the coach's hand is also, very often, a phone he trains with. The week on its disk is
 * HIS. A for-mode that shared `PlanBuilder`'s container would share `saveBuiltProgram`, the pen-back,
 * the draft opened from `db.loadProgram()` and the model call built from `app.profile` — and one
 * wrong branch would send a trainee's week into the coach's own Today, or build her week from HIS
 * bodyweight. So this container does not import the app store, the database or the builder's
 * container at all. It reads the trainee's facts from its params, writes the draft to React state,
 * and its only exits are `coachSendWeek` and `coachSaveTemplate`.
 * `aCoachWritingForSomeoneNeverTouchesHisOwnWeek` pins that by source and by render.
 *
 * ── BOUNDS ARE REFUSED, WITH WORDS ───────────────────────────────────────────────────────────────
 * `sendableWeek` asks every bound of §3 before a send, and each refusal is drawn under the button
 * naming the day it is about — a 41-character day name would otherwise reach the server and come
 * back as a bare `bad_week`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainParamList } from '@/app/navigation';
import { BottomSheet } from '@/components/BottomSheet';
import { Button, TextField, useToast } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { currentLocale } from '@/i18n';
import { color, font } from '@/design/tokens';
import { exerciseDisplayName } from '@/data/exercises';
import type { Program } from '@/data/local/models';
import { PlanBuilderView } from '@/screens/plan/PlanBuilder';
import { addDay, blankDraft, builderAdvice } from '@/domain/planBuilder';
import { materializeTemplate, templateById } from '@/domain/planTemplates';
import { draftFromCoachWeek } from '@/domain/coachDraft';
import { draftFromWire, draftWithoutPassport, sendableWeek, weekProblems, type WeekProblem } from '@/domain/coachDesk';
import { runImport } from '@/domain/runImport';
import { requestPlanBuild } from '@/platform/coach/planBuild';
import { askCoach } from '@/platform/coach/coachClient';
import { pickCoachImages } from '@/platform/coach/coachImage';
import { coachSaveTemplate, coachSendWeek, coachTemplates, type CoachTemplate } from '@/platform/coachTrackClient';
import { track } from '@/platform/telemetry';

/** The server's name bound (`coach.ts` NAME_MAX) — a template name past it is refused there. */
export const TEMPLATE_NAME_MAX = 40;

type Props = NativeStackScreenProps<MainParamList, 'CoachWeekBuilder'>;

export function CoachWeekBuilder({ navigation, route }: Props) {
  const { t } = useCopy();
  const toast = useToast();
  const p = route.params;
  const who = p.name;

  const dayNamer = useCallback((letter: string) => t('builder.dayNamed', { letter }), [t]);

  /* The draft opens on the week already sent, when there is one — the coach came to change it. */
  const [draft, setDraft] = useState<Program | null>(() => (p.week ? draftFromWire(p.week, `coach_draft_${p.linkId}`).draft : null));
  const [buildBusy, setBuildBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [problems, setProblems] = useState<WeekProblem[]>([]);
  const [templates, setTemplates] = useState<CoachTemplate[]>([]);
  const [naming, setNaming] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void coachTemplates().then((r) => {
      if (alive && r.ok) setTemplates(r.value.templates);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* The problems are re-asked as she edits, but only once a send has been tried — a half-written
     week is not a list of faults, it is a week being written. */
  const [triedSend, setTriedSend] = useState(false);
  useEffect(() => {
    if (triedSend && draft) setProblems(weekProblems(draft));
  }, [draft, triedSend]);

  /* ── what is known of her, in words — "woman · 61 kg · 4 days" ── */
  const facts = useMemo(() => {
    const parts: string[] = [];
    if (p.sex) parts.push(t(p.sex === 'female' ? 'coachTrack.coach.pen.sexFemale' : 'coachTrack.coach.pen.sexMale'));
    if (p.bodyweightKg != null) parts.push(t('coachTrack.coach.pen.weightFact', { kg: p.bodyweightKg }));
    if (p.days) parts.push(t('coachTrack.coach.pen.daysFact', { count: p.days }));
    return parts.length ? parts.join(' · ') : t('coachTrack.coach.pen.noFacts');
  }, [p.sex, p.bodyweightKg, p.days, t]);

  const problemWords = (x: WeekProblem): string => {
    switch (x.kind) {
      case 'no_days': return t('coachTrack.coach.problem.noDays');
      case 'too_many_days': return t('coachTrack.coach.problem.tooManyDays', { n: x.n });
      case 'empty_day': return t('coachTrack.coach.problem.emptyDay', { day: x.day });
      case 'too_many_lifts': return t('coachTrack.coach.problem.tooManyLifts', { day: x.day, n: x.n });
      case 'day_name': return t('coachTrack.coach.problem.dayName', { day: x.day });
      case 'title_long': return t('coachTrack.coach.problem.titleLong');
      case 'note_long': return t('coachTrack.coach.problem.noteLong', { day: x.day, ex: exerciseDisplayName(x.ex) });
      case 'bad_lift': return t('coachTrack.coach.problem.badLift', { day: x.day, ex: exerciseDisplayName(x.ex) });
    }
  };

  /* ── door 2 · a sentence to the model, answered from HER facts — never this phone's profile ── */
  const onLetHushBuild = useCallback(
    (daysPerWeek: number, ask: string) => {
      setBuildBusy(true);
      setNotice(undefined);
      void requestPlanBuild({
        daysPerWeek,
        sex: p.sex === 'female' ? 'female' : 'male',
        ...(p.bodyweightKg != null ? { weightKg: p.bodyweightKg } : {}),
        ...(ask.trim() ? { ask: ask.trim() } : {}),
      })
        .then((res) => {
          const drafted = res.ok
            ? draftFromCoachWeek(res.week, { id: `coach_ai_${Date.now()}`, dayNamer: (i) => dayNamer(String.fromCharCode(65 + i)) })
            : null;
          if (!drafted) {
            setNotice(t('coachTrack.coach.pen.aiFailed'));
            return;
          }
          setDraft(draftWithoutPassport(drafted, drafted.id));
          void track('coach_week_door', { door: 'ai' });
        })
        .catch(() => setNotice(t('coachTrack.coach.pen.aiFailed')))
        .finally(() => setBuildBusy(false));
    },
    [p.sex, p.bodyweightKg, dayNamer, t],
  );

  /* ── door 3 · a photographed page — read, matched, and handed over as a DRAFT, never adopted ── */
  const onPhoto = useCallback(async () => {
    setNotice(undefined);
    const images = await pickCoachImages().catch(() => null);
    if (!images || images.length === 0) return;
    setPhotoBusy(true);
    const out = await runImport(askCoach as never, {
      images: images.map((i) => ({ mime: i.mime, data: i.data })),
      locale: currentLocale() === 'he' ? 'he' : 'en',
    }).catch(() => null);
    setPhotoBusy(false);
    if (!out || !out.ok) {
      setNotice(t('coachTrack.coach.pen.photoFailed'));
      return;
    }
    setDraft(draftWithoutPassport(out.program, `coach_photo_${Date.now()}`));
    void track('coach_week_door', { door: 'photo' });
  }, [t]);

  /* ── send ── */
  const onSend = useCallback(async () => {
    if (!draft || sending) return;
    setTriedSend(true);
    const s = sendableWeek(draft);
    if (!s.ok) {
      setProblems(s.problems);
      return;
    }
    setProblems([]);
    setSending(true);
    const r = await coachSendWeek(p.linkId, s.week);
    setSending(false);
    if (!r.ok) {
      toast.show(t(`coachTrack.coach.error.${r.error}`, { defaultValue: t('coachTrack.coach.error.network') }));
      return;
    }
    void track('coach_week_sent', { version: r.value.version, days: s.week.days.length });
    navigation.popTo('AthleteDetail', { linkId: p.linkId, name: who, sentVersion: r.value.version }, { merge: true });
  }, [draft, sending, p.linkId, who, navigation, toast, t]);

  /* ── save as a template ── */
  const onSaveTemplate = useCallback(async (name: string) => {
    if (!draft) return;
    const s = sendableWeek(draft);
    if (!s.ok) {
      setTriedSend(true);
      setProblems(s.problems);
      setNaming(null);
      return;
    }
    const r = await coachSaveTemplate(name.trim(), s.week);
    setNaming(null);
    if (!r.ok) {
      toast.show(t(`coachTrack.coach.error.${r.error}`, { defaultValue: t('coachTrack.coach.error.network') }));
      return;
    }
    toast.show(t('coachTrack.coach.pen.templateSaved', { name: name.trim() }));
    void coachTemplates().then((x) => { if (x.ok) setTemplates(x.value.templates); });
  }, [draft, toast, t]);

  return (
    <>
      <PlanBuilderView
        draft={draft}
        offerDoors={draft == null}
        savedIsAuthored={false}
        ownedIds={new Set<string>()}
        figure={p.sex === 'female' ? 'female' : 'male'}
        advice={draft ? builderAdvice(draft) : []}
        onExit={() => navigation.goBack()}
        onStartFromEngine={() => setDraft(blankDraft(`coach_blank_${Date.now()}`, dayNamer))}
        onStartBlank={() => {
          void track('coach_week_door', { door: 'blank' });
          setDraft(blankDraft(`coach_blank_${Date.now()}`, dayNamer));
        }}
        onStartTemplate={(id) => {
          const tpl = templateById(id);
          if (!tpl) return;
          void track('coach_week_door', { door: 'shelf' });
          setDraft(draftWithoutPassport(materializeTemplate(tpl, (k) => t(`builder.templates.dayNames.${k}`)), `coach_shelf_${Date.now()}`));
        }}
        onDraft={setDraft}
        onSave={() => void onSend()}
        onRevert={() => {}}
        onAiReview={() => {}}
        aiBusy={false}
        buildBusy={buildBusy}
        onLetHushBuild={onLetHushBuild}
        reviewOpen={false}
        onReviewClose={() => {}}
        forAthlete={{
          name: who,
          facts,
          ...(p.days ? { days: p.days } : {}),
          onSend: () => void onSend(),
          sending,
          problems: problems.map(problemWords),
          onSaveTemplate: () => setNaming(draft?.title ?? ''),
          onPhoto: () => void onPhoto(),
          photoBusy,
          templates: templates.map((x) => ({ name: x.name, days: x.week.days.length })),
          onStartCoachTemplate: (name) => {
            const tpl = templates.find((x) => x.name === name);
            if (!tpl) return;
            const { draft: d, dropped } = draftFromWire(tpl.week, `coach_tpl_${Date.now()}`);
            if (dropped.length) setNotice(t('coachTrack.coach.pen.dropped', { list: dropped.join(', ') }));
            void track('coach_week_door', { door: 'template' });
            setDraft(d.days.length ? d : addDay({ ...d, days: [] }, dayNamer));
          },
          ...(notice ? { notice } : {}),
        }}
      />
      {naming != null ? (
        <BottomSheet onClose={() => setNaming(null)}>
          <Text style={styles.sheetTitle}>{t('coachTrack.coach.pen.saveTemplate')}</Text>
          <TextField
            block
            label={t('coachTrack.coach.pen.templateName')}
            value={naming}
            onChangeText={setNaming}
            maxLength={TEMPLATE_NAME_MAX}
            autoFocus
          />
          <Button
            block
            label={t('coachTrack.coach.pen.templateSave')}
            onPress={() => void onSaveTemplate(naming)}
            disabled={!naming.trim()}
            style={styles.sheetAct}
          />
          <Button block variant="ghost" label={t('common.cancel')} onPress={() => setNaming(null)} />
        </BottomSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  /* The UI face, not the coach's serif (design audit 2026-09-29): a sheet asking about an OPERATION is
     the app speaking — the same voice as the stage's end-workout sheet. The serif is the coach's. */
  sheetTitle: { fontFamily: font.sansSemibold, fontSize: 24, lineHeight: 31, color: color.textPrimary, textAlign: 'left', marginBottom: 12 },
  sheetAct: { marginTop: 14, marginBottom: 6 },
});
