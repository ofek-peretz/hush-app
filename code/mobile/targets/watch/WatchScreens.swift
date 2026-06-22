import SwiftUI

// SwiftUI realization of the Claude Design watch (ui_kits/watch) — "the same
// instrument, on the wrist." The watch IS the inverted "stage": a warm graphite
// surface, off-white ink, ONE ochre signal, sage/clay load deltas, and mono numbers
// (the load is the largest mark on any Hush surface). Six live screens + the carried-
// over Choose / Edit / Swap / Pause. Heart rate + calories are intentionally absent
// (watch HealthKit is not shipped). The phone is the sole authority; every button
// proposes an intent.
//
// Colors are the sRGB conversion of the design's oklch stage tokens (tokens/colors.css).

// MARK: Palette (stage tokens)

enum Palette {
  static let stage0 = Color(red: 0.098, green: 0.090, blue: 0.078) // bg
  static let stage1 = Color(red: 0.145, green: 0.133, blue: 0.122) // raised / card
  static let stage2 = Color(red: 0.208, green: 0.196, blue: 0.180) // line / track
  static let ink0 = Color(red: 0.957, green: 0.953, blue: 0.941) // primary text
  static let ink1 = Color(red: 0.702, green: 0.694, blue: 0.678) // secondary
  static let ink2 = Color(red: 0.463, green: 0.455, blue: 0.443) // muted
  static let signal = Color(red: 0.800, green: 0.569, blue: 0.278) // ochre accent
  static let onAccent = Color(red: 0.984, green: 0.980, blue: 0.973)
  static let up = Color(red: 0.349, green: 0.498, blue: 0.376) // sage (increase)
  static let upWash = Color(red: 0.890, green: 0.945, blue: 0.898)
  static let down = Color(red: 0.627, green: 0.376, blue: 0.298) // clay (decrease)
  static let downWash = Color(red: 0.996, green: 0.914, blue: 0.882)
}

private enum EditField { case weight, reps }

// MARK: Formatting

private func fmtW(_ w: Double) -> String {
  w.rounded() == w ? String(Int(w)) : String(format: "%.1f", w)
}
private func fmtTime(_ s: Double) -> String {
  let t = max(0, Int(s.rounded())); return "\(t / 60):" + String(format: "%02d", t % 60)
}

// MARK: Shared chrome

/// Uppercase instrument legend.
private struct Legend: View {
  let text: String
  var size: CGFloat = 10
  init(_ text: String, size: CGFloat = 10) { self.text = text; self.size = size }
  var body: some View {
    Text(text.uppercased())
      .font(.system(size: size, weight: .medium)).tracking(0.9)
      .foregroundStyle(Palette.ink2)
  }
}

/// The top strip: a Pause target (left) + the lift counter (center). The system
/// clock is drawn by watchOS at top-right, so we leave that corner empty.
private struct TopStrip: View {
  var onPause: (() -> Void)? = nil
  var lift: (i: Int, n: Int)? = nil
  var body: some View {
    HStack {
      if let onPause {
        Button(action: onPause) {
          HStack(spacing: 3) {
            Capsule().fill(Palette.ink1).frame(width: 3, height: 12)
            Capsule().fill(Palette.ink1).frame(width: 3, height: 12)
          }
          // A real ~44pt hit target — the bare glyph was ~9pt, so the first taps
          // missed (the "pause needs several taps" defect).
          .frame(width: 40, height: 32, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      } else {
        Spacer().frame(width: 1)
      }
      Spacer()
      if let lift {
        Text("LIFT \(lift.i)/\(lift.n)")
          .font(.system(size: 11, design: .monospaced)).tracking(0.6)
          .foregroundStyle(Palette.ink2)
      }
      Spacer()
      Spacer().frame(width: 14) // keep clear of the OS clock
    }
    .frame(height: 18)
  }
}

/// The affordance to act. primary = ochre; onstage = white-on-dark; ghost = quiet.
struct StageButton: View {
  enum Kind { case primary, onstage, ghost }
  let title: String
  var kind: Kind = .primary
  var height: CGFloat = 44
  var fontSize: CGFloat = 16
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: fontSize, weight: .semibold))
        .frame(maxWidth: .infinity).frame(height: height)
        .foregroundStyle(fg)
        .background(bg)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
    .buttonStyle(.plain)
  }
  private var fg: Color { kind == .primary ? Palette.onAccent : kind == .onstage ? Palette.stage0 : Palette.ink1 }
  private var bg: Color { kind == .primary ? Palette.signal : kind == .onstage ? Palette.ink0 : .clear }
}

