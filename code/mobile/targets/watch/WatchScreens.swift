import SwiftUI
import WatchKit

// SwiftUI realization of the Hush watch — "the same instrument, on the wrist." Under v7
// (All Dark · One Lit Stage) the PHONE became a dark stage too, so the two surfaces have
// converged: a warm near-black ground, cream ink, ONE MOSS accent (ochre is retired app-
// wide — tokens.ts holds none), moss/clay load deltas, and mono numbers (the load is the
// largest mark on any Hush surface). The primary action is CREAM standing on the dark
// stage, not a hued fill. Six live screens + the carried-over Choose / Edit / Swap / Pause.
// The phone is the sole authority; every button proposes an intent.
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

// MARK: Palette (v7 stage tokens — mirror of the phone's design/tokens.ts)

enum Palette {
  static let stage0 = Color(red: 0.075, green: 0.071, blue: 0.063) // stage[0] #131210 — the ground
  static let stage1 = Color(red: 0.106, green: 0.098, blue: 0.078) // stage[1] #1b1914 — raised / card
  static let stage2 = Color(red: 0.165, green: 0.157, blue: 0.133) // stage[2] #2a2822 — line / track
  static let ink0 = Color(red: 0.945, green: 0.933, blue: 0.898) // cream[0] #f1eee5 — primary text
  static let ink1 = Color(red: 0.659, green: 0.635, blue: 0.565) // cream[1] #a8a290 — secondary
  static let ink2 = Color(red: 0.545, green: 0.518, blue: 0.455) // cream[2] #8b8474 — muted
  /// Pure white — the brightest value the stage has, reserved for the news (the corrected load).
  /// v7 keeps the READOUT law: emphasis is standing in the light, never a hue (`stage.lift`).
  static let lift = Color.white
  /// MOSS — THE accent (phone `signal[0]` / `up.stage` #a9c49f). Marks a selection, a landed tick,
  /// the live ring, a toggle that's on. Ochre is retired: v7's tokens.ts holds none.
  static let signal = Color(red: 0.663, green: 0.769, blue: 0.624) // lit moss #a9c49f
  /// The PRIMARY BUTTON ground is CREAM now (phone `signal.fill` #f1eee5) — light standing on the
  /// dark stage, not a hued fill. The label on it is stage ink (`onAccent`).
  static let signalFill = Color(red: 0.945, green: 0.933, blue: 0.898) // cream #f1eee5
  static let signalFillPressed = Color(red: 0.890, green: 0.871, blue: 0.816) // #e3ded0
  /// Stage ink — the label on the cream primary button (phone `color.onAccent` = stage[0]).
  static let onAccent = Color(red: 0.075, green: 0.071, blue: 0.063)
  static let up = Color(red: 0.663, green: 0.769, blue: 0.624) // moss on stage #a9c49f (increase)
  static let upWash = Color(.sRGB, red: 0.663, green: 0.769, blue: 0.624, opacity: 0.12) // faint moss veil
  /// A FALL IS NOT A FAILURE — and it is BLUE (founder 2026-07-28, mirrored to the wrist
  /// 2026-07-29). It was clay #d08064 here long after the phone had moved: next to moss, on a dark
  /// ground, clay reads as the red half of a red/green pair, i.e. as a mistake. An eased load is
  /// Loop 1 matching the weight to the body that showed up. Phone token: `down.stage` #7eb2d6.
  static let down = Color(red: 0.494, green: 0.698, blue: 0.839) // lit blue on stage #7eb2d6 (decrease)
  static let downWash = Color(.sRGB, red: 0.494, green: 0.698, blue: 0.839, opacity: 0.14) // faint blue veil
  /// Deeper clay #c56a4e — the ALERT / destructive signal: the filled End-workout button and the
  /// "something feels off" outline. Distinct from `down` (#d08064), which only marks a load DECREASE.
  static let clay = Color(red: 0.773, green: 0.416, blue: 0.306)
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

/// Whole minutes from the phone's "m:ss" (or "h:mm:ss") duration label — the WT6 MIN metric shows
/// "52", not "52:11". The phone owns the only time datum (`timeLabel`); the wrist reads its minutes
/// off it rather than carrying a second field.
private func minutesLabel(_ label: String) -> String {
  let parts = label.split(separator: ":").map { Int($0) ?? 0 }
  switch parts.count {
  case 3: return "\(parts[0] * 60 + parts[1])"
  case 2: return "\(parts[0])"
  default: return label
  }
}

/// Session tonnage (tonnes, 1 dp) from the phone's Σ kg — the WT6 T metric ("11.7"). A dash for a
/// session that moved no external load (bodyweight only), never a modelled 0.0.
private func fmtTonnes(_ kg: Double?) -> String {
  guard let kg, kg > 0 else { return "––" }
  return String(format: "%.1f", kg / 1000)
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

// MARK: The way to the Controls page (an environment action)
//
// The stages are built by the ROOT, one level above the pager that owns the page index —
// so the "go to Controls" action travels down the environment rather than through every
// screen's initializer. Reading it costs a stage nothing, and the pager is the only thing
// that ever knows what a page number is.

private struct GoControlsKey: EnvironmentKey {
  static let defaultValue: () -> Void = {}
}

private extension EnvironmentValues {
  var goControls: () -> Void {
    get { self[GoControlsKey.self] }
    set { self[GoControlsKey.self] = newValue }
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
  /// "Controls" was opaque — a word nobody reads mid-set).
  var controlsHint: Bool = false
  @Environment(\.goControls) private var goControls
  var body: some View {
    HStack(spacing: 8) {
      if let lift {
        Text("LIFT \(lift.i)/\(lift.n)")
          .font(.system(size: 11, design: .monospaced)).tracking(0.6)
          .foregroundStyle(Palette.ink2)
      }
      if controlsHint {
        Button(action: goControls) {
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
    // 18 pt, and it stays 18 pt. The chip fits inside it (a 9 pt symbol + 6 pt of padding ≈ 17),
    // so the strip was never what put the pause ON the ring (founder 2026-07-13) — the ring simply
    // began at the pixel the strip ended, and its arc rises to its own box top exactly where the
    // chip sits. The gap belongs to the RING, and the rest screens now hold one. Touching this
    // height would have moved every execution stage on the 40 mm case to fix a rest screen.
    .frame(height: 18)
  }
}

/// The affordance to act. primary = ochre; onstage = white-on-dark; quiet = raised tile
/// (secondary but visibly a button); danger = clay (the irreversible act inside the end
/// guard); ghost = bare.
struct StageButton: View {
  enum Kind { case primary, moss, onstage, quiet, danger, ghost }
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
    case .moss: return Palette.onAccent // dark ink on the moss fill (mock #131210)
    case .onstage: return Palette.stage0
    case .quiet: return Palette.ink0
    case .danger: return Palette.onAccent // dark ink on the clay fill (mock #131210)
    case .ghost: return Palette.ink1
    }
  }
  private var bg: Color {
    switch kind {
    case .primary: return Palette.signalFill // the only ochre a letter sits on
    // The gentle-confirm fill (mock #a9c49f): "Start" (calibration), "Done" (edit), "Resume"
    // (paused / engine-responds). Distinct from the cream primary that ADVANCES the work.
    case .moss: return Palette.signal
    case .onstage: return Palette.ink0
    case .quiet: return Palette.stage1
    case .danger: return Palette.clay // the deeper alert clay (mock #c56a4e)
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

/// THE SIGNATURE MOMENT, on the wrist (2026-07-17).
///
/// The set she just finished moved the next one. The brief calls this "the single most distinctive
/// moment in the product" and requires that "the same change appears on the watch" — and the wrist
/// is where it matters most, because mid-workout it is often the only thing she looks at. Until now
/// the phone published the correction and the watch silently dropped it: the wrist's next set just
/// showed a different number, with no account of why. That is the app doing something TO her.
///
/// It is the one thing licensed past THE UP-NEXT LAW ("the lift and the set number, NOTHING ELSE").
/// That law bans a REMINDER — a load she saw thirty seconds ago and will see again in thirty more.
/// A correction is not a reminder, it is news, and it is rare (S-13 caps it at 2 per exercise).
///
/// Form follows the phone's beat exactly (SessionFlow `corr`): the old load struck through and
/// muted, the arrow, the new load in the brightest value the stage has — never sage/clay. Emphasis
/// is distance from the ground, not hue (the v5 READOUT law), and the ▲/▼ wash belongs to
/// `LoadDelta`, which answers a different question ("how does this set compare?").
private struct CorrectionNote: View {
  let c: WireCorrection
  var body: some View {
    let up = c.direction == "up"
    VStack(spacing: 2) {
      // FIXED sizes, no `Fit.s` — the rest screens size everything for the smallest case and let
      // only the RING grow with the canvas (see `Fit`: "body text and legends stay fixed"). This
      // block is a legend, and on a 49 mm Ultra it should buy the athlete more air, not more type.
      HStack(alignment: .firstTextBaseline, spacing: 5) {
        Text(fmtW(c.from))
          .font(.system(size: 12, design: .monospaced)).monospacedDigit()
          .strikethrough(true, color: Palette.ink2)
          .foregroundStyle(Palette.ink2)
        Text("→").font(.system(size: 10, design: .monospaced)).foregroundStyle(Palette.ink2)
        Text(fmtW(c.to))
          .font(.system(size: 17, weight: .semibold, design: .monospaced)).monospacedDigit()
          // The engine's new load, IN THE DIRECTION IT MOVED. It was moss either way — so the wrist
          // announced an ease in the colour of a raise (founder 2026-07-29, phone parity).
          .foregroundStyle(up ? Palette.up : Palette.down)
        Text(WatchCopy.kg).font(.system(size: 9, design: .monospaced)).foregroundStyle(Palette.ink2)
      }
      // The reason, under the number it earned — never apart from it (phone parity).
      Text(WatchCopy.corrected(c.reps, up: up))
        .font(.system(size: 10))
        .foregroundStyle(Palette.ink1)
        .multilineTextAlignment(.center)
    }
    // A 40 mm case must never clip the news: the block scales down as one before it wraps badly.
    // (`lineLimit` + `minimumScaleFactor` and nothing else — this file's proven idiom. Adding
    // `fixedSize(vertical:)` on top fights the scale factor: the text claims its ideal height and
    // overflows instead of shrinking, which on the 40 mm case is the clip we are avoiding.)
    .lineLimit(2).minimumScaleFactor(0.7)
    .padding(.horizontal, 8).padding(.vertical, 5)
    .frame(maxWidth: .infinity)
    .background(RoundedRectangle(cornerRadius: 8).fill(Palette.stage1))
  }
}

/// Set-progress dots: done = sage, current = elongated ochre, upcoming = stage line.

private struct DrawCheck: View {
  var size: CGFloat = 22
  var body: some View {
    Image(systemName: "checkmark").font(.system(size: size, weight: .bold)).foregroundStyle(Palette.up)
  }
}

/// WT6's seal — the tally mark from the mock: a moss horizontal rule with a short upstroke at each
/// end (the "closed" counting mark). Not a check: a check says "correct"; this says "counted, and
/// filed." Drawn from three rects so it scales cleanly on either case.
private struct TallyMark: View {
  var body: some View {
    ZStack {
      Rectangle().fill(Palette.signal).frame(width: 30, height: 1.5) // the rule
      HStack(spacing: 0) {
        Rectangle().fill(Palette.signal).frame(width: 1.5, height: 10)
        Spacer(minLength: 0)
        Rectangle().fill(Palette.signal).frame(width: 1.5, height: 10)
      }
      .frame(width: 30, height: 12)
    }
    .frame(width: 30, height: 12)
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
/// the iPhone ring. A +15 s top-up moves the end out and the arc FILLS FORWARD to its new value
/// over one linear second, from exactly where it stood — the phone's gesture, on the wrist. The
/// denominator (`totalS`) never grows with a +15; if it did, the arc would drop the instant the
/// seconds were granted and spend a second climbing back (founder 2026-07-13). The mono time
/// updates instantly (honest).
private struct RestRing: View {
  let endsAt: String?
  let totalS: Int
  let diameter: CGFloat
  /// The label under the time while counting (design: "REST" inter-set, "NEXT" on transition).
  var restingLabel: String = "REST"
  /// The running arc's colour when this rest FOLLOWS a load the engine moved (founder 2026-07-29:
  /// the ring is blue behind an eased load, on the phone and on the wrist alike). Default = the
  /// ordinary rest, and the arc keeps the moss accent it has always had.
  var arc: Color = Palette.signal

  /// Active blend after the end moved: fill from `from` starting at `at`.
  @State private var blend: (from: Double, at: Date)? = nil
  /// One second, LINEAR — the phone's ring exactly (RestRing.tsx animates the +15 s top-up with
  /// `withTiming(1000, Easing.linear)`). A shorter eased blend was a different gesture on a
  /// different clock; the two rings are one instrument and they fill at one rate.
  private static let blendDuration: TimeInterval = 1.0

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
          .stroke(arc, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
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
    .onChange(of: endsAt) { oldEndsAt, newEndsAt in
      // THE +15 USED TO SNAP (founder 2026-07-12: "on the watch +15 s jumps straight up instead
      // of filling like it does on the phone"). The blend was there; it was starting from the
      // wrong place. It read the LAST DRAWN fraction — but SwiftUI evaluates the body with the
      // new `endsAt` BEFORE `onChange` runs, so by the time this closure fired, "the last drawn
      // fraction" was already the new, higher one. It was easing the ring from where it had just
      // snapped to, to exactly the same value: a 0.4 s animation of nothing.
      //
      // The fix is to stop asking the render what it drew and compute the start from the OLD end
      // directly. That is a fact, not a side effect, and it cannot be raced.
      let now = Date()
      let previousRemaining = max(0, WatchWire.parseDate(oldEndsAt).map { $0.timeIntervalSince(now) } ?? 0)
      let newRemaining = max(0, WatchWire.parseDate(newEndsAt).map { $0.timeIntervalSince(now) } ?? 0)
      // A FRESH, FULL PERIOD SNAPS — it does not sweep up from wherever the last one died. That is
      // the phone's own rule (`if (remaining >= total) frac.value = target`, RestRing.tsx), and it
      // covers both a brand-new rest and a +15 that pushes the clock past the prescribed length.
      // Anything else — the end moving BACKWARDS, which nothing legitimate does — snaps too rather
      // than animating a lie.
      guard newRemaining > previousRemaining, newRemaining < Double(totalS) else {
        blend = nil
        return
      }
      blend = (from: fraction(of: previousRemaining), at: now)
    }
  }

  private func fraction(of remaining: TimeInterval) -> Double {
    totalS > 0 ? min(1, max(0, remaining / Double(totalS))) : 0
  }

  private func blended(_ liveFrac: Double, at now: Date) -> Double {
    guard let b = blend else { return liveFrac }
    let t = now.timeIntervalSince(b.at) / Self.blendDuration
    guard t < 1 else { return liveFrac }
    return b.from + (liveFrac - b.from) * t // linear — the phone's mechanical fill
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
  /// This page is the one on screen. An armed end-guard DISARMS the moment the athlete
  /// swipes back to the stage — a guard they walked away from must never be waiting for
  /// them, cocked, the next time they come to pause.
  var onPage: Bool = true
  let onPause: () -> Void
  let onEnd: () -> Void
  @State private var confirmingEnd = false

  var body: some View {
    if confirmingEnd {
      EndConfirmScreen(lift: lift, onConfirm: onEnd, onKeep: { confirmingEnd = false })
      .onChange(of: onPage) { _, on in if !on { confirmingEnd = false } }
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

/// WT13c · GLANCE — swipe the OTHER way from the set (founder 2026-07-28: "one side pauses, the
/// other side glances").
///
/// The pager used to have two pages, so the only thing beside the stage was the way to STOP. A
/// runner's watch answers "how am I doing" without asking anything of them, and this is the wrist's
/// version: her heart and her burn (the OS supplies both) beside the only two figures about her own
/// LIFTING — the weight she has actually moved and the sets she has actually logged. Both ride the
/// mirror as `liveVolumeKg` / `liveSets`; nothing here computes, and nothing here is a verdict.
///
/// There is no button. The way out is the swipe she came in on, and the foot of the screen says so.
private struct GlanceScreen: View {
  @ObservedObject var metrics: LiveMetrics
  let workoutName: String?
  let volumeKg: Double?
  let sets: Int?

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      TopStrip()
      VStack(alignment: .leading, spacing: 2) {
        Legend(workoutName.map { "\(WatchCopy.nowLegend) · \($0.uppercased())" } ?? WatchCopy.nowLegend)
        TimelineView(.periodic(from: .now, by: 1)) { _ in
          Text(elapsedText)
            .font(.system(size: Fit.s(22), weight: .semibold, design: .monospaced)).monospacedDigit()
            .foregroundStyle(Palette.ink0)
        }
      }
      Spacer(minLength: 4)
      TimelineView(.periodic(from: .now, by: 1)) { _ in
        VStack(alignment: .leading, spacing: 7) {
          HStack(spacing: 6) {
            Metric(value: metrics.heartRateBpm.map { "\($0)" } ?? "––", label: WatchCopy.metricHeart)
            Metric(value: metrics.activeKcal.map { "\($0)" } ?? "––", label: WatchCopy.metricKcal)
          }
          // Her own work — the half of a glance no wearable gives her, because only Hush knows it.
          if let kg = volumeKg, let n = sets, n > 0 {
            HStack(spacing: 5) {
              Text(fmtKg(kg))
                .font(.system(size: Fit.s(16), weight: .medium, design: .monospaced)).monospacedDigit()
                .foregroundStyle(Palette.ink0)
              Text("\(WatchCopy.metricKgSets) · \(n)")
                .font(.system(size: 8, design: .monospaced)).tracking(0.4)
                .foregroundStyle(Palette.ink2)
            }
          }
        }
      }
      Spacer(minLength: 4)
      Text(WatchCopy.backToYourSet)
        .font(.system(size: 9.5)).foregroundStyle(Palette.ink2)
        .frame(maxWidth: .infinity, alignment: .center)
    }
    .padding(.horizontal, 10).padding(.bottom, 6)
    .stageFill()
  }

  private var elapsedText: String {
    guard let s = metrics.elapsed() else { return "–:––" }
    return fmtTime(s)
  }

  /// Whole kilos with a thousands separator — "3,140". A gram on a glance is noise.
  private func fmtKg(_ kg: Double) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: kg)) ?? "\(Int(kg))"
  }
}

/// WT13b · END? — the gatekeeper before an irreversible end. The mock centres a serif question
/// and a one-line reassurance ("Saved as-is at this point."), then makes "End workout" the clay
/// PRIMARY (you already tapped End to arrive here) with "Keep going" the outlined way back.
private struct EndConfirmScreen: View {
  var title: String = WatchCopy.endConfirmTitle
  var lift: (i: Int, n: Int)? = nil
  let onConfirm: () -> Void
  let onKeep: () -> Void
  var body: some View {
    VStack(spacing: 0) {
      TopStrip(lift: lift)
      Spacer(minLength: 4)
      VStack(spacing: 6) {
        Text(title)
          .font(.system(size: Fit.s(20), design: .serif)).foregroundStyle(Palette.ink0)
          .multilineTextAlignment(.center).lineSpacing(1)
          .fixedSize(horizontal: false, vertical: true)
        Text(WatchCopy.endConfirmSub)
          .font(.system(size: 10)).foregroundStyle(Palette.ink2)
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity)
      Spacer(minLength: 8)
      VStack(spacing: 6) {
        // Clay FILL, stage ink — the irreversible act, now the primary (the guard was the earlier tap).
        StageButton(title: WatchCopy.endWorkout, kind: .danger, height: 42, fontSize: 15, action: onConfirm)
        OutlineButton(title: WatchCopy.keepGoing, tint: Palette.ink1,
                      border: Palette.ink0.opacity(0.2), height: 34, fontSize: 12, action: onKeep)
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
  /// WT13c's two live figures about her own lifting, carried from the mirror.
  var liveVolumeKg: Double? = nil
  var liveSets: Int? = nil
  @ViewBuilder let content: () -> Content
  @State private var page = 1

  var body: some View {
    // THREE pages, the Apple Workout idiom exactly: stop on one side, glance on the other, and the
    // work in the middle. It was two — the only thing beside the stage was the way to END, so a
    // swipe the "wrong" way found nothing at all (founder 2026-07-28).
    TabView(selection: $page) {
      ControlsScreen(metrics: metrics, workoutName: workoutName, lift: lift, onPage: page == 0,
                     onPause: onPause, onEnd: onEnd).tag(0)
      // The stage is handed the way IN to the Controls page: the "‹ ⏸" hint taps through
      // to exactly where the swipe lands. The page index never leaves this view.
      content()
        .environment(\.goControls, { withAnimation { page = 0 } })
        .tag(1)
      GlanceScreen(metrics: metrics, workoutName: workoutName, volumeKg: liveVolumeKg, sets: liveSets)
        .tag(2)
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
                     onPause: model.pause, onEnd: model.endWorkout,
                     liveVolumeKg: m.liveVolumeKg, liveSets: m.liveSets) {
        ActiveSetScreen(mirror: m, draft: draft, onSave: model.saveEdit,
                        onComplete: model.completeSet,
                        onSwap: { model.swapCurrent($0, replacing: m.exerciseName) },
                        undo: model.currentUndo,
                        onUndo: model.undoSwap)
      }
    case let .interRest(m):
      ExecutionPager(metrics: model.liveMetrics, workoutName: m.workoutName,
                     lift: (i: m.liftIndex ?? 1, n: m.liftCount ?? 1),
                     onPause: model.pause, onEnd: model.endWorkout,
                     liveVolumeKg: m.liveVolumeKg, liveSets: m.liveSets) {
        InterRestScreen(mirror: m, onReady: model.ready, onAdd: model.addRest)
      }
    case let .transitionRest(m):
      ExecutionPager(metrics: model.liveMetrics, workoutName: m.workoutName,
                     lift: (i: (m.liftIndex ?? 1) + 1, n: m.liftCount ?? 1),
                     onPause: model.pause, onEnd: model.endWorkout,
                     liveVolumeKg: m.liveVolumeKg, liveSets: m.liveSets) {
        TransitionRestScreen(mirror: m, onReady: model.ready, onAdd: model.addRest,
                             onSwap: { model.swapNext($0, replacing: m.nextExerciseName ?? "") },
                             undo: model.nextUndo,
                             onUndo: model.undoSwap)
      }
    case .paused:
      PausedScreen(onResume: model.resume, onEnd: model.endWorkout, onReportPain: model.reportPain)
    case let .cardio(gait, paused):
      CardioPager(gait: gait, paused: paused, metrics: model.liveMetrics, split: model.kmSplit,
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
  @State private var showCardio = false
  private var resting: Bool { lobby.resting == true }
  /// Behind the paywall: the wrist neither starts a workout nor runs one standalone — the
  /// purchase belongs to the phone, so the stage says so plainly instead of offering a
  /// Begin button that could never work.
  private var gated: Bool { lobby.gated == true }
  /// WT7 · THE FIRST FOUR — she has never completed a workout. The lobby's ordinary face reports on
  /// a WEEK and compares to a history, and on day one both are empty, so every figure it would show
  /// is a claim about nothing. This face says the one true thing instead: what the engine is about
  /// to do, and what it needs from her to do it.
  private var firstTime: Bool { lobby.firstWorkout == true && !resting && !gated }

  var body: some View {
    if firstTime { firstWorkoutFace } else { lobbyFace }
  }

  /// WT7. No name, no lift count, no minutes — none of them mean anything before the first set. The
  /// serif states the intent ("Let's find your weights."), one quiet line asks for the only thing
  /// Hush needs (honest effort, because Loop 1 reads her reps from set 1), and Start is the single
  /// way forward. "Another" and "Cardio" stay away: choosing between workouts she has never done is
  /// a decision with no information behind it.
  private var firstWorkoutFace: some View {
    VStack(alignment: .leading, spacing: 0) {
      TopStrip()
      VStack(alignment: .leading, spacing: 7) {
        Legend(WatchCopy.firstWorkout)
        Text(WatchCopy.findYourWeights)
          .font(.system(size: Fit.s(24), design: .serif)).foregroundStyle(Palette.ink0)
          .lineSpacing(1).fixedSize(horizontal: false, vertical: true)
        Text(WatchCopy.liftTillHonest)
          .font(.system(size: 11)).foregroundStyle(Palette.ink2)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 2)
      Spacer(minLength: 8)
      BeginButton(title: WatchCopy.start, action: onBegin)
    }
    .padding(.horizontal, 12).padding(.bottom, 8)
    .stageFill()
  }

  private var lobbyFace: some View {
    VStack(alignment: .leading, spacing: 0) {
      TopStrip()
      // WT1 · TODAY (mock line 1457): the "UP NEXT" legend, the workout name in the coach's serif,
      // and a compact "N LIFTS · ~MIN" mono line. (The mock's weekday chip sits where the OS clock
      // lives — that top-right corner is the platform's, so it is left to the system clock.)
      VStack(alignment: .leading, spacing: 6) {
        Legend(WatchCopy.upNext)
        Text(resting ? "Recovery" : lobby.workoutName)
          .font(.system(size: Fit.s(28), design: .serif)).foregroundStyle(Palette.ink0).lineLimit(2)
        if gated {
          Text(WatchCopy.membershipNeeded).font(.system(size: 12)).foregroundStyle(Palette.ink2).lineLimit(3)
        } else if resting {
          Text(WatchCopy.recovery).font(.system(size: 12)).foregroundStyle(Palette.ink2).lineLimit(3)
        } else {
          Text(metaLine)
            .font(.system(size: 10, weight: .medium, design: .monospaced)).tracking(0.6)
            .foregroundStyle(Palette.ink1).lineLimit(1).minimumScaleFactor(0.8)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 2)
      Spacer(minLength: 8)
      // The mock's button stack: Begin (cream primary) over a split row — "Another" (reshuffle to
      // the choose-workout list, WT1b) and "Cardio" (run/walk). Open training is never gated.
      VStack(spacing: 6) {
        if !resting && !gated {
          BeginButton(action: onBegin)
        }
        HStack(spacing: 6) {
          OutlineButton(title: WatchCopy.another, systemImage: "arrow.left.arrow.right", tint: Palette.ink1, border: Palette.ink0.opacity(0.2)) { showList = true }
          OutlineButton(title: WatchCopy.cardio, systemImage: "waveform.path.ecg", tint: Palette.signal, border: Palette.signal.opacity(0.4)) { showCardio = true }
        }
      }
    }
    .padding(.horizontal, 10).padding(.bottom, 8)
    .sheet(isPresented: $showList) {
      ChooseOverlay(
        lobby: lobby,
        onSelect: { id in onSelect(id); showList = false }
      )
    }
    .sheet(isPresented: $showCardio) {
      CardioPicker(onCardio: { gait in onCardio(gait); showCardio = false })
    }
  }

  /// "6 LIFTS · ~55 MIN" — the mock's mono meta line (uppercased; the duration keeps its ~).
  private var metaLine: String {
    var parts: [String] = []
    if let n = lobby.lifts { parts.append("\(n) \(WatchCopy.liftsWord)") }
    if let d = lobby.durationLabel { parts.append(d.uppercased()) }
    return parts.joined(separator: " · ")
  }
}

/// The cream primary "Begin" with a play glyph (mock line 1458).
private struct BeginButton: View {
  /// WT7 says "Start" where WT1 says "Begin" — the same act, named for the moment it is in.
  var title: String = WatchCopy.begin
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        Image(systemName: "play.fill").font(.system(size: 12))
        Text(title).font(.system(size: 15, weight: .semibold))
      }
      .frame(maxWidth: .infinity).frame(height: Fit.s(44))
      .foregroundStyle(Palette.onAccent)
      .background(Palette.signalFill)
      .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}

/// An outline (stage-ground) button with a leading glyph — the "Another" / "Cardio" split row.
private struct OutlineButton: View {
  let title: String
  var systemImage: String? = nil
  let tint: Color
  let border: Color
  var height: CGFloat = 38
  var fontSize: CGFloat = 11
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      HStack(spacing: 5) {
        if let systemImage { Image(systemName: systemImage).font(.system(size: 12)) }
        Text(title).font(.system(size: fontSize, weight: .semibold))
      }
      .frame(maxWidth: .infinity).frame(height: Fit.s(height))
      .foregroundStyle(tint)
      .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(border, lineWidth: 1))
    }
    .buttonStyle(.plain)
  }
}

/// CR1 · READY — the "Cardio" sheet: the two honest recordings (run / walk), never coached.
private struct CardioPicker: View {
  let onCardio: (String) -> Void
  var body: some View {
    List {
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
    }
    .listStyle(.carousel)
    .background(Palette.stage0)
  }
}

struct ChooseOverlay: View {
  let lobby: WireLobby
  let onSelect: (String) -> Void
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
      // WT2 header: the muscle + set position on the left, set-dots on the right — the two
      // progress signals the mock carries in one row (the OS clock owns the top-right corner).
      // In Edit (WT9) the whole header collapses to a single centred "EDIT SET" legend.
      if editing {
        Legend(WatchCopy.editSet, size: 10).frame(maxWidth: .infinity).padding(.top, 2)
      } else {
        header
      }
      Spacer(minLength: 2)
      if editing { editor } else { readout }
      Spacer(minLength: 2)
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

  /// WT2 header (mock line 1476): "CHEST · 2/4" (muscle + set position) leading, the set-dots
  /// trailing. Per the founder's supreme ruling the mock is authoritative — the exercise name and
  /// the swap glyph the previous build carried here are not in the WT2 image, so they are dropped.
  private var header: some View {
    HStack(spacing: 6) {
      Text(headerLabel)
        .font(.system(size: 10, weight: .medium, design: .monospaced))
        .tracking(1.2) // ~.12em at 10 pt
        .foregroundStyle(Palette.ink2)
        .lineLimit(1).minimumScaleFactor(0.7)
      Spacer(minLength: 4)
      setDots
    }
    .padding(.top, 2)
  }

  /// "CHEST · 2/4" — the primary muscle group + the set's position in the exercise.
  private var headerLabel: String {
    let group = (mirror.exerciseGroup ?? "").uppercased()
    let n = mirror.setNumber ?? 1
    let m = mirror.setsInExercise ?? 1
    return group.isEmpty ? "\(n)/\(m)" : "\(group) · \(n)/\(m)"
  }

  /// Set-dots: a 6 pt dot per set — completed sets filled moss, the current set a moss ring,
  /// upcoming sets a faint cream ring (mock line 1476).
  private var setDots: some View {
    let m = max(mirror.setsInExercise ?? 1, 1)
    let cur = mirror.setNumber ?? 1
    return HStack(spacing: 4) {
      ForEach(1...m, id: \.self) { i in
        if i < cur {
          Circle().fill(Palette.signal).frame(width: 6, height: 6)
        } else if i == cur {
          Circle().strokeBorder(Palette.signal, lineWidth: 1.4).frame(width: 6, height: 6)
        } else {
          Circle().strokeBorder(Palette.ink0.opacity(0.3), lineWidth: 1.4).frame(width: 6, height: 6)
        }
      }
    }
  }

  /// WT2 readout (mock line 1477): LOAD (48 pt hero) → "N kg a side" → dashed TAP-TO-EDIT hint →
  /// the rep band as a moss ruler. Tapping the hero load opens Edit (WT9).
  ///
  /// BODYWEIGHT is the one exercise where the load is NOT the hero (founder 2026-07-11): an
  /// athlete on a pull-up knows they are lifting themselves — shouting "BW" tells them nothing.
  /// The number that carries the work, and the one Hush actually progresses on a bodyweight lift,
  /// is the REP COUNT. So reps take the hero mark and "bodyweight" drops to a quiet legend under
  /// it. The block keeps the LOADED case's height (minHeight) so the header above never shifts
  /// between a loaded lift and a bodyweight one.
  private var readout: some View {
    VStack(spacing: 6) {
      if let wt = shownWeight {
        // Hero load (mock 48 pt mono) — tapping it is the way into Edit (WT9).
        Button { enterEdit(.weight) } label: {
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(fmtW(wt)).font(.system(size: Fit.s(48), weight: .medium, design: .monospaced)).monospacedDigit().foregroundStyle(Palette.lift)
            Text(WatchCopy.kg).font(.system(size: 15, design: .monospaced)).foregroundStyle(Palette.ink2)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        perSideLine
        tapToEditPill
        repRuler
      } else {
        // Bodyweight: the rep count is the hero (founder 2026-07-11); "Bodyweight" a quiet legend.
        Button { enterEdit(.reps) } label: {
          HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text("\(shownReps)").font(.system(size: Fit.s(48), weight: .medium, design: .monospaced)).monospacedDigit().foregroundStyle(Palette.lift)
            Text(WatchCopy.reps).font(.system(size: 15, design: .monospaced)).foregroundStyle(Palette.ink2)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Legend(WatchCopy.bodyweightQuiet, size: 10)
      }
    }
    .frame(minHeight: Fit.s(92)) // one rhythm for both cases — the header above never moves
  }

  /// "7 kg a side" — the per-side plate figure (mock line 1477); the mono figure in cream, the
  /// preposition in a quieter sans. Only barbell/plate loads have a per-side; nothing otherwise.
  @ViewBuilder private var perSideLine: some View {
    if let ps = mirror.loadSetup?.perSide, ps > 0,
       mirror.loadSetup?.style == "barbell" || mirror.loadSetup?.style == "plate_loaded" {
      (Text("\(fmtW(ps)) \(WatchCopy.kg)").font(.system(size: 9.5, weight: .medium, design: .monospaced)).foregroundStyle(Palette.ink0)
        + Text(" " + WatchCopy.aSide).font(.system(size: 9.5)).foregroundStyle(Palette.ink1))
    }
  }

  /// The dashed "TAP WEIGHT TO EDIT" pill (mock line 1477) — a hint, not a button; the tap target
  /// is the hero load above it.
  private var tapToEditPill: some View {
    HStack(spacing: 5) {
      Image(systemName: "pencil").font(.system(size: 9)).foregroundStyle(Palette.ink2)
      Text(WatchCopy.tapWeightToEdit.uppercased())
        .font(.system(size: 7.5, weight: .medium, design: .monospaced)).tracking(0.9)
        .foregroundStyle(Palette.ink2)
    }
    .padding(.vertical, 3).padding(.horizontal, 9)
    .overlay(
      Capsule().strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3]))
        .foregroundStyle(Palette.ink0.opacity(0.22))
    )
  }

  /// The rep band as a ruler (mock line 1477): a moss bar with two end caps, the floor + ceiling in
  /// moss mono, "reps" between them. Collapses to a single centered count when there is no band.
  @ViewBuilder private var repRuler: some View {
    let lo = mirror.targetReps
    let hi = mirror.targetRepsHi ?? lo
    if hi > lo {
      VStack(spacing: 1) {
        ZStack {
          Capsule().fill(Palette.ink0.opacity(0.16)).frame(height: 2)
          HStack {
            Capsule().fill(Palette.signal).frame(width: 2, height: 14)
            Spacer()
            Capsule().fill(Palette.signal).frame(width: 2, height: 14)
          }
          Capsule().fill(Palette.signal).frame(height: 3)
        }
        .frame(width: 122)
        HStack(alignment: .top) {
          Text("\(lo)").font(.system(size: 15, weight: .semibold, design: .monospaced)).foregroundStyle(Palette.signal)
          Spacer()
          Text(WatchCopy.reps).font(.system(size: 8.5)).foregroundStyle(Palette.ink2).padding(.top, 3)
          Spacer()
          Text("\(hi)").font(.system(size: 15, weight: .semibold, design: .monospaced)).foregroundStyle(Palette.signal)
        }
        .frame(width: 122)
      }
      .padding(.top, 4)
    } else {
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text("\(lo)").font(.system(size: 15, weight: .semibold, design: .monospaced)).foregroundStyle(Palette.signal)
        Text(WatchCopy.reps).font(.system(size: 8.5)).foregroundStyle(Palette.ink2)
      }
      .padding(.top, 4)
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

  /// WT9 · EDIT SET (mock line 1531): the active value in a bordered pill (46 pt mono hero + unit),
  /// the moss "TURN CROWN TO SET" instruction, and the OTHER value as a quiet bordered "N reps" pill
  /// the athlete taps to move the crown onto. Bodyweight edits reps alone (no load pill at all).
  private var editor: some View {
    VStack(spacing: 10) {
      if bodyweight {
        editPill(active: true, tap: { field = .reps }) { heroValue("\(Int(r))", WatchCopy.reps) }
        crownHint
      } else if field == .weight {
        editPill(active: true, tap: { field = .weight }) { heroValue(fmtW(w), WatchCopy.kg) }
        crownHint
        editPill(active: false, tap: { field = .reps }) { quietValue(WatchCopy.repsCount(Int(r))) }
      } else {
        editPill(active: true, tap: { field = .reps }) { heroValue("\(Int(r))", WatchCopy.reps) }
        crownHint
        editPill(active: false, tap: { field = .weight }) { quietValue("\(fmtW(w)) \(WatchCopy.kg)") }
      }
    }
  }

  /// The bordered rounded pill that holds an edit value (mock line 1531 — border cream .16).
  private func editPill(active: Bool, tap: @escaping () -> Void, @ViewBuilder _ content: () -> some View) -> some View {
    Button(action: tap) {
      content()
        .padding(.vertical, active ? 5 : 4).padding(.horizontal, active ? 14 : 12)
        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(Palette.ink0.opacity(0.16), lineWidth: 1))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  /// The active pill's content: the 46 pt mono hero + its quiet unit (mock line 1531).
  private func heroValue(_ value: String, _ unit: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 5) {
      Text(value).font(.system(size: Fit.s(46), weight: .medium, design: .monospaced)).monospacedDigit()
        .foregroundStyle(Palette.ink0)
      Text(unit).font(.system(size: 15, design: .monospaced)).foregroundStyle(Palette.ink2)
    }
  }

  /// The quiet secondary pill's content — one mono line in the mock's warm light grey (#c9c4b4).
  private func quietValue(_ text: String) -> some View {
    Text(text).font(.system(size: 13, weight: .medium, design: .monospaced))
      .foregroundStyle(Color(red: 0.788, green: 0.769, blue: 0.706))
  }

  /// The moss crown instruction (mock line 1531): a refresh glyph + "TURN CROWN TO SET".
  private var crownHint: some View {
    HStack(spacing: 5) {
      Image(systemName: "arrow.clockwise").font(.system(size: 11, weight: .semibold))
      Text(WatchCopy.turnCrownToSet).font(.system(size: 8.5, weight: .medium, design: .monospaced)).tracking(1.2)
    }
    .foregroundStyle(Palette.signal)
    .frame(maxWidth: .infinity, alignment: .center)
  }

  private var footer: some View {
    // Mock WT2: a single full-width "Complete set" (cream). In Edit (WT9) it becomes a moss "Done"
    // that commits the set — the gentle-confirm fill, distinct from the cream that advances the work.
    StageButton(title: editing ? WatchCopy.done : WatchCopy.completeSet, kind: editing ? .moss : .primary, height: 44, fontSize: 15) {
      if editing { commit() } else { onComplete() }
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
  private var ready: Bool { (mirror.restRemainingS ?? 0) <= 0 }

  var body: some View {
    // NO SCROLL: the ring, the next-set line, the equipment setup, and BOTH actions stay on screen
    // at once on every case size (founder: nothing scrolls during execution). The ring is sized
    // down and the two actions share one row so all of it fits even on the 40/41 mm case.
    // The ring hugs the TOP (founder 2026-07-10: lift the rest clock); the freed room goes to
    // the line under the exercise name, which reads a size up. stageFill() pins the strip.
    VStack(spacing: 0) {
      // WT4 · REST (mock line 1496): a centered "LIFT i / n" legend at the top, the ring, then the
      // up-next CARD (name + set position + the coming load), and the two-button footer.
      Legend("\(WatchCopy.liftWord) \(mirror.liftIndex ?? 1) / \(mirror.liftCount ?? 1)", size: 9)
      // WT5 · REST — LEARNED. The seconds on this ring have been HERS since S-17 shipped, and the
      // wrist never said so. It appears only when the median really is hers: on a lift she has not
      // yet rested through, the timer runs the tier bootstrap and the claim would be a lie.
      if mirror.restIsLearned == true {
        Text(WatchCopy.yourPace)
          .font(.system(size: 8.5, design: .monospaced)).tracking(0.4)
          .foregroundStyle(Palette.signal)
      }
        .frame(maxWidth: .infinity)
        .padding(.top, 2)
      // On a correction rest the ring pays for the note out of its own diameter (76 → 56); every
      // ordinary rest keeps it full (S-13 caps corrections at 2 per exercise).
      RestRing(
        endsAt: mirror.restEndsAt,
        totalS: mirror.restTotalS ?? 90,
        diameter: Fit.s(mirror.correction == nil ? 76 : 56),
        // …and it RUNS in the correction's direction. The note below already names the move; the
        // ring is what the wrist actually looks at, so the two must not disagree.
        arc: mirror.correction.map { $0.direction == "down" ? Palette.down : Palette.up } ?? Palette.signal
      )
      .padding(.top, 4)
      Spacer(minLength: 3)
      upNextCard
      // THE SIGNATURE MOMENT — Loop 1 moved the next set's load; the mock gives it its own screen
      // (WT3), but the phone/watch runtime shows it inline on the rest it belongs to. Kept so the
      // product's most distinctive beat is never lost on the wrist.
      if let c = mirror.correction {
        CorrectionNote(c: c).padding(.top, 5)
      }
      Spacer(minLength: 3)
      RestActions(ready: ready, primaryTitle: ready ? WatchCopy.startNextSet : WatchCopy.skipRest, onReady: onReady, onAdd: onAdd)
    }
    .padding(.horizontal, 10).padding(.bottom, 6)
    .stageFill()
  }

  /// The up-next card (mock line 1497): a bordered row — the coming set's name + position on the
  /// left, its load on the right in moss. The set that is COMING (never `setLabel`, which on a
  /// rest frame is the set just finished — the phone's machine holds its index until the rest ends).
  private var upNextCard: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 1) {
        Text("\(WatchCopy.upNext.uppercased()) · \(WatchCopy.setWord) \(mirror.nextSetNumber ?? ((mirror.setNumber ?? 1) + 1))/\(mirror.setsInExercise ?? 1)")
          .font(.system(size: 7.5, weight: .medium, design: .monospaced)).tracking(0.6)
          .foregroundStyle(Palette.ink1)
          .lineLimit(1).minimumScaleFactor(0.7)
        Text(mirror.exerciseName)
          .font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.ink0)
          .lineLimit(1).minimumScaleFactor(0.75)
      }
      Spacer(minLength: 4)
      if let wt = mirror.targetWeight {
        (Text(fmtW(wt)).font(.system(size: 16, weight: .medium, design: .monospaced))
          + Text(" " + WatchCopy.kg).font(.system(size: 9, design: .monospaced)))
          .foregroundStyle(Palette.signal)
      } else {
        Text(WatchCopy.bodyweight).font(.system(size: 13, weight: .medium, design: .monospaced)).foregroundStyle(Palette.signal)
      }
    }
    .padding(.vertical, 7).padding(.horizontal, 10)
    .frame(maxWidth: .infinity)
    .background(RoundedRectangle(cornerRadius: 13).fill(Palette.ink0.opacity(0.06)))
    .overlay(RoundedRectangle(cornerRadius: 13).strokeBorder(Palette.ink0.opacity(0.14), lineWidth: 1))
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
  private var ready: Bool { (mirror.restRemainingS ?? 0) <= 0 }
  private var swaps: [WireSwapOption] { mirror.nextSwapOptions ?? [] }

  var body: some View {
    // NO SCROLL: ring + the next lift (name, load·reps, the execution setup line, the change) + BOTH
    // actions all stay visible at once. A plain block (no boxed card) keeps it within the 40/41 mm
    // height so nothing is ever clipped or scrolled during execution. Ring hugs the top; the line
    // under the name reads a size up (founder 2026-07-10). Swap is ONE TAP — Hush already picked
    // the replacement (phone parity).
    VStack(spacing: 0) {
      TopStrip(lift: (i: (mirror.liftIndex ?? 1) + 1, n: mirror.liftCount ?? 1), controlsHint: true)
      // Same law as the inter-set ring: the gap is paid out of the diameter (78 → 68 + 6), so this
      // screen — the tightest one in the app — ends up 4 pt SHORTER than it was, never taller.
      // WT11 rings read "REST" like WT4 — the transition is carried by the "LIFT i → i+1" legend
      // and the NEW-LIFT up-next line, not by relabelling the clock.
      RestRing(endsAt: mirror.restEndsAt, totalS: mirror.restTotalS ?? 120, diameter: Fit.s(68))
        .padding(.top, 6)
      // WT10 · EXERCISE DONE — "Bench, done." The lift she just CLOSED, named once, above the one
      // she is walking to. `completedExerciseName` has been on the wire and populated by both the
      // phone projection and the standalone engine since the wire was written, and no screen has
      // ever drawn it: the last set of a lift landed and the wrist said nothing about the lift.
      // It rides HERE, on the transition, because that is the only moment it is true — a lift is
      // done exactly when the next one is being walked to.
      if let done = mirror.completedExerciseName, !done.isEmpty {
        Text(WatchCopy.liftDone(done))
          .font(.system(size: 11, design: .serif))
          .foregroundStyle(Palette.ink2)
          .lineLimit(1).minimumScaleFactor(0.8)
          .padding(.top, 3)
      }
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

  /// The load, and only the load (founder 2026-07-12). This is the one rest where a number is an
  /// INSTRUCTION — the athlete is about to walk to a station and build it — and the setup line
  /// below says how much goes on each side. The reps are not part of that: you cannot load reps
  /// onto a bar, and they will be on the stage the moment the athlete gets there.
  private var nextTargetText: String {
    mirror.nextTargetWeight.map { "\(fmtW($0)) \(WatchCopy.kg)" } ?? WatchCopy.bodyweight
  }
}

// MARK: Cardio (watch-local run / walk — recorded, never coached)

/// The run/walk stage, paged exactly like a lift (founder 2026-07-11): the main page carries
/// ONLY the work (the clock + the live body metrics); swipe right for the controls (Pause /
/// Finish & save). Same muscle memory as the strength screens and as Apple's own Workout app.
/**
 * Cardio on the wrist — ONE SCREEN (founder 2026-07-12).
 *
 * It used to be two: a "stage" page with a big clock and no controls, and a controls page one
 * swipe away with the clock, the full readout, Pause and Finish. The founder's ruling: "get rid
 * of the main screen and make the pause screen the main one — it's better."
 *
 * He is right, and the reason is that the split was borrowed from the STRENGTH flow, where it
 * earns its keep: there, the stage carries a decision (the load, the reps, the set) and the
 * controls are an interruption you have to go and find. A run carries no decision. The only
 * things a runner ever wants are the numbers and the pause — and putting those on two different
 * pages means the one control they might need in a hurry is the one they have to swipe for,
 * mid-stride, in the rain. The second page bought nothing but a bigger clock.
 */
struct CardioPager: View {
  let gait: String
  let paused: Bool
  @ObservedObject var metrics: LiveMetrics
  /// CR3 — the split just closed, if one has. Non-nil takes the stage for its own beat.
  var split: KmSplit? = nil
  /// Pause-aware elapsed seconds — the watch's own clock (HealthKit only supplies HR/kcal/km).
  let elapsed: () -> TimeInterval
  let onPauseToggle: () -> Void
  let onEnd: () -> Void

  var body: some View {
    if let s = split {
      KmLoggedScreen(split: s)
    } else {
      CardioControlsScreen(gait: gait, paused: paused, metrics: metrics, elapsed: elapsed,
                           onPauseToggle: onPauseToggle, onEnd: onEnd)
    }
  }
}

/// CR3 · KM LOGGED — "every kilometre lands like a logged set."
///
/// The km-split HAPTIC has fired since the beat was built and nothing was ever drawn for it: the
/// wrist buzzed and the athlete had to guess what for. This is the same shape a logged set gets —
/// the number, the fact, a breath — and it leaves on its own after ~3 s, because a runner does not
/// tap. "QUICKEST THIS RUN" appears only when it is true of THIS recording; it is a measurement,
/// never a target and never praise.
private struct KmLoggedScreen: View {
  let split: KmSplit
  var body: some View {
    VStack(spacing: 0) {
      TopStrip()
      Spacer(minLength: 4)
      VStack(spacing: 7) {
        Legend(WatchCopy.kilometreSplit(split.km), size: 9)
        HStack(alignment: .lastTextBaseline, spacing: 3) {
          Text(fmtTime(split.splitS))
            .font(.system(size: Fit.s(34), weight: .semibold, design: .monospaced)).monospacedDigit()
            .foregroundStyle(Palette.ink0)
          Text(WatchCopy.perKm)
            .font(.system(size: 11, design: .monospaced)).foregroundStyle(Palette.ink2)
        }
        if split.quickest {
          Text(WatchCopy.quickestThisRun)
            .font(.system(size: 8.5, design: .monospaced)).tracking(0.5)
            .foregroundStyle(Palette.signal)
        }
      }
      .frame(maxWidth: .infinity)
      Spacer(minLength: 6)
      Text(WatchCopy.loggedBackToRun)
        .font(.system(size: 8.5, design: .monospaced)).tracking(0.5)
        .foregroundStyle(Palette.ink2)
    }
    .padding(.horizontal, 12).padding(.bottom, 8)
    .stageFill()
  }
}

/// CR2 · LIVE — the cardio stage: the clock, the readout, Pause / Resume and a guarded Finish.
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
      // (No swipe-away disarm needed any more — cardio is a single screen, so the only way off
      // this guard is to answer it.)
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
        // The same pair, in the same balance, as the lobby's Begin / Choose workout — one
        // button language across the whole watch (founder 2026-07-12).
        VStack(spacing: 6) {
          StageButton(title: paused ? WatchCopy.resume : WatchCopy.pause, kind: .primary, height: 44, fontSize: 17, action: onPauseToggle)
          // Finish only ARMS the guard (founder 2026-07-12) — the save happens behind it.
          StageButton(title: WatchCopy.finishSave, kind: .quiet, height: 40, fontSize: 15) { confirmingEnd = true }
        }
      }
      .padding(.horizontal, 10).padding(.bottom, 6)
      .stageFill()
    }
  }
}

/// CR4 · DONE — the run/walk completion (founder 2026-07-11: the wrist must close the activity, not just
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

/**
 * The wrist's closing beat, in two acts (founder 2026-07-12, corrected 2026-07-13: "read the
 * workout on the watch EXACTLY like the phone reads it — only the exercises that were performed,
 * with the green check animation").
 *
 * ACT ONE — WT12 · THE SCAN, the read-back. The lifts the athlete actually trained, walked one at a time, a sage
 * check landing on each with the best set they logged on it beside the name. It is the phone's
 * beat, on a wrist: the machine showing its work. The first cut listed the whole PRESCRIPTION and
 * marked what was missed with a dash — an honest ledger, but a ledger, and it made a workout that
 * ended early close on a list of things the athlete did not do. That is not what the phone shows
 * and it is not what the moment is for. What did not happen is simply not here.
 *
 * ACT TWO — the summary that was always here (time · kcal · lifts raised) and the way out.
 *
 * Tapping skips straight to act two: a beat you cannot skip is a beat that becomes an obstacle.
 */
struct CompleteScreen: View {
  let mirror: WireMirror
  /// Active calories for the finished workout, snapshotted from the OS runtime as the complete
  /// frame landed (it clears its live metrics while persisting the HKWorkout). Founder
  /// 2026-07-11: the set COUNT is not interesting at the close — the energy spent is.
  ///
  /// The FALLBACK, not the answer. ONE NUMBER PER WORKOUT (founder 2026-07-28): when the phone ran
  /// the session it computed the figure and sent it on the summary, and the wrist prints THAT — a
  /// workout reading 412 here and 380 in her Log is the kind of small lie that costs more trust
  /// than the extra accuracy buys. This reading stands only where the phone sent none: a standalone
  /// workout, where the wrist IS the authority and its measurement becomes the session's on the
  /// phone too (it travels home on the record).
  let kcal: Int?
  let onDone: () -> Void

  private var lifts: [WireSummaryLift] { mirror.summary?.lifts ?? [] }
  /// The phone's figure when there is one; the wrist's own reading otherwise.
  private var shownKcal: Int? { mirror.summary?.kcal ?? kcal }
  /// The mark this workout crossed, if it crossed one — earned on the phone, printed here
  /// (founder 2026-07-13). Nil for the overwhelming majority of workouts, which is what makes
  /// it worth showing at all.
  private var milestone: WireMilestone? { mirror.summary?.milestone }
  @State private var read = 0
  @State private var reading = true
  @State private var stamped = false

  var body: some View {
    if reading && !lifts.isEmpty {
      readBack
    } else if stamped, let m = milestone {
      milestoneBeat(m)
    } else {
      result
    }
  }

  /// A watchOS workout is six to eight lifts, and eight rows do not fit on a 41 mm case — this
  /// is the one screen in the app where a scroll is CORRECT (the workout is over; nothing is
  /// being executed). It follows the read: the list scrolls itself so the check that is landing
  /// is always the one under the athlete's eye, and the crown still works if they want to look back.
  private var readBack: some View {
    VStack(alignment: .leading, spacing: 0) {
      TopStrip()
      Legend(WatchCopy.reading, size: 10).padding(.top, 2)
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(lifts.enumerated()), id: \.offset) { i, lift in
              HStack(spacing: 8) {
                // The phone's mark exactly: a hollow ring that FILLS sage as the read reaches it,
                // with the check struck through it in the stage's own black.
                ZStack {
                  Circle()
                    .fill(i < read ? Palette.up : Color.clear)
                    .overlay(Circle().strokeBorder(i < read ? Palette.up : Palette.stage2, lineWidth: 1.5))
                    .frame(width: 15, height: 15)
                  if i < read {
                    Image(systemName: "checkmark")
                      .font(.system(size: 8, weight: .bold))
                      .foregroundStyle(Palette.stage0)
                  }
                }
                .frame(width: 15, height: 15)
                Text(lift.name)
                  .font(.system(size: 13))
                  .foregroundStyle(Palette.ink0)
                  .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                if let best = lift.best, !best.isEmpty {
                  Text(best)
                    .font(.system(size: 11, design: .monospaced)).monospacedDigit()
                    .foregroundStyle(Palette.ink2)
                    .lineLimit(1).fixedSize()
                }
              }
              .id(i)
              .opacity(i < read ? 1 : 0.32) // the phone's own dim for a lift not yet read
              .animation(.easeOut(duration: 0.22), value: read)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.top, 6)
        }
        .onChange(of: read) { _, r in
          guard r > 0 else { return }
          withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(r - 1, anchor: .center) }
        }
      }
    }
    .padding(.horizontal, 12).padding(.bottom, 8)
    .contentShape(Rectangle())
    .onTapGesture { finishReading() }
    .task {
      // `1...0` is not an empty range in Swift — it TRAPS. The branch above cannot reach here
      // with an empty list, but a crash on a wrist is not a thing to leave to an invariant.
      guard !lifts.isEmpty else {
        reading = false
        return
      }
      // One tick per lift, then a beat to let the last check land before the result.
      for i in 1...lifts.count {
        try? await Task.sleep(nanoseconds: 260_000_000)
        if Task.isCancelled || !reading { return }
        read = i
        // A tap per lift — the machine chewing through the evidence, felt with the wrist down
        // (phone parity: the same tick lands under each check as it appears).
        WatchHaptics.play(.restApproach)
      }
      try? await Task.sleep(nanoseconds: 600_000_000)
      if Task.isCancelled { return }
      if reading { withAnimation { reading = false } }
    }
  }

  private func finishReading() {
    read = lifts.count
    withAnimation { reading = false }
  }

  /// WT6 · SESSION EARNED. The tally mark, the quiet serif "That's the work.", and the four-metric
  /// row (MIN · KCAL · T · UP) the mock centres in the case — no "SAVED" legend, no workout name.
  /// The one exit still passes through beat 4 when this session crossed a mark.
  private var result: some View {
    VStack(spacing: 0) {
      TopStrip()
      Spacer(minLength: 4)
      VStack(spacing: 12) {
        TallyMark()
        Text(WatchCopy.thatsTheWork)
          .font(.system(size: Fit.s(22), design: .serif))
          .foregroundStyle(Palette.ink0)
          .multilineTextAlignment(.center)
          .lineSpacing(1)
          .fixedSize(horizontal: false, vertical: true)
        if let s = mirror.summary {
          HStack(alignment: .top, spacing: 10) {
            completeMetric(minutesLabel(s.timeLabel), WatchCopy.metricMinShort, Palette.ink0)
            // Kcal from the OS runtime; an honest dash when HealthKit gave nothing, never a model.
            completeMetric(shownKcal.map { "\($0)" } ?? "––", WatchCopy.metricKcalShort, Palette.ink0)
            completeMetric(fmtTonnes(s.volumeKg), WatchCopy.metricTonnesShort, Palette.ink0)
            // The one moss figure — lifts the model raised this session.
            completeMetric("\(s.up)", WatchCopy.metricUpShort, Palette.signal)
          }
        }
      }
      .frame(maxWidth: .infinity)
      Spacer(minLength: 8)
      // The way out passes through the mark, exactly as it does on the phone: any exit from the
      // result plays beat 4 once, and only on the session that earned it.
      StageButton(title: WatchCopy.done, kind: .primary, height: 48, fontSize: 16) {
        guard milestone != nil else {
          onDone()
          return
        }
        WatchHaptics.play(.receiptEarned)
        withAnimation(.spring(response: 0.34, dampingFraction: 0.7)) { stamped = true }
      }
    }
    .padding(.horizontal, 12).padding(.bottom, 8)
  }

  /// One column of the WT6 metric row — mono value over a muted mono label. The value colour
  /// carries the one distinction the mock draws: moss for UP, cream for the rest.
  private func completeMetric(_ value: String, _ label: String, _ color: Color) -> some View {
    VStack(spacing: 2) {
      Text(value)
        .font(.system(size: Fit.s(15), weight: .medium, design: .monospaced)).monospacedDigit()
        .foregroundStyle(color)
        .lineLimit(1).minimumScaleFactor(0.7)
      Text(label)
        .font(.system(size: 8, weight: .regular, design: .monospaced)).tracking(0.4)
        .foregroundStyle(Palette.ink2)
    }
  }

  /**
   * WT8 · MILESTONE — BEAT 4, the one licensed loud moment on the wrist (founder 2026-07-13).
   *
   * The phone strikes a medallion with an engraved glyph; a 41 mm case has no room for the
   * engraving and no business inventing a second one. So the wrist keeps what the mark IS: the
   * figure, in the ochre ring, and the one factual line beneath it. Facts, never praise — "100
   * workouts.", not "amazing". A mark with no figure (the first raise) simply shows its line, and
   * the ring holds the check instead.
   */
  private func milestoneBeat(_ m: WireMilestone) -> some View {
    VStack(spacing: 0) {
      TopStrip()
      Spacer(minLength: 4)
      VStack(spacing: 13) {
        // The mock's seal: a dashed CREAM outer ring around a faint solid inner ring, the engraved
        // figure + its unit stacked at the centre (a check when the mark is an event, not a number).
        ZStack {
          Circle().strokeBorder(
            Palette.ink0.opacity(0.4),
            style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])
          ).frame(width: 96, height: 96)
          Circle().strokeBorder(Palette.ink0.opacity(0.18), lineWidth: 1).frame(width: 74, height: 74)
          VStack(spacing: 1) {
            if let v = m.value, !v.isEmpty {
              Text(v)
                .font(.system(size: 30, weight: .medium, design: .monospaced)).monospacedDigit()
                .foregroundStyle(Palette.ink0)
                .lineLimit(1).minimumScaleFactor(0.6)
              if let c = m.caption, !c.isEmpty {
                Text(c.uppercased())
                  .font(.system(size: 8, weight: .medium, design: .monospaced)).tracking(1.3)
                  .foregroundStyle(Palette.ink2)
                  .lineLimit(1)
              }
            } else {
              DrawCheck(size: 26)
            }
          }
          .padding(.horizontal, 8)
        }
        // The one factual line, in the coach's serif — "Ten workouts.", never "amazing".
        Text(m.title)
          .font(.system(size: Fit.s(17), design: .serif)).foregroundStyle(Palette.ink0)
          .multilineTextAlignment(.center)
          .lineLimit(2).minimumScaleFactor(0.7).fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity)
      Spacer(minLength: 8)
      StageButton(title: WatchCopy.done, kind: .primary, height: 48, fontSize: 16, action: onDone)
    }
    .padding(.horizontal, 12).padding(.bottom, 8)
  }
}

// MARK: 07 · Paused

/// WT13 · PAUSED. A pause glyph ringed in cream, the serif "Paused", and three ways out: Resume
/// (moss primary), End workout (outlined — arms the WT13b guard), and "Something feels off" (the
/// clay-outlined report that opens WT14). Ending is still guarded; a sleeve brushing Paused must
/// never close the workout in one touch.
struct PausedScreen: View {
  let onResume: () -> Void
  let onEnd: () -> Void
  /// Returns whether the report actually reached the phone — WT15 is a claim about what the PHONE
  /// did, so a report that went nowhere must not draw one (see `WatchModel.reportPain`).
  var onReportPain: (String, String) -> Bool = { _, _ in false }
  @State private var confirmingEnd = false
  @State private var reportingPain = false
  /// The muscle she named, held while WT14b asks how sharp it is. Non-nil = the severity step.
  @State private var painArea: String?
  /// The muscle whose ease has just been acknowledged (WT15). Non-nil = the acknowledgement.
  @State private var easedArea: String?
  var body: some View {
    if confirmingEnd {
      EndConfirmScreen(onConfirm: onEnd, onKeep: { confirmingEnd = false })
    } else if let eased = easedArea {
      // WT15 · ENGINE RESPONDS — she named it, and this says what Hush did about it.
      PainAcknowledgedScreen(muscle: eased, onResume: {
        easedArea = nil
        onResume()
      })
    } else if let area = painArea {
      // WT14b · HOW SHARP? — the same three the phone asks. Backing out returns to the areas, so a
      // mis-tap on a muscle is one tap to undo and never a report she did not mean to file.
      PainSeverityScreen(
        muscle: area,
        onPick: { severity in
          painArea = nil
          reportingPain = false
          // Only the acknowledgement is conditional. The flag was taken either way.
          if onReportPain(area, severity) { easedArea = area }
        },
        onBack: { painArea = nil }
      )
    } else if reportingPain {
      PainAreaScreen(onPick: { area in painArea = area },
                     onBack: { reportingPain = false })
    } else {
      VStack(spacing: 0) {
        TopStrip()
        Spacer(minLength: 4)
        VStack(spacing: 9) {
          ZStack {
            Circle().strokeBorder(Palette.ink0.opacity(0.3), lineWidth: 1.5).frame(width: 44, height: 44)
            Image(systemName: "pause.fill").font(.system(size: 16)).foregroundStyle(Palette.ink0)
          }
          Text(WatchCopy.pausedTitle)
            .font(.system(size: Fit.s(18), design: .serif)).foregroundStyle(Palette.ink0)
        }
        .frame(maxWidth: .infinity)
        Spacer(minLength: 8)
        VStack(spacing: 6) {
          StageButton(title: WatchCopy.resume, kind: .moss, height: 40, fontSize: 14, action: onResume)
          OutlineButton(title: WatchCopy.endWorkout, systemImage: "stop", tint: Palette.ink1,
                        border: Palette.ink0.opacity(0.2), height: 34, fontSize: 11.5) { confirmingEnd = true }
          OutlineButton(title: WatchCopy.somethingOff, tint: Palette.clay,
                        border: Palette.clay.opacity(0.55), height: 34, fontSize: 11.5) { reportingPain = true }
        }
      }
      .padding(.horizontal, 10).padding(.bottom, 8)
    }
  }
}

/// WT14 · WHAT'S OFF. The phone's body map has no home on a 41 mm case, so its regions arrive as a
/// plain scrolling list ("Shoulder", "Lower back", …). Selecting one reports that area to the phone,
/// which owns what to do with it (a pain flag is a fact the model acts on, never a diagnosis here).
private struct PainAreaScreen: View {
  let onPick: (String) -> Void
  let onBack: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 6) {
        Button(action: onBack) {
          Image(systemName: "chevron.left").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.ink2)
        }
        .buttonStyle(.plain)
        Legend(WatchCopy.whereIsIt, size: 10)
      }
      ScrollView {
        VStack(spacing: 5) {
          ForEach(WatchCopy.painAreas, id: \.self) { area in
            Button { onPick(area) } label: {
              HStack {
                Text(area).font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.ink0)
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.system(size: 10, weight: .medium)).foregroundStyle(Palette.ink2)
              }
              .padding(.vertical, 7).padding(.horizontal, 11)
              .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.ink0.opacity(0.13), lineWidth: 1))
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
        .padding(.top, 6)
      }
    }
    .padding(.horizontal, 12).padding(.top, 4).padding(.bottom, 6)
    .stageFill()
  }
}

