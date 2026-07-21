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
 *  · **S-56 — the OFF is obeyed in SILENCE.** An earlier build put a confirm sheet in front of the
 *    toggle; that mechanism appears nowhere in the register, and it argued with a choice she was in
 *    the middle of making (L8). The register's actual rule: obey now, and come back ONCE, later, at
 *    the Saturday mirror — "Legs have been off a while. Want them back?" — only for a muscle she
 *    has really trained, and never twice (L4). That question lives in `WeeklyUpdate` now, on the
 *    engine's `askBackMuscle` predicate.
 *
 * ════ TURNING IT BACK ON RESUMES ════
 * The brief: "Turning a muscle back on resumes it (with its history), never restarts it." That is
 * already true and it is true by CONSTRUCTION, not by care taken here: v5 keys progression to the
 * EXERCISE, never to a slot or a map entry (register L2), so a muscle switched off simply stops
 * being assembled into days. Its lifts keep their loads, bands and history; switching it back on
 * puts them back in the week exactly where they were. Nothing in this screen deletes engine state,
 * and nothing may ever be added here that does.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { BodyMapField } from '@/components/BodyMapField';
import { bodyMapNote } from '@/domain/bodyMapNote';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { useToast } from '@/components/ds';
import { validateMap, emphasisMuscles, type BodyMap } from '@/engine/v5/bodyMap';
import { CANONICAL_MUSCLE_ORDER, EMPHASIS_BUDGET } from '@/engine/v5/constants';
import * as haptics from '@/platform/haptics';
import type { RepBandChoice } from '@/data/local/models';
import { color, font, textScale, space, radius } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'BodyMapEdit'>;

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
});
