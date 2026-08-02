/**
 * PLAN, RECEIVED (v7 11.5) — the route.
 *
 * Decodes the link's token and offers the shape. Adopting it writes the SELECTIONS onto her body
 * map's own terms and lets her engine seed every load from her own body — their numbers were never
 * in the payload to begin with (`domain/planShare` is an allow-list, pinned by a test).
 *
 * A token that will not read is not a screen: it goes straight back, because a screen offering to
 * adopt something it could not parse is worse than no screen at all.
 */
import React, { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PlanReceivedView } from '@/screens/plan/PlanReceived';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { askCoachToRevise } from '@/platform/coach/afterSession';
import { decodePlan } from '@/domain/planShare';
import { track } from '@/platform/telemetry';
import { useToast } from '@/components/ds';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'PlanReceived'>;

export function PlanReceivedScreen({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const toast = useToast();
  const plan = useMemo(() => decodePlan(route.params.token), [route.params.token]);

  if (!plan) {
    navigation.goBack();
    return null;
  }

  const splitName = plan.days.map((d) => d.name.split(' ')[0]).filter((v, i, a) => a.indexOf(v) === i).join(' / ');

  return (
    <PlanReceivedView
      plan={plan}
      splitName={splitName || t('planShare.legend')}
      onAdopt={async () => {
        void track('plan_adopted', { days: plan.days.length });
        /*
         * ════ THE PLAN ACTUALLY CROSSES OVER NOW (founder, 2026-08-02) ════
         *
         * ⚠️ THIS SCREEN PROMISED "you adopt the shape" AND ADOPTED NOTHING BUT A NUMBER. It wrote
         * `daysPerWeek` and the rep bands, on a comment reading "the days and lifts reshape the week
         * through the ordinary map+frequency road the store already owns". That road was the
         * GENERATOR, and the generator is deleted. So she read a screen listing her friend's split,
         * pressed Adopt, saw a toast — and got the same programme she already had, with a different
         * number of days.
         *
         * The shape goes to the coach, which is the only thing that can adopt it honestly: it knows
         * what she has lifted, so it can write her friend's split at HER loads. That is the founder's
         * own question answered — the weights are not adapted, they are DECIDED, from her record.
         *
         * Her rep bands still cross directly: they are a preference she chose, not a decision.
         * `daysPerWeek` deliberately does NOT go through `updateProfileInfo` here — it would fire a
         * second, competing revise call. The coach writes N sessions and the day count follows from
         * the plan itself (`learned.daysPerWeek`).
         */
        if (plan.repBandByMuscle) {
          await app.updateProfileInfo({ repBandByMuscle: plan.repBandByMuscle as never }).catch(() => {});
        }
        await askCoachToRevise(
          `She has adopted a programme shared with her${plan.from ? ` by ${plan.from}` : ''} and wants to train it. ` +
            `It is ${plan.days.length} days a week: ` +
            plan.days.map((d) => `"${d.name}" (${d.exerciseIds.join(', ')})`).join('; ') +
            '. Write it as HER programme — her loads, from her record, and her own rep bands. ' +
            'Change what does not suit her and say what you changed.',
        ).catch(() => {});
        toast.show(t('profileEdit.savedDays'));
        navigation.goBack();
      }}
      onDecline={() => navigation.goBack()}
    />
  );
}
