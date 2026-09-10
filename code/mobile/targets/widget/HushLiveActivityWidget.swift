import ActivityKit
import SwiftUI
import WidgetKit

// The Hush Live Activities (Lock Screen + Dynamic Island): strength session + cardio.
//
// Visual source of truth: the app's design tokens (design/tokens.ts) under v7
// (All Dark · One Lit Stage) — the warm near-black stage, cream ink, a single MOSS
// accent (ochre is retired app-wide), monospaced digits for every measured number.
// JetBrains Mono is not bundled in this extension, so measured numbers use the
// sanctioned fallback: monospaced system digits.
//
// The widget extension's deployment target is iOS 17.0 (expo-target.config.js), so
// ActivityKit, Live Activities and interactive intents are unconditionally available here — no
// `@available` guards / `if #available` (those were a result-builder hazard and are unnecessary).
//
// ════ THE LOCK SCREEN IS A CONTROL (founder, 2026-09-08) ════ The §8.5 read-only contract is
// retired by his hand: the card and the island carry the three verbs a thumb has on the stage —
// log the set as written, +15 s, start the next set — as App Intents (`HushLockIntents.swift`),
// so a set is logged and a rest is shortened or stretched WITHOUT opening the phone. The
// extension is iOS 17 now (`Button(intent:)`). During rest the TIMER is
// the hero, driven by the absolute `restEndDate` via `Text(timerInterval:)`; during
// an active set the exercise name is the hero. Strength never shows heart rate /
// calories / progress ring / streak; cardio legitimately shows pace / HR / calories
// (recorded, never coached).

// MARK: - Tokens (matches the app's design tokens)
private enum HX {
  static let stage = Color(red: 0.075, green: 0.071, blue: 0.063) // stage[0] #131210
  static let ink0 = Color(red: 0.945, green: 0.933, blue: 0.898) // cream[0] #f1eee5
  static let ink1 = Color(red: 0.788, green: 0.769, blue: 0.706) // secondary cream on the card #c9c4b4
  static let ink2 = Color(red: 0.545, green: 0.518, blue: 0.455) // cream[2] #8b8474
  static let accent = Color(red: 0.663, green: 0.769, blue: 0.624) // lit moss #a9c49f — the live/rest accent
}

/// THE RANGE MARK — the brand's glyph, drawn: a hairline spanning two end ticks.
///
/// v7 6.1/6.2 put this, not an SF Symbol, in the Dynamic Island's compact leading and at the head
/// of the lock-screen card. A dumbbell glyph is a picture of a gym; the mark is what Hush actually
/// is — a measured range — and it is the same glyph the tab bar and the wordmark strike.
private struct RangeMark: View {
  var width: CGFloat = 15
  var height: CGFloat = 8
  var tint: Color = HX.accent
  private var bar: CGFloat { 1.5 }
  var body: some View {
    ZStack(alignment: .leading) {
      Rectangle().fill(tint).frame(width: width, height: bar)
      HStack(spacing: 0) {
        Rectangle().fill(tint).frame(width: bar, height: height)
        Spacer(minLength: 0)
        Rectangle().fill(tint).frame(width: bar, height: height)
      }
      .frame(width: width, height: height)
    }
    .frame(width: width, height: height)
  }
}

/// The running rest as the interval the moss line drains over — from the instant it began to the
/// instant it ends. Nil unless resting with an end still ahead.
///
/// ⛔ THE LINE THAT NEVER MOVED (founder 2026-09-08, photographing the card at 1:58 with the bar
/// still full). The old drain took `end.timeIntervalSinceNow` at RENDER time and drew that
/// fraction as a fixed width — and a Live Activity renders exactly once per content update, not
/// once per second. The clock beside it ticked because `Text(timerInterval:)` is driven by the
/// system; the bar beside the clock was a photograph of the rest's first instant. The same
/// system-driven primitive exists for progress — `ProgressView(timerInterval:countsDown:)` —
/// and that is what draws it now, so the line drains on its own with no update from the phone.
private func restInterval(_ s: HushSessionAttributes.ContentState) -> ClosedRange<Date>? {
  guard s.isResting, let end = s.restEndDate, let total = s.restTotalS, total > 0, end > Date() else { return nil }
  return end.addingTimeInterval(-total)...end
}

private func legend(_ s: String) -> some View {
  Text(s.uppercased())
    .font(.system(size: 10, weight: .medium))
    .tracking(1.2)
    .foregroundColor(HX.ink2)
    .lineLimit(1)
}

