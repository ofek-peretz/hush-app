/**
 * SHARE YOUR PLAN (v7 11.4) — the route.
 *
 * Reads the athlete's own programme, builds the shareable SHAPE (domain/planShare — an allow-list,
 * so no load can travel), and hands the encoded link to the OS share sheet. Hush never sends it;
 * it offers the finished link and steps back, exactly as the share card does.
 */
// @ts-nocheck

// 

import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SharePlanView } from '@/screens/plan/SharePlan';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
// ⛔ ONE DOOR ONTO HER WEEK, whoever wrote it — the coach's plan when there is one, the engine's
// programme in the same shape when there is not. See `data/local/weekPlan`.
import { loadWeekPlan } from '@/data/local/weekPlan';
import type { CoachPlan } from '@/domain/coachPlan';
import { useCopy } from '@/i18n/useCopy';
import { encodePlan, sharedPlan } from '@/domain/planShare';
import { shareText } from '@/platform/share';
import { track } from '@/platform/telemetry';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'SharePlan'>;

/** The link a plan travels in. `hush://plan?p=<token>` — one opaque token, nothing readable. */
export const planLink = (token: string) => `hush://plan?p=${encodeURIComponent(token)}`;

export function SharePlanScreen({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [programme, setProgramme] = React.useState<CoachPlan | null | undefined>(undefined);
  React.useEffect(() => {
    let alive = true;
    void loadWeekPlan().then((p) => alive && setProgramme(p));
    return () => {
      alive = false;
    };
  }, []);

  // `undefined` = the read is still out. Bouncing on it would close the screen the instant it
  // opened, every time — the read is fast but it is not synchronous.
  if (programme === undefined) return null;

  // Nothing to share before the coach has written one. The route is only reachable from You, and
  // the row there is hidden without a plan — but a screen must never assume its own preconditions.
  if (!programme || programme.sessions.length === 0) {
    navigation.goBack();
    return null;
  }

  const plan = sharedPlan(programme, {
    from: app.profile?.name,
    repBandByMuscle: app.profile?.repBandByMuscle,
  });

  // The split's name is the shape it is, said plainly — the day names already carry the detail.
  const splitName = plan.days.map((d) => d.name.split(' ')[0]).filter((v, i, a) => a.indexOf(v) === i).join(' / ');

  return (
    <SharePlanView
      plan={plan}
      splitName={splitName || t('planShare.legend')}
      // A.4 — this route is pushed from the two-figure door on Today, so `goBack` IS Today. The
      // control names that destination rather than the gesture.
      onBack={() => navigation.goBack()}
      onSend={() => {
        void track('plan_shared', { days: plan.days.length });
        void shareText(planLink(encodePlan(plan)));
      }}
    />
  );
}
