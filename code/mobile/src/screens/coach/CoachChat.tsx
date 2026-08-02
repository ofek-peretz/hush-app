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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
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
import { Legend, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { textStart } from '@/i18n/bidi';
import { color, font, radius, space, stage } from '@/design/tokens';
import { pickCoachImage, MAX_IMAGES_PER_TURN, type CoachImage } from '@/platform/coach/coachImage';
import { PlanWeek } from '@/components/PlanWeek';
import type { CoachPlan } from '@/domain/coachPlan';

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
  /**
   * WHY it did not, when the difference is hers to act on.
   *
   * Only one of these is: a spent allowance is a thing she can do something about, and it was being
   * drawn as a network failure. The rest — offline, a timeout, an unreadable answer — are ours, and
   * telling her which flavour of our problem it was is noise. So this changes the SENTENCE, not the
   * number of sentences.
   */
  reason?: string;
}

/* ─────────────────────────────────────────────────────────────────────────── the invitation */

/**
 * ════ THE LINE THAT OPENS THE ROOM ════
 *
 * Founder, 2026-08-01, on the version this replaces: *"I don't like it. It's as if before talking
 * to you these sentences appeared — it's strange. What it does need is to be INVITING, to start a
 * conversation, and during the conversation the coach introduces and explains itself... exactly
 * like a normal conversation, exactly as if I asked you to run a coach–athlete simulation."*
 *
 * He is right, and the mistake is worth naming: the previous build made the coach recite three
 * lines about itself before she had said a word. Nobody introduces themselves to an empty room. A
 * real coach shakes your hand, asks what you want, and tells you who they are WHILE answering —
 * which is why the introduction moved into the prompt (`coachPrompt`, the intake ask) and out of
 * the screen entirely.
 *
 * What is left here is one sentence, and it is not a message: it is the room. It sits above the
 * thread as chrome, it never scrolls away as a turn would, and it does exactly one thing — make
 * starting feel obvious.
 *
 *   "Erez — tell me what you want, and I'll build it."
 *
 * Her NAME is in it because we have it (1.2 asks for it) and because a coach who has been told your
 * name uses it. Without one the sentence still stands; it simply starts a word later.
 *
 * ── THE MOTION ──────────────────────────────────────────────────────────────────────────────────
 * The rule draws, then the line rises. Under a second, once, and never again — this is the frame
 * being set, not a performance. The composer is live throughout.
 */
