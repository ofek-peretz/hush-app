/**
 * FORM (v7 2.2c) — the silent technique reference, as a CARD ON A DIMMED STAGE.
 *
 * ════ IT IS NOT A SHEET ════
 *
 * This used to be a bottom sheet with an eyebrow, a title, the clip, a scrolling cue list and a
 * Close button — five pieces of chrome around one video. v7 makes it a floating card: the clip at
 * the top edge to edge, the lift's name, three numbered cues, and nothing else. There is no Close
 * button because there is no decision here: the whole backdrop dismisses it. "Tap anywhere to
 * close" says so once, under the card, and that is the only instruction on the screen.
 *
 * ════ AND THIS DOOR IS WHERE MOVEMENT LIVES — NOT THE STAGE (design audit, 2026-08-24) ════
 *
 * Ladder is the one competitor whose design does not fall short of ours, and its bet is the exact
 * opposite of ours: its workout screen is a full-bleed video of a coach PERFORMING the lift, with
 * the reps, the timer arc and the load as a HUD along the bottom. It works — 80% of their athletes
 * had never used a fitness app before, and a person to follow is what makes that possible.
 *
 * We are not doing it, and the ruling is the same one that removed the drop-set tags the same day:
 * the programme is decided in advance so that in the workout she thinks about nothing and only
 * executes. A clip playing beside a live set is a thing to watch, which is a thing to think about,
 * and the stage's whole job is to hold one decision and nothing else. So the quiet stays on the
 * stage and the movement lives HERE — behind a door she opens on purpose, between sets, when
 * looking something up is the thing she actually wants to do.
 *
 * ⚠️ WHEN THE VIDEO CONTENT LANDS, IT LANDS IN `FormMedia` ABOVE AND NOWHERE ELSE. The stage takes
 * no clip, no loop, no thumbnail, and no autoplay.
 *
 * The cues are NUMBERED, in moss, and they are numbered because they are a sequence — feet, then
 * bar path, then lockout. A bullet says "here are some facts"; an ordinal says "do this, then this".
 */

// 

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FormMedia } from '@/components/FormMedia';
import { font, stage, signal, ramp, rampLine } from '@/design/tokens';

interface Props {
  title: string;
  cues: string[];
  focusLabel: string; // retained for API compatibility (no longer rendered as a label)
  formGuideLabel: string; // retained for API compatibility (the card carries no eyebrow)
  doneLabel: string; // the dismiss hint under the card
  onDone: () => void;
  /** The exercise whose demo video to play, when one exists (else the silhouette fallback). */
  exerciseId?: string | null;
}

export function ExerciseDemo({ title, cues, doneLabel, onDone, exerciseId }: Props) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* THE BACKDROP IS THE BUTTON. A press anywhere outside the card closes it — including on
          the hint line, which sits on this layer rather than inside the card. */}
      <Pressable accessibilityRole="button" accessibilityLabel={doneLabel} onPress={onDone} style={styles.scrim} />
      <View style={styles.card}>
        <View style={styles.media}>
          <FormMedia exerciseId={exerciseId} title={title} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {cues.map((c, i) => (
            <View key={i} style={styles.cueRow}>
              <Text style={styles.index}>{String(i + 1).padStart(2, '0')}</Text>
              <Text style={styles.cue}>{c}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text pointerEvents="none" style={styles.hint}>{doneLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,14,12,0.75)' },
  card: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 150,
    backgroundColor: '#1d1c19',
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.14)',
    borderRadius: 26,
    overflow: 'hidden',
  },
  // The clip runs to the card's own edges — no inset, no rounding of its own.
  media: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#26241f' },
  body: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 22, gap: 13 },
  /*
   * ⛔ 18 → 24 (2026-08-27). The lift's NAME was set one point above its own instructions — the cues
   * below it are 17, and the founder's floor is 17, so the heading of this card had exactly one
   * point of hierarchy over its body text and read as another cue that happened to be bold.
   *
   * This card exists to answer *"how do I do THIS lift"*; the demonstration is its hero and the name
   * is what the demonstration is OF. `ramp.subhead` is the rung for a card's title, and against the
   * 17-point cues it gives a 1.4× step — a heading you read first rather than one you find.
   *
   * ⚠️ AND IT HAD NO `lineHeight`, which is how a two-line name (`numberOfLines={2}` is right there)
   * gets whatever the platform decides. Stated now, from the same rung.
   */
  title: { fontFamily: font.sansSemibold, fontSize: ramp.subhead, lineHeight: rampLine.subhead, color: stage.ink0, textAlign: 'left' },
  cueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 11 },
  // The ordinal, in moss: this is step one, then two, then three.
  index: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, color: signal[0], textAlign: 'left' },
  // A cue is READ under load: brighter than the app's secondary ink, short of the headline's.
  cue: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 20, color: '#d8d4c8', textAlign: 'left' },
  // The one instruction on the screen, under the card, on the backdrop it describes.
  hint: { position: 'absolute', left: 0, right: 0, bottom: 60, fontFamily: font.sans, fontSize: 17, color: stage.ink1, textAlign: 'center' },
});
