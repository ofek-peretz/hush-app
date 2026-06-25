import ActivityKit
import WidgetKit
import SwiftUI

// Hush — Live Activity / Dynamic Island UI (WidgetKit + SwiftUI).
//
// SCAFFOLD for the widget extension target. This is the native rendering of the
// design's Dynamic Island grammar (screen shots: "notes & Dynamic island & live
// activity"). It compiles only inside an iOS widget-extension target on macOS/Xcode
// — see ../../LIVE_ACTIVITY_HANDOFF.md for the exact Xcode setup. The two
// `ActivityAttributes` files (HushSessionAttributes / HushCardioAttributes) must be
// added to BOTH the app target and this widget target (shared Codable shape).
//
// Visual language (matches the app's tokens): inverted "stage" (near-black), warm
// graphite text, a single ochre accent, JetBrains Mono for every measured number,
// sage for progress, clay for a decrease. Refine pixel details against the
// screenshots on-device.

// MARK: - Tokens
private enum HX {
  static let stage = Color(red: 0.10, green: 0.09, blue: 0.08)
  static let ink0 = Color(red: 0.96, green: 0.95, blue: 0.94)
  static let ink2 = Color(red: 0.46, green: 0.45, blue: 0.44)
  static let accent = Color(red: 0.80, green: 0.57, blue: 0.28) // ochre
  static let up = Color(red: 0.35, green: 0.50, blue: 0.38) // sage
  static let mono = "JetBrains Mono"
}

private func legend(_ s: String) -> some View {
  Text(s.uppercased())
    .font(.system(size: 10, weight: .medium)).tracking(1.2)
    .foregroundColor(HX.ink2)
}

// MARK: - Bundle
@main
struct HushWidgetBundle: WidgetBundle {
  var body: some Widget {
    HushStrengthLiveActivity()
    HushCardioLiveActivity()
  }
}

// MARK: - Strength
struct HushStrengthLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: HushSessionAttributes.self) { context in
      // Lock-screen / banner presentation.
      StrengthLockView(state: context.state).padding(16).background(HX.stage)
    } dynamicIsland: { context in
      let s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            legend(s.workoutName)
            Text(s.phase == "paused" ? "Paused" : s.exerciseName)
              .font(.system(size: 15, weight: .semibold)).foregroundColor(HX.ink0)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          if s.isResting, let end = s.restEndDate {
            Text(timerInterval: Date()...end, countsDown: true)
              .font(.custom(HX.mono, size: 17)).monospacedDigit()
              .foregroundColor(HX.accent).frame(maxWidth: 64)
          } else {
            loadText(weight: s.targetWeight, reps: s.targetReps)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(s.isResting ? "Rest" : s.setLabel)
            .font(.system(size: 12)).foregroundColor(HX.ink2)
        }
      } compactLeading: {
        Image(systemName: s.isResting ? "timer" : "dumbbell.fill").foregroundColor(HX.accent)
      } compactTrailing: {
        if s.isResting, let end = s.restEndDate {
          Text(timerInterval: Date()...end, countsDown: true)
            .font(.custom(HX.mono, size: 13)).monospacedDigit().foregroundColor(HX.accent).frame(maxWidth: 44)
        } else if let w = s.targetWeight {
          Text("\(Int(w))").font(.custom(HX.mono, size: 13)).foregroundColor(HX.ink0)
        }
      } minimal: {
        Image(systemName: s.isResting ? "timer" : "dumbbell.fill").foregroundColor(HX.accent)
      }
      .keylineTint(HX.accent)
    }
  }

  @ViewBuilder private func loadText(weight: Double?, reps: Int) -> some View {
    HStack(spacing: 4) {
      if let w = weight { Text("\(Int(w))").font(.custom(HX.mono, size: 17)).foregroundColor(HX.ink0); Text("kg").font(.system(size: 11)).foregroundColor(HX.ink2) }
      else { Text("BW").font(.system(size: 15)).foregroundColor(HX.ink0) }
      Text("× \(reps)").font(.custom(HX.mono, size: 15)).foregroundColor(HX.ink2)
    }
  }
}

