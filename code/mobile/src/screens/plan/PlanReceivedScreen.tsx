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

// 

import React, { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PlanReceivedView } from '@/screens/plan/PlanReceived';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { toProgram, type MatchedWeek } from '@/domain/importedPlan';
import { exerciseDisplayName } from '@/data/exercises';
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
         * ════════════════════════════════════════════════════════════════════════════════════════
         * ⛔ THE ENGINE ADOPTS IT. NO MODEL IS ASKED. (founder 2026-08-12)
         *
         * This called `askCoachToRevise` with a paragraph of prose — *"write it as HER programme,
         * change what does not suit her and say what you changed"* — which was the fifth and last
         * AI surface in the product, and the only one still able to author a week. It was written
         * on 2026-08-02 for a good reason at the time: nothing else could turn a friend's split
         * into her programme, because the deterministic path did not exist yet.
         *
         * It exists now, it is better, and it is already the answer to the identical question. The
         * IMPORT flow adopts a programme she brings from outside: `toProgram` builds it, it is
         * stamped `authored: 'athlete_or_coach'`, and `engineMayRebuild` then forbids the engine
         * from ever rewriting its shape while Loop 1 and Loop 2 run the loads from her record.
         *
         * ⚠️ AND A SHARED PLAN IS EASIER THAN AN IMPORT, NOT HARDER. An import arrives as words on a
         * photograph and has to be matched to the catalogue. This arrives as catalogue IDS — they
         * were encoded by a copy of this app — so there is nothing to match and nothing to guess.
         * `unmatched` is empty by construction.
         *
         * ⚠️ "ENCODED BY A COPY OF THIS APP" IS AN ASSUMPTION, AND IT WAS LOAD-BEARING. Anyone can
         * hand-craft the token, and a shared week may legitimately hold a RUN, which is a movement
         * and by design not in `EXERCISES`. `toProgram` asserted on every id (`exerciseById(id)!`)
         * and threw inside this async handler; the rejection was swallowed by nothing at all and
         * the button simply did not respond, however many times she pressed it. `decodePlan` now
         * drops an id that names neither a lift nor a movement, and `toProgram` skips a slot the
         * catalogue cannot describe.
         *
         * ⛔ WHAT SHE GETS IS NOW WHAT THE SCREEN PROMISED. The note this replaces admitted the
         * screen "promised you adopt the shape and adopted nothing but a number". The model was the
         * fix for that; this is the fix that does not need one — her friend's days, her friend's
         * lifts, in her friend's order, and HER loads, decided from her own record.
         * ════════════════════════════════════════════════════════════════════════════════════════
         */
        if (plan.repBandByMuscle) {
          /*
           * Her rep bands are a PREFERENCE she chose, not a measurement — they cross directly, and
           * the card above says so before she presses, because this REPLACES hers.
           *
           * ⚠️ AND WHAT CROSSES IS VALIDATED, IN `decodePlan`. This spread a link's object straight
           * onto her stored profile: a hand-crafted payload wrote arbitrary keys into it, and a
           * value that was not a string made `planBandSummary` throw while this very screen was
           * rendering. Every key is now checked against `CANONICAL_MUSCLE_ORDER` and every value
           * against `REP_BAND_CHOICES` before it ever reaches here.
           */
          await app.updateProfileInfo({ repBandByMuscle: plan.repBandByMuscle as never }).catch(() => {});
        }
        const matched: MatchedWeek = {
          sessions: plan.days.map((d) => ({
            name: d.name,
            /* `how: 'exact'` — a shared plan carries verified catalogue ids, not free text, so the
               match IS exact by construction. The literal was missing the required field and
               `@ts-nocheck` shipped it anyway; downstream readers that switch on `how` were being
               handed `undefined`. */
            lifts: d.exerciseIds.map((id) => ({ name: exerciseDisplayName(id), match: { id, how: 'exact' as const } })),
          })),
          unmatched: [],
        };
        await app.adoptImportedProgram(toProgram(matched, `shared-${Date.now()}`)).catch(() => {});
        toast.show(t('profileEdit.savedDays'));
        navigation.goBack();
      }}
      onDecline={() => navigation.goBack()}
    />
  );
}
