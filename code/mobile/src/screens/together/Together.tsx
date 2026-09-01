/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * TOGETHER — the social home (founder, 2026-08-23: *"החלק החברתי צריך להיות נישה נפרדת. יש מלא
 * דברים ב-You שסתם דחפנו לשם."*).
 *
 * Everything that moves between PEOPLE lives here, and only here:
 *   · the story cards, ON DEMAND — the finish and the letter offer them at their moments, and this
 *     is the place she comes back to when the moment passed and she still wants to post;
 *   · the programme, travelling — send yours to a friend, bring the one a friend (or a coach)
 *     sent, the moss door that used to sit in You;
 *   · the workouts she trained WITH someone — the together record;
 *   · and THE CIRCLE (the shared group — week letters and cards between friends) gets built INTO
 *     this screen when its CloudKit cycle lands. Its home exists before it does, so it will not be
 *     "pushed somewhere" the way this screen exists to end.
 *
 * You, after this move, is what it says: her identity, her body, her settings, her membership,
 * her record. Nothing here reports training — Progress owns that; this screen is about the people
 * around hers.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Icon, type IconName } from '@/components/Icon';
import { Arrive } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { loadWeekPlan } from '@/data/local/weekPlan';
import {
  sessionCardFromHistory,
  weekCardFromHistory,
  type ShareSessionCard,
  type ShareWeekCard,
} from '@/domain/shareCard';
import { color, font, textScale, signal} from '@/design/tokens';
import { circleWeekPayload, circleWeekTotal, togetherCount, type CircleState } from '@/domain/circle';
import { usePair } from '@/state/stores/pairStore';
import { TrainTogetherSheet } from '@/components/TrainTogetherSheet';
import {
  circleCreate,
  circleFetch,
  circleJoin,
  circleLeave,
  circlePublishWeek,
  circleSignedIn,
} from '@/platform/circleClient';
import { currentWeekOpen } from '@/domain/weekCadence';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Together'>;

/** Everything the screen draws, as data — the gallery mounts this half with fixtures. */
export interface TogetherViewProps {
  /** The latest session's story card; null before her first saved workout. */
  sessionCard: ShareSessionCard | null;
  /** This week's card; null on a week with nothing logged. */
  weekCard: ShareWeekCard | null;
  /** A week exists to send. */
  hasPlan: boolean;
  /** Workouts in her record that carry partners. 0 draws nothing — never an empty boast. */
  sharedCount: number;
  /**
   * THE CIRCLE (2026-08-24). `circleReady` = this build carries the identity worker AND she has a
   * session — false draws NOTHING (the pre-circle screen, exactly as before; a build with no
   * server never shows a door to nowhere). `circle` = her circle's week, null when she is not in
   * one yet.
   */
  circleReady: boolean;
  /**
   * ⛔ THE WEEK, BETWEEN THEM — one number for everybody, never a table (founder, 2026-08-31, and
   * `domain/circle.circleWeekTotal` for the two arguments that shaped it). Absent = no circle, or
   * a circle nobody has trained in yet, and the block is simply not drawn.
   */
  weekTogether?: { done: number; people: number } | null;
  /**
   * ⛔ THE SAME DERIVATION `sharedCount` COMES FROM, and that is the point of it.
   *
   * The first build had this counting THIS MONTH while `sharedCount` counted ALL TIME, four lines
   * apart on the same screen — two numbers for one fact, which reads as a contradiction whether or
   * not both are right (`aCountAndItsRowsAreOneDerivation`). Now the container computes both from
   * one call to `togetherCount`, and this contributes the only thing the count never could: WHO.
   */
  trainedTogether?: { count: number; names: string[] } | null;
  /** §11.2's door, for the athlete who came looking for it in the social home rather than on
   *  Today. Absent draws nothing — a build with no wire has no room to open. */
  onTrainTogether?: () => void;
  circle: CircleState | null;
  onCreateCircle: () => void;
  /** Resolves false when the code opened no door — the section says so in words. */
  onJoinCircle: (code: string) => Promise<boolean> | boolean | void;
  onLeaveCircle: () => void;
  onShareSession: () => void;
  onShareWeek: () => void;
  onSendPlan: () => void;
  onBringPlan: () => void;
  onBack: () => void;
}