/// Guarded countdown range: nil unless the rest end is still in the future —
/// `Text(timerInterval:)` traps on an inverted range.
private func countdownRange(endDate: Date?, isResting: Bool) -> ClosedRange<Date>? {
  guard isResting, let end = endDate, end > Date() else { return nil }
  return Date()...end
}

/// "32" / "32.5" — whole loads without a trailing ".0".
private func fmtWeight(_ w: Double) -> String {
  w.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(w)) : String(format: "%.1f", w)
}

/// m:ss (or h:mm:ss past the hour).
private func fmtClock(_ s: Double) -> String {
  let t = max(0, Int(s))
  if t >= 3600 { return String(format: "%d:%02d:%02d", t / 3600, (t % 3600) / 60, t % 60) }
  return String(format: "%d:%02d", t / 60, t % 60)
}

/// m:ss per km.
private func fmtPace(_ s: Double) -> String {
  guard s.isFinite, s > 0 else { return "--:--" }
  return String(format: "%d:%02d", Int(s) / 60, Int(s) % 60)
}

// MARK: - Strength

struct HushStrengthLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: HushSessionAttributes.self) { context in
      StrengthLockView(state: context.state)
        .padding(14) // the 160-point budget — see StrengthLockView
        .activityBackgroundTint(HX.stage)
        .activitySystemActionForegroundColor(HX.ink0)
    } dynamicIsland: { context in
      // Built INLINE in the closure so the result builders resolve.
      let s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            // 6.1: a plain sans word ("Rest"), then the subject in the coach's SERIF.
            Text(strengthMode(s))
              .font(.system(size: 11))
              .foregroundColor(HX.ink2)
              .lineLimit(1)
            Text(strengthTitle(s))
              .font(.system(size: 15, design: .serif))
              .foregroundColor(HX.ink0)
              .lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          if let range = countdownRange(endDate: s.restEndDate, isResting: s.isResting) {
            // The countdown is the hero of a rest — 30, in CREAM. Moss is spent on the line that
            // drains beneath it, and two moss things would leave neither of them the accent.
            Text(timerInterval: range, countsDown: true)
              .font(.system(size: 30, design: .monospaced))
              .monospacedDigit()
              .foregroundColor(HX.ink0)
              .frame(maxWidth: 96)
          } else if s.phase != "paused" {
            StrengthLoadText(weight: s.targetWeight, reps: s.targetReps, size: 17, unit: s.unitLabel)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 10) {
            // THE MOSS LINE DRAINS as the rest runs out (6.1). Only during a rest — outside one
            // there is nothing running, and a full bar that never moves is a lie about time.
            if let interval = restInterval(s) {
              RestDrain(interval: interval)
            }
            Text(strengthFooter(s))
              .font(.system(size: 12))
              .foregroundColor(HX.ink2)
            StrengthActions(state: s, compact: true)
          }
        }
      } compactLeading: {
        // THE BRAND'S MARK, not a dumbbell (6.1) — Hush is a measured range, and this is that glyph.
        RangeMark()
      } compactTrailing: {
        if let range = countdownRange(endDate: s.restEndDate, isResting: s.isResting) {
          Text(timerInterval: range, countsDown: true)
            .font(.system(size: 15, design: .monospaced))
            .monospacedDigit()
            .foregroundColor(HX.ink0)
            .frame(maxWidth: 48)
        } else if s.phase == "paused" {
          Image(systemName: "pause.fill").foregroundColor(HX.ink2)
        } else if let w = s.targetWeight {
          Text(fmtWeight(w))
            .font(.system(size: 15, design: .monospaced))
            .monospacedDigit()
            .foregroundColor(HX.ink0)
        }
      } minimal: {
        RangeMark(width: 13, height: 7)
      }
      .keylineTint(HX.accent)
    }
  }
}

/// The draining moss line (6.1), driven by the system clock — see `restInterval`. `countsDown`
/// makes the filled part the rest STILL TO RUN, so the line empties as the countdown beside it
/// reaches zero (founder 2026-09-08: *"הקו הירוק… צריך להתרוקן ככל שהמנוחה מסתיימת"*).
private struct RestDrain: View {
  let interval: ClosedRange<Date>
  var body: some View {
    ProgressView(timerInterval: interval, countsDown: true, label: { EmptyView() }, currentValueLabel: { EmptyView() })
      .progressViewStyle(.linear)
      .tint(HX.accent)
      .frame(height: 5)
  }
}

