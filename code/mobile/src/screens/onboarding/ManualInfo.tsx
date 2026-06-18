/**
 * 4.3 Manual Info — four fields, one screen (only reached when Health is skipped).
 * Age / Sex / Height / Weight. Underline fields for the numerics, three segmented
 * pills for sex. Continue → Goal, carrying the gathered profile draft.
 *
 * Replaces the former two-screen AboutYou / AboutYouBody split (HUSH_BUILD_SPEC
 * §4.3 is a single screen; spec wins, founder directive 2026-06-18).
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  InputAccessoryView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useCopy } from '@/i18n/useCopy';
import { color, space, radius, heroTitle, press } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ManualInfo'>;
type SexChoice = 'male' | 'female' | 'other';

// iOS number-pad has no Return key, so it can't dismiss itself. A shared accessory
// bar gives every numeric field an explicit "Done" above the keyboard.
const ACCESSORY_ID = 'manualInfoDone';

function toInt(s: string, fallback: number): number {
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function ManualInfo({ navigation }: Props) {
  const { t } = useCopy();
  const [age, setAge] = useState('28');
  const [sex, setSex] = useState<SexChoice>('male');
  const [height, setHeight] = useState('178');
  const [weight, setWeight] = useState('82');

  function onContinue() {
    navigation.navigate('Goal', {
      profile: {
        healthConnected: false,
        age: toInt(age, 28),
        sex: sex === 'other' ? undefined : sex,
        heightCm: toInt(height, 178),
        weightKg: toInt(weight, 82),
      },
    });
  }

  function onContinuePress() {
    Keyboard.dismiss();
    onContinue();
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Tap anywhere off a field to dismiss the keyboard (number-pad can't self-dismiss). */}
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          <View style={styles.body}>
            <Text style={styles.title}>{t('manualInfo.title')}</Text>

            <UnderlineField label={t('manualInfo.age')} value={age} onChange={setAge} />

            <View style={styles.field}>
              <Text style={styles.label}>{t('manualInfo.sex')}</Text>
              <View style={styles.pills}>
                {(['male', 'female', 'other'] as const).map((opt) => (
                  <Pill key={opt} label={t(`manualInfo.${opt}`)} selected={sex === opt} onPress={() => setSex(opt)} />
                ))}
              </View>
            </View>

            <UnderlineField label={t('manualInfo.height')} value={height} onChange={setHeight} suffix="cm" />
            <UnderlineField label={t('manualInfo.weight')} value={weight} onChange={setWeight} suffix="kg" />
          </View>
        </TouchableWithoutFeedback>
        <View style={styles.actions}>
          <PrimaryButton variant="compact" label={t('manualInfo.continue')} onPress={onContinuePress} />
        </View>
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View style={styles.accessory}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('manualInfo.continue')}
              hitSlop={8}
              onPress={Keyboard.dismiss}
              style={({ pressed }) => [styles.accessoryBtn, { opacity: pressed ? press.opacity : 1 }]}
            >
              <Text style={styles.accessoryText}>{t('editResult.done')}</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </SafeAreaView>
  );
}

function UnderlineField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.underline}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          keyboardType="number-pad"
          maxLength={3}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          inputAccessoryViewID={Platform.OS === 'ios' ? ACCESSORY_ID : undefined}
          selectionColor={color.textPrimary}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        selected ? styles.pillSelected : styles.pillIdle,
        { opacity: pressed ? press.opacity : 1 },
      ]}
    >
      <Text style={[styles.pillLabel, selected ? styles.pillLabelSelected : styles.pillLabelIdle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: space.gutter },
  accessory: { backgroundColor: color.surface2, alignItems: 'flex-end', paddingHorizontal: space.gutter, paddingVertical: 8 },
  accessoryBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  accessoryText: { color: color.accentBlue, fontSize: 16, fontWeight: '600' },
  title: { ...heroTitle(28), color: color.textPrimary, fontSize: 28, fontWeight: '600', marginBottom: 28 },
  field: { marginBottom: 20 },
  label: { fontSize: 13, color: color.textSecondary, marginBottom: 6 },
  underline: { flexDirection: 'row', alignItems: 'baseline', borderBottomWidth: 0.5, borderBottomColor: color.border, paddingBottom: 6 },
  input: { flex: 1, fontSize: 18, color: color.textPrimary, padding: 0 },
  suffix: { fontSize: 15, color: color.textSecondary, marginLeft: 6 },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 14 },
  pillSelected: { borderWidth: 1, borderColor: color.textPrimary },
  pillIdle: { borderWidth: 0.5, borderColor: color.border },
  pillLabel: { fontSize: 13 },
  pillLabelSelected: { color: color.textPrimary },
  pillLabelIdle: { color: color.textSecondary },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 40 },
});
