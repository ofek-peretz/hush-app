/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE INVITE — a trainee joins her coach. (the coach track, 2026-09-17)
 *
 * ⛔ FOUNDER, 2026-09-17: *"אני רוצה להוסיף מסלול למאמנים שנותנים למתאמנים שלהם להתאמן איתנו."*
 *
 * *"לפני שנתון אחד עוזב את הטלפון, הוא רואה בדיוק מה עובר ומה לא. ברירת המחדל הכי שומרת על פרטיות,
 * ומשקל גוף הוא בחירה."* This screen is that sentence, drawn: what reaches the coach, what never
 * does, two switches that default OFF, and one act.
 *
 * ── ⛔ NOTHING IS FETCHED UNTIL SHE PRESSES JOIN ────────────────────────────────────────────────
 * The code in a link is not looked up on open: a link is something that happened TO her, a join is
 * something she does. So the screen cannot name the coach before the press, and it does not
 * pretend to — it says "your coach", and the coach's name arrives with the week.
 *
 * ── TWO DOORS, TWO STACKS ──────────────────────────────────────────────────────────────────────
 *   · the main stack — a link opened on a phone that already trains (Root: `hush://coach?c=…`,
 *     `…/c/CODE`). Success lands on Today, where the coach's week now is.
 *   · the intake — About you's "I have a coach code" (or a link on a phone with no profile). The
 *     coach writes the week, so success SKIPS the plan-build step: Connect Health, then Today.
 *
 * ── ⚠️ A JOIN NEEDS AN ACCOUNT ──────────────────────────────────────────────────────────────────
 * The server addresses her by her identity session. Without one the press goes to sign-in, and the
 * join runs itself the moment she comes back signed in — she presses Join once.
 *
 * ── REFUSALS, IN WORDS ──────────────────────────────────────────────────────────────────────────
 * Every error the server settled (COACH_TRACK_V1 §6) has its own sentence (`joinErrorKey`): a wrong
 * code, a full coach, a trainee already linked, her own invite, the server not answering, offline.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Icon } from '@/components/Icon';
import { Button, Legend, Switch, TextField } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { useCoachTrack } from '@/state/stores/coachStore';
import { isInviteCode, joinErrorKey, normalizeInviteCode } from '@/domain/coachTrackAthlete';
import { track } from '@/platform/telemetry';
import { alert, color, font, signal, stage } from '@/design/tokens';
import type { MainParamList, OnboardingParamList } from '@/app/navigation';

type Props =
  | NativeStackScreenProps<OnboardingParamList, 'CoachJoin'>
  | NativeStackScreenProps<MainParamList, 'CoachJoin'>;

/** Everything the screen draws, and nothing it does — the harness and the render law mount this. */
export interface CoachJoinViewProps {
  code: string;
  onCode: (code: string) => void;
  bodyweight: boolean;
  onBodyweight: (on: boolean) => void;
  cardio: boolean;
  onCardio: (on: boolean) => void;
  busy: boolean;
  /** A key under `coachTrack.athlete.*`, already chosen — the refusal in words. */
  errorKey: string | null;
  /** She pressed Join with no account; the sign-in is the next thing on screen. */
  needsAccount: boolean;
  /**
   * ⛔ SHE ALREADY HAS A WEEK OF HER OWN, AND JOINING REPLACES IT (2026-09-18).
   *
   * `adoptCoachWeek` writes the coach's week straight over the stored one, and law 6 means that
   * after an unlink what stays on the phone is HIS week, not hers — so the week she is standing on
   * does not come back. The product said this NOWHERE: she pressed Join and found out afterwards.
   * True ⇒ the cost is on the glass, above the button, before the press.
   */
  replacesWeek: boolean;
  onJoin: () => void;
  onBack: () => void;
  /** Inside the intake: the rail says where she is. */
  intake: boolean;
}

/**
 * The placeholder: six characters DRAWN FROM THE REAL ALPHABET (`INVITE_ALPHABET` — no 0/O, no
 * 1/I/L), so it teaches the shape without teaching a lie. Not translated: a code has no language.
 */
