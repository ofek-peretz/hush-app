/**
 * ════ THE CREW — the social home, as a tab (PROTOTYPE, 2026-09-29) ════
 *
 * Founder, 2026-09-29: *"תחשוב בדיוק איפה לשלב את זה במסכים … כך שתמקסם את חווית השיתופיות ויצירת
 * קהילה"*, and *"ראית ממש בעיניים שלך?"* — so this is built in the app's own components and judged on
 * the real screen before anything is wired.
 *
 * The page answers three questions in the order a lifter asks them: are WE keeping it up (the
 * shared streak — one number for everyone, never a ranking), who has trained (each friend's week,
 * drawn with the same rule Today draws hers), and what can I do about it (cheer the one who went,
 * pull in the one who didn't). Sharing and the invite close it.
 *
 * WIRED 2026-09-29: fed by `state/stores/circleStore` (the identity worker's `/circle`, its shared
 * streak and its cheers); `CrewScreen` is the container. The web fixture still feeds the same store.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Arrive, Avatar, Button, Legend } from '@/components/ds';
import { Icon, type IconName } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { color, font, motion, radius, signal } from '@/design/tokens';
import { useReducedMotion } from '@/platform/reducedMotion';
import { currentLocale } from '@/i18n';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export interface CrewMemberView {
  name: string;
  done: number;
  planned: number;
  /** Days since her last workout — 0 = today. Null when unknown. */
  lastDays: number | null;
  me?: boolean;
  /** The circle's handle for this friend — what a cheer is addressed to. */
  id?: string | null;
  /** She already cheered this friend today. */
  cheered?: boolean;
}

export interface CrewViewProps {
  members: CrewMemberView[] | null;
  /**
   * Weeks in a row everyone in the circle closed — ONE number for all of them, never a ranking.
   * ⛔ A STREAK, BY THE FOUNDER'S RULING (2026-09-29), which repealed the brief's "no streaks": the
   * shared streak is the accountability. Its copy is written forward ("kept going while everyone
   * closes"), never as a debt a missed week collects in guilt.
   */
  streakWeeks: number;
  /** A cheer she received, already worded — "כל הכבוד מיוסי". */
  cheer?: string | null;
  /** The circle's code, printed plainly under the invite — the half that works when links do not. */
  code?: string | null;
  /** A line that says why the last act did nothing (no server, no session). */
  notice?: string | null;
  onCheer: (m: CrewMemberView) => void;
  onNudge: (m: CrewMemberView) => void;
  onInvite: () => void;
  /** Resolves false when the code opened no circle — the view says so in words. */
  onJoin: (code: string) => Promise<boolean>;
  onLeave?: () => void;
  onShareSession?: () => void;
  onShareWeek?: () => void;
  onSendPlan?: () => void;
}

