/**
 * Stage — the ground of every screen.
 *
 * ⛔ THE LIGHT IS OFF (founder 2026-08-05): *"take the blackish background to absolute black — I
 * think everything will stand out better that way."*
 *
 * This drew the v7 handoff's `linear-gradient(175deg, #1B1914, #131210, #0F0E0C)` as an SVG rect,
 * and the argument for it was real: v7's emphasis rule is "standing in the light versus resting in
 * shadow", which needs light to exist. But the light was falling on the GROUND, and the ground is
 * the one surface nothing is supposed to be read on. Every raised surface in the app is a cream
 * wash — 5%, 10%, 14% — and on absolute black each of those gains the contrast the gradient was
 * spending. **The depth did not come from the gradient; it came from the washes sitting on it.**
 *
 * So this is now a flat black fill and nothing more. It stays as a component rather than being
 * deleted at forty call sites, and because deleting it would leave those screens on
 * `color.bg` alone — which is the same black, but reached by a different route, and one ground
 * reached two ways is how two grounds start.
 *
 * ⚠️ THE GRADIENT ITSELF IS NOT DEAD. `stage.gradient` still dresses the two share cards, which
 * are pictures of a stage rather than the stage — see the note on the token.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { stage } from '@/design/tokens';

export function Stage() {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: stage[0] }]} />;
}
