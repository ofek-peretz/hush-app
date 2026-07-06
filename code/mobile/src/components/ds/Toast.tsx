/**
 * Toast — a lightweight, non-blocking confirmation that rises near the bottom of the screen and
 * fades away on its own. No scrim, no backdrop — it must not interrupt the workout flow (UX item
 * 6: "✓ We'll remember this weight next time"). Mount the provider once high in the tree; call
 * `useToast().show(message)` from anywhere.
 *
 * Optional ACTIONS (S4): a toast may carry up to two quiet text actions ("Try another" · "Undo").
 * An actionable toast stays up longer and is tappable — but only the toast itself; the rest of
 * the screen never loses a touch.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, font, press, radius, shadow, space, textScale, up } from '@/design/tokens';

const VISIBLE_MS = 2500;
const VISIBLE_ACTIONS_MS = 6000; // actionable toasts wait for a decision a little longer

export interface ToastAction {
  label: string;
  /** Runs, then the toast dismisses — unless the handler shows a follow-up toast. */
  onPress: () => void;
}

interface ToastOptions {
  actions?: ToastAction[];
}

interface ToastApi {
  show: (message: string, opts?: ToastOptions) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string; actions: ToastAction[]; nonce: number } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nonceRef = useRef(0);

  const show = useCallback((msg: string, opts?: ToastOptions) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    nonceRef.current += 1;
    setToast({ message: msg, actions: opts?.actions ?? [], nonce: nonceRef.current });
  }, []);

  // Animate in whenever a new message arrives, hold, then animate out.
  useEffect(() => {
    if (toast == null) return;
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
      ]).start(() => setToast((t) => (t?.nonce === toast.nonce ? null : t)));
    }, toast.actions.length ? VISIBLE_ACTIONS_MS : VISIBLE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [toast, reduced, opacity, translateY]);

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setToast(null);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {toast != null ? (
        <View
          pointerEvents={toast.actions.length ? 'box-none' : 'none'}
          style={[styles.host, { paddingBottom: insets.bottom + 28 }]}
        >
          <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]}>
            <Icon name="check" size={16} color={up[0]} strokeWidth={2.4} />
            <Text style={styles.text} numberOfLines={2}>{toast.message}</Text>
            {toast.actions.map((a) => (
              <Pressable
                key={a.label}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                hitSlop={8}
                onPress={() => {
                  dismiss();
                  a.onPress();
                }}
                style={({ pressed }) => [styles.action, pressed && { opacity: press.opacity }]}
              >
                <Text style={styles.actionLabel}>{a.label}</Text>
              </Pressable>
            ))}
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
  action: { paddingVertical: 4, paddingStart: 10 },
  actionLabel: { fontFamily: font.sansSemibold, fontSize: textScale.sm, color: color.accent },
});
