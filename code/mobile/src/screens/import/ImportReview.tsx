/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WE FOUND IN HER PROGRAMME — and the two words at the bottom.
 *
 * ⛔ FOUNDER, 2026-08-11: *"נצטרך שהמנוע לא יחתוך למתאמן וישמר לו את התוכנית ורק ינהל אותה."*
 *
 * This screen is the whole product decision made visible. Everything upstream of it refuses to fix
 * her week — `importedPlan` copies her set counts past F-1's ceiling, keeps her exercise order, and
 * leaves a muscle under MEV where she left it. All of that is only defensible if she is TOLD.
 *
 * So the screen is a report and a choice, in that order, and it is deliberately not a wizard:
 *
 *   · every finding is one line, in her language, naming the day or the muscle it is about;
 *   · a week with nothing wrong shows NO findings, because a report that always speaks is a report
 *     she learns to dismiss;
 *   · the two buttons say what they do. "Keep mine" is the primary, because it is her programme.
 *
 * ── WHY `onBalance` EXISTS AT ALL ──────────────────────────────────────────────────────────────
 * The founder's rule is that we never touch her week. The second button does not break it — it is
 * her ASKING us to, once, explicitly, having read what we found. That is a different act from the
 * engine deciding on its own, which is the thing that must never happen.
 *
 * ⚠️ PRESENTATIONAL ON PURPOSE. It takes findings and hands back a choice; it does not import, does
 * not call a model, does not write a programme. That is what makes the promise testable — the report
 * she sees is a pure function of what was found, and this file has nothing else in it to go wrong.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { color, font, space } from '@/design/tokens';
import { exerciseById } from '@/data/exercises';
import type { Finding } from '@/domain/importedPlan';
import type { ImportSuggestion } from '@/domain/importPrompt';

export interface ImportReviewProps {
  /** What she called it, if her sheet said. */
  title?: string | null;
  /** How many sessions and lifts came through — the one line that says "we read it". */
  sessionCount: number;
  liftCount: number;
  findings: Finding[];
  /**
   * ⛔ WHAT THE MODEL SAID ABOUT THE NAMES WE COULD NOT PLACE — computed on every import with a
   * leftover, verified against the catalogue, and until 2026-08-16 rendered by nobody. The call was
   * paid for and the answer discarded; `importPrompt` even says *"she taps to accept it"*, and the
   * tap did not exist.
   *
   * ⚠️ SHE DECIDES, ALWAYS. A verified id proves the lift EXISTS; it does not prove it is the one
   * she meant. Nothing here is applied on her behalf.
   */
  suggestions?: ImportSuggestion[];
  /** She accepted one: put that lift back in the session she wrote it in. */
  onAccept?: (name: string, exerciseId: string) => void;
  /** She keeps her week exactly as written. The engine will only ever manage the loads. */
  onKeep: () => void;
  /** She asks us — once, having read the report — to rebuild it as a Hush week. */
  onBalance: () => void;
  busy?: boolean;
}

/**
 * One finding, one sentence.
 *
 * ⚠️ THE SUBJECT IS RESOLVED TO A NAME SHE RECOGNISES. A finding about `bb_back_squat` must not read
 * `bb_back_squat` on screen — she wrote "Back Squat" and the catalogue calls it "Barbell Back
 * Squat". Muscles and day names come through as they are; only lift ids need translating.
 */
function sentenceFor(f: Finding, t: (k: string, v?: Record<string, unknown>) => string): string {
  const named = exerciseById(f.subject)?.name ?? f.subject;
  switch (f.kind) {
    case 'unmatched_lift':
      return t('import.findUnmatched', { name: f.subject });
    case 'sets_unstated':
      return t('import.findSetsUnstated', { name: f.subject, n: f.value });
    case 'session_over_hour':
      return t('import.findLongSession', { day: f.subject, min: f.value });
    case 'sets_above_ceiling':
      return t('import.findManySets', { name: named, n: f.value });
    case 'muscle_under_dose':
      return t('import.findUnderDose', { muscle: t(`muscle.${f.subject}`), n: f.value });
    case 'muscle_once_a_week':
      return t('import.findOnceAWeek', { muscle: t(`muscle.${f.subject}`) });
    default:
      return '';
  }
}

