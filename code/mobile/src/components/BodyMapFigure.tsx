/**
 * THE BODY, DRAWN — the map as a figure you touch (v7 4.1).
 *
 * ════ THE FOUNDER OVERTURNED THE LIST (2026-07-27) ════
 * This component's predecessor argued, in writing, that a figure was impossible: "ten muscles cannot
 * be tapped on a phone-sized body… a real figure means either targets nobody can hit or a front/back
 * MODE, and the map's whole value is seeing every decision at once." The handoff answers it exactly
 * that way — **a front/back mode** — and the handoff is the source of truth. The objection was right
 * about the arithmetic and wrong about the trade: five muscles a side is five generous targets, and
 * what you lose (all ten at once) you get back from the two labels the figure draws for itself.
 *
 * So the old constraint is honoured rather than ignored: every zone is at least 44pt on its shortest
 * axis once hit-slop is counted (the arms are 25pt wide and carry 12pt of slop a side), and every
 * zone still carries the VoiceOver label the list used to be.
 *
 * ════ THE TONE IS THE STANCE ════
 * Unchanged from the list, because it is the law the whole app stands on: off RECEDES into the dark,
 * normal sits on paper, emphasis LIFTS to moss-tinted paper with a struck check. Emphasis is not a
 * colour, it is distance from the ground — so the map reads at a glance with no legend, and turning
 * the legs off literally sinks the bottom of the figure.
 *
 * ════ THE REGIONS ARE THE ENGINE'S ════
 * Which muscles exist and in what order comes from `CANONICAL_MUSCLE_ORDER`; the front/back split
 * below is a DRAWING decision (where a muscle sits on a body), not a training one — nothing here
 * groups muscles in a way the assembler does not.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useCopy } from '@/i18n/useCopy';
import { monoCanDraw } from '@/design/monoVoice';
import type { BodyMap } from '@/engine/v5/bodyMap';
import type { MuscleStance } from '@/data/local/models';
import { Icon } from '@/components/Icon';
import { color, font, paper, signal, tracking, trackingPx } from '@/design/tokens';

/** Which face of the body a muscle is drawn on. */
export type BodyView = 'front' | 'back';

/** The art board the handoff draws into. Everything below is in these units and scales as one. */
const ART_W = 330;
const ART_H = 372;

/** One drawn block: a rectangle on the art board, in art units. */
interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

interface Zone {
  muscle: string;
  blocks: Block[];
  /** Which edge this muscle's leader line runs to, and at what height. */
  label: { side: 'start' | 'end'; y: number };
}

/**
 * FRONT — shoulders, chest, biceps, core, quads. Straight off the handoff's own coordinates.
 * The head is drawn but is not a zone: it is not a muscle, and a tappable head would be a lie.
 */
const FRONT: Zone[] = [
  {
    muscle: 'Shoulders',
    blocks: [
      { x: 76, y: 44, w: 54, h: 24, r: 13 },
      { x: 200, y: 44, w: 54, h: 24, r: 13 },
    ],
    label: { side: 'start', y: 44 },
  },
  {
    muscle: 'Chest',
    blocks: [
      { x: 106, y: 74, w: 56, h: 50, r: 15 },
      { x: 168, y: 74, w: 56, h: 50, r: 15 },
    ],
    label: { side: 'end', y: 86 },
  },
  {
    muscle: 'Biceps',
    blocks: [
      { x: 64, y: 78, w: 25, h: 92, r: 13 },
      { x: 241, y: 78, w: 25, h: 92, r: 13 },
    ],
    label: { side: 'start', y: 140 },
  },
  { muscle: 'Core', blocks: [{ x: 120, y: 132, w: 90, h: 82, r: 17 }], label: { side: 'end', y: 168 } },
  {
    muscle: 'Quads',
    blocks: [
      { x: 118, y: 224, w: 42, h: 126, r: 21 },
      { x: 170, y: 224, w: 42, h: 126, r: 21 },
    ],
    label: { side: 'start', y: 272 },
  },
];

