/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE INTAKE — the last onboarding step, and the first conversation.
 *
 * Everything before this screen collects the facts a coach cannot ask for twice: her name, her
 * gender for the copy layer, her bodyweight, her days, her body map. This is where she is asked the
 * things only she knows, by the thing that will act on them.
 *
 * The founder described the product in one sentence and this is its front door:
 *
 *   > *"Imagine someone came to you in a Claude chat and asked you to manage their training, and
 *   > promised to give you all their workout data afterwards."*
 *
 * ── WHY THE PROFILE IS NOT WRITTEN UNTIL THE PROGRAMME EXISTS ───────────────────────────────────
 * `Root` renders the main app the instant `app.profile` exists — that is the whole gate. So writing
 * the profile here would swap the navigator out from underneath this screen mid-conversation.
 *
 * The ordering is also the honest one: **onboarding is not finished until there is a programme.**
 * An athlete with a profile and no programme is an account with nothing in it, and that is exactly
 * the state a crash between the two would leave behind. So the profile is assembled in memory, used
 * to brief the coach, and written by the step AFTER this one — once a plan is on disk.
 *
 * ── AND IF THE COACH CANNOT BE REACHED ──────────────────────────────────────────────────────────
 * She cannot finish, and the screen says so plainly. That is not a gap: the founder's ruling is
 * that there is no second decider, and a locally generated first programme would be exactly the
 * thing this layer removed, handed over at the one moment she has no way to tell it apart.
 * `useCoach` leaves her message in the thread marked "not sent" — she can try it again, and nothing
 * she typed is lost.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { CoachChat } from '@/screens/coach/CoachChat';
import { useCoach } from '@/screens/coach/useCoach';
import { coachFacts } from '@/domain/coachFacts';
import { useCopy } from '@/i18n/useCopy';
import { currentLocale } from '@/i18n';
import type { OnboardingParamList } from '@/app/navigation';
import type { Profile } from '@/data/local/models';

type Props = NativeStackScreenProps<OnboardingParamList, 'CoachIntake'>;

export function CoachIntake({ navigation, route }: Props) {
  const { t } = useCopy();
  const { inputs } = route.params;

  /**
   * Her profile as it WILL be, without being written.
   *
   * The same mapping `completeOnboarding` performs, minus the persistence — the coach needs to know
   * who it is talking to before there is an account, and this is the only honest way to hand it
   * over. Deliberately not extracted into a shared builder yet: the two will diverge when the
   * generator goes, and a premature abstraction over a thing that is about to change shape is a
   * refactor bought on credit.
   */
  const profile = React.useMemo<Profile>(
    () => ({
      name: inputs.name,
      sex: inputs.sex,
      heightCm: inputs.heightCm,
      weightKg: inputs.weightKg,
      startWeightKg: inputs.weightKg,
      age: inputs.age,
      units: inputs.units,
      goal: inputs.goal,
      daysPerWeek: inputs.daysPerWeek,
      healthConnected: inputs.healthConnected,
      repBand: '8-10',
      bodyMap: inputs.bodyMap,
      workoutMinutes: 60,
    }),
    [inputs],
  );

  // No programme and no history — the sheet says so, and the intake ask tells the coach to expect
  // it. An empty record is a fact about her, not a hole to fill with assumptions.
  const facts = React.useMemo(
    // No programme yet, and that is a fact about her rather than a hole: this is the one call
    // where there genuinely is none, and the intake ask says so.
    () => coachFacts({ profile, plan: null, history: [], language: currentLocale() }),
    [profile, inputs.daysPerWeek],
  );

  const handed = React.useRef(false);

  const coach = useCoach({
    facts,
    mode: 'intake',
    onAnswer: (answer) => {
      /*
       * A plan arrived. `useCoach` has already stored it through `db.recordCoachAnswer`, so by the
       * time this runs it is on disk — the next step writes the profile against a programme that
       * already exists rather than promising one.
       *
       * Guarded because most intake turns carry no plan, and because a second one arriving after
       * she has already moved on must not push this screen again.
       */
      if (!answer.plan || handed.current) return;
      handed.current = true;
      navigation.replace('ProgramCreated', { inputs });
    },
  });

  return (
    <CoachChat
      turns={coach.turns}
      busy={coach.busy}
      onSend={coach.send}
      opening={t('coach.intakeOpening')}
    />
  );
}
