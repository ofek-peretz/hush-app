/**
 * LegalSheet — the terms and the privacy policy, IN the product (founder 2026-09-01: every open
 * finding is treated; the legal line may not point at nothing).
 *
 * ⛔ CONTENT OVER A LINK. The sign-in line promised "תנאי השימוש והפרטיות" and the product had no
 * document to open — a dead consent. An external URL was the interim; this sheet is the real
 * answer: the terms and the privacy policy as READABLE text, describing what the app actually
 * does — local storage, iCloud backup, the coach service, crash reports — and nothing it doesn't.
 * The copy lives in the locale packs like every other sentence, so it is linted, translated and
 * gendered by the same laws. Legal review may refine the WORDING in one place (`legal.*` keys);
 * the mechanism is done.
 */

//

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Legend, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { color, font } from '@/design/tokens';

export function LegalSheet({ onClose }: { onClose: () => void }) {
  const { t } = useCopy();
  // Section key → [title key, body key]. One list, so adding a section is one row + two strings.
  const sections: [string, string][] = [
    ['legal.termsTitle', 'legal.termsBody'],
    ['legal.privacyTitle', 'legal.privacyBody'],
    ['legal.healthTitle', 'legal.healthBody'],
    ['legal.billingTitle', 'legal.billingBody'],
  ];
  return (
    <BottomSheet onClose={onClose}>
      <Legend tone="accent" style={styles.legend}>{t('legal.sheetLegend')}</Legend>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {sections.map(([titleKey, bodyKey]) => (
          <View key={titleKey} style={styles.section}>
            <Text style={styles.title}>{t(titleKey)}</Text>
            <Text style={styles.body}>{t(bodyKey)}</Text>
          </View>
        ))}
        <Text style={styles.updated}>{t('legal.updated')}</Text>
      </ScrollView>
      <Button variant="ghost" block label={t('common.close')} onPress={onClose} style={styles.close} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  legend: { marginBottom: 4 },
  /* A bounded scroll INSIDE the sheet: legal text is long, and a sheet taller than the screen is
     a sheet with no close in reach. */
  scroll: { maxHeight: 420 },
  section: { marginTop: 18 },
  title: { fontFamily: font.sansSemibold, fontSize: 20, lineHeight: 26, color: color.textPrimary, textAlign: 'left' },
  body: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, marginTop: 6, textAlign: 'left' },
  updated: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, marginTop: 22, textAlign: 'left' },
  close: { marginTop: 14 },
});