/// A square raised icon target on the stage (Edit pencil, −/+).
private struct IconBtn: View {
  let system: String
  var side: CGFloat = 52
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Image(systemName: system).font(.system(size: 17, weight: .semibold))
        .frame(width: side, height: side)
        .foregroundStyle(Palette.ink0)
        .background(Palette.stage1)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}

private struct Triangle: Shape {
  func path(in r: CGRect) -> Path {
    var p = Path()
    p.move(to: CGPoint(x: r.midX, y: r.minY))
    p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
    p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
    p.closeSubpath()
    return p
  }
}

/// The signature mark: how the load changed vs last time. Sage ▲ / clay ▼ / hold.
struct LoadDelta: View {
  let deltaKg: Double
  var fontSize: CGFloat = 12
  var body: some View {
    let dir = deltaKg > 0 ? 1 : deltaKg < 0 ? -1 : 0
    let color = dir > 0 ? Palette.up : dir < 0 ? Palette.down : Palette.ink2
    let wash = dir > 0 ? Palette.upWash : dir < 0 ? Palette.downWash : Palette.stage1
    HStack(spacing: 4) {
      if dir > 0 {
        Triangle().fill(color).frame(width: 8, height: 6)
      } else if dir < 0 {
        Triangle().fill(color).rotationEffect(.degrees(180)).frame(width: 8, height: 6)
      } else {
        RoundedRectangle(cornerRadius: 1).fill(color).frame(width: 7, height: 2)
      }
      Text(label(dir)).font(.system(size: fontSize, weight: .medium, design: .monospaced)).foregroundStyle(color)
    }
    .padding(.horizontal, 7).padding(.vertical, 3)
    .background(wash).clipShape(Capsule())
  }
  private func label(_ dir: Int) -> String {
    if dir == 0 { return "hold" }
    return (dir > 0 ? "+" : "−") + fmtW(abs(deltaKg)) + " kg"
  }
}

/// Set-progress dots: done = sage, current = elongated ochre, upcoming = stage line.
private struct SetDots: View {
  let total: Int
  let index: Int // 0-based current; everything below it is done
  var body: some View {
    HStack(spacing: 6) {
      ForEach(0..<max(total, 1), id: \.self) { i in
        Capsule()
          .fill(i < index ? Palette.up : i == index ? Palette.signal : Palette.stage2)
          .frame(width: i == index ? 18 : 7, height: 7)
      }
    }
  }
}

private struct DrawCheck: View {
  var size: CGFloat = 22
  var body: some View {
    Image(systemName: "checkmark").font(.system(size: size, weight: .bold)).foregroundStyle(Palette.up)
  }
}

/// The countdown ring — a mechanical linear sweep, mono time at centre. Drift-proof
/// + Always-On safe: it recomputes from the phone-supplied absolute end every tick,
/// so whenever it is shown it is correct (the gym-defining glance).
private struct RestRing: View {
  let endsAt: String?
  let totalS: Int
  let diameter: CGFloat
  /// The label under the time while counting (design: "REST" inter-set, "NEXT" on transition).
  var restingLabel: String = "REST"
  var body: some View {
    let end = WatchWire.parseDate(endsAt)
    let stroke = max(6, diameter * 0.05)
    TimelineView(.periodic(from: .now, by: 0.5)) { ctx in
      let remaining = max(0, end.map { $0.timeIntervalSince(ctx.date) } ?? 0)
      let frac = totalS > 0 ? min(1, max(0, remaining / Double(totalS))) : 0
      let ready = remaining <= 0.5
      ZStack {
        Circle().stroke(Palette.stage2, lineWidth: stroke)
        Circle().trim(from: 0, to: frac)
          .stroke(Palette.signal, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
          .rotationEffect(.degrees(-90))
        VStack(spacing: 1) {
          Text(fmtTime(remaining))
            .font(.system(size: diameter * 0.23, weight: .semibold, design: .monospaced))
            .monospacedDigit().foregroundStyle(Palette.ink0)
          Text(ready ? "READY" : restingLabel).font(.system(size: 9, weight: .medium)).tracking(0.8).foregroundStyle(Palette.ink2)
        }
      }
    }
    .frame(width: diameter, height: diameter)
  }
}

private struct Metric: View {
  let value: String
  let label: String
  var body: some View {
    VStack(spacing: 2) {
      Text(value).font(.system(size: 18, weight: .semibold, design: .monospaced)).foregroundStyle(Palette.ink0)
      Legend(label, size: 9)
    }
    .frame(maxWidth: .infinity)
  }
}

// MARK: Root

struct WatchRootView: View {
  @ObservedObject var model: WatchModel
  var body: some View {
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Palette.stage0.ignoresSafeArea())
      .onReceive(model.onEntryHaptic) { WatchHaptics.play($0) }
  }

