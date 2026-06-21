/**
 * QuarterlyReport — the periodic 12-week progress report (founder). Surfaced by
 * the recurring every-12-weeks notification (platform/notifications →
 * scheduleQuarterlyReport). Same visual as the always-on Progress screen, but the
 * window is the last 12 weeks (peak-based, so a recent dip never hides progress).
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProgressReportView } from '@/screens/progress/ProgressReportView';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { quarterlyPeakProgress, type QuarterlyProgressEntry } from '@/domain/progressReport';
import { trainingWeekNumber } from '@/domain/weekCadence';
import type { Session } from '@/data/local/models';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'QuarterlyReport'>;

export function QuarterlyReport({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [sessions, setSessions] = useState<Session[] | null>(null);

  useEffect(() => {
    db.loadHistory().then(setSessions);
  }, []);

  const entries = useMemo<QuarterlyProgressEntry[]>(
    () => (sessions ? quarterlyPeakProgress(sessions, Date.now()) : []),
    [sessions],
  );

  // "Weeks N–M" — the 12-week window ending at the current training week.
  const week = trainingWeekNumber(app.profile?.memberSince, Date.now());
  const fromWeek = Math.max(1, week - 11);
  const legend = t('report.weekRange', { from: fromWeek, to: week });

  return (
    <ProgressReportView
      title={t('report.title')}
      legend={legend}
      entries={entries}
      loaded={sessions != null}
      units={units}
      onBack={() => navigation.goBack()}
    />
  );
}
