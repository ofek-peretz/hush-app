/**
 * 1.22 Settings — account maintenance only (spec §1.22, §3.2). NOT a dashboard.
 *  - Units: kg/lb, tap option => instant save + auto-close, restyles every
 *    weight display instantly (§10.1).
 *  - Health Data: status + "Open System Settings" (OS deep-link).
 *  - Delete Account / Sign Out: confirm sheet => Enrollment (resetAccount; clears the invite token).
 *
 * Confirmations are modal sheets; the destructive action uses the SAME white
 * button as everything else (no danger color, §8.1).
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextAction } from '@/components/TextAction';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import type { Units } from '@/data/local/models';
import { color, layout, press, type as typo } from '@/design/tokens';

type Overlay = 'none' | 'units' | 'delete' | 'signout';

export function Settings() {
  const { t } = useCopy();
  const app = useApp();
  const [overlay, setOverlay] = useState<Overlay>('none');
  const units = app.profile?.units ?? 'kg';

  async function pickUnits(u: Units) {
    await app.setUnits(u); // instant save
    setOverlay('none'); // auto-close
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.rows}>
        <Row label={t('settings.units')} value={units === 'kg' ? t('settings.unitsKg') : t('settings.unitsLb')} onPress={() => setOverlay('units')} />
        <Row label={t('settings.healthData')} onPress={() => Linking.openSettings()} />
        <Row label={t('settings.deleteAccount')} onPress={() => setOverlay('delete')} />
        <Row label={t('settings.signOut')} onPress={() => setOverlay('signout')} />
      </View>

      {overlay === 'units' ? (
        <Scrim onDismiss={() => setOverlay('none')}>
          <Option label={t('settings.unitsKg')} onPress={() => pickUnits('kg')} />
          <Option label={t('settings.unitsLb')} onPress={() => pickUnits('lb')} />
        </Scrim>
      ) : null}

      {overlay === 'delete' ? (
        <Scrim onDismiss={() => setOverlay('none')}>
          <Text style={styles.confirm}>{t('settings.deleteConfirm')}</Text>
          <PrimaryButton label={t('settings.deleteAccount')} onPress={() => app.resetAccount()} />
        </Scrim>
      ) : null}

      {overlay === 'signout' ? (
        <Scrim onDismiss={() => setOverlay('none')}>
          <Text style={styles.confirm}>{t('settings.signOutConfirm')}</Text>
          <PrimaryButton label={t('settings.signOut')} onPress={() => app.resetAccount()} />
        </Scrim>
      ) : null}
    </SafeAreaView>
  );
}

function Row({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? press.opacity : 1 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
    </Pressable>
  );
}

function Scrim({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <Pressable style={styles.scrim} onPress={onDismiss}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        {children}
      </Pressable>
    </Pressable>
  );
}

function Option({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.option}>
      <TextAction label={label} onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase },
  rows: { paddingTop: 24, paddingHorizontal: layout.screenMargin },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderSubtle },
  rowLabel: { color: color.textPrimary, fontSize: typo.bodyL.size },
  rowValue: { color: color.textSecondary, fontSize: typo.bodyM.size },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.bgSurface, padding: layout.screenMargin, paddingBottom: 32, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  option: { paddingVertical: 8, alignItems: 'flex-start' },
  confirm: { color: color.textPrimary, fontSize: typo.bodyL.size, marginBottom: 24 },
});
