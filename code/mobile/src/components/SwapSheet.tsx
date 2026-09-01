/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE STATION IS TAKEN — HERE ARE HER OPTIONS.
 *
 * ⛔ FOUNDER, 2026-08-16: *"שלחיצת swap לא ישר מעביר לתרגיל דומה אלא מציג 3 אופציות לבחירה והמתאמן
 * יכול ממש לקבוע לו את האופציות האלה."* And in the same breath, the bar: *"רק תוודא שאכן החלופות
 * הגיוניות ושזה לא יציע סתם אופציות."*
 *
 * ── WHAT THIS REPLACES, AND WHY THE OLD ONE WAS DEFENSIBLE ──────────────────────────────────────
 * The one-tap ladder (S4): tap Swap and Hush decides, with "Another option" in a toast. It was built
 * on a real principle — *the athlete never evaluates a list mid-workout* — and that principle is
 * still right about a LOAD. It is wrong about a busy station, because there the athlete already has
 * information Hush does not: she is standing in the gym and can see which of the three is free.
 * Handing her one answer meant she tapped "Another option" until it named the machine she was
 * looking at, which is a list with the labels hidden.
 *
 * ── ⛔ WHY THE MENU IS NOT ALWAYS THREE ──────────────────────────────────────────────────────────
 * `swapChoices` caps at three and never pads to three, and that measurement is in `domain/swapPool`:
 * 49 of 111 lifts do not HAVE three true synonyms, so a fixed three would fill the last rows with a
 * different movement — for a cable kickback, a hip thrust. This sheet therefore draws what it is
 * given, one to three rows, and LABELS each one: a true synonym says "the same movement", and
 * anything else says plainly that it trains the muscle a different way. An honest third option is
 * worth offering when the rack is occupied (S-20); a third option dressed as a peer is a lie.
 *
 * ── WHERE "SHE DEFINES THE OPTIONS" HAPPENS ─────────────────────────────────────────────────────
 * NOT here, and that is deliberate. Two doors, two verbs:
 *
 *   · **Mid-workout she CHOOSES**, and the engine learns from it — `foldSessionSwaps` adopts a lift
 *     she picked twice as a standing substitute (S-69), and `swapCandidates` then leads with it.
 *     Nothing to press, nothing to maintain, and it is earned rather than declared.
 *   · **In the library she DECLARES** — her picks per muscle, her refusals, her backup for a lift.
 *     That is a decision made with time to think, which is the only kind worth typing.
 *
 * Putting a "save this as my default" control on a sheet she opened because a machine was busy would
 * ask her to make a standing decision while someone waits for the rack.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Legend, Button, Arrive } from '@/components/ds';
import { SHEET_SETTLE } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { exerciseDisplayName } from '@/data/exercises';
import { bidi } from '@/i18n/bidi';
import { color, font, stage, radius } from '@/design/tokens';
import type { SwapChoice } from '@/domain/swapPool';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { MotionThumb } from '@/motion/render/MotionThumb';
import type { FigureSex } from '@/motion/types';

export interface SwapSheetProps {
  /** The lift whose station is taken — the head of the question. */
  currentName: string;
  /** What `swapChoices` returned: one to three, already ordered, never padded. */
  choices: readonly SwapChoice[];
  /**
   * ⛔ THE TWO FACTS A SWAP IS DECIDED ON (design review 2026-09-01): what it LOOKS like, and what
   * it would WEIGH. Three names with "אותה תנועה" under each were three rows the athlete could not
   * tell apart. `weightFor` reads the session's own target table (the exact load a pick would
   * prescribe — never invented); null draws no figure, which is the honest state for a resumed
   * session that runs without a table.
   */
  weightFor?: (exerciseId: string) => number | null;
  units?: 'kg' | 'lb';
  figure?: FigureSex;
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}

