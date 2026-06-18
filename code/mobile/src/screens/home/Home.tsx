/**
 * Home — container. Wires app/session state + navigation to the pure HomeView.
 * Home answers one question (§4.7/§4.8): what do I do today? It re-resolves the
 * next workout on focus and drains offline work. No auto-interrupts — the Portrait
 * appears (unlocked) only when its tab is opened (spec IA §3).
 */
import React, { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeView } from '@/screens/home/HomeView';
import { useApp } from '@/state/stores/appStore';
import { useSession } from '@/state/stores/sessionStore';
import { flush as flushTelemetry } from '@/platform/telemetry';
import { nextWorkout } from '@/domain/schedule';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Home'>;

export function Home({ navigation }: Props) {
  const app = useApp();
  const session = useSession();
  const program = app.program;
  // WEEKLY model: Home offers the next UNFINISHED workout in the week (any order, no calendar).
  const day = program ? nextWorkout(program) : null;
  // A complete week REUSES the existing Home Rest state: the backend Rest flag, OR every workout
  // in a loaded program is done (no next workout to offer).
  const resting =
    app.weekRest || (!!program && program.days.length > 0 && !day);

  const isFocused = useIsFocused();

  // Session-at-a-time: re-resolve today's session on focus; drain offline work.
  const [startError, setStartError] = useState(false);
  useEffect(() => {
    if (isFocused) {
      setStartError(false);
      void app.refreshProgram();
      void app.syncCalibration();
      void app.syncPending();
      void flushTelemetry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  async function onStart() {
    if (!day) return;
    setStartError(false);
    try {
      const targets = await app.model.sessionTargets({
        programDayId: day.id,
        completedSessions: app.modeState.completedSessions,
      });
      await session.start(day, targets);
      navigation.navigate('SessionFlow');
    } catch {
      setStartError(true);
    }
  }

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const hour = now.getHours();
  const greetingPart: 'morning' | 'afternoon' | 'evening' =
    hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  // Weekly model: completed (non-rest) workouts in the current program week.
  const trainedThisWeek = program ? program.days.filter((d) => d.completed && !d.isRest).length : 0;

  return (
    <HomeView
      resting={resting}
      dayName={day?.name ?? null}
      muscles={day?.muscleGroups.join(' · ') ?? ''}
      greetingPart={greetingPart}
      name={app.profile?.name ?? null}
      trainedThisWeek={trainedThisWeek}
      startError={startError}
      dateLabel={dateLabel}
      onStart={onStart}
      onProfile={() => navigation.navigate('ProfileSheet')}
    />
  );
}
