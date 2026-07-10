import SwiftUI
import WatchKit

// SwiftUI realization of the Claude Design watch (ui_kits/watch) — "the same
// instrument, on the wrist." The watch IS the inverted "stage": a warm graphite
// surface, off-white ink, ONE ochre signal, sage/clay load deltas, and mono numbers
// (the load is the largest mark on any Hush surface). Six live screens + the carried-
// over Choose / Edit / Swap / Pause. The phone is the sole authority; every button
// proposes an intent.
//
// Execution screens page HORIZONTALLY (founder 2026-07-10, the Apple Workout idiom):
// swipe right → the Controls page (big Pause / End + live Elapsed / Heart / Kcal from
// the OS workout runtime), so the main stage stays pure execution. Nothing scrolls
// vertically during execution on ANY case size; hero marks scale UP on the larger
// cases (Fit) so an Ultra fills its canvas instead of wearing a 40 mm layout.
//
// Colors are the sRGB conversion of the design's oklch stage tokens (tokens/colors.css).

// MARK: Fit (case-size scale)

/// One scale factor for the hero marks, derived from the case height: 1.0 on the
/// smallest supported case (40 mm ≈ 197 pt) up to ~1.27 on the 49 mm Ultra. Body
/// text and legends stay fixed (they are already sized for the smallest case);
/// only the marks that should GROW with the canvas go through `Fit.s`.
enum Fit {
  static let factor: CGFloat = {
    let h = WKInterfaceDevice.current().screenBounds.height
    return min(1.3, max(1.0, h / 197))
  }()
  static func s(_ v: CGFloat) -> CGFloat { (v * factor).rounded() }
}

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

/// Compact equipment-native setup line (kg) for the wrist — so the athlete never does mental math
/// (item 11). Barbell/plate → "20 + 20 /side"; machine → "pin 55"; dumbbell → "per hand". Returns
/// nil when there's nothing useful to add (e.g. a fixed bar, where the headline already IS the load).
private func setupLine(_ s: WireLoadSetup?) -> String? {
  guard let s else { return nil }
  switch s.style {
  case "barbell", "plate_loaded":
    if let plates = s.plates, !plates.isEmpty {
      return plates.map { fmtW($0) }.joined(separator: " + ") + " /side"
    }
    if let ps = s.perSide, ps > 0 { return fmtW(ps) + " /side" }
    return nil
  case "dumbbell":
    return WatchCopy.perHand
  case "selectorized", "cable":
    if let pin = s.pin { return WatchCopy.pin + " " + fmtW(pin) }
    return nil
  default:
    return nil
  }
}

/// Instruction-first execution language. TO-LOAD = an imperative verb + only the info the hero load
/// doesn't already give (per-side for barbell/plate; nothing for pin/fixed/dumbbell since the hero
/// IS the action figure — dumbbell adds the per-hand placement).
private struct ExecInstruction { let verb: String; let figure: String? }
private func execInstruction(_ s: WireLoadSetup?) -> ExecInstruction? {
  guard let s else { return nil }
  switch s.style {
  case "barbell", "plate_loaded": return ExecInstruction(verb: WatchCopy.exLoad, figure: setupLine(s))
  case "dumbbell":
    let fig = s.perHand.map { "\(fmtW($0)) \(WatchCopy.kg) \(WatchCopy.exDumbbells)" }
    return ExecInstruction(verb: WatchCopy.exUse, figure: fig)
  case "selectorized", "cable": return ExecInstruction(verb: WatchCopy.exSetPin, figure: nil)
  case "fixed_barbell": return ExecInstruction(verb: WatchCopy.exTakeBar, figure: nil)
  default: return nil
  }
}