/// The set count as a ROW OF DOTS (6.2): done filled, current ringed in moss, the rest dim rings.
private struct SetDots: View {
  let index: Int
  let count: Int
  var body: some View {
    HStack(spacing: 5) {
      ForEach(0..<max(1, min(count, 8)), id: \.self) { i in
        let n = i + 1
        if n < index {
          Circle().fill(HX.accent).frame(width: 8, height: 8)
        } else if n == index {
          Circle().stroke(HX.accent, lineWidth: 1.5).frame(width: 8, height: 8)
        } else {
          Circle().stroke(HX.ink0.opacity(0.3), lineWidth: 1.5).frame(width: 8, height: 8)
        }
      }
    }
  }
}

/// The one plain word above the subject in the expanded island: "Rest" / "Next up" / "Paused".
private func strengthMode(_ s: HushSessionAttributes.ContentState) -> String {
  switch s.phase {
  case "paused": return s.wordPaused
  case "transition": return s.wordNext
  case "rest": return s.wordRest
  case "logged": return s.wordLogged
  default: return s.workoutName
  }
}

private func strengthIcon(_ s: HushSessionAttributes.ContentState) -> String {
  switch s.phase {
  case "paused": return "pause.fill"
  case "transition": return "arrow.right"
  case "rest": return "timer"
  default: return "dumbbell.fill"
  }
}

/// "UPPER B · LIVE / REST / NEXT UP / PAUSED".
private func strengthLegend(_ s: HushSessionAttributes.ContentState) -> String {
  let mode: String
  switch s.phase {
  case "paused": mode = s.wordPaused
  case "transition": mode = s.wordNext
  case "rest": mode = s.wordRest
  case "logged": mode = s.wordLogged
  default: mode = "live"
  }
  return "\(s.workoutName) · \(mode)"
}

/// Hero line: the (upcoming) exercise; "Workout paused" while held.
private func strengthTitle(_ s: HushSessionAttributes.ContentState) -> String {
  if s.phase == "paused" { return s.wordPaused }
  if s.phase == "logged" { return s.exerciseName }
  if s.phase == "transition" { return s.nextExerciseName ?? s.exerciseName }
  return s.exerciseName
}

/// Footer: the set label; during a transition the upcoming load; while paused the
/// lift position ("Lift 3 of 6 · nothing lost").
private func strengthFooter(_ s: HushSessionAttributes.ContentState) -> String {
  if s.phase == "paused" { return "\(s.wordPaused) · \(s.liftIndex) / \(s.liftCount)" }
  if s.phase == "logged" { return s.wordLogged }
  if s.phase == "transition" {
    if let w = s.nextTargetWeight, let r = s.nextTargetReps { return "\(s.wordNext) · \(fmtWeight(w)) \(s.unitLabel) × \(r)" }
    if let r = s.nextTargetReps { return "\(s.wordNext) · BW × \(r)" }
    return s.wordNext
  }
  if s.phase == "rest" { return "\(s.wordNext) · \(s.setLabel)" }
  return s.setLabel
}

/// The load, and its unit-and-reps as ONE muted tail: "42.5  kg × 8".
///
/// The handoff sets the tail at 15 against a 40 figure — a shade over a third. The old ratios
/// (0.65 / 0.88) made "kg × 8" nearly as loud as the number it qualifies, which is the one thing
/// the load line must not do: the weight is the fact, everything beside it is its unit.
private struct StrengthLoadText: View {
  let weight: Double?
  let reps: Int
  let size: CGFloat
  /// The unit word from the phone ("kg" / "lb") — never assumed (2026-09-08).
  var unit: String = "kg"
  private var tail: CGFloat { max(11, size * 0.38) }
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 5) {
      if let w = weight {
        Text(fmtWeight(w))
          .font(.system(size: size, design: .monospaced)).monospacedDigit()
          .foregroundColor(HX.ink0)
        Text("\(unit) × \(reps)")
          .font(.system(size: tail, design: .monospaced)).monospacedDigit()
          .foregroundColor(HX.ink2)
      } else {
        Text("BW").font(.system(size: size * 0.9, weight: .medium)).foregroundColor(HX.ink0)
        Text("× \(reps)")
          .font(.system(size: tail, design: .monospaced)).monospacedDigit()
          .foregroundColor(HX.ink2)
      }
    }
  }
}