/// WT14b · HOW SHARP? — the second of the two questions the phone asks (§13.2), asked identically
/// on the wrist. It exists because the FIRST cut of this seam picked the mildest window on her
/// behalf: the wrist had no room for a follow-up, so the engine chose. The founder's ruling
/// (2026-07-28) is that it does not choose — she does, here, in three taps' worth of screen.
///
/// The only thing the answer buys is how long the muscle rests (3 / 7 / 14 days). No diagnosis, no
/// scale, no score — three words a person can answer honestly standing at a rack.
private struct PainSeverityScreen: View {
  let muscle: String
  let onPick: (String) -> Void
  let onBack: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 6) {
        Button(action: onBack) {
          Image(systemName: "chevron.left").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.ink2)
        }
        .buttonStyle(.plain)
        Legend(WatchCopy.howSharp, size: 10)
      }
      Text(muscle)
        .font(.system(size: Fit.s(17), design: .serif)).foregroundStyle(Palette.ink0)
        .lineLimit(1).minimumScaleFactor(0.8)
        .padding(.top, 3)
      Spacer(minLength: 4)
      VStack(spacing: 6) {
        ForEach(WatchCopy.severityChoices) { choice in
          Button { onPick(choice.value) } label: {
            HStack {
              Text(choice.label).font(.system(size: 12.5, weight: .medium)).foregroundStyle(Palette.ink0)
              Spacer(minLength: 4)
              Image(systemName: "chevron.right").font(.system(size: 10, weight: .medium)).foregroundStyle(Palette.ink2)
            }
            .padding(.vertical, 8).padding(.horizontal, 11)
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.clay.opacity(0.45), lineWidth: 1))
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
      Spacer(minLength: 4)
    }
    .padding(.horizontal, 12).padding(.top, 4).padding(.bottom, 6)
    .stageFill()
  }
}

