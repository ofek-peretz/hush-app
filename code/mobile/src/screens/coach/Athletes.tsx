/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE FIFTH TAB — מתאמנים. The coach's roster. (the coach track, 2026-09-17)
 *
 * ⛔ FOUNDER, 2026-09-17 (ruling 2): *the coach works in the app first* — a fifth tab for coach
 * accounts, and only for them.
 *
 * ── WHAT THE LIST PUTS FIRST ─────────────────────────────────────────────────────────────────────
 * Two sections, the spec's: **צריכים אותך** (pain, six days of silence, the same lift swapped away
 * three times) over **השבוע** (everyone else, by name). One fact per row — the gravest flag as a
 * clay pill, a new best as a moss one, or the week as pips — and done/planned as a figure on the end
 * edge. The seats figure sits by the title because it is the one number about the COACH.
 *
 * ── THE EMPTY LIST IS THE INVITE ─────────────────────────────────────────────────────────────────
 * A new coach has nobody, and a screen that says "nobody" and then puts the invite at the bottom is
 * a notice. The empty state IS the door: what happens, in three short lines, and the button.
 *
 * Screen split, as everywhere: `AthletesView` is pure (gallery-mountable), `Athletes` owns the wire.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React, { useCallback, useContext, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainParamList } from '@/app/navigation';
import { Arrive, Avatar, Button, Legend, TextField } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { bidi, rtl } from '@/i18n/bidi';
import { color, font, radius, alert as clay } from '@/design/tokens';
import { exerciseDisplayName } from '@/data/exercises';
import type { CoachFlag } from '@/domain/coachTrack';
import {
  ROSTER_SEARCH_MIN,
  filterRosterSections,
  painAreaWords,
  rosterCount,
  rosterSections,
  type RosterRow,
  type RosterSections,
} from '@/domain/coachDesk';
import { currentWeekOpen } from '@/domain/weekCadence';
import { coachInvite, coachRoster, type CoachTrackError, type RosterEntry } from '@/platform/coachTrackClient';
import { shareText, shareViaWhatsApp } from '@/platform/share';
import { track } from '@/platform/telemetry';
import { CoachTrackContext } from '@/state/stores/coachStore';
import { CoachInviteSheet, type CoachInviteState } from './CoachInvite';

/* ─────────────────────────────────────────────────────────────── one row's fact */

/** The pill's words. Pure of React so the gallery and the tab say the same sentence. */
export function flagWords(f: CoachFlag, t: (k: string, p?: Record<string, unknown>) => string): string {
  switch (f.kind) {
    case 'pain': return t('coachTrack.coach.flag.pain', { area: painAreaWords([f.area], t) });
    case 'noWeek': return t('coachTrack.coach.flag.noWeek');
    case 'inactive': return t('coachTrack.coach.flag.inactive', { n: f.days });
    case 'swaps': return t('coachTrack.coach.flag.swaps', { ex: exerciseDisplayName(f.ex), n: f.count });
    case 'best': return t('coachTrack.coach.flag.best', { ex: exerciseDisplayName(f.ex), kg: f.e1rm });
  }
}