export function ImportReview(props: ImportReviewProps) {
  const { t } = useCopy();
  const { findings } = props;
  // Only the ones that name a lift we actually carry — a suggestion with neither is a "no idea",
  // and the finding above already told her we could not place it.
  const offers = (props.suggestions ?? []).filter((s) => s.id ?? s.alternative);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{props.title || t('import.reviewTitle')}</Text>
        <Text style={styles.read}>
          {t('import.reviewRead', { sessions: props.sessionCount, lifts: props.liftCount })}
        </Text>

        {findings.length === 0 ? (
          /*
           * ⛔ THE CLEAN CASE IS A SENTENCE, NOT AN EMPTY LIST. An athlete whose programme is already
           * sane must see that we read it and found nothing — otherwise the screen reads as a failure
           * to parse, and she backs out of the one flow that was working.
           */
          <Text style={styles.clean}>{t('import.reviewNothing')}</Text>
        ) : (
          <View style={styles.list}>
            <Text style={styles.lead}>{t('import.reviewFound', { n: findings.length })}</Text>
            {findings.map((f, i) => (
              <View key={`${f.kind}-${f.subject}-${i}`} style={styles.row}>
                <Text style={styles.dot}>·</Text>
                <Text style={styles.line}>{sentenceFor(f, t)}</Text>
              </View>
            ))}
          </View>
        )}

        {offers.length > 0 ? (
          <View style={styles.list}>
            <Text style={styles.lead}>{t('import.suggestLead', { n: offers.length })}</Text>
            {offers.map((s) => {
              const id = (s.id ?? s.alternative) as string;
              const named = exerciseById(id)?.name ?? id;
              return (
                <View key={s.name} style={styles.suggest}>
                  {/*
                    The two cases read differently on purpose. `id` means THIS IS OURS under another
                    name — nothing about her week changes except that we can now run it. `alternative`
                    means we do not carry hers and this is the nearest thing, which is a substitution
                    she is agreeing to, not a lookup.
                  */}
                  <Text style={styles.line}>
                    {s.id
                      ? t('import.suggestSame', { name: s.name, ours: named })
                      : t('import.suggestAlt', { name: s.name, ours: named })}
                  </Text>
                  {s.why ? <Text style={styles.why}>{s.why}</Text> : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    label={t('import.suggestAccept', { name: named })}
                    onPress={() => props.onAccept?.(s.name, id)}
                    disabled={props.busy}
                  />
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {/*
          ⛔ HERS IS THE PRIMARY, AND THAT IS THE PRODUCT SPEAKING. She arrived with a programme; the
          default action is that she leaves with it. Making "let us balance it" the bright button
          would be the app arguing with the coach who wrote it.
        */}
        <Button
          variant="primary"
          size="lg"
          block
          label={t('import.keepMine')}
          onPress={props.onKeep}
          disabled={props.busy}
        />
        <View style={styles.gap} />
        <Button
          variant="ghost"
          size="lg"
          block
          label={t('import.letUsBalance')}
          onPress={props.onBalance}
          disabled={props.busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  suggest: { gap: space.xs, paddingVertical: space.sm },
  why: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'left' },
  root: { flex: 1, backgroundColor: color.bg },
  body: { paddingHorizontal: space.gutter, paddingTop: 20, paddingBottom: 32 },
  /* The serif is the coach's voice — this screen is one person telling her what they read. */
  title: { fontFamily: font.serifMedium, fontSize: 26, color: color.textPrimary, lineHeight: 32 },
  /*
   * ⚠️ SANS, NOT MONO — and `monoCarriesNoWords` caught this on the first run. The mono voice is for
   * FIGURES, and IBM Plex Mono has no Hebrew glyphs at all, so a translated sentence set in it renders
   * as boxes for half the users. This line is a sentence that happens to contain two numbers.
   */
  read: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, marginTop: 10 },
  clean: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, marginTop: 24, lineHeight: 24 },
  lead: { fontFamily: font.sans, fontSize: 17, color: color.textDim, marginBottom: 12 },
  list: { marginTop: 24 },
  row: { flexDirection: 'row', marginBottom: 12 },
  dot: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, width: 14 },
  line: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, flex: 1, lineHeight: 24 },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 20 },
  gap: { height: 10 },
});

export default ImportReview;
