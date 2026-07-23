/**
 * Text primitives for the three v7 voices. Display/Title tiers are the COACH —
 * Frank Ruhl Libre serif, the voice the product speaks in. Body/Caption are the
 * INTERFACE — Assistant sans. Facts (mono) live in Metric/LoadDelta/Legend.
 * Sentence case everywhere (Legend handles the uppercase mono labels).
 */
import React from 'react';
import { Text, StyleSheet, type TextProps, type TextStyle } from 'react-native';
import { color, font, textScale, tracking, trackingPx } from '@/design/tokens';

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

function make(size: number, family: string, lineHeight: number, em: number) {
  return function Component({ tone = 'primary', center, style, children, ...rest }: BaseProps) {
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

// Coach headlines (page/section) — Frank Ruhl Libre serif, calm and tight.
export const Display = make(textScale['4xl'], font.serif, 46, tracking.display); // 44
export const TitleL = make(textScale['2xl'], font.serif, 36, tracking.display); // 30
export const Title = make(textScale.xl, font.serifMedium, 30, tracking.tight); // 24
// Interface body — Assistant sans, calm.
export const BodyL = make(textScale.md, font.sans, 26, tracking.normal); // 17
export const Body = make(textScale.base, font.sans, 23, tracking.normal); // 15
export const Caption = make(textScale.sm, font.sans, 19, tracking.normal); // 13

const _styles = StyleSheet.create({ _noop: {} });
void _styles;
