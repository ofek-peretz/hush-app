/**
 * Edit profile (§4.28; founder 2026-07-10) — the edit surface is exactly HEIGHT,
 * WEIGHT and SESSIONS PER WEEK. Nothing else:
 *  - Sex is fixed at onboarding (it never changes, so it is never re-asked).
 *  - Age is asked once and the app advances it yearly by itself (domain/profileAge) —
 *    programs always see the current age without the athlete maintaining it.
 *  - Experience is derived from the athlete's real progression, not self-reported twice.
 *
 * Corrections must never reset progression: height/weight inform the next weekly
 * regeneration + cold starts; a changed weekly frequency rebuilds the week immediately
 * (the split must match).
 *
 * A save is ACKNOWLEDGED before the screen closes (founder 2026-07-11): the button itself
 * turns into "Saved ✓" with a confirm haptic and holds for a beat, so the athlete SEES the
 * change land — a toast on the screen behind is not felt as feedback.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend, WheelPicker, Button, useToast } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { displayWeight, unitLabel } from '@/domain/schedule';
import * as haptics from '@/platform/haptics';
import { color, space, font, textScale, tracking, trackingPx, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ProfileEdit'>;

export function ProfileEdit({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const toast = useToast();
  const p = app.profile;
  const units = p?.units ?? 'kg';

  const [height, setHeight] = useState(p?.heightCm ?? 178);
  // Weight is edited in the athlete's display units, stored as kg.
  const [weight, setWeight] = useState(displayWeight(p?.weightKg ?? 82, units) ?? 82);
  const [days, setDays] = useState(p?.daysPerWeek ?? 4);
  // The save is ACKNOWLEDGED on this screen before it closes (founder 2026-07-11: a toast on the
  // screen behind is not felt as feedback). The button itself confirms — "Saved ✓" — the athlete
  // sees it land, and only then does the screen step back (where the toast still greets them).
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');

  const wStep = units === 'kg' ? 0.5 : 1;
  const dirty =
    height !== (p?.heightCm ?? 178) ||
    weight !== (displayWeight(p?.weightKg ?? 82, units) ?? 82) ||
    days !== (p?.daysPerWeek ?? 4);

  async function onSave() {
    if (saving !== 'idle') return; // one save per tap — never double-submit a rebuild
    setSaving('saving');
    const weightKg = units === 'lb' ? +(weight / 2.2046226).toFixed(1) : weight;
    const daysChanged = days !== p?.daysPerWeek;
    try {
      await app.updateProfileInfo({ heightCm: height, weightKg, daysPerWeek: days });
    } catch {
      setSaving('idle'); // nothing persisted — let the athlete try again rather than lie
      return;
    }
    haptics.confirm();
    setSaving('saved');
    toast.show(daysChanged ? t('profileEdit.savedDays') : t('profileEdit.saved'));
    // Hold the confirmation long enough to be READ, then step back.
    setTimeout(() => navigation.goBack(), 750);
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

        {/* The unit cells are gone from the rules (founder 2026-07-12) — a number under a legend
            that says Height is a height. Where the unit is genuinely ambiguous (kg vs lb) it now
            rides the LEGEND, which is where a field's unit belongs anyway. */}
        <View style={styles.rows}>
          <View style={styles.col}>
            <Legend>{t('ob.height')}</Legend>
            <WheelPicker value={height} onChange={setHeight} min={120} max={220} label={t('ob.height')} style={styles.wheel} />
          </View>
          <View style={styles.col}>
            <Legend>{t('ob.weightWith', { unit: unitLabel(units) })}</Legend>
            <WheelPicker value={weight} onChange={setWeight} step={wStep} min={units === 'kg' ? 35 : 75} max={units === 'kg' ? 250 : 550} label={t('ob.weight')} style={styles.wheel} />
          </View>
          <View style={styles.col}>
            <Legend>{t('ob.daysLabel')}</Legend>
            <WheelPicker value={days} onChange={setDays} min={2} max={6} label={t('ob.daysUnit')} style={styles.wheel} />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          variant="primary"
          size="lg"
          block
          label={
            saving === 'saved'
              ? t('profileEdit.savedShort')
              : saving === 'saving'
                ? t('profileEdit.saving')
                : t('profileEdit.save')
          }
          leading={saving === 'saved' ? <Icon name="check" size={18} color={color.onAccent} strokeWidth={2.6} /> : undefined}
          disabled={saving !== 'idle' || !dirty}
          onPress={() => void onSave()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 4, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, textAlign: 'left' },
  scroll: { flex: 1 },
  body: { paddingHorizontal: space.gutter, paddingTop: 6, paddingBottom: 24 },
  sub: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 20, color: color.textSecondary, marginBottom: 16, textAlign: 'left' },
  rows: { gap: 18 },
  col: { gap: 8 },
  wheel: { alignSelf: 'stretch' },
  note: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 19, color: color.textTertiary, marginTop: 2, textAlign: 'left' },
  footer: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: color.border },
});
