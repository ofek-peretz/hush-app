/**
 * Progress — the always-on, all-time progression (founder, 2026-06-21). Same
 * comparison as the periodic QuarterlyReport, but spanning the athlete's entire
 * history (first training week → now). Reached from Home / Recovery.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProgressReportView } from '@/screens/progress/ProgressReportView';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { allTimePeakProgress, type QuarterlyProgressEntry } from '@/domain/progressReport';
import { earnedMilestones, nextUp } from '@/domain/milestones';
import type { Session } from '@/data/local/models';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Progress'>;

export function Progress({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [sessions, setSessions] = useState<Session[] | null>(null);

  useEffect(() => {
    db.loadHistory().then(setSessions);
  }, []);

  const entries = useMemo<QuarterlyProgressEntry[]>(
    () => (sessions ? allTimePeakProgress(sessions, Date.now()) : []),
    [sessions],
  );

  // The milestones gallery — earned stamps + each family's next silhouette,
  // derived (never stored) from the same history the report reads.
  // The club ladders are the athlete's own (cut from their onboarding answers), so the profile is
  // an input here exactly as the history is (founder 2026-07-13).
  const profile = app.profile;
  const milestones = useMemo(
    () => (sessions ? { earned: earnedMilestones(sessions, profile), next: nextUp(sessions, profile) } : null),
    [sessions, profile],
  );

  return (
    <ProgressReportView
      title={t('progress.title')}
      legend={t('progress.legend')}
      entries={entries}
      loaded={sessions != null}
      units={units}
      onBack={() => navigation.goBack()}
      milestones={milestones}
    />
  );
}
