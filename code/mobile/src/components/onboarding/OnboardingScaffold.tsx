/**
 * OnboardingScaffold — the shared chrome for the design's onboarding flow
 * (ui_kits/app/Onboarding.jsx): an optional back control, a 5-segment progress
 * bar, the head (legend → title → sub), a scrollable body, and a pinned footer.
 * One decision per screen, nothing optional dressed up as required.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, space, font, textScale, tracking, trackingPx, signal } from '@/design/tokens';

interface Props {
  onBack?: () => void;
  progress?: { index: number; total: number }; // e.g. { index: 1, total: 6 }
  legend?: string;
  title: string;
  sub?: string;
  keyboard?: boolean; // wrap the body in a KeyboardAvoidingView (typed inputs)
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

export function OnboardingScaffold({ onBack, progress, legend, title, sub, keyboard, footer, children }: Props) {
  const { t } = useCopy();

  const Body = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.head}>
        {legend ? <Legend style={styles.legend}>{legend}</Legend> : null}
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        {onBack ? (
          <IconButton accessibilityLabel={t('common.back')} onPress={onBack}>
            <Icon name="chevronLeft" size={20} color={color.textPrimary} strokeWidth={2} />
          </IconButton>
        ) : null}
        {progress ? (
          <View style={styles.progress}>
            {Array.from({ length: progress.total }).map((_, i) => (
              <View key={i} style={[styles.seg, i < progress.index ? styles.segOn : styles.segOff]} />
            ))}
          </View>
        ) : null}
      </View>

      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {Body}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </KeyboardAvoidingView>
      ) : (
        <>
          {Body}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.gutter - 4, paddingTop: 4, minHeight: 44 },
  progress: { flexDirection: 'row', gap: 5, flex: 1, paddingHorizontal: 4 },
  seg: { flex: 1, height: 3, borderRadius: 2 },
  segOn: { backgroundColor: signal[0] },
  segOff: { backgroundColor: color.fillSubtleStrong },

  body: { paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: 20, flexGrow: 1 },
  head: { marginBottom: 26 },
  legend: { marginBottom: 8 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.tight), lineHeight: textScale['2xl'] * 1.1, color: color.textPrimary },
  sub: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22, color: color.textSecondary, marginTop: 10 },

  footer: { paddingHorizontal: space.gutter, paddingTop: 14, paddingBottom: 12, gap: 10 },
});
