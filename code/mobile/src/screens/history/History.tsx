/**
 * History — "Progress · Log" (v7 3.3). The month-chaptered ledger: a single reverse-chronological
 * timeline of everything recorded — completed strength sessions AND recorded cardio (run / walk).
 *
 * Rebuilt 1:1 from the handoff (3.3). It is the LOG lens of the Progress tab: the header is the same
 * serif "Progress" + Lifts / Log toggle the Lifts lens wears (ProgressLifts), with Log active; the
 * toggle's Lifts segment returns to that lens. A one-line summary sits under it ("18 sessions · 46.8 t
 * moved."), then the timeline reads in month chapters ("July" in the coach's serif) with compact rows:
 *
 *   · a date column — weekday (sans) over the day number (mono)
 *   · the name — "Upper A" / "Run · 4.2 km" — with a mono-free meta line ("6 lifts · 52 min",
 *     "318 kcal · 141 avg hr")
 *   · a trailing mark — strength: "N up" in moss (the raises that session); cardio: "recorded"
 *   · a chevron into the read-only record (WorkoutDetail) or the cardio details (CardioDetail)
 *
 * Everything is display arithmetic over the logged history (db.loadHistory / db.loadCardio); no engine
 * type is read. Durations read in MINUTES, never as a clock ("52 min", not "0:52").
 *
 * THE LEDGER SPEAKS IN MONO (v7 3.3). The weekday, the meta line, "3 UP", "RECORDED" — the handoff
 * sets every one of them in IBM Plex Mono, because a ledger's columns are READINGS, not prose, and
 * they have to align down the page. The Hebrew problem the old sans-everything rule solved is solved
 * a better way now: `Legend` picks the face from the STRING (`monoVoice`), so an English ledger reads
 * exactly as the handoff draws it and a Hebrew one falls back to Assistant instead of breaking.
 */

// 

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Arrive, SegmentedControl, Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import type { CardioActivity, HistoryItem, Session } from '@/data/local/models';
import { sessionDayName } from '@/domain/schedule';
import { durationMinutes } from '@/domain/duration';
import { cardioPerformed } from '@/domain/cardio';
import {
  raisesBySession,
  sessionDurationSec,
  sessionHasLoggedWork,
  totalTonnageKg,
} from '@/domain/sessionMetrics';
import { parseHistoryCsv } from '@/domain/historyImport';
import { recordFile } from '@/platform/recordFile';
import { cloudAutoBackup } from '@/platform/cloudBackup';
import { track } from '@/platform/telemetry';
import { BUILD_EVENTS } from '@/platform/events';
import { color, space, font, textScale, tracking, trackingPx, radius, signal } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';
// The app's language, not the device's — see `everyDateSpeaksHerLanguage`.
import { currentLocale } from '@/i18n';

// A Main-stack screen in v7 (folded out of the tab bar, opened from Progress · Lifts).
type Props = NativeStackScreenProps<MainParamList, 'History'>;

/*
 * ⛔ THIS FILE ONCE HELD THE ONLY CORRECT DURATION IN THE APP, AND KEPT IT TO ITSELF.
 *
 * The fix recorded here — "it read only sets; an interval session logs no `SetLog`, so its duration
 * came out as zero: start to start; the canonical record holds every shape (`items`)" — was right,
 * and five other surfaces went on getting it wrong beside it. It lives in `domain/sessionMetrics`
 * now, with the tonnage, the workout count and the personal-best walk, so there is one answer to
 * measure against instead of six to compare.
 */

/**
 * How many distinct things a session trained (the "N lifts" figure on the row).
 *
 * Counted off the canonical record when there is one, so a session of runs and holds says how much
 * work it was instead of "0 lifts". `sets` remains the answer for everything written before `items`
 * existed.
 */
function sessionLiftCount(s: Session): number {
  if (s.items?.length) return new Set(s.items.map((i) => i.ex)).size;
  return new Set(s.sets.map((x) => x.exerciseId)).size;
}

/*
 * ⛔ "MIRRORS progressAggregate's RAISES SO THE LOG AND THE LIFTS LENS NEVER DISAGREE" — IT DID NOT.
 *
 * The copy of the walk that lived here dropped the `actualReps >= 1` guard the lifetime count
 * applies. A heavier load entered and then logged at ZERO reps earned a moss "1 up" on the Log that
 * Progress never counted — and it poisoned the running best, so the real lift of that weight, weeks
 * later, was silently not a raise either. The comment claimed the mirror; the code was a second
 * opinion. There is one walk now, in `domain/sessionMetrics.raisesBySession`, and both lenses read
 * it.
 */

