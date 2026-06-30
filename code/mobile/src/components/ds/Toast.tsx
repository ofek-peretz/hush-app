/**
 * Toast — a lightweight, non-blocking confirmation that rises near the bottom of the screen and
 * fades away on its own. No scrim, no backdrop, never intercepts a tap — it must not interrupt the
 * workout flow (UX item 6: "✓ We'll remember this weight next time"). Mount the provider once high
 * in the tree; call `useToast().show(message)` from anywhere.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, font, radius, shadow, space, textScale, up } from '@/design/tokens';

const VISIBLE_MS = 2500;

interface ToastApi {
  show: (message: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (msg: string) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setMessage(msg);
    },
    [],
  );

  // Animate in whenever a new message arrives, hold, then animate out.
  useEffect(() => {
    if (message == null) return;
    opacity.setValue(0);
    translateY.setValue(reduced ? 0 : 12);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: reduced ? 0 : 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: reduced ? 0 : 160, useNativeDriver: true }),
    ]).start();
    hideTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: reduced ? 0 : 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: reduced ? 0 : 12, duration: reduced ? 0 : 200, useNativeDriver: true }),
      ]).start(() => setMessage(null));
    }, VISIBLE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [message, reduced, opacity, translateY]);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {message != null ? (
        <View pointerEvents="none" style={[styles.host, { paddingBottom: insets.bottom + 28 }]}>
          <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]}>
            <Icon name="check" size={16} color={up[0]} strokeWidth={2.4} />
            <Text style={styles.text} numberOfLines={2}>{message}</Text>
          </Animated.View>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used within ToastProvider');
  return v;
}

const styles = StyleSheet.create({
  host: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: space.gutter },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    maxWidth: 420,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    ...shadow.lg,
  },
  text: { flexShrink: 1, fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textPrimary },
});