function Row({ row, onPress, last }: { row: RosterRow; onPress: () => void; last: boolean }) {
  const { t } = useCopy();
  const good = row.flag?.kind === 'best';
  const pips = row.planned ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.name}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowRule, pressed && styles.rowPressed]}
    >
      <Avatar name={row.name} size={40} />
      <View style={styles.rowText}>
        {/*
          ⛔ A NAME SITS BESIDE THE THING IT NAMES (the elevation pass's own rule, 2026-09-18).
          *
          * The figure was the row's third column, vertically CENTRED — so on any row carrying a
          * flag it sat a line and a half below the name it belongs to, while on a bare row it sat
          * level with it. Twelve athletes, two different relationships between a name and its
          * number, decided by whether that athlete happened to be in pain. It is one line now: the
          * name takes the width it needs, the figure closes the line on the end edge, and the flag
          * or the pips hang under both — which is also what makes the figures a column down the
          * list instead of a zigzag.
        */}
        <View style={styles.nameLine}>
          <Text style={styles.rowName} numberOfLines={1}>{bidi(row.name)}</Text>
          <Text style={styles.rowFigure}>{row.planned != null ? `${row.done}/${row.planned}` : String(row.done)}</Text>
        </View>
        {row.flag ? (
          <View style={[styles.pill, good ? styles.pillGood : styles.pillClay]}>
            <Text style={[styles.pillText, good ? styles.pillTextGood : styles.pillTextClay]} numberOfLines={1}>
              {flagWords(row.flag, t)}
            </Text>
          </View>
        ) : pips > 0 ? (
          <View style={[styles.pips, { flexDirection: rtl ? 'row-reverse' : 'row' }]} accessibilityElementsHidden>
            {Array.from({ length: Math.min(pips, 7) }, (_, i) => (
              <View key={i} style={[styles.pip, i < row.done && styles.pipOn]} />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ─────────────────────────────────────────────────────────────── the pure view */

export interface AthletesViewProps {
  /** Null while the first read is out — the list is not drawn empty before it is known to be. */
  sections: RosterSections | null;
  /** What the coach typed into the search field (`''` = nothing, the whole roster). */
  query: string;
  onQuery: (q: string) => void;
  seats: { used: number; seats: number } | null;
  /** A refusal from the last read, said above the list (the list itself stays). */
  error?: CoachTrackError | null;
  refreshing: boolean;
  onRefresh: () => void;
  onAthlete: (linkId: string) => void;
  onInvite: () => void;
  inviteBusy: boolean;
  onTemplates: () => void;
  /** The seats door (`CoachPlans`) — pressed off the seats figure once every seat is taken. */
  onSeats: () => void;
  /**
   * ⛔ HIS PLAN LAPSED UNDER PEOPLE WHO ARE STILL HERE (`plan.state === 'over_limit'`, 2026-09-18).
   *
   * The seats figure already goes clay when it is spent, and clay is not a sentence: `22 / 10` on a
   * roster of twenty-two tells him NOTHING about why, and the one reading he must never reach is
   * that twelve athletes were taken off him. They were not — the server removes nobody (§6). So it
   * is said here, in words, where he meets it, and the line is the door to the screen that can fix
   * it. Never a silently disabled invite: `onInvite` still answers, with the sheet that explains.
   */
  overLimit?: boolean;
}

export function AthletesView(p: AthletesViewProps) {
  const { t } = useCopy();
  const total = p.sections ? rosterCount(p.sections) : 0;
  const empty = !!p.sections && total === 0;
  const full = !!p.seats && p.seats.used >= p.seats.seats;
  /* ⛔ THE FIELD APPEARS WHEN THE LIST STOPS BEING A PAGE — see `ROSTER_SEARCH_MIN`. Once it is up
     it STAYS up while a query is live: filtering down to two hits must not delete the field that
     made them. */
  const searchable = total > ROSTER_SEARCH_MIN || p.query.trim().length > 0;
  const shown = p.sections ? filterRosterSections(p.sections, p.query) : null;
  const noHits = !!shown && !empty && shown.attention.length === 0 && shown.week.length === 0;
  const inviteLabel = p.inviteBusy ? t('coachTrack.coach.roster.inviteBusy') : t('coachTrack.coach.roster.invite');
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/*
        ⛔ THE HEAD DOES NOT SCROLL, AND THE INVITE LIVES IN IT (2026-09-18).
        *
        * The one act this screen asks of a coach sat at the BOTTOM of the list — so at thirty
        * athletes, inviting the thirty-first meant scrolling past thirty rows to find it, every
        * time. The head is fixed now and carries it: the title, the seats figure and the invite,
        * reachable at any roster length and from any scroll position.
        *
        * The seats stay beside the title because they are the reason the invite can refuse.
      */}
      <Arrive order={0} style={styles.headWrap}>
        <View style={styles.head}>
          <Text style={styles.title}>{t('coachTrack.coach.roster.title')}</Text>
            {/*
              ⛔ THE ONE NUMBER ABOUT THE COACH SAYS WHEN IT IS SPENT (2026-09-18).
              *
              * `2 / 2` and `12 / 30` were the same cream figure, so the only place a full roster
              * was ever stated was inside a sheet he had to press Invite to reach — and find out
              * there. A full roster is NEWS, and this is where the fact already lives; it goes clay
              * and becomes the door, because the answer to it is one screen away.
            */}
          <View style={styles.headActs}>
            {p.seats ? (
              <Pressable
                onPress={full ? p.onSeats : undefined}
                disabled={!full}
                hitSlop={10}
                {...(full ? { accessibilityRole: 'button' as const } : {})}
                accessibilityLabel={t(full ? 'coachTrack.coach.roster.seatsFullLabel' : 'coachTrack.coach.roster.seatsLabel', { used: p.seats.used, seats: p.seats.seats })}
              >
                <Text style={[styles.seats, full && styles.seatsFull]}>{`${p.seats.used} / ${p.seats.seats}`}</Text>
              </Pressable>
            ) : null}
            {/*
              ⛔ EXACTLY ONE INVITE ON THE GLASS, AT EVERY LENGTH (walked 2026-09-18).
              *
              * The same threshold as the search, and for the same reason: while the list is a PAGE
              * the act belongs at the end of it, full width, where it is the conclusion of the
              * screen — and a head action beside it would print the one thing this screen asks
              * twice in one view. Past `ROSTER_SEARCH_MIN` the end of the list is thirty rows away,
              * the full-width button goes, and this becomes the invite. The empty state is the
              * third case and is itself the invite, so the head carries nothing there either.
            */}
            {!empty && searchable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={inviteLabel}
                onPress={p.onInvite}
                disabled={p.inviteBusy}
                hitSlop={8}
                style={({ pressed }) => [styles.headInvite, pressed && styles.headInvitePressed]}
              >
                <Icon name="plus" size={16} color={color.textPrimary} strokeWidth={2.2} />
                <Text style={styles.headInviteText}>{t('coachTrack.coach.roster.inviteShort')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        {p.error ? (
          <Text style={styles.error}>{t(`coachTrack.coach.error.${p.error}`, { defaultValue: t('coachTrack.coach.error.network') })}</Text>
        ) : null}
        {p.overLimit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('coachTrack.coach.roster.overLimit')}
            onPress={p.onSeats}
            style={({ pressed }) => [styles.overLimit, pressed && styles.rowPressed]}
          >
            <Text style={styles.overLimitText}>{t('coachTrack.coach.roster.overLimit')}</Text>
          </Pressable>
        ) : null}
        {searchable ? (
          <TextField
            block
            leading={<Icon name="search" size={19} color={color.textMuted} strokeWidth={1.8} />}
            value={p.query}
            onChangeText={p.onQuery}
            placeholder={t('coachTrack.coach.roster.search')}
            accessibilityLabel={t('coachTrack.coach.roster.search')}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            style={styles.search}
            /* ⚠️ NOT THE FIELD'S 30-POINT DEFAULT. That size is for a SINGLE ANSWER (a name, a
               weight) and it is the only thing on its screen; here it would sit directly under a
               32-point serif title and read as a second heading — the fault the magnifier was added
               to this component for, at a size the magnifier cannot fix. 20 is the sentence voice
               (`inputStyle`, the intake's ask), and it reads as a field. */
            inputStyle={styles.searchInput}
          />
        ) : null}
      </Arrive>

      <ScrollView
        contentContainerStyle={styles.wrap}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.onRefresh} tintColor={color.textMuted} />}
      >

        {/* Nothing is known yet and the last read refused — say so, and give him the way to ask
            again. Pull-to-refresh is there, and a gesture nobody can see is not an answer. */}
        {p.sections === null && p.error ? (
          <Arrive order={1}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('coachTrack.coach.roster.unknownTitle')}</Text>
              <Text style={styles.emptyLine}>{t('coachTrack.coach.roster.unknownBody')}</Text>
              <Button
                block
                variant="secondary"
                label={t('coachTrack.coach.roster.retry')}
                onPress={p.onRefresh}
                disabled={p.refreshing}
                style={styles.emptyAct}
              />
            </View>
          </Arrive>
        ) : null}

        {empty ? (
          <Arrive order={1}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('coachTrack.coach.roster.emptyTitle')}</Text>
              <Text style={styles.emptyLine}>{t('coachTrack.coach.roster.emptyStep1')}</Text>
              <Text style={styles.emptyLine}>{t('coachTrack.coach.roster.emptyStep2')}</Text>
              <Text style={styles.emptyLine}>{t('coachTrack.coach.roster.emptyStep3')}</Text>
              <Button
                block
                variant="signal"
                label={p.inviteBusy ? t('coachTrack.coach.roster.inviteBusy') : t('coachTrack.coach.roster.invite')}
                onPress={p.onInvite}
                disabled={p.inviteBusy}
                style={styles.emptyAct}
              />
            </View>
          </Arrive>
        ) : shown ? (
          <Arrive order={1}>
            {/* ⛔ THE FLAGGED SECTION IS PINNED, SEARCH OR NO SEARCH (`filterRosterSections`): a query
                narrows each section in place and never merges them into one ranked list. */}
            {shown.attention.length > 0 ? (
              <>
                <Legend size={17} track={0.1} style={styles.section}>{t('coachTrack.coach.roster.needsYou')}</Legend>
                {shown.attention.map((r, i) => (
                  <Row key={r.linkId} row={r} onPress={() => p.onAthlete(r.linkId)} last={i === shown.attention.length - 1} />
                ))}
              </>
            ) : null}
            {shown.week.length > 0 ? (
              <>
                <Legend size={17} track={0.1} style={styles.section}>{t('coachTrack.coach.roster.thisWeek')}</Legend>
                {shown.week.map((r, i) => (
                  <Row key={r.linkId} row={r} onPress={() => p.onAthlete(r.linkId)} last={i === shown.week.length - 1} />
                ))}
              </>
            ) : null}
            {/* Honest, and it names what was typed — "nothing" with no subject reads as a broken
                screen (the library search's own rule). */}
            {noHits ? <Text style={styles.noMatches}>{t('coachTrack.coach.roster.noMatches', { q: p.query.trim() })}</Text> : null}
            {/*
              ⛔ THE ONE ACT OF A FULL ROSTER HAS TO LOOK LIKE ONE. `ghost` is a bare centred line on
              the dark stage — under twelve ruled rows it read as a caption, and it is the only
              thing this screen asks him to do. `secondary` gives it the edge every other control
              in the product has, without taking the cream the training act owns.

              ⚠️ AND ONLY WHILE THE LIST IS SHORT (2026-09-18). At three athletes the invite is the
              point of the screen and earns a full-width control at the end of it; at thirty it is a
              button nobody can find, which is why the head carries one now. Past `ROSTER_SEARCH_MIN`
              this one goes, rather than printing the same act twice on a screen he has to scroll.
            */}
            {!searchable ? (
              <Button
                block
                variant="secondary"
                label={inviteLabel}
                onPress={p.onInvite}
                disabled={p.inviteBusy}
                style={styles.invite}
              />
            ) : null}
          </Arrive>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('coachTrack.coach.roster.templates')}
          onPress={p.onTemplates}
          style={({ pressed }) => [styles.templates, pressed && styles.rowPressed]}
        >
          <View style={styles.rowText}>
            <Text style={styles.templatesLabel}>{t('coachTrack.coach.roster.templates')}</Text>
            <Text style={styles.templatesSub}>{t('coachTrack.coach.roster.templatesSub')}</Text>
          </View>
          <Icon name="chevronRight" size={18} color={color.textMuted} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────────────────── the container */

export function Athletes() {
  const { t } = useCopy();
  /* A tab screen: `navigate` bubbles to the main stack, where the trainee and the templates live. */
  const navigation = useNavigation<NativeStackNavigationProp<MainParamList>>();
  const track$ = useContext(CoachTrackContext);
  const coach = track$?.coach ?? null;
  const overLimit = track$?.plan?.state === 'over_limit';
  const refreshMe = track$?.refreshMe;
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState<CoachTrackError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  /** The search field's text. Lives on the container so a refresh does not clear what he typed. */
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<CoachInviteState | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const [r] = await Promise.all([coachRoster(), refreshMe ? refreshMe().catch(() => null) : null]);
    if (r.ok) {
      setRoster(r.value.athletes);
      setError(null);
    } else {
      setError(r.error);
      /*
       * ⛔ A FAILED READ IS NOT AN EMPTY ROSTER (2026-09-18, walked offline on glass).
       *
       * This said `prev ?? []` — so a coach who opened the tab with no signal was handed the
       * EMPTY STATE: "no athletes yet", the three-step invite pitch and a WhatsApp button, under a
       * one-line "no connection" he had every reason to read as being about something else. He has
       * twelve athletes. Nothing was known about them and the screen answered anyway.
       *
       * `null` means NOT KNOWN, and the view now draws that as its own state. A roster already on
       * the glass is kept, because a failed refresh must never blank a list he is reading.
       */
      setRoster((prev) => prev);
    }
  }, [refreshMe]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const sections = useMemo(() => {
    if (!roster) return null;
    const now = Date.now();
    return rosterSections(roster, now, currentWeekOpen(now));
  }, [roster]);

  const messageFor = (code: string, url: string) => t('coachTrack.coach.invite.message', { coach: coach?.name ?? '', link: url, code });

  const sendWhatsApp = async (code: string, url: string) => {
    /* The pair's pattern, now shared with the trainee's dropped-lift ask (`platform/share`):
       straight into WhatsApp, the OS sheet when nothing answers `whatsapp:`, `wa.me` on the web. */
    const via = await shareViaWhatsApp(messageFor(code, url));
    if (via !== 'error') void track('coach_invited', { via });
  };

  const onInvite = async () => {
    if (coach && coach.used >= coach.seats) {
      /* ⚠️ THE SHEET, NOT A DEAD BUTTON. The server would answer 409 `seats_full`; saying it here
         costs no call and says WHICH of the two situations it is (see `CoachInviteState.full`). */
      setSheet({ kind: 'full', used: coach.used, seats: coach.seats, ...(overLimit ? { overLimit: true } : {}) });
      return;
    }
    setInviteBusy(true);
    const r = await coachInvite();
    setInviteBusy(false);
    if (!r.ok) {
      setSheet({ kind: 'error', error: r.error });
      return;
    }
    setCopied(false);
    setSheet({ kind: 'invite', code: r.value.code, url: r.value.url });
    await sendWhatsApp(r.value.code, r.value.url);
  };

  const canCopy = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.clipboard;
  const onCopy = async () => {
    if (sheet?.kind !== 'invite') return;
    if (canCopy) {
      await navigator.clipboard.writeText(sheet.code).catch(() => {});
      setCopied(true);
    } else {
      await shareText(sheet.code).catch(() => 'error' as const);
    }
  };

  return (
    <>
      <AthletesView
        sections={sections}
        query={query}
        onQuery={setQuery}
        seats={coach ? { used: coach.used, seats: coach.seats } : null}
        error={error}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onAthlete={(linkId) => {
          const a = roster?.find((x) => x.linkId === linkId);
          navigation.navigate('AthleteDetail', { linkId, ...(a ? { name: a.name } : {}) });
        }}
        onInvite={() => void onInvite()}
        inviteBusy={inviteBusy}
        onTemplates={() => navigation.navigate('CoachTemplates')}
        onSeats={() => navigation.navigate('CoachPlans')}
        overLimit={overLimit}
      />
      {sheet ? (
        <CoachInviteSheet
          state={sheet}
          onWhatsApp={() => { if (sheet.kind === 'invite') void sendWhatsApp(sheet.code, sheet.url); }}
          onCopy={() => void onCopy()}
          copyLabel={canCopy ? (copied ? t('coachTrack.coach.invite.copied') : t('coachTrack.coach.invite.copy')) : t('coachTrack.coach.invite.sendCode')}
          onSeats={() => { setSheet(null); navigation.navigate('CoachPlans'); }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  wrap: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 48 },
  /* The fixed head: it holds the title, the seats and the invite at every scroll position. */
  headWrap: { paddingHorizontal: 20, paddingTop: 20 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  headActs: { flexDirection: 'row', alignItems: 'baseline', gap: 14 },
  /* Quiet: a mark and a short word, no fill — the roster's rows are what this screen is FOR, and a
     lit control in the corner would out-shout every athlete on it. */
  headInvite: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 8, marginEnd: -8, borderRadius: radius.md },
  headInvitePressed: { backgroundColor: color.surface },
  headInviteText: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary, textAlign: 'left' },
  search: { marginTop: 8, marginBottom: 2 },
  searchInput: { fontSize: 20, lineHeight: 28 },
  noMatches: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textMuted, textAlign: 'left', marginTop: 22 },
  title: { fontFamily: font.serif, fontSize: 32, lineHeight: 40, color: color.textPrimary, textAlign: 'left' },
  /* The seats — the one number about the coach, in the instrument face. */
  seats: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 18, color: color.textSecondary, textAlign: 'right' },
  seatsFull: { color: clay.stage },
  error: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textSecondary, textAlign: 'left', marginTop: 6 },
  /* Clay, because it is the one thing on this screen that needs him — and pressable, because the
     answer to it is one screen away. Not a card: his athletes are the page, not this. */
  overLimit: { marginTop: 8, marginHorizontal: -6, paddingHorizontal: 6, paddingVertical: 6, borderRadius: radius.md },
  overLimitText: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: clay.stage, textAlign: 'left' },
  section: { marginTop: 22, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: color.border },
  rowPressed: { backgroundColor: color.surface },
  rowText: { flex: 1, gap: 4, paddingTop: 7 },
  nameLine: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  rowName: { flex: 1, fontFamily: font.sansSemibold, fontSize: 18, lineHeight: 24, color: color.textPrimary, textAlign: 'left' },
  /* done/planned — a figure, on the end edge, where it forms a column down the list. */
  rowFigure: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 17, color: color.textSecondary, textAlign: 'right' },
  pill: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 2 },
  /* ⛔ CLAY IS FOR WHAT NEEDS HIM — pain, silence, a lift that is not working. Moss is good news. */
  pillClay: { backgroundColor: clay.wash },
  pillGood: { backgroundColor: color.accentWash },
  pillText: { fontFamily: font.sans, fontSize: 17, textAlign: 'left' },
  pillTextClay: { color: clay.stage },
  pillTextGood: { color: color.accentText },
  pips: { gap: 4, marginTop: 2 },
  pip: { width: 14, height: 4, borderRadius: 2, backgroundColor: color.borderStrong },
  pipOn: { backgroundColor: color.accent },
  invite: { marginTop: 18 },
  emptyCard: { marginTop: 18, backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: 18, gap: 8 },
  emptyTitle: { fontFamily: font.serif, fontSize: 24, lineHeight: 31, color: color.textPrimary, textAlign: 'left', marginBottom: 4 },
  emptyLine: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, textAlign: 'left' },
  emptyAct: { marginTop: 10 },
  templates: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28, paddingVertical: 14, borderTopWidth: 1, borderTopColor: color.border },
  templatesLabel: { fontFamily: font.sansSemibold, fontSize: 18, color: color.textPrimary, textAlign: 'left' },
  templatesSub: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'left' },
});
