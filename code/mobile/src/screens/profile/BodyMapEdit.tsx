/**
 * The body-map EDITOR (v7 4.1) — "the same map, forever editable".
 *
 * The map is a FIGURE now, not a list (see `components/BodyMapFigure` for why the old ruling against
 * one was overturned and how its objection is answered). A tapped muscle raises the sheet: its
 * stance, and — here only — its rep band on an engraved ruler.
 *
 * What the editor adds over onboarding:
 *
 *  · **The per-muscle rep band** (register Part 9). Onboarding never asks for it — it is a set-once
 *    preference at a default (8–10) most athletes never touch, and asking at signup is deliberation
 *    at the worst moment. Here it is one tap from the muscle, and invisible until wanted. The engine
 *    has read `repBandByMuscle` all along (each exercise resolves its band from its primary muscle);
 *    this is the only surface that ever WRITES it.
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
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, SegmentedControl } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { BodyMapFigure, viewOf, type BodyView } from '@/components/BodyMapFigure';
import { BodyMapSheet } from '@/components/BodyMapSheet';
import { bodyMapNote } from '@/domain/bodyMapNote';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { useToast } from '@/components/ds';
import { validateMap, emphasisMuscles, type BodyMap } from '@/engine/v5/bodyMap';
import { CANONICAL_MUSCLE_ORDER, EMPHASIS_BUDGET } from '@/engine/v5/constants';
import * as haptics from '@/platform/haptics';
import type { MuscleStance, RepBandChoice } from '@/data/local/models';
import { color, font, textScale, space, tracking, trackingPx } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'BodyMapEdit'>;

export function BodyMapEdit({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const toast = useToast();
  const p = app.profile;
  // The window is the STARTING answer and the stage's own layout is the final one. A figure gated
  // on measurement alone never draws where there is no layout engine (a test) and blinks on the
  // first frame where there is; a figure that only ever trusts the window runs off any surface
  // narrower than it (a harness, a split view). Take the window, then correct it.
  const winW = useWindowDimensions().width;
  const [stageW, setStageW] = useState(0);
  const figureW = stageW || Math.max(0, Math.round(winW - 30));

  const [map, setMap] = useState<BodyMap>(p?.bodyMap ?? {});
  const [bands, setBands] = useState<Record<string, RepBandChoice>>(p?.repBandByMuscle ?? {});
  const [refused, setRefused] = useState(false);
  const [view, setView] = useState<BodyView>('front');
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

  function setStance(m: string, s: MuscleStance) {
    // The emphasis budget is a hard limit (F-4) — but a refusal she cannot see is a bug, not a
    // limit. The note under the figure names who holds it (the brief: "legible, not a hidden error").
    if (s === 'emphasis' && (map[m] ?? 'normal') !== 'emphasis' && emphasised.length >= EMPHASIS_BUDGET) {
      haptics.tick();
      setRefused(true);
      return;
    }
    // S-56 — an OFF is obeyed in silence (L8). The one "want it back?" question is asked later, at
    // the Saturday mirror, for a muscle she has actually trained (WeeklyUpdate · askBackMuscle).
    haptics.tick();
    setRefused(false);
    setMap((prev) => {
      const next = { ...prev };
      // Only her decisions are stored — 'normal' is the ABSENCE of one, not one of them.
      if (s === 'normal') delete next[m];
      else next[m] = s;
      return next;
    });
  }

  /** A tapped zone opens it; tapping the open one again puts the sheet away. */
  function pressMuscle(m: string) {
    haptics.tick();
    setRefused(false);
    setOpen((cur) => (cur === m ? null : m));
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
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* back · the surface's name in the serif · the face of the body being shown */}
        <View style={styles.head}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => navigation.goBack()} hitSlop={12}>
            <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">{t('profile.bodyMap')}</Text>
          <SegmentedControl
            size="pill"
            options={[
              { value: 'front', label: t('ob.mapFront') },
              { value: 'back', label: t('ob.mapBack') },
            ]}
            value={view}
            onChange={(v) => {
              const next = v as BodyView;
              setView(next);
              // The open sheet belongs to a muscle on the other face — turning the body puts it away.
              setOpen((cur) => (cur && viewOf(cur) !== next ? null : cur));
            }}
          />
        </View>

        <View
          style={styles.stage}
          onLayout={(e) => {
            const w = Math.round(e.nativeEvent.layout.width);
            setStageW((cur) => (cur === w ? cur : w));
          }}
        >
          <BodyMapFigure value={map} view={view} openMuscle={open} onPressMuscle={pressMuscle} width={figureW} />
        </View>

        {/* One line, and only ever one — what the map is saying right now. */}
        <Text style={[styles.note, note.loud && styles.noteLoud]}>{t(note.key, note.params)}</Text>
      </SafeAreaView>

      {/* THE SHEET — a tapped muscle, opened. Nothing is shown until something is asked for. */}
      {open ? (
        <BodyMapSheet
          muscle={open}
          stance={map[open] ?? 'normal'}
          onStance={(s) => setStance(open, s)}
          band={bands[open]}
          onBandChange={(b) => setBands((prev) => ({ ...prev, [open]: b }))}
        />
      ) : null}

      <SafeAreaView edges={['bottom']} style={styles.footSafe}>
        <View style={styles.foot}>
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
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 26, paddingTop: 18, paddingBottom: 4 },
  // v7 4.1: the surface's name in the coach's serif at 24 — a screen headline.
  title: { flex: 1, fontFamily: font.serif, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.display), color: color.textPrimary, textAlign: 'center' },
  // THE FIGURE SITS IN THE MIDDLE (founder 2026-07-28). It hung from the top, which left the body
  // pressed against the header and a pool of dead space beneath it — on a screen whose whole subject
  // is a body. `center` gives it the room it was already taking up, on both sides of it.
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  note: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'center', paddingHorizontal: space.gutter, paddingBottom: space[2] },
  /* A refusal is Hush answering something she just did — it earns full ink, not a shout. */
  noteLoud: { color: color.textPrimary },
  footSafe: { backgroundColor: color.bg },
  foot: { paddingHorizontal: space.gutter, paddingTop: space[3], paddingBottom: space[2] },
});
