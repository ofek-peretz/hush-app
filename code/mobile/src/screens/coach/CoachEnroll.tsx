/**
 * ════ BECOMING A COACH — one field, and what it means (the coach track, 2026-09-17) ════
 *
 * ⛔ RULING 1: *the coach pays* — free up to two trainees, bigger tiers later. So the screen says
 * that before he presses anything, in the same breath as what the account IS: he writes the week,
 * FERROX runs the loads, he sees every set. Three lines, the name his trainees will read, one button.
 *
 * The name is the only answer: it is what the invite says (*"Danny invites you"*) and what signs the
 * week on her phone. It opens on the name this phone already knows, because most coaches will keep it.
 *
 * `POST /coach/enroll` is idempotent and renames, so the same screen is honest for a coach who comes
 * back to change how he is called.
 */

//

import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainParamList } from '@/app/navigation';
import { Arrive, Button, TextField } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, font } from '@/design/tokens';
import { COACH_FREE_SEATS } from '@/platform/billing';
import { useApp } from '@/state/stores/appStore';
import { CoachTrackContext } from '@/state/stores/coachStore';
import type { CoachTrackError } from '@/platform/coachTrackClient';

/** The server's bound on a coach's name, after trimming (`coach.ts` NAME_MAX). */
export const COACH_NAME_MAX = 40;

export interface CoachEnrollViewProps {
  name: string;
  onName: (v: string) => void;
  /** Already a coach — the screen renames rather than enrols. */
  enrolled: boolean;
  seats: number;
  busy: boolean;
  error?: CoachTrackError | null;
  onEnroll: () => void;
  onSignIn: () => void;
  /** ⛔ RULING 1's door — what a seat costs, and what his trainees get for it (`CoachPlans`). */
  onPlans: () => void;
  onBack: () => void;
}

