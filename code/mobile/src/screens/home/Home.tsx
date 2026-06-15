/**
 * 1.6 Home — Workout Day / 1.7 Rest Day. The only free-navigation landing point.
 * Resting state, no self-animation. Single CTA on a workout day; none on rest.
 * Profile circle -> Profile Sheet (spec §1.6/§1.7, §3.2).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WorkoutCard } from '@/components/WorkoutCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { useSession } from '@/state/stores/sessionStore';
import { flush as flushTelemetry } from '@/platform/telemetry';
import { todayDay } from '@/domain/schedule';
import { color, layout, press, type as typo } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Home'>;

export function Home({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const session = useSession();
  const program = app.program;
  const day = program ? todayDay(program) : null;
  // Weekly Program Container: when the week is complete the athlete is in Rest — REUSE the
  // existing Home Rest state (no new screen). Otherwise the day's own rest/workout variant.
  const resting = app.weekRest || !!day?.isRest;

  // A resolved (HIT) Portrait forecast resurfaces the Portrait automatically in
  // Compare mode (revised design). This is the ONLY automatic resurfacing — no
  // schedule, no reminder, no periodic check-in (§7.10, §8.6). Only fires while
  // Home is the focused surface.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (isFocused && app.pendingPortraitReceipt) {
      navigation.navigate('PortraitRevisit', { receipt: true });
    }
  }, [isFocused, app.pendingPortraitReceipt, navigation]);

  // Session-at-a-time: re-resolve today's session whenever Home is focused, so a
  // just-completed session gives way to the next one the backend composed. Also
  // drain any offline-completed sessions to the backend (reconcile on reconnect).
  const [startError, setStartError] = useState(false);
  useEffect(() => {
    if (isFocused) {
      setStartError(false);
      void app.refreshProgram();
      void app.syncCalibration(); // reconcile calibration to backend truth
      void app.syncPending(); // drain offline-completed sessions
      void flushTelemetry(); // ship buffered telemetry
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  async function onStart() {
    if (!day) return;
    setStartError(false);
    try {
      // Resolve targets BEFORE entering the workout (instant landing, UX §4.2).
      const targets = await app.model.sessionTargets({
        programDayId: day.id,
        completedSessions: app.modeState.completedSessions,
      });
      await session.start(day, targets);
      navigation.navigate('SessionFlow');
    } catch {
      // Starting a fresh session requires the server (§5.4). One calm line; the
      // button returns to default and retries on the next tap.
      setStartError(true);
    }
  }

  const initial = app.profile?.name?.[0]?.toUpperCase() ?? '·';

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => navigation.navigate('ProfileSheet')}
          style={({ pressed }) => [styles.circle, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Text style={styles.initial}>{initial}</Text>
        </Pressable>
      </View>

      <View style={styles.center}>
        {resting ? (
          <WorkoutCard name={t('home.rest', { day: day?.name ?? '' })} metadata="" />
        ) : (
          <WorkoutCard name={day?.name ?? ''} metadata={(day?.muscleGroups ?? []).join(' · ')} />
        )}
      </View>

      <View style={styles.actions}>
        {startError ? <Text style={styles.error}>{t('errors.general')}</Text> : null}
        {day && !resting ? (
          <PrimaryButton variant="home" label={t('home.startWorkout')} onPress={onStart} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'flex-end', padding: layout.screenMargin },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: color.textSecondary, fontSize: typo.bodyM.size },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: layout.screenMargin },
  actions: { paddingHorizontal: layout.screenMargin, paddingBottom: 32, minHeight: 60 },
  error: { color: color.textSecondary, fontSize: typo.bodyM.size, textAlign: 'center', marginBottom: 16 },
});