/** BACK — back, triceps, glutes, hamstrings, calves. The same body, turned around. */
const BACK: Zone[] = [
  { muscle: 'Back', blocks: [{ x: 106, y: 44, w: 118, h: 96, r: 18 }], label: { side: 'end', y: 66 } },
  {
    muscle: 'Triceps',
    blocks: [
      { x: 64, y: 78, w: 25, h: 92, r: 13 },
      { x: 241, y: 78, w: 25, h: 92, r: 13 },
    ],
    label: { side: 'start', y: 110 },
  },
  { muscle: 'Glutes', blocks: [{ x: 118, y: 150, w: 94, h: 62, r: 20 }], label: { side: 'end', y: 172 } },
  {
    muscle: 'Hamstrings',
    blocks: [
      { x: 118, y: 222, w: 42, h: 76, r: 20 },
      { x: 170, y: 222, w: 42, h: 76, r: 20 },
    ],
    label: { side: 'start', y: 250 },
  },
  {
    muscle: 'Calves',
    blocks: [
      { x: 120, y: 306, w: 38, h: 50, r: 18 },
      { x: 172, y: 306, w: 38, h: 50, r: 18 },
    ],
    label: { side: 'end', y: 322 },
  },
];

export const ZONES: Record<BodyView, Zone[]> = { front: FRONT, back: BACK };

/** The face a muscle is drawn on — so a caller can turn the figure to the muscle it must show. */
export function viewOf(muscle: string): BodyView {
  return BACK.some((z) => z.muscle === muscle) ? 'back' : 'front';
}

interface Props {
  value: BodyMap;
  view: BodyView;
  /** The muscle whose sheet is open — it lifts, and draws the EDITING leader. */
  openMuscle?: string | null;
  onPressMuscle: (muscle: string) => void;
  /** Width available to the figure; the art scales into it and never past its natural size. */
  width: number;
  /**
   * v7 13.2 — the muscle she is pointing at because it HURTS. Struck in clay with a pulsing halo
   * and its own leader, and it overrides the stance tones: what matters on that screen is where it
   * hurts, not how much of the week that muscle owns.
   */
  tenderMuscle?: string | null;
  /** 13.2 shows only where it hurts — the stance tones and the LEAD marks step out of the way. */
  hideStances?: boolean;
}