export function CrewView(props: CrewViewProps) {
  const { t } = useCopy();
  const members = props.members;
  const together = (members ?? []).reduce((n, m) => n + m.done, 0);

  if (!members || members.length <= 1) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Arrive order={0}>
            <Text style={styles.title} accessibilityRole="header">{t('crew.title')}</Text>
          </Arrive>
          {/*
            ⛔ A PICTURE OF A FULL CIRCLE, NOT THREE ROWS ABOUT ONE (design audit 2026-09-29). The empty
            tab was a paragraph, three benefit rows, a button, a code and a share list — five blocks of
            reading before the one act. It SHOWS the circle now (six faces, three lit moss the way a
            friend who trained today is lit), says one sentence, and hands her the invite.
          */}
          <Arrive order={1} style={styles.emptyPicture}>
            <CircleOfFaces />
          </Arrive>
          <Arrive order={1}>
            <Text style={styles.lede}>{t('crew.emptyLede')}</Text>
          </Arrive>
          <Arrive order={2} style={styles.emptyActs}>
            <Button variant="primary" size="lg" block label={t('crew.inviteWhatsapp')} onPress={props.onInvite} />
            {props.notice ? <Text style={styles.notice}>{props.notice}</Text> : null}
            {props.code ? <Text style={styles.codeLine}>{t('together.circleCodeLine', { code: props.code })}</Text> : null}
            <JoinByCode onJoin={props.onJoin} />
          </Arrive>
          {/* Sharing does not wait for a crew — it was the old "יחד" screen's job and lives here now. */}
          <ShareBlock {...props} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const others = members.filter((m) => !m.me);
  const me = members.find((m) => m.me);
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Arrive order={0}>
          <Text style={styles.title} accessibilityRole="header">{t('crew.title')}</Text>
        </Arrive>

        {/* ✦ ONE NUMBER FOR ALL OF THEM — the streak is shared, so one friend missing breaks it for
            everyone. That is the whole mechanism: accountability without a table. */}
        <Arrive order={0} style={styles.hero}>
          <Text style={styles.heroNum}>{String(props.streakWeeks > 0 ? props.streakWeeks : together)}</Text>
          <View style={styles.heroText}>
            {props.streakWeeks > 0 ? (
              <>
                <Text style={styles.heroLine}>{t('crew.streak', { count: props.streakWeeks })}</Text>
                <Text style={styles.heroSub}>{t('crew.together', { count: together })}</Text>
              </>
            ) : (
              <Text style={styles.heroLine}>{t('crew.togetherHero')}</Text>
            )}
          </View>
        </Arrive>

        {props.cheer ? (
          <Arrive order={1} style={styles.cheer}>
            <Icon name="star" size={16} color={signal[0]} strokeWidth={2} />
            <Text style={styles.cheerText}>{props.cheer}</Text>
          </Arrive>
        ) : null}

        <Arrive order={1} style={styles.list}>
          {[...(me ? [me] : []), ...others].map((m, i) => (
            <MemberRow key={`${m.name}-${i}`} m={m} onCheer={props.onCheer} onNudge={props.onNudge} />
          ))}
        </Arrive>

        <Arrive order={2} style={styles.invite}>
          <Button variant="secondary" size="lg" block label={t('crew.inviteWhatsapp')} onPress={props.onInvite} />
          {props.notice ? <Text style={styles.notice}>{props.notice}</Text> : null}
          {props.code ? <Text style={styles.codeLine}>{t('together.circleCodeLine', { code: props.code })}</Text> : null}
        </Arrive>

        <ShareBlock {...props} />
        {props.onLeave ? <LeaveCircle onLeave={props.onLeave} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** "I have a code" — the door for the friend who got the code by voice or from the landing page. */
function JoinByCode({ onJoin }: { onJoin: (code: string) => Promise<boolean> }) {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = code.trim().length === 6 && !busy;
  if (!open) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={t('crew.haveCode')} onPress={() => setOpen(true)} hitSlop={10} style={styles.codeLink}>
        <Text style={styles.codeLinkText}>{t('crew.haveCode')}</Text>
      </Pressable>
    );
  }
  return (
    <View>
      <View style={styles.joinRow}>
        <TextInput
          style={styles.joinInput}
          value={code}
          onChangeText={(v) => {
            setFailed(false);
            setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''));
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          maxLength={6}
          // A SAMPLE CODE, not a word — the same six-glyph shape in every language.
          placeholder="ABC234"
          placeholderTextColor={color.textTertiary}
          accessibilityLabel={t('together.circleJoin')}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('together.circleJoin')}
          disabled={!ready}
          onPress={() => {
            setBusy(true);
            void onJoin(code.trim()).then((ok) => {
              setBusy(false);
              if (!ok) setFailed(true);
            });
          }}
          style={({ pressed }) => [styles.joinGo, !ready && styles.joinGoOff, pressed && styles.actPressed]}
        >
          <Icon name="chevronRight" size={18} color={color.textPrimary} />
        </Pressable>
      </View>
      {failed ? <Text style={styles.notice}>{t('together.circleJoinFailed')}</Text> : null}
    </View>
  );
}

