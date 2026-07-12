/**
 * Text primitives for the instrument voice. Sans (Hanken Grotesk) for what the
 * product SAYS; the mono voice lives in Metric/LoadDelta. Display/Title are tight
 * (-0.022em); Body/Caption are calm. Sentence case everywhere (Legend handles
 * the uppercase instrument labels).
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

// Display tiers (page/section) — bold + tight.
export const Display = make(textScale['4xl'], font.sansBold, 52, tracking.display); // 48
export const TitleL = make(textScale['2xl'], font.sansSemibold, 38, tracking.display); // 30
export const Title = make(textScale.xl, font.sansSemibold, 30, tracking.tight); // 24
// Body tiers — calm, regular/medium.
export const BodyL = make(textScale.md, font.sans, 24, tracking.normal); // 17
export const Body = make(textScale.base, font.sans, 22, tracking.normal); // 15
export const Caption = make(textScale.sm, font.sans, 18, tracking.normal); // 13

const _styles = StyleSheet.create({ _noop: {} });
void _styles;