  @ViewBuilder private var content: some View {
    switch model.screen {
    case .idle:
      Image(systemName: "dumbbell.fill").font(.title).foregroundStyle(Palette.ink2)
    case let .start(lobby):
      StartScreen(lobby: lobby, onBegin: model.begin, onSelect: model.selectWorkout)
    case let .connectionLost(m):
      ConnectionLostScreen(mirror: m)
    case let .workoutComplete(m):
      CompleteScreen(mirror: m, onDone: model.dismissComplete)
    case let .setConfirmation(weight, reps, index, total):
      ConfirmScreen(weight: weight, reps: reps, index: index, total: total, onTap: model.dismissSetConfirm)
    case let .activeSet(m, draft):
      ActiveSetScreen(mirror: m, draft: draft, onSave: model.saveEdit,
                      onComplete: model.completeSet, onPause: model.pause, onSwap: model.swap)
    case let .interRest(m):
      InterRestScreen(mirror: m, onReady: model.ready, onAdd: model.addRest, onPause: model.pause)
    case let .transitionRest(m):
      TransitionRestScreen(mirror: m, onReady: model.ready, onAdd: model.addRest, onPause: model.pause, onSwap: model.swap)
    case .paused:
      PausedScreen(onResume: model.resume, onEnd: model.endWorkout)
    }
  }
}

// MARK: 01 · Workout Start

struct StartScreen: View {
  let lobby: WireLobby
  let onBegin: () -> Void
  let onSelect: (String) -> Void
  @State private var showList = false
  private var resting: Bool { lobby.resting == true }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      TopStrip()
      // The whole text unit sits at the TOP (NEXT WORKOUT ~level with the clock),
      // so the muscle line no longer hugs the Begin button — a Spacer opens the gap.
      VStack(alignment: .leading, spacing: 6) {
        Legend(WatchCopy.nextWorkout)
        Text(resting ? "Recovery" : lobby.workoutName)
          .font(.system(size: 26, weight: .semibold)).foregroundStyle(Palette.ink0).lineLimit(2)
        if resting {
          Text(WatchCopy.recovery).font(.system(size: 12)).foregroundStyle(Palette.ink2).lineLimit(3)
        } else {
          HStack(spacing: 6) {
            if let n = lobby.lifts {
              Text(WatchCopy.lifts(n)).font(.system(size: 14, design: .monospaced)).foregroundStyle(Palette.ink1)
            }
            if let d = lobby.durationLabel {
              Text("·").foregroundStyle(Palette.stage2)
              Text(d).font(.system(size: 14, design: .monospaced)).foregroundStyle(Palette.ink1)
            }
          }
          Text(lobby.muscles).font(.system(size: 12)).foregroundStyle(Palette.ink2).lineLimit(2)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 2)
      Spacer(minLength: 10)
      VStack(spacing: 6) {
        if !resting {
          StageButton(title: WatchCopy.begin, kind: .primary, height: 50, fontSize: 18, action: onBegin)
        }
        StageButton(title: WatchCopy.chooseWorkout, kind: .ghost, height: 36, fontSize: 14) { showList = true }
      }
    }
    .padding(.horizontal, 10).padding(.bottom, 8)
    .sheet(isPresented: $showList) {
      ChooseOverlay(lobby: lobby) { id in onSelect(id); showList = false }
    }
  }
}

