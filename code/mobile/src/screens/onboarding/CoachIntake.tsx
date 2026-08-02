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
import type { OnboardingInputs, Profile } from '@/data/local/models';
import type { CoachPlan, LearnedAboutHer } from '@/domain/coachPlan';

type Props = NativeStackScreenProps<OnboardingParamList, 'CoachIntake'>;

/**
 * Her onboarding inputs, corrected by what she actually told the coach.
 *
 * ⚠️ `daysPerWeek: 4` ARRIVES HERE AS A PLACEHOLDER. `ConnectHealth` hands one over because the
 * field is not optional and the sheet needs a number before the first call — its comment says "the
 * coach replaces it", and until now nothing did. So an athlete who agreed on three days trained the
 * three-day programme the coach wrote while her profile said four, and every later sheet told the
 * coach four, under a rule that reads *"write exactly that many sessions"*.
 *
 * Exported for the law that holds this seam: the placeholder is invisible until it disagrees with
 * her, which is exactly the kind of defect that survives a rebuild.
 */
export function withLearned(inputs: OnboardingInputs, learned: LearnedAboutHer): OnboardingInputs {
  return {
    ...inputs,
    ...(learned.weightKg != null ? { weightKg: learned.weightKg } : {}),
    ...(learned.daysPerWeek != null ? { daysPerWeek: learned.daysPerWeek } : {}),
    ...(learned.minutes != null ? { workoutMinutes: learned.minutes } : {}),
  };
}

export function CoachIntake({ navigation, route }: Props) {
  const { t } = useCopy();
  const { inputs } = route.params;

  /**
   * ════ WHAT SHE TELLS IT, KEPT UNTIL THERE IS SOMEWHERE TO PUT IT ════
   *
   * She says what she weighs in the second turn; the programme arrives in the fifth. There is no
   * profile to write to in between — `Root` renders the main app the instant one exists, which is
   * the whole reason this screen assembles hers in memory (see the header) — so the facts are
   * accumulated here and handed to `completeOnboarding` with everything else.
   *
   * A ref, not state: nothing on this screen renders differently because the coach now knows her
   * bodyweight, and a re-render mid-conversation would rebuild the sheet under a call in flight.
   * Later turns overwrite earlier ones — if she corrects herself, the correction is the fact.
   */
  const learned = React.useRef<LearnedAboutHer>({});

  /**
   * The coach's own memory of who it has just met, kept live so the NEXT turn of this very
   * conversation already carries it.
   *
   * `useCoach` persists it through `db.recordCoachAnswer` the moment it arrives — but the sheet on
   * this screen is built in memory, so without this the coach would only start reading its own
   * brief back after onboarding ended. It is state rather than a ref for exactly that reason: the
   * sheet has to rebuild when it changes.
   */
  const [brief, setBrief] = React.useState<string[] | null>(null);

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
    () => coachFacts({ profile, plan: null, history: [], ...(brief?.length ? { brief } : {}), language: currentLocale() }),
    [profile, inputs.daysPerWeek, brief],
  );

  const handed = React.useRef(false);
  /**
   * The newest programme the coach has attached, or null while it is still asking.
   *
   * State rather than a ref: the chat draws it, and a later turn that rewrites it must redraw. If
   * she asks for a change, the coach sends the WHOLE programme again (never a patch), so replacing
   * this wholesale is the correct merge and there is nothing to reconcile.
   */
  const [plan, setPlan] = React.useState<CoachPlan | null>(null);

  const coach = useCoach({
    facts,
    mode: 'intake',
    onAnswer: (answer) => {
      // Every turn, plan or no plan — she states her weight long before there is a programme.
      if (answer.learned) learned.current = { ...learned.current, ...answer.learned };
      if (answer.brief?.length) setBrief(answer.brief);
      /*
       * ⛔ A PLAN ARRIVING IS NOT HER AGREEING TO IT — founder, on build 39: *"he moved me straight
       * to the transition screen without showing me the plan first, without asking whether this is
       * what I want and whether I approve."*
       *
       * This used to `navigation.replace` the instant a programme appeared. Two things were wrong
       * with that, and the second is worse than the first:
       *
       *   · `useCoach` stored the plan with an un-awaited `void`, so the next screen read it off
       *     disk before the write landed and drew nothing. (Fixed there; the write is awaited now.)
       *   · **The coach's own last sentence is "what would you like to change?"** — and the app
       *     navigated away before she could answer it. The prompt and the screen were contradicting
       *     each other, and the screen won.
       *
       * So the programme lands in the CONVERSATION, where it can be argued with. She reads it, and
       * either says what to change — the coach rewrites it, and the newest one is what she sees — or
       * she accepts, which is the only thing that moves her on.
       */
      if (!answer.plan) return;
      setPlan(answer.plan);
    },
  });

  return (
    <CoachChat
      turns={coach.turns}
      busy={coach.busy}
      onSend={coach.send}
      plan={plan}
      units={inputs.units}
      onAccept={() => {
        // Guarded: two taps in the same tick would push this screen twice.
        if (handed.current) return;
        handed.current = true;
        navigation.replace('ProgramCreated', { inputs: withLearned(inputs, learned.current) });
      }}
      invitation={inputs.name ? t('coach.inviteNamed', { name: inputs.name }) : t('coach.invite')}
    />
  );
}
