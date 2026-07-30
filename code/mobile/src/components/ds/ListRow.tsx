/**
 * ListRow — 1:1 from the design `components/layout/ListRow.jsx`.
 * The workhorse of Hush's lists (program workouts, session exercises, history,
 * settings). Leading slot (index / icon / avatar), title + optional quiet
 * subtitle, trailing slot (delta / badge / control), optional chevron. Hairline
 * divider between rows; `last` removes it.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { color, font, textScale, tracking, trackingPx, up } from '@/design/tokens';
import { Icon } from '@/components/Icon';

interface Props {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  index?: number;
  done?: boolean;
  trailing?: React.ReactNode;
  chevron?: boolean;
  muted?: boolean;
  inset?: boolean;
  last?: boolean;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
}

export function ListRow({
  title,
  subtitle,
  leading,
  index,
  done = false,
  trailing,
  chevron = false,
  muted = false,
  inset = false,
  last = false,
  onPress,
  style,
}: Props) {
  let lead = leading;
  if (lead == null && index != null) {
    lead = (
      <View style={[styles.idx, done && styles.idxDone]}>
        {done ? (
          // Dark ink on the LIT moss disc. On the dark stage the done-disc is lit moss (up.stage);
          // a dark tick reads on it where the old white tick would wash out.
          <Icon name="check" size={15} color={color.onAccent} strokeWidth={2.4} />
        ) : (
          <Text style={styles.idxText}>{index}</Text>
        )}
      </View>
    );
  }

  const body = (
    <>
      {lead != null ? <View style={styles.lead}>{lead}</View> : null}
      <View style={styles.bodyCol}>
        <Text numberOfLines={1} style={[styles.title, muted && styles.titleMuted]}>
          {title}
        </Text>
        {subtitle != null ? (
          <Text numberOfLines={1} style={styles.sub}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing != null ? <View style={styles.trail}>{trailing}</View> : null}
      {chevron ? (
        <View style={styles.chev}>
          <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />
        </View>
      ) : null}
    </>
  );

  const rowStyle: ViewStyle[] = [styles.row, inset && styles.inset, last && styles.last, style].filter(
    Boolean,
  ) as ViewStyle[];

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [...rowStyle, pressed && styles.pressed]}>
        {body}
      </Pressable>
    );
  }
  return <View style={rowStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  inset: { paddingHorizontal: 16 },
  last: { borderBottomWidth: 0 },
  // A.13 — a wash under the row, never a fade of the row: at 0.55 a pressed row is a DISABLED row.
  pressed: { backgroundColor: color.fillSubtle },
  lead: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  idx: {
    width: 28,
    height: 28,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.border,
  },
  // DONE IS SAGE (founder 2026-07-13: "why is a completed workout a BLACK tick? green is our
  // colour for something that is finished"). The black square was the heaviest mark on the week's
  // list and it said nothing — ink is the product's structural colour, not its verdict.
  idxDone: { backgroundColor: up.stage, borderColor: up.stage },
  idxText: { fontFamily: font.mono, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  bodyCol: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    fontFamily: font.sansMedium,
    fontSize: textScale.base,
    color: color.textPrimary,
    letterSpacing: trackingPx(textScale.base, tracking.tight),
    textAlign: 'left',
  },
  titleMuted: { color: color.textSecondary },
  sub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  trail: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  chev: { flexShrink: 0 },
});
