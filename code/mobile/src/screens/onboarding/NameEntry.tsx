/**
 * NameEntry — "What should we call you?" (after Consent). Captures the athlete's name
 * so Hush can address them by name (greeting, Profile). This is the reliable name
 * source while Apple Sign In's name is pending; if Apple did provide one it's already
 * stored and used as the default here. Skippable — the name is optional.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextAction } from '@/components/TextAction';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, space, heroTitle, s } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'NameEntry'>;

export function NameEntry({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [name, setName] = useState(app.profile?.name ?? '');

  function onContinue() {
    Keyboard.dismiss();
    app.setPendingName(name);
    navigation.navigate('ConnectHealth');
  }

  function onSkip() {
    Keyboard.dismiss();
    navigation.navigate('ConnectHealth');
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{t('nameEntry.title')}</Text>
          <View style={styles.field}>
            <Text style={styles.label}>{t('nameEntry.label')}</Text>
            <View style={styles.underline}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={t('nameEntry.placeholder')}
                placeholderTextColor={color.textTertiary}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={onContinue}
                selectionColor={color.textPrimary}
              />
            </View>
          </View>
        </ScrollView>
        <View style={styles.actions}>
          <PrimaryButton variant="compact" label={t('nameEntry.continue')} onPress={onContinue} />
          <View style={styles.skip}>
            <TextAction label={t('nameEntry.skip')} onPress={onSkip} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1, justifyContent: 'space-between' },
  scrollBody: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.gutter, paddingVertical: s(24) },
  title: { ...heroTitle(s(28)), color: color.textPrimary, fontSize: s(28), fontWeight: '600', marginBottom: s(28) },
  field: { marginBottom: s(20) },
  label: { fontSize: s(13), color: color.textSecondary, marginBottom: s(6) },
  underline: { borderBottomWidth: 0.5, borderBottomColor: color.border, paddingBottom: s(8) },
  input: { fontSize: s(18), color: color.textPrimary, padding: 0 },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 40 },
  skip: { marginTop: s(8), alignItems: 'center' },
});
