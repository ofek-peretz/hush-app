/**
 * Body map — onboarding (Engine v5, register Part 3). The centrepiece of "what to train": the athlete
 * marks each muscle off / normal / emphasis, and the programme's whole shape follows from it, which
 * is what REPLACES the demographic split. Set once here, permanently editable later (Settings).
 *
 * The map itself lives in `components/BodyMapFigure` — the SAME component the Settings editor
 * renders, because the brief requires the editor to reuse this map ("the same body map, editable any
 * time"). A map that looked one way at signup and another in Settings would be two maps, and she
 * would have to learn it twice. This screen owns only what is its: the scaffold, and Continue.
 *
 * Onboarding deliberately does NOT show the per-muscle rep band. It is a set-once preference at a
 * default (8–10) most athletes never touch, and asking for it here is deliberation at the worst
 * possible moment — it lives in the editor (Family 4).
 *
 * ════ THE END-PASS (2026-07-17) ════
 * The previous build said of itself: "the FUNCTIONAL build… the visual redesign, the polish, the
 * final copy is the founder's end-pass; the wiring here survives that redesign unchanged." It did.
 * That pass closed three real holes:
 *
 *  1. **The screen never called `validateMap`** — though `fixtureModel`'s safety net says in writing
 *     that "everything-off (S-3) is prevented by the body-map screen (validateMap)". It wasn't.
 *     Turning all ten off and pressing Continue fell through to that net, which quietly rebuilds an
 *     ALL-NORMAL map. So Hush silently handed her a full-body week after she had explicitly asked
 *     for none of it. Now the map is validated here, and an unbuildable one is SAID, not worked around.
 *  2. **The emphasis budget was a hidden error** — a third mark hit `return` with a tick and nothing
 *     else. The brief: "make that limit legible, not a hidden error."
 *  3. **The consequence was never stated.** The brief: "state the consequence of turning things off,
 *     calmly and once… never argue with the choice."
 *
 * ════ THE FIGURE — THE FOUNDER OVERTURNED THE LIST (2026-07-27) ════
 * This screen used to argue that a figure was impossible ("ten muscles cannot be tapped on a
 * phone-sized body… a real figure means either targets nobody can hit or a front/back MODE"). The v7
 * handoff answers it with exactly that front/back mode, and the handoff is the source of truth. The
 * map lives in `components/BodyMapFigure` now — the SAME figure the editor draws, because 13.2 says
 * in as many words that the pain flow reuses "the same body map you already own". One map, three
 * surfaces; the screens still own only their own chrome.
 *
 * Continue carries the assembled onboarding inputs plus the map to the build step (ProgramCreated).
 */
import React, { useState } from 'react';
import { Text, View, StyleSheet, useWindowDimensions } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { SegmentedControl } from '@/components/ds';
import { BodyMapFigure, viewOf, type BodyView } from '@/components/BodyMapFigure';
import { BodyMapSheet } from '@/components/BodyMapSheet';
import * as haptics from '@/platform/haptics';
import type { MuscleStance } from '@/data/local/models';
import { bodyMapNote } from '@/domain/bodyMapNote';
import { CANONICAL_MUSCLE_ORDER, EMPHASIS_BUDGET } from '@/engine/v5/constants';
import { validateMap, emphasisMuscles, type BodyMap as BodyMapT } from '@/engine/v5/bodyMap';
import { color, font, textScale } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'BodyMap'>;

export function BodyMap({ navigation, route }: Props) {
  const { t } = useCopy();
  const { inputs } = route.params;
  // Absent = normal (the parity default); only off / emphasis are stored, so the map stays compact.
  const [map, setMap] = useState<BodyMapT>({});
  // Hush answering a budget refusal. Cleared by any move that resolves it, so it answers an act
  // rather than standing there as a scold.
  const [refused, setRefused] = useState(false);
  const [view, setView] = useState<BodyView>('front');
  const [open, setOpen] = useState<string | null>(null);
  // The window first, the stage's layout after — see the editor's note.
  const winW = useWindowDimensions().width;
  const [stageW, setStageW] = useState(0);
  const figureW = stageW || Math.max(0, Math.round(winW - 30));

  function setStance(m: string, s: MuscleStance) {
    // The emphasis budget is a hard limit (F-4) — but a refusal she cannot see is a bug, not a
    // limit. The footer names who holds it (the brief: "legible, not a hidden error").
    if (s === 'emphasis' && (map[m] ?? 'normal') !== 'emphasis' && emphasisMuscles(map, CANONICAL_MUSCLE_ORDER).length >= EMPHASIS_BUDGET) {
      haptics.tick();
      setRefused(true);
      return;
    }
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

  const emphasised = emphasisMuscles(map, CANONICAL_MUSCLE_ORDER);
  const check = validateMap(map, CANONICAL_MUSCLE_ORDER);
  const note = bodyMapNote(
    map,
    CANONICAL_MUSCLE_ORDER,
    refused && emphasised.length === EMPHASIS_BUDGET ? [t(`muscle.${emphasised[0]}`), t(`muscle.${emphasised[1]}`)] : null,
  );

  function onContinue() {
    // S-3 / F-4, enforced HERE. `fixtureModel`'s all-normal fallback is a belt for a map that should
    // never arrive; letting one arrive would mean Hush rebuilding her week behind her back.
    if (!check.ok) return;
    // The body map is the last thing collected FROM a form. What follows is the conversation that
    // turns all of it into a programme — see `CoachIntake`.
    navigation.navigate('CoachIntake', { inputs: { ...inputs, bodyMap: map } });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 4, total: 4 }}
      legend={t('ob.mapLegend')}
      title={t('ob.mapTitle')}
      sub={t('ob.mapSub')}
      footer={
        <>
          {/* One line, and only ever one — what the map is saying right now. */}
          <Text style={[styles.note, note.loud && styles.noteLoud]}>{t(note.key, note.params)}</Text>
          <Button variant="primary" size="lg" block label={t('ob.daysBuild')} onPress={onContinue} disabled={!check.ok} />
        </>
      }
    >
      <View
        style={styles.stage}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          setStageW((cur) => (cur === w ? cur : w));
        }}
      >
        <SegmentedControl
          size="pill"
          style={styles.face}
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
        <BodyMapFigure
          value={map}
          view={view}
          openMuscle={open}
          onPressMuscle={(m) => {
            haptics.tick();
            setRefused(false);
            setOpen((cur) => (cur === m ? null : m));
          }}
          width={figureW}
        />
        {/* Onboarding raises the stance only — the rep band is the editor's, and asking for it here
            is deliberation at the worst possible moment. */}
        {open ? <BodyMapSheet muscle={open} stance={map[open] ?? 'normal'} onStance={(s) => setStance(open, s)} /> : null}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  stage: { gap: 14, alignItems: 'stretch' },
  face: { alignSelf: 'center' },
  note: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'center' },
  /* A refusal is Hush answering something she just did — it earns full ink, not a shout. */
  noteLoud: { color: color.textPrimary },
});
