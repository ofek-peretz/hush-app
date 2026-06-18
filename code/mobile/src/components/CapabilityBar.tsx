/**
 * CapabilityBar (spec §2.6.10, §4.26) — one movement-pattern row in the Portrait.
 * Label (textDim) over a relative-capability track (height 6, radius 3, bg #1A1A1A)
 * filled white to `fraction`. Optionally renders a ghost "then" bar behind for
 * Then·Now (§4.27). Still-learning rows show no fill and a quiet tag (clean
 * absence — never a fake bar).
 *
 * `fraction` is a RELATIVE score from the frozen model (domain/portrait.barFraction);
 * no absolute number is ever shown.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { color } from '@/design/tokens';

interface Props {
  label: string;
  fraction: number; // 0..1 (now)
  ghostFraction?: number; // 0..1 (then) — Then·Now only
  stillLearning?: boolean;
  stillLearningLabel?: string;
}

export function CapabilityBar({ label, fraction, ghostFraction, stillLearning, stillLearningLabel }: Props) {
  const pct = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%` as const;
  const ghostPct =
    ghostFraction != null ? (`${Math.round(Math.max(0, Math.min(1, ghostFraction)) * 100)}%` as const) : null;
  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {stillLearning && stillLearningLabel ? <Text style={styles.learning}>{stillLearningLabel}</Text> : null}
      </View>
      <View style={styles.track}>
        {ghostPct ? <View style={[styles.ghost, { width: ghostPct }]} /> : null}
        {!stillLearning ? <View style={[styles.fill, { width: pct }]} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 26 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 },
  label: { fontSize: 13, color: color.textDim },
  learning: { fontSize: 12, color: color.textTertiary },
  track: { height: 6, borderRadius: 3, backgroundColor: '#1A1A1A', overflow: 'hidden', justifyContent: 'center' },
  ghost: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#3A3A3C', borderRadius: 3 },
  fill: { height: 6, borderRadius: 3, backgroundColor: color.textPrimary },
});
