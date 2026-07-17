/**
 * SegmentedControl — the primary choice control (units, language, days/week).
 * A single decisive selection.
 *
 * ════ THE CHOICE LIFTS ════ (2026-07-17, and this reverses a ruling — read on)
 *
 * The selected segment is `color.lift` — white — on a `fillSubtle` well. A settled
 * choice is a fact, and facts are not coloured; the chosen one is simply the thing
 * closest to the athlete.
 *
 * **This is the second time this has been tried.** The first (pre-2026-07-13) put a
 * white card on a grey track and it FAILED on a device: the language switch on the
 * front door "hid from the eye", and the founder replaced it with the ochre fill.
 * That rejection was right, and the diagnosis was wrong. The card did not hide
 * because white-on-grey cannot work — it hid because THE PAGE WAS ALREADY WHITE:
 *
 *     old   card #ffffff vs page #fbfaf8  =   4.3 points of luminance
 *     new   lift #ffffff vs ground #e8e5e0 = 21.4 points   ← 5×
 *
 * Nothing can lift off a surface that is already at 95.7%. The ochre was a bandage
 * on an upside-down ladder (see `paper` in tokens.ts), treating the symptom of a
 * bug the founder himself found on 2026-07-17. With the ground at 78.6% the
 * original cure works, five times harder than it could before.
 *
 * The track needs no border: it is a well, and a well is already separated by tone.
 * That is the same law the stage has always used.
 *
 * ⚠️ THIS ONE WANTS THE FOUNDER'S EYE ON A DEVICE. It is the only element being
 * restored after a device rejection. Look at the language switch on the sign-in
 * first. If it hides again, the reasoning above is wrong and the fill comes back.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, control, space, font, textScale, shadow } from '@/design/tokens';

type Option = string | { value: string; label: string; icon?: React.ReactNode };

interface Props {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  block?: boolean;
  stack?: boolean; // vertical layout (onboarding goal / experience)
  size?: 'md' | 'lg';
  style?: ViewStyle | ViewStyle[];
}

export function SegmentedControl({ options, value, onChange, block, stack, size = 'md', style }: Props) {
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const minH = (size === 'lg' ? control.hLg : control.h) - 6;
  return (
    <View style={[styles.track, block && styles.block, stack && styles.trackStack, style]}>
      {norm.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.item, { minHeight: minH }, (block || stack) && styles.itemBlock, stack && styles.itemStack, active && styles.itemActive]}
          >
            {o.icon ? <View style={styles.icon}>{o.icon}</View> : null}
            <Text
              style={[
                styles.label,
                { fontSize: size === 'lg' ? textScale.base : textScale.sm },
                active ? styles.labelActive : null,
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    // A well. Separated from the ground by tone — no border. See the header.
    backgroundColor: color.fillSubtle,
    borderRadius: radius.md,
    padding: 3,
    gap: 2,
  },
  block: { alignSelf: 'stretch', width: '100%' },
  trackStack: { flexDirection: 'column', alignSelf: 'stretch', width: '100%' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    borderRadius: radius.sm,
  },
  icon: { alignItems: 'center', justifyContent: 'center' },
  itemBlock: { flex: 1 },
  itemStack: { flex: 0, alignItems: 'flex-start', justifyContent: 'center', width: '100%' },
  // 21.4 points above the ground, 29.6 above its own track. It cannot hide.
  itemActive: { backgroundColor: color.lift, ...(shadow.md as object) },
  label: { fontFamily: font.sansMedium, color: color.textSecondary, textAlign: 'left' },
  // Ink on white: 17.5:1. The old cream-on-ochre was 2.6:1.
  labelActive: { fontFamily: font.sansSemibold, color: color.textPrimary, textAlign: 'left' },
});
