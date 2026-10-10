/**
 * ════ A FIGURE, SET AS ONE NUMBER (2026-09-29, the design audit) ════
 *
 * IBM Plex Mono gives every glyph a full em cell — the instrument's even rhythm, and the reason the
 * app measures in it. At display size that same cell turns a decimal point or a clock's colon into a
 * mark with half an em of air on each side: "4 . 2", "2 : 29", "$6 . 67" read as three marks, not
 * one number. `tracking.figure` could not fix it, because tracking moves every glyph alike.
 *
 * So the SEPARATORS — `.` `,` `:` — are set in the proportional sans at the same size and colour.
 * The digits keep their cells (columns still line up), and the point sits tight between them.
 *
 * ⚠️ Only figures. A word never comes through here — mono has no Hebrew (`monoCarriesNoWords`).
 */

//

import React from 'react';
import { Text, type TextProps } from 'react-native';
import { font } from '@/design/tokens';

const SEP = /([.,:])/;

/** The figure's text, with its separators set in the sans. A string with none comes back as is. */
export function opticalFigure(value: string | number, sepFamily: string = font.sansSemibold): React.ReactNode {
  const s = String(value);
  if (!SEP.test(s)) return s;
  return s
    .split(SEP)
    .filter((part) => part.length > 0)
    .map((part, i) =>
      part.length === 1 && SEP.test(part) ? (
        <Text key={i} style={{ fontFamily: sepFamily }}>
          {part}
        </Text>
      ) : (
        part
      ),
    );
}

/** A `Text` whose one child is a figure — `<Figure style={styles.hero}>{'42.5'}</Figure>`. */
export function Figure({ children, ...rest }: Omit<TextProps, 'children'> & { children: string | number }) {
  return <Text {...rest}>{opticalFigure(children)}</Text>;
}
