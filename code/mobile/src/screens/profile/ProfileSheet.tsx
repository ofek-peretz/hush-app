/**
 * Settings / Profile (§4.28) — rebuilt 1:1 to the Claude Design "Design System"
 * Settings (ui_kits/app/Settings.jsx). Identity (avatar + name), then grouped
 * rows: Preferences (Units, Language — SegmentedControls), Health (Apple Health —
 * Switch), Account (Body data, Experience, Membership). Sign out
 * (secondary) + Delete account (danger) at the bottom, version pinned beneath.
 *
 * Every action is the real one: units/language switch instantly, Health opens the
 * system permission flow, Sign Out / Delete run behind a native confirm.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { HushMark } from '@/components/HushMark';
import { Avatar, SegmentedControl, Switch, Legend, Button, Badge } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { health } from '@/platform/health';
import { setLocale, currentLocale } from '@/i18n';
import { freeSessionsRemaining, FREE_SESSION_LIMIT } from '@/domain/entitlement';
import { PRODUCT_PERIOD, isProductId } from '@/platform/billing';
import { color, space, font, textScale, tracking, trackingPx, press, down, radius, signal } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ProfileSheet'>;
type Overlay = 'none' | 'delete' | 'signout';

export function ProfileSheet({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const p = app.profile;
  const [overlay, setOverlay] = useState<Overlay>('none');

  const units = p?.units ?? 'kg';
  const locale = currentLocale();
  const memberSince = p?.memberSince
    ? new Date(p.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  function onUnits(v: string) {
    if (v !== units) void app.setUnits(v as 'kg' | 'lb');
  }
  async function onLanguage(v: string) {
    if (v === locale) return;
    await setLocale(v as 'en' | 'he');
    Alert.alert(t('language.title'), t('language.restartNote'));
  }
  async function onHealth() {
    const granted = await health.requestPermission();
    if (!granted) void Linking.openSettings();
  }

  // Both confirms use the in-theme BottomSheet (not the system ActionSheet's garish
  // red), so the danger action reads in the same calm clay as "Delete account".
  function confirmSignOut() {
    setOverlay('signout');
  }
  function confirmDelete() {
    setOverlay('delete');
  }

  // Body data + experience summaries (only the parts we actually have). Goal is no longer a per-user
  // setting — Hush is hypertrophy-first for everyone — so it's no longer surfaced as a profile field.
  const bodyBits = [
    p?.age != null ? `${p.age}` : null,
    p?.heightCm != null ? `${p.heightCm} cm` : null,
    p?.weightKg != null ? `${p.weightKg} kg` : null,
  ].filter(Boolean);
  const bodyData = bodyBits.length ? bodyBits.join(' · ') : null;
  const experienceLabel = p?.experience ? t(`experience.${p.experience}`) : null;

  // Membership (Subscription + Apple Payments): active → plan name, tapping opens
  // the system manage-subscriptions screen; inactive → free-trial status, tapping
  // opens the paywall.
  const ent = app.entitlement;
  const planPeriod = ent.productId && isProductId(ent.productId) ? PRODUCT_PERIOD[ent.productId] : null;
  const sessionsLeft = freeSessionsRemaining(app.modeState.completedSessions);
  const membershipState: 'active' | 'trial' | 'ended' = ent.active ? 'active' : sessionsLeft > 0 ? 'trial' : 'ended';
  function onMembership() {
    if (ent.active) {
      void Linking.openURL('itms-apps://apps.apple.com/account/subscriptions').catch(() => {});
    } else {
      navigation.navigate('Paywall', { source: 'profile' });
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
          <Icon name="chevronLeft" size={24} color={color.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">{t('profile.settings')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* identity */}
        <View style={styles.identity}>
          <Avatar name={p?.name ?? '?'} size={52} />
          <View style={styles.identityText}>
            {p?.name ? <Text style={styles.name}>{p.name}</Text> : null}
            {memberSince ? <Text style={styles.identitySub}>{t('profile.memberSince')} {memberSince}</Text> : null}
          </View>
        </View>

        <Legend style={styles.sectionLegend}>{t('profile.preferences')}</Legend>
        <Row label={t('profile.units')} control={<SegmentedControl options={['kg', 'lb']} value={units} onChange={onUnits} />} />
        <Row
          label={t('profile.language')}
          sub={locale === 'he' ? t('language.hebrew') : t('language.english')}
          control={
            <SegmentedControl
              options={[{ value: 'en', label: 'EN' }, { value: 'he', label: 'עב' }]}
              value={locale}
              onChange={onLanguage}
            />
          }
          last
        />

        {/* Membership (Subscription + Apple Payments) — its own prominent card with a
            state badge; trial state adds a sessions-left meter + an honest billing note. */}
        <Legend style={styles.sectionLegend}>{t('profile.membership')}</Legend>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('profile.membership')}
          onPress={onMembership}
          style={({ pressed }) => [styles.memberCard, pressed && styles.memberCardPressed]}
        >
          <View style={styles.memberIconBox}>
            <HushMark size={22} />
          </View>
          <View style={styles.memberBody}>
            <View style={styles.memberTitleRow}>
              <Text style={styles.memberTitle}>{t('profile.proName')}</Text>
              <Badge tone={membershipState === 'active' ? 'up' : membershipState === 'ended' ? 'neutral' : 'signal'} legend>
                {membershipState === 'active' ? t('profile.badgeActive') : membershipState === 'ended' ? t('profile.badgeExpired') : t('profile.badgeTrial')}
              </Badge>
            </View>
            <Text style={styles.memberSub}>
              {membershipState === 'active' ? (
                t('profile.activeSub', { plan: planPeriod ? t(`paywall.${planPeriod}`) : t('profile.membershipProGeneric') })
              ) : membershipState === 'ended' ? (
                t('profile.endedSub')
              ) : (
                <>
                  <Text style={styles.memberSessions}>{sessionsLeft}</Text>
                  {t('profile.trialSubRest', { total: FREE_SESSION_LIMIT })}
                </>
              )}
            </Text>
            {membershipState === 'trial' ? (
              <View style={styles.memberTrack}>
                <View style={[styles.memberFill, { width: `${((FREE_SESSION_LIMIT - sessionsLeft) / FREE_SESSION_LIMIT) * 100}%` }]} />
              </View>
            ) : null}
          </View>
          <View style={membershipState === 'trial' ? styles.memberChevronTop : styles.memberChevron}>
            <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />
          </View>
        </Pressable>
        {membershipState === 'trial' ? <Text style={styles.trialNote}>{t('profile.trialNote')}</Text> : null}

        <Legend style={styles.sectionLegend}>{t('profile.healthSection')}</Legend>
        <Row
          label={t('profile.appleHealth')}
          sub={p?.healthConnected ? t('profile.healthImporting') : t('profile.notConnected')}
          control={<Switch checked={!!p?.healthConnected} onChange={() => void onHealth()} accessibilityLabel={t('profile.appleHealth')} />}
          last
        />
        <Text style={styles.healthNote}>{t('profile.healthNote')}</Text>

        <Legend style={styles.sectionLegend}>{t('profile.account')}</Legend>
        {bodyData ? <Row label={t('profile.bodyData')} sub={bodyData} last={!experienceLabel} /> : null}
        {experienceLabel ? <Row label={t('profile.experience')} sub={experienceLabel} last /> : null}

        {__DEV__ ? (
          <>
            <Legend style={styles.sectionLegend}>Developer</Legend>
            <Row label="v4 engine state" sub="Per-slot debug / QA" onPress={() => navigation.navigate('V4Debug')} last />
          </>
        ) : null}

        <View style={styles.actions}>
          <Button variant="secondary" block label={t('profile.signOut')} onPress={confirmSignOut} />
          <Button variant="danger" block label={t('profile.deleteAccount')} onPress={confirmDelete} />
        </View>
        <Text style={styles.version}>{t('profile.version')}</Text>
      </ScrollView>

      {overlay === 'signout' ? (
        <BottomSheet onClose={() => setOverlay('none')} heightFraction={0.3}>
          <Text style={styles.confirm}>{t('profile.signOutConfirm')}</Text>
          <View style={styles.confirmActions}>
            <Button variant="danger" block label={t('profile.signOut')} onPress={() => app.resetAccount()} />
            <Button variant="quiet" block label={t('profile.cancel')} onPress={() => setOverlay('none')} />
          </View>
        </BottomSheet>
      ) : null}
      {overlay === 'delete' ? (
        <BottomSheet onClose={() => setOverlay('none')} heightFraction={0.3}>
          <Text style={styles.confirm}>{t('profile.deleteConfirm')}</Text>
          <View style={styles.confirmActions}>
            <Button variant="danger" block label={t('profile.deleteAccount')} onPress={() => app.deleteAccount()} />
            <Button variant="quiet" block label={t('profile.cancel')} onPress={() => setOverlay('none')} />
          </View>
        </BottomSheet>
      ) : null}
    </SafeAreaView>
  );
}

