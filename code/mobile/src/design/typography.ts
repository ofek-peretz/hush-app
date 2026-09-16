/**
 * Typography wiring for the Hush instrument theme.
 *
 * The design has two voices loaded as separate font files per weight (Google
 * Fonts substitutes). Because each weight is its OWN family, `fontWeight` alone
 * cannot select the right file — callers must set `fontFamily`. This installs a
 * global default so every unstyled <Text>/<TextInput> renders in Hanken Grotesk
 * rather than the system font.
 */

// 

import { Text, TextInput } from 'react-native';
import { font } from './tokens';

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
      ? [{ fontFamily: font.sans, textAlign: 'left' }, prev]
      : { fontFamily: font.sans, textAlign: 'left' };
  };
  apply(Text as unknown as { defaultProps?: { style?: unknown } });
  apply(TextInput as unknown as { defaultProps?: { style?: unknown } });
}
