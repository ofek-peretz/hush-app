/**
 * AppTabBar — the navigation-connected TabBar (spec §3 IA). Rendered as an
 * overlay by each of the four tab-root screens (Home · Program · History ·
 * Portrait). Tapping a tab navigates to that root; React Navigation dedupes by
 * name so switching pops to an existing instance rather than stacking duplicates.
 *
 * `TAB_BAR_SPACE` is the bottom inset a scroll container should reserve so
 * content clears the (absolutely-positioned) bar.
 */
import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TabBar, type TabKey } from '@/components/TabBar';
import { tabBar } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

/** Reserve ≥ bar height + a little breathing room (safe-area added by the bar itself). */
export const TAB_BAR_SPACE = tabBar.height + 24;

const ROUTE: Record<TabKey, keyof MainParamList> = {
  home: 'Home',
  program: 'Program',
  history: 'History',
  portrait: 'Portrait',
};

export function AppTabBar({ active }: { active: TabKey }) {
  const navigation = useNavigation<NativeStackNavigationProp<MainParamList>>();
  return (
    <TabBar
      active={active}
      onPress={(tab) => {
        if (tab === active) return;
        navigation.navigate(ROUTE[tab] as never);
      }}
    />
  );
}