/// LOADED-state confirmation (quiet) for the current set's equipment.
private func execConfirmation(_ s: WireLoadSetup?) -> String? {
  guard let s else { return nil }
  switch s.style {
  case "barbell", "plate_loaded":
    if let line = setupLine(s) { return WatchCopy.exLoaded + " · " + line }
    return WatchCopy.exLoaded
  case "dumbbell": return WatchCopy.exInHand
  case "selectorized", "cable": return WatchCopy.exPinSet
  case "fixed_barbell": return WatchCopy.exBarReady
  default: return nil
  }
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

/// The top strip: the lift counter, pinned top-LEFT. The Apple Watch draws its
/// clock at top-RIGHT of every app — that whole corner is OURS TO LEAVE EMPTY, so
/// the strip holds exactly one element, leading-aligned, and nothing else. Pause
/// no longer lives here (founder 2026-07-10): it moved whole to the Controls page
/// (swipe right), keeping the main stage pure execution.
private struct TopStrip: View {
  var lift: (i: Int, n: Int)? = nil
  var body: some View {
    HStack {
      if let lift {
        Text("LIFT \(lift.i)/\(lift.n)")
          .font(.system(size: 11, design: .monospaced)).tracking(0.6)
          .foregroundStyle(Palette.ink2)
      }
      Spacer(minLength: 40) // the trailing half stays clear of the watch clock
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
        .frame(maxWidth: .infinity).frame(height: Fit.s(height)) // taller targets on larger cases
        .foregroundStyle(fg)
        .background(bg)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
    .buttonStyle(.plain)
  }
  private var fg: Color { kind == .primary ? Palette.onAccent : kind == .onstage ? Palette.stage0 : Palette.ink1 }
  private var bg: Color { kind == .primary ? Palette.signal : kind == .onstage ? Palette.ink0 : .clear }
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

private struct DrawCheck: View {
  var size: CGFloat = 22
  var body: some View {
    Image(systemName: "checkmark").font(.system(size: size, weight: .bold)).foregroundStyle(Palette.up)
  }
}

/// The countdown ring — a CONTINUOUS, fluid linear sweep, mono time at centre. Drift-proof
/// + Always-On safe: `TimelineView(.animation)` recomputes the arc from the phone-supplied
/// ABSOLUTE end on every display frame (not in 0.5 s steps), so the sweep is smooth — matching
/// the iPhone ring — and a +15 s top-up (the end + total both move out) simply fills forward and
/// keeps draining without a stutter. Whenever it is shown it is correct (the gym-defining glance).
private struct RestRing: View {
  let endsAt: String?
  let totalS: Int
  let diameter: CGFloat
  /// The label under the time while counting (design: "REST" inter-set, "NEXT" on transition).
  var restingLabel: String = "REST"
  var body: some View {
    let end = WatchWire.parseDate(endsAt)
    let stroke = max(5, diameter * 0.055)
    TimelineView(.animation) { ctx in
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
            .font(.system(size: diameter * 0.24, weight: .semibold, design: .monospaced))
            .monospacedDigit().foregroundStyle(Palette.ink0)
          Text(ready ? "READY" : restingLabel).font(.system(size: 9, weight: .medium)).tracking(0.8).foregroundStyle(Palette.ink2)
        }
      }
    }
    .frame(width: diameter, height: diameter)
  }
}

/// Compact actions row for the rest screens: the full-width primary (Skip rest / Start) with a
/// fixed-width "+15s" button beside it — so BOTH stay visible with NO scrolling on every case size
/// (founder: nothing scrolls during execution). When the rest is already up, only the primary shows.
private struct RestActions: View {
  let ready: Bool
  let primaryTitle: String
  let onReady: () -> Void
  let onAdd: () -> Void
  var body: some View {
    HStack(spacing: 6) {
      StageButton(title: primaryTitle, kind: ready ? .primary : .onstage, height: 42, fontSize: 15, action: onReady)
      if !ready {
        Button(action: onAdd) {
          Text(WatchCopy.addShort)
            .font(.system(size: 14, weight: .semibold))
            .frame(width: Fit.s(54), height: Fit.s(42))
            .foregroundStyle(Palette.ink0)
            .background(Palette.stage1)
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
        .buttonStyle(.plain)
      }
    }
  }
}

private struct Metric: View {
  let value: String
  let label: String
  var body: some View {
    VStack(spacing: 2) {
      Text(value).font(.system(size: Fit.s(18), weight: .semibold, design: .monospaced)).foregroundStyle(Palette.ink0)
      Legend(label, size: 9)
    }
    .frame(maxWidth: .infinity)
  }
}

// MARK: Controls page (swipe right during execution — the Apple Workout idiom)

/// Big Pause / End plus the live body metrics (Elapsed / Heart / Kcal from the OS
/// workout runtime). Lives one page LEFT of every execution screen so the main stage
/// carries only the work; everything here is secondary-but-reachable. Metrics degrade
/// to placeholders when HealthKit has no data — never a blocker, never a fake number.
private struct ControlsScreen: View {
  @ObservedObject var metrics: LiveMetrics
  let workoutName: String?
  let onPause: () -> Void
  let onEnd: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      TopStrip() // top-right stays clear for the Apple Watch clock
      VStack(alignment: .leading, spacing: 2) {
        Legend(WatchCopy.controls)
        if let name = workoutName, !name.isEmpty {
          Text(name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink1).lineLimit(1)
        }
      }
      Spacer(minLength: 4)
      TimelineView(.periodic(from: .now, by: 1)) { _ in
        HStack(spacing: 6) {
          Metric(value: elapsedText, label: WatchCopy.metricElapsed)
          Metric(value: metrics.heartRateBpm.map { "\($0)" } ?? "––", label: WatchCopy.metricHeart)
          Metric(value: metrics.activeKcal.map { "\($0)" } ?? "––", label: WatchCopy.metricKcal)
        }
      }
      Spacer(minLength: 6)
      VStack(spacing: 6) {
        StageButton(title: WatchCopy.pause, kind: .primary, height: 46, fontSize: 16, action: onPause)
        StageButton(title: WatchCopy.endWorkout, kind: .ghost, height: 34, fontSize: 13, action: onEnd)
      }
    }
    .padding(.horizontal, 10).padding(.bottom, 6)
  }

  private var elapsedText: String {
    guard let s = metrics.elapsed() else { return "–:––" }
    return fmtTime(s)
  }
}

