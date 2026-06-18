import SwiftUI

// SwiftUI realization of every approved watch screen (WATCH_EXPERIENCE_SPEC.md +
// watchPresentation.ts). STRICT no-scroll: each screen fits without scrolling (§7).
// The watch states the exercise name ONLY on Active Set; no session/exercise
// progress counters are shown. All buttons propose intents; the phone decides.

// MARK: Shared formatting

private func targetLine(weight: Double?, reps: Int) -> String {
  guard let w = weight else { return "Bodyweight × \(reps)" }
  let kg = w.rounded() == w ? String(Int(w)) : String(format: "%.1f", w)
  return "\(kg) kg × \(reps)"
}

/// Drift-proof countdown anchored on the phone-supplied absolute end instant.
/// Guards `end > now`: `Text(timerInterval:)` traps on an inverted range, so a
/// past/elapsed end renders a settled 0 instead of crashing.
private struct RestCountdown: View {
  let restEndsAt: String?
  var body: some View {
    if let end = WatchWire.parseDate(restEndsAt), end > Date() {
      Text(timerInterval: Date()...end, countsDown: true)
        .font(.system(size: 40, weight: .semibold, design: .monospaced))
        .monospacedDigit()
        .foregroundStyle(.white)
    } else {
      Text("0:00")
        .font(.system(size: 40, weight: .semibold, design: .monospaced))
        .monospacedDigit()
        .foregroundStyle(.secondary)
    }
  }
}

private struct PauseGlyph: View {
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Image(systemName: "pause.fill").font(.footnote)
    }
    .buttonStyle(.plain)
    .foregroundStyle(.secondary)
  }
}

// MARK: Root

struct WatchRootView: View {
  @ObservedObject var model: WatchModel

  var body: some View {
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.black.ignoresSafeArea())
      .onReceive(model.onEntryHaptic) { WatchHaptics.play($0) }
  }

  @ViewBuilder private var content: some View {
    switch model.screen {
    case .idle:
      IdleView()
    case let .connectionLost(mirror):
      ConnectionLostView(mirror: mirror)
    case .workoutComplete:
      WorkoutCompleteView(onDismiss: {})
    case let .paused(m):
      PausedView(mirror: m, onResume: model.resume, onFinish: model.openFinishConfirm)
    case .finishConfirm:
      FinishConfirmView(onNo: model.closeFinishConfirm, onYes: model.finishYes)
    case let .repAdjust(m, reps):
      RepAdjustView(targetReps: m.targetReps, actualReps: reps,
                    onChange: model.setRepAdjust, onConfirm: model.confirmReps, onCancel: model.cancelRepAdjust)
    case let .activeSet(m):
      ActiveSetView(mirror: m, onComplete: model.completeSet, onCouldnt: model.openRepAdjust,
                    onBusy: model.markExerciseBusy, onPause: model.pause)
    case let .interRest(m):
      InterRestView(mirror: m, onReady: model.endRest, onPause: model.pause)
    case let .exerciseComplete(m):
      ExerciseCompleteView(mirror: m, onElapsed: model.ackExerciseComplete)
    case let .transitionRest(m):
      TransitionRestView(mirror: m, onReady: model.endRest, onPause: model.pause)
    }
  }
}

// MARK: Screens

struct IdleView: View {
  var body: some View {
    Image(systemName: "dumbbell.fill").font(.title).foregroundStyle(.secondary)
  }
}

struct ActiveSetView: View {
  let mirror: WireMirror
  let onComplete: () -> Void
  let onCouldnt: () -> Void
  let onBusy: () -> Void
  let onPause: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(mirror.exerciseName).font(.headline).foregroundStyle(.white).lineLimit(1)
          Text(mirror.setLabel).font(.caption).foregroundStyle(.secondary)
        }
        Spacer()
        PauseGlyph(action: onPause)
      }
      Text(targetLine(weight: mirror.targetWeight, reps: mirror.targetReps))
        .font(.subheadline).foregroundStyle(.white.opacity(0.9))
      Spacer(minLength: 2)
      Button(WatchCopy.completeSet, action: onComplete)
        .buttonStyle(.borderedProminent).tint(.white)
      Button(WatchCopy.couldntComplete, action: onCouldnt)
        .buttonStyle(.bordered)
      if mirror.canMarkBusy {
        Button(WatchCopy.exerciseBusy, action: onBusy)
          .buttonStyle(.bordered).font(.caption)
      }
    }
    .padding(.horizontal, 8)
  }
}

struct InterRestView: View {
  let mirror: WireMirror
  let onReady: () -> Void
  let onPause: () -> Void

  var body: some View {
    VStack(spacing: 6) {
      // No exercise name on inter-set rest (the athlete already knows it).
      RestCountdown(restEndsAt: mirror.restEndsAt)
      Text(WatchCopy.interEncouragement).font(.caption).foregroundStyle(.secondary)
      Text(targetLine(weight: mirror.targetWeight, reps: mirror.targetReps))
        .font(.caption2).foregroundStyle(.white.opacity(0.7))
      Spacer(minLength: 2)
      HStack(spacing: 8) {
        Button(WatchCopy.ready, action: onReady).buttonStyle(.borderedProminent).tint(.white)
        PauseGlyph(action: onPause)
      }
    }
    .padding(.horizontal, 8)
  }
}

struct ExerciseCompleteView: View {
  let mirror: WireMirror
  let onElapsed: () -> Void