function Row({
  label,
  sub,
  control,
  danger,
  last,
  onPress,
}: {
  label: string;
  sub?: string;
  control?: React.ReactNode;
  danger?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.rowDanger]}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {control}
    </>
  );
  const rowStyle = [styles.row, !last && styles.rowBorder];
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [...rowStyle, pressed && styles.rowPressed]}>
      {body}
    </Pressable>
  ) : (
    <View style={rowStyle}>{body}</View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 4, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary },
  scroll: { flex: 1 },
  body: { paddingHorizontal: space.gutter, paddingTop: 6, paddingBottom: 24 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 6, paddingBottom: 18 },
  identityText: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.sansSemibold, fontSize: textScale.lg, color: color.textPrimary },
  identitySub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2 },

  sectionLegend: { marginTop: 20, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: color.border },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: font.sans, fontSize: textScale.base, color: color.textPrimary },
  rowDanger: { color: down[0] },
  rowSub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2 },

  // membership card
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  memberCardPressed: { backgroundColor: color.fillSubtle },
  memberIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: color.fillSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberBody: { flex: 1, minWidth: 0 },
  memberTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberTitle: { fontFamily: font.sansSemibold, fontSize: textScale.base, letterSpacing: trackingPx(textScale.base, tracking.tight), color: color.textPrimary },
  memberSub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 3 },
  memberSessions: { fontFamily: font.monoSemibold, color: color.accentText },
  memberTrack: { height: 4, borderRadius: 2, backgroundColor: color.fillSubtle, marginTop: 10, overflow: 'hidden' },
  memberFill: { height: '100%', backgroundColor: signal[0], borderRadius: 2 },
  memberChevron: { alignSelf: 'center' },
  memberChevronTop: { alignSelf: 'flex-start', marginTop: 4 },
  trialNote: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textTertiary, lineHeight: 20, marginTop: 8, marginHorizontal: 2 },
  healthNote: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textTertiary, lineHeight: 20, marginTop: 8, marginHorizontal: 2 },

  actions: { marginTop: 28, gap: 10 },
  version: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textTertiary, textAlign: 'center', marginTop: 18 },
  confirm: { fontFamily: font.sansSemibold, fontSize: textScale.lg, color: color.textPrimary, textAlign: 'center', marginBottom: 18 },
  confirmActions: { gap: 10 },
});
