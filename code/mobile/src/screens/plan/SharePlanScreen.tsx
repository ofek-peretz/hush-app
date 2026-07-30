/**
 * SHARE YOUR PLAN (v7 11.4) — the route.
 *
 * Reads the athlete's own programme, builds the shareable SHAPE (domain/planShare — an allow-list,
 * so no load can travel), and hands the encoded link to the OS share sheet. Hush never sends it;
 * it offers the finished link and steps back, exactly as the share card does.
 */
import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SharePlanView } from '@/screens/plan/SharePlan';
import { useApp } from '@/state/stores/appStore';
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
  const program = app.program;

  // Nothing to share before a programme exists. The route is only reachable from You, which is
  // only reachable after onboarding — but a screen must never assume its own preconditions.
  if (!program || program.days.length === 0) {
    navigation.goBack();
    return null;
  }

  const plan = sharedPlan(program, {
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
