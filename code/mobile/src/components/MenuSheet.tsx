/**
 * MenuSheet — the navigation menu that slides DOWN from the top (founder direction:
 * replaces the hamburger). Lists the app's destinations — Program · History — and,
 * below a divider, Settings (units, language, account). Portrait was removed.
 * Each row navigates and dismisses the sheet.
 *
 * Presentational: the parent supplies the per-destination handlers + onClose.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { TopSheet } from '@/components/TopSheet';
import { Icon, type IconName } from '@/components/Icon';
import { Divider05 } from '@/components/Divider05';
import { useCopy } from '@/i18n/useCopy';
import { color, heroTitle, press, s } from '@/design/tokens';

export interface MenuSheetProps {
  onClose: () => void;
  onProgram: () => void;
  onHistory: () => void;
  onSettings: () => void;
}

export function MenuSheet(props: MenuSheetProps) {
  const { t } = useCopy();

  return (
    <TopSheet onClose={props.onClose} background={color.surface}>
      <Text style={styles.title} accessibilityRole="header">{t('menu.title')}</Text>

      <MenuRow icon="program" label={t('menu.program')} onPress={props.onProgram} />
      <MenuRow icon="history" label={t('menu.history')} onPress={props.onHistory} />

      <View style={styles.divider}>
        <Divider05 />
      </View>

      <MenuRow icon="settings" label={t('menu.settings')} onPress={props.onSettings} />
    </TopSheet>
  );
}

function MenuRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? press.opacity : 1 }]}
    >
      <View style={styles.left}>
        <Icon name={icon} size={22} color={color.textPrimary} strokeWidth={1.9} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Icon name="chevronRight" size={16} color={color.textTertiary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { ...heroTitle(s(20)), color: color.textPrimary, fontSize: s(20), fontWeight: '700', marginBottom: s(6), paddingHorizontal: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: s(15),
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: s(16) },
  label: { fontSize: s(17), color: color.textPrimary },
  divider: { paddingVertical: s(4) },
});