export function SwapSheet(props: SwapSheetProps) {
  const { t } = useCopy();
  return (
    <BottomSheet onClose={props.onClose}>
      {/* ✦ IT ARRIVES, after the sheet does (2026-08-27). Two beats: what she is replacing, then
          what she may replace it with. The choices land together — they are peers, and numbering
          them would rank them. */}
      <Arrive order={0} after={SHEET_SETTLE}>
        <Legend style={styles.legend}>{t('swap.title')}</Legend>
        <Text style={styles.current} numberOfLines={1}>{bidi(props.currentName)}</Text>
        <Text style={styles.body}>{t('swap.body')}</Text>
      </Arrive>

      <View style={styles.rows}>
        {props.choices.map((c) => (
          <Pressable
            key={c.exercise.id}
            accessibilityRole="button"
            accessibilityLabel={exerciseDisplayName(c.exercise.id)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => props.onPick(c.exercise.id)}
          >
            {/* The clip, at the 56-point floor a clip can be read at — the same still the plan
                sheet draws, so "what does this one look like" is answered before a tap. */}
            <View style={styles.rowThumb}>
              <MotionThumb exerciseId={c.exercise.id} size={56} figure={props.figure} tone="stage" />
            </View>
            <View style={styles.rowText}>
              {/* The DISPLAY name — the catalog's raw `.name` is English, and this sheet is the
                  athlete choosing a replacement mid-workout (eye-pass 2026-08-26). */}
              <Text style={styles.rowName} numberOfLines={1}>{bidi(exerciseDisplayName(c.exercise.id))}</Text>
              {/*
                ⛔ THE HONEST LABEL. `sameMovement` is the whole reason this sheet can show a third
                option at all — see the header. A row that is not a synonym says so in its own line
                rather than being ranked below one and left to look like the same kind of thing.
              */}
              <Text style={[styles.rowNote, !c.sameMovement && styles.rowNoteOther]}>
                {c.sameMovement
                  ? t('swap.sameMovement', { equipment: t(`equipment.${c.exercise.equipment}`, { defaultValue: c.exercise.equipment }) })
                  : t('swap.differentWay')}
              </Text>
            </View>
            {(() => {
              const w = props.weightFor?.(c.exercise.id) ?? null;
              const shown = w != null ? displayWeight(w, props.units ?? 'kg') : null;
              return shown != null ? (
                <Text style={styles.rowWeight}>
                  {shown}
                  <Text style={styles.rowWeightUnit}> {unitLabel(props.units ?? 'kg')}</Text>
                </Text>
              ) : null;
            })()}
            <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />
          </Pressable>
        ))}
      </View>

      <Button variant="ghost" block label={t('swap.close')} onPress={props.onClose} style={styles.close} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  legend: { marginBottom: 10, textAlign: 'left' },
  current: { fontFamily: font.serif, fontSize: 27, lineHeight: 31, color: stage.ink0, textAlign: 'left' },
  body: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: stage.ink2, marginTop: 8, textAlign: 'left' },

  rows: { marginTop: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,238,229,0.10)',
  },
  // ⛔ A PRESS CHANGES THE SURFACE, NEVER THE CONTENT — a wash UNDER the row, not a dimmed row.
  // `aPressNeverDimsWhatYouPressed` caught an `opacity: 0.6` here on the first build of this sheet;
  // a word at 60% does not read as "pressed", it reads as disabled.
  rowPressed: { backgroundColor: color.fillSubtle },
  rowThumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: color.surface2, overflow: 'hidden' },
  rowText: { flex: 1, minWidth: 0 },
  rowWeight: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 19, color: stage.ink0, textAlign: 'left' },
  rowWeightUnit: { fontFamily: font.mono, fontSize: 17, color: stage.ink2 }, // rtl-ok: nested span
  rowName: { fontFamily: font.sans, fontSize: 19, lineHeight: 23, color: stage.ink0, textAlign: 'left' },
  rowNote: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: stage.ink2, marginTop: 2, textAlign: 'left' },
  // A different movement is not a worse row — it is a different KIND of row, and reads as one.
  rowNoteOther: { color: color.textTertiary },

  close: { marginTop: 22 },
});
