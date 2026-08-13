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
// @ts-nocheck

// 

import React, { useState } from 'react';
// The map's row states the map, and it reads it with the ENGINE's own predicates — so this row and
// the programme can never disagree about what she chose.
import { View, Text, Pressable, StyleSheet, Linking, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import Constants from 'expo-constants';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { BodyMapFigure } from '@/components/BodyMapFigure';
import { HushMark } from '@/components/HushMark';
import { Avatar, SegmentedControl, Switch, Legend, Button, Badge, useToast } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
// ⛔ ONE DOOR ONTO HER WEEK, whoever wrote it — the coach's plan when there is one, the engine's
// programme in the same shape when there is not. See `data/local/weekPlan`.
import { loadWeekPlan } from '@/data/local/weekPlan';
import { health } from '@/platform/health';
import type { HealthPermissionState } from '@/platform/health/healthModel';
import * as haptics from '@/platform/haptics';
import { setLocale, currentLocale } from '@/i18n';
import { notifier } from '@/platform/notifications';
import { reloadApp } from '@/app/reload';
import { freeSessionsRemaining, FREE_SESSION_LIMIT } from '@/domain/entitlement';
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
    void loadWeekPlan().then((p) => alive && setHasPlan(!!p && p.sessions.length > 0));
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
        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ THE BODY MAP IS THE FRONT OF THIS SCREEN (founder, 2026-08-12)

            *"אתה בעצמך אמרת לי שיופיע בגדול קודם כל מפת הגוף ורק אז ההגדרות למטה בשביל לחסוך בעוד
            פקד ב-TABBAR אבל בפועל לא עשית את זה והשארת אותו זרוק למטה."*

          He is right, and it is my own argument I failed to carry out: the map earns this tab its
          place instead of a fifth icon in the bar — and it was a plain chevron row at the very
          bottom, under Health, indistinguishable from a units toggle. **The one thing on this
          screen that is about her body was filed with the preferences.**

          It is a card at the top now, above Membership, drawn as what it is.
          ════════════════════════════════════════════════════════════════════════════════════════
        */}
        {/* identity */}
        <View style={styles.identity}>
          <Avatar name={p?.name ?? '?'} size={52} />
          <View style={styles.identityText}>
            {p?.name ? <Text style={styles.name}>{p.name}</Text> : null}
            {memberSince ? <Text style={styles.identitySub}>{t('profile.memberSince')} {memberSince}</Text> : null}
          </View>
        </View>

        {/*
          ⛔ THE BODY ITSELF, NOT A CARD THAT OPENS ONE (founder, 2026-08-12)

            *"התכוונתי שהגוף יהיה במסך בלי פקד ואז בגלילה למטה יופיע כל שאר הדברים."*

          My first pass answered "put the map at the front" with a titled card and a chevron —
          which is the same row it replaced, in a bigger box. **He asked for the map, not a door to
          it.** The figure is drawn here, at the size it is drawn everywhere else, carrying her
          actual stances: what is on, what she leads with, what is being eased.

          ⚠️ IT IS STILL PRESSABLE AND IT IS NOT A BUTTON. Pressing the body opens the editor, where
          the three rungs live — the body is the affordance, so there is nothing beside it to label.
          The two lines under it name what it is and get out of the way.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('ob.mapTitle')}
          onPress={() => navigation.navigate('BodyMapEdit')}
          style={({ pressed }) => [styles.mapBlock, pressed && styles.mapBlockPressed]}
        >
          <BodyMapFigure face="front" map={p?.bodyMap ?? {}} selected={null} onSelect={() => navigation.navigate('BodyMapEdit')} />
          <View style={styles.mapWords}>
            <Text style={styles.frontTitle}>{t('ob.mapTitle')}</Text>
            <Text style={styles.frontSub}>{t('profile.mapSub')}</Text>
          </View>
        </Pressable>

        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ ONE DOOR FOR THE PROGRAMME SHE BRINGS AND THE ONE SHE SENDS (founder, 2026-08-12)

            *"את BRING YOUR OWN PROGRAMME ואת SEND SOMEONE THE SHAPE OF YOUR WEEK אני רוצה שתאחד
            לפקד אחד יפה וגדול … ותן לפקד הזה צבע יותר מיוחד כי זה פיצ'ר מיוחד."*

          They were two plain rows at the foot of the page, and they are two directions of ONE act:
          a week travelling in or out. Nothing else in this product moves a whole programme between
          two people, and it was drawn like a units toggle.

          ⚠️ MOSS, WHICH IS SPENT ONCE PER SCREEN IN THIS PRODUCT. The palette's rule is that the
          accent means *a decision made* — and this is the only control here that changes what she
          trains rather than how it is displayed.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('profile.programmeDoor')}
          /*
           * ⚠️ ONE DESTINATION, NOT A FORK. `hasPlan ? 'SharePlan' : 'ImportPlan'` read well and was
           * wrong in the one case that matters: an athlete who already has a week could then never
           * reach the importer to bring a different one. The door opens the BRING screen, which
           * carries the send-yours link at its foot when there is something to send.
           */
          onPress={() => navigation.navigate('ImportPlan')}
          style={({ pressed }) => [styles.frontCard, styles.planCard, pressed && styles.planCardPressed]}
        >
          <View style={styles.planMark}>
            <Icon name="share" size={20} color={color.up} strokeWidth={2} />
          </View>
          <View style={styles.frontText}>
            <Text style={styles.frontTitle}>{t('profile.programmeDoor')}</Text>
            <Text style={styles.frontSub}>{t('profile.programmeDoorSub')}</Text>
          </View>
          <Icon name="chevronRight" size={20} color={color.up} strokeWidth={2} />
        </Pressable>

        {/* Membership (Subscription + Apple Payments) — a prominent card with a state badge; trial
            state adds a sessions-left meter + an honest billing note. */}
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

        {/*
          ⛔ THE ONBOARDING SHAPE, NOT A PILL PAIR (founder, 2026-08-12): *"תחליף את הפקדים של
          הליברות והשפה לפקדים כמו שבONBORDING של המין."*

          `SegmentedControl` is the app's control for switching a VIEW — Lifts / Log, where the two
          options are two ways of looking at one thing. Units and language are CHOICES she makes
          about the product, which is what the onboarding sex control is for, and it is the shape
          she has already used once. Two cards, a lit border on the answer, a wash on press.
        */}
        <Legend style={styles.sectionLegend}>{t('profile.preferences')}</Legend>
        <View style={styles.pickBlock}>
          <Text style={styles.pickLabel}>{t('profile.units')}</Text>
          <Pick
            options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
            value={units}
            onChange={(v) => onUnits(v as 'kg' | 'lb')}
          />
        </View>
        <View style={styles.pickBlock}>
          <Text style={styles.pickLabel}>{t('profile.language')}</Text>
          <Pick
            options={[{ value: 'en', label: 'English' }, { value: 'he', label: 'עברית' }]}
            value={locale}
            onChange={onLanguage}
          />
        </View>

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
        {/*
            ════ THE ACCOUNT SECTION IS GONE (founder 2026-08-01) ════

            *"Remove ACCOUNT / Body data 78 kg / Body map, leading with chest."*

            Three rows, and the coach took all three. **Body data** was the cold-start seed and the
            training frequency — the conversation asks for both now, and it can ask WHY four days
            rather than five. **The body map** was the one place the per-muscle emphasis was set;
            the coach decides emphasis when it writes the programme, and the pain flow is what marks
            a muscle as hurting. A row that edits an input nothing reads any more is not a setting,
            it is a lie with a chevron.

            ⚠️ `ProfileEdit` and `BodyMapEdit` are NOT deleted. The pain flow still needs the map
            (13.2 reuses it), and both keep their routes and their gallery entries — what is gone is
            offering a stranger a form for something she should be talking about.
        */}
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

/**
 * ⛔ A CHOICE, IN THE SHAPE SHE ALREADY KNOWS (founder, 2026-08-12) — the onboarding sex control's
 * geometry, lifted whole so the two screens teach one gesture. Equal cards, a lit border on the
 * answer, a WASH on press and never a fade (A.13).
 */
function Pick({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.pickRow}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.value }}
          accessibilityLabel={o.label}
          onPress={() => onChange(o.value)}
          style={({ pressed }) => [styles.pick, value === o.value && styles.pickOn, pressed && styles.pickPressed]}
        >
          <Text style={[styles.pickText, value === o.value && styles.pickTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
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

  /* The preference choices — the onboarding sex control's own geometry. */
  pickBlock: { marginTop: 16, gap: 10 },
  pickLabel: { fontFamily: font.sansMedium, fontSize: 19, color: color.textPrimary, textAlign: 'left' },
  pickRow: { flexDirection: 'row', gap: 10 },
  pick: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.16)',
  },
  pickOn: { borderColor: color.textPrimary },
  pickPressed: { backgroundColor: 'rgba(241,238,229,0.06)' },
  pickText: { fontFamily: font.sansMedium, fontSize: 20, color: color.textMuted, textAlign: 'center' },
  pickTextOn: { color: color.textPrimary },

  /* ── THE FRONT OF THE SCREEN — the body map and the programme door. See the notes at the markup.
     They are cards rather than rows because a row is a setting and neither of these is one. ── */
  frontCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 16,
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  frontCardPressed: { backgroundColor: 'rgba(241,238,229,0.05)' },
  /* ⛔ THE MAP IS THE FRONT OF THE SCREEN — the figure, drawn, not a door to it. */
  mapBlock: { marginTop: 10, paddingBottom: 10, borderRadius: 20 },
  mapBlockPressed: { backgroundColor: 'rgba(241,238,229,0.04)' },
  mapWords: { marginTop: 10, gap: 4, alignItems: 'center' },
  frontText: { flex: 1, gap: 4 },
  frontTitle: { fontFamily: font.sansSemibold, fontSize: 22, lineHeight: 28, color: color.textPrimary, textAlign: 'center' },
  frontSub: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textMuted, textAlign: 'center' },
  /* ⛔ THE ACCENT, SPENT ONCE. Moss means "a decision made" in this palette, and this is the only
     control on the page that changes what she trains rather than how it is shown. */
  planCard: { borderColor: 'rgba(169,196,159,0.42)', backgroundColor: 'rgba(169,196,159,0.08)' },
  planCardPressed: { backgroundColor: 'rgba(169,196,159,0.16)' },
  planMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(169,196,159,0.14)',
  },
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
