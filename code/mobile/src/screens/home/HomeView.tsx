/**
 * HomeView — the pure presentational Home (HUSH_BUILD_SPEC §4.7 training day /
 * §4.8 rest day). Top row: quiet date + hamburger → Profile. Training day centers
 * the workout title with a SlideToStart control; rest day centers "Rest." The
 * container (Home.tsx) wires state + navigation; the web preview feeds fixtures.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SlideToStart } from '@/components/SlideToStart';
import { AppTabBar } from '@/components/AppTabBar';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { a11y, color, space, press, heroTitle, tabBar } from '@/design/tokens';

export interface HomeViewProps {
  resting: boolean;
  dayName: string | null; // workout name (training day)
  muscles: string; // "Chest · Shoulders · Triceps"
  greetingPart: 'morning' | 'afternoon' | 'evening';
  name: string | null;
  trainedThisWeek: number; // rest-day subtitle count
  startError: boolean;
  dateLabel: string; // "Jun 17"
  onStart: () => void;
  onProfile: () => void;
}

export function HomeView(props: HomeViewProps) {
  const { t } = useCopy();
  const insets = useSafeAreaInsets();
  const greeting = props.name
    ? t('home.greetingNamed', { part: t(`home.${props.greetingPart}`), name: props.name })
    : t('home.greeting', { part: t(`home.${props.greetingPart}`) });

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* Top row: date (left) · hamburger → Profile (right). */}
        <View style={styles.top}>
          <Text style={styles.date}>{props.dateLabel}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            hitSlop={10}
            onPress={props.onProfile}
            style={({ pressed }) => [styles.menu, { opacity: pressed ? press.opacity : 1 }]}
          >
            <Icon name="menu" size={21} color={color.textPrimary} strokeWidth={2} />
          </Pressable>
        </View>

        {props.resting ? (
          <View style={styles.restCenter}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.restTitle} accessibilityRole="header">{t('home.restTitle')}</Text>
            <Text style={styles.meta}>{t('home.restSub', { count: props.trainedThisWeek })}</Text>
          </View>
        ) : (
          <>
            {/* Title block centred at ~30% from top (prototype Screen 06). */}
            <View style={styles.trainTop} />
            <View style={styles.trainCenter}>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text
                style={styles.name}
                accessibilityRole="header"
                allowFontScaling
                maxFontSizeMultiplier={a11y.titleMaxScale}
              >
                {props.dayName}
              </Text>
              {props.muscles ? <Text style={styles.muscles}>{props.muscles}</Text> : null}
            </View>
            {/* SlideToStart sits just above the tab bar (clears its height + safe inset). */}
            <View style={[styles.action, { paddingBottom: insets.bottom + tabBar.height + 16 }]}>
              {props.startError ? <Text style={styles.error}>{t('errors.general')}</Text> : null}
              {props.dayName ? <SlideToStart label={t('home.slideToStart')} onStart={props.onStart} /> : null}
            </View>
          </>
        )}
      </SafeAreaView>
      <AppTabBar active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.gutter,
    paddingTop: 10,
  },
  date: { fontSize: 15, color: color.textSecondary },
  menu: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center', marginRight: -10 },

  // Training day: title block centred at ~30% from top, action pinned above the tab bar.
  trainTop: { height: '22%' },
  trainCenter: { paddingHorizontal: space.gutter, alignItems: 'center' },
  greeting: { fontSize: 14, color: color.textSecondary, marginBottom: 24, textAlign: 'center' },
  name: { ...heroTitle(52), color: color.textPrimary, fontSize: 52, lineHeight: 52, fontWeight: '700', textAlign: 'center' },
  muscles: { marginTop: 18, fontSize: 14, color: color.textSecondary, textAlign: 'center' },
  action: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.gutter },
  error: { color: color.textSecondary, fontSize: 14, marginBottom: 16, textAlign: 'center' },

  // Rest day: everything centered.
  restCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter },
  restTitle: { ...heroTitle(62), color: color.textPrimary, fontSize: 62, fontWeight: '700' },
  meta: { marginTop: 16, fontSize: 14, color: color.textSecondary, textAlign: 'center' },
});
