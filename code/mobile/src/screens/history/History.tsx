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
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { SegmentedControl, Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import type { CardioActivity, HistoryItem, Session } from '@/data/local/models';
import { sessionDayName } from '@/domain/schedule';
import { durationMinutes } from '@/domain/duration';
import { cardioPerformed } from '@/domain/cardio';
import { color, space, font, textScale, tracking, trackingPx, radius, signal } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

// A Main-stack screen in v7 (folded out of the tab bar, opened from Progress · Lifts).
type Props = NativeStackScreenProps<MainParamList, 'History'>;

/**
 * Wall-clock seconds from the session's start to the last thing she did in it.
 *
 * ⚠️ IT READ ONLY SETS. An interval session — a warm-up, six 400 m repeats, a cool-down — logs no
 * `SetLog` at all, so its duration came out as zero: start to start. The canonical record holds
 * every shape (`items`), and the last stamp in it is the end of the workout whatever shape it was.
 */
function sessionDurationSec(s: Session): number {
  const start = Date.parse(s.startedAt);
  const stamps = [
    ...s.sets.map((x) => Date.parse(x.persistedAt)),
    ...(s.items ?? []).map((i) => Date.parse(i.at)),
  ].filter((n) => !Number.isNaN(n));
  const end = stamps.length ? Math.max(...stamps) : start;
  return Math.max(0, Math.round((end - start) / 1000));
}

function sessionVolumeKg(s: Session): number {
  return s.sets.reduce((sum, x) => sum + (x.actualWeight ?? 0) * x.actualReps, 0);
}

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

/**
 * The raises per session — how many lifts beat their own prior best load that day ("3 up").
 *
 * Display arithmetic, chronological: walk oldest → newest keeping each lift's running-best top-load;
 * a session's raise count is the lifts whose heaviest set that day exceeded that running best. The
 * first time a lift appears is not a raise (there is nothing to beat). Mirrors progressAggregate's
 * raises so the Log and the Lifts lens never disagree.
 */
function raisesBySession(strength: Session[]): Map<string, number> {
  const chron = [...strength].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const best = new Map<string, number>();
  const out = new Map<string, number>();
  for (const s of chron) {
    const top = new Map<string, number>();
    for (const set of s.sets) {
      const w = set.actualWeight ?? 0;
      if (w > (top.get(set.exerciseId) ?? 0)) top.set(set.exerciseId, w);
    }
    let raises = 0;
    for (const [id, load] of top) {
      const prev = best.get(id);
      if (prev != null && load > prev) raises++;
      if (prev == null || load > prev) best.set(id, load);
    }
    out.set(s.id, raises);
  }
  return out;
}

/** Weekday, localized + uppercased ("SAT"). A WORD — rendered in sans, never mono. */
function dowOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
}
/** The day of the month ("18"). A figure — mono. */
function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric' });
}
/** Month chapter display name ("July"). */
function monthNameOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long' });
}
/** Month + year, for grouping (so July 2025 and July 2026 stay distinct chapters). */
function monthKeyOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function History({ navigation }: Props) {
  const app = useApp();
  const [sessions, setSessions] = useState<Session[] | null>(null); // null = loading
  const [cardio, setCardio] = useState<CardioActivity[]>([]);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      Promise.all([db.loadHistory(), db.loadCardio()]).then(([all, cd]) => {
        if (!active) return;
        setSessions(all);
        setCardio(cd);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <HistoryView
      sessions={sessions}
      cardio={cardio}
      dayName={(s) => sessionDayName(s)}
      onLifts={() => navigation.goBack()}
      onSession={(id) => navigation.navigate('WorkoutDetail', { sessionId: id })}
      onCardio={(activity) => navigation.navigate('CardioDetail', { activity })}
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
}: {
  sessions: Session[] | null;
  cardio: CardioActivity[];
  dayName: (s: Session) => string;
  onLifts: () => void;
  onSession: (sessionId: string) => void;
  onCardio: (activity: CardioActivity) => void;
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
   */
  const strength = (sessions ?? []).filter((s) => s.sets.length > 0 || (s.items?.length ?? 0) > 0);
  const performedCardio = cardio.filter((a) => cardioPerformed(a.durationSec, a.distanceKm));
  const raises = raisesBySession(strength);

  // Unified, reverse-chronological timeline (newest first).
  const items: HistoryItem[] = [
    ...strength.map((s): HistoryItem => ({ kind: 'strength', ...s })),
    ...performedCardio,
  ].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  // Header summary — the STRENGTH work so far (cardio is never counted as "t moved").
  const totalSessions = strength.length;
  const totalTonnes = strength.reduce((sum, s) => sum + sessionVolumeKg(s), 0) / 1000;
  const tonnesLabel = totalTonnes >= 10 ? String(Math.round(totalTonnes)) : String(+totalTonnes.toFixed(1));

  const isEmpty = sessions != null && items.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* The Progress tab's header, LOG lens — the same serif name + Lifts / Log toggle the Lifts
          lens wears; Log is active, and its Lifts segment returns to that lens. */}
      <View style={styles.header}>
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
      </View>

      {isEmpty ? (
        // The first day is not a blank page (founder 2026-07-12) — it is the ledger, open and clean.
        <View style={styles.emptyWrap}>
          <View style={styles.emptyMark}>
            <Icon name="history" size={24} color={color.textTertiary} strokeWidth={1.75} />
          </View>
          <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
          <Text style={styles.empty}>{t('history.empty')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {totalSessions > 0 ? (
            // "18 sessions · 46.8 t moved. Every rep you've done is here." — the figures ride mono
            // inside a sans sentence.
            <Text style={styles.summaryLine}>
              <Text style={styles.summaryFig}>{totalSessions}</Text> {t('history.logSessions', { count: totalSessions })} ·{' '}
              <Text style={styles.summaryFig}>{tonnesLabel}</Text> {t('history.tonneUnit')} {t('history.logMoved')}
            </Text>
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
              : t('history.rowStrengthMeta', {
                  lifts: sessionLiftCount(item),
                  min: durationMinutes(sessionDurationSec(item)),
                });
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
                    <Legend size={10.5} track={0}>{dowOf(item.startedAt)}</Legend>
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
                    <Legend size={11.5} track={0} weight="regular" style={styles.rowMeta}>{meta}</Legend>
                  </View>

                  {isCardio ? (
                    <Legend size={10.5} track={0.06}>{t('history.rowRecorded')}</Legend>
                  ) : raiseN > 0 ? (
                    <Legend size={12.5} track={0} tone="accent">{t('history.rowRaises', { count: raiseN })}</Legend>
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

  list: { paddingHorizontal: 30, paddingBottom: 40 },

  // One-line summary: a sans sentence with mono figures.
  summaryLine: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: color.textSecondary, marginBottom: 6, textAlign: 'left' },
  // The figures ride mono INSIDE the sans sentence — a reading quoted in prose.
  summaryFig: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 13.5, color: color.textPrimary }, // rtl-ok: nested figure span, inherits textAlign from summaryLine

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