export function CoachEnrollView(p: CoachEnrollViewProps) {
  const { t } = useCopy();
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={p.onBack} hitSlop={12} style={styles.back}>
            <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
          </Pressable>
          <Arrive order={0}>
            <Text style={styles.title}>{p.enrolled ? t('coachTrack.coach.enroll.titleEnrolled') : t('coachTrack.coach.enroll.title')}</Text>
          </Arrive>
          <Arrive order={1}>
            <View style={styles.points}>
              {(['point1', 'point2', 'point3'] as const).map((k) => (
                <View key={k} style={styles.point}>
                  <View style={styles.dot} />
                  <Text style={styles.pointText}>{t(`coachTrack.coach.enroll.${k}`)}</Text>
                </View>
              ))}
            </View>
            {/*
              ⛔ "FREE UP TO {{seats}}" MUST NOT PRINT A NUMBER HE PAID FOR (2026-09-18, walked).
              *
              * This line took `p.seats` — the limit `/coach/me` answered — and called it the free
              * tier, so a coach on a raised limit read *"free for up to 12 athletes."* The free
              * tier is a CONSTANT (`COACH_FREE_SEATS`); a coach's limit is a fact about him. The
              * third occurrence of this same confusion today, alongside `CoachPlans`' card and the
              * full-roster sheet — a screen that interpolates a limit has to know where it came from.
            */}
            <Text style={styles.free}>
              {p.seats > COACH_FREE_SEATS
                ? t('coachTrack.coach.enroll.yours', { seats: p.seats })
                : t('coachTrack.coach.enroll.free', { seats: COACH_FREE_SEATS })}
            </Text>
            <TextField
              block
              label={t('coachTrack.coach.enroll.nameLabel')}
              value={p.name}
              onChangeText={p.onName}
              maxLength={COACH_NAME_MAX}
              autoCapitalize="words"
              returnKeyType="done"
            />
            <Text style={styles.hint}>{t('coachTrack.coach.enroll.nameHint')}</Text>
            {p.error ? (
              <Text style={styles.error}>{t(`coachTrack.coach.error.${p.error}`, { defaultValue: t('coachTrack.coach.error.network') })}</Text>
            ) : null}
            <Button
              block
              size="lg"
              label={p.busy ? t('coachTrack.coach.enroll.busy') : p.enrolled ? t('coachTrack.coach.enroll.rename') : t('coachTrack.coach.enroll.cta')}
              onPress={p.onEnroll}
              disabled={p.busy || !p.name.trim()}
              style={styles.cta}
            />
            {p.error === 'signed_out' ? (
              <Button block variant="ghost" label={t('coachTrack.coach.enroll.signIn')} onPress={p.onSignIn} />
            ) : null}
            {/*
              ⛔ THE PRICE IS A ROW, NOT A SECOND BUTTON. The act on this screen is opening the
              account; a second full-width control beside it would make a coach who has not decided
              anything yet choose between two. The line above already said free up to two — this is
              where the rest of the answer lives, in the same row shape You uses for every door.
            */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('coachTrack.coach.plans.fromEnroll')}
              onPress={p.onPlans}
              style={({ pressed }) => [styles.plansRow, pressed && styles.plansRowPressed]}
            >
              <View style={styles.plansText}>
                <Text style={styles.plansLabel}>{t('coachTrack.coach.plans.fromEnroll')}</Text>
                <Text style={styles.plansSub}>{t('coachTrack.coach.plans.fromEnrollSub', { seats: COACH_FREE_SEATS })}</Text>
              </View>
              <Icon name="chevronRight" size={18} color={color.textMuted} />
            </Pressable>
          </Arrive>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Props = NativeStackScreenProps<MainParamList, 'CoachEnroll'>;

export function CoachEnroll({ navigation }: Props) {
  const app = useApp();
  const coachTrack = useContext(CoachTrackContext);
  const coach = coachTrack?.coach ?? null;
  const [name, setName] = useState(coach?.name ?? app.profile?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CoachTrackError | null>(null);

  const onEnroll = async () => {
    if (!coachTrack) return;
    setBusy(true);
    setError(null);
    const r = await coachTrack.enroll(name.trim());
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    /* The fifth tab exists the moment `coach` is set — take him to it, with nobody on it yet. */
    navigation.navigate('HomeTabs', { screen: 'Athletes' });
  };

  return (
    <CoachEnrollView
      name={name}
      onName={setName}
      enrolled={!!coach}
      seats={coach?.seats ?? COACH_FREE_SEATS}
      busy={busy}
      error={error}
      onEnroll={() => void onEnroll()}
      onSignIn={() => navigation.navigate('Authentication')}
      onPlans={() => navigation.navigate('CoachPlans')}
      onBack={() => navigation.goBack()}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  wrap: { padding: 20, paddingBottom: 48 },
  back: { alignSelf: 'flex-start', marginBottom: 10 },
  title: { fontFamily: font.serif, fontSize: 32, lineHeight: 40, color: color.textPrimary, textAlign: 'left' },
  points: { gap: 12, marginTop: 20, marginBottom: 18 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent, marginTop: 9 },
  pointText: { flex: 1, fontFamily: font.sans, fontSize: 18, lineHeight: 25, color: color.textPrimary, textAlign: 'left' },
  /* The price, said before the button — two trainees, free. */
  free: { fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 23, color: color.accentText, textAlign: 'left', marginBottom: 22 },
  hint: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left', marginTop: 8 },
  error: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textSecondary, textAlign: 'left', marginTop: 14 },
  cta: { marginTop: 22, marginBottom: 8 },
  /* The seats door — the You-tab row shape, on a rule, under the act. */
  plansRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingVertical: 14, borderTopWidth: 1, borderTopColor: color.border },
  plansRowPressed: { backgroundColor: color.surface },
  plansText: { flex: 1, gap: 2 },
  plansLabel: { fontFamily: font.sansSemibold, fontSize: 18, color: color.textPrimary, textAlign: 'left' },
  plansSub: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
});
