/**
 * 4.28 Profile — account/identity hub opened from the Home hamburger. Identity
 * block (name + stats), then the account list: Units (kg/lb toggle, instant),
 * Membership (member-since), Health Access (status + system settings), Sign Out,
 * and Delete Account (the one danger-colored row). Version pinned to the bottom.
 *
 * Consolidates the former separate Settings screen. Sign Out / Delete are real
 * actions behind a confirm sheet; the destructive one is clearly differentiated.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, ScrollView, Platform, ActionSheetIOS } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextAction } from '@/components/TextAction';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { Divider05 } from '@/components/Divider05';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { health } from '@/platform/health';
import { color, space, heroTitle, press, s } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ProfileSheet'>;
type Overlay = 'none' | 'delete' | 'signout';

export function ProfileSheet({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const p = app.profile;
  const [overlay, setOverlay] = useState<Overlay>('none');
  const portraitUnlocked = app.modeState.portrait === 'PORTRAIT_UNLOCKED';
  const pendingPortraitForecast = app.forecasts.some((f) => f.type === 'portrait' && f.state === 'PENDING');

  const units = p?.units ?? 'kg';
  const stats = [
    p?.sex ? cap(p.sex) : null,
    p?.age != null ? String(p.age) : null,
    p?.heightCm != null ? `${p.heightCm} cm` : null,
    p?.weightKg != null ? `${p.weightKg} kg` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const memberSince = p?.memberSince
    ? new Date(p.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  function toggleUnits() {
    void app.setUnits(units === 'kg' ? 'lb' : 'kg');
  }

  // Open the HealthKit permission flow (the system Health sheet) — not the app's
  // generic Settings page. iOS only shows the sheet while authorization is still
  // undetermined; once decided it can't be reshown, so we fall back to Settings.
  async function onHealthAccess() {
    const granted = await health.requestPermission();
    if (!granted) void Linking.openSettings();
  }

  // iOS: a native action sheet with a red destructive row + Cancel (the idiomatic
  // confirm for Sign Out / Delete). Other platforms use the in-app confirm sheet.
  function confirmSignOut() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t('profile.signOutConfirm'),
          options: [t('profile.cancel'), t('profile.signOut')],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
          userInterfaceStyle: 'dark',
        },
        (i) => {
          if (i === 1) void app.resetAccount();
        },
      );
    } else {
      setOverlay('signout');
    }
  }

  function confirmDelete() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t('profile.deleteConfirm'),
          options: [t('profile.cancel'), t('profile.deleteAccount')],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
          userInterfaceStyle: 'dark',
        },
        (i) => {
          if (i === 1) void app.deleteAccount();
        },
      );
    } else {
      setOverlay('delete');
    }
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
          <Icon name="chevronLeft" size={22} color={color.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <View style={styles.identity}>
          {p?.name ? <Text style={styles.name} accessibilityRole="header">{p.name}</Text> : null}
          {stats.length > 0 ? <Text style={styles.stats}>{stats}</Text> : null}
        </View>

        <Divider05 />
        <Row label={t('profile.units')} value={units} onPress={toggleUnits} />
        {memberSince ? (
          <Row label={t('profile.membership')} twoLine={{ top: t('profile.memberSince'), bottom: memberSince }} />
        ) : null}
        <Row
          label={t('profile.healthAccess')}
          value={p?.healthConnected ? t('profile.connected') : t('profile.notConnected')}
          onPress={onHealthAccess}
        />
        <Row label={t('profile.signOut')} chevron onPress={confirmSignOut} />
        <Row label={t('profile.deleteAccount')} danger onPress={confirmDelete} />

        {/* Test harness — compiled out of release builds (__DEV__ only). */}
        {__DEV__ && !portraitUnlocked ? (
          <View style={styles.dev}>
            <TextAction
              label="DEV · jump to Portrait unlock"
              onPress={async () => {
                await app.devUnlockPortrait();
                navigation.navigate('PortraitUnlock');
              }}
            />
          </View>
        ) : null}
        {__DEV__ && pendingPortraitForecast ? (
          <View style={styles.dev}>
            <TextAction label="DEV · resolve forecast: success" onPress={async () => { await app.devResolvePortraitForecast(true); navigation.navigate('PortraitRevisit', { receipt: true }); }} />
            <TextAction label="DEV · resolve forecast: fail (silent)" onPress={() => app.devResolvePortraitForecast(false)} />
          </View>
        ) : null}
      </ScrollView>

      <Text style={styles.version}>{t('profile.version')}</Text>

      {overlay === 'signout' ? (
        <BottomSheet onClose={() => setOverlay('none')} background={color.surface} heightFraction={0.3}>
          <Text style={styles.confirm}>{t('profile.signOutConfirm')}</Text>
          <PrimaryButton variant="compact" label={t('profile.signOut')} onPress={() => app.resetAccount()} />
          <View style={styles.cancelRow}>
            <TextAction label={t('profile.cancel')} onPress={() => setOverlay('none')} />
          </View>
        </BottomSheet>
      ) : null}
      {overlay === 'delete' ? (
        <BottomSheet onClose={() => setOverlay('none')} background={color.surface} heightFraction={0.3}>
          <Text style={styles.confirm}>{t('profile.deleteConfirm')}</Text>
          <PrimaryButton variant="compact" label={t('profile.deleteAccount')} onPress={() => app.deleteAccount()} />
          <View style={styles.cancelRow}>
            <TextAction label={t('profile.cancel')} onPress={() => setOverlay('none')} />
          </View>
        </BottomSheet>
      ) : null}
    </SafeAreaView>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Row({
  label,
  value,
  chevron,
  danger,
  twoLine,
  onPress,
}: {
  label: string;
  value?: string;
  chevron?: boolean;
  danger?: boolean;
  twoLine?: { top: string; bottom: string };
  onPress?: () => void;
}) {
  const body = (
    <>
      <Text style={[styles.rowLabel, danger ? styles.danger : null]}>{label}</Text>
      {twoLine ? (
        <View style={styles.twoLine}>
          <Text style={styles.rowValue}>{twoLine.top}</Text>
          <Text style={styles.rowValue}>{twoLine.bottom}</Text>
        </View>
      ) : value ? (
        <Text style={styles.rowValue}>{value}</Text>
      ) : chevron ? (
        <Icon name="chevronRight" size={16} color={color.textTertiary} strokeWidth={2} />
      ) : null}
    </>
  );
  return (
    <>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={({ pressed }) => [styles.row, { opacity: pressed ? press.opacity : 1 }]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={styles.row}>{body}</View>
      )}
      <Divider05 />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { paddingHorizontal: space.gutter, paddingTop: 6 },
  back: { width: 36, height: 40, alignItems: 'flex-start', justifyContent: 'center', marginLeft: -8 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: space.gutter, paddingTop: 24, paddingBottom: 24 },
  identity: { marginBottom: s(34) },
  name: { ...heroTitle(s(32)), color: color.textPrimary, fontSize: s(32), fontWeight: '600' },
  stats: { fontSize: s(14), color: color.textSecondary, marginTop: s(6) },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: s(18) },
  rowLabel: { fontSize: s(16), color: color.textPrimary },
  rowValue: { fontSize: s(13), color: color.textSecondary },
  twoLine: { alignItems: 'flex-end' },
  danger: { color: color.danger },
  dev: { marginTop: 24, gap: 8, alignItems: 'flex-start' },
  version: { fontSize: s(11), color: color.textTertiary, textAlign: 'center', paddingVertical: s(12) },
  confirm: { fontSize: s(18), color: color.textPrimary, textAlign: 'center', marginBottom: s(24) },
  cancelRow: { marginTop: 8, alignItems: 'center' },
});
