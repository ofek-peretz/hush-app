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
// The widget extension's deployment target is iOS 16.2 (expo-target.config.js), so
// ActivityKit + Live Activities are unconditionally available here — no `@available`
// guards / `if #available` (those were a result-builder hazard and are unnecessary).
//
// Hard contract (spec §8.5): READ-ONLY — no completion / pause / skip controls from
// the Live Activity (the mockup's buttons are overridden by the ratified contract,
// and iOS 16.2 has no Live Activity App Intents anyway). During rest the TIMER is
// the hero, driven by the absolute `restEndDate` via `Text(timerInterval:)`; during
// an active set the exercise name is the hero. Strength never shows heart rate /
// calories / progress ring / streak; cardio legitimately shows pace / HR / calories
// (recorded, never coached).

// MARK: - Tokens (matches the app's design tokens)
private enum HX {
  static let stage = Color(red: 0.075, green: 0.071, blue: 0.063) // stage[0] #131210
  static let ink0 = Color(red: 0.945, green: 0.933, blue: 0.898) // cream[0] #f1eee5
  static let ink2 = Color(red: 0.545, green: 0.518, blue: 0.455) // cream[2] #8b8474
  static let accent = Color(red: 0.663, green: 0.769, blue: 0.624) // lit moss #a9c49f — the live/rest accent
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
        .padding(16)
        .activityBackgroundTint(HX.stage)
        .activitySystemActionForegroundColor(HX.ink0)
    } dynamicIsland: { context in
      // Built INLINE in the closure so the result builders resolve.
      let s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            legend(strengthLegend(s))
            Text(strengthTitle(s))
              .font(.system(size: 15, weight: .semibold))
              .foregroundColor(HX.ink0)
              .lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          if let range = countdownRange(endDate: s.restEndDate, isResting: s.isResting) {
            Text(timerInterval: range, countsDown: true)
              .font(.system(size: 17, design: .monospaced))
              .monospacedDigit()
              .foregroundColor(HX.accent)
              .frame(maxWidth: 64)
          } else if s.phase != "paused" {
            StrengthLoadText(weight: s.targetWeight, reps: s.targetReps, size: 17)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(strengthFooter(s))
            .font(.system(size: 12))
            .foregroundColor(HX.ink2)
        }
      } compactLeading: {
        Image(systemName: strengthIcon(s)).foregroundColor(HX.accent)
      } compactTrailing: {
        if let range = countdownRange(endDate: s.restEndDate, isResting: s.isResting) {
          Text(timerInterval: range, countsDown: true)
            .font(.system(size: 13, design: .monospaced))
            .monospacedDigit()
            .foregroundColor(HX.accent)
            .frame(maxWidth: 44)
        } else if s.phase == "paused" {
          Image(systemName: "pause.fill").foregroundColor(HX.ink2)
        } else if let w = s.targetWeight {
          Text(fmtWeight(w))
            .font(.system(size: 13, design: .monospaced))
            .monospacedDigit()
            .foregroundColor(HX.ink0)
        }
      } minimal: {
        Image(systemName: strengthIcon(s)).foregroundColor(HX.accent)
      }
      .keylineTint(HX.accent)
    }
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
  case "paused": mode = "paused"
  case "transition": mode = "next up"
  case "rest": mode = "rest"
  default: mode = "live"
  }
  return "\(s.workoutName) · \(mode)"
}

/// Hero line: the (upcoming) exercise; "Workout paused" while held.
private func strengthTitle(_ s: HushSessionAttributes.ContentState) -> String {
  if s.phase == "paused" { return "Workout paused" }
  if s.phase == "transition" { return s.nextExerciseName ?? s.exerciseName }
  return s.exerciseName
}

/// Footer: the set label; during a transition the upcoming load; while paused the
/// lift position ("Lift 3 of 6 · nothing lost").
private func strengthFooter(_ s: HushSessionAttributes.ContentState) -> String {
  if s.phase == "paused" { return "Lift \(s.liftIndex) of \(s.liftCount) · nothing lost" }
  if s.phase == "transition" {
    if let w = s.nextTargetWeight, let r = s.nextTargetReps { return "Up next · \(fmtWeight(w)) kg × \(r)" }
    if let r = s.nextTargetReps { return "Up next · BW × \(r)" }
    return "Up next"
  }
  if s.phase == "rest" { return "Up next · \(s.setLabel)" }
  return s.setLabel
}

