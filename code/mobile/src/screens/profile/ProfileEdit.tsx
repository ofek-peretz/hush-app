/**
 * Edit profile (§4.28, founder 2026-06-30) — manage body data + training experience AFTER
 * onboarding. Settings → Body data / Experience open this. Same controls as the onboarding steps
 * (Sex / Age / Height / Weight WheelPickers + Experience OptStack), seeded from the saved profile.
 *
 * Corrections must never reset progression: this only persists the merged profile (the current
 * program is left intact; a changed experience/body informs the next weekly regeneration).
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend, SegmentedControl, WheelPicker, Button } from '@/components/ds';
import { OptStack } from '@/components/onboarding/OptStack';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { displayWeight, unitLabel } from '@/domain/schedule';
import * as haptics from '@/platform/haptics';
import type { Experience } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ProfileEdit'>;

export function ProfileEdit({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const p = app.profile;
  const units = p?.units ?? 'kg';

  const [sex, setSex] = useState<'female' | 'male'>(p?.sex ?? 'male');
  const [age, setAge] = useState(p?.age ?? 28);
  const [height, setHeight] = useState(p?.heightCm ?? 178);
  // Weight is edited in the athlete's display units, stored as kg.
  const [weight, setWeight] = useState(displayWeight(p?.weightKg ?? 82, units) ?? 82);
  const [experience, setExperience] = useState<Experience>(p?.experience ?? 'intermediate');

  const wStep = units === 'kg' ? 0.5 : 1;

  async function onSave() {
    haptics.confirm();
    const weightKg = units === 'lb' ? +(weight / 2.2046226).toFixed(1) : weight;
    await app.updateProfileInfo({ age, heightCm: height, weightKg, sex, experience });
    navigation.goBack();
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.back, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Icon name="chevronLeft" size={24} color={color.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">{t('profileEdit.title')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.sub}>{t('profileEdit.sub')}</Text>

        <Legend style={styles.sectionLegend}>{t('ob.bodyTitle')}</Legend>
        <View style={styles.rows}>
          <View style={styles.col}>
            <Legend>{t('ob.sex')}</Legend>
            <SegmentedControl
              options={[{ value: 'female', label: t('ob.female') }, { value: 'male', label: t('ob.male') }]}
              value={sex}
              onChange={(v) => setSex(v as 'female' | 'male')}
            />
          </View>
          <View style={styles.col}>
            <Legend>{t('ob.age')}</Legend>
            <WheelPicker value={age} onChange={setAge} min={14} max={90} label={t('ob.age')} style={styles.wheel} />
          </View>
          <View style={styles.col}>
            <Legend>{t('ob.height')}</Legend>
            <WheelPicker value={height} onChange={setHeight} min={120} max={220} unit="cm" label={t('ob.height')} style={styles.wheel} />
          </View>
          <View style={styles.col}>
            <Legend>{t('ob.weight')}</Legend>
            <WheelPicker value={weight} onChange={setWeight} step={wStep} min={units === 'kg' ? 35 : 75} max={units === 'kg' ? 250 : 550} unit={unitLabel(units)} label={t('ob.weight')} style={styles.wheel} />
          </View>
        </View>

        <Legend style={styles.sectionLegend}>{t('profile.experience')}</Legend>
        <OptStack
          value={experience}
          onChange={(v) => setExperience(v as Experience)}
          options={[
            { value: 'beginner', label: t('ob.expBeginner'), desc: t('ob.expBeginnerDesc') },
            { value: 'intermediate', label: t('ob.expIntermediate'), desc: t('ob.expIntermediateDesc') },
            { value: 'advanced', label: t('ob.expAdvanced'), desc: t('ob.expAdvancedDesc') },
          ]}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button variant="primary" size="lg" block label={t('profileEdit.save')} onPress={() => void onSave()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 4, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary },
  scroll: { flex: 1 },
  body: { paddingHorizontal: space.gutter, paddingTop: 6, paddingBottom: 24 },
  sub: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 20, color: color.textSecondary, marginBottom: 8 },
  sectionLegend: { marginTop: 22, marginBottom: 10 },
  rows: { gap: 18 },
  col: { gap: 8 },
  wheel: { alignSelf: 'stretch' },
  footer: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: color.border },
});