// Lock Screen / banner presentation (6.2), re-cut on 2026-09-08.
//
// ════ THE CARD WAS CUT OFF TOP AND BOTTOM (founder, mid-workout, photographing it) ════
//
// iOS gives a Lock Screen Live Activity 160 points and clips whatever exceeds them, centred — so
// the header row vanished under the top edge and the buttons under the bottom one. The old card
// added up to ~192: 16 of padding twice, a brand row, a 14-spacing three times, a 14-point name
// over a 40-point figure, the drain, and a 46-point action row. Every one of those was drawn for
// a card with no height limit. The budget is the composition now:
//
//   14  padding
//   18  the lift in the coach's serif, the set legend at the far end          (was two rows)
//    8
//   40  the one big thing: the countdown / the load with its steppers, dots  (figure 34, was 40)
//    8   (+14 on a set — see below)
//    5  the moss line, resting only, +8 below it
//   40  the action row                                                        (was 46)
//   14  padding
//   ──
//  156  on a set, 155 on a rest — both under 160, nothing clipped, nothing squeezed to fit.
//
// ════ THE STEPPERS SAT ON TOP OF DONE (founder, 2026-09-09) ════
//   > *"הכפתורי מינוס פלוס קרובים מאוד להתחלת התרגיל וקל מאוד לפספס."*
// On a set the round keys (34 pt) stood 8 pt above the Done capsule (40 pt, full width): a thumb
// that landed low on "−" logged the set. The set card had 18 pt of the 160 unspent — it spends 14
// of them as air between the figures and the act. A rest keeps its 8: the countdown has no keys.
//
// The brand mark rides the name row; "hush" as a word is gone from the card (the mark IS the
// brand, and the row it had was the row the card could not afford).
private struct StrengthLockView: View {
  let state: HushSessionAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .center, spacing: 8) {
        RangeMark(width: 15, height: 8)
        Text(strengthTitle(state))
          .font(.system(size: 15, design: .serif))
          .foregroundColor(HX.ink1)
          .lineLimit(1)
        Spacer(minLength: 8)
        legend(state.setLabel)
      }
      .frame(height: 18)

      HStack(alignment: .center, spacing: 12) {
        if let range = countdownRange(endDate: state.restEndDate, isResting: state.isResting) {
          // Resting: the countdown is the card's one big figure.
          Text(timerInterval: range, countsDown: true)
            .font(.system(size: 34, design: .monospaced))
            .monospacedDigit()
            .foregroundColor(HX.ink0)
            .frame(maxWidth: 130, alignment: .leading)
          Spacer(minLength: 8)
          SetDots(index: state.setIndex, count: state.setCount)
        } else if state.phase == "paused" {
          Image(systemName: "pause.fill").font(.system(size: 24)).foregroundColor(HX.ink2)
          Spacer(minLength: 8)
          SetDots(index: state.setIndex, count: state.setCount)
        } else if state.phase == "set" {
          // On a set: HER FIGURES, with the two steppers that let her type them from here.
          StrengthSetEntry(state: state)
        } else {
          StrengthLoadText(weight: state.targetWeight, reps: state.targetReps, size: 34, unit: state.unitLabel)
          Spacer(minLength: 8)
          SetDots(index: state.setIndex, count: state.setCount)
        }
      }
      .frame(height: 40)

      // During a rest the moss line drains under the figure, exactly as it does in the island.
      if let interval = restInterval(state) {
        RestDrain(interval: interval)
      }

      // ════ THE ACTION ROW (founder, 2026-09-08) ════ — on a set, one act (log it, as written
      // or with the figures above); on a rest, two (+15 s, start the next set). On a set the row
      // stands 14 pt further from the steppers (see the budget above).
      StrengthActions(state: state, compact: false)
        .padding(.top, state.phase == "set" ? 14 : 0)
    }
  }
}

/// ════ HER FIGURES, TYPED FROM THE LOCKED PHONE (founder 2026-09-08, mid-workout) ════
///
///   > *"אפשרות להזין ישירות מהלייב אקטיביטי את המשקל והחזרות."*
///
/// Two steppers on the set row — the load by this lift's own detent (`weightStep`, baked on the
/// phone), the reps by one — and the figures between them are what "Done" will write. Each turn
/// is an intent (`HushAdjustFigureIntent`) that parks the value in the App Group and redraws the
/// card at once; nothing reaches the phone until the set is logged, so the phone sees one event
/// per set carrying her numbers, exactly as a typed set on the stage does. Bodyweight has no load
/// to turn: its stepper is drawn dead, the way the keypad draws a key that does not apply.
///
/// − left, + right in every language — a stepper is a number line, not prose (the same rule the
/// keypad keeps), so the row is pinned left-to-right under a Hebrew system.
private struct StrengthSetEntry: View {
  let state: HushSessionAttributes.ContentState

