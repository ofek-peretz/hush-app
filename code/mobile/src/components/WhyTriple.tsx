/**
 * WhyTriple — the v4 explanation pattern, rebuilt 1:1 from the Claude Design
 * `components/data/WhyTriple.jsx` + the app-kit `WhyTriple` in `ui_kits/app/v4.jsx`.
 *
 * Every decision Hush makes unfolds into three lines, always this order —
 * Observation → Conclusion → Action, labelled "What I saw / What it means /
 * What I did". Always past tense, always first person: Hush already did the
 * thing. A connected spine (vertical rail + three ring dots) makes the three
 * read as one recognizable unit. The Action line takes the change's tone:
 * sage (up) / clay (down) / ochre (swap).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useCopy } from '@/i18n/useCopy';
import { color, font, textScale, tracking, trackingPx, up, down, stage as stageC } from '@/design/tokens';

export type WhyKind = 'up' | 'down' | 'swap' | 'neutral';

interface Props {
  saw: string;
  means: string;
  did: string;
  kind?: WhyKind;
  onStage?: boolean;
}

// v7 (2026-07-22): the triple always sits on the dark stage now (the Saturday letter, the
// session read-back), so the tone marks take the LIT variants — `up[0]`/`down[0]` are the paper
// tones, near-invisible on the dark. Moss for a rise, clay for a match-down, moss accent for a swap.
function toneColor(kind: WhyKind): string {
  return kind === 'up' ? up.stage : kind === 'down' ? down.stage : kind === 'swap' ? color.accentText : color.textPrimary;
}

export function WhyTriple({ saw, means, did, kind = 'neutral', onStage = false }: Props) {
  const { t } = useCopy();
  const act = toneColor(kind);
  const label = onStage ? stageC.ink2 : color.textMuted;
  const body = onStage ? stageC.ink1 : color.textSecondary;
  const bodyStrong = onStage ? stageC.ink0 : color.textPrimary;
  const spine = onStage ? stageC[2] : color.borderStrong;
  const dotBg = onStage ? stageC[0] : color.bg;

  const rows = [
    { label: t('weekly.observation'), value: saw, strong: false },
    { label: t('weekly.conclusion'), value: means, strong: false },
    { label: t('weekly.action'), value: did, strong: true },
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.spine, { backgroundColor: spine }]} />
      {rows.map((r, i) => (
        <View key={i} style={[styles.row, i > 0 && styles.rowGap]}>
          <View style={[styles.dot, { borderColor: r.strong ? act : spine, backgroundColor: dotBg }]}>
            {r.strong ? <View style={[styles.dotFill, { backgroundColor: act }]} /> : null}
          </View>
          <Text style={[styles.k, { color: r.strong ? act : label }, r.strong && styles.kStrong]}>{r.label.toUpperCase()}</Text>
          <Text style={[styles.v, { color: r.strong ? bodyStrong : body }]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', paddingStart: 22 },
  spine: { position: 'absolute', start: 4, top: 7, bottom: 7, width: 1.5, opacity: 0.7 },
  row: { position: 'relative' },
  rowGap: { marginTop: 16 },
  dot: { position: 'absolute', start: -22, top: 3, width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5 },
  dotFill: { position: 'absolute', top: 1.5, left: 1.5, right: 1.5, bottom: 1.5, borderRadius: 3 },
  k: { fontFamily: font.sansMedium, fontSize: 10.5, letterSpacing: trackingPx(10.5, tracking.legend), textTransform: 'uppercase', marginBottom: 4, textAlign: 'left' },
  kStrong: { fontFamily: font.sansSemibold, textAlign: 'left' },
  v: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22, textAlign: 'left' },
});