const CODE_SHAPE = 'K7M2QP';

export function CoachJoinView(props: CoachJoinViewProps) {
  const { t } = useCopy();
  const sees = ['sees1', 'sees2', 'sees3', 'sees4'] as const;
  const notSees = ['notSees1', 'notSees2', 'notSees3'] as const;
  return (
    <OnboardingScaffold
      onBack={props.onBack}
      {...(props.intake ? { progress: { index: 2, total: 3 } } : {})}
      keyboard
      title={t('coachTrack.athlete.joinTitle')}
      sub={t('coachTrack.athlete.joinBody')}
      headGap={22}
      bodyTop={18}
      footer={
        <>
          {props.replacesWeek ? (
            <Text style={styles.replaces}>{t('coachTrack.athlete.replacesWeek')}</Text>
          ) : null}
          {props.errorKey ? (
            <Text style={styles.error} accessibilityRole="alert">
              {t(props.errorKey)}
            </Text>
          ) : props.needsAccount ? (
            /* Not a refusal — the next thing that happens, said in the app's reading voice. */
            <Text style={styles.waypoint}>{t('coachTrack.athlete.signInFirst')}</Text>
          ) : null}
          {/* A press that reaches a server says so: a disabled button with its old label reads broken. */}
          <Button
            variant="primary"
            size="lg"
            block
            label={props.busy ? t('coachTrack.athlete.joinWorking') : t('coachTrack.athlete.joinCta')}
            disabled={props.busy}
            onPress={props.onJoin}
          />
          <Text style={styles.foot}>{t('coachTrack.athlete.joinFoot')}</Text>
        </>
      }
    >
      <View style={styles.rows}>
        <View style={styles.col}>
          <Legend size={22} track={0.26} style={styles.fieldLegend}>{t('coachTrack.athlete.codeLegend')}</Legend>
          {/*
            ⛔ A CODE IS A FIGURE, NOT A SENTENCE (2026-09-18). This field was the app's sans at 24
            with `textAlign:'left'` and a placeholder that was a WORD in her language ("6 תווים") —
            so the one ACT on the screen was its quietest element, the placeholder taught length
            rather than shape, and the digit in it resolved to the wrong side of the Hebrew.

            Six characters out of a fixed alphabet are exactly what `Plex Mono` is for: the mono
            voice, tracked open, CENTRED on the rule. Centring is the one alignment no locale and no
            platform argues about, and it is the shape every one-time-code field in the world wears,
            so the field says what it wants before the legend does. The placeholder is the CODE'S
            OWN SHAPE — language-free, and it carries the length by being six glyphs long.
          */}
          <TextField
            block
            value={props.code}
            onChangeText={(v) => props.onCode(normalizeInviteCode(v))}
            placeholder={CODE_SHAPE}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            returnKeyType="done"
            accessibilityLabel={t('coachTrack.athlete.codeLegend')}
            inputStyle={styles.codeInput}
          />
          {/* An empty field that teaches: where the six characters come from, and what else opens it. */}
          <Text style={styles.codeHint}>{t('coachTrack.athlete.codeHint')}</Text>
        </View>

        <View style={styles.col}>
          <Legend tone="accent" style={styles.listLegend}>{t('coachTrack.athlete.seesLegend')}</Legend>
          {sees.map((k) => (
            <View key={k} style={styles.item}>
              <Icon name="check" size={17} color={signal[0]} strokeWidth={2.4} />
              <Text style={styles.itemText}>{t(`coachTrack.athlete.${k}`)}</Text>
            </View>
          ))}

          {/*
            ⛔ BOTH DEFAULT OFF — the most private answer is the one she gets without doing anything.

            ⚠️ AND THEY SIT INSIDE "WHAT REACHES YOUR COACH", not at the foot of the screen (moved
            2026-09-18). They WERE the last thing on a 770-point scroll, under a list of what never
            crosses, while the Join button floated over them from the first frame — so the two
            decisions that are hers to make were the only part of this screen she could act without
            ever seeing. They belong in the section they change: the fixed half above, the half she
            chooses here, and what never crosses closing the argument underneath.
          */}
          <View style={styles.toggles}>
            <ConsentRow
              label={t('coachTrack.athlete.bodyweightRow')}
              sub={t('coachTrack.athlete.bodyweightSub')}
              on={props.bodyweight}
              onChange={props.onBodyweight}
            />
            <ConsentRow
              label={t('coachTrack.athlete.cardioRow')}
              sub={t('coachTrack.athlete.cardioSub')}
              on={props.cardio}
              onChange={props.onCardio}
              last
            />
          </View>
        </View>

        <View style={styles.col}>
          <Legend style={styles.listLegend}>{t('coachTrack.athlete.notSeesLegend')}</Legend>
          {notSees.map((k) => (
            <View key={k} style={styles.item}>
              <Icon name="minus" size={17} color={stage.ink2} strokeWidth={2.4} />
              <Text style={[styles.itemText, styles.itemTextNo]}>{t(`coachTrack.athlete.${k}`)}</Text>
            </View>
          ))}
        </View>
      </View>
    </OnboardingScaffold>
  );
}

