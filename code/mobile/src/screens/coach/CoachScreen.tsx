/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH — the conversation, after the intake.
 *
 * `CoachIntake` is the same screen at the other end of her history: no record, and a coach told to
 * ask what it needs and build when it knows enough. This one has the record, and she opens it
 * because she wants to say something.
 *
 * It is reached from the corner of Today rather than from the tab bar, and the founder's reason is
 * the product's positioning in one sentence:
 *
 *   > *"I don't want to put the AI in the tab bar, because that would signal hardest of all that
 *   > we're just another AI app — when we really, really aren't."*
 *
 * A tab is a section of an app. This is not a section: it is who decides everything the other tabs
 * show. A door in the corner is what that gets — available from the first screen, always, and
 * announcing nothing.
 *
 * ── WHAT IT DOES WITH AN ANSWER ─────────────────────────────────────────────────────────────────
 * Almost nothing. `useCoach` already lands whatever arrives through `db.recordCoachAnswer` — the
 * plan is stored and the reasons are written where the next call reads them back — so a turn that
 * changes her programme has already changed it by the time this screen hears about it. Today
 * re-reads on focus, which is how she sees it.
 *
 * The one exception is what she said about HERSELF. "I'm down to 58 now", "I can only make three
 * days from next month" — the coach reports those in `learned`, and they belong in her profile,
 * which is the sheet every later call is built from. Without this the conversation and the record
 * drift apart silently and the coach ends up arguing with its own sheet.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { CoachChat } from './CoachChat';
import { useCoach } from './useCoach';
import { Icon } from '@/components/Icon';
import { RangeMark } from '@/components/RangeMark';
import { Legend } from '@/components/ds';
import { coachFacts } from '@/domain/coachFacts';
import { db } from '@/data/local/db';
import { health } from '@/platform/health';
import type { ExternalWorkout } from '@/platform/health/healthModel';
import { color, s, font } from '@/design/tokens';
import { useCopy } from '@/i18n/useCopy';
import { currentLocale } from '@/i18n';
import { useApp } from '@/state/stores/appStore';
import type { MainParamList } from '@/app/navigation';
import type { CoachDecision } from '@/domain/coachLog';
import type { CoachPlan, LearnedAboutHer } from '@/domain/coachPlan';
import type { Session, CardioActivity } from '@/data/local/models';

type Props = NativeStackScreenProps<MainParamList, 'Coach'>;

export function CoachScreen({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();

  /*
   * Her record, read once when the screen opens.
   *
   * Everything the coach needs to answer is in here, and it is why a question like "why did my
   * bench go down?" can be answered at all: the same sheet that produced the decision is in front
   * of it while it explains the decision.
   */
  const [history, setHistory] = React.useState<Session[] | null>(null);
  const [decided, setDecided] = React.useState<CoachDecision[]>([]);
  const [plan, setPlan] = React.useState<CoachPlan | null>(null);
  const [prefs, setPrefs] = React.useState<{ substitutes: Record<string, string>; keep: Record<string, string> } | null>(null);
  const [cardio, setCardio] = React.useState<CardioActivity[]>([]);
  /** The coach's own memory of who she is — see `CoachAnswer.brief`. */
  const [brief, setBrief] = React.useState<string[] | null>(null);
  const [external, setExternal] = React.useState<ExternalWorkout[]>([]);
  React.useEffect(() => {
    let alive = true;
    void Promise.all([
      db.loadHistory(), db.loadCoachLog(), db.loadCoachPlan(), db.loadPreferences(), db.loadCardio(), db.loadCoachBrief(),
      // What her watch recorded that we did not — she may well be asking about it.
      health.recentWorkouts(Date.now() - 14 * 86_400_000).catch(() => []),
    ]).then(([h, d, p, prefs, c, b, ext]) => {
      if (!alive) return;
      setHistory(h);
      setDecided(d);
      setPlan(p);
      setPrefs({ substitutes: prefs.substitutes, keep: prefs.leaveItsByMuscle });
      setCardio(c);
      setBrief(b);
      setExternal(ext);
    });
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
            history: history ?? [],
            decided,
            ...(prefs ? { preferences: prefs } : {}),
            cardio,
            ...(external.length ? { external } : {}),
            ...(brief?.length ? { brief } : {}),
            language: currentLocale(),
          })
        : null,
    [profile, plan, history, decided, prefs, cardio, brief, external],
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.head}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('nav.today')}
            hitSlop={10}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Icon name="chevronLeft" size={22} color={color.onSurface} strokeWidth={2} />
          </Pressable>
          {/*
            ⛔ THE PRODUCT SIGNS ITS NAME HERE (founder 2026-08-04, on the chat's design).

            The centre held the word "Coach" at eleven points in the muted tone — a label naming a
            section of an app. This is the ONE surface where the product speaks in the first person,
            and it was the only one with no identity at the top at all.

            The mark and the wordmark instead: a screenshot of a conversation then carries the
            product, which is worth more than any share button — and "Coach" was a label explaining
            a screen whose entire content already says what it is.
          */}
          <View style={styles.mark}>
            <RangeMark />
            <Text style={styles.markWord}>hush</Text>
          </View>
          {/* A spacer the width of the control opposite, so the title sits on the screen's centre
              rather than the centre of what is left over. */}
          <View style={styles.back} />
        </View>
        {facts ? (
          <Body
            facts={facts}
            entitled={app.entitlement.active}
            onLearned={(learned) => void app.learnFromCoach(learned)}
          />
        ) : null}
      </SafeAreaView>
    </View>
  );
}

/**
 * The conversation itself, mounted only once the sheet exists.
 *
 * Split out for one reason: `useCoach` takes the facts, and a hook cannot be called conditionally.
 * Holding the whole screen back until the profile loads would be worse — the header is hers either
 * way, and a screen that appears blank for a frame is a screen that looks broken.
 */
function Body({
  facts,
  entitled,
  onLearned,
}: {
  facts: NonNullable<ReturnType<typeof coachFacts>>;
  entitled: boolean;
  onLearned: (learned: LearnedAboutHer) => void;
}) {
  const { t } = useCopy();
  // Only chat is capped, and the allowance depends on whether she is paying — see `coachQuota`.
  const coach = useCoach({
    facts,
    mode: 'chat',
    entitled,
    onAnswer: (answer) => {
      if (answer.learned) onLearned(answer.learned);
    },
  });
  return (
    <CoachChat
      turns={coach.turns}
      busy={coach.busy}
      onSend={coach.send}
      invitation={t('coach.openReturning')}
      /*
       * ⛔ THREE OPENERS (founder 2026-08-04). A blank field asks her to invent a question about a
       * thing she has never had a conversation with. They say what KIND of thing this is for — the
       * same law as the onboarding answers and as the workout window: **let the control speak.**
       *
       * ⚠️ They FILL the field rather than sending it, which is the whole difference between an
       * opener and a menu: "my knee hurts" is the start of a sentence only she can finish, and a
       * chip that fired it as-is would be three canned questions wearing a conversation's clothes.
       */
      openers={[t('coach.chipHurts'), t('coach.chipDays'), t('coach.chipSwap')]}
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
  mark: { flexDirection: 'row', alignItems: 'center', gap: s(7) },
  markWord: { fontFamily: font.serif, fontSize: s(19), color: color.textPrimary, textAlign: 'left' },
  pressed: { backgroundColor: color.surface, borderRadius: s(16) },
});
