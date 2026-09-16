/**
 * Settings — a TAB now (founder 2026-07-17), not a modal. Identity (avatar + name) with Membership
 * directly beneath it (who you are + your plan, one zone — the Apple Settings idiom), then grouped
 * rows: Preferences (Units, Language), Health (Apple Health, the wrist, reminders, voice, usage).
 * Sign out + Delete account at the bottom; the version reads the REAL version from the binary.
 *
 * There is NO Experience row (v5 deleted the concept — the first set measures her). Every action is
 * the real one: units/language switch instantly, Health opens the system permission flow, Sign Out /
 * Delete run behind a native confirm.
 */

// 

import React, { useEffect, useState } from 'react';
// The map's row states the map, and it reads it with the ENGINE's own predicates — so this row and
// the programme can never disagree about what she chose.
import { View, Text, Pressable, StyleSheet, Linking, ScrollView, Platform, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import Constants from 'expo-constants';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { LegalSheet } from '@/components/LegalSheet';
import { HushMark } from '@/components/HushMark';
import { Arrive, Avatar, SegmentedControl, Switch, Legend, Button, Badge, useToast } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { setTelemetryOptOut } from '@/platform/telemetry';
import { syncTrainingRemindersFromPlan } from '@/platform/trainingReminders';
import { ensureNotificationPermission } from '@/platform/notifications';
import { health } from '@/platform/health';
import type { HealthPermissionState } from '@/platform/health/healthModel';
import * as haptics from '@/platform/haptics';
import { setLocale, currentLocale } from '@/i18n';
import { notifier } from '@/platform/notifications';
import { reloadApp } from '@/app/reload';
import { nativeWatchPairing, lastWatchPublish } from '@/platform/watch/watchTransportNative';
import { audioSession, type EarSource } from '@/platform/voice/audioSession';
import { coachVoice } from '@/platform/voice/coachVoice';
import { recognizerLang, voiceCapture } from '@/platform/voice/voiceCapture';

/** The locked-phone test: time to lock the phone, then the window that asks for a number. */
const PROBE_LOCK_MS = 15_000;
const PROBE_LISTEN_MS = 8_000;
import { track } from '@/platform/telemetry';
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
  // The training-day reminder's switch — read once; this screen is its only writer.
  const [reminderOn, setReminderOn] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    void db.loadReminderOptIn().then((on) => {
      if (alive) setReminderOn(on);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const onReminderToggle = async () => {
    const next = !reminderOn;
    setReminderOn(next);
    await db.saveReminderOptIn(next).catch(() => {});
    // Turning it ON is the one honest moment to ask the OS — she is literally asking to be told.
    if (next) await ensureNotificationPermission().catch(() => {});
    await syncTrainingRemindersFromPlan();
  };

  // The analytics wire's switch (2026-09-01, audit finding 4) — mirrors the reminder's discipline:
  // read once, this screen is its only writer. ON means opted OUT (the row is "share usage data",
  // shown checked by default, so the switch reads as what it does, not as a double negative).
  const [shareUsage, setShareUsage] = React.useState(true);
  React.useEffect(() => {
    let alive = true;
    void db.loadTelemetryOptOut().then((out) => {
      if (alive) setShareUsage(!out);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const onShareUsageToggle = async () => {
    const next = !shareUsage;
    setShareUsage(next);
    await setTelemetryOptOut(!next).catch(() => {});
  };

  const { t } = useCopy();
  const app = useApp();
  /*
   * ⛔ `hasPlan` IS GONE, AND IT WAS A DISK READ ON EVERY MOUNT FOR NOBODY.
   *
   * It gated the row that forked to Share-or-Bring, and that fork was deliberately removed — the
   * door goes to `ImportPlan` always, for the reason written where it now stands. Nothing has read
   * this state since, so every open of the You tab loaded her whole week off disk to answer a
   * question no pixel asked, and its docblock described a row that does not exist.
   */
  const toast = useToast();
  const p = app.profile;
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [legalOpen, setLegalOpen] = useState(false);
  /** Whether an account exists — read on every focus, because the closer over the tabs can change it. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => void app.isSignedIn().then((v) => alive && setSignedIn(v)).catch(() => {});
    read();
    const off = navigation.addListener('focus', read);
    return () => {
      alive = false;
      off();
    };
  }, [app, navigation]);

  const units = p?.units ?? 'kg';
  const locale = currentLocale();
  const memberSince = p?.memberSince
    ? new Date(p.memberSince).toLocaleDateString(currentLocale(), { month: 'short', year: 'numeric' })
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
        {/*
          ⛔ ONE NAME FOR ONE PLACE (2026-08-21). The tab said "You" and the screen said "Settings",
          which is two names for the same destination — and the wrong one won: what is on this screen
          is her BODY, her lifts, her programme, her membership. `Settings` is what it was called when
          it was a modal (see the file header, 2026-07-17); the tab was renamed and the title was not.
          It reads `nav.you` now, so the label she pressed and the title she lands on are one string.
        */}
        <Text style={styles.headerTitle} accessibilityRole="header">{t('nav.you')}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/*
          ⛔ THE BODY MAP AND THE WEEK'S DAY LEFT THIS TAB (founder, 2026-09-16): *"דחפנו לשם את כל מה
          שאין לנו איפה לדחוף … גוף האדם אפשר להעיף — התוכנית נבנית במסך התוכנית."* The map was an
          input to a week the model now writes from her own words; the week's turning day is read off
          the phone (`weekOpenDowForDevice`); the room, the record rows and the explanatory lines went
          with them. `BodyMapEdit` keeps its route — the pain flow still draws on it.
        */}
        {/* identity */}
        <Arrive order={0} style={styles.identity}>
          {/*
            ⛔ AND NO QUESTION MARK WHERE A PERSON GOES (2026-08-21). `name ?? '?'` drew a "?" in a
            circle for every athlete who skipped the name field — which the app explicitly allows, and
            which onboarding never insists on. In a round avatar slot a question mark does not read as
            "no name"; it reads as an unknown user, or as a help button, at the top of the screen that
            is supposed to be HERS.

            `Avatar` falls back to the hush mark on an empty name — the same mark the membership row
            below already carries — so the slot stays filled and claims nothing about who she is.
          */}
          <Avatar name={p?.name ?? ''} size={52} />
          <View style={styles.identityText}>
            {p?.name ? <Text style={styles.name}>{p.name}</Text> : null}
            {memberSince ? <Text style={styles.identitySub}>{t('profile.memberSince')} {memberSince}</Text> : null}
          </View>
        </Arrive>

        {/*
          ════ ⛔ YOU IS FOR HER, NOT FOR EVERYTHING (founder, 2026-08-23) ════

            *"כרגע הכל נדחף למסך You ואני לא אוהב את זה… יש מלא דברים ב-You שסתם דחפנו לשם דברים."*

          Two tenants moved out with that sentence:
            · THE EXERCISE LIBRARY — it already had its true home on the Program tab (its own row,
              since the tab shipped); the copy here was the duplicate.
            · THE PROGRAMME IN/OUT DOOR (the moss card) — a week travelling between PEOPLE is the
              social act, and the social home is Together now (`screens/together`), one door from
              Progress. His 2026-08-12 unification ("one door for both directions") survives there.

          What stays is what this screen says it is: her identity, her membership, her settings. (The
          body map that stood here left on 2026-09-16 — see the note above her name.)
        */}

        {/* Membership (Subscription + Apple Payments) — a prominent card with a state badge; trial
            state adds a sessions-left meter + an honest billing note. */}
        <Legend tone="accent" style={styles.sectionLegend}>{t('profile.membership')}</Legend>
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
                  {/* The verb LEADS (design review 2026-09-01): "13 מתוך 14 … נותרו" left the one
                      word that carries the meaning as a lone orphan on line two. */}
                  {t('profile.trialSubLead')}
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
            {/* Inside the card it explains, over its own hairline (design review 2026-09-01) —
                floating below the card it read as a stray paragraph about nothing in particular. */}
            {membershipState === 'trial' ? <Text style={styles.trialNoteIn}>{t('profile.trialNote')}</Text> : null}
          </View>
          <View style={membershipState === 'trial' ? styles.memberChevronTop : styles.memberChevron}>
            <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />
          </View>
        </Pressable>

        {/*
          ⛔ THE ONBOARDING SHAPE, NOT A PILL PAIR (founder, 2026-08-12): *"תחליף את הפקדים של
          הליברות והשפה לפקדים כמו שבONBORDING של המין."*

          `SegmentedControl` is the app's control for switching a VIEW — Lifts / Log, where the two
          options are two ways of looking at one thing. Units and language are CHOICES she makes
          about the product, which is what the onboarding sex control is for, and it is the shape
          she has already used once. Two cards, a lit border on the answer, a wash on press.
        */}
        <Legend tone="accent" style={styles.sectionLegend}>{t('profile.preferences')}</Legend>
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

        <Legend tone="accent" style={styles.sectionLegend}>{t('profile.healthSection')}</Legend>
        <Row
          label={t('profile.appleHealth')}
          sub={p?.healthConnected ? t('profile.healthImporting') : t('profile.notConnected')}
          /* A button, not a switch — same ruling as onboarding's health card (design review
             2026-09-01): behind this press is an OS permission sheet, and a switch that may snap
             back is a promise the row cannot keep. */
          control={
            p?.healthConnected ? (
              <Icon name="check" size={20} color={color.accent} strokeWidth={2.4} />
            ) : (
              <Button variant="secondary" size="sm" label={t('ob.healthConnect')} onPress={() => void onHealth()} />
            )
          }
        />
        {/*
          ⛔ THE WRIST, DIAGNOSED IN ONE LINE (founder's build-59 wrist stuck on "Open on iPhone",
          2026-08-26). WCSession holds exactly three facts about the pair and the app had them the
          whole time (`nativeWatchPairing`) while showing none — so a dead phone→watch pipe was
          indistinguishable from a missing module, a missing pairing, or a missing install, and
          debugging it meant a day of guesswork. One measured row now names the failing layer:
          module absent → pairing unknown → not paired → app not on the watch → connected.
        */}
        <Row
          label={t('profile.watchRow')}
          sub={(() => {
            const w = nativeWatchPairing();
            if (!w) return t('profile.watchNoModule');
            if (!w.activated) return t('profile.watchActivating');
            if (!w.paired) return t('profile.watchNotPaired');
            if (!w.appInstalled) return t('profile.watchNotInstalled');
            /* ⛔ AND WHAT THE PHONE LAST SENT (founder 2026-09-08, two photographs of a wrist saying
               `badframe` with nothing on the phone to hold against them): the last frame's bytes and
               sequence, and the first refusal after it — the OS's, or the phone's own parser's
               (`invalid_json: …`). Both ends of the pipe now testify on their own screens. */
            const last = lastWatchPublish();
            if (!last) return t('profile.watchLinked');
            if (last.ok) return t('profile.watchLastFrame', { bytes: last.bytes, seq: last.seq });
            // The phone's own decoder refused the frame and the module sent the older parser's
            // serialisation instead (2026-09-08): the wrist got a clean frame, and THIS is the reason.
            return last.reason?.startsWith('invalid_json')
              ? t('profile.watchLastRepaired', { bytes: last.bytes, seq: last.seq, reason: last.reason })
              : t('profile.watchLastRefused', { bytes: last.bytes, seq: last.seq, reason: last.reason ?? '' });
          })()}
        />
        {/*
          ⛔ THE REMINDER SHE ASKED FOR (2026-08-23). The 2026-07-13 "no reminders, at all" decree
          was against the uninvited kind, and its author released his old rulings by name. OFF by
          default — flipping it on is the consent, asks the OS permission right here (the one
          honest moment: she is asking to be notified), and lands only on days the plan holds a
          workout. See `platform/trainingReminders`.
        */}
        <Row
          label={t('profile.reminderRow')}
          sub={t('profile.reminderSub')}
          control={<Switch checked={reminderOn} onChange={() => void onReminderToggle()} accessibilityLabel={t('profile.reminderRow')} />}
        />
        {/*
          THE VOICE COACH (docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md, 2026-09-08). ON by default —
          and still silent without earbuds, which is the gate that matters. This switch is for the
          athlete who has earbuds in and wants the screens alone; the screens are exactly the same
          either way.
        */}
        <Row
          label={t('profile.voiceRow')}
          sub={t('profile.voiceSub')}
          control={
            <Switch
              checked={p?.voiceSpec !== false}
              onChange={() => void app.updateProfileInfo({ voiceSpec: p?.voiceSpec === false })}
              accessibilityLabel={t('profile.voiceRow')}
            />
          }
        />
        {p?.voiceSpec !== false ? (
          <VoiceGateLine mic={p?.voiceMic ?? 'headset'} onMic={(m) => void app.updateProfileInfo({ voiceMic: m })} />
        ) : null}
        {/*
          THE WIRE'S SWITCH (2026-09-01, audit finding 4). GDPR wants an opt-out for behavioural
          analytics and the privacy text now promises one; this is it. It gates only the wire —
          the on-device journal stays (a device debugging itself is not analytics).
        */}
        <Row
          label={t('profile.usageRow')}
          sub={t('profile.usageSub')}
          control={<Switch checked={shareUsage} onChange={() => void onShareUsageToggle()} accessibilityLabel={t('profile.usageRow')} />}
          last
        />

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
        {/* Leaving is not something we design FOR (founder 2026-07-12). Sign Out carried a
            full bordered button — the heaviest control on the screen — which made logging out
            read as the page's primary action and put a big target under an idle thumb. Both
            exits are now plain text: reachable, unmistakable, and weighted like what they are. */}
        <View style={styles.actions}>
          {signedIn === false ? (
            /* No account yet (the `signInAfterFirstWorkout` arm, or a declined closer): the door
               stays here, as an offer, for as long as she has none. */
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.signIn')}
              onPress={() => navigation.navigate('Authentication')}
              style={({ pressed }) => [styles.exit, pressed && styles.exitPressed]}
            >
              <Text style={[styles.exitLabel, styles.exitOffer]}>{t('profile.signIn')}</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.signOut')}
              onPress={confirmSignOut}
              style={({ pressed }) => [styles.exit, pressed && styles.exitPressed]}
            >
              <Text style={styles.exitLabel}>{t('profile.signOut')}</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.deleteAccount')}
            onPress={confirmDelete}
            style={({ pressed }) => [styles.exit, pressed && styles.exitPressed]}
          >
            <Text style={[styles.exitLabel, styles.exitDanger]}>{t('profile.deleteAccount')}</Text>
          </Pressable>
        </View>
        {/* The same document the front door opens — reachable after sign-up too, where App
            Review and a curious athlete both look for it (founder 2026-09-01). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('legal.sheetLegend')}
          onPress={() => setLegalOpen(true)}
          style={({ pressed }) => [styles.legalRow, pressed && styles.rowPressed]}
        >
          <Text style={styles.legalRowText}>{t('legal.sheetLegend')}</Text>
        </Pressable>
        <Text style={styles.version}>{versionLabel()}</Text>
      </ScrollView>
      {legalOpen ? <LegalSheet onClose={() => setLegalOpen(false)} /> : null}

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

/** "hush v1.0.0 (23)" — version + iOS build read from the embedded config, so the line
 *  can never drift from what actually shipped. Lowercase: the wordmark is "hush" everywhere
 *  else in the product, and a brand does not change case for a version line (design review
 *  2026-09-01). */
function versionLabel(): string {
  const v = Constants.expoConfig?.version ?? '1.0.0';
  const build = Constants.expoConfig?.ios?.buildNumber;
  return `hush v${v}${build ? ` (${build})` : ''}`;
}

/**
 * ════ WHAT THE VOICE'S GATE SAYS RIGHT NOW (founder, 2026-09-09: *"הקול באימון לא עובד"*) ════
 *
 * The voice is silent by design behind three gates — the build has a mouth and an ear, and earbuds
 * are on the output route (spec §0.1) — and a silent gate looks exactly like a broken one. This
 * line reads the gates live, so the athlete (and the founder on a gym floor) can tell "no earbuds"
 * from "no engine" without a debugger. It draws nothing on the stage; the stage stays what it was.
 */
function VoiceGateLine({ mic, onMic }: { mic: EarSource; onMic: (m: EarSource) => void }) {
  const { t } = useCopy();
  const capable = Platform.OS === 'ios' && coachVoice.available() && voiceCapture.available() && audioSession.available();
  const [headset, setHeadset] = useState(() => audioSession.headsetConnected());
  const [route, setRoute] = useState(() => audioSession.routeInfo());
  const [test, setTest] = useState<'idle' | 'playing' | 'heard' | 'failed'>('idle');
  const [testDetail, setTestDetail] = useState('');
  const reread = () => {
    setHeadset(audioSession.headsetConnected());
    setRoute(audioSession.routeInfo());
  };
  useEffect(() => audioSession.onRouteChange(reread), []);
  /*
   * ⛔ THE VOICE TESTS ITSELF WHERE SHE CAN SEE IT (founder, 2026-09-15: *"כבר כמה פעמים טיפלנו
   * בנושא הקול וזה לא משמיע קול ולא כלום"*). Three reports of a silent coach were each diagnosed
   * from a description. This plays one line through the workout's exact path — the gate's read,
   * the duck, the mouth, the unduck — and prints what the phone reported: the route by port type
   * and name, and whether the synthesizer began and how the line ended. A silent voice is then a
   * reading, not a guess.
   */
  const runTest = async () => {
    setTest('playing');
    setTestDetail('');
    reread();
    await audioSession.duck();
    await coachVoice.say(t('profile.voiceTestLine'), currentLocale());
    await audioSession.unduck();
    const lastLine = coachVoice.lastLine();
    reread();
    const ok = !!lastLine && lastLine.started && lastLine.how === 'done';
    setTest(ok ? 'heard' : 'failed');
    setTestDetail(lastLine ? `${lastLine.how}${lastLine.started ? '' : ' · never started'}${lastLine.voice ? ` · ${lastLine.voice}` : ''}` : 'no line');
    void track('voice_test', { ok, how: lastLine?.how ?? null, started: lastLine?.started ?? false, outputs: route?.outputs.map((o) => o.type).join(',') ?? null });
  };
  /*
   * ════ THE LOCKED-PHONE TEST (founder, 2026-09-15: *"אי אפשר שהמיקרופון יפתח רק בחלקים ספציפיים
   * באימון? זה היה החזון שלי"*) ════
   * Whether a question can be answered from a pocket was, until this, a reading of Apple's forums —
   * and those forums are old and not about an app that is already playing audio in the background,
   * which is what a Hush workout is. So the phone is asked.
   *
   * `windows` — the founder's design, exactly: nothing is opened on glass; she locks the phone; then
   * three short windows are opened FROM THE LOCKED PHONE, one after another, each asking for a
   * number and saying back what it heard:
   *   1 · today's ear (Apple's older recognizer, the earbuds' microphone)
   *   2 · the new on-device recognizer, the earbuds' microphone, opened for this window only
   *   3 · the new on-device recognizer, the phone's microphone, opened for this window only
   * `continuous` — the fallback: the phone's microphone opened on glass and held (music untouched).
   * Every step is written below with its second, so when she unlocks the page says which held.
   */
  const [probe, setProbe] = useState<'idle' | 'running' | 'done'>('idle');
  const [probeLog, setProbeLog] = useState<string[]>([]);
  const runProbe = async (kind: 'windows' | 'continuous') => {
    setProbe('running');
    const log: string[] = [];
    const t0 = Date.now();
    const note = (s: string) => {
      log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s · ${s}`);
      setProbeLog([...log]);
    };
    const locale = currentLocale();
    const lang = recognizerLang(locale);
    const say = async (text: string) => {
      await audioSession.duck();
      await coachVoice.say(text, locale);
      await audioSession.unduck();
    };
    const ask = async (n: number, label: string) => {
      await say(t('profile.voiceProbeAsk', { n }));
      note(`${n} · ${label} · app: ${AppState.currentState} · microphone held: ${audioSession.earRunning()}`);
      const heard = await new Promise<string | null>((resolve) => {
        let text: string | null = null;
        voiceCapture.open({
          locale,
          ms: PROBE_LISTEN_MS,
          onSentence: (s) => {
            text = s;
            return false;
          },
          onEnd: (why) => {
            note(`${n} · window ended: ${why}${text ? ` · heard "${text}"` : ''}`);
            resolve(text);
          },
        });
      });
      await say(heard ? t('profile.voiceProbeHeard', { text: heard }) : t('profile.voiceProbeNothing'));
    };
    if (audioSession.earRunning()) {
      note('a workout holds the microphone — end it first');
      setProbe('done');
      return;
    }
    await audioSession.holdKeepAlive('voiceTest');
    try {
      note(`kind: ${kind} · permission: ${(await voiceCapture.ensurePermission()) ? 'granted' : 'REFUSED'}`);
      const available = await audioSession.earAvailable(lang);
      note(`new recognizer (${lang}): ${available ? 'available' : 'NOT available'}`);
      const model = available && (await audioSession.earPrepare(lang));
      if (available) note(`model: ${model ? 'installed' : 'NOT installed'}`);
      if (kind === 'continuous' && model) note(`phone microphone held: ${(await audioSession.earOpen('phone')) ?? 'open'}`);
      await say(t('profile.voiceProbeLock'));
      await new Promise((r) => setTimeout(r, PROBE_LOCK_MS));
      if (kind === 'continuous') {
        await ask(1, 'held phone microphone');
      } else {
        await ask(1, "today's ear · earbuds");
        if (model) {
          note(`2 · open earbuds microphone from here: ${(await audioSession.earOpen('headset')) ?? 'open'}`);
          if (audioSession.earRunning()) await ask(2, 'new recognizer · earbuds');
          await audioSession.earClose();
          note(`3 · open phone microphone from here: ${(await audioSession.earOpen('phone')) ?? 'open'}`);
          if (audioSession.earRunning()) await ask(3, 'new recognizer · phone');
          await audioSession.earClose();
        }
      }
      const spoke = coachVoice.lastLine();
      note(`last line: ${spoke ? `${spoke.how}${spoke.started ? '' : ' · never started'}` : 'none'}`);
      void track('voice_probe', { kind, log: log.join(' | ') });
    } finally {
      await audioSession.earClose();
      await audioSession.releaseKeepAlive('voiceTest');
      setProbe('done');
    }
  };
  const line = !capable ? t('profile.voiceGateMissing') : headset ? t('profile.voiceGateOn') : t('profile.voiceGateNoHeadset');
  const routeLine = route
    ? `${route.outputs.map((o) => `${o.name} (${o.type})`).join(', ') || '—'} · ${route.category.replace('AVAudioSessionCategory', '')}`
    : null;
  return (
    <View style={styles.voiceGateBlock}>
      <Text style={styles.voiceGate}>{line}</Text>
      {capable && routeLine ? <Text style={styles.voiceGateRoute}>{routeLine}</Text> : null}
      {capable ? (
        <View style={styles.voiceGateTest}>
          <Button
            variant="secondary"
            size="sm"
            label={test === 'playing' ? t('profile.voiceTestPlaying') : t('profile.voiceTest')}
            onPress={() => void runTest()}
            disabled={test === 'playing'}
          />
          {test === 'heard' || test === 'failed' ? (
            <Text style={styles.voiceGate}>
              {test === 'heard' ? t('profile.voiceTestHeard') : t('profile.voiceTestFailed')} {testDetail ? `(${testDetail})` : ''}
            </Text>
          ) : null}
          <Text style={styles.voiceGate}>{t('profile.voiceMicLabel')}</Text>
          <SegmentedControl
            size="pill"
            options={[
              { value: 'headset', label: t('profile.voiceMicHeadset') },
              { value: 'phone', label: t('profile.voiceMicPhone') },
            ]}
            value={mic}
            onChange={(v) => onMic(v === 'phone' ? 'phone' : 'headset')}
          />
          <Text style={styles.voiceGate}>{t('profile.voiceMicSub')}</Text>
          <Button
            variant="secondary"
            size="sm"
            label={probe === 'running' ? t('profile.voiceProbeRunning') : t('profile.voiceProbe')}
            onPress={() => void runProbe('windows')}
            disabled={probe === 'running' || test === 'playing'}
          />
          <Button
            variant="quiet"
            size="sm"
            label={t('profile.voiceProbeContinuous')}
            onPress={() => void runProbe('continuous')}
            disabled={probe === 'running' || test === 'playing'}
          />
          {probeLog.length > 0 ? <Text style={styles.voiceGateRoute}>{probeLog.join('\n')}</Text> : null}
        </View>
      ) : null}
    </View>
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
      {/* ⛔ A ROW THAT OPENS SAYS SO (design review 2026-09-01). A pressable row and an info row
          were pixel-identical — the settings page made her tap to find out which was which. Any
          row with an onPress and no control of its own carries the disclosure chevron. */}
      {onPress && !control ? <Icon name="chevronRight" size={18} color={color.textMuted} /> : null}
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
  // v7 (2026-07-22): the section headline is the serif — the coach's voice, matching Progress/History.
  headerTitle: { fontFamily: font.serif, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.display), color: color.textPrimary, textAlign: 'left' },
  scroll: { flex: 1 },
  body: { paddingHorizontal: space.gutter, paddingTop: 6, paddingBottom: 24 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 6, paddingBottom: 18 },
  identityText: { flex: 1, minWidth: 0 },
  // v7 4.2 (2026-07-23): the athlete is named in the coach's serif, matching the wordmark on Today.
  name: { fontFamily: font.serif, fontSize: textScale['2xl'], lineHeight: Math.round(textScale['2xl'] * 1.02), color: color.textPrimary, textAlign: 'left' },
  identitySub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2, textAlign: 'left' },

  /* ⛔ tone="accent" + more air (design review 2026-09-01): a section legend and a row label were
     both 17 with only weight between them — the page's levels did not separate. The type floor
     forbids going smaller, so the level is said in the accent and in space instead. */
  sectionLegend: { marginTop: 28, marginBottom: 6 },

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
  /* Moss, not cream — the choice idiom's one mark (see AboutYou.choiceOn, design review 2026-09-01). */
  pickOn: { borderColor: signal[0], backgroundColor: signal.wash },
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
  /* ⛔ THE MAP IS THE FRONT OF THE SCREEN — the figure, drawn, not a door to it. */
  /* The lifts door — a row, not a caption. See the note at the markup. */
  liftsRow: { marginTop: 10, paddingVertical: 14, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  liftsWords: { flex: 1, gap: 4 },
  rowTitle: { fontFamily: font.sansSemibold, fontSize: 22, lineHeight: 28, color: color.textPrimary, textAlign: 'left' },
  /* ⛔ A SECOND `rowSub` DECLARED 23 LINES DOWN HAS BEEN SILENTLY WINNING OVER THE ONE THAT STOOD
     HERE — last-key-wins in an object literal, and `@ts-nocheck` muted TS1117, the error that exists
     precisely to say so. The surviving declaration is the one the screen has actually been rendering. */
  frontText: { flex: 1, gap: 4 },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: color.border },
  rowPressed: { backgroundColor: color.fillSubtle },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: font.sans, fontSize: textScale.base, color: color.textPrimary, textAlign: 'left' },
  // Deleting an account is not a load coming down — it takes the CLAY (see `alert` in tokens).
  rowDanger: { color: alert.stage },
  rowSub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2, textAlign: 'left' },
  /* The voice gate's live line, under its row — the row's own quiet voice, one step in. */
  voiceGate: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  voiceGateBlock: { marginTop: -6, marginBottom: 10, gap: 6 },
  // A reading, not copy: port names and types as iOS reports them, in their own direction.
  voiceGateRoute: { fontFamily: font.sans, fontSize: textScale.xs, color: color.textMuted, textAlign: 'left', writingDirection: 'ltr' },
  voiceGateTest: { gap: 6, alignItems: 'flex-start' },

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
  /* ⛔ NOT THE ACCENT. This is the number of free sessions REMAINING — a countdown to a paywall —
     and it was painted moss, the one colour this product spends on *a decision made*. The page
     spends it once, on the programme door (see `planCard`); a meter emptying towards a price is the
     opposite of progress, and dressing it in the progress colour is the app congratulating her for
     running out. The numeral is ordinary ink; the sentence around it already says what it is. */
  memberSessions: { fontFamily: font.monoSemibold, color: color.textPrimary, textAlign: 'left' },
  memberTrack: { height: 4, borderRadius: 2, backgroundColor: color.fillSubtle, marginTop: 10, overflow: 'hidden' },
  memberFill: { height: '100%', backgroundColor: color.textPrimary, borderRadius: 2 },
  memberChevron: { alignSelf: 'center' },
  memberChevronTop: { alignSelf: 'flex-start', marginTop: 4 },
  /* `trialNote` went INSIDE the card as `trialNoteIn` (design review 2026-09-01). */
  trialNoteIn: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: color.border, textAlign: 'left' },

  // Text-only exits — still a full 44pt target, just no visual weight.
  /* A hairline sets the exits apart from the content above (design review 2026-09-01): two live
     controls floating after a mono version line read as footer text, not as actions. */
  actions: { marginTop: 32, gap: 2, borderTopWidth: 1, borderTopColor: color.border, paddingTop: 14 },
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
  exitOffer: { color: color.accent },
  exitDanger: { color: alert.stage },
  legalRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  legalRowText: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textMuted, textAlign: 'left' },
  version: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textTertiary, textAlign: 'center', marginTop: 18 },
  /* ⚠️ NO TRACKING: this string is translated, and opening a Hebrew word is a rendering fault (`noTrackedHebrew`). */
  confirm: { fontFamily: font.sansSemibold, fontSize: textScale.lg, color: color.textPrimary, textAlign: 'center', marginBottom: 18 },
  confirmActions: { gap: 10 },
});
