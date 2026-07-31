/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH CHAT — where the athlete talks to Hush.
 *
 * The intake conversation and every conversation after it are the same screen. The founder's own
 * framing of the product is the reason:
 *
 *   > *"Imagine this chat window went into the app and someone asked you to manage their training.
 *   > You'd behave normally, exactly like a chat — only you also get their data after every
 *   > workout."*
 *
 * So there is no separate onboarding flow to build and no second surface to keep in step. Intake is
 * this screen with an empty record; three months later it is this screen with a full one.
 *
 * ── DELIBERATELY PLAIN ──────────────────────────────────────────────────────────────────────────
 * The founder is redesigning every new screen in Claude Design and asked me not to spend the budget
 * here. This is built to be *correct* rather than finished: the design system's own tokens, no
 * bespoke ornament, and every behaviour that is easy to get wrong done properly — the keyboard, the
 * scroll, the send guard, the in-flight state, the failure. Restyling it should be changing
 * `StyleSheet`, not rewriting the component.
 *
 * ── PURELY PRESENTATIONAL ───────────────────────────────────────────────────────────────────────
 * It is handed messages and a send function, and it holds no transport, no store and no knowledge
 * that a model exists. That is what lets it be driven from the gallery with a scripted conversation
 * before there is a server to talk to — and the lesson this codebase keeps re-learning is that a
 * state no fixture can produce is a state nobody looks at.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Icon } from '@/components/Icon';
import { Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { color, font, radius, space, stage } from '@/design/tokens';

/** Who said it. `pending` is hers, on screen, not yet acknowledged by the coach. */
export type CoachTurnAuthor = 'athlete' | 'coach';

export interface CoachTurn {
  id: string;
  by: CoachTurnAuthor;
  text: string;
  /**
   * Sent but not answered yet. Shown at reduced weight so she can see it left, without the app
   * claiming it arrived. A message that silently looks identical to a delivered one is the reason
   * people send things twice.
   */
  pending?: boolean;
  /** It did not reach the coach. See `FailedTurn` — this is a state, not a toast. */
  failed?: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────────────── one turn */

/**
 * One message.
 *
 * The two voices are told apart by SIDE and by TYPEFACE, not by colour — the palette's law is that
 * emphasis is distance from the ground, and there is no accent hue to spend. Hers is the interface
 * sans on a raised surface; the coach's is the serif, unboxed, sitting directly on the ground. That
 * is the same split the rest of the app uses for "the product speaking" versus "a control".
 */
function Turn({ turn }: { turn: CoachTurn }) {
  const { t } = useCopy();
  if (turn.by === 'coach') {
    return (
      <View style={styles.coachTurn}>
        <Text style={styles.coachText}>{turn.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.athleteRow}>
      <View style={[styles.athleteBubble, turn.pending && styles.bubblePending, turn.failed && styles.bubbleFailed]}>
        <Text style={styles.athleteText}>{turn.text}</Text>
      </View>
      {turn.failed ? (
        <Legend size={12} track={0.14} align="right" tone="onStage" style={styles.failedNote}>
          {t('coach.notSent')}
        </Legend>
      ) : null}
    </View>
  );
}

/**
 * The coach is composing.
 *
 * Three static dots rather than an animation. A model can take many seconds, and a looping
 * animation over that long reads as a stuck app rather than a working one — the app's own law
 * ("the final seconds are felt, not flashed") is the same instinct: motion is for a moment, not a
 * wait.
 */
function Thinking() {
  const { t } = useCopy();
  return (
    <View style={styles.coachTurn} accessibilityLabel={t('coach.thinking')}>
      <View style={styles.dots}>
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────── the screen */

export interface CoachChatProps {
  turns: CoachTurn[];
  /** The coach is composing a reply — the composer stays usable; she may keep typing. */
  busy?: boolean;
  onSend: (text: string) => void;
  /**
   * The opening line, shown when there are no turns at all.
   *
   * Not a "welcome" — the first thing she sees is the coach already asking her something, because
   * an empty chat with a blinking cursor asks HER to know what to say first.
   */
  opening?: string;
}

export function CoachChat({ turns, busy = false, onSend, opening }: CoachChatProps) {
  const { t } = useCopy();
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);

  const send = useCallback(() => {
    const text = draft.trim();
    // Whitespace is not a message. Without this the send control is live on an empty field and a
    // stray tap costs a call.
    if (text.length === 0) return;
    setDraft('');
    onSend(text);
  }, [draft, onSend]);

  const canSend = draft.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        ref={scroll}
        style={styles.thread}
        contentContainerStyle={styles.threadInner}
        // Follow the conversation as it grows. `onContentSizeChange` rather than an effect on
        // `turns`: a long reply keeps growing after it arrives, and scrolling once on arrival
        // leaves her reading the top of a message whose end is off-screen.
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardDismissMode="interactive"
      >
        {turns.length === 0 && opening ? (
          <View style={styles.coachTurn}>
            <Text style={styles.coachText}>{opening}</Text>
          </View>
        ) : null}
        {turns.map((turn) => (
          <Turn key={turn.id} turn={turn} />
        ))}
        {busy ? <Thinking /> : null}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={t('coach.placeholder')}
          placeholderTextColor={stage.ink2}
          // The keyboard is part of the screen (founder A.1) — a light keyboard under a dark app is
          // the single brightest thing in the product.
          keyboardAppearance="dark"
          multiline
          accessibilityLabel={t('coach.placeholder')}
          // Return inserts a newline; sending is the button. On a multiline field a Return that
          // sends costs her the paragraph she was halfway through.
          blurOnSubmit={false}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('coach.send')}
          accessibilityState={{ disabled: !canSend }}
          onPress={send}
          style={({ pressed }) => [
            styles.send,
            canSend && styles.sendReady,
            pressed && canSend && styles.sendPressed,
          ]}
        >
          <Icon name="chevronUp" size={20} color={canSend ? stage[0] : stage.ink2} strokeWidth={2.4} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  thread: { flex: 1 },
  threadInner: { paddingHorizontal: space.gutter, paddingTop: 20, paddingBottom: 12, gap: 18 },

  // THE COACH: the serif, on the ground, unboxed. Hush speaking — the same voice the rest of the
  // app reserves for itself.
  coachTurn: { alignSelf: 'flex-start', maxWidth: '96%' },
  coachText: {
    fontFamily: font.serif,
    fontSize: 17,
    lineHeight: 26,
    color: stage.ink0,
    textAlign: 'left',
  },

  // HER: the interface sans, raised off the ground.
  athleteRow: { alignSelf: 'flex-end', maxWidth: '88%', gap: 4 },
  athleteBubble: {
    backgroundColor: color.surface2,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubblePending: { opacity: 0.55 },
  bubbleFailed: { borderWidth: 1, borderColor: 'rgba(241,238,229,0.28)', backgroundColor: 'transparent' },
  athleteText: {
    fontFamily: font.sans,
    fontSize: 16,
    lineHeight: 23,
    color: stage.ink0,
    textAlign: 'left',
  },
  failedNote: { paddingEnd: 2 },

  dots: { flexDirection: 'row', gap: 6, paddingVertical: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: stage.ink2 },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: space.gutter,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: color.surface2,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 132,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: font.sans,
    fontSize: 16,
    lineHeight: 22,
    color: stage.ink0,
    textAlign: 'left',
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface2,
  },
  sendReady: { backgroundColor: stage.ink0 },
  // A PRESS NEVER DIMS WHAT YOU PRESSED (founder A.13). The ready control is the bright cream; the
  // pressed one steps DOWN the ink ramp rather than fading — same law the rest of the app follows,
  // and `aPressNeverDimsWhatYouPressed` caught this line when it was an opacity.
  sendPressed: { backgroundColor: stage.ink1 },
});