private struct StrengthLockView: View {
  let state: HushSessionAttributes.ContentState
  var body: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: 3) {
        legend("\(state.workoutName) · Lift \(state.liftIndex)/\(state.liftCount)")
        Text(state.phase == "paused" ? "Workout paused" : (state.phase == "transition" ? (state.nextExerciseName ?? state.exerciseName) : state.exerciseName))
          .font(.system(size: 17, weight: .semibold)).foregroundColor(HX.ink0)
        Text(state.isResting ? "Rest" : state.setLabel).font(.system(size: 13)).foregroundColor(HX.ink2)
      }
      Spacer()
      if state.isResting, let end = state.restEndDate {
        Text(timerInterval: Date()...end, countsDown: true)
          .font(.custom(HX.mono, size: 28)).monospacedDigit().foregroundColor(HX.accent)
      } else if let w = state.targetWeight {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
          Text("\(Int(w))").font(.custom(HX.mono, size: 28)).foregroundColor(HX.ink0)
          Text("kg").font(.system(size: 12)).foregroundColor(HX.ink2)
        }
      }
    }
  }
}

// MARK: - Cardio
struct HushCardioLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: HushCardioAttributes.self) { context in
      CardioLockView(state: context.state).padding(16).background(HX.stage)
    } dynamicIsland: { context in
      let s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            legend(s.gait == "run" ? "Run" : "Walk")
            Text(s.paused ? "Auto-paused" : "LIVE").font(.system(size: 10, weight: .semibold)).foregroundColor(s.paused ? HX.ink2 : HX.accent)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(timerInterval: s.startDate...Date.distantFuture, countsDown: false)
            .font(.custom(HX.mono, size: 17)).monospacedDigit().foregroundColor(HX.ink0).frame(maxWidth: 70)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 14) {
            stat(fmtPace(s.paceSec), "/km")
            stat("\(s.calories)", "kcal")
            stat("\(s.hr)", "bpm")
          }
        }
      } compactLeading: {
        Text(fmtPace(s.paceSec)).font(.custom(HX.mono, size: 13)).foregroundColor(HX.ink0)
      } compactTrailing: {
        Text(String(format: "%.2f", s.distanceKm)).font(.custom(HX.mono, size: 13)).foregroundColor(HX.accent)
      } minimal: {
        Image(systemName: s.gait == "run" ? "figure.run" : "figure.walk").foregroundColor(HX.accent)
      }
      .keylineTint(HX.accent)
    }
  }

  @ViewBuilder private func stat(_ v: String, _ u: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 2) {
      Text(v).font(.custom(HX.mono, size: 15)).foregroundColor(HX.ink0)
      Text(u).font(.system(size: 10)).foregroundColor(HX.ink2)
    }
  }
}

private struct CardioLockView: View {
  let state: HushCardioAttributes.ContentState
  var body: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: 3) {
        legend(state.gait == "run" ? "Run" : "Walk")
        Text(timerInterval: state.startDate...Date.distantFuture, countsDown: false)
          .font(.custom(HX.mono, size: 28)).monospacedDigit().foregroundColor(HX.ink0)
        Text("\(fmtPace(state.paceSec)) /km · \(state.calories) kcal · \(state.hr) bpm")
          .font(.system(size: 12)).foregroundColor(HX.ink2)
      }
      Spacer()
      VStack(alignment: .trailing) {
        Text(String(format: "%.2f", state.distanceKm)).font(.custom(HX.mono, size: 22)).foregroundColor(HX.accent)
        Text("km").font(.system(size: 11)).foregroundColor(HX.ink2)
      }
    }
  }
}

// m:ss per km
private func fmtPace(_ s: Double) -> String {
  guard s.isFinite, s > 0 else { return "--:--" }
  let m = Int(s) / 60, r = Int(s) % 60
  return "\(m):" + String(format: "%02d", r)
}
