import ActivityKit
import SwiftUI
import WidgetKit

// The Hush session Live Activity (Lock Screen + Dynamic Island).
//
// The widget extension's deployment target is iOS 16.2 (expo-target.config.js), so
// ActivityKit + Live Activities are unconditionally available here — no `@available`
// guards / `if #available` (those were a result-builder hazard and are unnecessary).
//
// Renders the SUBSET of the canonical SessionMirror in HushSessionAttributes.ContentState.
// Hard contract (spec §8.5): READ-ONLY (no completion control); the TIMER is the hero,
// tabular, driven by the absolute `restEndDate` via `Text(timerInterval:)`; during an
// active set the exercise name is the hero; NO progress ring, heart rate, calories, streak.

struct HushLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: HushSessionAttributes.self) { context in
      // Lock Screen / banner.
      HushLockScreenView(state: context.state)
        .activityBackgroundTint(Color.black)
        .activitySystemActionForegroundColor(Color.white)
    } dynamicIsland: { context in
      // Dynamic Island — built INLINE in the closure so the result builders resolve.
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text(state.exerciseName)
            .font(.headline)
            .lineLimit(1)
            .foregroundStyle(.white)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if state.isResting, let end = state.restEndDate, end > Date() {
            Text(timerInterval: Date()...end, countsDown: true)
              .font(.system(.title2, design: .monospaced))
              .monospacedDigit()
              .frame(maxWidth: 64)
              .foregroundStyle(.white)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(state.setLabel)
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
      } compactLeading: {
        Image(systemName: "dumbbell.fill").foregroundStyle(.white)
      } compactTrailing: {
        if state.isResting, let end = state.restEndDate, end > Date() {
          Text(timerInterval: Date()...end, countsDown: true)
            .monospacedDigit()
            .frame(maxWidth: 44)
            .foregroundStyle(.white)
        }
      } minimal: {
        Image(systemName: "dumbbell.fill").foregroundStyle(.white)
      }
    }
  }
}

// Lock Screen / banner presentation.
struct HushLockScreenView: View {
  let state: HushSessionAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if state.isResting, let end = state.restEndDate, end > Date() {
        // Resting: the countdown is the hero.
        Text(timerInterval: Date()...end, countsDown: true)
          .font(.system(size: 48, weight: .semibold, design: .monospaced))
          .monospacedDigit()
          .foregroundStyle(.white)
        Text(state.exerciseName)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      } else {
        // Active set: the exercise is the hero.
        Text(state.exerciseName)
          .font(.system(size: 28, weight: .semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
      }
      Text(state.setLabel)
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding()
  }
}
