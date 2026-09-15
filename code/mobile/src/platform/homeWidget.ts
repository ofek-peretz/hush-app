/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE HOME-SCREEN WIDGET'S CONTENT — composed here, drawn there.
 *
 * The widget process cannot run JS, so this module does everything that needs the product's brain —
 * the week read, the done derivation, every localized word — and ships ONE finished snapshot
 * through the native bridge (`HushHomeWidgetModule` → App Group → `HushTodayWidget.swift`). The
 * widget draws strings and dots; it decides nothing. Same division as notifications: `tg()` bakes
 * the copy at write time, in her language and gender.
 *
 * ── WHAT THE WIDGET SAYS, AND WHAT IT REFUSES TO ────────────────────────────────────────────────
 *   · The NEXT workout of the week and its price ("Upper A · 5 תרגילים · 42 דק׳"), or the week's
 *     completion when it is behind her. The same derivation ProgramTab and Home use: a workout is
 *     done when a trained session since the week opened carries its id.
 *   · Never a trial meter, never a paywall, never a countdown — the home screen is the product's
 *     face, and A.14 took the countdown off Home itself for the same reason.
 *   · No plan yet (mid-onboarding) → no snapshot is written; the widget shows its quiet brand
 *     placeholder rather than an invented workout.
 *
 * Fire-and-forget at every call site (boot, a completed session, a rebuilt week): a widget that is
 * a session behind costs a glance; a save path waiting on a widget write would cost trust.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import { requireOptionalNativeModule } from 'expo-modules-core';
import { db } from '@/data/local/db';
import { loadWeekPlan } from '@/data/local/weekPlan';
import { coachWeek } from '@/domain/coachWeek';
import { tg } from '@/i18n';

interface HushHomeWidgetNative {
  setSnapshot(json: string): void;
}

const native = requireOptionalNativeModule<HushHomeWidgetNative>('HushHomeWidget');

/** The wire shape `HushTodayWidget.swift` decodes. Every string arrives finished. */
export interface WidgetSnapshot {
  title: string;
  sub: string;
  weekLabel: string;
  dots: boolean[];
  done: boolean;
}

/**
 * Pure composer — the derivation under test, free of storage and the bridge.
 * Null = nothing honest to say (no week yet): the caller writes nothing.
 */
export function composeWidgetSnapshot(
  workouts: { id: string; name: string; lifts: number; minutes: number }[],
  doneIds: string[],
): WidgetSnapshot | null {
  if (workouts.length === 0) return null;
  const dots = workouts.map((w) => doneIds.includes(w.id));
  const doneCount = dots.filter(Boolean).length;
  const next = workouts.find((w) => !doneIds.includes(w.id)) ?? null;
  const weekLabel = tg('widget.week', { done: doneCount, total: workouts.length });
  if (!next) {
    // The week is behind her. The dots are all lit and the title says the fact — no exhortation,
    // no "come back": the product does not talk her into training on the home screen either.
    return { title: tg('widget.weekDone'), sub: '', weekLabel, dots, done: true };
  }
  return {
    title: next.name,
    sub: tg('program.dayMeta', { exercises: next.lifts, min: next.minutes }),
    weekLabel,
    dots,
    done: false,
  };
}

/** Read the week, compose, and hand the snapshot to the widget. Safe anywhere; never throws. */
export async function updateHomeWidget(): Promise<void> {
  if (!native) return;
  try {
    const [plan, history, weekOpenMs] = await Promise.all([
      loadWeekPlan().catch(() => null),
      db.loadHistory().catch(() => []),
      db.loadWeekOpen().catch(() => null),
    ]);
    const workouts = coachWeek(plan);
    // The one done-derivation, exactly as Home and ProgramTab make it.
    const since = weekOpenMs ?? 0;
    const doneIds = history
      .filter((h) => Date.parse(h.startedAt) >= since && h.trained !== false)
      .map((h) => h.programDayId)
      .filter((id) => id.startsWith('coach_'));
    const snap = composeWidgetSnapshot(
      workouts.map((w) => ({ id: w.id, name: w.name, lifts: w.lifts, minutes: w.minutes })),
      doneIds,
    );
    if (snap) native.setSnapshot(JSON.stringify(snap));
  } catch {
    /* a stale widget costs a glance; nothing else may cost anything */
  }
}
