/**
 * The body-map EDITOR (brief, Family 4) — the same map she drew at signup, editable forever.
 *
 * It renders `components/BodyMapField`, the very component onboarding renders, because the brief
 * requires exactly that ("reuses the onboarding map"). A map that looked one way at signup and
 * another in Settings would be two maps, and she would have to learn it twice.
 *
 * What the editor adds over onboarding:
 *
 *  · **The per-muscle rep band** (register Part 9). Onboarding never asks for it — it is a set-once
 *    preference at a default (8–10) most athletes never touch, and asking at signup is deliberation
 *    at the worst moment. Here it is one tap from the muscle's name, and invisible until wanted.
 *    The engine has read `repBandByMuscle` all along (fixtureModel resolves each exercise's band
 *    from its primary muscle); this is the first surface that could ever WRITE it.
 *
 *  · **S-56 — the ask-back.** `shouldAskBackOnOff` has been sitting in the engine, correct and
 *    unused, with a note on it: "DELIBERATELY NOT WIRED (founder decision, 2026-07-16): the ask-back
 *    is a body-map SCREEN interaction… which lands with the founder's end redesign of that screen.
 *    The engine predicate is ready for it." This is that screen. Turning off a muscle she has
 *    actually TRAINED is a change of state, not a statement of taste, so Hush asks once. A muscle
 *    with no logged set is honoured in silence — asking would be the nagging L8 bans.
 *
 * ════ TURNING IT BACK ON RESUMES ════
 * The brief: "Turning a muscle back on resumes it (with its history), never restarts it." That is
 * already true and it is true by CONSTRUCTION, not by care taken here: v5 keys progression to the
 * EXERCISE, never to a slot or a map entry (register L2), so a muscle switched off simply stops
 * being assembled into days. Its lifts keep their loads, bands and history; switching it back on
 * puts them back in the week exactly where they were. Nothing in this screen deletes engine state,
 * and nothing may ever be added here that does.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { BodyMapField } from '@/components/BodyMapField';
import { BottomSheet } from '@/components/BottomSheet';
import { bodyMapNote } from '@/domain/bodyMapNote';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { useToast } from '@/components/ds';
import { db } from '@/data/local/db';
import { muscleOf } from '@/data/exercises';
import { shouldAskBackOnOff, validateMap, emphasisMuscles, type BodyMap } from '@/engine/v5/bodyMap';
import { CANONICAL_MUSCLE_ORDER, EMPHASIS_BUDGET } from '@/engine/v5/constants';
import * as haptics from '@/platform/haptics';
import type { RepBandChoice, Session } from '@/data/local/models';
import { color, font, textScale, space, radius } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'BodyMapEdit'>;

/** Every muscle she has a LOGGED set on — the fact S-56 turns on (never an inference). */
function trainedMuscles(history: Session[]): Set<string> {
  const out = new Set<string>();
  for (const s of history) for (const set of s.sets) {
    const m = muscleOf(set.exerciseId);
    if (m) out.add(m);
  }
  return out;
}