  var body: some View {
    HStack(spacing: 10) {
      FigureStepper(
        field: "weight",
        figure: state.targetWeight.map(fmtWeight) ?? "BW",
        tail: state.targetWeight == nil ? "" : state.unitLabel,
        enabled: state.targetWeight != nil
      )
      Spacer(minLength: 4)
      FigureStepper(field: "reps", figure: "\(state.targetReps)", tail: state.wordReps, enabled: true)
    }
    .environment(\.layoutDirection, .leftToRight)
  }
}

/// `[−]  40 kg  [+]` — a mono figure with its muted unit between two round keys.
private struct FigureStepper: View {
  let field: String
  let figure: String
  let tail: String
  let enabled: Bool

  var body: some View {
    HStack(spacing: 6) {
      StepKey(field: field, delta: -1, glyph: "minus", enabled: enabled)
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(figure)
          .font(.system(size: 22, design: .monospaced)).monospacedDigit()
          .foregroundColor(HX.ink0)
          .lineLimit(1)
        if !tail.isEmpty {
          Text(tail)
            .font(.system(size: 11))
            .foregroundColor(HX.ink2)
            .lineLimit(1)
        }
      }
      .frame(minWidth: 58)
      StepKey(field: field, delta: 1, glyph: "plus", enabled: enabled)
    }
  }
}

/// One round key of a stepper. 34 points — the row's whole budget less its breathing room.
private struct StepKey: View {
  let field: String
  let delta: Int
  let glyph: String
  let enabled: Bool

  var body: some View {
    Button(intent: HushAdjustFigureIntent(field: field, delta: delta)) {
      Image(systemName: glyph)
        .font(.system(size: 13, weight: .bold))
        .frame(width: 34, height: 34)
    }
    .buttonStyle(.plain)
    .foregroundColor(enabled ? HX.ink0 : HX.ink2.opacity(0.5))
    .background(HX.ink0.opacity(enabled ? 0.12 : 0.05), in: Circle())
    .disabled(!enabled)
  }
}

/// The three verbs of the lock screen, as intents — see `HushLockIntents.swift`. Exactly the acts
/// the stage's footer has, so nothing can be done from here that the thumb could not do in-app:
///   · set     → "Done" (log it — as written, or with the figures the steppers hold; the rest starts)
///   · rest    → "+15 s" and "Next set"
///   · paused / logged → nothing (the phone owns a pause and the finish)
private struct StrengthActions: View {
  let state: HushSessionAttributes.ContentState
  /// Island bottom region (tight) vs the lock card (the 40 pt row the height budget allows).
  let compact: Bool

  private var height: CGFloat { compact ? 34 : 40 }

