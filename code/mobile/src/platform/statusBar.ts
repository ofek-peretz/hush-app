/**
 * Status-bar style, scoped to screen focus.
 *
 * `expo-status-bar` sets the style imperatively and does NOT restore the prior
 * style on unmount — so a "stage" screen (light glyphs on the inverted surface)
 * would leave the paper screen it returns to with invisible glyphs. This hook
 * applies `style` while the screen is focused and restores the app default
 * ('dark') on blur. It re-applies when `style` changes, so a screen with both a
 * paper phase and a stage phase (e.g. Cardio) can drive it from local state.
 */
import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';

export function useFocusedStatusBar(style: 'light' | 'dark'): void {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style);
      return () => setStatusBarStyle('dark');
    }, [style]),
  );
}