export function BodyMapEdit({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const toast = useToast();
  const p = app.profile;

  const [map, setMap] = useState<BodyMap>(p?.bodyMap ?? {});
  const [bands, setBands] = useState<Record<string, RepBandChoice>>(p?.repBandByMuscle ?? {});
  const [refused, setRefused] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving'>('idle');
  /** The muscle S-56 is asking about — she turned off something she has actually trained. */
  const [askBack, setAskBack] = useState<string | null>(null);

  const [history, setHistory] = useState<Session[]>([]);
  React.useEffect(() => {
    let active = true;
    db.loadHistory()
      .then((h) => active && setHistory(h))
      // A storage hiccup must not block an edit: with no history nothing reads as trained, so the
      // ask-back simply does not fire. Honouring her toggle silently is the safe failure (L8).
      .catch(() => active && setHistory([]));
    return () => {
      active = false;
    };
  }, []);

  const trained = useMemo(() => trainedMuscles(history), [history]);
  const emphasised = emphasisMuscles(map, CANONICAL_MUSCLE_ORDER);
  const check = validateMap(map, CANONICAL_MUSCLE_ORDER);
  const note = bodyMapNote(
    map,
    CANONICAL_MUSCLE_ORDER,
    refused && emphasised.length === EMPHASIS_BUDGET ? [t(`muscle.${emphasised[0]}`), t(`muscle.${emphasised[1]}`)] : null,
  );

  const dirty =
    JSON.stringify(map) !== JSON.stringify(p?.bodyMap ?? {}) ||
    JSON.stringify(bands) !== JSON.stringify(p?.repBandByMuscle ?? {});

  /**
   * S-56 — asked BEFORE a muscle goes dark. The trigger is a FACT ("does she have a logged set on
   * it?"), never a guess. Returning false holds the toggle until she answers.
   */
  function onBeforeOff(m: string): boolean {
    if (!shouldAskBackOnOff(trained.has(m))) return true;
    setAskBack(m);
    return false;
  }

  function confirmOff() {
    if (!askBack) return;
    setMap((prev) => ({ ...prev, [askBack]: 'off' }));
    setAskBack(null);
    haptics.tick();
  }

  async function save() {
    if (!check.ok || !dirty || saving === 'saving') return;
    setSaving('saving');
    try {
      // The map reshapes the week, so the store rebuilds it — the same road a frequency change
      // takes. Whole-object, never merged: a muscle taken back to normal must LEAVE the map.
      await app.updateProfileInfo({ bodyMap: map, repBandByMuscle: bands });
    } catch {
      setSaving('idle'); // nothing persisted — let her try again rather than lie about it
      return;
    }
    haptics.confirm();
    // The same word a frequency change earns — a map change reshapes the week the same way.
    toast.show(t('profileEdit.savedDays'));
    navigation.goBack();
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.head}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => navigation.goBack()} hitSlop={12}>
            <Icon name="chevronLeft" size={24} color={color.textPrimary} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">{t('profile.bodyMap')}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.sub}>{t('ob.mapEditSub')}</Text>
          <BodyMapField
            value={map}
            onChange={setMap}
            onRefused={setRefused}
            bands={bands}
            onBandChange={(m, b) => setBands((prev) => ({ ...prev, [m]: b }))}
            openMuscle={open}
            onOpenMuscle={setOpen}
            onBeforeOff={onBeforeOff}
          />
        </ScrollView>
        <View style={styles.foot}>
          {/* One line, and only ever one — what the map is saying right now. */}
          <Text style={[styles.note, note.loud && styles.noteLoud]}>{t(note.key, note.params)}</Text>
          <Button
            variant="primary"
            size="lg"
            block
            label={t('profileEdit.save')}
            onPress={save}
            disabled={!check.ok || !dirty || saving === 'saving'}
          />
        </View>
      </SafeAreaView>

      {/* S-56. Asked ONCE, about a muscle she has really trained, and it never argues with her —
          it states what she is about to leave behind and lets her do it. */}
      {askBack ? (
        <BottomSheet onClose={() => setAskBack(null)}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            {t('ob.mapAskBackTitle', { muscle: t(`muscle.${askBack}`) })}
          </Text>
          <Text style={styles.sheetBody}>{t('ob.mapAskBackBody', { muscle: t(`muscle.${askBack}`) })}</Text>
          <View style={styles.sheetActions}>
            <Button variant="secondary" size="lg" block label={t('ob.mapAskBackKeep')} onPress={() => setAskBack(null)} />
            <Button variant="primary" size="lg" block label={t('ob.mapAskBackOff')} onPress={confirmOff} />
          </View>
        </BottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.gutter, paddingVertical: space[3] },
  title: { fontFamily: font.sansBold, fontSize: textScale.xl, color: color.textPrimary, textAlign: 'left' },
  body: { paddingHorizontal: space.gutter, paddingBottom: space[6], gap: space[4] },
  sub: { fontFamily: font.sans, fontSize: textScale.base, color: color.textSecondary, lineHeight: 22, textAlign: 'left' },
  foot: { paddingHorizontal: space.gutter, paddingTop: space[3], paddingBottom: space[2], gap: space[3] },
  note: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'center' },
  /* A refusal is Hush answering something she just did — it earns full ink, not a shout. */
  noteLoud: { color: color.textPrimary },
  sheetTitle: { fontFamily: font.sansBold, fontSize: textScale.lg, color: color.textPrimary, textAlign: 'left', marginBottom: 8 },
  sheetBody: { fontFamily: font.sans, fontSize: textScale.base, color: color.textSecondary, lineHeight: 22, textAlign: 'left' },
  sheetActions: { gap: space[2], marginTop: space[4] },
});
