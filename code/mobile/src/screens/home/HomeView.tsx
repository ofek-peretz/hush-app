/**
 * HomeView — the pure presentational Home, rebuilt to the hush_iphone_v1 prototype
 * Start screen (§3.1):
 *  - top-left: live date + greeting (morning/afternoon/evening)
 *  - top-center: a pull handle — the navigation menu (Program · History · Settings)
 *    slides DOWN from the top (founder direction: replaces the hamburger). Opens on
 *    tap or a downward swipe on the header.
 *  - top-right: "Choose workout" pill → a full-screen list (each workout + its
 *    muscle groups). Tapping one swaps the Home workout immediately, no confirm.
 *  - center: workout name (large, bold) + muscle groups.
 *  - bottom: the start control — same pill design as before, but a TAP starts it
 *    (the slide gate was dropped; dragging still works).
 *
 * Rest day centers "Rest." The container (Home.tsx) wires state + navigation.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { SlideToStart } from '@/components/SlideToStart';
import { MenuSheet } from '@/components/MenuSheet';
import { Icon } from '@/components/Icon';
import { Divider05 } from '@/components/Divider05';
import { useCopy } from '@/i18n/useCopy';
import { a11y, color, space, press, heroTitle, s } from '@/design/tokens';

export interface HomeWorkoutOption {
  id: string;
  name: string;
  muscles: string;
}

export interface HomeViewProps {
  resting: boolean;
  dayName: string | null; // workout name (training day)
  muscles: string; // "Chest · Shoulders · Triceps"
  greetingPart: 'morning' | 'afternoon' | 'evening';
  name: string | null;
  trainedThisWeek: number; // rest-day subtitle count
  startError: boolean;
  dateLabel: string; // "Fri, 19 Jun"
  onStart: () => void;
  // Choose-workout: the week's workouts + the picker callback (swaps Home's workout).
  workouts: HomeWorkoutOption[];
  onChooseWorkout: (id: string) => void;
  // Menu destinations (slide-down menu; the Tab Bar / hamburger are gone).
  onProgram: () => void;
  onHistory: () => void;
  onSettings: () => void;
}

export function HomeView(props: HomeViewProps) {
  const { t } = useCopy();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const greeting = props.name
    ? t('home.greetingNamed', { part: t(`home.${props.greetingPart}`), name: props.name })
    : t('home.greeting', { part: t(`home.${props.greetingPart}`) });

  // Each menu pick dismisses the sheet first, then navigates.
  const pick = (go: () => void) => () => {
    setMenuOpen(false);
    go();
  };

  // A downward swipe on the header opens the menu (it slides down from the top).
  // Activates only after a real downward drag, so taps on the pill/handle still fire.
  const openMenu = () => setMenuOpen(true);
  const pullDown = Gesture.Pan()
    .activeOffsetY(14)
    .failOffsetY(-14)
    .onEnd((e) => {
      if (e.translationY > 36) runOnJS(openMenu)();
    });

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <GestureDetector gesture={pullDown}>
          <View style={styles.top}>
            <View style={styles.topLeft}>
              <Text style={styles.date}>{props.dateLabel}</Text>
              <Text style={styles.greeting}>{greeting}</Text>
            </View>

            {/* Center pull handle — taps (or a downward swipe) open the slide-down menu. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('menu.title')}
              hitSlop={12}
              onPress={openMenu}
              style={({ pressed }) => [styles.handle, { opacity: pressed ? press.opacity : 1 }]}
            >
              <Icon name="chevronDown" size={22} color={color.textSecondary} strokeWidth={2} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('choose.title')}
              hitSlop={8}
              onPress={() => setChooseOpen(true)}
              style={({ pressed }) => [styles.choose, { opacity: pressed ? press.opacity : 1 }]}
            >
              <Text style={styles.chooseText}>{t('choose.button')}</Text>
            </Pressable>
          </View>
        </GestureDetector>

        {props.resting ? (
          <View style={styles.restCenter}>
            <Text style={styles.greetingCenter}>{greeting}</Text>
            <Text style={styles.restTitle} accessibilityRole="header">{t('home.restTitle')}</Text>
            <Text style={styles.meta}>{t('home.restSub', { count: props.trainedThisWeek })}</Text>
          </View>
        ) : (
          <>
            <View style={styles.trainTop} />
            <View style={styles.trainCenter}>
              <Text
                style={styles.name}
                accessibilityRole="header"
                allowFontScaling
                maxFontSizeMultiplier={a11y.titleMaxScale}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {props.dayName}
              </Text>
              {props.muscles ? <Text style={styles.muscles}>{props.muscles}</Text> : null}
            </View>
            <View style={[styles.action, { paddingBottom: insets.bottom + 28 }]}>
              {props.startError ? <Text style={styles.error}>{t('errors.general')}</Text> : null}
              {props.dayName ? <SlideToStart label={t('home.slideToStart')} onStart={props.onStart} /> : null}
            </View>
          </>
        )}
      </SafeAreaView>

      {/* Choose-workout: full-screen near-opaque list, each row = name + muscles. */}
      {chooseOpen ? (
        <View style={styles.overlay}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.overlaySafe}>
            <View style={styles.overlayHead}>
              <Text style={styles.overlayTitle} accessibilityRole="header">{t('choose.title')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                hitSlop={12}
                onPress={() => setChooseOpen(false)}
                style={({ pressed }) => [styles.overlayClose, { opacity: pressed ? press.opacity : 1 }]}
              >
                <Icon name="close" size={22} color={color.textSecondary} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.overlayList}>
              {props.workouts.map((w) => (
                <Pressable
                  key={w.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${w.name}. ${w.muscles}`}
                  onPress={() => {
                    props.onChooseWorkout(w.id);
                    setChooseOpen(false);
                  }}
                  style={({ pressed }) => [styles.ovItem, { opacity: pressed ? press.opacity : 1 }]}
                >
                  <Text style={styles.ovName}>{w.name}</Text>
                  {w.muscles ? <Text style={styles.ovMuscles}>{w.muscles}</Text> : null}
                  <View style={styles.ovDivider}><Divider05 /></View>
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      ) : null}

      {menuOpen ? (
        <MenuSheet
          onClose={() => setMenuOpen(false)}
          onProgram={pick(props.onProgram)}
          onHistory={pick(props.onHistory)}
          onSettings={pick(props.onSettings)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: space.gutter,
    paddingTop: 12,
  },
  topLeft: { flex: 1 },
  date: { fontSize: s(13), color: color.textSecondary },
  greeting: { fontSize: s(13), color: color.textTertiary, marginTop: 2 },
  handle: { width: 56, height: 30, alignItems: 'center', justifyContent: 'center', marginTop: -2 },
  choose: {
    backgroundColor: color.fillSubtleStrong,
    borderRadius: s(13),
    paddingVertical: s(7),
    paddingHorizontal: s(12),
  },
  chooseText: { fontSize: s(13), color: color.textPrimary, fontWeight: '500' },

  // Training day: title block centred at ~30% from top, action pinned near bottom.
  trainTop: { height: '20%' },
  trainCenter: { paddingHorizontal: space.gutter, alignItems: 'center' },
  name: { ...heroTitle(s(40)), color: color.textPrimary, fontSize: s(40), lineHeight: s(46), fontWeight: '700', textAlign: 'center' },
  muscles: { marginTop: s(14), fontSize: s(14), color: color.textSecondary, textAlign: 'center' },
  action: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.gutter },
  error: { color: color.textSecondary, fontSize: s(14), marginBottom: s(16), textAlign: 'center' },

  // Rest day
  restCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter },
  greetingCenter: { fontSize: s(14), color: color.textSecondary, marginBottom: s(24), textAlign: 'center' },
  restTitle: { ...heroTitle(s(62)), color: color.textPrimary, fontSize: s(62), lineHeight: s(68), fontWeight: '700' },
  meta: { marginTop: s(16), fontSize: s(14), color: color.textSecondary, textAlign: 'center' },

  // Choose-workout overlay
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.97)' },
  overlaySafe: { flex: 1, paddingHorizontal: space.gutter },
  overlayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14 },
  overlayTitle: { ...heroTitle(s(20)), fontSize: s(20), fontWeight: '700', color: color.textPrimary },
  overlayClose: { width: 40, height: 40, alignItems: 'flex-end', justifyContent: 'center' },
  overlayList: { paddingTop: 18, paddingBottom: 24 },
  ovItem: { paddingVertical: s(14) },
  ovName: { fontSize: s(18), fontWeight: '600', color: color.textPrimary },
  ovMuscles: { fontSize: s(13), color: color.textSecondary, marginTop: s(3) },
  ovDivider: { marginTop: s(14) },
});
