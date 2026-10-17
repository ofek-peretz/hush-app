/**
 * ════ THE COACH'S SAVED WEEKS (the coach track, 2026-09-17) ════
 *
 * A coach writes the same beginner's three days for the fifth time and wants the first four back.
 * Templates are that: a week saved by name from the pen (`שמירה כתבנית`), fifty at most (§6 —
 * the 51st is refused, and the screen counts toward it so the refusal is never a surprise).
 *
 * Here a tap unfolds the week so he can read it, and delete is one confirm away. APPLYING one is the
 * pen's own fourth door (`CoachWeekBuilder` → the doors) — the same list, where the trainee is known.
 */

//

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainParamList } from '@/app/navigation';
import { BottomSheet } from '@/components/BottomSheet';
import { Arrive, Button, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { color, font, radius } from '@/design/tokens';
import { exerciseDisplayName } from '@/data/exercises';
import { shortDate } from '@/domain/coachDesk';
import { coachDeleteTemplate, coachTemplates, type CoachTemplate, type CoachTrackError } from '@/platform/coachTrackClient';

/** §6: fifty templates per coach; the 51st answers `templates_full`. */
export const TEMPLATES_MAX = 50;

export interface CoachTemplatesViewProps {
  templates: CoachTemplate[] | null;
  error?: CoachTrackError | null;
  onDelete: (tpl: CoachTemplate) => void;
  onBack: () => void;
}

export function CoachTemplatesView(p: CoachTemplatesViewProps) {
  const { t } = useCopy();
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<CoachTemplate | null>(null);
  const list = p.templates ?? [];
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={p.onBack} hitSlop={12} style={styles.back}>
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
        <Arrive order={0}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('coachTrack.coach.templates.title')}</Text>
            <Text style={styles.count}>{`${list.length} / ${TEMPLATES_MAX}`}</Text>
          </View>
          {p.error ? (
            <Text style={styles.sub}>{t(`coachTrack.coach.error.${p.error}`, { defaultValue: t('coachTrack.coach.error.network') })}</Text>
          ) : null}
        </Arrive>
        <Arrive order={1}>
          {p.templates && list.length === 0 ? (
            <Text style={styles.empty}>{t('coachTrack.coach.templates.empty')}</Text>
          ) : null}
          {list.map((tpl) => {
            const unfolded = open === tpl.name;
            return (
              <View key={tpl.id ?? tpl.name} style={styles.card}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tpl.name}
                  onPress={() => setOpen(unfolded ? null : tpl.name)}
                  style={({ pressed }) => [styles.cardHead, pressed && styles.pressed]}
                >
                  <View style={styles.cardText}>
                    <Text style={styles.name}>{bidi(tpl.name)}</Text>
                    <Text style={styles.meta}>
                      {tpl.updatedAt
                        ? t('coachTrack.coach.templates.metaDated', { count: tpl.week.days.length, date: shortDate(tpl.updatedAt) })
                        : t('coachTrack.coach.pen.templateDays', { count: tpl.week.days.length })}
                    </Text>
                  </View>
                  <Icon name={unfolded ? 'chevronUp' : 'chevronDown'} size={18} color={color.textMuted} />
                </Pressable>
                {unfolded ? (
                  <View style={styles.days}>
                    {tpl.week.days.map((d, i) => (
                      <View key={`${d.name}-${i}`} style={styles.day}>
                        <Legend size={17} track={0.06}>{d.name}</Legend>
                        {d.lifts.map((l) => (
                          <View key={l.ex} style={styles.lift}>
                            <Text style={styles.liftName}>{bidi(exerciseDisplayName(l.ex))}</Text>
                            <Text style={styles.liftFigure}>{`${l.sets} × ${l.band[0]}–${l.band[1]}`}</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                    <Button variant="quiet" label={t('coachTrack.coach.templates.delete')} onPress={() => setConfirm(tpl)} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </Arrive>
      </ScrollView>
      {confirm ? (
        <BottomSheet onClose={() => setConfirm(null)}>
          <Text style={styles.confirmTitle}>{t('coachTrack.coach.templates.deleteTitle', { name: confirm.name })}</Text>
          <Button block variant="danger" label={t('coachTrack.coach.templates.deleteYes')} onPress={() => { p.onDelete(confirm); setConfirm(null); }} style={styles.confirmAct} />
          <Button block variant="ghost" label={t('common.cancel')} onPress={() => setConfirm(null)} />
        </BottomSheet>
      ) : null}
    </SafeAreaView>
  );
}

type Props = NativeStackScreenProps<MainParamList, 'CoachTemplates'>;

export function CoachTemplates({ navigation }: Props) {
  const [templates, setTemplates] = useState<CoachTemplate[] | null>(null);
  const [error, setError] = useState<CoachTrackError | null>(null);

  const load = useCallback(async () => {
    const r = await coachTemplates();
    if (r.ok) {
      setTemplates(r.value.templates);
      setError(null);
    } else {
      setError(r.error);
      setTemplates((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <CoachTemplatesView
      templates={templates}
      error={error}
      onDelete={(tpl) => {
        void coachDeleteTemplate(tpl.name).then((r) => {
          if (!r.ok) setError(r.error);
          void load();
        });
      }}
      onBack={() => navigation.goBack()}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  wrap: { padding: 20, paddingBottom: 48 },
  back: { alignSelf: 'flex-start', marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: font.serif, fontSize: 32, lineHeight: 40, color: color.textPrimary, textAlign: 'left' },
  count: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 18, color: color.textSecondary, textAlign: 'right' },
  sub: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textSecondary, textAlign: 'left', marginTop: 6 },
  empty: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, textAlign: 'left', marginTop: 18 },
  card: { marginTop: 12, backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  pressed: { backgroundColor: color.surface2 },
  cardText: { flex: 1, gap: 2 },
  name: { fontFamily: font.sansSemibold, fontSize: 18, color: color.textPrimary, textAlign: 'left' },
  meta: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'left' },
  days: { paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  day: { gap: 2 },
  lift: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: color.border },
  liftName: { flex: 1, fontFamily: font.sans, fontSize: 17, color: color.textPrimary, textAlign: 'left' },
  liftFigure: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 17, color: color.textSecondary, textAlign: 'right' },
  /* The UI face, not the coach's serif (design audit 2026-09-29): a sheet asking about an OPERATION is
     the app speaking — the same voice as the stage's end-workout sheet. The serif is the coach's. */
  confirmTitle: { fontFamily: font.sansSemibold, fontSize: 24, lineHeight: 31, color: color.textPrimary, textAlign: 'left', marginBottom: 8 },
  confirmAct: { marginTop: 12, marginBottom: 6 },
});
