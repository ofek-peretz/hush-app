/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * MY COACH — the link, stated and in her hands. (the coach track, 2026-09-17)
 *
 * *"בפרופיל. שליטה מלאה: מה עובר, מה המנוי, ויציאה שלא לוקחת ממנו כלום."*
 *
 * Opened from You, only while she is linked. Four things, in the order she asks them:
 *   1. WHO — her coach's name, since when, which week of the link this is.
 *   2. WHAT CROSSES — the fixed half (workouts, loads, swaps, pain) and the two switches that are
 *      hers (`setConsent`). Switching one OFF is not only "stop sending": the server erases what it
 *      already holds for that field (COACH_TRACK_V1 §6, "Consent withdrawn erases").
 *   3. THE MEMBERSHIP — Pro is open while the link lives (ruling 1).
 *   4. THE WAY OUT — with its cost said BEFORE the press: the week stays, the coach's access closes
 *      at once, her uploads are deleted from the server after 30 days (law 6). A confirm sheet,
 *      because leaving is not undone by pressing the row again.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { Arrive, Avatar, Button, Legend } from '@/components/ds';
import { ConsentRow } from '@/screens/trainee/CoachJoin';
import { bidiName } from '@/i18n/bidi';
import { currentLocale } from '@/i18n';
import { useCopy } from '@/i18n/useCopy';
import { useCoachTrack } from '@/state/stores/coachStore';
import { coachWeekNumber, joinErrorKey } from '@/domain/coachTrackAthlete';
import type { Consent } from '@/domain/coachTrack';
import { alert, color, font, signal, space, stage, textScale, tracking, trackingPx } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'MyCoach'>;

export interface MyCoachViewProps {
  coachName: string | null;
  since: string | null;
  weekNumber: number | null;
  consent: Consent;
  /** A consent write in flight — the switches hold still until the server has answered. */
  saving: boolean;
  errorKey: string | null;
  confirming: boolean;
  leaving: boolean;
  onConsent: (next: Consent) => void;
  onLeave: () => void;
  onConfirmLeave: () => void;
  onCancelLeave: () => void;
  onBack: () => void;
  /**
   * ⛔ THE WAY BACK IN (2026-09-18). Leaving popped straight back to You — and You draws the coach
   * row only WHILE she is linked, so the moment she left, the product had no door to a coach at all
   * except an invite link arriving from outside it. The typed code exists precisely for the phone
   * that never gets that link. She stays on this screen, it turns into its own empty state, and the
   * door she needs is the thing on it.
   */
  onJoinAnother?: () => void;
}

export function MyCoachView(props: MyCoachViewProps) {
  const { t } = useCopy();
  const coach = props.coachName ? bidiName(props.coachName) : null;
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={props.onBack} hitSlop={12} style={styles.back}>
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">{t('coachTrack.athlete.myCoachTitle')}</Text>
      </View>

      {!coach ? (
        <View style={styles.empty}>
          <Text style={styles.name}>{t('coachTrack.athlete.notLinkedTitle')}</Text>
          <Text style={styles.body}>{t('coachTrack.athlete.notLinkedBody')}</Text>
          {props.onJoinAnother ? (
            <View style={styles.emptyAction}>
              <Button variant="secondary" block label={t('coachTrack.athlete.codeEntry')} onPress={props.onJoinAnother} />
            </View>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Arrive order={0} style={styles.identity}>
            <Avatar name={props.coachName ?? ''} size={52} />
            <View style={styles.identityText}>
              <Text style={styles.name}>{coach}</Text>
              {props.since && props.weekNumber ? (
                <Text style={styles.sub}>{t('coachTrack.athlete.sinceLine', { date: props.since, n: props.weekNumber })}</Text>
              ) : null}
            </View>
          </Arrive>

          <Arrive order={1}>
            <Legend tone="accent" style={styles.sectionLegend}>{t('coachTrack.athlete.seesLegend')}</Legend>
            {(['shared1', 'shared2'] as const).map((k) => (
              <View key={k} style={styles.item}>
                <Icon name="check" size={17} color={signal[0]} strokeWidth={2.4} />
                <Text style={styles.itemText}>{t(`coachTrack.athlete.${k}`)}</Text>
              </View>
            ))}
            <View style={styles.toggles}>
              <ConsentRow
                label={t('coachTrack.athlete.bodyweightRow')}
                sub={t('coachTrack.athlete.bodyweightSub')}
                on={props.consent.bodyweight}
                disabled={props.saving}
                onChange={(on) => props.onConsent({ ...props.consent, bodyweight: on })}
              />
              <ConsentRow
                label={t('coachTrack.athlete.cardioRow')}
                sub={t('coachTrack.athlete.cardioSub')}
                on={props.consent.cardio}
                disabled={props.saving}
                onChange={(on) => props.onConsent({ ...props.consent, cardio: on })}
                last
              />
            </View>
            {props.errorKey ? <Text style={styles.error} accessibilityRole="alert">{t(props.errorKey)}</Text> : null}

            <Legend tone="accent" style={styles.sectionLegend}>{t('coachTrack.athlete.membershipLegend')}</Legend>
            <Text style={styles.body}>{t('coachTrack.athlete.proLine', { coach })}</Text>

            <View style={styles.leave}>
              <Button variant="secondary" block label={t('coachTrack.athlete.leaveCta')} onPress={props.onLeave} disabled={props.leaving} />
              <Text style={styles.leaveFoot}>{t('coachTrack.athlete.leaveFoot', { coach })}</Text>
            </View>
          </Arrive>
        </ScrollView>
      )}

      {props.confirming && coach ? (
        <BottomSheet onClose={props.onCancelLeave}>
          <Text style={styles.confirmTitle}>{t('coachTrack.athlete.leaveConfirmTitle', { coach })}</Text>
          {/*
            ⛔ THE SHEET DOES NOT RE-READ THE FOOTNOTE (2026-09-18). It printed `leaveFoot` — word
            for word the sentence already standing under the button she just pressed — so the one
            screen in the track that asks her to be sure answered with the paragraph that put her
            here. The confirm is a RECEIPT now: one fact per line, each the answer to a question she
            is actually asking at this moment (my week? his access? my data? my Pro?).
          */}
          {(
            [
              ['leaveConfirmWeek', undefined],
              ['leaveConfirmAccess', { coach }],
              ['leaveConfirmData', undefined],
              ['leaveConfirmPro', undefined],
            ] as const
          ).map(([k, params]) => (
            <View key={k} style={styles.confirmRow}>
              <Text style={styles.confirmBullet}>{'·'}</Text>
              <Text style={styles.confirmBody}>{t(`coachTrack.athlete.${k}`, params)}</Text>
            </View>
          ))}
          {props.errorKey ? <Text style={styles.error} accessibilityRole="alert">{t(props.errorKey)}</Text> : null}
          <View style={styles.confirmActions}>
            <Button variant="danger" block label={t('coachTrack.athlete.leaveConfirm')} onPress={props.onConfirmLeave} disabled={props.leaving} />
            <Button variant="quiet" block label={t('coachTrack.athlete.leaveKeep')} onPress={props.onCancelLeave} />
          </View>
        </BottomSheet>
      ) : null}
    </SafeAreaView>
  );
}

/** "02.09" — the day she joined, the way the design writes a date on this screen, in her locale's order. */
function shortDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(currentLocale(), { day: '2-digit', month: '2-digit' });
}