  var body: some View {
    if state.phase == "set" {
      HStack(spacing: 10) {
        // The voice's loading dialogue is open (spec §3.2): Ready beside Done, a tap being the
        // set's start. Absent otherwise — the row is Done alone, exactly as before.
        if state.awaitingReady {
          Button(intent: HushSetReadyIntent()) {
            Text(state.actReady)
              .font(.system(size: compact ? 14 : 15, weight: .medium))
              .frame(maxWidth: .infinity, minHeight: height)
          }
          .buttonStyle(.plain)
          .foregroundColor(HX.ink0)
          .background(HX.ink0.opacity(0.12), in: Capsule())
        }
        Button(intent: HushCompleteSetIntent()) {
          Text(state.actDone)
            .font(.system(size: compact ? 14 : 16, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: height)
        }
        .buttonStyle(.plain)
        .foregroundColor(HX.stage)
        .background(HX.ink0, in: Capsule())
      }
    } else if state.isResting {
      HStack(spacing: 10) {
        Button(intent: HushAddRestIntent()) {
          Text(state.actAddRest)
            .font(.system(size: compact ? 14 : 15, weight: .medium))
            .monospacedDigit()
            .frame(maxWidth: .infinity, minHeight: height)
        }
        .buttonStyle(.plain)
        .foregroundColor(HX.ink0)
        .background(HX.ink0.opacity(0.12), in: Capsule())
        Button(intent: HushEndRestIntent()) {
          Text(state.actStart)
            .font(.system(size: compact ? 14 : 16, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: height)
        }
        .buttonStyle(.plain)
        .foregroundColor(HX.stage)
        .background(HX.ink0, in: Capsule())
      }
    }
  }
}

// MARK: - Cardio

struct HushCardioLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: HushCardioAttributes.self) { context in
      CardioLockView(state: context.state)
        .padding(16)
        .activityBackgroundTint(HX.stage)
        .activitySystemActionForegroundColor(HX.ink0)
    } dynamicIsland: { context in
      let s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            legend(s.gait == "run" ? "Run" : "Walk")
            // Pause is MANUAL (the athlete pressed Pause) — never claim auto-pause.
            Text(s.paused ? "Paused" : "LIVE")
              .font(.system(size: 10, weight: .semibold))
              .tracking(1.2)
              .foregroundColor(s.paused ? HX.ink2 : HX.accent)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          CardioElapsedText(state: s, size: 17)
            .frame(maxWidth: 70)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 14) {
            CardioStat(value: String(format: "%.2f", s.distanceKm), unit: "km")
            // ⛔ NO LIVE PACE (founder 2026-08-23): the per-kilometre figure exists only once the
            // kilometre does — the last closed split, in its own slot, wearing its own kilometre.
            if let km = s.lastSplitKm, let sec = s.lastSplitPaceSec {
              CardioStat(value: fmtPace(sec), unit: "km \(km)")
            }
            CardioStat(value: "\(s.calories)", unit: "kcal")
            // hr == 0 means no heart-rate source — hidden, never shown as "0 bpm".
            if s.hr > 0 {
              CardioStat(value: "\(s.hr)", unit: "bpm")
            }
          }
        }
      } compactLeading: {
        if s.paused {
          Image(systemName: "pause.fill").foregroundColor(HX.ink2)
        } else {
          Text(String(format: "%.2f", s.distanceKm))
            .font(.system(size: 13, design: .monospaced)).monospacedDigit()
            .foregroundColor(HX.ink0)
        }
      } compactTrailing: {
        CardioElapsedText(state: s, size: 13)
          .frame(maxWidth: 50)
      } minimal: {
        Image(systemName: s.gait == "run" ? "figure.run" : "figure.walk")
          .foregroundColor(HX.accent)
      }
      .keylineTint(HX.accent)
    }
  }
}

/// The elapsed (moving-time) clock. While live it is a self-ticking
/// `Text(timerInterval:)` re-anchored to `now − elapsedSec` at every update, so it
/// keeps counting even when app updates stop (background) yet excludes prior paused
/// time — anchoring on `startDate` would drift after any auto-pause. While paused it
/// is the frozen moving time ("the clock stops with you").
private struct CardioElapsedText: View {
  let state: HushCardioAttributes.ContentState
  let size: CGFloat
  var body: some View {
    if state.paused {
      Text(fmtClock(state.elapsedSec))
        .font(.system(size: size, design: .monospaced)).monospacedDigit()
        .foregroundColor(HX.ink2)
    } else {
      Text(
        timerInterval: Date(timeIntervalSinceNow: -state.elapsedSec)...Date.distantFuture,
        countsDown: false
      )
      .font(.system(size: size, design: .monospaced)).monospacedDigit()
      .foregroundColor(HX.ink0)
    }
  }
}

private struct CardioStat: View {
  let value: String
  let unit: String
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 2) {
      Text(value)
        .font(.system(size: 15, design: .monospaced)).monospacedDigit()
        .foregroundColor(HX.ink0)
      Text(unit).font(.system(size: 10)).foregroundColor(HX.ink2)
    }
  }
}

/// The lock card's stat figure size. A file-level constant so the view, its stat cell and the
/// source law that guards `caloriesAreLegible` all read the same number.
private let CARDIO_LOCK_STAT_FIGURE: CGFloat = 19

/// One measured fact on the lock card: a mono figure over its own sans label.
///
/// Deliberately NOT `CardioStat` (the island's, at 15/10 on one baseline). The island has a strip
/// to work in; the card has a whole row, and the founder's C.20 is precisely that the card was
/// using it like a strip.
private struct CardioLockStat: View {
  let value: String
  let label: String
  var body: some View {
    VStack(spacing: 3) {
      Text(value)
        .font(.system(size: CARDIO_LOCK_STAT_FIGURE, design: .monospaced)).monospacedDigit()
        .foregroundColor(HX.ink0)
        .lineLimit(1)
      Text(label.uppercased())
        .font(.system(size: 10, weight: .medium))
        .tracking(1.1)
        .foregroundColor(HX.ink2)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity)
  }
}