/** Weekday, localized + uppercased ("SAT"). A WORD — rendered in sans, never mono. */
function dowOf(iso: string): string {
  return new Date(iso).toLocaleDateString(currentLocale(), { weekday: 'short' }).toUpperCase();
}
/** The day of the month ("18"). A figure — mono. */
function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString(currentLocale(), { day: 'numeric' });
}
/** Month chapter display name ("July"). */
function monthNameOf(iso: string): string {
  return new Date(iso).toLocaleDateString(currentLocale(), { month: 'long' });
}
/** Month + year, for grouping (so July 2025 and July 2026 stay distinct chapters). */
function monthKeyOf(iso: string): string {
  return new Date(iso).toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });
}

export function History({ navigation }: Props) {
  const app = useApp();
  const { t } = useCopy();
  const [sessions, setSessions] = useState<Session[] | null>(null); // null = loading
  const [cardio, setCardio] = useState<CardioActivity[]>([]);

  const refresh = React.useCallback(() => {
    let active = true;
    Promise.all([db.loadHistory(), db.loadCardio()]).then(([all, cd]) => {
      if (!active) return;
      setSessions(all);
      setCardio(cd);
    });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(refresh);

  /*
   * ════ BRING YOUR LOG (2026-09-01, audit M1) — another app's export joins this ledger. ═════════
   *
   * The picker and the read are `recordFile.pick()` — the record-restore's own seam, which already
   * refuses nothing by extension and reads bytes rather than trusting a label. The parse is
   * `domain/historyImport` (local matching, no model). What she is shown BEFORE anything is
   * written is the report: how many workouts, how many lifts recognised, and how many names were
   * not — an import that writes silently and an import that guesses are the two failure modes this
   * confirm exists to rule out. The merge itself de-dupes, so the same file twice writes nothing.
   */
  const importLog = React.useCallback(async () => {
    const picked = await recordFile.pick();
    if (!picked.ok) return; // cancelled / unavailable — she stays on the ledger, nothing changed
    const report = parseHistoryCsv(picked.text, app.profile?.units ?? 'kg');
    void track('history_import_parsed', {
      sessions: report.sessions.length,
      lifts: report.recognisedLifts,
      unmatched: report.unmatched.length,
      rowsSeen: report.rowsSeen,
    });
    /*
     * ⛔ AND THE NAMES WE COULD NOT PLACE ARE THE POINT (audit M1, closed 2026-09-01).
     *
     * `BUILD_EVENTS.catalogueGap` already learns what the MODEL asked for and we lacked. This is
     * the same question answered by something stronger than a preference: lifts a real athlete has
     * really been performing, for years, in another app. It is the most concrete answer there is to
     * *which exercise do we author next*, and it was being counted on this screen and discarded.
     *
     * ⚠️ BOUNDED, exactly as that event's own note demands: the ten most frequent names, 40 chars
     * each, and nothing else. The vocabulary is the signal; a whole file's worth of strings would
     * be her training record leaving the phone through a research event.
     */
    if (report.unmatched.length > 0) {
      void track(BUILD_EVENTS.importGap, {
        wanted: report.unmatched.slice(0, 10).map(([name]) => name.slice(0, 40)),
      });
    }
    if (report.sessions.length === 0) {
      Alert.alert(t('history.importNoneTitle'), t('history.importNoneBody'));
      return;
    }
    const from = new Date(report.firstMs).toLocaleDateString(currentLocale(), { month: 'short', year: 'numeric' });
    const to = new Date(report.lastMs).toLocaleDateString(currentLocale(), { month: 'short', year: 'numeric' });
    const body =
      t('history.importConfirmBody', { sessions: report.sessions.length, lifts: report.recognisedLifts, from, to }) +
      (report.unmatched.length > 0 ? `\n${t('history.importUnmatched', { count: report.unmatched.length })}` : '');
    Alert.alert(t('history.importConfirmTitle'), body, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('history.importKeep'),
        onPress: () => {
          void (async () => {
            const kept = await db.appendImportedHistory(report.sessions);
            void track('history_import_kept', { kept });
            // Her record changed — the same promise every completion keeps.
            void cloudAutoBackup();
            refresh();
          })();
        },
      },
    ]);
  }, [app.profile?.units, refresh, t]);

  return (
    <HistoryView
      sessions={sessions}
      cardio={cardio}
      dayName={(s) => sessionDayName(s)}
      onLifts={() => navigation.goBack()}
      onSession={(id) => navigation.navigate('WorkoutDetail', { sessionId: id })}
      onCardio={(activity) => navigation.navigate('CardioDetail', { activity })}
      onFreeLog={() => navigation.navigate('FreeLog')}
      onImportLog={recordFile.available() ? () => void importLog() : undefined}
    />
  );
}

