/**
 * ════ THE CREW, ON TODAY'S WEEK ROW (prototype, 2026-09-29) ════
 *
 * Founder, 2026-09-29: *"תחשוב בדיוק איפה לשלב את זה במסכים … כך שתמקסם את חווית השיתופיות"* — and,
 * pressed on it: *"ראית ממש בעיניים שלך איך ואיפה זה ישתלב?"*
 *
 * Walked on the real Today at 393 × 852 first: the lifts list already meets the fold, so a crew
 * STRIP between the week and the day would push the one thing Today is for below it. The week's
 * own count row ("1 מתוך 3 אימונים") is full-width with its far side empty — the one seat on the
 * screen that costs no height. The crew sits there: faces, overlapped, a moss ring on whoever has
 * trained today, and the words for it beside them. The whole group is one door to the crew tab.
 *
 * No crew yet → one dashed "+" — the feature exists, in the smallest mark that can say so.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, font, signal } from '@/design/tokens';

export interface CrewFace {
  name: string;
  /** Trained today — the moss ring. */
  today: boolean;
}

const SIZE = 30;
const SHOWN = 4;

export function CrewStack({ faces, onPress }: { faces: CrewFace[] | null; onPress: () => void }) {
  const { t } = useCopy();
  const trainedToday = (faces ?? []).filter((f) => f.today);
  const label = !faces || faces.length === 0
    ? t('crew.invite')
    : trainedToday.length > 0
      ? t('crew.trainedToday', { count: trainedToday.length })
      : t('crew.title');
  // Who trained today leads the stack — they are the news.
  const shown = [...(faces ?? [])].sort((a, b) => Number(b.today) - Number(a.today)).slice(0, SHOWN);
  const more = (faces?.length ?? 0) - shown.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
    >
      {trainedToday.length > 0 ? <Text style={styles.caption}>{t('crew.trainedToday', { count: trainedToday.length })}</Text> : null}
      <View style={styles.stack}>
        {shown.length === 0 ? (
          /* A dashed "+" alone read as "add a workout" on the one screen about workouts (walked
             2026-09-29) — the word says whom it adds. */
          <View style={styles.addPill}>
            <Icon name="plus" size={13} color={color.textSecondary} strokeWidth={2} />
            <Text style={styles.addText}>{t('crew.addFriend')}</Text>
          </View>
        ) : (
          shown.map((f, i) => (
            /* Earlier faces sit ON TOP (they are the ones who trained today — sorted first), so an
               overlap never cuts a moss ring. */
            <View key={`${f.name}-${i}`} style={[styles.ring, f.today && styles.ringToday, i > 0 && styles.overlap, { zIndex: SHOWN - i }]}>
              <Avatar name={f.name} size={SIZE} />
            </View>
          ))
        )}
        {more > 0 ? (
          <View style={[styles.ring, styles.overlap]}>
            <View style={styles.more}>
              <Text style={styles.moreText}>{`+${more}`}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, paddingVertical: 2, paddingHorizontal: 2 },
  pressed: { backgroundColor: 'rgba(241,238,229,0.06)' },
  caption: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: signal[0], textAlign: 'right' },
  stack: { flexDirection: 'row', alignItems: 'center' },
  /* A 2 pt ring in the page's own black separates the overlapped faces; moss says "trained today". */
  ring: { borderRadius: (SIZE + 4) / 2, borderWidth: 2, borderColor: color.bg },
  ringToday: { borderColor: signal[0] },
  overlap: { marginStart: -7 },
  add: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(241,238,229,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 16,
    /* Solid and quiet, not dashed (design audit 2026-09-29): a dashed edge read as unfinished — a
       placeholder — on the first line of the screen she opens every day. */
    backgroundColor: color.fillSubtle,
  },
  addText: { fontFamily: font.sans, fontSize: 17, lineHeight: 20, color: color.textSecondary, textAlign: 'center' },
  more: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: color.fillSubtle, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontFamily: font.sansMedium, fontSize: 17, lineHeight: 20, color: color.textSecondary, textAlign: 'center' },
});