/** One consent switch — shared with MyCoach, so the two screens ask the same question the same way. */
export function ConsentRow({
  label,
  sub,
  on,
  onChange,
  disabled,
  last,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.toggle, !last && styles.toggleRule]}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {sub ? <Text style={styles.toggleSub}>{sub}</Text> : null}
      </View>
      <Switch checked={on} onChange={() => onChange(!on)} accessibilityLabel={label} {...(disabled ? { disabled: true } : {})} />
    </View>
  );
}

export function CoachJoin({ navigation: nav, route }: Props) {
  /* Typed as the main-stack screen — the verbs both stacks share (`goBack`, `navigate`, state). */
  const navigation = nav as NativeStackScreenProps<MainParamList, 'CoachJoin'>['navigation'];
  const params = (route.params ?? {}) as { code?: string; sex?: 'male' | 'female'; weightKg?: number };
  const { t } = useCopy();
  const app = useApp();
  const coach = useCoachTrack();
  const routeNames: string[] = navigation.getState?.()?.routeNames ?? [];
  const intake = routeNames.includes('AboutYou');

  const [code, setCode] = useState(() => normalizeInviteCode(params.code ?? ''));
  const [bodyweight, setBodyweight] = useState(false);
  const [cardio, setCardio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [needsAccount, setNeedsAccount] = useState(false);
  /** She pressed Join and was sent to sign in — the join runs itself when she comes back signed in. */
  const joinOnReturn = useRef(false);

  useEffect(() => {
    if (params.code) setCode(normalizeInviteCode(params.code));
  }, [params.code]);

  const join = useCallback(async () => {
    if (busy) return;
    setErrorKey(null);
    const c = normalizeInviteCode(code);
    if (!isInviteCode(c)) {
      setErrorKey(joinErrorKey('bad_code'));
      return;
    }
    if (!(await app.isSignedIn().catch(() => false))) {
      joinOnReturn.current = true;
      setNeedsAccount(true);
      void track('coach_join_needs_account', {});
      if (intake) (nav as NativeStackScreenProps<OnboardingParamList, 'CoachJoin'>['navigation']).navigate('Authentication');
      else navigation.navigate('Authentication', { after: 'coach' });
      return;
    }
    setBusy(true);
    try {
      const profile = app.profile;
      const sex = profile?.sex ?? params.sex;
      const days = profile?.daysPerWeek;
      const name = (profile?.name ?? app.pendingName() ?? '').trim().slice(0, 40);
      const r = await coach.join({
        code: c,
        // The server refuses an empty name; a trainee who skipped hers is named by her role until she writes one.
        name: name || t('coachTrack.athlete.nameFallback'),
        ...(sex ? { sex } : {}),
        ...(days && days >= 1 && days <= 7 ? { days } : {}),
        consent: { bodyweight, cardio },
      });
      if (!r.ok) {
        setErrorKey(joinErrorKey(r.error));
        return;
      }
      setNeedsAccount(false);
      // The FIRST week is not an update: Today opens on it, not on a card listing all of it as changes.
      await coach.dismissUpdate();
      if (intake) {
        /*
         * ⚠️ REPLACE, NOT NAVIGATE (found on the web walk, 2026-09-17). `CoachJoin` is registered on BOTH
         * stacks, and when onboarding completes the container carries the old stack's routes into the
         * main navigator, keeping every route name the main stack also has — so an invite left in the
         * history re-opened, empty, over Today. The join is done; it leaves the history with it.
         */
        (nav as NativeStackScreenProps<OnboardingParamList, 'CoachJoin'>['navigation']).replace('ConnectHealth', {
          ...(sex ? { sex } : {}),
          ...(params.weightKg != null ? { weightKg: params.weightKg } : {}),
          coach: true,
        });
      } else {
        navigation.navigate('HomeTabs', { screen: 'Today' });
      }
    } finally {
      setBusy(false);
    }
  }, [busy, code, app, coach, params.sex, params.weightKg, bodyweight, cardio, intake, nav, navigation, t]);

  // Back from sign-in: finish what she started, once, only if the account now exists.
  useEffect(() => {
    const off = navigation.addListener('focus', () => {
      if (!joinOnReturn.current) return;
      void app.isSignedIn().then((signed) => {
        if (!signed || !joinOnReturn.current) return;
        joinOnReturn.current = false;
        void join();
      });
    });
    return off;
  }, [navigation, app, join]);

  return (
    <CoachJoinView
      code={code}
      onCode={setCode}
      bodyweight={bodyweight}
      onBodyweight={setBodyweight}
      cardio={cardio}
      onCardio={setCardio}
      busy={busy}
      errorKey={errorKey}
      needsAccount={needsAccount}
      /* Only a week she is actually standing on, and only one that is not already a coach's —
         `already_linked` is the refusal for that case and it says its own sentence. */
      replacesWeek={!!app.program && app.program.authored !== 'coach'}
      onJoin={() => void join()}
      onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('HomeTabs', { screen: 'Today' }))}
      intake={intake}
    />
  );
}

