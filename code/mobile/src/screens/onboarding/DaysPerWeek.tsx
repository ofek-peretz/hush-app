/**
 * 4.5 Days per week — frequency 2–6 (default 4). A real vertical wheel: drag or
 * flick to spin, snaps to the centered value, which renders large + white while
 * neighbours fade (one step dim, two steps dimmer). Tapping a value spins to it.
 * Continue → Program Created (assembles the full inputs).
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Eyebrow } from '@/components/Eyebrow';
import { useCopy } from '@/i18n/useCopy';
import { color, space, heroNum, tnum } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'DaysPerWeek'>;

const DAYS = [2, 3, 4, 5, 6];
const DEFAULT_INDEX = 2; // value 4
const ITEM_HEIGHT = 56;
const VISIBLE = 5; // rows in the wheel viewport

export function DaysPerWeek({ navigation, route }: Props) {
  const { t } = useCopy();
  const { profile, goal } = route.params;
  const [index, setIndex] = useState(DEFAULT_INDEX);
  const scrollRef = useRef<ScrollView>(null);
  const days = DAYS[index];

  // Live-update the selection as the wheel spins (so the big number tracks the
  // finger), then settle on the snapped row.
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.min(Math.max(i, 0), DAYS.length - 1);
    setIndex((prev) => (prev === clamped ? prev : clamped));
  }, []);

  function spinTo(i: number) {
    scrollRef.current?.scrollTo({ y: i * ITEM_HEIGHT, animated: true });
    setIndex(i);
  }

  function onContinue() {
    navigation.navigate('ProgramCreated', {
      inputs: {
        goal,
        daysPerWeek: days,
        units: 'kg',
        healthConnected: profile.healthConnected,
        age: profile.age,
        sex: profile.sex,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
      },
    });
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Eyebrow label={t('daysPerWeek.eyebrow')} size={16} trackingPx={1.5} align="center" style={styles.eyebrow} />
        <View style={styles.wheel}>
          {/* The per-step dimming (white → #6A6A6E → #46464A) is what sells the wheel
              curvature; a true edge gradient needs a gradient lib (infra build). */}
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            scrollEventThrottle={16}
            onScroll={onScroll}
            contentOffset={{ x: 0, y: DEFAULT_INDEX * ITEM_HEIGHT }}
            contentContainerStyle={styles.content}
            accessibilityRole="adjustable"
            accessibilityLabel={t('daysPerWeek.eyebrow')}
            accessibilityValue={{ text: `${days}` }}
          >
            {DAYS.map((n, i) => {
              const dist = Math.abs(i - index);
              const tint = dist === 0 ? color.textPrimary : dist === 1 ? '#6A6A6E' : '#46464A';
              const selected = dist === 0;
              return (
                <Pressable
                  key={n}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => spinTo(i)}
                  style={styles.item}
                >
                  <Text style={[styles.num, selected ? styles.selected : styles.idle, { color: tint }]}>{n}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
      <View style={styles.actions}>
        <PrimaryButton variant="compact" label={t('daysPerWeek.continue')} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.gutter },
  eyebrow: { marginBottom: 30, color: color.textSecondary },
  wheel: { height: ITEM_HEIGHT * VISIBLE, alignSelf: 'stretch', justifyContent: 'center' },
  // Pad so the first/last value can rest at the vertical centre of the viewport.
  content: { paddingVertical: ITEM_HEIGHT * ((VISIBLE - 1) / 2) },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  num: { ...tnum, textAlign: 'center' },
  selected: { ...heroNum(48, -0.02), fontSize: 48, fontWeight: '600' },
  idle: { fontSize: 26, fontWeight: '500' },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 40 },
});
