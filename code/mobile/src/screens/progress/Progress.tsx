/**
 * Progress — the progression report (founder, 2026-06-21). Reached from Home / Recovery as the
 * always-on ALL-TIME view (with the milestones gallery); the every-12-weeks notification opens the
 * same screen in its 12-week window (`route.params.window === 'quarter'` — the former QuarterlyReport
 * screen, merged in here 2026-07-15). One surface, two windows; both peak-based so a recent dip never
 * hides progress.
 */
// @ts-nocheck

// 

import React, { useEffect, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { ProgressReportView } from '@/screens/progress/ProgressReportView';
import { ProgressLifts } from '@/screens/progress/ProgressLifts';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { allTimePeakProgress, quarterlyPeakProgress, type QuarterlyProgressEntry } from '@/domain/progressReport';
import { progressAggregate, type ProgressAggregate } from '@/domain/progressAggregate';
import { trainingWeekNumber, currentWeekOpen } from '@/domain/weekCadence';
import { weekCardFromHistory } from '@/domain/shareCard';
import type { Session, CardioActivity } from '@/data/local/models';
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
  const [cardio, setCardio] = useState<CardioActivity[]>([]);
  const quarter = route.params?.window === 'quarter';

  useEffect(() => {
    db.loadHistory().then(setSessions);
    // The all-time lens sums cardio into its lifetime burn + distance badges; load it alongside.
    db.loadCardio().then(setCardio).catch(() => setCardio([]));
  }, []);

  const entries = useMemo<QuarterlyProgressEntry[]>(
    () =>
      sessions
        ? (quarter ? quarterlyPeakProgress : allTimePeakProgress)(sessions, Date.now())
        : [],
    [sessions, quarter],
  );

  // The all-time aggregate (tonnage hero, weekly-volume series, milestone badges). Display-only:
  // computed from history + cardio + the account's start, never from an engine type.
  const aggregate = useMemo<ProgressAggregate | null>(
    () =>
      sessions && !quarter
        ? progressAggregate(sessions, cardio, app.profile?.memberSince, app.profile?.weightKg, Date.now())
        : null,
    [sessions, cardio, quarter, app.profile?.memberSince, app.profile?.weightKg],
  );

  // THE ALL-TIME LENS IS THE v7 "Progress · Lifts" screen (3.2): the tonnage hero, the weekly-volume
  // graph, and the aggregate milestone badges — which REPLACE the old emblem gallery (the handoff is
  // the source of truth). "Log" opens the history ledger. The every-12-weeks notification still opens
  // the legacy peak-comparison report in its quarterly window.
  if (!quarter) {
    // §9.2 — the week's share card, from THIS training week's logged work (null when the week is
    // still empty, so the affordance simply doesn't appear). Derived here where the raw sessions
    // and bodyweight live; ProgressLifts only receives the opener.
    const weekCard = sessions
      ? weekCardFromHistory(sessions, currentWeekOpen(Date.now()), app.profile?.weightKg, units)
      : null;
    return (
      <ProgressLifts
        entries={entries}
        aggregate={aggregate}
        loaded={sessions != null}
        units={units}
        onLog={() => navigation.navigate('History')}
        onLift={(exerciseId) => navigation.navigate('LiftDetail', { exerciseId })}
        onShareWeek={weekCard ? () => navigation.navigate('ShareCardModal', { card: weekCard }) : undefined}
      />
    );
  }

  const week = trainingWeekNumber(app.profile?.memberSince, Date.now());
  return (
    <ProgressReportView
      title={t('report.title')}
      legend={t('report.weekRange', { from: Math.max(1, week - 11), to: week })}
      entries={entries}
      loaded={sessions != null}
      units={units}
      milestones={null}
    />
  );
}