export function BodyMapFigure({
  value,
  view,
  openMuscle,
  onPressMuscle,
  width,
  tenderMuscle,
  hideStances,
}: Props) {
  const { t } = useCopy();
  const scale = Math.min(1, width / ART_W);
  const u = (n: number) => n * scale; // art units → device points
  const zones = ZONES[view];
  const stanceOf = (m: string): MuscleStance => value[m] ?? 'normal';

  return (
    <View style={[styles.board, { width: u(ART_W), height: u(ART_H) }]}>
      {/* The head. Drawn so the figure reads as a body, never pressable — it is not a muscle. */}
      <View
        pointerEvents="none"
        style={[styles.head, { left: u(148), top: 0, width: u(34), height: u(34), borderRadius: u(17) }]}
      />

      {zones.map((zone) => {
        const tender = tenderMuscle === zone.muscle;
        // On the pain screen the stance is not the story — every zone reads as plain paper, so the
        // one clay shape is the only thing the eye has to find.
        const stance = hideStances ? 'normal' : stanceOf(zone.muscle);
        const open = openMuscle === zone.muscle;
        return (
          <React.Fragment key={zone.muscle}>
            {/* THE HALO — the handoff's 4px spread, drawn as a ring on the dark ground rather than
                as a border on the block. A cream edge on near-cream paper is a border nobody sees;
                the ring reads because it sits OUTSIDE the shape, against the stage. A tender muscle
                wears the same ring in clay. */}
            {open || tender
              ? zone.blocks.map((b, i) => (
                  <View
                    key={`halo${i}`}
                    pointerEvents="none"
                    style={[
                      styles.halo,
                      tender && styles.haloTender,
                      {
                        left: u(b.x) - 4,
                        top: u(b.y) - 4,
                        width: u(b.w) + 8,
                        height: u(b.h) + 8,
                        borderRadius: u(b.r) + 4,
                      },
                    ]}
                  />
                ))
              : null}
            {zone.blocks.map((b, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityState={{ selected: open }}
                // The label the list used to be: the muscle, and where it stands right now.
                accessibilityLabel={t('ob.mapZone', {
                  muscle: t(`muscle.${zone.muscle}`),
                  stance: t(`ob.stance${stance[0].toUpperCase()}${stance.slice(1)}`),
                })}
                onPress={() => onPressMuscle(zone.muscle)}
                // The arms are 25 art-units wide. Slop carries every zone past the 44pt floor.
                hitSlop={12}
                style={[
                  styles.block,
                  {
                    left: u(b.x),
                    top: u(b.y),
                    width: u(b.w),
                    height: u(b.h),
                    borderRadius: u(b.r),
                  },
                  stance === 'off' ? styles.blockOff : stance === 'emphasis' ? styles.blockLead : styles.blockNormal,
                  open && styles.blockOpen,
                  // CLAY WINS. Where it hurts is the one fact this screen is asking for.
                  tender && styles.blockTender,
                ]}
              >
                {/* The struck check sits on ONE block of a paired muscle — a mark, not a pattern. */}
                {stance === 'emphasis' && !tender && i === zone.blocks.length - 1 ? (
                  <View style={[styles.leadBadge, { width: u(17), height: u(17), borderRadius: u(8.5) }]}>
                    <Icon name="check" size={Math.max(8, u(9))} color={color.onAccent} strokeWidth={3.4} />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </React.Fragment>
        );
      })}

      {/* THE LEADERS. Only two things ever earn one: the muscle being edited, and a LEAD. Anything
          more and the figure becomes a diagram of itself. */}
      {zones.map((zone) => {
        const tender = tenderMuscle === zone.muscle;
        const stance = hideStances ? 'normal' : stanceOf(zone.muscle);
        const open = openMuscle === zone.muscle;
        if (!tender && !open && stance !== 'emphasis') return null;
        const text = tender
          ? t(`muscle.${zone.muscle}`)
          : open
            ? t('ob.mapEditing')
            : `${t(`muscle.${zone.muscle}`)} · ${t('ob.stanceEmphasis')}`;
        return (
          <Leader
            key={`l${zone.muscle}`}
            side={zone.label.side}
            top={u(zone.label.y)}
            text={text}
            tone={tender ? 'clay' : open ? 'ink' : 'moss'}
            unit={u}
          />
        );
      })}
    </View>
  );
}

/** A label at the board's edge with a short rule running toward its muscle. */
function Leader({
  side,
  top,
  text,
  tone,
  unit,
}: {
  side: 'start' | 'end';
  top: number;
  text: string;
  tone: 'ink' | 'moss' | 'clay';
  unit: (n: number) => number;
}) {
  const stroke = tone === 'moss' ? signal[0] : tone === 'clay' ? color.alert : color.textPrimary;
  const rule = <View style={[styles.rule, { width: unit(14), backgroundColor: stroke }]} />;
  return (
    <View
      pointerEvents="none"
      style={[styles.leader, side === 'start' ? { start: 0 } : { end: 0 }, { top }]}
    >
      {side === 'end' ? rule : null}
      <Text
        style={[
          styles.leaderText,
          { color: stroke, fontFamily: monoCanDraw(text) ? font.monoMedium : font.sansMedium }, // rtl-ok: merged onto leaderText, which sets textAlign
        ]}
        numberOfLines={1}
      >
        {text.toUpperCase()}
      </Text>
      {side === 'start' ? rule : null}
    </View>
  );
}

/** The moss-tinted paper a LEAD muscle is cut from — paper[2] with the signal washed through it. */
const LEAD_PAPER = '#e0e8d6';

const styles = StyleSheet.create({
  board: { position: 'relative', alignSelf: 'center' },
  head: { position: 'absolute', backgroundColor: paper[2], borderWidth: 1, borderColor: color.border },
  block: { position: 'absolute' },
  // NORMAL sits on paper — the ground the whole map is measured from.
  blockNormal: { backgroundColor: paper[2], borderWidth: 1, borderColor: color.border },
  // OFF recedes into the dark. It is not greyed-out paper: it is paper that is no longer there.
  blockOff: { backgroundColor: color.fillSubtle, borderWidth: 1, borderStyle: 'dashed', borderColor: color.borderStrong },
  // LEAD lifts — moss-tinted paper inside a moss edge.
  blockLead: { backgroundColor: LEAD_PAPER, borderWidth: 1.5, borderColor: signal[0] },
  // The muscle whose sheet is open is EDGED, never re-coloured — its stance must still read.
  blockOpen: { borderWidth: 2, borderColor: color.textPrimary },
  halo: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(241,238,229,0.28)' },
  haloTender: { borderColor: color.alert },
  // CLAY — the one alarm tone in the product, and it is not an alarm: it is where it hurts.
  blockTender: { backgroundColor: color.alertWash, borderWidth: 2, borderColor: color.alert },
  leadBadge: {
    position: 'absolute',
    top: -7,
    end: -7,
    backgroundColor: signal[0],
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  leader: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 3 },
  rule: { height: 1 },
  leaderText: { fontSize: 14, letterSpacing: trackingPx(10, tracking.tight), textAlign: 'left' },
});
