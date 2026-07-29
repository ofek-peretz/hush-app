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
        // ONLY the rep bands cross over, because only they are hers to choose. The days and lifts
        // reshape the week through the ordinary map+frequency road the store already owns; her
        // loads are seeded by her own engine from her own body, exactly as they always were.
        await app
          .updateProfileInfo({
            daysPerWeek: plan.days.length,
            ...(plan.repBandByMuscle ? { repBandByMuscle: plan.repBandByMuscle as never } : {}),
          })
          .catch(() => {});
        toast.show(t('profileEdit.savedDays'));
        navigation.goBack();
      }}
      onDecline={() => navigation.goBack()}
    />
  );
}
