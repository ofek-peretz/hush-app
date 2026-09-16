/**
 * SegmentedControl — the primary choice control (units, language, sex, days/week).
 * A single decisive selection.
 *
 * ════ THE TRACK IS THE WELL; THE CHOICE RESTS IN IT ════ (v7, measured)
 *
 * Every segmented control in the handoff is drawn the same way, and it is the
 * opposite of what a light-era control does: the TRACK is the brighter tone
 * (`rgba(241,238,229,.10)`) and the SELECTED cell is the quieter one
 * (`rgba(241,238,229,.05)`) lifted by a faint *light* shadow — cream at .06, not a
 * dark drop. The choice reads as a cell that has settled INTO the rail rather than
 * a chip stuck on top of it. The selected label is full cream at 600; the rest sit
 * in shadow at 500.
 *
 * Three geometries. They began 1:1 from the handoff and TWO of its numbers have since been overruled
 * by laws the handoff predates — the type floor (17 everywhere) and the 44pt target — so the sizes
 * below are what the component draws now, not what the source file said:
 *  - `pill`  — radius 100, padding 3, 44pt cells, padX 14, 17px  (1.1's EN · עב switch, History's
 *              Lifts / Log switch)
 *  - `md`    — radius 16, padding 4, gap 4, 44pt cells, padX 16, 17px
 *  - `lg`    — radius 17, padding 4, gap 4, 52pt cells, padX 16, 17px  (1.2's SEX)
 */

// 

import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { color, space, font } from '@/design/tokens';

type Option = string | { value: string; label: string; icon?: React.ReactNode };

interface Props {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  block?: boolean;
  stack?: boolean; // vertical layout (onboarding goal / experience)
  size?: 'pill' | 'md' | 'lg';
  style?: ViewStyle | ViewStyle[];
}

/**
 * Track/cell geometry per size — read straight off the handoff's inline styles.
 *
 * ⛔ `font` OBEYS THE TYPE FLOOR (founder 2026-08-12). It was 12 / 14 / 15, and — like `Button`'s
 * size table — it is a bare number in a geometry map, so `typeHasAFloor` swept straight past it.
 * The control it dresses is the units toggle on the You tab: **"kg" and "lb" at 14px, on the screen
 * where she changes the unit every weight in the app is printed in.**
 *
 * ⚠️ THE OTHER NUMBERS HERE ARE NOT TYPE — `track` and `cell` are radii, `padX` is padding — which
 * is exactly why a law cannot sweep this file generically and has to name the key.
 *
 * ⛔ AND `pill` WAS A 35pt DOOR. It ran `height: 0, padY: 6` — 17pt of type in 12pt of padding —
 * with no `hitSlop` anywhere in the component to make up the difference. `md` and `lg` were already
 * 44 and 52; only the small one was small, and the small one is the **History screen's Lifts / Log
 * switch, the only navigation control on that screen.** A target under 44 is a control she has to
 * aim at, which is not a thing to ask of someone holding a phone at arm's length between sets.
 *
 * `minW` exists for the same reason in the other axis: "EN" is two characters, and two characters
 * plus 28pt of padding is a cell she can miss sideways.
 */
const GEOM = {
  pill: { track: 100, pad: 3, gap: 0, cell: 100, height: 44, padY: 0, padX: 14, font: 17, minW: 44 },
  md: { track: 16, pad: 4, gap: 4, cell: 12, height: 44, padY: 0, padX: 16, font: 17, minW: 44 },
  lg: { track: 17, pad: 4, gap: 4, cell: 13, height: 52, padY: 0, padX: 16, font: 17, minW: 52 },
} as const;

export function SegmentedControl({ options, value, onChange, block, stack, size = 'md', style }: Props) {
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const g = GEOM[size];
  return (
    <View
      style={[
        styles.track,
        { borderRadius: g.track, padding: g.pad, gap: g.gap },
        block && styles.block,
        stack && styles.trackStack,
        style,
      ]}
    >
      {norm.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[
              styles.item,
              { borderRadius: g.cell, paddingHorizontal: g.padX, paddingVertical: g.padY, minWidth: g.minW },
              g.height ? { height: g.height } : null,
              (block || stack) && styles.itemBlock,
              stack && styles.itemStack,
              active && styles.itemActive,
            ]}
          >
            {o.icon ? <View style={styles.icon}>{o.icon}</View> : null}
            <Text style={[styles.label, { fontSize: g.font }, active ? styles.labelActive : null]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // The rail is the BRIGHTER tone — see the header.
  track: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: color.surface2 },
  block: { alignSelf: 'stretch', width: '100%' },
  trackStack: { flexDirection: 'column', alignSelf: 'stretch', width: '100%' },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  icon: { alignItems: 'center', justifyContent: 'center' },
  itemBlock: { flex: 1 },
  itemStack: { flex: 0, alignItems: 'flex-start', justifyContent: 'center', width: '100%' },
  // The settled cell: the QUIETER fill, lifted by a faint light — `0 1px 3px rgba(241,238,229,.06)`.
  itemActive: {
    backgroundColor: color.fillSubtle,
    shadowColor: '#f1eee5',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { fontFamily: font.sansMedium, color: color.textMuted, textAlign: 'left' },
  labelActive: { fontFamily: font.sansSemibold, color: color.textPrimary, textAlign: 'left' },
});
