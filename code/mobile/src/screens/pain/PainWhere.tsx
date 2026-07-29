/**
 * WHERE, AND HOW MUCH (v7 13.2) — "two taps, no forms".
 *
 * "…and it's the same body map you already own. Point to the area, set how sharp it is. Pain isn't a
 * new system: the muscle just goes off for a limited window. The coach never asks you to diagnose."
 *
 * So this screen renders the SAME `BodyMapFigure` the editor and onboarding render — turned to clay,
 * with the stances hidden, because the only question here is where. It asks for two facts and offers
 * no third: no free text, no scale of ten, no body part Hush cannot act on. Every zone is a muscle
 * the assembler knows, which is what makes the answer actionable rather than a note in a diary.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Legend, SegmentedControl } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { BodyMapFigure, viewOf, type BodyView } from '@/components/BodyMapFigure';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { PAIN_SEVERITIES, type PainSeverity } from '@/domain/painReport';
import * as haptics from '@/platform/haptics';
import { color, font, textScale, space, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'PainWhere'>;

export function PainWhere({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const winW = useWindowDimensions().width;
  const [stageW, setStageW] = useState(0);
  const figureW = stageW || Math.max(0, Math.round(winW - 30));

  const [view, setView] = useState<BodyView>('front');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [severity, setSeverity] = useState<PainSeverity | null>(null);

  function pick(m: string) {
    haptics.tick();
    setMuscle((cur) => (cur === m ? null : m));
  }

  function tell() {
    if (!muscle || !severity) return;
    haptics.confirm();
    // The report is recorded and the week reshapes; the response screen READS what happened back.
    void app.reportPain(muscle, severity);
    navigation.replace('PainResponse', { muscle, severity, exerciseId: route.params?.exerciseId });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={12}
          onPress={() => navigation.goBack()}
        >
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">{t('pain.whereTitle')}</Text>
        <SegmentedControl
          size="pill"
          options={[
            { value: 'front', label: t('ob.mapFront') },
            { value: 'back', label: t('ob.mapBack') },
          ]}
          value={view}
          onChange={(v) => {
            const next = v as BodyView;
            setView(next);
            // The chosen muscle lives on the other face — turning the body lets it go, rather than
            // reporting a shoulder she can no longer see.
            setMuscle((cur) => (cur && viewOf(cur) !== next ? null : cur));
          }}
        />
      </View>

      {/* The one instruction on the screen, and it is a promise, not a how-to. */}
      <Text style={styles.sub}>{t('pain.whereSub')}</Text>

      <View
        style={styles.stage}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          setStageW((cur) => (cur === w ? cur : w));
        }}
      >
        <BodyMapFigure
          value={app.profile?.bodyMap ?? {}}
          view={view}
          width={figureW}
          tenderMuscle={muscle}
          hideStances
          onPressMuscle={pick}
        />
      </View>

      {/* HOW SHARP — three words a person can answer at a rack. Not a scale, not a score; the only
          thing the answer decides is how long the muscle rests. */}
      <View style={styles.sharp}>
        <Legend size={11}>{t('pain.howSharp')}</Legend>
        <View style={styles.grades}>
          {PAIN_SEVERITIES.map((s) => {
            const on = severity === s;
            return (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t(`pain.grade_${s}`)}
                onPress={() => {
                  haptics.tick();
                  setSeverity(s);
                }}
                style={({ pressed }) => [styles.grade, on && styles.gradeOn, { opacity: pressed ? press.opacity : 1 }]}
              >
                <Text style={[styles.gradeName, on && styles.gradeNameOn]} numberOfLines={1}>{t(`pain.grade_${s}`)}</Text>
                <Text style={[styles.gradeNote, on && styles.gradeNoteOn]} numberOfLines={1}>{t(`pain.gradeNote_${s}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.foot}>
        <Button
          variant="primary"
          size="act"
          block
          label={t('pain.tellCoach')}
          disabled={!muscle || !severity}
          onPress={tell}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 26, paddingTop: 16 },
  title: { flex: 1, fontFamily: font.serif, fontSize: textScale.xl, color: color.textPrimary, textAlign: 'center' },
  sub: { paddingHorizontal: 32, paddingTop: 14, fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: color.textSecondary, textAlign: 'left' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  sharp: { paddingHorizontal: 32, gap: 12 },
  grades: { flexDirection: 'row', gap: 8 },
  grade: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.fillSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  // The chosen grade takes CLAY — the same tone the muscle it belongs to is wearing.
  gradeOn: { backgroundColor: color.alert, borderColor: color.alert },
  gradeName: { fontFamily: font.sansSemibold, fontSize: 14, color: color.textPrimary, textAlign: 'center' },
  gradeNameOn: { color: color.onAccent }, // rtl-ok: merged onto gradeName, which sets textAlign
  gradeNote: { fontFamily: font.sans, fontSize: 14, color: color.textMuted, textAlign: 'center' },
  gradeNoteOn: { color: 'rgba(27,20,16,0.7)' }, // rtl-ok: merged onto gradeNote, which sets textAlign

  foot: { paddingHorizontal: 26, paddingTop: 16, paddingBottom: 12 },
});