// Lock Screen / banner presentation (6.2).
//
// ════ C.20 — "small next to Spotify's; lay the data out better; make calories legible" ════
//
// WHY IT WAS SMALL. The canonical 6.2 card is three rows, and the third is a 46 pt ACTION row
// ("Log set"). We do not draw it — §8.5 ratifies this activity as READ-ONLY, and the buttons are
// the founder's own open decision. So the card was the handoff's composition minus roughly sixty
// points of height, which is exactly the gap he saw beside Spotify. That height is reclaimed here
// for the DATA rather than for controls: nothing about the read-only contract changes.
//
// WHY THE CALORIES WERE NOT MERELY SMALL — THEY WERE GONE. The old card had one 13 pt muted line
// that chose between the last split AND the pace/kcal/bpm run-on. `lastSplitKm` is set from
// `splits[splits.length - 1]`, and a split list never shrinks — so from the moment the first
// kilometre closed, that line took the split branch and NEVER CAME BACK. Calories and heart rate
// were absent for every kilometre after the first, on every run. "Make calories legible" was a
// bigger finding than it reads.
//
// SO THE CARD IS A TABLE, NOT A SENTENCE, and it is the same instrument as the in-app live stage:
//
//   ▐▬▌ RUN · LIVE                              KM 4 · 6:19        ← what this is; the last split
//   26:14                                          4.62 km        ← the two facts a glance is for
//   ────────────────────────────────────────────────────────
//        5:41              318              141                   ← measured, each with its label
//        /KM               KCAL             BPM
//
// One composition for every state. PAUSED used to swap in a different card entirely (a big word
// and a sentence) and threw the athlete's own numbers away to say so; now the legend says it, the
// clock greys and freezes, and her distance and her calories stay exactly where she left them.
private struct CardioLockView: View {
  let state: HushCardioAttributes.ContentState

  /// What this is, and nothing else — the split has its own slot now. Saying "km 4 split" here AND
  /// printing the split on the same row would be the card stuttering (one fact, one element).
  private var legendText: String {
    let gait = state.gait == "run" ? "Run" : "Walk"
    return state.paused ? "\(gait) · paused" : "\(gait) · live"
  }

  /// The last closed kilometre and what it took — moss when it is the quickest of the run.
  private var splitTag: String? {
    guard let km = state.lastSplitKm, let pace = state.lastSplitPaceSec else { return nil }
    return "km \(km) · \(fmtPace(pace))"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 9) {
        RangeMark(width: 18, height: 9)
        legend(legendText)
        Spacer(minLength: 8)
        if let tag = splitTag {
          Text(tag.uppercased())
            .font(.system(size: 10, weight: .medium))
            .tracking(1.1)
            .foregroundColor(state.lastSplitFastest ? HX.accent : HX.ink2)
            .lineLimit(1)
        }
      }

      // The clock is the hero of a run on every other surface Hush draws — the live stage sets it
      // at 84 against a distance that rides the band. The card used to invert that (distance 28,
      // clock 24 in the corner); it agrees with the app now.
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        CardioElapsedText(state: state, size: 36)
        Spacer(minLength: 8)
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(String(format: "%.2f", state.distanceKm))
            .font(.system(size: 24, weight: .semibold, design: .monospaced))
            .monospacedDigit()
            .foregroundColor(HX.ink0)
          Text("km").font(.system(size: 12)).foregroundColor(HX.ink2)
        }
      }

      Rectangle().fill(HX.ink0.opacity(0.10)).frame(height: 1)

      HStack(spacing: 0) {
        // ⛔ NO LIVE PACE (founder 2026-08-23) — the split tag in the header row is the card's
        // only per-kilometre figure, and it is the time a FINISHED kilometre took.
        CardioLockStat(value: "\(state.calories)", label: "kcal")
        // hr == 0 means no heart-rate source — the column is dropped, never shown as "0 bpm".
        // Same law as the in-app row (C.19): no instrument, no readout.
        if state.hr > 0 {
          CardioLockStat(value: "\(state.hr)", label: "bpm")
        }
      }
    }
  }
}
