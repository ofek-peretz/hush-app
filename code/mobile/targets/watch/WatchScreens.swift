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
  // Charcoal-on-ochre (founder app law 2026-07-12, WCAG): the mark INSIDE an ochre button
  // is the warm graphite, never white — a measuring-instrument read under gym light.
  static let onAccent = Color(red: 0.098, green: 0.090, blue: 0.078)
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
  let t = max(0, Int(s.rounded()))
  // Above the hour the honest mark is h:mm:ss — "90:00" reads as a broken clock.
  if t >= 3600 { return "\(t / 3600):" + String(format: "%02d:%02d", (t % 3600) / 60, t % 60) }
  return "\(t / 60):" + String(format: "%02d", t % 60)
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
  /// On the execution stages: the compact "‹ ⏸" affordance — the page one swipe right
  /// holds Pause / End. Tappable (it goes where the swipe goes), quiet, and glyphic:
  /// the pause mark says what is there better than any word did (founder 2026-07-12,
  /// "Controls" was opaque).
  var onControls: (() -> Void)? = nil
  var body: some View {
    HStack(spacing: 8) {
      if let lift {
        Text("LIFT \(lift.i)/\(lift.n)")
          .font(.system(size: 11, design: .monospaced)).tracking(0.6)
          .foregroundStyle(Palette.ink2)
      }
      if let onControls {
        Button(action: onControls) {
          HStack(spacing: 3) {
            Image(systemName: "chevron.left").font(.system(size: 8, weight: .semibold))
            Image(systemName: "pause.fill").font(.system(size: 9, weight: .semibold))
          }
          .foregroundStyle(Palette.ink2)
          .padding(.horizontal, 7).padding(.vertical, 3)
          .background(Palette.stage1).clipShape(Capsule())
          .contentShape(Capsule())
        }
        .buttonStyle(.plain)
      }
      Spacer(minLength: 40) // the trailing half stays clear of the watch clock
    }
    .frame(height: 18)
  }
}

/// The affordance to act. primary = ochre; onstage = white-on-dark; quiet = raised tile
/// (secondary but visibly a button); danger = clay (the irreversible act inside the end
/// guard); ghost = bare.
struct StageButton: View {
  enum Kind { case primary, onstage, quiet, danger, ghost }
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
  private var fg: Color {
    switch kind {
    case .primary: return Palette.onAccent
    case .onstage: return Palette.stage0
    case .quiet: return Palette.ink0
    case .danger: return Palette.ink0
    case .ghost: return Palette.ink1
    }
  }
  private var bg: Color {
    switch kind {
    case .primary: return Palette.signal
    case .onstage: return Palette.ink0
    case .quiet: return Palette.stage1
    case .danger: return Palette.down
    case .ghost: return .clear
    }
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

private struct DrawCheck: View {
  var size: CGFloat = 22
  var body: some View {
    Image(systemName: "checkmark").font(.system(size: size, weight: .bold)).foregroundStyle(Palette.up)
  }
}

/// The way back after a one-tap swap: an ochre "Undo" pill beside the (new) exercise
/// name, alive for a few seconds. Tapping restores the lift the athlete had.
private struct SwapUndoChip: View {
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      HStack(spacing: 3) {
        Image(systemName: "arrow.uturn.backward").font(.system(size: 10, weight: .semibold))
        Text(WatchCopy.undo).font(.system(size: 11, weight: .semibold))
      }
      .foregroundStyle(Palette.signal)
      .padding(.horizontal, 9).padding(.vertical, 5)
      .background(Palette.stage1).clipShape(Capsule())
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
  }
}

/// The countdown ring — a CONTINUOUS, fluid linear sweep, mono time at centre. Drift-proof
/// + Always-On safe: `TimelineView(.animation)` recomputes the arc from the phone-supplied
/// ABSOLUTE end on every display frame (not in 0.5 s steps), so the sweep is smooth — matching
/// the iPhone ring. A +15 s top-up moves the end out — the arc EASES to its new fill over
/// ~0.4 s (founder 2026-07-10: the ring must visibly rise like the phone's, never snap) via a
/// short blend from the last drawn fraction; the mono time itself updates instantly (honest).
private struct RestRing: View {
  let endsAt: String?
  let totalS: Int
  let diameter: CGFloat
  /// The label under the time while counting (design: "REST" inter-set, "NEXT" on transition).
  var restingLabel: String = "REST"

  /// The last DRAWN fraction (a plain box — written during render, read when the end moves;
  /// deliberately not @State so per-frame writes never re-invalidate the view).
  private final class DrawnFrac { var value: Double = 0 }
  @State private var drawn = DrawnFrac()
  /// Active blend after the end moved: ease from `from` starting at `at`.
  @State private var blend: (from: Double, at: Date)? = nil
  private static let blendDuration: TimeInterval = 0.4