/// The horizontal pager around every execution screen: page 0 = Controls, page 1 = the
/// stage (default). Recreated on phase change, so it always re-opens ON the stage.
/// Index dots are suppressed — they would sit on the primary action on the small cases;
/// the swipe is the same muscle memory as Apple Workout.
private struct ExecutionPager<Content: View>: View {
  @ObservedObject var metrics: LiveMetrics
  let workoutName: String?
  let onPause: () -> Void
  let onEnd: () -> Void
  @ViewBuilder let content: () -> Content
  @State private var page = 1

  var body: some View {
    TabView(selection: $page) {
      ControlsScreen(metrics: metrics, workoutName: workoutName, onPause: onPause, onEnd: onEnd).tag(0)
      content().tag(1)
    }
    .tabViewStyle(.page(indexDisplayMode: .never))
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
      VStack(spacing: 8) {
        Image(systemName: "dumbbell.fill").font(.title).foregroundStyle(Palette.ink2)
        Text(WatchCopy.idleWaiting).font(.system(size: 12)).foregroundStyle(Palette.ink2)
      }
    case let .start(lobby):
      StartScreen(lobby: lobby, onBegin: model.begin, onSelect: model.selectWorkout)
    case let .connectionLost(m):
      ConnectionLostScreen(mirror: m)
    case let .workoutComplete(m):
      CompleteScreen(mirror: m, onDone: model.dismissComplete)
    case let .setConfirmation(weight, reps, index, total):
      ConfirmScreen(weight: weight, reps: reps, index: index, total: total, onTap: model.dismissSetConfirm)
    case let .activeSet(m, draft):
      ExecutionPager(metrics: model.liveMetrics, workoutName: m.workoutName, onPause: model.pause, onEnd: model.endWorkout) {
        ActiveSetScreen(mirror: m, draft: draft, onSave: model.saveEdit,
                        onComplete: model.completeSet, onSwap: model.swap)
      }
    case let .interRest(m):
      ExecutionPager(metrics: model.liveMetrics, workoutName: m.workoutName, onPause: model.pause, onEnd: model.endWorkout) {
        InterRestScreen(mirror: m, onReady: model.ready, onAdd: model.addRest)
      }
    case let .transitionRest(m):
      ExecutionPager(metrics: model.liveMetrics, workoutName: m.workoutName, onPause: model.pause, onEnd: model.endWorkout) {
        TransitionRestScreen(mirror: m, onReady: model.ready, onAdd: model.addRest, onSwap: model.swap)
      }
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
          .font(.system(size: Fit.s(26), weight: .semibold)).foregroundStyle(Palette.ink0).lineLimit(2)
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
      TopStrip(lift: (i: mirror.liftIndex ?? 1, n: mirror.liftCount ?? 1))
      header
      Spacer(minLength: 2)
      if editing { editor } else { readout }
      Spacer(minLength: 2)
      // Set progress is EXPLICIT TEXT only (founder: on the wrist, prefer unambiguous clarity over a
      // decorative indicator; the dots duplicated this exact information and cost space on the
      // smallest case). "Set n of m" + the top strip's "LIFT i/n" are the two progress signals.
      if !editing {
        Text(mirror.setLabel).font(.system(size: 12, design: .monospaced)).foregroundStyle(Palette.ink2)
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
      Text(mirror.exerciseName).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink0)
        .lineLimit(1).minimumScaleFactor(0.75) // long names shrink before truncating
      if !swaps.isEmpty && !editing {
        Button { showSwap = true } label: { Image(systemName: "repeat").font(.system(size: 13)) }
          .buttonStyle(.plain).foregroundStyle(Palette.ink2)
      }
    }
  }

  private var readout: some View {
    // Hierarchy (canonical-first): LOAD (hero) → INSTRUCTION (what to do now) → REPS → Δ.
    VStack(spacing: 6) {
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        if let wt = shownWeight {
          Text(fmtW(wt)).font(.system(size: Fit.s(42), weight: .semibold, design: .monospaced)).monospacedDigit().foregroundStyle(Palette.ink0)
          Text(WatchCopy.kg).font(.system(size: 14, design: .monospaced)).foregroundStyle(Palette.ink2)
        } else {
          Text(WatchCopy.bodyweight).font(.system(size: Fit.s(28), weight: .semibold)).foregroundStyle(Palette.ink0)
        }
      }
      instruction
      HStack(spacing: 10) {
        Text("× \(shownReps)").font(.system(size: 15, design: .monospaced)).foregroundStyle(Palette.ink1)
        if (mirror.loadDeltaKg ?? 0) != 0 { LoadDelta(deltaKg: mirror.loadDeltaKg ?? 0, fontSize: 10) }
      }
    }
  }

  /// The execution instruction, directly under the load. TO-LOAD = a bright imperative chip; once a
  /// set is logged at this load it becomes a quiet "loaded" confirmation (the bar is set).
  @ViewBuilder private var instruction: some View {
    let toLoad = mirror.toLoad ?? false
    if toLoad, let instr = execInstruction(mirror.loadSetup) {
      // One line (verb + figure) so the chip, reps, explicit set info and Complete all fit with no
      // scrolling on the 40/41 mm case.
      HStack(spacing: 6) {
        Text(instr.verb).font(.system(size: 11, weight: .semibold)).tracking(0.8).foregroundStyle(Palette.signal)
        if let f = instr.figure {
          Text(f).font(.system(size: 13, weight: .semibold, design: .monospaced)).foregroundStyle(Palette.ink0).lineLimit(1).minimumScaleFactor(0.7)
        }
      }
      .padding(.vertical, 5).padding(.horizontal, 12)
      .background(Palette.stage1).clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    } else if let line = execConfirmation(mirror.loadSetup) {
      HStack(spacing: 4) {
        Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Palette.up)
        Text(line).font(.system(size: 11, design: .monospaced)).foregroundStyle(Palette.ink2).lineLimit(1).minimumScaleFactor(0.7)
      }
    }
  }

  private var editor: some View {
    VStack(spacing: 8) {
      Button { if !bodyweight { field = .weight } } label: {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
          Text(bodyweight ? WatchCopy.bodyweight : fmtW(w)).font(.system(size: Fit.s(34), weight: .semibold, design: .monospaced)).monospacedDigit()
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
          .frame(width: 36, height: Fit.s(48)) // matches the Complete button's scaled height
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      StageButton(title: editing ? WatchCopy.save : WatchCopy.completeSet, kind: .primary, height: 48, fontSize: 17) {
        if editing { commit() } else { onComplete() }
      }
    }
    .padding(.top, 4)
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
          .font(.system(size: Fit.s(56), weight: .semibold, design: .monospaced)).monospacedDigit()
        Text("×").font(.system(size: Fit.s(24), design: .monospaced)).foregroundStyle(Palette.ink2)
        Text("\(reps)").font(.system(size: Fit.s(56), weight: .semibold, design: .monospaced)).monospacedDigit()
      }
      // A heavy load ("112.5 × 12") must stay ONE line on the 40 mm case — scale
      // down before ever wrapping or clipping.
      .lineLimit(1).minimumScaleFactor(0.55)
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
  private var ready: Bool { (mirror.restRemainingS ?? 0) <= 0 }

  var body: some View {
    // NO SCROLL: the ring, the next-set line, the equipment setup, and BOTH actions stay on screen
    // at once on every case size (founder: nothing scrolls during execution). The ring is sized
    // down and the two actions share one row so all of it fits even on the 40/41 mm case.
    VStack(spacing: 0) {
      TopStrip(lift: (i: mirror.liftIndex ?? 1, n: mirror.liftCount ?? 1))
      Spacer(minLength: 2)
      RestRing(endsAt: mirror.restEndsAt, totalS: mirror.restTotalS ?? 90, diameter: Fit.s(84))
      Spacer(minLength: 2)
      // The same exercise (next set) — name kept tight; load + reps on one mono line; then the
      // execution-grade setup line (how to load it).
      VStack(spacing: 1) {
        Text(mirror.exerciseName).font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink0)
          .lineLimit(1).minimumScaleFactor(0.75)
        Text("\(mirror.setLabel) · \(targetText)")
          .font(.system(size: 11, design: .monospaced)).foregroundStyle(Palette.ink2)
          .lineLimit(1).minimumScaleFactor(0.7)
        if let line = setupLine(mirror.loadSetup) {
          Text(line).font(.system(size: 11, weight: .medium, design: .monospaced)).foregroundStyle(Palette.signal).lineLimit(1)
        }
      }
      Spacer(minLength: 2)
      RestActions(ready: ready, primaryTitle: ready ? WatchCopy.startNextSet : WatchCopy.skipRest, onReady: onReady, onAdd: onAdd)
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
  let onSwap: (String) -> Void
  @State private var showSwap = false
  private var ready: Bool { (mirror.restRemainingS ?? 0) <= 0 }
  private var swaps: [WireSwapOption] { mirror.nextSwapOptions ?? [] }

  var body: some View {
    // NO SCROLL: ring + the next lift (name, load·reps, the execution setup line, the change) + BOTH
    // actions all stay visible at once. A plain block (no boxed card) keeps it within the 40/41 mm
    // height so nothing is ever clipped or scrolled during execution.
    VStack(spacing: 0) {
      TopStrip(lift: (i: (mirror.liftIndex ?? 1) + 1, n: mirror.liftCount ?? 1))
      Spacer(minLength: 2)
      RestRing(endsAt: mirror.restEndsAt, totalS: mirror.restTotalS ?? 120, diameter: Fit.s(78), restingLabel: "NEXT")
      Spacer(minLength: 2)
      VStack(spacing: 2) {
        HStack(spacing: 6) {
          Text(mirror.nextExerciseName ?? "").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink0)
            .lineLimit(1).minimumScaleFactor(0.75)
          if !swaps.isEmpty {
            Button { showSwap = true } label: { Image(systemName: "repeat").font(.system(size: 12)) }
              .buttonStyle(.plain).foregroundStyle(Palette.ink2)
          }
        }
        HStack(spacing: 6) {
          Text(nextTargetText)
            .font(.system(size: 11, design: .monospaced)).foregroundStyle(Palette.ink2)
            .lineLimit(1).minimumScaleFactor(0.7)
          if (mirror.nextLoadDeltaKg ?? 0) != 0 { LoadDelta(deltaKg: mirror.nextLoadDeltaKg ?? 0, fontSize: 9) }
        }
        if let line = setupLine(mirror.nextLoadSetup) {
          Text(line).font(.system(size: 11, weight: .medium, design: .monospaced)).foregroundStyle(Palette.signal).lineLimit(1)
        }
      }
      Spacer(minLength: 2)
      RestActions(ready: ready, primaryTitle: WatchCopy.startNextLift, onReady: onReady, onAdd: onAdd)
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

  private var nextTargetText: String {
    let w = mirror.nextTargetWeight.map { "\(fmtW($0)) \(WatchCopy.kg)" } ?? WatchCopy.bodyweight
    return "\(w) · × \(mirror.nextTargetReps ?? 0)"
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
        .font(.system(size: Fit.s(26), weight: .semibold)).foregroundStyle(Palette.ink0)
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
      Text(WatchCopy.pausedTitle).font(.system(size: Fit.s(34), weight: .semibold)).foregroundStyle(Palette.ink0).padding(.top, 6)
      Spacer()
      VStack(spacing: 6) {
        StageButton(title: WatchCopy.resume, kind: .primary, height: 52, fontSize: 18, action: onResume)
        StageButton(title: WatchCopy.endWorkout, kind: .ghost, height: 40, fontSize: 14, action: onEnd)
      }
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
