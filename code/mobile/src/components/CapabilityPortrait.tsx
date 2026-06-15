/**
 * Capability Portrait bars (spec §4.8; UX §2, §7.4, §8.2/§8.3).
 *
 * Five horizontal bars, each scaled to that capability's own standard. NO
 * numeric labels — meaning is name + length + position only. A still-learning
 * capability renders the word "still learning" instead of a developed bar
 * (§2.10). Bars draw in sequentially, top to bottom; under Reduce Motion they
 * appear fully drawn (§8.2). Compare fades in week-one ghost bars in place.
 *
 * VoiceOver reads each capability and its relative state in words, never as raw
 * bar values (§8.3).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, AccessibilityInfo, type LayoutChangeEvent } from 'react-native';
import type { Capability, PortraitSnapshot } from '@/data/local/models';
import {
  CAPABILITY_ORDER,
  barFraction,
  capabilityNameKey,
  isStillLearning,
  strongestConfident,
  laggingConfident,
} from '@/domain/portrait';
import { useCopy } from '@/i18n/useCopy';
import { color, type as typo } from '@/design/tokens';

const BAR_HEIGHT = 10;
const DRAW_MS = 420;
const STAGGER_MS = 120;

interface Props {
  snapshot: PortraitSnapshot;
  baseline?: PortraitSnapshot | null;
  showCompare?: boolean;
  animate?: boolean; // sequential draw-in (unlock + first revisit reveal)
}

export function CapabilityPortrait({ snapshot, baseline, showCompare, animate }: Props) {
  const { t } = useCopy();
  const [trackW, setTrackW] = useState(0);
  const fills = useRef<Record<Capability, Animated.Value>>(
    Object.fromEntries(CAPABILITY_ORDER.map((c) => [c, new Animated.Value(0)])) as Record<Capability, Animated.Value>,
  ).current;

  const strongest = strongestConfident(snapshot);
  const lagging = laggingConfident(snapshot);

  useEffect(() => {
    if (trackW <= 0) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      CAPABILITY_ORDER.forEach((c, i) => {
        const target = barFraction(snapshot, c) * trackW;
        if (!animate || reduced) {
          fills[c].setValue(target);
        } else {
          fills[c].setValue(0);
          Animated.timing(fills[c], {
            toValue: target,
            duration: DRAW_MS,
            delay: i * STAGGER_MS,
            useNativeDriver: false,
          }).start();
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [trackW, snapshot, animate, fills]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== trackW) setTrackW(w);
  };

  return (
    <View>
      {CAPABILITY_ORDER.map((c) => {
        const learning = isStillLearning(snapshot, c);
        const a11yState =
          c === strongest ? t('portrait.stateStrongest')
          : c === lagging ? t('portrait.stateFourth')
          : learning ? t('portrait.stillLearning')
          : '';
        return (
          <View
            key={c}
            style={styles.row}
            accessible
            accessibilityLabel={`${t(capabilityNameKey(c))}${a11yState ? `, ${a11yState}` : ''}`}
          >
            <Text style={styles.label}>{t(capabilityNameKey(c))}</Text>
            {learning ? (
              <Text style={styles.stillLearning}>{t('portrait.stillLearning')}</Text>
            ) : (
              <View style={styles.track} onLayout={onTrackLayout}>
                {showCompare && baseline ? (
                  <View
                    style={[styles.ghost, { width: barFraction(baseline, c) * trackW }]}
                    pointerEvents="none"
                  />
                ) : null}
                <Animated.View style={[styles.fill, { width: fills[c] }]} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 20 },
  label: { color: color.textSecondary, fontSize: typo.bodyM.size, marginBottom: 8 },
  track: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, backgroundColor: color.bgSurface, justifyContent: 'center' },
  fill: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, backgroundColor: color.textPrimary },
  ghost: {
    position: 'absolute',
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.textTertiary,
  },
  stillLearning: { color: color.textTertiary, fontSize: typo.bodyM.size, fontStyle: 'italic' },
});