struct ChooseOverlay: View {
  let lobby: WireLobby
  let onSelect: (String) -> Void
  var body: some View {
    List {
      ForEach(lobby.workouts, id: \.id) { w in
        Button { onSelect(w.id) } label: {
          VStack(alignment: .leading, spacing: 3) {
            HStack {
              Text(w.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink0)
              Spacer()
              if w.done == true { Legend(WatchCopy.done, size: 9) }
            }
            Text("\(w.lifts ?? 0) lifts · \(w.muscles ?? "")")
              .font(.system(size: 11, design: .monospaced)).foregroundStyle(Palette.ink2).lineLimit(1)
          }
        }
        .listRowBackground(
          RoundedRectangle(cornerRadius: 10)
            .fill(Palette.stage1)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(w.id == lobby.workoutId ? Palette.signal : .clear, lineWidth: 2))
        )
      }
    }
    .listStyle(.carousel)
    .background(Palette.stage0)
  }
}

// MARK: 02 · Active Set (read + inline edit)

struct ActiveSetScreen: View {
  let mirror: WireMirror
  let draft: EditDraft?
  let onSave: (Double?, Int) -> Void
  let onComplete: () -> Void
  let onPause: () -> Void
  let onSwap: (String) -> Void

  @State private var editing = false
  @State private var field: EditField = .weight
  @State private var w: Double = 0
  @State private var r: Double = 0
  @State private var crown: Double = 0
  @State private var showSwap = false

  private var bodyweight: Bool { mirror.targetWeight == nil }
  private var shownWeight: Double? { draft?.weight ?? mirror.targetWeight }
  private var shownReps: Int { draft?.reps ?? mirror.targetReps }
  private var swaps: [WireSwapOption] { mirror.swapOptions ?? [] }

  var body: some View {
    VStack(spacing: 0) {
      TopStrip(onPause: onPause, lift: (i: mirror.liftIndex ?? 1, n: mirror.liftCount ?? 1))
      header
      Spacer(minLength: 2)
      if editing { editor } else { readout }
      Spacer(minLength: 2)
      if !editing {
        SetDots(total: mirror.setsInExercise ?? 1, index: (mirror.setNumber ?? 1) - 1)
        Text(mirror.setLabel).font(.system(size: 11, design: .monospaced)).foregroundStyle(Palette.ink2).padding(.top, 4)
      }
      footer
    }
    .padding(.horizontal, 8).padding(.bottom, 6)
    .focusable(editing)
    .digitalCrownRotation(
      $crown,
      from: 0, through: field == .weight ? 600 : 50,
      by: 1, sensitivity: .low, isContinuous: false
    )
    .onChange(of: crown) { _, v in
      guard editing else { return }
      // Whole-number steps (kg + reps) — no decimal point, like the rest of the app.
      if field == .weight { if !bodyweight { w = max(0, v.rounded()) } } else { r = max(0, v.rounded()) }
    }
    .onChange(of: field) { _, f in crown = f == .weight ? w : r }
    .sheet(isPresented: $showSwap) {
      SwapOverlay(
        currentName: mirror.exerciseName,
        options: swaps,
        onPick: { id in onSwap(id); showSwap = false },
        onCancel: { showSwap = false }
      )
    }
  }

