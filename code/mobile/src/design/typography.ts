/**
 * Typography wiring for the Hush instrument theme.
 *
 * The design has two voices loaded as separate font files per weight (Google
 * Fonts substitutes). Because each weight is its OWN family, `fontWeight` alone
 * cannot select the right file — callers must set `fontFamily`. These helpers
 * map a numeric/string weight to the correct loaded family, and install a global
 * default so every unstyled <Text>/<TextInput> renders in Hanken Grotesk rather
 * than the system font.
 */
import { Text, TextInput, type TextStyle } from 'react-native';
import { font } from './tokens';

type W = TextStyle['fontWeight'];

/** Map a weight to the matching Hanken Grotesk family file. */
export function sansFamily(weight?: W): string {
  switch (weight) {
    case '700':
    case 'bold':
      return font.sansBold;
    case '600':
      return font.sansSemibold;
    case '500':
      return font.sansMedium;
    default:
      return font.sans;
  }
}

/** Map a weight to the matching JetBrains Mono family file. */
export function monoFamily(weight?: W): string {
  switch (weight) {
    case '700':
    case 'bold':
    case '600':
      return font.monoSemibold;
    case '500':
      return font.monoMedium;
    default:
      return font.mono;
  }
}

/**
 * Make every <Text>/<TextInput> default to Hanken Grotesk regular. Components
 * that need a specific weight/voice set `fontFamily` explicitly (via the helpers
 * above) — this only changes the otherwise-system fallback.
 */
export function installGlobalFontDefault(): void {
  const apply = (Comp: { defaultProps?: { style?: unknown } }) => {
    Comp.defaultProps = Comp.defaultProps || {};
    const prev = (Comp.defaultProps.style as object[] | object | undefined) ?? null;
    Comp.defaultProps.style = prev
      ? [{ fontFamily: font.sans }, prev]
      : { fontFamily: font.sans };
  };
  apply(Text as unknown as { defaultProps?: { style?: unknown } });
  apply(TextInput as unknown as { defaultProps?: { style?: unknown } });
}
