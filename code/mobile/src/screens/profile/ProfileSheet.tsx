/**
 * Settings — a TAB now (founder 2026-07-17), not a modal. Identity (avatar + name) with Membership
 * directly beneath it (who you are + your plan, one zone — the Apple Settings idiom), then grouped
 * rows: Preferences (Units, Language), Health (Apple Health), Account (Body data, Body map). Sign
 * out + Delete account at the bottom; the version reads the REAL version from the binary, under the
 * product's own thesis — "Built on facts."
 *
 * There is NO Experience row (v5 deleted the concept — the first set measures her). Every action is
 * the real one: units/language switch instantly, Health opens the system permission flow, Sign Out /
 * Delete run behind a native confirm.
 */
import React, { useState, useMemo } from 'react';
// The map's row states the map, and it reads it with the ENGINE's own predicates — so this row and
// the programme can never disagree about what she chose.
import { emphasisMuscles, trainableMuscles } from '@/engine/v5/bodyMap';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { View, Text, Pressable, StyleSheet, Linking, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import Constants from 'expo-constants';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { HushMark } from '@/components/HushMark';
import { Avatar, SegmentedControl, Switch, Legend, Button, Badge, useToast } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { health } from '@/platform/health';
import type { HealthPermissionState } from '@/platform/health/healthModel';
import * as haptics from '@/platform/haptics';
import { setLocale, currentLocale } from '@/i18n';
import { notifier } from '@/platform/notifications';
import { reloadApp } from '@/app/reload';
import { freeSessionsRemaining, FREE_SESSION_LIMIT } from '@/domain/entitlement';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { PRODUCT_PERIOD, isProductId } from '@/platform/billing';
import { color, space, font, textScale, tracking, trackingPx, press, alert, radius, signal } from '@/design/tokens';
import type { MainParamList, HomeTabsParamList } from '@/app/navigation';

// A TAB now (founder 2026-07-17), so it pushes onto the parent stack — the Props are the
// composite of the tab it lives in and the stack above it.
type Props = CompositeScreenProps<
  BottomTabScreenProps<HomeTabsParamList, 'You'>,
  NativeStackScreenProps<MainParamList>
>;
type Overlay = 'none' | 'delete' | 'signout';

export function ProfileSheet({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  // Whether there is a programme to share at all. `undefined` until the read lands; the row simply
  // does not draw until then, which is right — an entrance that appears and works beats one that
  // appears and apologises.
  const [hasPlan, setHasPlan] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    void db.loadCoachPlan().then((p) => alive && setHasPlan(!!p && p.sessions.length > 0));
    return () => {
      alive = false;
    };
  }, []);
  const toast = useToast();
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
    try {
      await setLocale(v as 'en' | 'he');
    } catch {
      // The language did not switch. Reloading anyway would remount the app in the OLD language
      // and read as a dead control — so do nothing, and leave the segmented control where it is.
      return;
    }
    /**
     * A SCHEDULED NOTE IS FROZEN COPY. The weekly update note is written once, at boot, and handed
     * to iOS with its words already in it — so an athlete who switches to Hebrew here would go on
     * receiving an English note every Saturday until the next COLD start (the language reload
     * below remounts the navigator, not the store that schedules it). Re-scheduling coalesces onto
     * the same id, so this simply rewrites the pending note in the language just chosen.
     */
    void notifier.scheduleWeeklyUpdate();
    // Apply the new writing direction (RTL ⇄ LTR) immediately — no manual relaunch.
    reloadApp();
  }
  /**
   * Apple Health, on and off.
   *
   * FOUNDER 2026-07-12: "if I didn't turn Health on at the start, Settings won't let me turn it
   * on." Two faults, and both are fixed here:
   *
   *  1. The switch had no writer. Nothing in this screen ever persisted `healthConnected` — only
   *     onboarding did — so the flip could not stick no matter what the permission flow returned.
   *     It now writes through `app.setHealthConnected`.
   *
   *  2. iOS never re-prompts. Once the athlete has answered the HealthKit sheet — even by
   *     declining — `requestAuthorization` resolves immediately without showing anything, and
   *     read-grants are opaque by design (Apple will not tell an app it was denied). So a
   *     "request" here can neither prompt nor report. The only place the connection can actually
   *     be turned on after a first refusal is the system Settings app, and that is where a
   *     never-asked athlete lands too if the sheet does not appear.
   */
  async function onHealth() {
    // On → off: ours to drop. iOS keeps its own grant (only Settings revokes that), but Hush
    // stops reading, and the switch stops claiming a connection.
    if (p?.healthConnected) {
      await app.setHealthConnected(false);
      return;
    }
    let state: HealthPermissionState = 'unknown';
    try {
      await health.requestPermission(); // shows the sheet ONLY if it has never been shown
      state = await health.permissionState();
    } catch {
      state = 'unavailable';
    }
    if (state === 'granted') {
      // Determined — the sheet was answered (now or once before). Whether the answer was yes is
      // not knowable; readability gates the actual adoption, so a refusal simply yields no
      // samples rather than a lie. Turn the switch on and let the data speak.
      await app.setHealthConnected(true);
      haptics.success();
      return;
    }
    // Not determined, or HealthKit is unavailable: nothing more can happen in-app.
    toast.show(t('profile.healthOpenSettings'));
    void Linking.openSettings();
  }

  // Both confirms use the in-theme BottomSheet (not the system ActionSheet's garish
  // red), so the danger action reads in the same calm clay as "Delete account".
  function confirmSignOut() {
    setOverlay('signout');
  }
  function confirmDelete() {
    setOverlay('delete');
  }

  // Body data summary — exactly what the edit screen manages (Rev 14: weight + sessions/week;
  // sex is system-maintained, and age/height are no longer collected at all — neither was ever an
  // engine input, register B-1). Goal is no longer a per-user setting.
  const bodyBits = [
    // The athlete's OWN unit (an lb athlete never reads their bodyweight in kg).
    p?.weightKg != null ? `${displayWeight(p.weightKg, units)} ${unitLabel(units)}` : null,
    p?.daysPerWeek != null ? t('profile.daysSummary', { n: p.daysPerWeek }) : null,
  ].filter(Boolean);
  const bodyData = bodyBits.length ? bodyBits.join(' · ') : null;

  /**
   * What the map currently SAYS, on its row — never a static caption.
   *
   * An untouched map is the honest common case and reads as "everything on"; anything else is
   * summarised by the two decisions the map actually holds: what she leads with, and what she left
   * out. `emphasisMuscles` / `trainableMuscles` are the engine's own reads, so this row and the
   * programme can never disagree about her map.
   */
  const mapSummary = useMemo(() => {
    const map = p?.bodyMap ?? {};
    const lead = emphasisMuscles(map, CANONICAL_MUSCLE_ORDER);
    const off = CANONICAL_MUSCLE_ORDER.length - trainableMuscles(map, CANONICAL_MUSCLE_ORDER).length;
    const bits = [
      lead.length ? t('profile.mapLeading', { muscles: lead.map((m) => t(`muscle.${m}`)).join(' · ') }) : null,
      off ? t('profile.mapOff', { n: off }) : null,
    ].filter(Boolean);
    return bits.length ? bits.join(' · ') : t('profile.mapAllOn');
  }, [p?.bodyMap, t]);

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
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* No back chevron — Settings is a tab now, not a modal; you leave by tapping another tab.
          The title sits at the page edge, matching History and Progress. */}
      <View style={styles.header}>
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

        {/* Membership (Subscription + Apple Payments) — directly under identity (who you
            are + your plan, one zone), a prominent card with a state badge; trial state
            adds a sessions-left meter + an honest billing note. */}
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

        <Legend style={styles.sectionLegend}>{t('profile.preferences')}</Legend>
        <Row label={t('profile.units')} control={<SegmentedControl options={['kg', 'lb']} value={units} onChange={onUnits} />} />
        <Row
          label={t('profile.language')}
          control={
            <SegmentedControl
              options={[{ value: 'en', label: 'EN' }, { value: 'he', label: 'עב' }]}
              value={locale}
              onChange={onLanguage}
            />
          }
          last
        />

        <Legend style={styles.sectionLegend}>{t('profile.healthSection')}</Legend>
        <Row
          label={t('profile.appleHealth')}
          sub={p?.healthConnected ? t('profile.healthImporting') : t('profile.notConnected')}
          control={<Switch checked={!!p?.healthConnected} onChange={() => void onHealth()} accessibilityLabel={t('profile.appleHealth')} />}
          last
        />
        <Text style={styles.healthNote}>{t('profile.healthNote')}</Text>

        {/* ════ "חשבון" WAS READING AS THE LAST WORD OF THE HEALTH NOTE (founder B.9) ════
            Every other section legend on this page follows a ROW — a bordered control with a
            visible bottom edge — so 20 px of air is plenty to separate them. This one follows a
            free-standing PARAGRAPH, which has no edge of its own, and at the same 20 px the word
            "Account" simply became the paragraph's final line. The section that follows a
            paragraph needs a rule, not more air: an edge is what the rows were giving the others
            for free. */}
        <Legend style={[styles.sectionLegend, styles.sectionAfterNote]}>{t('profile.account')}</Legend>
        {/* ONE edit entry (founder 2026-07-10): body data + training frequency. The old second
            "Experience" row opened the same screen and experience is now derived, not edited. */}
        <Row label={t('profile.bodyData')} sub={bodyData ?? t('profile.notSet')} onPress={() => navigation.navigate('ProfileEdit')} />
        {/* The body map (brief, Family 4) — its own row, not folded into the one above, because it is
            not body DATA. Weight describes her; the map is the decision that shapes the
            whole programme (register Part 3), and it is the only place the per-muscle rep band is
            ever set. The founder's "ONE edit entry" ruling above was about Experience opening the
            same screen twice — this opens something else entirely. */}
        <Row label={t('profile.bodyMap')} sub={mapSummary} onPress={() => navigation.navigate('BodyMapEdit')} />
        {/* ════ AND PLAN-SHARING CAME BACK (2026-08-01) ════
            It left this tab in A.14 for a good reason — "that icon is where everything
            person-to-person belongs" — and the icon it left for is the COACH's now. So the door it
            was moved to no longer exists, and a feature with no entrance at all is worse than one
            offered twice.

            This is a HOLDING PLACE, not a ruling. The founder is moving the person-to-person
            surfaces into the tab bar and designing them properly; until then sharing is reachable,
            which is the whole of what this row is for. */}
        {/* Only when there is something to share — a control that opens and bounces straight back
            is worse than no control. `SharePlanScreen` reads the same plan. */}
        {hasPlan ? <Row label={t('planShare.title')} onPress={() => navigation.navigate('SharePlan')} last /> : null}


        {/* Leaving is not something we design FOR (founder 2026-07-12). Sign Out carried a
            full bordered button — the heaviest control on the screen — which made logging out
            read as the page's primary action and put a big target under an idle thumb. Both
            exits are now plain text: reachable, unmistakable, and weighted like what they are. */}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.signOut')}
            onPress={confirmSignOut}
            style={({ pressed }) => [styles.exit, pressed && styles.exitPressed]}
          >
            <Text style={styles.exitLabel}>{t('profile.signOut')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.deleteAccount')}
            onPress={confirmDelete}
            style={({ pressed }) => [styles.exit, pressed && styles.exitPressed]}
          >
            <Text style={[styles.exitLabel, styles.exitDanger]}>{t('profile.deleteAccount')}</Text>
          </Pressable>
        </View>
        {/* The version, and the thesis. "Built on facts" is not a slogan here — it is the literal
            claim the whole product stakes (R7: it never states a reason it did not measure), so the
            settings floor is exactly where it belongs, quietly. The version stays mono (Latin); the
            tagline is its own sans line, because in Hebrew it is Hebrew and mono has no glyphs. */}
        <Text style={styles.version}>{versionLabel()}</Text>
        <Text style={styles.tagline}>{t('profile.tagline')}</Text>
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

/** "Hush v1.0.0 (23)" — version + iOS build read from the embedded config, so the line
 *  can never drift from what actually shipped. */
function versionLabel(): string {
  const v = Constants.expoConfig?.version ?? '1.0.0';
  const build = Constants.expoConfig?.ios?.buildNumber;
  return `Hush v${v}${build ? ` (${build})` : ''}`;
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
  // v7 (2026-07-22): the section headline is the serif — the coach's voice, matching Progress/History.
  headerTitle: { fontFamily: font.serif, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.display), color: color.textPrimary, textAlign: 'left' },
  scroll: { flex: 1 },
  body: { paddingHorizontal: space.gutter, paddingTop: 6, paddingBottom: 24 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 6, paddingBottom: 18 },
  identityText: { flex: 1, minWidth: 0 },
  // v7 4.2 (2026-07-23): the athlete is named in the coach's serif, matching the wordmark on Today.
  name: { fontFamily: font.serif, fontSize: textScale['2xl'], lineHeight: Math.round(textScale['2xl'] * 1.02), color: color.textPrimary, textAlign: 'left' },
  identitySub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2, textAlign: 'left' },

  sectionLegend: { marginTop: 20, marginBottom: 2 },
  // B.9 — a legend that follows a paragraph gets the edge the rows give the others.
  sectionAfterNote: { marginTop: 22, paddingTop: 20, borderTopWidth: 1, borderTopColor: color.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: color.border },
  rowPressed: { backgroundColor: color.fillSubtle },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: font.sans, fontSize: textScale.base, color: color.textPrimary, textAlign: 'left' },
  // Deleting an account is not a load coming down — it takes the CLAY (see `alert` in tokens).
  rowDanger: { color: alert.stage },
  rowSub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2, textAlign: 'left' },

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
  memberTitle: { fontFamily: font.sansSemibold, fontSize: textScale.base, letterSpacing: trackingPx(textScale.base, tracking.tight), color: color.textPrimary, textAlign: 'left' },
  memberSub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 3, textAlign: 'left' },
  memberSessions: { fontFamily: font.monoSemibold, color: color.accentText, textAlign: 'left' },
  memberTrack: { height: 4, borderRadius: 2, backgroundColor: color.fillSubtle, marginTop: 10, overflow: 'hidden' },
  memberFill: { height: '100%', backgroundColor: color.textPrimary, borderRadius: 2 },
  memberChevron: { alignSelf: 'center' },
  memberChevronTop: { alignSelf: 'flex-start', marginTop: 4 },
  trialNote: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textTertiary, lineHeight: 20, marginTop: 8, marginHorizontal: 2, textAlign: 'left' },
  healthNote: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textTertiary, lineHeight: 20, marginTop: 8, marginHorizontal: 2, textAlign: 'left' },

  // Text-only exits — still a full 44pt target, just no visual weight.
  actions: { marginTop: 32, gap: 2 },
  /* ════ A PRESS CHANGES THE SURFACE; IT DOES NOT FADE THE CONTENT (founder A.13) ════
   *
   * "Delete-account and Sign-out screens look faded when pressed."
   *
   * They did: both carried a hand-rolled `opacity: pressed ? 0.5 : 1`, so touching either dimmed
   * the WORDS — and a word at half strength does not read as "pressed", it reads as broken or
   * disabled. The product already settled this and these sites had simply never been brought in
   * line: `press` declares `opacity: 1`, and every `Button` variant answers a press by changing
   * its FILL (`signal.fillPressed`, `fillSubtle`, …). A wash appears UNDER the control; the
   * control itself never dims. So that is what these do now.
   */
  exit: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  exitPressed: { backgroundColor: color.fillSubtle },
  exitLabel: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textMuted, textAlign: 'left' },
  exitDanger: { color: alert.stage },
  version: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textTertiary, textAlign: 'center', marginTop: 18 },
  tagline: { fontFamily: font.sans, fontSize: textScale.xs, color: color.textTertiary, textAlign: 'center', marginTop: 4, letterSpacing: 0.2 },
  confirm: { fontFamily: font.sansSemibold, fontSize: textScale.lg, color: color.textPrimary, textAlign: 'center', marginBottom: 18 },
  confirmActions: { gap: 10 },
});
