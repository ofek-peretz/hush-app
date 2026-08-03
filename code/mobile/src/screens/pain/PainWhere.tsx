/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * SOMETHING HURTS — and she says so in words, to the coach.
 *
 * ⛔ FOUNDER, 2026-08-02, twice: *"I am still seeing the body-map screens in the injury case. I
 * asked you to take them off and put a chat window with the AI in their place, where she can talk
 * to it and update the injury."*
 *
 * What was here: a clay body figure, tap a muscle, pick one of three severities, and a second
 * screen that read the result back. Two taps, no forms — and it was the right design for an ENGINE,
 * because an engine can only act on a muscle id and a number. It cannot act on "the outside of my
 * elbow when I straighten it".
 *
 * A coach can. So the question stops being a form and becomes what it is between two people: she
 * says what is wrong, and the thing that decides answers her.
 *
 * ── WHERE THE REST WINDOW COMES FROM NOW ────────────────────────────────────────────────────────
 * Nothing taps a muscle any more, so nothing but the coach knows which one she means. It reports it
 * (`hurts` on the answer — the same pattern as `learned` for her bodyweight) and `reportPain` writes
 * the ease from that. ⚠️ The app never guesses: a reply with no `hurts` rests nothing, which is the
 * correct outcome for "my knee feels a bit odd, is that normal?" — a question, not an injury.
 *
 * ── AND IT IS THE ORDINARY CHAT ─────────────────────────────────────────────────────────────────
 * Same component, same transport, same conversation history. She can send a photograph of the
 * swelling, argue with the answer, or say it is fine after all. `PainResponse` is gone with the map:
 * a screen that reads back what happened is what you need when a machine decided; when a coach
 * answers, the answer IS the screen.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { CoachChat } from '@/screens/coach/CoachChat';
import { useCoach } from '@/screens/coach/useCoach';
import { Icon } from '@/components/Icon';
import { Legend } from '@/components/ds';
import { coachFacts } from '@/domain/coachFacts';
import { db } from '@/data/local/db';
import { exerciseDisplayName } from '@/data/exercises';
import { color, s } from '@/design/tokens';
import { useCopy } from '@/i18n/useCopy';
import { currentLocale } from '@/i18n';
import { useApp } from '@/state/stores/appStore';
import type { MainParamList } from '@/app/navigation';
import type { CoachDecision } from '@/domain/coachLog';
import type { CoachPlan } from '@/domain/coachPlan';
import type { Session } from '@/data/local/models';

type Props = NativeStackScreenProps<MainParamList, 'PainWhere'>;

export function PainWhere({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const lift = route.params?.exerciseId;

  const [history, setHistory] = React.useState<Session[]>([]);
  const [decided, setDecided] = React.useState<CoachDecision[]>([]);
  const [plan, setPlan] = React.useState<CoachPlan | null>(null);
  const [brief, setBrief] = React.useState<string[] | null>(null);
  React.useEffect(() => {
    let alive = true;
    void Promise.all([db.loadHistory(), db.loadCoachLog(), db.loadCoachPlan(), db.loadCoachBrief()]).then(
      ([h, d, p, b]) => {
        if (!alive) return;
        setHistory(h);
        setDecided(d);
        setPlan(p);
        setBrief(b);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const profile = app.profile;
  const facts = React.useMemo(
    () =>
      profile
        ? coachFacts({
            profile,
            plan,
            history,
            decided,
            ...(brief?.length ? { brief } : {}),
            language: currentLocale(),
          })
        : null,
    [profile, plan, history, decided, brief],
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.head}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={10}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Icon name="chevronLeft" size={22} color={color.onSurface} strokeWidth={2} />
          </Pressable>
          <Legend size={11} tone="muted">{t('pain.title')}</Legend>
          <View style={styles.back} />
        </View>
        {facts ? (
          <Body
            facts={facts}
            entitled={app.entitlement.active}
            lift={lift ? exerciseDisplayName(lift) : null}
            onHurts={(h) => void app.reportPain(h.muscle, h.severity)}
          />
        ) : null}
      </SafeAreaView>
    </View>
  );
}

/**
 * The conversation, mounted once her sheet exists.
 *
 * Split out for the same reason `CoachScreen` splits it: `useCoach` takes the facts, and a hook
 * cannot be called conditionally.
 */
function Body({
  facts,
  entitled,
  lift,
  onHurts,
}: {
  facts: NonNullable<ReturnType<typeof coachFacts>>;
  entitled: boolean;
  lift: string | null;
  onHurts: (h: { muscle: string; severity: 'twinge' | 'pain' | 'sharp' }) => void;
}) {
  const { t } = useCopy();
  const coach = useCoach({
    facts,
    mode: 'chat',
    entitled,
    onAnswer: (answer) => {
      // The ONE thing this screen does beyond talking: her testimony becomes a rest window. No
      // `hurts`, no ease — a question about a niggle is not an injury report.
      if (answer.hurts) onHurts(answer.hurts);
    },
  });
  return (
    <CoachChat
      turns={coach.turns}
      busy={coach.busy}
      onSend={coach.send}
      // Opened mid-session on a specific lift, the invitation names it — she is standing at the rack
      // and should not have to explain where she is.
      invitation={lift ? t('pain.inviteOnLift', { exercise: lift }) : t('pain.invite')}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(16),
    paddingVertical: s(10),
  },
  back: { width: s(32), height: s(32), alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: color.surface, borderRadius: s(16) },
});