function Invitation({ text }: { text: string }) {
  const rule = useRef(new Animated.Value(0)).current;
  const line = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(rule, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(line, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    // Created once; the copy cannot change under a mounted screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.invite}>
      {/* The mark — the product signing its name before it opens its mouth. */}
      <Animated.View style={[styles.inviteMark, { opacity: rule, transform: [{ scaleX: rule }] }]} />
      <Animated.Text
        style={[
          styles.inviteText,
          { opacity: line, transform: [{ translateY: line.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
        ]}
      >
        {text}
      </Animated.Text>
    </View>
  );
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
          {turn.reason === 'quota_spent' ? t('coach.noMessagesLeft') : t('coach.notSent')}
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
  onSend: (text: string, images?: { mime: string; data: string }[]) => void;
  /**
   * The programme the coach has attached, drawn at the foot of the conversation.
   *
   * ⛔ It lives HERE rather than on the next screen because the coach's own closing line is "what
   * would you change?" — and the app used to navigate away before she could answer it. A programme
   * she cannot argue with is a programme she was handed, not one she agreed to.
   */
  plan?: CoachPlan | null;
  units?: 'kg' | 'lb';
  /** She is happy with it. The only thing that moves her on. */
  onAccept?: () => void;
  /**
   * The one line above an empty thread, already resolved by the screen that owns the name.
   *
   * A prop rather than a lookup because the two callers say different things: the intake invites
   * her to describe what she wants; the returning conversation opens the floor. Neither is a
   * message, and neither survives the first turn.
   */
  invitation: string;
}

export function CoachChat({ turns, busy = false, onSend, invitation, plan, units = 'kg', onAccept }: CoachChatProps) {
  const { t } = useCopy();
  const [draft, setDraft] = useState('');
  const [attached, setAttached] = useState<CoachImage[]>([]);
  const scroll = useRef<ScrollView>(null);

  const send = useCallback(() => {
    const text = draft.trim();
    /*
     * Whitespace is not a message. Without this the send control is live on an empty field and a
     * stray tap costs a call.
     *
     * A PICTURE ON ITS OWN IS a message, though — "look at this" is a whole sentence when the thing
     * is attached to it — so an attachment carries an empty field.
     */
    if (text.length === 0 && attached.length === 0) return;
    setDraft('');
    setAttached([]);
    onSend(text, attached.length ? attached.map((a) => ({ mime: a.mime, data: a.data })) : undefined);
  }, [draft, attached, onSend]);

  /*
   * ⚠️ RE-ENTRANCY IS A REF, NOT STATE — the picker takes a second or two to appear and a second tap
   * in that window opens it twice. State here would re-render the composer under her finger for a
   * flag nothing draws (the same correction the health toggle needed in C.1).
   */
  const picking = useRef(false);
  const attach = useCallback(async () => {
    if (picking.current || attached.length >= MAX_IMAGES_PER_TURN) return;
    picking.current = true;
    try {
      const image = await pickCoachImage();
      // `null` is her backing out of the picker. It is not an error and says nothing to her.
      if (image) setAttached((prev) => [...prev, image]);
    } catch {
      // A picker that fails is a picker that did not attach anything. There is nothing to tell her
      // that the empty attachment row does not already say.
    } finally {
      picking.current = false;
    }
  }, [attached.length]);

  const canSend = draft.trim().length > 0 || attached.length > 0;

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
        {turns.length === 0 ? <Invitation text={invitation} /> : null}
        {turns.map((turn) => (
          <Turn key={turn.id} turn={turn} />
        ))}
        {busy ? <Thinking /> : null}
        {/*
          The week itself, under the sentence that describes it — below the turns and INSIDE the
          scroll, so it reads as the last thing the coach said rather than a panel bolted to the
          screen, and so a long programme scrolls with the conversation it came out of.

          She is not trapped by it: the composer is still there. If she asks for a change the coach
          sends a whole new programme and this redraws, which is why nothing here is dismissible.
        */}
        {plan && onAccept ? (
          <View style={styles.planBlock}>
            <PlanWeek plan={plan} units={units} />
            <Button variant="primary" size="lg" block label={t('coach.accept')} onPress={onAccept} />
          </View>
        ) : null}
      </ScrollView>

      {attached.length > 0 ? (
        <View style={styles.attachments}>
          {attached.map((a) => (
            <Pressable
              key={a.uri}
              accessibilityRole="button"
              accessibilityLabel={t('coach.attachRemove')}
              onPress={() => setAttached((prev) => prev.filter((keep) => keep.uri !== a.uri))}
              style={styles.thumbWrap}
            >
              <Image source={{ uri: a.uri }} style={styles.thumb} />
              {/* The whole thumbnail removes it. A separate 18pt × on a 56pt tile is a target
                  nobody hits, and there is nothing else a tap on it could mean. */}
              <View style={styles.thumbX}>
                <Icon name="close" size={12} color={stage[0]} strokeWidth={2.6} />
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.composer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('coach.attach')}
          onPress={() => void attach()}
          style={({ pressed }) => [styles.attach, pressed && styles.attachPressed]}
        >
          <Icon name="plus" size={20} color={stage.ink2} strokeWidth={2.4} />
        </Pressable>
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

  /* The invitation is the ROOM, not a turn — it owns the space above an empty thread. */
  invite: { paddingTop: space[9], paddingBottom: space[6], gap: space[5] },
  inviteMark: { width: 34, height: 1.5, backgroundColor: stage.ink2 },
  /* The largest serif in the app outside a workout's close. It is the one thing on the screen. */
  inviteText: {
    fontFamily: font.serif,
    fontSize: 27,
    lineHeight: 37,
    color: color.textPrimary,
    textAlign: textStart,
  },
  /*
   * The attachment strip sits ABOVE the composer's own top rule, so the rule stays the boundary
   * between the conversation and the thing she is writing — thumbnails belong on the writing side.
   */
  planBlock: { gap: 14, paddingTop: 6 },
  attachments: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: space.gutter,
    paddingTop: 10,
  },
  thumbWrap: { width: 56, height: 56 },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: color.surface },
  thumbX: {
    position: 'absolute',
    top: -4,
    // A physical edge would flip wrong in Hebrew; `end` is the logical one (RTL lint).
    insetInlineEnd: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: color.onSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attach: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A press changes the SURFACE, never the content's opacity (`aPressNeverDimsWhatYouPressed`).
  attachPressed: { backgroundColor: color.surface2 },
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
