/**
 * Weekly Update — "Update B" (the final v4 direction), rebuilt to the Claude
 * Design screenshots. The Saturday digest is the WHOLE week's program shown at
 * its new loads, grouped by workout. Each lift Hush changed is highlighted
 * (sage up / clay down / ochre swap) with its set/rep deltas, and unfolds in
 * place to the Observation → Conclusion → Action "Why" (WhyTriple).
 *
 * v4 rules honoured: read-only (no accept/reject/undo); a load coming down is
 * "matched to demonstrated capability, sets kept" — never a setback, never red;
 * the steady week is one reassuring line, not an empty state; no forecasts,
 * confidence, or probabilities.
 *
 * Data: getWeeklyPlan() joins the program structure with the engine's per-slot
 * state and the captured weekly change snapshot.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { IconButton, Legend, Button } from '@/components/ds';
import { WhyTriple, type WhyKind } from '@/components/WhyTriple';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { track } from '@/platform/telemetry';
import { getWeeklyPlan, markWeeklyUpdateSeen, type WeeklyPlanView, type WeeklyPlanLift } from '@/engine/v4/v4Engine';
import { displayWeight, unitLabel } from '@/domain/schedule';
import type { Units } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, up, down, signal, radius } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WeeklyUpdate'>;

// Loads arrive in kg from the engine snapshot; render in the athlete's display units
// (the rest of the app never shows a unit the athlete didn't choose).
const fmtLoad = (n: number | null, units: Units): string =>
  n == null ? 'BW' : String(+((displayWeight(n, units) ?? 0).toFixed(2)));
const rangeStr = (r: [number, number]): string => `${r[0]}-${r[1]}`;

export function WeeklyUpdate({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [view, setView] = useState<WeeklyPlanView | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const program = app.program;
      const v = program ? await getWeeklyPlan(program) : null;
      if (!active) return;
      setView(v);
      setLoaded(true);
      void track('weekly_update_viewed', { weekIndex: v?.weekIndex ?? null, changes: v?.changedCount ?? 0 });
      if (v && !v.seen) void markWeeklyUpdateSeen();
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    void track('weekly_update_dismissed', { changes: view?.changedCount ?? 0 });
    navigation.goBack();
  }

  const changedCount = view?.changedCount ?? 0;
  const whenLabel = view
    ? `${new Date(view.at).toLocaleDateString(undefined, { weekday: 'long' })} · ${new Date(view.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : '';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headSpacer} />
        <Text style={styles.when}>{whenLabel}</Text>
        <IconButton accessibilityLabel={t('common.close')} onPress={close}>
          <Icon name="close" size={20} color={color.textPrimary} strokeWidth={2} />
        </IconButton>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Legend style={styles.eyebrow}>{t('weekly.eyebrow')}</Legend>
        <Text style={styles.title}>{view ? t('weekly.weekTitle', { n: view.weekIndex + 1 }) : t('weekly.title')}</Text>
        <Text style={styles.intro}>
          {loaded && changedCount === 0 ? t('weekly.steady') : t('weekly.intro', { count: changedCount })}
        </Text>

        {view?.workouts.map((w) => (
          <View key={w.dayId} style={styles.workout}>
            <View style={styles.workoutHead}>
              <Text style={styles.workoutName}>{w.name}</Text>
              <Text style={styles.workoutGroups}>{w.groups.join(' · ').toUpperCase()}</Text>
            </View>
            {w.lifts.map((lift, i) => (
              <LiftRow
                key={`${w.dayId}:${i}`}
                lift={lift}
                open={!!lift.change && openId === lift.change.snapshot.slotId}
                onToggle={() => {
                  if (!lift.change) return;
                  const id = lift.change.snapshot.slotId;
                  setOpenId((cur) => (cur === id ? null : id));
                  if (openId !== id) void track('weekly_update_why_opened', { pattern: lift.change.explanation.pattern });
                }}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Button variant="primary" size="lg" block label={t('weekly.done')} onPress={close} />
      </View>
    </SafeAreaView>
  );
}

function LiftRow({ lift, open, onToggle }: { lift: WeeklyPlanLift; open: boolean; onToggle: () => void }) {
  const { t } = useCopy();
  const units = useApp().profile?.units ?? 'kg';
  const unit = unitLabel(units);
  const ch = lift.change?.snapshot;
  const expl = lift.change?.explanation;
  const hasWhy = !!lift.change;
  const swapped = ch?.swapped ?? false;
  const loadChanged = !!ch && ch.loadFrom !== ch.loadTo && !swapped;
  const setsChanged = !!ch && ch.setsFrom !== ch.setsTo;
  const rangeChanged = !!ch && (ch.rangeFrom[0] !== ch.rangeTo[0] || ch.rangeFrom[1] !== ch.rangeTo[1]);
  const prominent = loadChanged || setsChanged || rangeChanged || swapped;
  const tone: WhyKind = swapped ? 'swap' : loadChanged ? (ch!.loadTo! >= (ch!.loadFrom ?? -Infinity) ? 'up' : 'down') : 'neutral';
  const loadColor = tone === 'up' ? up[0] : tone === 'down' ? down[0] : color.textPrimary;

  const toLoad = ch ? ch.loadTo : lift.loadKg;
  const sets = ch ? ch.setsTo : lift.sets;
  const range = ch ? ch.rangeTo : lift.repRange;

  // The right-hand load cluster (load + optional chevron).
  const loadCluster = (
    <View style={styles.loadCluster}>
      {swapped ? (
        <Text style={styles.loadSwap}>
          {fmtLoad(toLoad, units)}<Text style={styles.kg}> {unit}</Text>
        </Text>
      ) : loadChanged ? (
        <Text style={styles.loadLine}>
          <Text style={styles.loadFrom}>{fmtLoad(ch!.loadFrom, units)} </Text>
          <Text style={styles.arrow}>→ </Text>
          <Text style={[styles.loadTo, { color: loadColor }]}>{fmtLoad(toLoad, units)}</Text>
          <Text style={styles.kg}> {unit}</Text>
        </Text>
      ) : (
        <Text style={styles.loadPlain}>
          {fmtLoad(toLoad, units)}<Text style={styles.kg}> {unit}</Text>
        </Text>
      )}
      {hasWhy ? <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color={color.textTertiary} strokeWidth={2} /> : null}
    </View>
  );

  return (
    <Pressable onPress={hasWhy ? onToggle : undefined} style={styles.lift} accessibilityRole={hasWhy ? 'button' : undefined}>
      <View style={styles.liftTop}>
        <Text style={[styles.liftName, prominent && styles.liftNameStrong]} numberOfLines={1}>
          {lift.name}
        </Text>
        {swapped ? (
          <View style={styles.swapBadge}>
            <Icon name="repeat" size={12} color={color.accentText} strokeWidth={2} />
            <Text style={styles.swapBadgeText}>{t('weekly.swapped').toUpperCase()}</Text>
          </View>
        ) : (
          loadCluster
        )}
      </View>

      {prominent ? (
        <View style={styles.liftSecond}>
          {swapped ? (
            <Text style={styles.newExercise}>{t('weekly.newExercise')}</Text>
          ) : (
            <Text style={styles.sub}>
              {setsChanged ? (
                <>
                  <Text style={styles.subFrom}>{ch!.setsFrom} </Text>
                  <Text style={styles.subArrow}>→ </Text>
                  <Text style={styles.subStrong}>{sets} </Text>
                </>
              ) : (
                <Text>{sets} </Text>
              )}
              <Text>{t('weekly.setsUnit')}</Text>
              {range ? (
                <>
                  <Text style={styles.subDot}> · </Text>
                  {rangeChanged ? (
                    <>
                      <Text style={styles.subFrom}>{rangeStr(ch!.rangeFrom)} </Text>
                      <Text style={styles.subArrow}>→ </Text>
                      <Text style={styles.subStrong}>{rangeStr(range)} </Text>
                    </>
                  ) : (
                    <Text>{rangeStr(range)} </Text>
                  )}
                  <Text>{t('weekly.repsUnit')}</Text>
                </>
              ) : null}
            </Text>
          )}
          {swapped ? loadCluster : null}
        </View>
      ) : null}

      {open && expl ? (
        <View style={styles.whyWrap}>
          <WhyTriple
            saw={t(expl.observation.key, expl.observation.params ?? {})}
            means={t(expl.conclusion.key, expl.conclusion.params ?? {})}
            did={t(expl.action.key, expl.action.params ?? {})}
            kind={tone}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 4, minHeight: 44 },
  headSpacer: { width: 40 },
  when: { flex: 1, textAlign: 'center', fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted, letterSpacing: 0.2 },

  scroll: { paddingHorizontal: space.gutter, paddingBottom: 20 },
  eyebrow: { marginTop: 12, marginBottom: 10 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale['3xl'], letterSpacing: trackingPx(textScale['3xl'], tracking.display), color: color.textPrimary, lineHeight: textScale['3xl'] * 1.02, textAlign: 'left' },
  intro: { marginTop: 12, fontFamily: font.sans, fontSize: textScale.md, lineHeight: 25, color: color.textSecondary, maxWidth: 340, textAlign: 'left' },

  workout: { marginTop: 24 },
  workoutHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: color.borderStrong },
  workoutName: { fontFamily: font.sansSemibold, fontSize: textScale.md, letterSpacing: trackingPx(textScale.md, tracking.tight), color: color.textPrimary, textAlign: 'left' },
  workoutGroups: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), color: color.textTertiary, textAlign: 'left' },

  lift: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.border },
  liftTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  liftName: { flex: 1, fontFamily: font.sans, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  liftNameStrong: { fontFamily: font.sansSemibold, textAlign: 'left' },
  liftSecond: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 },

  sub: { fontFamily: font.mono, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  subFrom: { color: color.textTertiary },
  subArrow: { color: color.textTertiary },
  subStrong: { fontFamily: font.monoSemibold, color: color.textPrimary, textAlign: 'left' },
  subDot: { color: color.textTertiary },
  newExercise: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textTertiary, textAlign: 'left' },

  loadCluster: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadLine: { fontFamily: font.mono, fontSize: textScale.md, color: color.textMuted, textAlign: 'left' },
  loadFrom: { fontFamily: font.mono, fontSize: textScale.sm, color: color.textTertiary, textAlign: 'left' },
  arrow: { color: color.textTertiary, fontSize: textScale.sm },
  loadTo: { fontFamily: font.monoSemibold, fontSize: textScale.lg, textAlign: 'left' },
  loadPlain: { fontFamily: font.mono, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  loadSwap: { fontFamily: font.monoSemibold, fontSize: textScale.lg, color: color.textPrimary, textAlign: 'left' },
  kg: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted, textAlign: 'left' },

  swapBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.full, backgroundColor: signal.wash },
  swapBadgeText: { fontFamily: font.sansSemibold, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), color: color.accentText, textAlign: 'left' },

  whyWrap: { marginTop: 14, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 18, backgroundColor: color.surface3, borderRadius: radius.lg },

  footer: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, borderTopColor: color.border },
});