  private var header: some View {
    // Muscle group intentionally omitted (founder: drop CHEST/BACK everywhere to
    // open the small screen) — just the exercise name + the swap affordance.
    HStack(spacing: 6) {
      Text(mirror.exerciseName).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink0).lineLimit(1)
      if !swaps.isEmpty && !editing {
        Button { showSwap = true } label: { Image(systemName: "repeat").font(.system(size: 13)) }
          .buttonStyle(.plain).foregroundStyle(Palette.ink2)
      }
    }
  }

  private var readout: some View {
    VStack(spacing: 12) {
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        if let wt = shownWeight {
          Text(fmtW(wt)).font(.system(size: 46, weight: .semibold, design: .monospaced)).monospacedDigit().foregroundStyle(Palette.ink0)
          Text(WatchCopy.kg).font(.system(size: 14, design: .monospaced)).foregroundStyle(Palette.ink2)
        } else {
          Text(WatchCopy.bodyweight).font(.system(size: 30, weight: .semibold)).foregroundStyle(Palette.ink0)
        }
      }
      HStack(spacing: 12) {
        LoadDelta(deltaKg: mirror.loadDeltaKg ?? 0)
        Text("× \(shownReps)").font(.system(size: 16, design: .monospaced)).foregroundStyle(Palette.ink1)
      }
    }
  }

  private var editor: some View {
    VStack(spacing: 8) {
      Button { if !bodyweight { field = .weight } } label: {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
          Text(bodyweight ? WatchCopy.bodyweight : fmtW(w)).font(.system(size: 34, weight: .semibold, design: .monospaced)).monospacedDigit()
          if !bodyweight { Text(" " + WatchCopy.kg).font(.system(size: 14, design: .monospaced)).foregroundStyle(Palette.ink2) }
        }
        .foregroundStyle(field == .weight ? Palette.ink0 : Palette.ink2)
        .overlay(alignment: .bottom) { underline(field == .weight && !bodyweight) }
      }
      .buttonStyle(.plain).disabled(bodyweight)
      Button { field = .reps } label: {
        Text("× \(Int(r))").font(.system(size: 22, weight: .semibold, design: .monospaced))
          .foregroundStyle(field == .reps ? Palette.ink0 : Palette.ink2)
          .overlay(alignment: .bottom) { underline(field == .reps) }
      }
      .buttonStyle(.plain)
      // No −/+ buttons: the Digital Crown is the adjuster (whole steps), so the
      // hint spans the full row and reads clearly instead of truncating to "CROWN TO AD…".
      HStack(spacing: 5) {
        Image(systemName: "digitalcrown.horizontal.press").font(.system(size: 12))
        Text(WatchCopy.crownToAdjust).font(.system(size: 12, weight: .medium))
      }
      .foregroundStyle(Palette.signal)
      .frame(maxWidth: .infinity, alignment: .center)
      .padding(.top, 4)
    }
  }

  private func underline(_ on: Bool) -> some View {
    Rectangle().fill(on ? Palette.signal : .clear).frame(height: 2).offset(y: 3)
  }

  private var footer: some View {
    HStack(spacing: 8) {
      // A bare glyph that sits ON the stage (no raised tile) — keeps a real tap
      // target via contentShape, but reads as part of the black, not a button.
      Button {
        if editing { commit() } else { enterEdit() }
      } label: {
        Image(systemName: editing ? "checkmark" : "pencil")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(Palette.ink1)
          .frame(width: 38, height: 52)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      StageButton(title: editing ? WatchCopy.save : WatchCopy.completeSet, kind: .primary, height: 52, fontSize: 17) {
        if editing { commit() } else { onComplete() }
      }
    }
    .padding(.top, 6)
  }

  private func enterEdit() {
    w = (shownWeight ?? 0).rounded() // whole kg — no decimals on the watch
    r = Double(shownReps)
    field = bodyweight ? .reps : .weight
    crown = field == .weight ? w : r
    editing = true
  }
  private func commit() {
    onSave(bodyweight ? nil : w, Int(r))
    editing = false
  }
}

// MARK: 03 · Set Confirmation

struct ConfirmScreen: View {
  let weight: Double?
  let reps: Int
  let index: Int
  let total: Int
  let onTap: () -> Void
  var body: some View {
    VStack(spacing: 0) {
      TopStrip()
      Spacer()
      HStack(spacing: 8) {
        DrawCheck(size: 22)
        Legend(WatchCopy.setLogged(index, total), size: 11)
      }
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(weight == nil ? WatchCopy.bodyweight : fmtW(weight!))
          .font(.system(size: 56, weight: .semibold, design: .monospaced)).monospacedDigit()
        Text("×").font(.system(size: 24, design: .monospaced)).foregroundStyle(Palette.ink2)
        Text("\(reps)").font(.system(size: 56, weight: .semibold, design: .monospaced)).monospacedDigit()
      }
      .foregroundStyle(Palette.ink0).padding(.top, 16)
      Text(WatchCopy.recorded).font(.system(size: 14)).foregroundStyle(Palette.ink2).padding(.top, 12)
      Spacer()
    }
    .padding(.horizontal, 10)
    .contentShape(Rectangle())
    .onTapGesture(perform: onTap)
  }
}

// MARK: 04 · Inter-Set Rest

struct InterRestScreen: View {
  let mirror: WireMirror
  let onReady: () -> Void
  let onAdd: () -> Void
  let onPause: () -> Void
  private var ready: Bool { (mirror.restRemainingS ?? 0) <= 0 }