/** Leaving is two taps: the first says what leaving means, the second does it. */
function LeaveCircle({ onLeave }: { onLeave: () => void }) {
  const { t } = useCopy();
  const [asking, setAsking] = useState(false);
  return (
    <View style={styles.leave}>
      {asking ? (
        <>
          <Text style={styles.leaveAsk}>{t('crew.leaveConfirm')}</Text>
          <View style={styles.leaveActs}>
            <Pressable accessibilityRole="button" onPress={onLeave} hitSlop={8} style={({ pressed }) => [styles.act, pressed && styles.actPressed]}>
              <Text style={styles.actText}>{t('crew.leaveYes')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setAsking(false)} hitSlop={8} style={styles.codeLink}>
              <Text style={styles.leaveText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setAsking(true)} hitSlop={10}>
          <Text style={styles.leaveText}>{t('together.circleLeave')}</Text>
        </Pressable>
      )}
    </View>
  );
}

/*
 * ✦ THE RING LIGHTS (design audit 2026-09-29: *"the ring around a friend who trained today lights up the
 * first time you come in — a small moment that makes you come back"*).
 *
 * Once per friend per day per launch: the first time this tab draws them lit today, the moss ring
 * arrives — faded in and settled from a hair smaller, on the app's one curve, at `land` — and after
 * that it is simply there. A ring that re-lit on every visit would be decoration; one that lit once is
 * news. Reduced motion draws it lit, with no arrival.
 */
const litToday = new Set<string>();
const dayKey = (): string => new Date().toDateString();

function TodayRing({ id }: { id: string }) {
  const reduced = useReducedMotion();
  const key = `${id}|${dayKey()}`;
  const fresh = useRef(!litToday.has(key) && !reduced).current;
  const v = useRef(new Animated.Value(fresh ? 0 : 1)).current;
  useEffect(() => {
    litToday.add(key);
    if (!fresh) return;
    Animated.timing(v, {
      toValue: 1,
      duration: motion.dur.land,
      delay: motion.dur[4],
      easing: Easing.bezier(...motion.easeStandard),
      useNativeDriver: true,
    }).start();
  }, [fresh, key, v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.todayRing, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }]}
    />
  );
}

/*
 * The empty tab's picture: six faces on one ring, three of them lit — what the tab looks like when it
 * is working. Invented initials in her language; decorative, so hidden from assistive tech (the
 * sentence under it says the same thing in words).
 */
const FACE = 44;
const RING_R = 76;
const BOX = RING_R * 2 + FACE + 8;
function CircleOfFaces() {
  const letters = currentLocale() === 'he' ? ['נ', 'ד', 'ע', 'מ', 'ש', 'י'] : ['N', 'D', 'A', 'M', 'S', 'J'];
  return (
    <View style={styles.circleBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.circleTrack} />
      {letters.map((l, i) => {
        const a = (i / letters.length) * 2 * Math.PI - Math.PI / 2;
        const lit = i % 2 === 0;
        return (
          <View
            key={l}
            style={[
              styles.circleFace,
              lit && styles.circleFaceLit,
              { top: BOX / 2 + RING_R * Math.sin(a) - (FACE + 6) / 2, start: BOX / 2 + RING_R * Math.cos(a) - (FACE + 6) / 2 },
            ]}
          >
            <Avatar name={l} size={FACE} />
          </View>
        );
      })}
      <View style={styles.circleCenter}>
        <Icon name="flame" size={26} color={signal[0]} strokeWidth={2} />
      </View>
    </View>
  );
}

