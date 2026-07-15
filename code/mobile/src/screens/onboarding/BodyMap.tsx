/**
 * Body map (Engine v5, Revision 7) — the centrepiece of "what to train". The athlete marks each
 * muscle off / normal / emphasis; the programme's whole shape follows from it (register Part 3), which
 * is what REPLACES the demographic split. Set once here, permanently editable later (Settings).
 *
 * This is the FUNCTIONAL build: a plain, working list of the ten muscles with a three-way stance
 * control and the two-mark emphasis budget enforced (F-4). The visual redesign — the anatomical figure,
 * the polish, the final copy — is the founder's end-pass; the wiring here (writing profile.bodyMap and,
 * via completeOnboarding, flipping the athlete onto v5) survives that redesign unchanged.
 *
 * Continue carries the assembled onboarding inputs plus the map to the build step (ProgramCreated).
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import * as haptics from '@/platform/haptics';
import { CANONICAL_MUSCLE_ORDER, EMPHASIS_BUDGET } from '@/engine/v5/constants';
import type { MuscleStance } from '@/data/local/models';
import { color, font, textScale, radius, signal } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'BodyMap'>;

const STANCES: MuscleStance[] = ['off', 'normal', 'emphasis'];

export function BodyMap({ navigation, route }: Props) {
  const { t } = useCopy();
  const { inputs } = route.params;
  // Absent = normal (the parity default); only off / emphasis are stored, so the map stays compact.
  const [map, setMap] = useState<Record<string, MuscleStance>>({});
  const stanceOf = (m: string): MuscleStance => map[m] ?? 'normal';
  const emphasisCount = CANONICAL_MUSCLE_ORDER.filter((m) => stanceOf(m) === 'emphasis').length;

  function setStance(m: string, s: MuscleStance) {
    // The emphasis budget is a hard limit (F-4): a third mark is refused, not silently accepted.
    if (s === 'emphasis' && stanceOf(m) !== 'emphasis' && emphasisCount >= EMPHASIS_BUDGET) {
      haptics.tick();
      return;
    }
    haptics.tick();
    setMap((prev) => ({ ...prev, [m]: s }));
  }

  function onContinue() {
    // Store only the non-default marks (off / emphasis) — normal muscles are absent, read as normal.
    const bodyMap: Record<string, MuscleStance> = {};
    for (const m of CANONICAL_MUSCLE_ORDER) {
      const s = stanceOf(m);
      if (s !== 'normal') bodyMap[m] = s;
    }
    navigation.navigate('ProgramCreated', { inputs: { ...inputs, bodyMap } });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 5, total: 5 }}
      legend={t('ob.mapLegend')}
      title={t('ob.mapTitle')}
      sub={t('ob.mapSub')}
      footer={
        <>
          <Text style={styles.budget}>{t('ob.mapEmphasis', { n: emphasisCount })}</Text>
          <Button variant="primary" size="lg" block label={t('ob.daysBuild')} onPress={onContinue} />
        </>
      }
    >
      <View style={styles.rows}>
        {CANONICAL_MUSCLE_ORDER.map((m) => {
          const current = stanceOf(m);
          return (
            <View key={m} style={styles.row}>
              <Text style={[styles.muscle, current === 'off' && styles.muscleOff]} numberOfLines={1}>
                {t(`muscle.${m}`)}
              </Text>
              <View style={styles.seg}>
                {STANCES.map((s) => {
                  const active = current === s;
                  const isEmphasis = s === 'emphasis';
                  return (
                    <Pressable
                      key={s}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${t(`muscle.${m}`)} — ${t(`ob.stance${s[0].toUpperCase()}${s.slice(1)}`)}`}
                      onPress={() => setStance(m, s)}
                      style={[
                        styles.segItem,
                        active && (isEmphasis ? styles.segEmphasis : s === 'off' ? styles.segOff : styles.segNormal),
                      ]}
                    >
                      <Text style={[styles.segText, active && styles.segTextActive]}>
                        {t(`ob.stance${s[0].toUpperCase()}${s.slice(1)}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  muscle: { flex: 1, fontFamily: font.sansMedium, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  muscleOff: { color: color.textTertiary },
  seg: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.full,
    overflow: 'hidden',
    backgroundColor: color.fillSubtle,
  },
  segItem: { paddingVertical: 7, paddingHorizontal: 12, minWidth: 62, alignItems: 'center' },
  segOff: { backgroundColor: color.fillSubtleStrong },
  segNormal: { backgroundColor: color.surface },
  segEmphasis: { backgroundColor: signal.wash },
  segText: { fontFamily: font.sansMedium, fontSize: textScale.xs, color: color.textSecondary, textAlign: 'left' },
  segTextActive: { color: color.textPrimary },
  budget: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'center' },
});
