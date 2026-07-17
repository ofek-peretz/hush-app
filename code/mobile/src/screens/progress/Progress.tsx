/**
 * Progress — the progression report (founder, 2026-06-21). Reached from Home / Recovery as the
 * always-on ALL-TIME view (with the milestones gallery); the every-12-weeks notification opens the
 * same screen in its 12-week window (`route.params.window === 'quarter'` — the former QuarterlyReport
 * screen, merged in here 2026-07-15). One surface, two windows; both peak-based so a recent dip never
 * hides progress.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { ProgressReportView } from '@/screens/progress/ProgressReportView';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { allTimePeakProgress, quarterlyPeakProgress, type QuarterlyProgressEntry } from '@/domain/progressReport';
import { trainingWeekNumber } from '@/domain/weekCadence';
import { earnedMilestones, nextUp } from '@/domain/milestones';
import type { Session } from '@/data/local/models';
import type { MainParamList, HomeTabsParamList } from '@/app/navigation';

// A TAB now (founder 2026-07-17), so it pushes onto the parent stack — the Props are the
// composite of the tab it lives in and the stack above it.
type Props = CompositeScreenProps<
  BottomTabScreenProps<HomeTabsParamList, 'Progress'>,
  NativeStackScreenProps<MainParamList>
>;

export function Progress({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const quarter = route.params?.window === 'quarter';

  useEffect(() => {
    db.loadHistory().then(setSessions);
  }, []);

  const entries = useMemo<QuarterlyProgressEntry[]>(
    () =>
      sessions
        ? (quarter ? quarterlyPeakProgress : allTimePeakProgress)(sessions, Date.now())
        : [],
    [sessions, quarter],
  );

  // The 12-week view reads "Weeks N–M"; the all-time view keeps its own legend + the milestones
  // gallery (earned stamps + each family's next silhouette), derived — never stored — from the same
  // history. The club ladders are the athlete's own (cut from their onboarding answers), so the
  // profile is an input here exactly as the history is (founder 2026-07-13). The quarterly window
  // shows no milestones (they are lifetime facts — as the former QuarterlyReport did).
  const profile = app.profile;
  const week = trainingWeekNumber(profile?.memberSince, Date.now());
  const legend = quarter ? t('report.weekRange', { from: Math.max(1, week - 11), to: week }) : t('progress.legend');
  const title = quarter ? t('report.title') : t('progress.title');
  const milestones = useMemo(
    () => (quarter || !sessions ? null : { earned: earnedMilestones(sessions, profile), next: nextUp(sessions, profile) }),
    [sessions, profile, quarter],
  );

  return (
    <ProgressReportView
      title={title}
      legend={legend}
      entries={entries}
      loaded={sessions != null}
      units={units}
      milestones={milestones}
    />
  );
}