export function TogetherView(props: TogetherViewProps) {
  const { t } = useCopy();
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={props.onBack}
          style={styles.back}
        >
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/*
          ✦ IT ARRIVES (2026-08-27). `Arrive` was built for the founder's largest note — a screen
          should ARRIVE, not appear (2026-08-12) — and reached six screens out of forty-seven.

          Two beats here and no more: this screen is a MENU, and a menu whose every row lands on its
          own beat is a screen performing rather than answering. The name and the sentence that
          splits it arrive; the doors follow together, because they are peers.
        */}
        <Arrive order={0}>
          <Text style={styles.title} accessibilityRole="header">{t('together.title')}</Text>
          <Text style={styles.sub}>{t('together.sub')}</Text>
        </Arrive>

        {/* ── the cards, on demand ── */}
        {props.sessionCard || props.weekCard ? (
          <>
            {props.sessionCard ? (
              <DoorRow
                icon="share"
                title={t('together.shareSession')}
                sub={bidi(props.sessionCard.dayName) || t('together.shareSessionSub')}
                onPress={props.onShareSession}
              />
            ) : null}
            {props.weekCard ? (
              <DoorRow icon="calendar" title={t('together.shareWeek')} sub={t('together.shareWeekSub')} onPress={props.onShareWeek} />
            ) : null}
          </>
        ) : null}

        {/*
          ⛔ §11.2's DOOR, HERE AS WELL AS ON TODAY (founder, 2026-08-31: *"ל-Together אין דלת
          לזוג"*). Two doors, and both of them are right: Today is where two brothers standing in a
          gym are looking, and this is where somebody who heard the feature exists comes to find it.
          The sub-line says where the act actually happens, so the row is a signpost and never a
          button that half-works.
        */}
        {props.onTrainTogether ? (
          <DoorRow icon="twoPeople" title={t('together.pairTitle')} sub={t('together.pairSub')} onPress={props.onTrainTogether} />
        ) : null}

        {/* ── the programme, travelling — the moss door that used to sit in You ── */}
        {props.hasPlan ? (
          <DoorRow icon="layers" title={t('together.sendPlan')} sub={t('together.sendPlanSub')} onPress={props.onSendPlan} />
        ) : null}
        <DoorRow icon="camera" title={t('together.bringPlan')} sub={t('together.bringPlanSub')} onPress={props.onBringPlan} last />

        {/* ── the together record — a fact, only when it is one ── */}
        {props.sharedCount > 0 ? (
          <Text style={styles.sharedFact}>{t('together.sharedCount', { count: props.sharedCount })}</Text>
        ) : null}
        {/* Who she actually stood next to — her own history answers it, so it survives a dead wire,
            an empty circle and no account. NO SECOND NUMBER: the count is said once, above. */}
        {props.trainedTogether && props.trainedTogether.names.length > 0 ? (
          <Text style={styles.sharedNames}>
            {t('together.trainedWithNames', { name: bidi(props.trainedTogether.names.join(' · ')) })}
          </Text>
        ) : null}

        {/*
          ════ ⛔ THE WEEK, BETWEEN THEM — the community fact, and the shape it deliberately is not ═

          A SUM, with everybody on one side of it. Not a table, not an order, not a tonne: see
          `domain/circle.circleWeekTotal` for why a leaderboard on this screen would pay an athlete
          to disobey the coach on the one surface built to make her feel part of something.

          ⚠️ AND IT COSTS NOTHING TO CARRY. `done` already crosses the wire, so this needed no new
          field and no allow-list decision — which is the tell that it was the right fact to choose.
        */}
        {props.weekTogether && props.weekTogether.people > 0 ? (
          <View style={styles.community}>
            <Text style={styles.communityTitle}>{t('together.communityTitle')}</Text>
            <Text style={styles.communityLine}>
              {props.weekTogether.done > 0
                ? t('together.weekTogether', { count: props.weekTogether.done })
                : t('together.weekAlone')}
            </Text>
            <Text style={styles.communitySub}>{t('together.communitySub')}</Text>
          </View>
        ) : null}



        {/*
          ════ THE CIRCLE (2026-08-24) — landed, exactly where its home was held. ════
          Up to six partners, an invite code, and ONE fact each: workouts done of planned this
          week (domain/circle's allow-list — nothing else ever travels). Drawn ONLY when this
          build carries the identity worker and she is signed into it (`circleReady`) — a build
          without the server keeps the pre-circle screen, and no door to nowhere exists
          (`nothingIsBuiltForNobody` stands).
        */}
        {props.circleReady ? (
          <CircleSection
            circle={props.circle}
            onCreate={props.onCreateCircle}
            onJoin={props.onJoinCircle}
            onLeave={props.onLeaveCircle}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CircleSection({
  circle,
  onCreate,
  onJoin,
  onLeave,
}: {
  circle: CircleState | null;
  onCreate: () => void;
  onJoin: (code: string) => Promise<boolean> | boolean | void;
  onLeave: () => void;
}) {
  const { t } = useCopy();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [joinFailed, setJoinFailed] = useState(false);

  if (!circle) {
    return (
      <View style={styles.circleWrap}>
        <Text style={styles.circleTitle}>{t('together.circleTitle')}</Text>
        <Text style={styles.circleSub}>{t('together.circleSub')}</Text>
        <DoorRow title={t('together.circleCreate')} sub={t('together.circleCreateSub')} onPress={onCreate} />
        <DoorRow
          title={t('together.circleJoin')}
          sub={t('together.circleJoinSub')}
          onPress={() => setJoining((j) => !j)}
          last={!joining}
        />
        {joining ? (
          <View style={styles.joinRow}>
            <TextInput
              style={styles.joinInput}
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              // A SAMPLE CODE, not a word — the same six-glyph shape in every language, so the
              // literal is the honest form and the mono face is exactly right for it.
              placeholder="ABC234"
              placeholderTextColor={color.textTertiary}
              accessibilityLabel={t('together.circleJoin')}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('together.circleJoin')}
              disabled={code.trim().length < 6}
              onPress={() => {
                setJoinFailed(false);
                void (async () => {
                  const ok = await onJoin(code.trim());
                  if (ok === false) setJoinFailed(true);
                })();
              }}
              style={({ pressed }) => [styles.joinGo, code.trim().length < 6 && styles.joinGoOff, pressed && styles.rowPressed]}
            >
              <Icon name="chevronRight" size={18} color={color.textPrimary} />
            </Pressable>
          </View>
        ) : null}
        {joining && joinFailed ? <Text style={styles.circleSub}>{t('together.circleJoinFailed')}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.circleWrap}>
      <Text style={styles.circleTitle}>{t('together.circleTitle')}</Text>
      {/* The invite code is a FACT she hands a friend — printed plainly, no share machinery. */}
      <Text style={styles.circleCode}>{t('together.circleCodeLine', { code: circle.code })}</Text>
      {circle.members.map((m, i) => (
        <View key={i} style={[styles.memberRow, i === circle.members.length - 1 && styles.rowLast]}>
          <Text style={styles.memberName} numberOfLines={1}>{bidi(m.name)}</Text>
          <Text style={styles.memberWeek}>{t('together.circleMemberWeek', { done: m.done, planned: m.planned })}</Text>
        </View>
      ))}
      {circle.members.length <= 1 ? <Text style={styles.circleSub}>{t('together.circleAlone')}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('together.circleLeave')}
        onPress={onLeave}
        style={({ pressed }) => [styles.leave, pressed && styles.rowPressed]}
      >
        <Text style={styles.leaveText}>{t('together.circleLeave')}</Text>
      </Pressable>
    </View>
  );
}

function DoorRow({ title, sub, icon, onPress, last }: { title: string; sub: string; icon?: IconName; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.rowPressed]}
    >
      {/* ⛔ FIVE DOORS, FIVE FACES (founder 2026-09-01, treating the review's S8 on this hub).
          Five identical text rows ended a third of the way down the screen and left the rest
          black; a glyph per door gives each a face and the column its weight — the same seat the
          settings rows use. The space below stops reading as leftover because the list now OWNS
          its height. */}
      {icon ? (
        <View style={styles.rowIconBox}>
          <Icon name={icon} size={22} color={signal[0]} strokeWidth={1.8} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={color.textMuted} />
    </Pressable>
  );
}

export function Together({ navigation }: Props) {
  const app = useApp();
  const [sessionCard, setSessionCard] = useState<ShareSessionCard | null>(null);
  const [weekCard, setWeekCard] = useState<ShareWeekCard | null>(null);
  const [hasPlan, setHasPlan] = useState(false);
  const [sharedCount, setSharedCount] = useState(0);
  const [circleReady, setCircleReady] = useState(false);
  const [circle, setCircle] = useState<CircleState | null>(null);
  const [trainedTogether, setTrainedTogether] = useState<{ count: number; names: string[] } | null>(null);
  /* §11.2's sheet, opened from the social home as well as from Today. */
  const [pairing, setPairing] = useState(false);
  const pair = usePair();

  /*
   * Her week goes OUT, then the circle's comes back — both best-effort, both quiet. Publishing on
   * this screen's open is the whole cadence: the circle is a place she visits, never a stream that
   * visits her (no push, no badge — the no-nag law extends to other people's phones).
   */
  const refreshCircle = useCallback(async () => {
    const ready = await circleSignedIn();
    setCircleReady(ready);
    if (!ready) return;
    const [history, weekOpen] = await Promise.all([
      db.loadHistory().catch(() => []),
      db.loadWeekOpen().catch(() => null),
    ]);
    const payload = circleWeekPayload({
      name: app.profile?.name,
      sessions: history,
      plannedPerWeek: app.profile?.daysPerWeek ?? 0,
      weekOpenMs: weekOpen ?? currentWeekOpen(Date.now()),
    });
    if (payload) await circlePublishWeek(payload);
    setCircle(await circleFetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.profile?.name, app.profile?.daysPerWeek]);



  useEffect(() => {
    void refreshCircle();
  }, [refreshCircle]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [history, weekOpenMs, plan] = await Promise.all([
        db.loadHistory().catch(() => []),
        db.loadWeekOpen().catch(() => null),
        loadWeekPlan().catch(() => null),
      ]);
      if (!alive) return;
      const units = app.profile?.units ?? 'kg';
      const sex = app.profile?.sex === 'male' ? ('male' as const) : ('female' as const);
      setSessionCard(sessionCardFromHistory(history, units, app.profile?.weightKg, sex));
      setWeekCard(
        weekOpenMs != null
          ? weekCardFromHistory(history, weekOpenMs, app.profile?.weightKg, units, app.profile?.memberSince)
          : null,
      );
      setHasPlan(plan != null);
      /*
       * ⛔ ONE DERIVATION, TWO READERS. The count and the names are the same question about the same
       * sessions, and the first build asked it twice — once here with an inline filter and once in
       * an effect of its own over a different window. That produced two numbers for one fact on one
       * screen. `togetherCount(history, 0)` is the whole answer; the screen shows the count once and
       * the names under it.
       */
      const together = togetherCount(history, 0);
      setSharedCount(together.count);
      setTrainedTogether(together);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
    <TogetherView
      sessionCard={sessionCard}
      weekCard={weekCard}
      hasPlan={hasPlan}
      sharedCount={sharedCount}
      circleReady={circleReady}
      circle={circle}
      weekTogether={circle ? circleWeekTotal(circle.members) : null}
      trainedTogether={trainedTogether}
      onTrainTogether={pair.ready ? () => setPairing(true) : undefined}
      onCreateCircle={() => {
        void circleCreate().then(() => refreshCircle());
      }}
      onJoinCircle={async (code) => {
        const ok = await circleJoin(code);
        if (ok) await refreshCircle();
        return ok;
      }}
      onLeaveCircle={() => {
        void circleLeave().then(() => refreshCircle());
      }}
      onShareSession={() => {
        if (sessionCard) navigation.navigate('ShareCardModal', { card: sessionCard });
      }}
      onShareWeek={() => {
        if (weekCard) navigation.navigate('ShareCardModal', { card: weekCard });
      }}
      onSendPlan={() => navigation.navigate('SharePlan')}
      onBringPlan={() => navigation.navigate('ImportPlan')}
      onBack={() => navigation.goBack()}
    />
    {/*
      ⛔ NO `onBegin` HERE, AND THAT IS THE HONEST SHAPE. A workout starts from Today, through the
      Begin she presses every day — the pair opens no second door into the start path (see
      `TrainTogetherSheet`'s header). So from this screen the HOST opens a room and is told to go
      and start; the GUEST can begin outright, because his session is composed here either way.
    */}
    {pairing ? (
      <TrainTogetherSheet
        onClose={() => setPairing(false)}
        onStarted={() => navigation.navigate('SessionFlow')}
        onGated={() => navigation.navigate('Paywall', { source: 'gate' })}
      />
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  top: { paddingHorizontal: 26, paddingTop: 6, minHeight: 40, justifyContent: 'center' },
  back: { width: 22, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  scroll: { paddingHorizontal: 30, paddingBottom: 40 },
  title: { fontFamily: font.serif, fontSize: 40, lineHeight: 44, color: color.textPrimary, textAlign: 'left', marginTop: 6 },
  sub: {
    fontFamily: font.sans,
    fontSize: textScale.base,
    lineHeight: 24,
    color: color.textSecondary,
    textAlign: 'left',
    marginTop: 8,
    marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: color.borderControl,
  },
  /* The glyph's seat — the moss-wash disc the board rows use, one grammar across the product. */
  rowIconBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(169,196,159,0.12)' },
  rowLast: { borderBottomWidth: 1, borderBottomColor: color.borderControl },
  rowPressed: { backgroundColor: 'rgba(241,238,229,0.06)' },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontFamily: font.sansMedium, fontSize: 20, color: color.textPrimary, textAlign: 'left' },
  rowSub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  sharedFact: {
    fontFamily: font.sans,
    fontSize: textScale.sm,
    lineHeight: 22,
    color: color.textMuted,
    textAlign: 'left',
    marginTop: 18,
  },
  /* ── the circle ── */
  /* Directly under the count it belongs to, and quieter — it is the same fact, elaborated. */
  sharedNames: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textTertiary, marginTop: 2, textAlign: 'left' },

  community: { marginTop: 22 },
  communityTitle: { fontFamily: font.sansSemibold, fontSize: 19, lineHeight: 24, color: color.textPrimary, textAlign: 'left' },
  communityLine: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textSecondary, marginTop: 4, textAlign: 'left' },
  communitySub: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textTertiary, marginTop: 4, textAlign: 'left' },

  circleWrap: { marginTop: 28 },
  circleTitle: { fontFamily: font.serif, fontSize: 28, lineHeight: 34, color: color.textPrimary, textAlign: 'left' },
  circleSub: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 22, color: color.textMuted, textAlign: 'left', marginTop: 6, marginBottom: 10 },
  circleCode: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 24, color: color.textSecondary, textAlign: 'left', marginTop: 6, marginBottom: 10 },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: color.borderControl },
  /* rtl-ok — an INVITE CODE, not a word: `circleClient` mints it from Latin characters and digits
     and the field is `autoCapitalize='characters'`, so there is no Hebrew for the tracking to
     open. Three points of it is what makes a code readable in groups rather than as a run. */
  joinInput: { flex: 1, fontFamily: font.sansSemibold, fontSize: 20, letterSpacing: 3, color: color.textPrimary, paddingVertical: 8, textAlign: 'left' }, // latin-ok
  joinGo: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.borderControl, borderRadius: 20 },
  joinGoOff: { opacity: 0.4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 16, borderTopWidth: 1, borderTopColor: color.borderControl },
  memberName: { flex: 1, fontFamily: font.sansMedium, fontSize: 20, color: color.textPrimary, textAlign: 'left' },
  memberWeek: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  leave: { marginTop: 14, alignSelf: 'flex-start' },
  leaveText: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
});