  var body: some View {
    let end = WatchWire.parseDate(endsAt)
    let stroke = max(5, diameter * 0.055)
    TimelineView(.animation) { ctx in
      let remaining = max(0, end.map { $0.timeIntervalSince(ctx.date) } ?? 0)
      let liveFrac = totalS > 0 ? min(1, max(0, remaining / Double(totalS))) : 0
      let frac = blended(liveFrac, at: ctx.date)
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
    .onChange(of: endsAt) { _, _ in
      // The end moved (+15 / a new rest): ease from what is currently on screen.
      blend = (from: drawn.value, at: Date())
    }
  }

  private func blended(_ liveFrac: Double, at now: Date) -> Double {
    var frac = liveFrac
    if let b = blend {
      let t = now.timeIntervalSince(b.at) / Self.blendDuration
      if t < 1 {
        let e = t * t * (3 - 2 * t) // smoothstep
        frac = b.from + (liveFrac - b.from) * e
      }
    }
    drawn.value = frac
    return frac
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
  /// Mid-run marks read at a stride: the cardio stage doubles its two columns up.
  var valueSize: CGFloat = Fit.s(18)
  var body: some View {
    VStack(spacing: 2) {
      // A wide mark ("12:34") must SCALE into its column, never ellipsize (founder
      // 2026-07-10: elapsed read "12:…" on the 40 mm case — unreadable).
      Text(value).font(.system(size: valueSize, weight: .semibold, design: .monospaced)).foregroundStyle(Palette.ink0)
        .lineLimit(1).minimumScaleFactor(0.55)
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
  var lift: (i: Int, n: Int)? = nil
  let onPause: () -> Void
  let onEnd: () -> Void
  @State private var confirmingEnd = false

  var body: some View {
    if confirmingEnd {
      EndConfirmScreen(
        title: WatchCopy.endConfirmTitle, confirmTitle: WatchCopy.endAndSave, lift: lift,
        onConfirm: onEnd, onKeep: { confirmingEnd = false }
      )
    } else {
      VStack(alignment: .leading, spacing: 0) {
        TopStrip(lift: lift) // the same strip, at the same y, as the stage page beside it
        VStack(alignment: .leading, spacing: 2) {
          Legend(WatchCopy.controlsLegend)
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
          // End only ARMS the guard; the irreversible act lives behind EndConfirmScreen
          // (founder 2026-07-12: a mis-tap near Pause must never close a workout).
          StageButton(title: WatchCopy.endWorkout, kind: .quiet, height: 34, fontSize: 13) { confirmingEnd = true }
        }
      }
      .padding(.horizontal, 10).padding(.bottom, 6)
      .stageFill()
    }
  }

  private var elapsedText: String {
    guard let s = metrics.elapsed() else { return "–:––" }
    return fmtTime(s)
  }
}

/// The gatekeeper before an irreversible end. "Keep going" takes the primary mark and the
/// position the finger already knows; the end action is a deliberate clay button below it.
private struct EndConfirmScreen: View {
  let title: String
  let confirmTitle: String
  var lift: (i: Int, n: Int)? = nil
  let onConfirm: () -> Void
  let onKeep: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      TopStrip(lift: lift)
      Spacer(minLength: 4)
      Text(title)
        .font(.system(size: Fit.s(22), weight: .semibold)).foregroundStyle(Palette.ink0)
        .lineLimit(2).minimumScaleFactor(0.8)
      Spacer(minLength: 8)
      VStack(spacing: 6) {
        StageButton(title: WatchCopy.keepGoing, kind: .primary, height: 46, fontSize: 16, action: onKeep)
        StageButton(title: confirmTitle, kind: .danger, height: 40, fontSize: 14, action: onConfirm)
      }
    }
    .padding(.horizontal, 10).padding(.bottom, 6)
    .stageFill()
  }
}

/// The horizontal pager around every execution screen: page 0 = Controls, page 1 = the
/// stage (default). Recreated on phase change, so it always re-opens ON the stage.
/// Index dots are suppressed — they would sit on the primary action on the small cases;
/// the swipe is the same muscle memory as Apple Workout.
///
/// The pager holds ONLY the TabView (founder 2026-07-11): a strip lifted above it stole
/// height from the page and pushed the whole stage down (the Complete button fell off the
/// 41 mm case). Every page owns its own TopStrip and pins itself to the top via
/// `stageFill()`, which is what actually keeps LIFT at one exact position everywhere.
private struct ExecutionPager<Content: View>: View {
  @ObservedObject var metrics: LiveMetrics
  let workoutName: String?
  var lift: (i: Int, n: Int)? = nil
  let onPause: () -> Void
  let onEnd: () -> Void
  /// The stage page, handed the way IN to the Controls page — the "‹ ⏸" hint taps
  /// through to the same place the swipe reaches.
  @ViewBuilder let content: (_ goControls: @escaping () -> Void) -> Content
  @State private var page = 1

  var body: some View {
    TabView(selection: $page) {
      ControlsScreen(metrics: metrics, workoutName: workoutName, lift: lift, onPause: onPause, onEnd: onEnd).tag(0)
      content({ withAnimation { page = 0 } }).tag(1)
    }
    .tabViewStyle(.page(indexDisplayMode: .never))
  }
}

/// Every stage screen FILLS its canvas and hangs from the TOP. Without this a screen whose
/// content is shorter than the case (the rest screens) is centred by SwiftUI — which is why
/// LIFT sat lower on Rest than on the live set (founder 2026-07-10). With it, the top strip
/// is at the same y on every screen and the interior Spacers distribute the slack.
private extension View {
  func stageFill() -> some View {
    frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
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
      StartScreen(lobby: lobby, onBegin: model.begin, onSelect: model.selectWorkout, onCardio: model.startCardio)
    case let .connectionLost(m):
      ConnectionLostScreen(mirror: m)
    case let .workoutComplete(m):
      CompleteScreen(mirror: m, kcal: model.completedKcal, onDone: model.dismissComplete)
    case let .setConfirmation(weight, reps, index, total):
      ConfirmScreen(weight: weight, reps: reps, index: index, total: total, onTap: model.dismissSetConfirm)
    case let .activeSet(m, draft):
      ExecutionPager(metrics: model.liveMetrics, workoutName: m.workoutName,
                     lift: (i: m.liftIndex ?? 1, n: m.liftCount ?? 1),
                     onPause: model.pause, onEnd: model.endWorkout) { goControls in
        ActiveSetScreen(mirror: m, draft: draft, onSave: model.saveEdit,
                        onComplete: model.completeSet,
                        onSwap: { model.swap($0, replacing: m.exerciseName, context: .current) },
                        undo: model.undoContext == .current ? model.undoOption : nil,
                        onUndo: model.undoSwap,
                        onControls: goControls)
      }
    case let .interRest(m):
      ExecutionPager(metrics: model.liveMetrics, workoutName: m.workoutName,
                     lift: (i: m.liftIndex ?? 1, n: m.liftCount ?? 1),
                     onPause: model.pause, onEnd: model.endWorkout) { goControls in
        InterRestScreen(mirror: m, onReady: model.ready, onAdd: model.addRest, onControls: goControls)
      }
    case let .transitionRest(m):
      ExecutionPager(metrics: model.liveMetrics, workoutName: m.workoutName,
                     lift: (i: (m.liftIndex ?? 1) + 1, n: m.liftCount ?? 1),
                     onPause: model.pause, onEnd: model.endWorkout) { goControls in
        TransitionRestScreen(mirror: m, onReady: model.ready, onAdd: model.addRest,
                             onSwap: { model.swap($0, replacing: m.nextExerciseName ?? "", context: .next) },
                             undo: model.undoContext == .next ? model.undoOption : nil,
                             onUndo: model.undoSwap,
                             onControls: goControls)
      }
    case .paused:
      PausedScreen(onResume: model.resume, onEnd: model.endWorkout)
    case let .cardio(gait, paused):
      CardioPager(gait: gait, paused: paused, metrics: model.liveMetrics,
                  elapsed: model.cardioElapsed,
                  onPauseToggle: model.toggleCardioPause, onEnd: model.endCardio)
    case let .cardioComplete(summary):
      CardioCompleteScreen(summary: summary, onDone: model.dismissCardioComplete)
    }
  }
}

// MARK: 01 · Workout Start

struct StartScreen: View {
  let lobby: WireLobby
  let onBegin: () -> Void
  let onSelect: (String) -> Void
  let onCardio: (String) -> Void
  @State private var showList = false
  private var resting: Bool { lobby.resting == true }
  /// Behind the paywall: the wrist neither starts a workout nor runs one standalone — the
  /// purchase belongs to the phone, so the stage says so plainly instead of offering a
  /// Begin button that could never work.
  private var gated: Bool { lobby.gated == true }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      TopStrip()
      // The whole text unit sits at the TOP (NEXT WORKOUT ~level with the clock),
      // so the muscle line no longer hugs the Begin button — a Spacer opens the gap.
      VStack(alignment: .leading, spacing: 6) {
        Legend(WatchCopy.nextWorkout)
        Text(resting ? "Recovery" : lobby.workoutName)
          .font(.system(size: Fit.s(26), weight: .semibold)).foregroundStyle(Palette.ink0).lineLimit(2)
        if gated {
          Text(WatchCopy.membershipNeeded).font(.system(size: 12)).foregroundStyle(Palette.ink2).lineLimit(3)
        } else if resting {
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
        if !resting && !gated {
          StageButton(title: WatchCopy.begin, kind: .primary, height: 50, fontSize: 18, action: onBegin)
        }
        // Open training (run / walk) is never gated — it is recorded, never coached — so the
        // chooser stays reachable even behind the paywall. A quiet raised tile, so it READS
        // as a button at a glance (founder 2026-07-12) — the target was always full-width.
        StageButton(title: WatchCopy.chooseWorkout, kind: .quiet, height: 36, fontSize: 14) { showList = true }
      }
    }
    .padding(.horizontal, 10).padding(.bottom, 8)
    .sheet(isPresented: $showList) {
      ChooseOverlay(
        lobby: lobby,
        onSelect: { id in onSelect(id); showList = false },
        onCardio: { gait in onCardio(gait); showList = false }
      )
    }
  }
}

struct ChooseOverlay: View {
  let lobby: WireLobby
  let onSelect: (String) -> Void
  /// Run / walk on the wrist (founder 2026-07-10): recorded via the OS workout
  /// runtime straight to Health — never coached, never engine state.
  let onCardio: (String) -> Void
  var body: some View {
    // Unfinished work leads (founder 2026-07-12): a DONE workout is a record, not an offer —
    // it reads at the tail, after everything still trainable. Order within each group is
    // the plan's own.
    let ordered = lobby.workouts.filter { $0.done != true } + lobby.workouts.filter { $0.done == true }
    List {
      ForEach(ordered, id: \.id) { w in
        // A workout already trained this week is FINISHED (founder 2026-07-11): it reads as a
        // record — dimmed, marked DONE, and NOT selectable. Only unfinished work can be queued.
        let done = w.done == true
        Button { onSelect(w.id) } label: {
          VStack(alignment: .leading, spacing: 3) {
            HStack {
              Text(w.name).font(.system(size: 16, weight: .semibold))
                .foregroundStyle(done ? Palette.ink2 : Palette.ink0)
              Spacer()
              if done {
                HStack(spacing: 3) {
                  Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).foregroundStyle(Palette.up)
                  Legend(WatchCopy.done, size: 9)
                }
              }
            }
            Text("\(w.lifts ?? 0) lifts · \(w.muscles ?? "")")
              .font(.system(size: 11, design: .monospaced)).foregroundStyle(Palette.ink2).lineLimit(1)
          }
          .padding(.vertical, 3) // the muscle line must not hug the card's edge (founder 2026-07-12)
        }
        .disabled(done)
        .listRowBackground(
          RoundedRectangle(cornerRadius: 10)
            .fill(Palette.stage1)
            .opacity(done ? 0.5 : 1)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(w.id == lobby.workoutId && !done ? Palette.signal : .clear, lineWidth: 2))
        )
      }
      // Open training — the same two honest recordings the phone offers.
      Section {
        ForEach(["run", "walk"], id: \.self) { gait in
          Button { onCardio(gait) } label: {
            HStack(spacing: 8) {
              Image(systemName: gait == "run" ? "figure.run" : "figure.walk")
                .font(.system(size: 15)).foregroundStyle(Palette.signal)
              Text(gait == "run" ? WatchCopy.run : WatchCopy.walk)
                .font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink0)
            }
          }
          .listRowBackground(RoundedRectangle(cornerRadius: 10).fill(Palette.stage1))
        }
      } header: {
        Legend(WatchCopy.openTraining, size: 9)
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
  /// The way back for the 6 s after a one-tap swap (founder 2026-07-12) — nil once it lapses.
  let undo: WireSwapOption?
  let onUndo: () -> Void
  let onControls: () -> Void

  @State private var editing = false
  @State private var field: EditField = .weight
  @State private var w: Double = 0
  @State private var r: Double = 0
  @State private var crown: Double = 0

  private var bodyweight: Bool { mirror.targetWeight == nil }
  private var shownWeight: Double? { draft?.weight ?? mirror.targetWeight }
  private var shownReps: Int { draft?.reps ?? mirror.targetReps }
  private var swaps: [WireSwapOption] { mirror.swapOptions ?? [] }

  var body: some View {
    VStack(spacing: 0) {
      TopStrip(lift: (i: mirror.liftIndex ?? 1, n: mirror.liftCount ?? 1), onControls: onControls)
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
    .stageFill()
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
  }

  private var header: some View {
    // Muscle group intentionally omitted (founder: drop CHEST/BACK everywhere to
    // open the small screen) — just the exercise name + the swap affordance.
    // Swap is ONE TAP (founder 2026-07-10, phone parity): Hush already picked the
    // best replacement (options[0], phone-ranked) — apply it immediately, no picker.
    HStack(spacing: 4) {
      Text(mirror.exerciseName).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink0)
        .lineLimit(1).minimumScaleFactor(0.75) // long names shrink before truncating
      if !editing {
        if undo != nil {
          // The 6 s after a one-tap swap carry the way back (founder 2026-07-12).
          SwapUndoChip(action: onUndo)
        } else if let best = swaps.first {
          // One tap swaps IMMEDIATELY, so the target must be honest: a full-size
          // hit area around the small glyph (founder 2026-07-12 — it was 13 pt bare).
          Button { onSwap(best.id) } label: {
            Image(systemName: "repeat").font(.system(size: 13))
              .foregroundStyle(Palette.ink2)
              .frame(width: 44, height: 28)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  /// LOADED hierarchy (canonical-first): LOAD (hero) → INSTRUCTION (what to do now) → REPS → Δ.
  ///
  /// BODYWEIGHT is the one exercise where the load is NOT the hero (founder 2026-07-11): an
  /// athlete on a pull-up knows they are lifting themselves — shouting "BW" tells them nothing.
  /// The number that carries the work, and the one Hush actually progresses on a bodyweight lift,
  /// is the REP COUNT. So reps take the hero mark and "bodyweight" drops to a quiet legend under
  /// it. The block keeps the LOADED case's height (minHeight) so the top strip and the exercise
  /// name never shift between a loaded lift and a bodyweight one.
  /// The numbers themselves are the most natural way in to Edit (founder 2026-07-12):
  /// tapping the load focuses the load, tapping the reps focuses the reps. The pencil
  /// below stays as the discoverable route — same destination.
  private var readout: some View {
    VStack(spacing: 6) {
      if let wt = shownWeight {
        Button { enterEdit(.weight) } label: {
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(fmtW(wt)).font(.system(size: Fit.s(42), weight: .semibold, design: .monospaced)).monospacedDigit().foregroundStyle(Palette.ink0)
            Text(WatchCopy.kg).font(.system(size: 14, design: .monospaced)).foregroundStyle(Palette.ink2)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        instruction
        HStack(spacing: 10) {
          Button { enterEdit(.reps) } label: {
            Text("× \(shownReps)").font(.system(size: 15, design: .monospaced)).foregroundStyle(Palette.ink1)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          if (mirror.loadDeltaKg ?? 0) != 0 { LoadDelta(deltaKg: mirror.loadDeltaKg ?? 0, fontSize: 10) }
        }
      } else {
        Button { enterEdit(.reps) } label: {
          HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text("\(shownReps)").font(.system(size: Fit.s(42), weight: .semibold, design: .monospaced)).monospacedDigit().foregroundStyle(Palette.ink0)
            Text(WatchCopy.reps).font(.system(size: 14, design: .monospaced)).foregroundStyle(Palette.ink2)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Legend(WatchCopy.bodyweightQuiet, size: 10)
      }
    }
    .frame(minHeight: Fit.s(92)) // one rhythm for both cases — the strip above never moves
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
      // Bodyweight has no load field to adjust, so it carries no load MARK either (founder
      // 2026-07-11) — just a quiet legend where the kg would be, and the reps take the size.
      if bodyweight {
        Legend(WatchCopy.bodyweightQuiet, size: 10)
        Button { field = .reps } label: {
          HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text("\(Int(r))").font(.system(size: Fit.s(34), weight: .semibold, design: .monospaced)).monospacedDigit()
            Text(WatchCopy.reps).font(.system(size: 14, design: .monospaced)).foregroundStyle(Palette.ink2)
          }
          .foregroundStyle(Palette.ink0)
          .overlay(alignment: .bottom) { underline(true) }
        }
        .buttonStyle(.plain)
      } else {
        Button { field = .weight } label: {
          HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(fmtW(w)).font(.system(size: Fit.s(34), weight: .semibold, design: .monospaced)).monospacedDigit()
            Text(" " + WatchCopy.kg).font(.system(size: 14, design: .monospaced)).foregroundStyle(Palette.ink2)
          }
          .foregroundStyle(field == .weight ? Palette.ink0 : Palette.ink2)
          .overlay(alignment: .bottom) { underline(field == .weight) }
        }
        .buttonStyle(.plain)
        Button { field = .reps } label: {
          Text("× \(Int(r))").font(.system(size: 22, weight: .semibold, design: .monospaced))
            .foregroundStyle(field == .reps ? Palette.ink0 : Palette.ink2)
            .overlay(alignment: .bottom) { underline(field == .reps) }
        }
        .buttonStyle(.plain)
      }
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
      // While EDITING the glyph disappears: Save alone commits (founder 2026-07-12 —
      // the ✓ beside Save was the same action twice, pure mis-tap surface).
      if !editing {
        Button { enterEdit(.weight) } label: {
          Image(systemName: "pencil")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(Palette.ink1)
            .frame(width: 36, height: Fit.s(48)) // matches the Complete button's scaled height
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
      StageButton(title: editing ? WatchCopy.save : WatchCopy.completeSet, kind: .primary, height: 48, fontSize: 17) {
        if editing { commit() } else { onComplete() }
      }
    }
    .padding(.top, 4)
  }

  /// Open the inline editor with `f` focused (bodyweight always edits reps — there is no load).
  private func enterEdit(_ f: EditField) {
    w = (shownWeight ?? 0).rounded() // whole kg — no decimals on the watch
    r = Double(shownReps)
    field = bodyweight ? .reps : f
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
      // The mark of what was logged. A bodyweight set logs REPS — that is the whole record
      // (founder 2026-07-11; phone parity, which shows the rep count alone). A loaded set logs
      // "load × reps".
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        if let wt = weight {
          Text(fmtW(wt))
            .font(.system(size: Fit.s(56), weight: .semibold, design: .monospaced)).monospacedDigit()
          Text("×").font(.system(size: Fit.s(24), design: .monospaced)).foregroundStyle(Palette.ink2)
        }
        Text("\(reps)").font(.system(size: Fit.s(56), weight: .semibold, design: .monospaced)).monospacedDigit()
        if weight == nil {
          Text(WatchCopy.reps).font(.system(size: Fit.s(18), design: .monospaced)).foregroundStyle(Palette.ink2)
        }
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
  let onControls: () -> Void
  private var ready: Bool { (mirror.restRemainingS ?? 0) <= 0 }

  var body: some View {
    // NO SCROLL: the ring, the next-set line, the equipment setup, and BOTH actions stay on screen
    // at once on every case size (founder: nothing scrolls during execution). The ring is sized
    // down and the two actions share one row so all of it fits even on the 40/41 mm case.
    // The ring hugs the TOP (founder 2026-07-10: lift the rest clock); the freed room goes to
    // the line under the exercise name, which reads a size up. stageFill() pins the strip.
    VStack(spacing: 0) {
      TopStrip(lift: (i: mirror.liftIndex ?? 1, n: mirror.liftCount ?? 1), onControls: onControls)
      RestRing(endsAt: mirror.restEndsAt, totalS: mirror.restTotalS ?? 90, diameter: Fit.s(84))
      Spacer(minLength: 3)
      // The same exercise (next set) — name kept tight; load + reps on one mono line; then the
      // execution-grade setup line (how to load it).
      VStack(spacing: 2) {
        Text(mirror.exerciseName).font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink0)
          .lineLimit(1).minimumScaleFactor(0.75)
        Text("\(mirror.setLabel) · \(targetText)")
          .font(.system(size: 13, design: .monospaced)).foregroundStyle(Palette.ink1)
          .lineLimit(1).minimumScaleFactor(0.7)
        if let line = setupLine(mirror.loadSetup) {
          Text(line).font(.system(size: 12, weight: .medium, design: .monospaced)).foregroundStyle(Palette.signal).lineLimit(1)
        }
      }
      Spacer(minLength: 3)
      RestActions(ready: ready, primaryTitle: ready ? WatchCopy.startNextSet : WatchCopy.skipRest, onReady: onReady, onAdd: onAdd)
    }
    .padding(.horizontal, 10).padding(.bottom, 6)
    .stageFill()
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
  /// The way back for the 6 s after a one-tap swap of the NEXT lift (founder 2026-07-12).
  let undo: WireSwapOption?
  let onUndo: () -> Void
  let onControls: () -> Void
  private var ready: Bool { (mirror.restRemainingS ?? 0) <= 0 }
  private var swaps: [WireSwapOption] { mirror.nextSwapOptions ?? [] }

  var body: some View {
    // NO SCROLL: ring + the next lift (name, load·reps, the execution setup line, the change) + BOTH
    // actions all stay visible at once. A plain block (no boxed card) keeps it within the 40/41 mm
    // height so nothing is ever clipped or scrolled during execution. Ring hugs the top; the line
    // under the name reads a size up (founder 2026-07-10). Swap is ONE TAP — Hush already picked
    // the replacement (phone parity).
    VStack(spacing: 0) {
      TopStrip(lift: (i: (mirror.liftIndex ?? 1) + 1, n: mirror.liftCount ?? 1), onControls: onControls)
      RestRing(endsAt: mirror.restEndsAt, totalS: mirror.restTotalS ?? 120, diameter: Fit.s(78), restingLabel: "NEXT")
      Spacer(minLength: 3)
      VStack(spacing: 2) {
        HStack(spacing: 4) {
          Text(mirror.nextExerciseName ?? "").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink0)
            .lineLimit(1).minimumScaleFactor(0.75)
          if undo != nil {
            SwapUndoChip(action: onUndo)
          } else if let best = swaps.first {
            // Same honest hit area as the live-set swap glyph (founder 2026-07-12).
            Button { onSwap(best.id) } label: {
              Image(systemName: "repeat").font(.system(size: 12))
                .foregroundStyle(Palette.ink2)
                .frame(width: 40, height: 24)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
        HStack(spacing: 6) {
          Text(nextTargetText)
            .font(.system(size: 13, design: .monospaced)).foregroundStyle(Palette.ink1)
            .lineLimit(1).minimumScaleFactor(0.7)
          if (mirror.nextLoadDeltaKg ?? 0) != 0 { LoadDelta(deltaKg: mirror.nextLoadDeltaKg ?? 0, fontSize: 9) }
        }
        if let line = setupLine(mirror.nextLoadSetup) {
          Text(line).font(.system(size: 12, weight: .medium, design: .monospaced)).foregroundStyle(Palette.signal).lineLimit(1)
        }
      }
      Spacer(minLength: 3)
      RestActions(ready: ready, primaryTitle: WatchCopy.startNextLift, onReady: onReady, onAdd: onAdd)
    }
    .padding(.horizontal, 10).padding(.bottom, 6)
    .stageFill()
  }

  private var nextTargetText: String {
    let w = mirror.nextTargetWeight.map { "\(fmtW($0)) \(WatchCopy.kg)" } ?? WatchCopy.bodyweight
    return "\(w) · × \(mirror.nextTargetReps ?? 0)"
  }
}

// MARK: Cardio (watch-local run / walk — recorded, never coached)

/// The run/walk stage, paged exactly like a lift (founder 2026-07-11): the main page carries
/// ONLY the work (the clock + the live body metrics); swipe right for the controls (Pause /
/// Finish & save). Same muscle memory as the strength screens and as Apple's own Workout app.
struct CardioPager: View {
  let gait: String
  let paused: Bool
  @ObservedObject var metrics: LiveMetrics
  /// Pause-aware elapsed seconds — the watch's own clock (HealthKit only supplies HR/kcal/km).
  let elapsed: () -> TimeInterval
  let onPauseToggle: () -> Void
  let onEnd: () -> Void
  @State private var page = 1

  var body: some View {
    TabView(selection: $page) {
      CardioControlsScreen(gait: gait, paused: paused, metrics: metrics, elapsed: elapsed,
                           onPauseToggle: onPauseToggle, onEnd: onEnd).tag(0)
      CardioScreen(gait: gait, paused: paused, metrics: metrics, elapsed: elapsed,
                   onControls: { withAnimation { page = 0 } }).tag(1)
    }
    .tabViewStyle(.page(indexDisplayMode: .never))
  }
}

/// Live wrist recording (the stage page): elapsed hero + HR / kcal / distance. No controls —
/// they live one swipe away. The record persists to Health when the athlete finishes; the
/// strength engine never sees it (the same "Open training" contract as the phone).
struct CardioScreen: View {
  let gait: String
  let paused: Bool
  @ObservedObject var metrics: LiveMetrics
  let elapsed: () -> TimeInterval
  let onControls: () -> Void

  var body: some View {
    VStack(spacing: 0) {
      TopStrip()
      HStack(spacing: 6) {
        Image(systemName: gait == "run" ? "figure.run" : "figure.walk")
          .font(.system(size: 12)).foregroundStyle(paused ? Palette.ink2 : Palette.signal)
        Legend(paused ? WatchCopy.pausedTitle : (gait == "run" ? WatchCopy.running : WatchCopy.walking), size: 10)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Spacer(minLength: 4)
      TimelineView(.periodic(from: .now, by: 1)) { _ in
        VStack(spacing: 8) {
          Text(fmtTime(elapsed()))
            .font(.system(size: Fit.s(40), weight: .semibold, design: .monospaced)).monospacedDigit()
            .foregroundStyle(paused ? Palette.ink2 : Palette.ink0).lineLimit(1).minimumScaleFactor(0.6)
          // TWO columns, doubled up — the marks a runner actually reads at a stride
          // (founder 2026-07-12: three small columns were unreadable mid-run). Kcal
          // lives one swipe away on the controls page.
          HStack(spacing: 8) {
            Metric(value: metrics.distanceKm.map { String(format: "%.2f", $0) } ?? "––",
                   label: WatchCopy.metricKm, valueSize: Fit.s(26))
            Metric(value: metrics.heartRateBpm.map { "\($0)" } ?? "––",
                   label: WatchCopy.metricHeart, valueSize: Fit.s(26))
          }
        }
      }
      Spacer(minLength: 6)
      // The stage carries no big buttons — the ‹ ⏸ PAUSE affordance stands where they
      // used to be: it names what the swipe reaches, and tapping it goes there too
      // (founder 2026-07-12: "CONTROLS" was opaque and read as a dead label).
      Button(action: onControls) {
        HStack(spacing: 4) {
          Image(systemName: "chevron.left").font(.system(size: 9, weight: .semibold))
          Image(systemName: "pause.fill").font(.system(size: 10, weight: .semibold))
          Legend(WatchCopy.pause, size: 9)
        }
        .foregroundStyle(Palette.ink2)
        .frame(maxWidth: .infinity).frame(height: Fit.s(22))
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
    .padding(.horizontal, 10).padding(.bottom, 8)
    .stageFill()
  }
}

/// The cardio controls page (swipe right): Pause / Resume + Finish & save, plus the clock so
/// the athlete never loses it while deciding.
private struct CardioControlsScreen: View {
  let gait: String
  let paused: Bool
  @ObservedObject var metrics: LiveMetrics
  let elapsed: () -> TimeInterval
  let onPauseToggle: () -> Void
  let onEnd: () -> Void
  @State private var confirmingEnd = false

  var body: some View {
    if confirmingEnd {
      EndConfirmScreen(
        title: WatchCopy.finishConfirmTitle, confirmTitle: WatchCopy.finishSave,
        onConfirm: onEnd, onKeep: { confirmingEnd = false }
      )
    } else {
      VStack(alignment: .leading, spacing: 0) {
        TopStrip()
        VStack(alignment: .leading, spacing: 2) {
          Legend(WatchCopy.controlsLegend)
          Text(gait == "run" ? WatchCopy.run : WatchCopy.walk)
            .font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink1).lineLimit(1)
        }
        Spacer(minLength: 4)
        // The full body readout lives HERE (parity with the strength controls page):
        // the stage keeps only the two marks a runner reads at a stride.
        TimelineView(.periodic(from: .now, by: 1)) { _ in
          VStack(spacing: 6) {
            Text(fmtTime(elapsed()))
              .font(.system(size: Fit.s(26), weight: .semibold, design: .monospaced)).monospacedDigit()
              .foregroundStyle(Palette.ink0).frame(maxWidth: .infinity)
            HStack(spacing: 6) {
              Metric(value: metrics.distanceKm.map { String(format: "%.2f", $0) } ?? "––", label: WatchCopy.metricKm)
              Metric(value: metrics.heartRateBpm.map { "\($0)" } ?? "––", label: WatchCopy.metricHeart)
              Metric(value: metrics.activeKcal.map { "\($0)" } ?? "––", label: WatchCopy.metricKcal)
            }
          }
        }
        Spacer(minLength: 6)
        VStack(spacing: 6) {
          StageButton(title: paused ? WatchCopy.resume : WatchCopy.pause, kind: .primary, height: 46, fontSize: 16, action: onPauseToggle)
          // Finish only ARMS the guard (founder 2026-07-12) — the save happens behind it.
          StageButton(title: WatchCopy.finishSave, kind: .quiet, height: 34, fontSize: 13) { confirmingEnd = true }
        }
      }
      .padding(.horizontal, 10).padding(.bottom, 6)
      .stageFill()
    }
  }
}

/// The run/walk completion (founder 2026-07-11: the wrist must close the activity, not just
/// vanish back to the lobby). The same honest record the phone shows: time, distance, pace,
/// kcal — recorded, never graded.
struct CardioCompleteScreen: View {
  let summary: CardioSummary
  let onDone: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      TopStrip()
      Spacer(minLength: 4)
      HStack(spacing: 8) { DrawCheck(size: 18); Legend(WatchCopy.recordedLegend, size: 11) }
      Text(WatchCopy.complete(summary.gait == "run" ? WatchCopy.run : WatchCopy.walk))
        .font(.system(size: Fit.s(24), weight: .semibold)).foregroundStyle(Palette.ink0)
        .lineLimit(2).minimumScaleFactor(0.7).fixedSize(horizontal: false, vertical: true)
        .padding(.top, 8)
      HStack(spacing: 8) {
        Metric(value: fmtTime(summary.elapsedS), label: WatchCopy.metricTime)
        Metric(value: summary.distanceKm.map { String(format: "%.2f", $0) } ?? "––", label: WatchCopy.metricKm)
        Metric(value: summary.kcal.map { "\($0)" } ?? "––", label: WatchCopy.metricKcal)
      }
      .padding(.top, 14)
      .overlay(alignment: .top) { Rectangle().fill(Palette.stage2).frame(height: 1).offset(y: 7) }
      Spacer(minLength: 8)
      StageButton(title: WatchCopy.done, kind: .primary, height: 46, fontSize: 16, action: onDone)
    }
    .padding(.horizontal, 12).padding(.bottom, 8)
    .stageFill()
  }
}

// MARK: 06 · Complete

struct CompleteScreen: View {
  let mirror: WireMirror
  /// Active calories for the finished workout, snapshotted from the OS runtime as the complete
  /// frame landed (it clears its live metrics while persisting the HKWorkout). Founder
  /// 2026-07-11: the set COUNT is not interesting at the close — the energy spent is.
  let kcal: Int?
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
          // Kcal replaces the set count. Absent (HealthKit denied / no data) → an honest dash,
          // never a modelled number.
          Metric(value: kcal.map { "\($0)" } ?? "––", label: WatchCopy.metricKcal)
          Metric(value: "\(s.up) ↑", label: WatchCopy.metricUp)
        }
        .padding(.top, 16)
        .overlay(alignment: .top) { Rectangle().fill(Palette.stage2).frame(height: 1).offset(y: 8) }
      }
      Spacer(minLength: 8)
      StageButton(title: WatchCopy.done, kind: .primary, height: 48, fontSize: 16, action: onDone)
    }
    // Deliberately NOT stageFill(): this screen's proportions are approved as they are —
    // only its middle metric changed (sets → kcal).
    .padding(.horizontal, 12).padding(.bottom, 8)
  }
}

// MARK: 07 · Paused

struct PausedScreen: View {
  let onResume: () -> Void
  let onEnd: () -> Void
  @State private var confirmingEnd = false
  var body: some View {
    if confirmingEnd {
      EndConfirmScreen(
        title: WatchCopy.endConfirmTitle, confirmTitle: WatchCopy.endAndSave,
        onConfirm: onEnd, onKeep: { confirmingEnd = false }
      )
    } else {
      VStack(spacing: 0) {
        TopStrip()
        Spacer()
        Legend(WatchCopy.workoutHeld, size: 11)
        Text(WatchCopy.pausedTitle).font(.system(size: Fit.s(34), weight: .semibold)).foregroundStyle(Palette.ink0).padding(.top, 6)
        Spacer()
        VStack(spacing: 6) {
          StageButton(title: WatchCopy.resume, kind: .primary, height: 52, fontSize: 18, action: onResume)
          // Ending is guarded here too (founder 2026-07-12) — Paused is exactly where a
          // sleeve brushes the screen.
          StageButton(title: WatchCopy.endWorkout, kind: .quiet, height: 40, fontSize: 14) { confirmingEnd = true }
        }
      }
      .padding(.horizontal, 10).padding(.bottom, 8)
    }
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