const styles = StyleSheet.create({
  rows: { gap: 26 },
  col: { gap: 10 },
  fieldLegend: { color: color.textPrimary },
  /* The mono voice, tracked open and centred — see the note at the field. Six glyphs, no words. */
  codeInput: { fontFamily: font.monoMedium, fontSize: 30, letterSpacing: 6, textAlign: 'center' }, // latin-ok: `INVITE_ALPHABET` is A–Z and 2–9 in every locale, for ever
  codeHint: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: stage.ink1, marginTop: 8, textAlign: 'left' },
  listLegend: { marginBottom: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 30 },
  itemText: { flex: 1, fontFamily: font.sans, fontSize: 18, lineHeight: 24, color: stage.ink0, textAlign: 'left' },
  itemTextNo: { color: stage.ink1 },
  toggles: { marginTop: 8, borderRadius: 18, borderWidth: 1, borderColor: color.border, paddingHorizontal: 16 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  toggleRule: { borderBottomWidth: 1, borderBottomColor: color.border },
  toggleText: { flex: 1, minWidth: 0 },
  toggleLabel: { fontFamily: font.sansMedium, fontSize: 18, color: stage.ink0, textAlign: 'left' },
  toggleSub: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: stage.ink1, marginTop: 2, textAlign: 'left' },
  /* ⛔ A REFUSAL WEARS CLAY (the app's alert tone, as `MyCoach` already did). Cream said nothing
     had gone wrong; a sentence appearing above the button with no change of voice is a caption. */
  error: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: alert.stage, marginBottom: 12, textAlign: 'left' },
  /* Not a refusal: the next step, in the reading voice. */
  waypoint: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: stage.ink1, marginBottom: 12, textAlign: 'left' },
  /* The cost of the press, stated before it. Clay, on its own rule — it is not a footnote. */
  replaces: {
    fontFamily: font.sans,
    fontSize: 17,
    lineHeight: 23,
    color: alert.stage,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: 12,
    marginBottom: 14,
    textAlign: 'left',
  },
  foot: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: stage.ink1, marginTop: 10, textAlign: 'center' },
});