/// WT15 · ENGINE RESPONDS — "you name it; the plan bends around it."
///
/// The one beat that closes the loop she opened. It says what Hush DID, in facts: the muscle rests
/// and its lifts are swapped. It does not name a cause, it does not sympathise, and it does not
/// claim a number — the phone owns the window's length and the replacement lifts, and both are
/// already decided by the time this draws. Resume is the only way out, because she is mid-workout.
private struct PainAcknowledgedScreen: View {
  let muscle: String
  let onResume: () -> Void
  var body: some View {
    VStack(spacing: 0) {
      TopStrip()
      Spacer(minLength: 4)
      VStack(alignment: .leading, spacing: 8) {
        Legend(WatchCopy.gotIt, size: 10)
        Text(WatchCopy.easingToday(muscle))
          .font(.system(size: Fit.s(19), design: .serif)).foregroundStyle(Palette.ink0)
          .multilineTextAlignment(.leading).lineSpacing(1)
          .fixedSize(horizontal: false, vertical: true)
        VStack(alignment: .leading, spacing: 3) {
          Text(WatchCopy.easedSwapped).font(.system(size: 10.5, design: .monospaced)).foregroundStyle(Palette.ink2)
          Text(WatchCopy.easedRests).font(.system(size: 10.5, design: .monospaced)).foregroundStyle(Palette.ink2)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Spacer(minLength: 8)
      StageButton(title: WatchCopy.resume, kind: .moss, height: 40, fontSize: 14, action: onResume)
    }
    .padding(.horizontal, 12).padding(.bottom, 8)
    .stageFill()
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