  var body: some View {
    VStack(spacing: 0) {
      TopStrip(onPause: onPause, lift: (i: mirror.liftIndex ?? 1, n: mirror.liftCount ?? 1))
      Spacer(minLength: 2)
      // Slightly smaller ring leaves room for the meta line (reps were being cut)
      // and the +15 button — still the most prominent mark on the screen.
      RestRing(endsAt: mirror.restEndsAt, totalS: mirror.restTotalS ?? 90, diameter: 104)
      Spacer(minLength: 4)
      VStack(spacing: 2) {
        Legend(WatchCopy.upNext)
        Text(mirror.exerciseName).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink0).lineLimit(1)
        // Scale-to-fit so the trailing "× reps" never truncates on the 41 mm case.
        Text("\(mirror.setLabel) · \(targetText)")
          .font(.system(size: 12, design: .monospaced)).foregroundStyle(Palette.ink2)
          .lineLimit(1).minimumScaleFactor(0.7)
      }
      Spacer(minLength: 4)
      StageButton(title: ready ? WatchCopy.startNextSet : WatchCopy.skipRest, kind: ready ? .primary : .onstage, height: 44, fontSize: 16, action: onReady)
      if !ready {
        StageButton(title: WatchCopy.addRest, kind: .ghost, height: 30, fontSize: 13, action: onAdd)
      }
    }
    .padding(.horizontal, 10).padding(.bottom, 6)
  }

  private var targetText: String {
    let w = mirror.targetWeight.map { "\(fmtW($0)) \(WatchCopy.kg)" } ?? WatchCopy.bodyweight
    return "\(w) · × \(mirror.targetReps)"
  }
}

// MARK: 05 · Transition Rest

struct TransitionRestScreen: View {
  let mirror: WireMirror
  let onReady: () -> Void
  let onAdd: () -> Void
  let onPause: () -> Void
  let onSwap: (String) -> Void
  @State private var showSwap = false
  private var ready: Bool { (mirror.restRemainingS ?? 0) <= 0 }
  private var swaps: [WireSwapOption] { mirror.nextSwapOptions ?? [] }

  var body: some View {
    VStack(spacing: 0) {
      TopStrip(onPause: onPause, lift: (i: (mirror.liftIndex ?? 1) + 1, n: mirror.liftCount ?? 1))
      Spacer(minLength: 2)
      RestRing(endsAt: mirror.restEndsAt, totalS: mirror.restTotalS ?? 120, diameter: 96, restingLabel: "NEXT")
      Spacer(minLength: 6)
      card
      Spacer(minLength: 4)
      StageButton(title: WatchCopy.startNextLift, kind: ready ? .primary : .onstage, height: 44, fontSize: 16, action: onReady)
      if !ready {
        StageButton(title: WatchCopy.addRest, kind: .ghost, height: 30, fontSize: 13, action: onAdd)
      }
    }
    .padding(.horizontal, 10).padding(.bottom, 6)
    .sheet(isPresented: $showSwap) {
      SwapOverlay(
        currentName: mirror.nextExerciseName ?? "",
        options: swaps,
        onPick: { id in onSwap(id); showSwap = false },
        onCancel: { showSwap = false }
      )
    }
  }

  private var card: some View {
    // Muscle group omitted (founder: no CHEST/BACK labels); the ring already reads
    // "NEXT", so the card leads straight with the exercise name.
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .top) {
        Text(mirror.nextExerciseName ?? "").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink0).lineLimit(1)
        Spacer()
        if !swaps.isEmpty {
          Button { showSwap = true } label: { Image(systemName: "repeat").font(.system(size: 14)) }
            .buttonStyle(.plain).foregroundStyle(Palette.ink2)
        }
      }
      HStack(alignment: .bottom) {
        Text("\(mirror.nextSetsInExercise ?? 0) sets · × \(mirror.nextTargetReps ?? 0)")
          .font(.system(size: 12, design: .monospaced)).foregroundStyle(Palette.ink2)
        Spacer()
        VStack(alignment: .trailing, spacing: 3) {
          HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(mirror.nextTargetWeight.map(fmtW) ?? "BW").font(.system(size: 22, weight: .semibold, design: .monospaced))
            if mirror.nextTargetWeight != nil { Text(" " + WatchCopy.kg).font(.system(size: 12, design: .monospaced)).foregroundStyle(Palette.ink2) }
          }.foregroundStyle(Palette.ink0)
          if (mirror.nextLoadDeltaKg ?? 0) != 0 { LoadDelta(deltaKg: mirror.nextLoadDeltaKg ?? 0, fontSize: 11) }
        }
      }
    }
    .padding(12)
    .background(Palette.stage1).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

// MARK: Swap overlay