export function MyCoach({ navigation }: Props) {
  const coach = useCoachTrack();
  const link = coach.link;
  const [consent, setConsent] = useState<Consent>(link?.consent ?? { bodyweight: false, cardio: false });
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (link) setConsent(link.consent);
  }, [link]);

  // The server is the truth about the link: a coach who removed her is said here, not discovered later.
  useEffect(() => {
    void coach.refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onConsent(next: Consent) {
    const before = consent;
    setConsent(next); // the switch moves under her finger; a refusal moves it back
    setSaving(true);
    setErrorKey(null);
    const r = await coach.setConsent(next);
    setSaving(false);
    if (!r.ok) {
      setConsent(before);
      setErrorKey(joinErrorKey(r.error));
    }
  }

  async function onConfirmLeave() {
    setLeaving(true);
    setErrorKey(null);
    const r = await coach.leave();
    setLeaving(false);
    if (!r.ok) {
      setErrorKey(joinErrorKey(r.error));
      return;
    }
    setConfirming(false);
    /* ⚠️ NOT `goBack()`. See `onJoinAnother`: the store's `link` is null now, so this screen becomes
       its own empty state, which is the one surface in the app that still carries the door back in. */
  }

  return (
    <MyCoachView
      coachName={link?.coachName ?? null}
      since={link ? shortDate(link.since) : null}
      weekNumber={link ? coachWeekNumber(link.since, Date.now()) : null}
      consent={consent}
      saving={saving}
      errorKey={errorKey}
      confirming={confirming}
      leaving={leaving}
      onConsent={(next) => void onConsent(next)}
      onLeave={() => {
        setErrorKey(null);
        setConfirming(true);
      }}
      onConfirmLeave={() => void onConfirmLeave()}
      onCancelLeave={() => setConfirming(false)}
      onBack={() => navigation.goBack()}
      onJoinAnother={() => navigation.replace('CoachJoin', {})}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 4, minHeight: 44 },
  back: { minWidth: 30, minHeight: 44, justifyContent: 'center' },
  headerTitle: { fontFamily: font.serif, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.display), color: color.textPrimary, textAlign: 'left' },
  scroll: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 40 },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: space.gutter, gap: 10, paddingBottom: 80 },
  emptyAction: { marginTop: 18 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 6, paddingBottom: 8 },
  identityText: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.serif, fontSize: textScale['2xl'], lineHeight: Math.round(textScale['2xl'] * 1.1), color: color.textPrimary, textAlign: 'left' },
  sub: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, marginTop: 2, textAlign: 'left' },
  sectionLegend: { marginTop: 28, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  itemText: { flex: 1, fontFamily: font.sans, fontSize: 18, lineHeight: 24, color: stage.ink0, textAlign: 'left' },
  toggles: { marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: color.border, paddingHorizontal: 16 },
  body: { fontFamily: font.sans, fontSize: 18, lineHeight: 25, color: stage.ink1, textAlign: 'left' },
  error: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: alert.stage, marginTop: 10, textAlign: 'left' },
  leave: { marginTop: 36, gap: 10 },
  leaveFoot: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: stage.ink1, textAlign: 'center' },
  /* The UI face, not the coach's serif (design audit 2026-09-29): a sheet asking about an OPERATION is
     the app speaking — the same voice as the stage's end-workout sheet. The serif is the coach's. */
  confirmTitle: { fontFamily: font.sansSemibold, fontSize: 26, lineHeight: 33, color: stage.ink0, textAlign: 'left', marginBottom: 10 },
  confirmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  confirmBullet: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: stage.ink2, textAlign: 'center' },
  confirmBody: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: stage.ink1, textAlign: 'left' },
  confirmActions: { gap: 10, marginTop: 12 },
});
