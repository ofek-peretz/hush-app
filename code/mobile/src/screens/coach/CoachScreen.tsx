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
 * Nothing, deliberately. `useCoach` already lands whatever arrives through `db.recordCoachAnswer` —
 * the plan is stored and the reasons are written where the next call reads them back — so a turn
 * that changes her programme has already changed it by the time this screen hears about it. Today
 * re-reads on focus, which is how she sees it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { CoachChat } from './CoachChat';
import { useCoach } from './useCoach';
import { Icon } from '@/components/Icon';
import { Legend } from '@/components/ds';
import { coachFacts } from '@/domain/coachFacts';
import { db } from '@/data/local/db';
import { color, s } from '@/design/tokens';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import type { MainParamList } from '@/app/navigation';
import type { CoachDecision } from '@/domain/coachLog';
import type { Session } from '@/data/local/models';

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
  React.useEffect(() => {
    let alive = true;
    void Promise.all([db.loadHistory(), db.loadCoachLog()]).then(([h, d]) => {
      if (!alive) return;
      setHistory(h);
      setDecided(d);
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
            program: app.program ?? { id: 'none', frequency: profile.daysPerWeek ?? 0, days: [] },
            history: history ?? [],
            decided,
          })
        : null,
    [profile, app.program, history, decided],
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
          <Legend size={11} tone="muted">{t('coach.title')}</Legend>
          {/* A spacer the width of the control opposite, so the title sits on the screen's centre
              rather than the centre of what is left over. */}
          <View style={styles.back} />
        </View>
        {facts ? <Body facts={facts} /> : null}
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
function Body({ facts }: { facts: NonNullable<ReturnType<typeof coachFacts>> }) {
  const { t } = useCopy();
  const coach = useCoach({ facts, mode: 'chat' });
  return (
    <CoachChat
      turns={coach.turns}
      busy={coach.busy}
      onSend={coach.send}
      opening={t('coach.opening')}
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
