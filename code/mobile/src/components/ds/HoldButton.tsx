/**
 * HoldButton — an action that must be MEANT.
 *
 * Founder 2026-07-12: "Finish & save" sat under Resume as plain text on the run-pause
 * screen. Quiet is right — we do not want a finish button competing for the thumb — but a
 * quiet button is still a one-tap button, and one stray tap ends a 10 km run. That is the
 * kind of event that gets an app deleted.
 *
 * So the finish is not a tap: it is a HOLD. The label says so, the fill sweeps left to
 * right over the hold, the wrist gets the slow warning texture the moment the press starts,
 * and only a hold that reaches the end fires. Letting go early cancels, visibly and
 * instantly — no accidental commit is possible, and no confirmation dialog is needed either
 * (a dialog just moves the stray tap one screen along).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, StyleSheet, Animated, Easing, type ViewStyle } from 'react-native';
import { color, radius, control, font, textScale, tracking, trackingPx, stage as stageC, signal } from '@/design/tokens';
import * as haptics from '@/platform/haptics';

interface Props {
  label: string;
  onComplete: () => void;
  /** How long the athlete must hold. Long enough to be deliberate, short enough not to nag. */
  durationMs?: number;
  /** Render on the inverted stage (the run/workout surfaces). */
  onStage?: boolean;
  block?: boolean;
  leading?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export const HOLD_MS = 1600;

export function HoldButton({ label, onComplete, durationMs = HOLD_MS, onStage = false, block, leading, style }: Props) {
  const fill = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const fired = useRef(false);
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  const cancel = useCallback(() => {
    anim.current?.stop();
    setHolding(false);
    Animated.timing(fill, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [fill]);

  const start = useCallback(() => {
    if (fired.current) return;
    setHolding(true);
    // The body is told immediately that something unusual is underway — the slow, heavy
    // warning texture, never the crisp success one.
    haptics.warning();
    fill.setValue(0);
    anim.current = Animated.timing(fill, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: false, // width is a layout prop
    });
    anim.current.start(({ finished }) => {
      if (!finished || fired.current) return;
      fired.current = true;
      haptics.success();
      onComplete();
    });
  }, [durationMs, fill, onComplete]);

  useEffect(() => () => anim.current?.stop(), []);

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={start}
      onPressOut={cancel}
      style={[styles.base, onStage ? styles.baseStage : styles.basePaper, block && styles.block, style]}
    >
      {/* the sweep — the hold made visible */}
      <Animated.View style={[styles.fill, onStage ? styles.fillStage : styles.fillPaper, { width }]} />
      <View style={styles.content} pointerEvents="none">
        {leading}
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            onStage ? styles.labelStage : styles.labelPaper,
            // The label inks UP as the hold commits — in the tone of the surface it is on. A
            // single shared "holding" colour would have turned a paper HoldButton's label
            // near-white on near-white, i.e. invisible exactly while it matters most.
            holding && (onStage ? styles.labelHoldingStage : styles.labelHoldingPaper),
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: control.hLg,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  basePaper: { borderColor: color.borderControl, backgroundColor: 'transparent' },
  baseStage: { borderColor: stageC[2], backgroundColor: 'transparent' },
  block: { alignSelf: 'stretch', width: '100%' },
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0 },
  fillPaper: { backgroundColor: signal.wash },
  fillStage: { backgroundColor: signal[1], opacity: 0.35 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: {
    fontFamily: font.sansSemibold,
    fontSize: textScale.base,
    letterSpacing: trackingPx(textScale.base, tracking.tight),
  },
  labelPaper: { color: color.textSecondary },
  labelStage: { color: stageC.ink1 },
  labelHoldingPaper: { color: color.textPrimary },
  labelHoldingStage: { color: stageC.ink0 },
});
