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
import type { Session } from '@/data/local/models';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Progress'>;

export function Progress({ navigation }: Props) {
  const { t } = useCopy();
  const units = useApp().profile?.units ?? 'kg';
  const [sessions, setSessions] = useState<Session[] | null>(null);

  useEffect(() => {
    db.loadHistory().then(setSessions);
  }, []);

  const entries = useMemo<QuarterlyProgressEntry[]>(
    () => (sessions ? allTimePeakProgress(sessions, Date.now()) : []),
    [sessions],
  );

  return (
    <ProgressReportView
      title={t('progress.title')}
      legend={t('progress.legend')}
      entries={entries}
      loaded={sessions != null}
      units={units}
      onBack={() => navigation.goBack()}
    />
  );
}