private struct StrengthLoadText: View {
  let weight: Double?
  let reps: Int
  let size: CGFloat
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 4) {
      if let w = weight {
        Text(fmtWeight(w))
          .font(.system(size: size, design: .monospaced)).monospacedDigit()
          .foregroundColor(HX.ink0)
        Text("kg").font(.system(size: size * 0.65)).foregroundColor(HX.ink2)
      } else {
        Text("BW").font(.system(size: size * 0.9, weight: .medium)).foregroundColor(HX.ink0)
      }
      Text("× \(reps)")
        .font(.system(size: size * 0.88, design: .monospaced)).monospacedDigit()
        .foregroundColor(HX.ink2)
    }
  }
}

// Lock Screen / banner presentation.
private struct StrengthLockView: View {
  let state: HushSessionAttributes.ContentState

  var body: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: 3) {
        legend("\(strengthLegend(state)) · lift \(state.liftIndex)/\(state.liftCount)")
        Text(strengthTitle(state))
          .font(.system(size: 17, weight: .semibold))
          .foregroundColor(HX.ink0)
          .lineLimit(1)
        Text(strengthFooter(state))
          .font(.system(size: 13))
          .foregroundColor(HX.ink2)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      if let range = countdownRange(endDate: state.restEndDate, isResting: state.isResting) {
        // Resting: the countdown is the hero.
        Text(timerInterval: range, countsDown: true)
          .font(.system(size: 28, weight: .semibold, design: .monospaced))
          .monospacedDigit()
          .foregroundColor(HX.accent)
          .frame(maxWidth: 92, alignment: .trailing)
      } else if state.phase == "paused" {
        Image(systemName: "pause.fill")
          .font(.system(size: 22))
          .foregroundColor(HX.ink2)
      } else {
        StrengthLoadText(weight: state.targetWeight, reps: state.targetReps, size: 28)
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
            CardioStat(value: fmtPace(s.paceSec), unit: "/km")
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

// Lock Screen / banner presentation.
private struct CardioLockView: View {
  let state: HushCardioAttributes.ContentState

  private var legendText: String {
    let gait = state.gait == "run" ? "Run" : "Walk"
    if state.paused { return "\(gait) · paused" }
    if let km = state.lastSplitKm { return "\(gait) · km \(km) split" }
    return "\(gait) · live"
  }

  var body: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: 3) {
        legend(legendText)
        if state.paused {
          // Manual pause — state the fact; resuming happens in the app, not by moving.
          Text("Paused")
            .font(.system(size: 17, weight: .semibold))
            .foregroundColor(HX.accent)
          Text(String(format: "%.2f km · the clock is stopped", state.distanceKm))
            .font(.system(size: 13))
            .foregroundColor(HX.ink2)
        } else {
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(String(format: "%.2f", state.distanceKm))
              .font(.system(size: 28, weight: .semibold, design: .monospaced))
              .monospacedDigit()
              .foregroundColor(HX.ink0)
            Text("km").font(.system(size: 13)).foregroundColor(HX.ink2)
          }
          Text(splitOrStatsLine)
            .font(.system(size: 13))
            .foregroundColor(HX.ink2)
            .lineLimit(1)
        }
      }
      Spacer(minLength: 8)
      CardioElapsedText(state: state, size: 24)
    }
  }

  private var splitOrStatsLine: String {
    if let km = state.lastSplitKm, let pace = state.lastSplitPaceSec {
      let tag = state.lastSplitFastest ? " · fastest yet" : ""
      return "Km \(km) · \(fmtPace(pace)) /km\(tag)"
    }
    // hr == 0 means no heart-rate source — omitted, never shown as "0 bpm".
    var line = "\(fmtPace(state.paceSec)) /km · \(state.calories) kcal"
    if state.hr > 0 { line += " · \(state.hr) bpm" }
    return line
  }
}