struct SwapOverlay: View {
  let currentName: String
  let options: [WireSwapOption]
  let onPick: (String) -> Void
  let onCancel: () -> Void
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        Legend(WatchCopy.swapTitle, size: 10)
        Text(WatchCopy.swapHint).font(.system(size: 11)).foregroundStyle(Palette.ink2)
          .padding(.bottom, 2)
        // The current exercise — highlighted, not re-selectable.
        HStack {
          Text(currentName).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink0).lineLimit(1)
          Spacer()
          Text(WatchCopy.current.uppercased())
            .font(.system(size: 10, weight: .medium, design: .monospaced)).tracking(0.6)
            .foregroundStyle(Palette.signal)
        }
        .padding(.horizontal, 12).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
          RoundedRectangle(cornerRadius: 12).fill(Palette.stage1)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.signal, lineWidth: 2))
        )
        // The 2 closest-in-effect alternatives.
        ForEach(options, id: \.id) { o in
          Button { onPick(o.id) } label: {
            Text(o.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink0)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, 12).padding(.vertical, 12)
              .background(RoundedRectangle(cornerRadius: 12).fill(Palette.stage1))
          }
          .buttonStyle(.plain)
        }
        Button(action: onCancel) {
          Text(WatchCopy.cancel).font(.system(size: 15)).foregroundStyle(Palette.ink1)
            .frame(maxWidth: .infinity).padding(.vertical, 8)
        }
        .buttonStyle(.plain)
      }
      .padding(.horizontal, 10).padding(.vertical, 6)
    }
    .background(Palette.stage0)
  }
}

// MARK: 06 · Complete

struct CompleteScreen: View {
  let mirror: WireMirror
  let onDone: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      TopStrip()
      Spacer(minLength: 4)
      HStack(spacing: 8) { DrawCheck(size: 18); Legend(WatchCopy.saved, size: 11) }
      Text(WatchCopy.complete(mirror.workoutName ?? ""))
        .font(.system(size: 26, weight: .semibold)).foregroundStyle(Palette.ink0)
        .lineLimit(2).minimumScaleFactor(0.7).fixedSize(horizontal: false, vertical: true)
        .padding(.top, 10)
      if let s = mirror.summary {
        HStack(spacing: 8) {
          Metric(value: s.timeLabel, label: WatchCopy.metricTime)
          Metric(value: "\(s.sets)", label: WatchCopy.metricSets)
          Metric(value: "\(s.up) ↑", label: WatchCopy.metricUp)
        }
        .padding(.top, 16)
        .overlay(alignment: .top) { Rectangle().fill(Palette.stage2).frame(height: 1).offset(y: 8) }
      }
      Spacer(minLength: 8)
      StageButton(title: WatchCopy.done, kind: .primary, height: 48, fontSize: 16, action: onDone)
    }
    .padding(.horizontal, 12).padding(.bottom, 8)
  }
}

// MARK: 07 · Paused

struct PausedScreen: View {
  let onResume: () -> Void
  let onEnd: () -> Void
  var body: some View {
    VStack(spacing: 0) {
      TopStrip()
      Spacer()
      Legend(WatchCopy.workoutHeld, size: 11)
      Text(WatchCopy.pausedTitle).font(.system(size: 34, weight: .semibold)).foregroundStyle(Palette.ink0).padding(.top, 6)
      Spacer()
      StageButton(title: WatchCopy.resume, kind: .primary, height: 52, fontSize: 18, action: onResume)
      StageButton(title: WatchCopy.endWorkout, kind: .ghost, height: 40, fontSize: 14, action: onEnd)
    }
    .padding(.horizontal, 10).padding(.bottom, 8)
  }
}

// MARK: Connection Lost (the trust state — a watch-structure necessity)

struct ConnectionLostScreen: View {
  let mirror: WireMirror?
  var body: some View {
    ZStack {
      if let m = mirror {
        VStack(spacing: 4) {
          Text(m.exerciseName).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink0.opacity(0.25)).lineLimit(1)
          Text(m.setLabel).font(.system(size: 12)).foregroundStyle(Palette.ink2.opacity(0.6))
        }
      }
      VStack(spacing: 6) {
        Image(systemName: "wifi.slash").font(.title3).foregroundStyle(Palette.ink2)
        Text(WatchCopy.reconnecting).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink0)
        Text(WatchCopy.continueOnPhone).font(.system(size: 11)).foregroundStyle(Palette.ink2)
      }
    }
    .padding(.horizontal, 10)
  }
}