/** One friend: face, name, their week as the same rule Today draws, and the one act that fits. */
function MemberRow({ m, onCheer, onNudge }: { m: CrewMemberView; onCheer: (m: CrewMemberView) => void; onNudge: (m: CrewMemberView) => void }) {
  const { t } = useCopy();
  const today = m.lastDays === 0;
  const closed = m.planned > 0 && m.done >= m.planned;
  /* The day, never "N days ago" — a friend's last workout is a fact about a day, and the copy law
     keeps durations out of the product (Decision 1). */
  const status = today
    ? t('crew.trainedTodayOne')
    : closed
      ? t('crew.closedWeek')
      : m.lastDays === 1
        ? t('crew.yesterday')
        : m.lastDays != null && m.lastDays < 7
          ? t('crew.lastOn', { day: t(`weekdayLong.${WEEKDAY_KEYS[(new Date().getDay() - m.lastDays + 7) % 7]}`).replace(/^יום /, '') })
          : m.lastDays != null
            ? t('crew.notThisWeek')
            : '';
  /* One act per friend, and only the one that fits: a word for whoever trained today (once — then it
     says it was sent), a reminder for whoever has been away three days or more. */
  const act = m.me ? null : today ? (m.cheered ? 'sent' : 'cheer') : m.lastDays != null && m.lastDays >= 3 ? 'nudge' : null;
  return (
    <View style={styles.member}>
      <View style={styles.memberRing}>
        <Avatar name={m.name} size={44} />
        {today ? <TodayRing id={`${m.id ?? m.name}`} /> : null}
      </View>
      <View style={styles.memberText}>
        <Text style={styles.memberName} numberOfLines={1}>{m.me ? t('crew.me') : bidi(m.name)}</Text>
        {/* The count rides beside the meter, so the status below has the whole line — "last trained
            on Friday" broke onto two lines beside a button when the three shared one. */}
        <View style={styles.memberMeterRow}>
          <View style={styles.memberMeter}>
            {Array.from({ length: Math.max(1, m.planned) }).map((_, i) => (
              <View key={i} style={[styles.seg, i < m.done ? styles.segDone : styles.segAhead]} />
            ))}
          </View>
          <Text style={styles.memberCount}>{t('crew.ofWeek', { done: m.done, planned: m.planned })}</Text>
        </View>
        {status ? (
          <Text style={[styles.memberStatus, (today || closed) && styles.memberStatusOn]} numberOfLines={1}>
            {status}
          </Text>
        ) : null}
      </View>
      {act === 'sent' ? (
        <View style={[styles.act, styles.actSent]}>
          <Text style={[styles.actText, styles.actTextSent]}>{t('crew.cheered')}</Text>
        </View>
      ) : act ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={act === 'cheer' ? t('crew.cheer') : t('crew.nudge')}
          onPress={() => (act === 'cheer' ? onCheer(m) : onNudge(m))}
          style={({ pressed }) => [styles.act, act === 'cheer' && styles.actCheer, pressed && styles.actPressed]}
        >
          <Text style={[styles.actText, act === 'cheer' && styles.actTextCheer]}>{act === 'cheer' ? t('crew.cheer') : t('crew.nudge')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ShareBlock(props: CrewViewProps) {
  const { t } = useCopy();
  if (!props.onShareSession && !props.onShareWeek && !props.onSendPlan) return null;
  return (
    <Arrive order={3} style={styles.share}>
      <Legend tone="accent">{t('crew.shareLegend')}</Legend>
      {props.onShareSession ? <ShareRow icon="share" title={t('together.shareSession')} onPress={props.onShareSession} /> : null}
      {props.onShareWeek ? <ShareRow icon="calendar" title={t('together.shareWeek')} onPress={props.onShareWeek} /> : null}
      {props.onSendPlan ? <ShareRow icon="layers" title={t('together.sendPlan')} onPress={props.onSendPlan} /> : null}
    </Arrive>
  );
}

function ShareRow({ icon, title, onPress }: { icon: IconName; title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.shareRow, pressed && styles.actPressed]}>
      <Icon name={icon} size={18} color={color.textSecondary} strokeWidth={1.8} />
      <Text style={styles.shareText}>{title}</Text>
      <Icon name="chevronRight" size={16} color={color.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  scroll: { paddingHorizontal: 30, paddingTop: 20, paddingBottom: 48 },
  title: { fontFamily: font.serif, fontSize: 40, lineHeight: 46, color: color.textPrimary, textAlign: 'left' },
  lede: { marginTop: 14, fontFamily: font.sans, fontSize: 19, lineHeight: 27, color: color.textSecondary, textAlign: 'left' },

  hero: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: radius.sheet,
    borderWidth: 1.5,
    borderColor: 'rgba(62,87,63,0.55)',
  },
  heroNum: { fontFamily: font.monoMedium, fontSize: 56, lineHeight: 60, color: signal[0], textAlign: 'center' },
  heroText: { flex: 1, minWidth: 0, gap: 4 },
  heroLine: { fontFamily: font.sansMedium, fontSize: 19, lineHeight: 24, color: color.textPrimary, textAlign: 'left' },
  heroSub: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textSecondary, textAlign: 'left' },

  cheer: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(62,87,63,0.22)',
  },
  cheerText: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textPrimary, textAlign: 'left' },

  list: { marginTop: 18 },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(241,238,229,0.12)',
  },
  memberRing: { borderRadius: 26, borderWidth: 2, borderColor: 'transparent', padding: 1 },
  /* The lit ring sits exactly where `memberRing`'s own border runs, so a face never moves when it lights. */
  todayRing: { position: 'absolute', top: -2, bottom: -2, start: -2, end: -2, borderRadius: 26, borderWidth: 2, borderColor: signal[0] },
  emptyPicture: { marginTop: 22, alignItems: 'center' },
  circleBox: { width: BOX, height: BOX },
  circleTrack: {
    position: 'absolute',
    top: BOX / 2 - RING_R,
    start: BOX / 2 - RING_R,
    width: RING_R * 2,
    height: RING_R * 2,
    borderRadius: RING_R,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.12)',
  },
  circleFace: { position: 'absolute', borderRadius: (FACE + 6) / 2, borderWidth: 2, borderColor: color.bg, padding: 1, backgroundColor: color.bg },
  circleFaceLit: { borderColor: signal[0] },
  circleCenter: {
    position: 'absolute',
    top: BOX / 2 - 28,
    start: BOX / 2 - 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(62,87,63,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberText: { flex: 1, minWidth: 0, gap: 6 },
  memberName: { fontFamily: font.sansMedium, fontSize: 19, lineHeight: 24, color: color.textPrimary, textAlign: 'left' },
  memberMeterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberMeter: { flex: 1, flexDirection: 'row', gap: 4, direction: 'ltr', maxWidth: 120 }, // rtl-ok: a timeline, as on Today
  memberCount: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
  seg: { flex: 1, borderRadius: 2 },
  segDone: { height: 4, backgroundColor: signal[0] },
  segAhead: { height: 1.5, backgroundColor: color.meterLine, marginTop: 1 },
  memberStatus: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
  memberStatusOn: { color: signal[0] },
  act: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.28)',
  },
  actCheer: { borderColor: signal[0] },
  actPressed: { backgroundColor: 'rgba(241,238,229,0.08)' },
  actText: { fontFamily: font.sansMedium, fontSize: 17, lineHeight: 22, color: color.textPrimary, textAlign: 'center' },
  actTextCheer: { color: signal[0] },
  actSent: { borderColor: 'transparent' },
  actTextSent: { color: color.textMuted },

  invite: { marginTop: 24, gap: 10 },
  notice: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textMuted, textAlign: 'left' },
  codeLine: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textSecondary, textAlign: 'left' },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.borderControl,
  },
  /* rtl-ok — an INVITE CODE, not a word: Latin characters and digits, `autoCapitalize='characters'`.
     The tracking is what makes six glyphs readable in groups rather than as a run. */
  joinInput: { flex: 1, fontFamily: font.sansSemibold, fontSize: 20, letterSpacing: 3, color: color.textPrimary, paddingVertical: 8, textAlign: 'left' }, // latin-ok
  joinGo: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.borderControl, borderRadius: 20 },
  joinGoOff: { opacity: 0.4 },
  leave: { marginTop: 34, gap: 12 },
  leaveAsk: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textSecondary, textAlign: 'left' },
  leaveActs: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  leaveText: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
  share: { marginTop: 30, gap: 2 },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(241,238,229,0.12)',
  },
  shareText: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textPrimary, textAlign: 'left' },

  emptyActs: { marginTop: 34, gap: 14 },
  codeLink: { alignSelf: 'center', paddingVertical: 8 },
  codeLinkText: { fontFamily: font.sans, fontSize: 17, color: color.textSecondary, textAlign: 'center', textDecorationLine: 'underline' },
});