  var body: some View {
    VStack(spacing: 6) {
      Image(systemName: "checkmark.circle.fill").font(.title2).foregroundStyle(.white)
      Text(WatchCopy.exerciseComplete(mirror.completedExerciseName ?? ""))
        .font(.headline).multilineTextAlignment(.center).foregroundStyle(.white)
      if let next = mirror.nextExerciseName, !next.isEmpty {
        Text("\(WatchCopy.next) \(next)").font(.caption).foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal, 8)
    // Brief interstitial, then reveal the transition rest.
    .task {
      try? await Task.sleep(nanoseconds: 1_600_000_000)
      onElapsed()
    }
  }
}

struct TransitionRestView: View {
  let mirror: WireMirror
  let onReady: () -> Void
  let onPause: () -> Void

  var body: some View {
    VStack(spacing: 5) {
      RestCountdown(restEndsAt: mirror.restEndsAt)
      Text(WatchCopy.transitionEncouragement).font(.caption).foregroundStyle(.secondary)
      if let next = mirror.nextExerciseName, !next.isEmpty {
        Text("\(WatchCopy.next) \(next)").font(.caption2).foregroundStyle(.white.opacity(0.85)).lineLimit(1)
        Text(targetLine(weight: mirror.nextTargetWeight, reps: mirror.nextTargetReps ?? 0))
          .font(.caption2).foregroundStyle(.white.opacity(0.6))
      }
      Spacer(minLength: 2)
      HStack(spacing: 8) {
        Button(WatchCopy.ready, action: onReady).buttonStyle(.borderedProminent).tint(.white)
        PauseGlyph(action: onPause)
      }
    }
    .padding(.horizontal, 8)
  }
}

struct PausedView: View {
  let mirror: WireMirror
  let onResume: () -> Void
  let onFinish: () -> Void

  var body: some View {
    VStack(spacing: 8) {
      Text(WatchCopy.pausedTitle).font(.headline).foregroundStyle(.white)
      Text(mirror.exerciseName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
      Spacer(minLength: 2)
      Button(WatchCopy.resume, action: onResume).buttonStyle(.borderedProminent).tint(.white)
      Button(WatchCopy.finish, action: onFinish).buttonStyle(.bordered)
    }
    .padding(.horizontal, 8)
  }
}

struct FinishConfirmView: View {
  let onNo: () -> Void
  let onYes: () -> Void

  var body: some View {
    VStack(spacing: 10) {
      Text(WatchCopy.finishPrompt).font(.headline).multilineTextAlignment(.center).foregroundStyle(.white)
      // No first — the destructive action is never the default.
      Button(WatchCopy.finishNo, action: onNo).buttonStyle(.borderedProminent).tint(.white)
      Button(WatchCopy.finishYes, action: onYes).buttonStyle(.bordered).tint(.red)
    }
    .padding(.horizontal, 8)
  }
}

struct RepAdjustView: View {
  let targetReps: Int
  let actualReps: Int
  let onChange: (Int) -> Void
  let onConfirm: () -> Void
  let onCancel: () -> Void

  @State private var crown = 0.0

  var body: some View {
    VStack(spacing: 6) {
      Text(WatchCopy.repAdjustTitle).font(.caption).foregroundStyle(.secondary)
      Text("\(actualReps)")
        .font(.system(size: 48, weight: .bold, design: .rounded))
        .foregroundStyle(.white)
        .focusable(true)
        .digitalCrownRotation($crown, from: 0, through: 100, by: 1, sensitivity: .medium, isContinuous: false)
        .onChange(of: crown) { _, newValue in onChange(Int(newValue.rounded())) }
      Text(WatchCopy.repAdjustTarget(targetReps)).font(.caption2).foregroundStyle(.white.opacity(0.6))
      Spacer(minLength: 2)
      Button(WatchCopy.confirm, action: onConfirm).buttonStyle(.borderedProminent).tint(.white)
      Button(WatchCopy.cancel, action: onCancel).buttonStyle(.bordered)
    }
    .padding(.horizontal, 8)
    .onAppear { crown = Double(actualReps) }
  }
}

struct WorkoutCompleteView: View {
  let onDismiss: () -> Void
  var body: some View {
    VStack(spacing: 8) {
      Image(systemName: "checkmark.seal.fill").font(.largeTitle).foregroundStyle(.white)
      Text(WatchCopy.workoutCompleteTitle) // "Well Done." — locked, keep the period.
        .font(.title3).fontWeight(.semibold).foregroundStyle(.white)
    }
    .padding(.horizontal, 8)
  }
}

struct ConnectionLostView: View {
  let mirror: WireMirror?
  var body: some View {
    ZStack {
      // Dimmed last-known context behind the overlay (an honest viewer).
      if let m = mirror {
        VStack(spacing: 4) {
          if let rest = m.restEndsAt, !rest.isEmpty {
            RestCountdown(restEndsAt: rest).opacity(0.25)
          } else {
            Text(m.exerciseName).font(.headline).foregroundStyle(.white.opacity(0.25)).lineLimit(1)
            Text(m.setLabel).font(.caption).foregroundStyle(.white.opacity(0.2))
          }
        }
      }
      VStack(spacing: 6) {
        Image(systemName: "wifi.slash").font(.title3).foregroundStyle(.secondary)
        Text(WatchCopy.reconnecting).font(.headline).foregroundStyle(.white)
        Text(WatchCopy.continueOnPhone).font(.caption2).foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal, 8)
  }
}
