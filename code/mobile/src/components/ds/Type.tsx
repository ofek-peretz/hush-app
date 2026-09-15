/**
 * Text primitives for the three v7 voices. Display/Title tiers are the COACH —
 * Frank Ruhl Libre serif, the voice the product speaks in. Body/Caption are the
 * INTERFACE — Assistant sans. Facts (mono) live in Metric/LoadDelta/Legend.
 * Sentence case everywhere (Legend handles the uppercase mono labels).
 */

// 

import React from 'react';
import { Text, StyleSheet, type TextProps, type TextStyle } from 'react-native';
import { color, font, ramp, rampLine, tracking, trackingPx } from '@/design/tokens';

type Tone = 'primary' | 'secondary' | 'muted' | 'faint' | 'accent';

const TONE: Record<Tone, string> = {
  primary: color.textPrimary,
  secondary: color.textSecondary,
  muted: color.textMuted,
  faint: color.textTertiary,
  accent: color.accentText,
};

interface BaseProps extends TextProps {
  tone?: Tone;
  center?: boolean;
  style?: TextStyle | TextStyle[];
  children: React.ReactNode;
}

function make(size: number, family: string, lineHeight: number, em: number, defaultTone: Tone = 'primary') {
  return function Component({ tone = defaultTone, center, style, children, ...rest }: BaseProps) {
    return (
      <Text
        {...rest}
        style={[
          { fontFamily: family, fontSize: size, lineHeight, letterSpacing: trackingPx(size, em), color: TONE[tone], textAlign: 'left' },
          center && stylesCenter,
          style,
        ]}
      >
        {children}
      </Text>
    );
  };
}

const stylesCenter: TextStyle = { textAlign: 'center' };

/*
 * ⛔ THESE ARE ON THE RAMP NOW, AND THE COMMENTS WERE LYING (2026-08-26).
 *
 * The trailing numbers read `// 44 / 30 / 24 / 17 / 15 / 13` — the sizes from before the type floor
 * rose. `textScale.base` and `textScale.sm` have BOTH resolved to 17 since then, so `Body` and
 * `Caption` were the same size, the same face and the same tracking, separated by four points of
 * leading. **The interface had no second text tier**, and two of these primitives were the same
 * primitive wearing two names.
 *
 * ⚠️ THE SECOND TIER IS TONE, NOT SIZE, AND IT HAS TO BE. Below 17 there is nothing (the founder's
 * floor, and he is right about the room this app is read in), so the last step down cannot be made
 * of points. `Caption` is the body size resting in shadow; `Body` stands in the light. That is this
 * product's emphasis rule everywhere else — distance from the ground, never a second hue — and it
 * is the rule here too.
 */
// Coach headlines (page/section) — Frank Ruhl Libre serif, calm and tight.
export const Display = make(ramp.title, font.serif, rampLine.title, tracking.display); // 40
export const TitleL = make(ramp.head, font.serif, rampLine.head, tracking.display); // 30
export const Title = make(ramp.subhead, font.serifMedium, rampLine.subhead, tracking.tight); // 24
// Interface body — Assistant sans, calm.
export const BodyL = make(ramp.lead, font.sans, rampLine.lead, tracking.normal); // 20
export const Body = make(ramp.body, font.sans, rampLine.body, tracking.normal); // 17
/** The body size, resting in shadow — the interface's secondary tier. See the note above. */
export const Caption = make(ramp.body, font.sans, rampLine.body, tracking.normal, 'muted'); // 17 muted

const _styles = StyleSheet.create({ _noop: {} });
void _styles;