/**
 * 3.3 · PROGRESS — LOG, as a pure view.
 *
 * Split from the container so the v7 gallery can draw a real ledger: everything here comes from
 * SQLite, and a harness has none. `sessions === null` is still "loading" — the view holds its shape
 * rather than flashing an empty state at a ledger that is about to have rows.
 */
export function HistoryView({
  sessions,
  cardio,
  dayName,
  onLifts,
  onSession,
  onCardio,
  onFreeLog,
  onImportLog,
}: {
  sessions: Session[] | null;
  cardio: CardioActivity[];
  dayName: (s: Session) => string;
  onLifts: () => void;
  onSession: (sessionId: string) => void;
  onCardio: (activity: CardioActivity) => void;
  /** Opens the free-form log ("I trained without Hush") — absent in fixtures that predate it. */
  onFreeLog?: () => void;
  /** Brings another app's CSV export into this ledger (audit M1) — absent where no picker exists. */
  onImportLog?: () => void;
}) {
  const { t } = useCopy();

  /*
   * Only PERFORMED work is a record (founder 2026-07-10): a session with nothing completed in it, or
   * a cardio false-start, never shows here.
   *
   * ⚠️ IT ASKED ONLY ABOUT SETS. A session of intervals and holds logs no `SetLog`, so a workout she
   * finished to the last repeat — saved, counted as trained, sent to the coach — **never appeared in
   * her Log at all.** The app kept it and the one screen that shows her what she has done behaved as
   * though it had not happened.
   *
   * ⚠️ THIS IS `sessionHasLoggedWork`, NOT `sessionCountsAsWorkout`, AND THE DIFFERENCE IS MEANT.
   * The ledger lists PERFORMED work, partials included — she lifted it, so it is a record. The
   * narrower "did that finish the week's workout?" belongs to the counters (Progress's workouts
   * figure, the weekly band, the milestones), not to the page of rows.
   */
  const strength = (sessions ?? []).filter(sessionHasLoggedWork);
  const performedCardio = cardio.filter((a) => cardioPerformed(a.durationSec, a.distanceKm));
  const raises = raisesBySession(strength);

  // Unified, reverse-chronological timeline (newest first).
  const items: HistoryItem[] = [
    ...strength.map((s): HistoryItem => ({ kind: 'strength', ...s })),
    ...performedCardio,
  ].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  // Header summary — the STRENGTH work so far (cardio is never counted as "t moved").
  // The count is the number of ROWS below it, which is what a header over a list has to say.
  const totalSessions = strength.length;
  const totalTonnes = totalTonnageKg(strength) / 1000;
  const tonnesLabel = totalTonnes >= 10 ? String(Math.round(totalTonnes)) : String(+totalTonnes.toFixed(1));

  const isEmpty = sessions != null && items.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* The Progress tab's header, LOG lens — the same serif name + Lifts / Log toggle the Lifts
          lens wears; Log is active, and its Lifts segment returns to that lens. */}
      {/*
        ✦ IT ARRIVES (2026-08-27). `Arrive` was built for the founder's largest note — a screen
        should ARRIVE, not appear (2026-08-12). Two beats: the page and its lens, then the ledger.
        A LOG is a long list; staggering its rows would make scrolling into a performance, so the
        list lands as one thing and the reading is hers.
      */}
      <Arrive order={0} style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">{t('progress.title')}</Text>
        <SegmentedControl
          size="pill"
          style={styles.lens}
          options={[
            { value: 'lifts', label: t('progress.tabLifts') },
            { value: 'log', label: t('progress.tabLog') },
          ]}
          value="log"
          onChange={(v) => {
            if (v === 'lifts') onLifts();
          }}
        />
      </Arrive>

      {isEmpty ? (
        // The first day is not a blank page (founder 2026-07-12) — it is the ledger, open and clean.
        <View style={styles.emptyWrap}>
          <View style={styles.emptyMark}>
            <Icon name="history" size={24} color={color.textTertiary} strokeWidth={1.75} />
          </View>
          <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
          <Text style={styles.empty}>{t('history.empty')}</Text>
          {onFreeLog ? (
            <Pressable
              accessibilityRole="button"
              onPress={onFreeLog}
              style={({ pressed }) => [styles.freeLogDoor, pressed && styles.rowPressed]}
            >
              <Text style={styles.freeLogDoorText}>{t('history.freeLogDoor')}</Text>
            </Pressable>
          ) : null}
          {/* THE SECOND DOOR — a ledger that starts empty is exactly where two years of another
              app's log belongs (audit M1). Same quiet geometry as the free-form door above. */}
          {onImportLog ? (
            <Pressable
              accessibilityRole="button"
              onPress={onImportLog}
              style={({ pressed }) => [styles.freeLogDoor, pressed && styles.rowPressed]}
            >
              <Text style={styles.freeLogDoorText}>{t('history.importDoor')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {totalSessions > 0 ? (
            // "18 sessions · 46.8 t moved. Every rep you've done is here." — the figures ride mono
            // inside a sans sentence.
            <Text style={styles.summaryLine}>
              {/*
                ⛔ THIS WAS A SENTENCE ASSEMBLED IN JSX. Four `t()` calls, a literal middot and two
                literal spaces — and `history.logMoved` was authored as a leading-space fragment so
                the seams would meet. In Hebrew the figures run left-to-right inside a right-to-left
                clause, so the order the code fixed here was the wrong one: word order in Hebrew is
                the translator's decision and this took it away from her. One key carries the whole
                clause now, middot included, and the four fragments are deleted.

                ⚠️ THE FIGURES LOSE THEIR MONO SPAN and that is the trade. A span can only be put back
                by splitting the translated string on its own interpolations, which is the same
                mistake one layer down.
              */}
              {t('history.summaryLine', {
                count: totalSessions,
                sessions: totalSessions,
                tonnes: tonnesLabel,
                unit: t('weekly.tonneUnit'),
              })}
            </Text>
          ) : null}

          {/* THE FREE-FORM DOOR (2026-08-24) — work she did without Hush belongs in this ledger
              too. A quiet bordered row, not a act: the page is hers to read, this is an aside. */}
          {onFreeLog ? (
            <Pressable
              accessibilityRole="button"
              onPress={onFreeLog}
              style={({ pressed }) => [styles.freeLogDoor, pressed && styles.rowPressed]}
            >
              <Text style={styles.freeLogDoorText}>{t('history.freeLogDoor')}</Text>
            </Pressable>
          ) : null}
          {/* And the log she kept somewhere else — same aside, second door (audit M1). */}
          {onImportLog ? (
            <Pressable
              accessibilityRole="button"
              onPress={onImportLog}
              style={({ pressed }) => [styles.freeLogDoor, pressed && styles.rowPressed]}
            >
              <Text style={styles.freeLogDoorText}>{t('history.importDoor')}</Text>
            </Pressable>
          ) : null}

          {items.map((item, i) => {
            // Month chapters: a serif legend where the month turns; each chapter's final row keeps a
            // bottom rule so chapters read as distinct blocks.
            const key = monthKeyOf(item.startedAt);
            const newMonth = i === 0 || monthKeyOf(items[i - 1].startedAt) !== key;
            const last = i === items.length - 1 || monthKeyOf(items[i + 1].startedAt) !== key;

            const isCardio = item.kind === 'cardio';
            const name = isCardio
              ? `${item.gait === 'run' ? t('cardio.run') : t('cardio.walk')} · ${item.distanceKm.toFixed(2)} ${t('cardio.km')}`
              : bidi(dayName(item));
            const meta = isCardio
              ? item.calories != null && item.avgHr != null
                ? t('history.rowCardioMeta', { kcal: item.calories, hr: item.avgHr })
                : item.calories != null
                  ? t('history.rowCardioMetaNoHr', { kcal: item.calories })
                  : t('history.minutesShort', { min: durationMinutes(item.durationSec) })
              : (() => {
                  // A free-form log is written after the fact — its stamps span no time, and a
                  // "0 min" would be a measurement the record never took (2026-08-24).
                  const min = durationMinutes(sessionDurationSec(item));
                  return min > 0
                    ? t('history.rowStrengthMeta', { lifts: sessionLiftCount(item), min })
                    : t('history.rowStrengthMetaNoTime', { lifts: sessionLiftCount(item) });
                })();
            const raiseN = isCardio ? 0 : raises.get(item.id) ?? 0;

            return (
              <View key={item.id}>
                {newMonth ? <Text style={styles.monthLabel}>{monthNameOf(item.startedAt)}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${name} · ${meta}`}
                  onPress={() =>
                    isCardio ? onCardio(item) : onSession(item.id)
                  }
                  style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.rowPressed]}
                >
                  <View style={styles.dateCol}>
                    <Legend size={17} track={0}>{dowOf(item.startedAt)}</Legend>
                    <Text style={styles.day}>{dayOf(item.startedAt)}</Text>
                  </View>

                  <View style={styles.rowMid}>
                    {isCardio ? (
                      <View style={styles.cardioTitleRow}>
                        <Icon
                          name={item.gait === 'run' ? 'runner' : 'footprints'}
                          size={13}
                          color={color.textSecondary}
                          strokeWidth={1.8}
                        />
                        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
                      </View>
                    ) : (
                      <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
                    )}
                    <Legend size={17} track={0} weight="regular" style={styles.rowMeta}>{meta}</Legend>
                  </View>

                  {isCardio ? (
                    <Legend size={17} track={0.06}>{t('history.rowRecorded')}</Legend>
                  ) : raiseN > 0 ? (
                    <Legend size={17} track={0} tone="accent">{t('history.rowRaises', { count: raiseN })}</Legend>
                  ) : null}

                  <Icon name="chevronRight" size={15} color={color.textTertiary} strokeWidth={1.8} />
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },

  // Shared with ProgressLifts: the serif section name + the Lifts / Log toggle.
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingTop: 20,
    paddingBottom: 14,
  },
  lens: { marginTop: 8 },
  // The same 40px surface title the Lifts lens wears — one Progress, two lenses.
  title: { fontFamily: font.serif, fontSize: 40, lineHeight: 42, color: color.textPrimary, textAlign: 'left' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter, paddingBottom: 40 },
  emptyMark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: { fontFamily: font.sansSemibold, fontSize: textScale.lg, letterSpacing: trackingPx(textScale.lg, tracking.tight), color: color.textPrimary, textAlign: 'center' },
  empty: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22, color: color.textMuted, textAlign: 'center', marginTop: 8, maxWidth: 280 },
  /* The free-form door — a quiet bordered row; the ledger is the page, this is an aside. */
  freeLogDoor: { borderWidth: 1, borderColor: color.border, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, marginTop: 16, alignSelf: 'stretch' },
  freeLogDoorText: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary, textAlign: 'center' },

  list: { paddingHorizontal: 30, paddingBottom: 40 },

  // One-line summary: a sans sentence with mono figures.
  summaryLine: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: color.textSecondary, marginBottom: 6, textAlign: 'left' },
  // The figures ride mono INSIDE the sans sentence — a reading quoted in prose.
  summaryFig: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, color: color.textPrimary }, // rtl-ok: nested figure span, inherits textAlign from summaryLine

  // Month chapter — the coach's serif.
  // The month is a CHAPTER, so it is the coach's serif at 26 — the ledger's only headline.
  monthLabel: { fontFamily: font.serif, fontSize: 28, lineHeight: 33, color: color.textPrimary, marginTop: 24, paddingBottom: 12, textAlign: 'left' },

  /* THE LOG IS A LIST OF DOORS, NOT A LEDGER (founder 2026-07-28). Every row opens something — a
     strength row goes to the RECORD (WorkoutDetail), a cardio row to its details (CardioDetail) —
     and they were set at ledger scale: a 15.5 pt name over a caption, 14 pt of air, on a screen she
     scrolls with a thumb. Taller rows, a bigger name, and the day's figure large enough to scan a
     month by. Nothing new is shown; what is here is finally at the size it is read at. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 19,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.12)',
  },
  rowLast: { borderBottomWidth: 1, borderBottomColor: color.border },
  // A.13 — a press washes the surface; it never dims the row's own words.
  rowPressed: { backgroundColor: color.fillSubtle },

  dateCol: { width: 50 },
  day: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 24, color: color.textPrimary, textAlign: 'left' },

  rowMid: { flex: 1, minWidth: 0, gap: 5 },
  cardioTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowName: { flexShrink: 1, fontFamily: font.sansSemibold, fontSize: 18, color: color.textPrimary, textAlign: 'left' },
  // SANS, not mono: "6 LIFTS · 52 MIN" / "318 KCAL · 141 AVG HR" carry translated words.
  rowMeta: { color: color.textMuted },

  // Trailing marks — moss for a raise, muted for a recorded cardio. Both are WORDS → sans.
});
