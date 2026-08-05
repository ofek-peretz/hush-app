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

// MARK: The wrist's layout law

/*
 * ════ THE SCREEN IS SMALL. THAT IS A REASON TO USE ALL OF IT ════
 *
 * Founder, device review 2026-08-01: *"you are not using the screen well... there are dead zones
 * you could put things in... you cram everything inward, or you blow one thing up against
 * everything else... use the top-LEFT corner, which is empty most of the time... and this is a
 * 45 mm watch — I don't want to know what it looks like on a smaller one."*
 *
 * He is describing three separate failures with one cause: every screen laid itself out by hand,
 * so every screen negotiated its own margins, its own header position and its own button height.
 * Six screens lost that negotiation and clipped their primary action off the bottom edge.
 *
 * ── THE THREE RULES ─────────────────────────────────────────────────────────────────────────────
 *  1. THE ACTION ZONE IS NOT NEGOTIABLE. It is measured before the body and it sits ON the bottom
 *     edge (founder-authorised: *"you may put the confirm buttons right on the bottom edge"*).
 *     A button that has to fight the content for room is a button that eventually loses.
 *  2. THE HEADER LIVES TOP-LEFT. watchOS draws its clock at top-RIGHT of every app; the left half
 *     of that row is ours and it was blank on almost every screen.
 *  3. NOTHING IS SMALLER THAN IT NEEDS TO BE READ. This is a watch: she is sweating, her pulse is
 *     up, she may be outside in the sun, and she is looking at it for under a second. A 7.5 pt
 *     legend is a decision to be unreadable. The floor is 10, and the things that matter are 13+.
 */
enum Wrist {
  /// Side padding. 9 rather than 12: on a 41 mm case every point of width is a point of type.
  static let side: CGFloat = 9
  /// The gap under the action zone. Three points, not eight — the founder gave the bottom edge.
  static let foot: CGFloat = 3
  /// The header row. Fixed on every screen, so nothing above the fold ever shifts between them.
  static let head: CGFloat = 20
  /// A primary action. Big enough to hit with a wet thumb, on the smallest case.
  static let action: CGFloat = 44
  /*
   * ⛔ THE TYPE FLOOR IS ELEVEN (founder 2026-08-04): *"if something is very small, either enlarge
   * it, design it differently, or remove it — we must never reach a state where something on the
   * watch is unclear."*
   *
   * It was ten, and the wrist is the surface where the rule matters most: held at arm's length,
   * glanced at mid-set, in a gym's own bad light. One point is a large fraction of a 41 mm case.
   */
  static let legend: CGFloat = 11
  static let label: CGFloat = 11
  static let body: CGFloat = 14
}

/// Every screen: a body that flexes and an action zone that does not.
///
/// The action zone claims its height FIRST (`layoutPriority`), which is the whole fix for the
/// founder's *"Start is cut off"*, *"Something feels off is cut off"*, *"Done is cut off"*. The
/// body then compresses into whatever remains, and a headline that no longer fits scales instead
/// of pushing the button through the floor of the case.
struct WristScreen<Content: View, Actions: View>: View {
  private let content: Content
  private let actions: Actions

  init(@ViewBuilder content: () -> Content, @ViewBuilder actions: () -> Actions) {
    self.content = content()
    self.actions = actions()
  }

  var body: some View {
    VStack(spacing: 0) {
      content
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      actions
        .layoutPriority(1)
    }
    .padding(.horizontal, Wrist.side)
    .padding(.bottom, Wrist.foot)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }
}

/// A screen with nothing to press — the glance, the read-back, WT3. It still hangs from the same
/// top edge and keeps the same margins, which is the only reason they all line up.
extension WristScreen where Actions == EmptyView {
  init(@ViewBuilder content: () -> Content) {
    self.init(content: content, actions: { EmptyView() })
  }
}

// MARK: Palette (v7 stage tokens — mirror of the phone's design/tokens.ts)

enum Palette {
  static let stage0 = Color(red: 0.075, green: 0.071, blue: 0.063) // stage[0] #131210 — the ground
  static let stage1 = Color(red: 0.106, green: 0.098, blue: 0.078) // stage[1] #1b1914 — raised / card
  static let stage2 = Color(red: 0.165, green: 0.157, blue: 0.133) // stage[2] #2a2822 — line / track
  static let ink0 = Color(red: 0.945, green: 0.933, blue: 0.898) // cream[0] #f1eee5 — primary text
  static let ink1 = Color(red: 0.659, green: 0.635, blue: 0.565) // cream[1] #a8a290 — secondary
  static let ink2 = Color(red: 0.545, green: 0.518, blue: 0.455) // cream[2] #8b8474 — muted
  /// The quietest ink on the stage (#57534a), from WT3's struck-through old load. Below the
  /// contrast a LABEL is allowed — which is the point: it is reserved for a value that has been
  /// superseded and is on screen only so the live one has something to differ from.
  static let ink3 = Color(red: 0.341, green: 0.325, blue: 0.290) // #57534a — superseded
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
  /// Anything the screen wants said on the header row — "CHEST · SET 2/4", "NOW · UPPER A".
  /// It replaces the lift counter rather than joining it: one line, one fact.
  var text: String? = nil
  /// A figure at the END of the row, still clear of the clock — the glance screen's elapsed.
  var trailing: String? = nil
  var controlsHint: Bool = false
  @Environment(\.goControls) private var goControls
  var body: some View {
    HStack(spacing: 7) {
      if let text {
        Text(text)
          .font(.system(size: Wrist.label, weight: .medium, design: .monospaced)).tracking(0.8)
          .foregroundStyle(Palette.ink1)
          .lineLimit(1).minimumScaleFactor(0.75)
      } else if let lift {
        Text("LIFT \(lift.i)/\(lift.n)")
          .font(.system(size: Wrist.label, weight: .medium, design: .monospaced)).tracking(0.8)
          .foregroundStyle(Palette.ink1)
      }
      if controlsHint {
        Button(action: { TapGate.pass(goControls) }) {
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
      Spacer(minLength: 2)
      if let trailing {
        Text(trailing)
          .font(.system(size: Wrist.label, weight: .medium, design: .monospaced)).monospacedDigit()
          .foregroundStyle(Palette.ink1)
      }
    }
    /*
     * THE CLOCK'S LANE.
     *
     * watchOS draws the time at top-RIGHT and nothing may sit under it. The old strip reserved
     * that width with `Spacer(minLength: 40)`, which also meant the header could never place
     * anything at the row's end — so the entire right half went unused on every screen while the
     * left half carried one nine-point word.
     *
     * Reserving it as PADDING instead frees the whole remaining row: a trailing figure now lands
     * beside the clock rather than being pushed off by it, and the founder's *"use the top-left"*
     * becomes *"use the top row".*
     */
    .padding(.trailing, 52)
    .frame(height: Wrist.head)
  }
}

/// The affordance to act. primary = ochre; onstage = white-on-dark; quiet = raised tile
/// (secondary but visibly a button); danger = clay (the irreversible act inside the end
/// guard); ghost = bare.
/// ════ ONE TAP IS ONE TAP ════
///
/// Founder, device QA 2026-07-30: *"tapping quickly skips screens and ends the workout early."*
///
/// Every beat on this wrist is short, and several of them replace each other in under two seconds:
/// the set confirmation holds 1.5 s, WT3 the same, a rest ends the instant it is skipped. A finger
/// that taps twice where a button USED to be hits whatever took its place — and the sequences that
/// end a workout are exactly the ones laid out most alike ("End workout" over "Resume", the confirm
/// screen's "End & save" where "Something feels off" was).
///
/// The fix is not per-screen. A screen that guards itself is a screen someone has to remember to
/// guard, and the one that gets forgotten is found by an athlete mid-workout. So the gate is GLOBAL
/// and lives at the only door every action goes through: one activation per window, across every
/// button on every screen, because the whole point is that the second tap lands somewhere else.
///
/// 350 ms: longer than the fastest double-tap a person makes by accident (~250 ms), well short of
/// the ~500 ms it takes to see a new screen, read it, and decide. A deliberate second tap is not
/// prevented — only one that arrives before the eye could have caught up.
enum TapGate {
  private static var lastAt: TimeInterval = 0
  private static let windowS: TimeInterval = 0.35

  static func pass(_ action: () -> Void) {
    let now = ProcessInfo.processInfo.systemUptime
    guard now - lastAt >= windowS else { return }
    lastAt = now
    action()
  }
}

/** How far the seated button's rounded bottom is pushed past the display edge. */
private let SEAT_BLEED: CGFloat = 16

struct StageButton: View {
  enum Kind { case primary, moss, onstage, quiet, danger, ghost }
  let title: String
  var kind: Kind = .primary
  var height: CGFloat = 44
  var fontSize: CGFloat = 16
  /**
   * ⚠️ THE BUTTON IS THE FLOOR OF THE SCREEN (founder 2026-08-04): *"I have no problem with you
   * sitting it right on the bottom of the screen instead of a button floating in the air."*
   *
   * Full-bleed, rounded at the top, and its BOTTOM corners pushed past the display edge by
   * `SEAT_BLEED` so the case's own curve finishes the shape. That is deliberately built from
   * `RoundedRectangle` and a negative padding rather than from `UnevenRoundedRectangle`, which is
   * watchOS 10 — this target carries no `@available` guards anywhere, so its floor is unknown to me
   * and an unverifiable API is not worth a nicer corner.
   *
   * ⚠️ DECLARED BEFORE `action`: the memberwise initialiser is positional and a trailing closure
   * binds to the LAST parameter, so a flag after it would swallow the closure.
   */
  var seated: Bool = false
  let action: () -> Void
  var body: some View {
    Button(action: { TapGate.pass(action) }) {
      Text(title)
        .font(.system(size: fontSize, weight: .semibold))
        .frame(maxWidth: .infinity).frame(height: Fit.s(height)) // taller targets on larger cases
        .padding(.bottom, seated ? Wrist.foot + SEAT_BLEED : 0)
        .foregroundStyle(fg)
        .background(bg)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        /*
         * ⚠️ CANCELS THE CONTAINER'S GUTTERS RATHER THAN REMOVING THEM. `WristScreen` pads every
         * screen by `Wrist.side` and `Wrist.foot`; taking those off the container would silently
         * un-pad the screens that have no actions at all (the glance, the read-back, WT3). The
         * seated button reaches the edge by paying the padding back with negative margins of its
         * own, so exactly one screen changes.
         */
        .padding(.bottom, seated ? -(Wrist.foot + SEAT_BLEED) : 0)
        .padding(.horizontal, seated ? -Wrist.side : 0)
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

/**
 * The brand's range mark, small enough to sit beside a wordmark: a rule between two end ticks.
 *
 * ⚠️ CREAM, NOT OCHRE. I reached for ochre because that is how I had drawn it — and this palette
 * says in its own words that *"ochre is retired: v7's tokens.ts holds none"*. The phone's
 * `RangeMark` defaults to `color.textPrimary` too, so cream is not a compromise here; it is what
 * the component actually is on both surfaces.
 */
private struct RangeGlyph: View {
  var body: some View {
    ZStack {
      Rectangle().fill(Palette.ink0).frame(width: 20, height: 1.3)
      HStack {
        Rectangle().fill(Palette.ink0).frame(width: 1.3, height: 9)
        Spacer()
        Rectangle().fill(Palette.ink0).frame(width: 1.3, height: 9)
      }
      .frame(width: 20)
    }
    .frame(width: 20, height: 9)
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
    Button(action: { TapGate.pass(action) }) {
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
        Button(action: { TapGate.pass(onAdd) }) {
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
  /// The founder counted this one twice: *"the KG · SETS line, 4 — impossible to see through a
  /// watch"* and *"you can even shrink Done a little and give these numbers more size."* 22 is the
  /// figure; the legend under it is the smallest thing on the screen because it is the part she
  /// already knows.
  var valueSize: CGFloat = Fit.s(22)
  var body: some View {
    VStack(spacing: 3) {
      // A wide mark ("12:34") must SCALE into its column, never ellipsize (founder
      // 2026-07-10: elapsed read "12:…" on the 40 mm case — unreadable).
      Text(value).font(.system(size: valueSize, weight: .semibold, design: .monospaced)).monospacedDigit()
        .foregroundStyle(Palette.ink0)
        .lineLimit(1).minimumScaleFactor(0.5)
      Legend(label, size: Wrist.legend)
    }
    .frame(maxWidth: .infinity)
  }
}

/// A metric that stands in its own tile — WT13c's layout, and the reason that screen reads.
///
/// The founder on the live glance: *"you can design it far, far better, and again the text is tiny
/// and impossible to see through a watch."* Bare numbers on an empty ground gave the eye nothing to
/// land on; the canonical mock gives each figure a raised tile, and the heart — the one a person
/// actually looks for — gets a full-width one of its own.
private struct MetricTile: View {
  let value: String
  let label: String
  var glyph: String? = nil
  var tint: Color = Palette.ink0
  var valueSize: CGFloat = Fit.s(26)
  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(spacing: 5) {
        if let glyph {
          Image(systemName: glyph).font(.system(size: 12, weight: .semibold)).foregroundStyle(tint)
        }
        Text(value)
          .font(.system(size: valueSize, weight: .medium, design: .monospaced)).monospacedDigit()
          .foregroundStyle(Palette.ink0)
          .lineLimit(1).minimumScaleFactor(0.5)
      }
      Legend(label, size: Wrist.legend)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 8).padding(.horizontal, 11)
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Palette.ink0.opacity(0.07)))
  }
}

// MARK: Controls page (swipe right during execution — the Apple Workout idiom)

/// Big Pause / End plus the live body metrics (Elapsed / Heart / Kcal from the OS
/// workout runtime). Lives one page LEFT of every execution screen so the main stage
/// carries only the work; everything here is secondary-but-reachable. Metrics degrade
/// to placeholders when HealthKit has no data — never a blocker, never a fake number.
private struct ControlsScreen: View {
  // No metrics, no workout name: this page delegates to WT13 · PAUSED now, and every figure it
  // used to draw is on the GLANCE page one swipe the other way. An input a view accepts and never
  // reads is how the live-set swap stayed invisible for months — see the reachability law.
  var lift: (i: Int, n: Int)? = nil
  /// This page is the one on screen. An armed end-guard DISARMS the moment the athlete
  /// swipes back to the stage — a guard they walked away from must never be waiting for
  /// them, cocked, the next time they come to pause.
  var onPage: Bool = true
  let onPause: () -> Void
  let onEnd: () -> Void
  /// Returns whether the report actually reached the phone — WT15 is a claim about what the PHONE
  /// did, so a report that went nowhere must not draw one.
  var onReportPain: (String, String) -> Bool = { _, _ in false }
  @State private var confirmingEnd = false

  /*
   * ════ THE PAGE BESIDE THE SET IS THE PAUSE, NOT A DASHBOARD ════
   *
   * Founder, device review 2026-08-01: *"the PAUSED screen that says UPPER A, ELAPSED and all the
   * rest should be deleted — the screen that should come after it is the one with SOMETHING FEELS
   * OFF."*
   *
   * The page held a workout name, three live metrics and two buttons. Every one of those metrics
   * is on the GLANCE page one swipe the other way, which is where a person looks for them; here
   * they were between her and the only two things this page is for. And the "Something feels off"
   * path — the one that changes her programme — was two taps further in, behind a Pause she had to
   * commit to first.
   *
   * So this page is now WT13 · PAUSED itself: Resume, End workout, and the report. Arriving here
   * pauses the session, which is what a person swiping away from a live set means.
   */
  var body: some View {
    if confirmingEnd {
      EndConfirmScreen(lift: lift, onConfirm: onEnd, onKeep: { confirmingEnd = false })
        .onChange(of: onPage) { _, on in if !on { confirmingEnd = false } }
    } else {
      PausedScreen(onResume: {}, onEnd: onEnd, onReportPain: onReportPain,
                   armEnd: { confirmingEnd = true })
        .onChange(of: onPage) { _, on in if on { onPause() } }
    }
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
    /*
     * Founder, device review 2026-08-01: *"the NOW · UPPER A screen showing calories and heart —
     * you can design it far, far better, and again the text is tiny."*
     *
     * The old build printed bare numbers on an empty ground with em-dash placeholders, and put the
     * session's own two figures on ONE line at 8 pt: "1,776 KG · SETS · 4". Nothing had an edge,
     * so nothing had a size.
     *
     * The canonical WT13c gives every figure a tile: the heart full-width (it is the one a person
     * swipes here to find), then burn and her own lifting side by side. Elapsed moves up to the
     * header row, beside the clock — which is the founder's *"use the whole top row"* in one move,
     * and it buys the tiles the height they need.
     */
    WristScreen {
      VStack(alignment: .leading, spacing: 0) {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
          TopStrip(text: workoutName.map { "\(WatchCopy.nowLegend) · \($0.uppercased())" } ?? WatchCopy.nowLegend,
                   trailing: elapsedText)
        }
        Spacer(minLength: 4)
        TimelineView(.periodic(from: .now, by: 1)) { _ in
          VStack(spacing: 6) {
            MetricTile(value: metrics.heartRateBpm.map { "\($0)" } ?? "––",
                       label: WatchCopy.bpm.uppercased(), glyph: "heart.fill", tint: Palette.clay,
                       valueSize: Fit.s(30))
            HStack(spacing: 6) {
              MetricTile(value: metrics.activeKcal.map { "\($0)" } ?? "––",
                         label: WatchCopy.metricKcalShort, glyph: "flame.fill", tint: Palette.ink1)
              MetricTile(value: volumeKg.map(fmtKg) ?? "––",
                         label: "\(WatchCopy.metricKgSets) \(sets ?? 0)")
            }
          }
        }
        Spacer(minLength: 4)
        HStack(spacing: 4) {
          Image(systemName: "chevron.left").font(.system(size: 9, weight: .semibold))
          Text(WatchCopy.backToYourSet).font(.system(size: 11))
        }
        .foregroundStyle(Palette.ink2)
        .frame(maxWidth: .infinity, alignment: .center)
      }
    }
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
  /// The irreversible act's own label. A strength workout ENDS; a run is FINISHED AND SAVED, and
  /// the cardio guard asks "Finish & save?" — a button reading "End workout" under that question
  /// answers a different one. Defaulted, so the two strength call sites are untouched.
  var confirmTitle: String = WatchCopy.endWorkout
  var lift: (i: Int, n: Int)? = nil
  let onConfirm: () -> Void
  let onKeep: () -> Void
  var body: some View {
    WristScreen {
      VStack(spacing: 0) {
        TopStrip(lift: lift)
        Spacer(minLength: 4)
        VStack(spacing: 7) {
          Text(title)
            .font(.system(size: Fit.s(21), design: .serif)).foregroundStyle(Palette.ink0)
            .multilineTextAlignment(.center).lineSpacing(1)
            .fixedSize(horizontal: false, vertical: true)
          Text(WatchCopy.endConfirmSub)
            .font(.system(size: 12)).foregroundStyle(Palette.ink2)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        Spacer(minLength: 4)
      }
    } actions: {
      VStack(spacing: 5) {
        // Clay FILL, stage ink — the irreversible act, now the primary (the guard was the earlier tap).
        StageButton(title: confirmTitle, kind: .danger, height: Wrist.action, fontSize: 15, action: onConfirm)
        OutlineButton(title: WatchCopy.keepGoing, tint: Palette.ink1,
                      border: Palette.ink0.opacity(0.22), height: 34, fontSize: 12, action: onKeep)
      }
    }
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
  /// The paused page owns the "something feels off" path now, so the reporter travels with it.
  var onReportPain: (String, String) -> Bool = { _, _ in false }
  @ViewBuilder let content: () -> Content
  @State private var page = 1

  var body: some View {
    // THREE pages, the Apple Workout idiom exactly: stop on one side, glance on the other, and the
    // work in the middle. It was two — the only thing beside the stage was the way to END, so a
    // swipe the "wrong" way found nothing at all (founder 2026-07-28).
    TabView(selection: $page) {
      ControlsScreen(lift: lift, onPage: page == 0,
                     onPause: onPause, onEnd: onEnd, onReportPain: onReportPain).tag(0)
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
      /*
       * THE WHOLE WRIST TURNS AROUND, ONCE, HERE.
       *
       * `layoutDirection` is an environment value: setting it at the root flips every stack,
       * alignment and chevron underneath it — the same thing `I18nManager.forceRTL` does to the
       * phone, and the founder asked for exactly that ("do the same RTL as the phone").
       *
       * Doing it here rather than per-screen is the point. Twenty-three screens each remembering
       * to mirror themselves is twenty-three chances to forget, and the one that forgets is found
       * by an athlete rather than by us.
       */
      .environment(\.layoutDirection, model.rtl ? .rightToLeft : .leftToRight)
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
    case let .liftDone(name):
      // WT10 — the lift is closed. One beat, then the transition rest names what is next.
      LiftDoneScreen(name: name, onTap: model.dismissSetConfirm)
    case let .correction(c):
      // WT3 — the set is logged AND it moved the next load, so this beat says the news instead of
      // restating a load and a rep count she chose herself thirty seconds ago.
      CorrectionScreen(c: c, onTap: model.dismissSetConfirm)
    case let .activeSet(m, draft):
      ExecutionPager(metrics: model.liveMetrics, workoutName: m.workoutName,
                     lift: (i: m.liftIndex ?? 1, n: m.liftCount ?? 1),
                     onPause: model.pause, onEnd: model.endWorkout,
                     liveVolumeKg: m.liveVolumeKg, liveSets: m.liveSets,
                     onReportPain: model.reportPain) {
        ActiveSetScreen(mirror: m, draft: draft, onSave: model.saveEdit,
                        onComplete: model.completeSet)
      }
    case let .interRest(m):
      ExecutionPager(metrics: model.liveMetrics, workoutName: m.workoutName,
                     lift: (i: m.liftIndex ?? 1, n: m.liftCount ?? 1),
                     onPause: model.pause, onEnd: model.endWorkout,
                     liveVolumeKg: m.liveVolumeKg, liveSets: m.liveSets,
                     onReportPain: model.reportPain) {
        InterRestScreen(mirror: m, onReady: model.ready, onAdd: model.addRest,
                        announced: model.announcedCorrectionAt == m.globalIndex)
      }
    case let .transitionRest(m):
      ExecutionPager(metrics: model.liveMetrics, workoutName: m.workoutName,
                     lift: (i: (m.liftIndex ?? 1) + 1, n: m.liftCount ?? 1),
                     onPause: model.pause, onEnd: model.endWorkout,
                     liveVolumeKg: m.liveVolumeKg, liveSets: m.liveSets,
                     onReportPain: model.reportPain) {
        TransitionRestScreen(mirror: m, onReady: model.ready, onAdd: model.addRest,
                             onSwap: { model.swapNext($0, replacing: m.nextExerciseName ?? "") },
                             undo: model.nextUndo,
                             onUndo: model.undoSwap)
      }
    case .paused:
      PausedScreen(onResume: model.resume, onEnd: model.endWorkout, onReportPain: model.reportPain)
    case let .cardio(_, paused):
      CardioPager(paused: paused, metrics: model.liveMetrics, split: model.kmSplit,
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
    // Founder, device review 2026-08-01: *"on the first workout screen the START is cut off."* The
    // serif ran to four lines on a 45 mm case and pushed the button through the floor. `WristScreen`
    // measures the button first; the headline scales into what is left rather than the reverse.
    WristScreen {
      VStack(alignment: .leading, spacing: 0) {
        TopStrip(text: WatchCopy.firstWorkout)
        Spacer(minLength: 2)
        VStack(alignment: .leading, spacing: 8) {
          Text(WatchCopy.findYourWeights)
            .font(.system(size: Fit.s(25), design: .serif)).foregroundStyle(Palette.ink0)
            .lineSpacing(1).lineLimit(4).minimumScaleFactor(0.6)
          Text(WatchCopy.liftTillHonest)
            .font(.system(size: 12)).foregroundStyle(Palette.ink2)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Spacer(minLength: 2)
      }
    } actions: {
      BeginButton(title: WatchCopy.start, action: onBegin)
    }
  }

  private var lobbyFace: some View {
    /*
     * WT1 · TODAY.
     *
     * Founder, device review 2026-08-01: *"you could lift UP NEXT so it sits level with the clock,
     * and then lift Upper A too, and make the lift count and the estimated time bigger."*
     *
     * Exactly that. The legend was a line of its own below an empty header row — two rows spent
     * saying one short word. It moves ONTO the header, beside the clock, which gives the name and
     * the meta line back the vertical space they were sharing. The meta line goes 10 pt → 13 and
     * stops being the smallest thing on the screen she is about to act on.
     */
    WristScreen {
      VStack(alignment: .leading, spacing: 0) {
        TopStrip(text: WatchCopy.upNext.uppercased())
        Spacer(minLength: 2)
        VStack(alignment: .leading, spacing: 7) {
          Text(resting ? "Recovery" : lobby.workoutName)
            .font(.system(size: Fit.s(30), design: .serif)).foregroundStyle(Palette.ink0)
            .lineLimit(2).minimumScaleFactor(0.6)
          if gated {
            Text(WatchCopy.membershipNeeded).font(.system(size: 13)).foregroundStyle(Palette.ink2).lineLimit(3)
          } else if resting {
            Text(WatchCopy.recovery).font(.system(size: 13)).foregroundStyle(Palette.ink2).lineLimit(3)
          } else {
            Text(metaLine)
              .font(.system(size: 13, weight: .medium, design: .monospaced)).tracking(0.6)
              .foregroundStyle(Palette.ink1).lineLimit(1).minimumScaleFactor(0.7)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Spacer(minLength: 2)
      }
    } actions: {
      // Begin (cream primary) over a split row — "Another" (the choose-workout list, WT1b) and
      // "Cardio". Open training is never gated.
      VStack(spacing: 5) {
        if !resting && !gated {
          BeginButton(action: onBegin)
        }
        HStack(spacing: 5) {
          OutlineButton(title: WatchCopy.another, systemImage: "arrow.left.arrow.right", tint: Palette.ink1, border: Palette.ink0.opacity(0.22), height: 36, fontSize: 12) { showList = true }
          OutlineButton(title: WatchCopy.cardio, systemImage: "waveform.path.ecg", tint: Palette.signal, border: Palette.signal.opacity(0.4), height: 36, fontSize: 12) { showCardio = true }
        }
      }
    }
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
    Button(action: { TapGate.pass(action) }) {
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
    Button(action: { TapGate.pass(action) }) {
      HStack(spacing: 5) {
        if let systemImage { Image(systemName: systemImage).font(.system(size: 12)) }
        Text(title).font(.system(size: fontSize, weight: .semibold))
          .lineLimit(1).minimumScaleFactor(0.7)
      }
      .frame(maxWidth: .infinity).frame(height: Fit.s(height))
      .foregroundStyle(tint)
      .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(border, lineWidth: 1))
    }
    .buttonStyle(.plain)
  }
}

/*
 * ════ CR1 · READY — ONE CARDIO ════
 *
 * Founder, device review 2026-08-01: *"in cardio mode, why was there a Run option and a Walk
 * option? It was just general cardio at the start — check this."*
 *
 * He is right and the canonical agrees with him: CR1 in `HUSH_V7_ALL_DARK.html` is a serif
 * "Cardio", one line of reassurance, and a single "Start cardio". The two-gait picker predates it.
 *
 * The gait did not vanish — it is what the OS workout session is CONFIGURED as, and the wrist still
 * sends one home on the record. It is now decided rather than asked, because the athlete does not
 * owe us a declaration before she moves: the wrist records distance, heart and burn either way, and
 * the phone never coaches any of it (`cardio.recordedNotCoached`). Asking bought us one field on a
 * record nothing reads and cost her a decision at the top of a workout.
 *
 * ⚠️ ONE CONSEQUENCE, STATED PLAINLY: a walk now registers with HealthKit as an outdoor RUN, so
 * Apple's own energy estimate for a walk will read high. The honest alternative is
 * `HKWorkoutActivityType.other`, which drops distance — and distance is the figure CR2, CR3 and CR4
 * are all built around. Distance is worth more to this product than a gait label.
 */
private struct CardioPicker: View {
  let onCardio: (String) -> Void
  var body: some View {
    WristScreen {
      VStack(spacing: 0) {
        TopStrip()
        Spacer(minLength: 4)
        VStack(spacing: 9) {
          TallyMark()
          Text(WatchCopy.cardio)
            .font(.system(size: Fit.s(26), design: .serif)).foregroundStyle(Palette.ink0)
          Text(WatchCopy.recordedNotCoached)
            .font(.system(size: 12, design: .serif)).italic().foregroundStyle(Palette.ink2)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        Spacer(minLength: 4)
      }
    } actions: {
      BeginButton(title: WatchCopy.startCardio) { onCardio("run") }
    }
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
        Button { TapGate.pass { onSelect(w.id) } } label: {
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
  /*
   * ════ THE LIVE-SET SWAP WAS WIRED, AND DEAD ════
   *
   * This screen used to take `onSwap`, `undo` and `onUndo`. The root wired all three to real model
   * methods — `swapCurrent`, `currentUndo`, `undoSwap` — and the body read none of them. WT11b
   * could not be opened from a live set at all, and from the call site it looked fully connected.
   *
   * Removing them rather than building the affordance follows a ruling already made: the founder
   * held the canonical mock authoritative for WT2, and WT2 carries no swap glyph. The wrist swaps
   * BETWEEN lifts (WT11 → WT11b), which is also the only moment a swap is coherent — changing the
   * exercise after you have already logged sets on it is not a swap, it is two exercises.
   *
   * ⚠️ The phone still offers a swap on a live set, so the two surfaces differ here on purpose. If
   * that should change, this is where it comes back — and `mirror.swapOptions` is already on the
   * wire for the active set, so nothing else has to move.
   */

  @State private var editing = false
  @State private var field: EditField = .weight
  @State private var w: Double = 0
  @State private var r: Double = 0
  @State private var crown: Double = 0

  private var bodyweight: Bool { mirror.targetWeight == nil }
  private var shownWeight: Double? { draft?.weight ?? mirror.targetWeight }
  private var shownReps: Int { draft?.reps ?? mirror.targetReps }

  var body: some View {
    /*
     * ════ THE SET, RE-LAID ════
     *
     * Founder, device review 2026-08-01: *"the exercise name and the lift number are ON the kilos,
     * the 12 kg a side is written very small, and you cannot see the rep range at all because the
     * numbers are UNDERNEATH Complete set."*
     *
     * All three came from one thing: the screen stacked five blocks with `Spacer(minLength: 2)`
     * between them and hoped. On a 45 mm case the hero load, the per-side line, the edit hint and
     * the ruler add up to more than the space above the button — so the ruler went under it, and
     * the header (drawn first, therefore given room first) ended up overlapping the load that
     * followed. `WristScreen` gives the button its height first and the block below scales into
     * what is left, which is the difference between a layout and a hope.
     *
     * What changed beyond the container:
     *   · the LIFT NAME moves onto the header row, where the canonical WT2 puts the muscle. She is
     *     standing at the station; the name is orientation, not the fact of the screen.
     *   · the per-side figure goes from 9.5 pt to 13. It is the number she acts on when she loads
     *     the bar, and it was the smallest thing on the screen.
     *   · the rep ruler sits DIRECTLY under the load, above the edit hint. It is prescription; the
     *     hint is an affordance, and an affordance never outranks a prescription.
     */
    WristScreen {
      VStack(spacing: 0) {
        if editing {
          Legend(WatchCopy.editSet, size: Wrist.legend).frame(maxWidth: .infinity).padding(.top, 2)
        } else {
          header
        }
        Spacer(minLength: 2)
        if editing { editor } else { readout }
        Spacer(minLength: 2)
      }
    } actions: {
      footer
    }
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

  /// The header row: the lift she is on, and where she is in it.
  ///
  /// The canonical WT2 puts the MUSCLE here ("CHEST · 2/4") and the set dots at top-right — but
  /// top-right is the clock's, and the muscle is the one thing on that screen she cannot get wrong
  /// by looking up. The name is what tells her she is at the right station, so the name gets the
  /// row and the set position rides with it. The dots stay, folded to the left of the clock lane.
  private var header: some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(spacing: 7) {
        Text(setPosition)
          .font(.system(size: Wrist.legend, weight: .medium, design: .monospaced)).tracking(1.1)
          .foregroundStyle(Palette.ink2)
        setDots
        Spacer(minLength: 2)
      }
      .padding(.trailing, 52) // the clock's lane
      Text(mirror.exerciseName)
        .font(.system(size: Wrist.body, weight: .semibold)).foregroundStyle(Palette.ink0)
        .lineLimit(1).minimumScaleFactor(0.7)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(height: Fit.s(38), alignment: .top)
  }

  /// "CHEST · 2/4" without the muscle — the muscle now rides the name below it.
  private var setPosition: String {
    let group = (mirror.exerciseGroup ?? "").uppercased()
    let n = mirror.setNumber ?? 1
    let m = mirror.setsInExercise ?? 1
    return group.isEmpty ? "SET \(n)/\(m)" : "\(group) · \(n)/\(m)"
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

  /// The load, the band it must land in, how to load it, and the way to correct it — in that order,
  /// because that is the order she needs them in.
  ///
  /// BODYWEIGHT is the one exercise where the load is NOT the hero (founder 2026-07-11): an athlete
  /// on a pull-up knows they are lifting themselves. The rep count takes the mark instead.
  /**
   * The load, what changed about it, what counts as done, and how the lift is going — in that
   * order, because that is the order she needs them in.
   *
   * ⛔ REBUILT 2026-08-04. What stood here was the load, a 124-point rep RULER, a per-side line and
   * an 8.5-point pill: four blocks under the hero on the smallest screen in the product, three of
   * them below the founder's type floor. The ruler was a chart doing a number's job — deleted from
   * the phone the day before for exactly that — and the SET DOTS said how many sets were behind her
   * while never saying what happened in them.
   *
   * BODYWEIGHT is the one lift where the load is not the hero (founder 2026-07-11): an athlete on a
   * pull-up knows what they are lifting, so the rep count takes the mark.
   */
  private var readout: some View {
    VStack(spacing: 4) {
      if let wt = shownWeight {
        Button { TapGate.pass { enterEdit(.weight) } } label: {
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(fmtW(wt)).font(.system(size: Fit.s(46), weight: .medium, design: .monospaced)).monospacedDigit().foregroundStyle(Palette.lift)
            Text(WatchCopy.kg).font(.system(size: Fit.s(15), design: .monospaced)).foregroundStyle(Palette.ink2)
            newsMark
          }
          .lineLimit(1).minimumScaleFactor(0.5)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        bandLine
        setFigures
        if showsPerSide { perSideLine }
        if firstSetOfSession { tapToEditPill }
      } else {
        Button { TapGate.pass { enterEdit(.reps) } } label: {
          HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text("\(shownReps)").font(.system(size: Fit.s(46), weight: .medium, design: .monospaced)).monospacedDigit().foregroundStyle(Palette.lift)
            Text(WatchCopy.reps).font(.system(size: Fit.s(15), design: .monospaced)).foregroundStyle(Palette.ink2)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Legend(WatchCopy.bodyweightQuiet, size: Wrist.legend)
        setFigures
        if firstSetOfSession { tapToEditPill }
      }
    }
    .frame(maxWidth: .infinity)
  }

  /**
   * ⛔ WHAT CHANGED ABOUT THIS BAR — the phone's `domain/loadNews`, in Swift.
   *
   * A row of last time's reps means nothing without the load they were lifted at: 8 at 32.5 kg is
   * not worse than 7 at 34. `↑1.5` IS that fact, where "32.5 last time" is a sum she has to do.
   *
   * ⚠️ MID-LIFT IT COMPARES TO THE SET BEFORE, and only on the first set to last time — a Loop 1
   * correction is the change she has to act on while standing at a bar that needs re-loading, and
   * context never outranks an instruction. She is never shown both.
   *
   * ⚠️ AND IT IS NIL ON MOST SETS. Rounded before comparing, because plate maths and unit conversion
   * leave two identical weights differing in the fifteenth decimal — and a "↑0" on the largest
   * figure on the screen is a claim about her training at the size of a fist.
   */
  private var newsKg: Double? {
    guard let cur = mirror.targetWeight else { return nil }
    let against: Double?
    if let prev = (mirror.loadsSoFar ?? []).last, let p = prev {
      against = p
    } else {
      against = mirror.lastLoadKg
    }
    guard let a = against else { return nil }
    let d = ((cur * 100).rounded() - (a * 100).rounded()) / 100
    return d == 0 ? nil : d
  }

  @ViewBuilder private var newsMark: some View {
    if let d = newsKg {
      Text((d > 0 ? "↑" : "↓") + fmtW(abs(d)))
        .font(.system(size: Fit.s(15), weight: .semibold, design: .monospaced)).monospacedDigit()
        .foregroundStyle(d > 0 ? Palette.up : Palette.down)
        .padding(.leading, 2)
    }
  }

  /**
   * ⛔ THE BAND, AND IT IS NOT THE ACCENT (founder 2026-08-04): *"why are we putting the reps in
   * green as a hero? It is only the range that follows from the weight."*
   *
   * The palette's law is that moss means A DECISION MADE — and the LOAD is the bigger decision by
   * far, yet it wore cream while the band that follows from it wore the accent. `× 6–8` in quiet
   * ink reads as part of the load's own sentence, which is how every programme in the world writes
   * it. Colour on this stage now means something HAPPENED.
   */
  @ViewBuilder private var bandLine: some View {
    let lo = mirror.targetReps
    let hi = mirror.targetRepsHi ?? lo
    Text(hi > lo ? "× \(lo)–\(hi)" : "× \(lo)")
      .font(.system(size: Fit.s(18), weight: .medium, design: .monospaced)).monospacedDigit()
      .foregroundStyle(Palette.ink1)
  }

  /**
   * ⛔ HER SETS, AS FIGURES — and a slot speaks only when it has something to say.
   *
   * The dots said how many sets were behind her. This says that AND what happened in them, at four
   * times the size: a slot holds LAST TIME'S number, dimmed, until she replaces it with her own.
   *
   * ⚠️ THE SETS AHEAD ARE A DOT. She needs the ghost of the set she is about to do; the ones further
   * along are last week's shape and she will meet them when she gets there — the same rule as the
   * per-side line, which is the founder's own: state it when it is news.
   *
   * ⚠️ A slot with no history at all draws a DASH, never a zero — a zero is a set she did and failed.
   */
  private var setFigures: some View {
    let m = max(mirror.setsInExercise ?? 1, 1)
    let cur = mirror.setNumber ?? 1
    let done = mirror.setsSoFar ?? []
    let ghosts = mirror.lastReps ?? []
    let lo = mirror.targetReps
    let hi = mirror.targetRepsHi ?? lo
    return HStack(spacing: 0) {
      ForEach(0..<m, id: \.self) { i in
        VStack(spacing: 3) {
          if i < done.count {
            let r = done[i]
            Text("\(r)")
              .font(.system(size: Fit.s(23), weight: .medium, design: .monospaced)).monospacedDigit()
              .foregroundStyle(r > hi ? Palette.up : (r < lo ? Palette.down : Palette.ink0))
          } else if i == cur - 1 {
            Text(i < ghosts.count ? "\(ghosts[i])" : "–")
              .font(.system(size: Fit.s(23), design: .monospaced)).monospacedDigit()
              .foregroundStyle(Palette.ink1).opacity(0.45)
          } else {
            Circle().fill(Palette.ink0.opacity(0.28)).frame(width: 5, height: 5)
              .frame(height: Fit.s(23))
          }
          // Where she is. A rule, not a colour: the figures already spend colour on the verdict.
          Capsule()
            .fill(i == cur - 1 ? Palette.ink0.opacity(0.55) : Color.clear)
            .frame(width: 18, height: 2)
        }
        .frame(maxWidth: .infinity)
      }
    }
  }

  /// The first set of the SESSION — the teaching moment for the edit door, and only that.
  private var firstSetOfSession: Bool { mirror.globalIndex == 0 }

  /**
   * ⛔ THE PER-SIDE FIGURE IS NOT NEWS ON EVERY SET. It stays — the founder's ruling is that the
   * athlete never calculates — but she loads the bar ONCE, and after that it is a fact she acted on
   * five minutes ago occupying a row on the smallest screen in the product.
   *
   * ⚠️ It returns the instant the load moves, because that is when the bar must be re-loaded.
   */
  private var showsPerSide: Bool { (mirror.setNumber ?? 1) <= 1 || newsKg != nil }

  /// "12 kg a side" — the figure she acts on at the rack, at 13 pt instead of 9.5.
  ///
  /// It was the smallest type on the screen and it is the only line that asks her to DO something
  /// physical. The founder counted it as one of the three things wrong with this screen.
  @ViewBuilder private var perSideLine: some View {
    if let ps = mirror.loadSetup?.perSide, ps > 0,
       mirror.loadSetup?.style == "barbell" || mirror.loadSetup?.style == "plate_loaded" {
      (Text("\(fmtW(ps)) \(WatchCopy.kg)").font(.system(size: 13, weight: .semibold, design: .monospaced)).foregroundStyle(Palette.ink0)
        + Text(" " + WatchCopy.aSide).font(.system(size: 12)).foregroundStyle(Palette.ink1))
        .lineLimit(1).minimumScaleFactor(0.8)
    }
  }

  /// The dashed edit hint — a hint, not a button; the tap target is the hero load above it.
  private var tapToEditPill: some View {
    HStack(spacing: 5) {
      Image(systemName: "pencil").font(.system(size: 9)).foregroundStyle(Palette.ink2)
      Text(WatchCopy.tapWeightToEdit.uppercased())
        .font(.system(size: Wrist.legend, weight: .medium, design: .monospaced)).tracking(0.9)
        .foregroundStyle(Palette.ink2)
    }
    .padding(.vertical, 3).padding(.horizontal, 9)
    .overlay(
      Capsule().strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3]))
        .foregroundStyle(Palette.ink0.opacity(0.22))
    )
  }

  /*
   * ⛔ THE REP RULER IS DELETED (founder 2026-08-04, having deleted it from the phone the day
   * before). 124 points of rule, two end caps, two 17-point figures and a 10-point word — to say
   * "6 to 8". It was a chart doing a number's job on a 6-inch screen; here it was a chart doing a
   * number's job on the smallest screen in the product, and it cost a whole block above a button
   * that had already been squeezed once. `bandLine` says the same thing in one quiet line.
   */

  /*
   * ════ WT9 · EDIT SET — TWO HALVES, NOT A BOULDER AND A PEBBLE ════
   *
   * Founder, device review 2026-08-01: *"one square is huge and the other is tiny — impossible to
   * press. I suggest half and half, stacked, with kg and reps written above each, and tapping
   * either one activates it for editing."*
   *
   * He is right, and the old shape was worse than he says: the inactive value was rendered at 13 pt
   * inside a pill barely taller than the text, so the target for switching fields was around 20 pt
   * high — under the 44 pt minimum, on a screen used mid-set with wet hands.
   *
   * Two equal rows now. Each carries its own unit as a legend, so neither depends on being the
   * active one to be legible, and the active row is marked by a MOSS BORDER rather than by being
   * four times the size. Same information, half the shouting, both targets full width.
   */
  private var editor: some View {
    /*
     * ⛔ REBUILT 2026-08-04 (founder): *"the edit-set screen needs a complete redo — too much green.
     * And what is written ASKED, does that apply to the weight too? Right now it looks marked on the
     * weight while it says a rep range."*
     *
     * He caught two things and they were both mine.
     *
     * THE BAND WAS FLOATING ABOVE THE ROWS, and the KG row is the one wearing the active border —
     * so "6–8" read as a range for the WEIGHT. **A weight has no band.** It rides inside the reps
     * row's own legend now, where the number it describes is, and it cannot be read as anything else.
     *
     * AND THE MOSS: the palette's law is that moss means A DECISION MADE, and it is the app's
     * decision. **This screen is hers** — she is overruling the prescription. So the active row is
     * marked in cream, the crown hint is muted, and the only moss left is on Done, where the app
     * finally does something.
     */
    VStack(spacing: 7) {
      if !bodyweight {
        editRow(unit: WatchCopy.kg, band: nil, value: fmtW(w), active: field == .weight) { field = .weight }
      }
      editRow(unit: WatchCopy.reps, band: bandLabel, value: "\(Int(r))", active: bodyweight || field == .reps) { field = .reps }
      crownHint
    }
    .frame(maxWidth: .infinity)
  }

  /// "6–8" — what was ASKED, carried inside the reps row so it can only describe the reps.
  private var bandLabel: String? {
    let lo = mirror.targetReps
    let hi = mirror.targetRepsHi ?? lo
    return hi > lo ? "\(lo)–\(hi)" : nil
  }

  /// One half of the editor: a legend, a figure, and a border that says whether the crown is on it.
  private func editRow(unit: String, band: String?, value: String, active: Bool, tap: @escaping () -> Void) -> some View {
    Button(action: { TapGate.pass(tap) }) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(unit.uppercased())
          .font(.system(size: Wrist.legend, weight: .medium, design: .monospaced)).tracking(1.1)
          .foregroundStyle(active ? Palette.ink0 : Palette.ink2)
        if let band {
          // The ask, inside the row it is about. Moss here is earned: it is the coach's decision.
          Text(band)
            .font(.system(size: Fit.s(13), weight: .semibold, design: .monospaced)).monospacedDigit()
            .foregroundStyle(Palette.signal)
        }
        Spacer(minLength: 4)
        Text(value)
          .font(.system(size: Fit.s(30), weight: .medium, design: .monospaced)).monospacedDigit()
          .foregroundStyle(active ? Palette.ink0 : Palette.ink1)
          .lineLimit(1).minimumScaleFactor(0.6)
      }
      .padding(.horizontal, 12)
      .frame(maxWidth: .infinity).frame(height: Fit.s(44))
      .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(active ? Palette.ink0.opacity(0.07) : .clear))
      .overlay(
        RoundedRectangle(cornerRadius: 13, style: .continuous)
          .strokeBorder(active ? Palette.ink0.opacity(0.85) : Palette.ink0.opacity(0.16), lineWidth: active ? 1.7 : 1)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  /**
   * The crown instruction. ⚠️ MUTED, NOT MOSS, and at the type floor rather than 9.5 — it teaches
   * the one non-obvious gesture on this screen, and a hint is never a decision.
   */
  private var crownHint: some View {
    HStack(spacing: 5) {
      Image(systemName: "arrow.clockwise").font(.system(size: 11, weight: .semibold))
      Text(WatchCopy.turnCrownToSet).font(.system(size: Wrist.legend, weight: .medium, design: .monospaced)).tracking(1.1)
    }
    .foregroundStyle(Palette.ink2)
    .frame(maxWidth: .infinity, alignment: .center)
  }

  private var footer: some View {
    // Mock WT2: a single full-width "Complete set" (cream). In Edit (WT9) it becomes a moss "Done"
    // that commits the set — the gentle-confirm fill, distinct from the cream that advances the work.
    StageButton(title: editing ? WatchCopy.done : WatchCopy.completeSet, kind: editing ? .moss : .primary, height: Wrist.action, fontSize: 15, seated: true) {
      if editing { commit() } else { onComplete() }
    }
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

// MARK: 03 · WT3 · The correction
//
// The SET LOGGED beat that used to live here is gone (founder 2026-08-01: "a leftover from the
// earlier screens — what I asked for in its place was WT3"). It restated a load and a rep count
// she had chosen herself and executed thirty seconds earlier, and it cost a second and a half of
// every rest.

/// WT3 · THE CORRECTION — the full beat, at last.
///
/// Founder, device QA 2026-07-30: *"there is no CORRECTION screen on the watch."* He was right and
/// the omission was old: the phone published the correction, the wrist drew it as a two-line note
/// under a rest ring, and the moment the brief calls "the single most distinctive in the product"
/// arrived as a footnote to a timer.
///
/// The canonical screen is `_v7_handoff/HUSH_V7_ALL_DARK.html` WT3: an eyebrow, the old load struck
/// through beside the new one at twice its size, and a quiet serif line under both. It is followed
/// by the rest ring, which is why the closing words are "logged · resting" — the beat says what
/// happened and where she is, and asks for nothing.
///
/// ── WHERE THIS DEPARTS FROM THE MOCK, DELIBERATELY ──────────────────────────────────────────────
/// The mock draws the new load in moss (`#A9C49F`) on a screen whose eyebrow reads EASED FOR YOU.
/// It predates the founder's ruling of 2026-07-29 — **direction is a colour**: down is blue, hold
/// is cream, raise is moss, on every surface including the wrist. Five surfaces were drawing an ease
/// as a raise, and that ruling exists to end it. So the figure takes `Palette.down` on an ease and
/// `Palette.up` on a raise, and the mock's single-colour treatment is not copied.
struct CorrectionScreen: View {
  let c: WireCorrection
  let onTap: () -> Void
  var body: some View {
    let up = c.direction == "up"
    let tone = up ? Palette.up : Palette.down
    VStack(spacing: 12) {
      Spacer(minLength: 0)
      Legend(up ? WatchCopy.raisedForYou : WatchCopy.easedForYou, size: 9)
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        // What it WAS — struck, and dropped to the quietest ink the stage has. It is here only so
        // the new number has something to be different from.
        Text(fmtW(c.from))
          .font(.system(size: Fit.s(26), weight: .medium, design: .monospaced)).monospacedDigit()
          .strikethrough(true, color: Palette.ink3)
          .foregroundStyle(Palette.ink3)
        Text(fmtW(c.to))
          .font(.system(size: Fit.s(54), weight: .medium, design: .monospaced)).monospacedDigit()
          .foregroundStyle(tone)
          // The glow is the mock's, and it is the reason this reads as news rather than as a
          // number: on the dark stage the new load is the only lit thing on the screen.
          .shadow(color: tone.opacity(0.22), radius: 15)
        Text(WatchCopy.kg).font(.system(size: Fit.s(15), design: .monospaced)).foregroundStyle(Palette.ink2)
      }
      // ONE line, always: "34 31.5 kg" on a 40 mm case is already tight and a heavy lift
      // ("112.5 107.5 kg") is tighter. It scales before it wraps.
      .lineLimit(1).minimumScaleFactor(0.5)
      Text(WatchCopy.loggedResting)
        .font(.system(size: Fit.s(12), design: .serif)).foregroundStyle(Palette.ink2)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity)
    .padding(.horizontal, 12)
    .contentShape(Rectangle())
    // The same escape the confirmation has: a tap moves on rather than waiting out the beat.
    .onTapGesture { TapGate.pass(onTap) }
  }
}

/// WT10 · EXERCISE DONE — the lift she just closed, named once.
///
/// It used to be a line inside the transition rest, and the founder's *"the TRANSITION REST screen
/// is crowded with words"* was partly about it: a sentence in the past tense sitting above a card
/// about the future, on a screen whose job is a countdown.
///
/// The canonical gives it its own beat, and that is what it is now — the same window WT3 uses, the
/// one between a logged set and a rest. The two can never collide: Loop 1 makes the last set of an
/// exercise a no-op, so a correction on the beat that closes a lift is impossible by construction
/// (`sessionMirror.ts` states the same invariant).
///
/// Facts, not praise. "Bench, done." — the next lift's own card says what is coming.
struct LiftDoneScreen: View {
  let name: String
  let onTap: () -> Void
  var body: some View {
    WristScreen {
      VStack(spacing: 13) {
        Spacer(minLength: 0)
        ZStack {
          Circle().strokeBorder(Palette.signal, lineWidth: 1.6).frame(width: Fit.s(52), height: Fit.s(52))
          DrawCheck(size: Fit.s(22))
        }
        Text(WatchCopy.liftDone(name))
          .font(.system(size: Fit.s(20), design: .serif)).foregroundStyle(Palette.ink0)
          .multilineTextAlignment(.center)
          .lineLimit(2).minimumScaleFactor(0.6)
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity)
    }
    .contentShape(Rectangle())
    .onTapGesture { TapGate.pass(onTap) }
  }
}

// MARK: 04 · Inter-Set Rest

struct InterRestScreen: View {
  let mirror: WireMirror
  let onReady: () -> Void
  let onAdd: () -> Void
  /// WT3 already announced this correction, so the note under the ring stands down.
  ///
  /// Not an unconditional removal, because the correction rides the envelope AFTER the set and
  /// sometimes lands past the confirmation beat — WT3 never draws, and the note is then the only
  /// place the news exists. Each surface speaks exactly when the other did not.
  var announced: Bool = false
  private var ready: Bool { (mirror.restRemainingS ?? 0) <= 0 }
  private var note: WireCorrection? { announced ? nil : mirror.correction }

  var body: some View {
    /*
     * ════ THE REST, THINNED OUT ════
     *
     * Founder, device review 2026-08-01: *"the rest screen is very crowded with words, you can
     * barely understand what is happening there"* and *"the UP NEXT line is very small — through a
     * watch, mid-workout, it is impossible to see what it says at all."*
     *
     * The screen was carrying five things: the lift counter, the ring, the up-next card, the
     * correction note and two buttons. Three of them competed for the same eight points of slack,
     * so everything shrank together.
     *
     * What it carries now, in the order it matters: how long is left (the ring), what is coming and
     * at what load (one card, at a size that reads at arm's length), and the two ways out. The
     * correction note only appears when WT3 did not — it is news, and news is told once.
     */
    WristScreen {
      VStack(spacing: 0) {
        TopStrip(lift: (mirror.liftIndex ?? 1, mirror.liftCount ?? 1), controlsHint: true)
        Spacer(minLength: 2)
        RestRing(
          endsAt: mirror.restEndsAt,
          totalS: mirror.restTotalS ?? 90,
          diameter: Fit.s(note == nil ? 84 : 62),
          // …and it RUNS in the correction's direction. The note below already names the move; the
          // ring is what the wrist actually looks at, so the two must not disagree.
          arc: mirror.correction.map { $0.direction == "down" ? Palette.down : Palette.up } ?? Palette.signal
        )
        // WT5 · REST — LEARNED. Her measured rest (S-17) is already what this timer runs; this is
        // the line that SAYS so, and it appears only once the median is hers rather than the
        // bootstrap. It went missing in the 2026-08-01 relayout and is restored: without it the
        // wrist silently uses her pace and never tells her, which is the app doing something FOR
        // her without her knowing.
        if mirror.restIsLearned == true {
          Text(WatchCopy.yourPace)
            .font(.system(size: 11, design: .serif)).italic()
            .foregroundStyle(Palette.ink2)
            .padding(.top, 3)
        }
        Spacer(minLength: 4)
        upNextCard
        if let c = note {
          CorrectionNote(c: c).padding(.top, 5)
        }
        Spacer(minLength: 4)
      }
    } actions: {
      RestActions(ready: ready, primaryTitle: ready ? WatchCopy.startNextSet : WatchCopy.skipRest, onReady: onReady, onAdd: onAdd)
    }
  }

  /*
   * ════ THE CARD SHOWED THE WRONG WEIGHT, AND IT WAS THE PHONE'S DOCUMENTED TRAP ════
   *
   * Founder, device review 2026-08-01: *"it says the next set is 44 kg and one line below it says
   * 50 kg — there is probably a bug behind the scenes."*
   *
   * There was. `sessionMirror.ts` says it in as many words: on a rest frame the phone's machine
   * HOLDS the finished set's index, so `targetWeight` is the load of the set she has just done,
   * and `nextTargetWeight` is the one that is coming. This card read `targetWeight`.
   *
   * On an ordinary rest the two agree and nothing looked wrong for months. They diverge in exactly
   * one case — when Loop 1 has just moved the load — and that is the case where the card sits
   * directly above a correction announcing the new number. So the screen contradicted itself, on
   * the one beat the product exists to get right.
   *
   * The file's own comment warned about this for `setLabel` and the card obeyed it there. The load
   * was left reading the old field beside it.
   */
  private var nextLoad: Double? { mirror.nextTargetWeight ?? mirror.targetWeight }

  /// UP NEXT: the set that is coming, its lift, and its load — at a size that reads at a glance.
  private var upNextCard: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text("\(WatchCopy.upNext.uppercased()) · \(WatchCopy.setWord) \(mirror.nextSetNumber ?? ((mirror.setNumber ?? 1) + 1))/\(mirror.setsInExercise ?? 1)")
        .font(.system(size: Wrist.legend, weight: .medium, design: .monospaced)).tracking(0.9)
        .foregroundStyle(Palette.ink1)
        .lineLimit(1).minimumScaleFactor(0.8)
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(mirror.exerciseName)
          .font(.system(size: Wrist.body, weight: .semibold)).foregroundStyle(Palette.ink0)
          .lineLimit(1).minimumScaleFactor(0.7)
        Spacer(minLength: 4)
        if let wt = nextLoad {
          (Text(fmtW(wt)).font(.system(size: Fit.s(24), weight: .medium, design: .monospaced))
            + Text(" " + WatchCopy.kg).font(.system(size: 11, design: .monospaced)))
            .foregroundStyle(Palette.signal)
            .lineLimit(1)
        } else {
          Text(WatchCopy.bodyweight).font(.system(size: Fit.s(18), weight: .medium, design: .monospaced)).foregroundStyle(Palette.signal)
        }
      }
    }
    .padding(.vertical, 9).padding(.horizontal, 11)
    .frame(maxWidth: .infinity)
    .background(RoundedRectangle(cornerRadius: 14).fill(Palette.ink0.opacity(0.07)))
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
    /*
     * ════ BETWEEN TWO LIFTS, AND ONLY THAT ════
     *
     * Founder, device review 2026-08-01: *"the TRANSITION REST screen is crowded with words too,
     * and you can barely tell what is going on."*
     *
     * It was carrying SIX lines: the lift counter, the ring, "Barbell Bench Press, done.", the next
     * lift's name, its load, its per-side figure — and then two buttons which the screenshot shows
     * running off the bottom edge. Two of those lines belong to other beats: the "done" sentence is
     * WT10's whole reason to exist, and it had already played thirty seconds earlier.
     *
     * The canonical WT11 carries three things — LIFT 1 → 2, the ring, and one card naming the new
     * lift with its load — then Start, then +15 sec beside Swap. That is what this is now.
     */
    WristScreen {
      VStack(spacing: 0) {
        TopStrip(text: crossing, controlsHint: true)
        Spacer(minLength: 2)
        RestRing(
          endsAt: mirror.restEndsAt,
          totalS: mirror.restTotalS ?? 120,
          diameter: Fit.s(84),
          arc: Palette.signal
        )
        Spacer(minLength: 4)
        nextLiftCard
        if undo != nil {
          SwapUndoChip(action: onUndo).padding(.top, 5)
        }
        Spacer(minLength: 4)
      }
    } actions: {
      VStack(spacing: 5) {
        StageButton(title: ready ? WatchCopy.startNextLift : WatchCopy.skipRest,
                    kind: ready ? .primary : .onstage, height: Wrist.action, fontSize: 15, action: onReady)
        HStack(spacing: 5) {
          OutlineButton(title: WatchCopy.addShort, tint: Palette.ink0,
                        border: Palette.ink0.opacity(0.22), height: 34, fontSize: 12, action: onAdd)
          if let best = swaps.first {
            OutlineButton(title: WatchCopy.swapTitle, systemImage: "arrow.left.arrow.right",
                          tint: Palette.ink1, border: Palette.ink0.opacity(0.22), height: 34, fontSize: 12) {
              onSwap(best.id)
            }
          }
        }
      }
    }
  }

  /// "LIFT 1 → 2" — the canonical header, and the only place a transition says what it is.
  private var crossing: String {
    let i = mirror.liftIndex ?? 1
    let n = mirror.liftCount ?? 1
    return "\(WatchCopy.liftWord) \(i) → \(min(i + 1, n))"
  }

  /// The lift that is coming, named once, with the load the phone decided for it.
  private var nextLiftCard: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text("\(WatchCopy.upNext.uppercased()) · \(WatchCopy.liftWord)")
        .font(.system(size: Wrist.legend, weight: .medium, design: .monospaced)).tracking(0.9)
        .foregroundStyle(Palette.ink1)
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(mirror.nextExerciseName ?? "")
          .font(.system(size: Wrist.body, weight: .semibold)).foregroundStyle(Palette.ink0)
          .lineLimit(1).minimumScaleFactor(0.7)
        Spacer(minLength: 4)
        if let wt = mirror.nextTargetWeight {
          (Text(fmtW(wt)).font(.system(size: Fit.s(24), weight: .medium, design: .monospaced))
            + Text(" " + WatchCopy.kg).font(.system(size: 11, design: .monospaced)))
            .foregroundStyle(Palette.signal)
            .lineLimit(1)
        } else {
          Text(WatchCopy.bodyweight).font(.system(size: Fit.s(18), weight: .medium, design: .monospaced)).foregroundStyle(Palette.signal)
        }
      }
      // The direction the new lift's opening load moved, if it moved. Restored after the
      // 2026-08-01 relayout dropped it: a load that changed and says nothing about it is the one
      // thing the founder's colour ruling exists to prevent.
      if (mirror.nextLoadDeltaKg ?? 0) != 0 {
        LoadDelta(deltaKg: mirror.nextLoadDeltaKg ?? 0, fontSize: 9)
      }
    }
    .padding(.vertical, 9).padding(.horizontal, 11)
    .frame(maxWidth: .infinity)
    .background(RoundedRectangle(cornerRadius: 14).fill(Palette.ink0.opacity(0.07)))
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
  // The GAIT is gone from this view, not from the product: it still configures the OS workout
  // session and still travels home on the record. It is simply no longer something a screen says,
  // because CR1 asks for cardio rather than for a declaration (founder 2026-08-01).
  let paused: Bool
  @ObservedObject var metrics: LiveMetrics
  /// CR3 — the split just closed, if one has. Non-nil takes the stage for its own beat.
  var split: KmSplit? = nil
  /// Pause-aware elapsed seconds — the watch's own clock (HealthKit only supplies HR/kcal/km).
  let elapsed: () -> TimeInterval
  let onPauseToggle: () -> Void
  let onEnd: () -> Void
  @State private var page = 1

  var body: some View {
    if let sp = split {
      KmLoggedScreen(split: sp)
    } else {
      // Two pages, the gym's gesture: stop on one side, the run in the middle. There is no glance
      // page — every figure a glance would carry is already on the stage.
      TabView(selection: $page) {
        CardioPausedScreen(paused: paused, onPage: page == 0,
                           onPauseToggle: onPauseToggle, onEnd: onEnd).tag(0)
        CardioStageScreen(metrics: metrics, elapsed: elapsed)
          .environment(\.goControls, { withAnimation { page = 0 } })
          .tag(1)
      }
      .tabViewStyle(.page(indexDisplayMode: .never))
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
    // Founder, device review 2026-08-01: *"I did not see the CR3 screen on the watch — make sure it
    // exists and works."* It does, and it always has; it lasts about three seconds and only after a
    // whole kilometre, so a short test run never reaches it. What it did not have was room: the
    // legends were 8.5 pt. They are 11 now, and the split itself takes the case.
    WristScreen {
      VStack(spacing: 0) {
        TopStrip()
        Spacer(minLength: 4)
        VStack(spacing: 8) {
          Legend(WatchCopy.kilometreSplit(split.km), size: Wrist.legend)
          HStack(alignment: .lastTextBaseline, spacing: 3) {
            Text(fmtTime(split.splitS))
              .font(.system(size: Fit.s(38), weight: .semibold, design: .monospaced)).monospacedDigit()
              .foregroundStyle(Palette.signal)
              .lineLimit(1).minimumScaleFactor(0.6)
            Text(WatchCopy.perKm)
              .font(.system(size: 13, design: .monospaced)).foregroundStyle(Palette.ink2)
          }
          if split.quickest {
            HStack(spacing: 4) {
              Image(systemName: "checkmark").font(.system(size: 9, weight: .bold))
              Text(WatchCopy.quickestThisRun)
                .font(.system(size: 10, design: .monospaced)).tracking(0.5)
            }
            .foregroundStyle(Palette.signal)
          }
        }
        .frame(maxWidth: .infinity)
        Spacer(minLength: 4)
        Text(WatchCopy.loggedBackToRun)
          .font(.system(size: 10, design: .monospaced)).tracking(0.5)
          .foregroundStyle(Palette.ink2)
          .frame(maxWidth: .infinity)
      }
    }
  }
}

/*
 * ════ CR2 · LIVE ════
 *
 * Founder, device review 2026-08-01: *"the cardio screen is nothing like the screen it should be in
 * the HTML — the one with the progress line. It's probably a screen from the old product. It should
 * be like CR2, only without the green row at the bottom of that image, and give calories, heart and
 * kilometres a big, clear size. And swiping to the side opens a PAUSE screen like the gym mode."*
 *
 * Every part of that is now what this is. The canonical CR2: the elapsed clock as the hero, a
 * progress line to the NEXT whole kilometre with the metres under it, and three metrics at a size
 * that reads at a stride. The green "KM 3 LOGGED" pill at the foot of the mock is deliberately not
 * built — CR3 is that beat, on its own screen, and printing it twice would make the second one
 * furniture.
 *
 * And the controls left the stage. They were here because cardio used to be one screen; the founder
 * has now asked for the gym's own gesture, which is also the reason the gym has it: the only
 * control a runner needs in a hurry should not be something to read past when they don't.
 */
private struct CardioStageScreen: View {
  @ObservedObject var metrics: LiveMetrics
  let elapsed: () -> TimeInterval

  var body: some View {
    WristScreen {
      VStack(spacing: 0) {
        TopStrip(text: WatchCopy.cardio.uppercased(), controlsHint: true)
        Spacer(minLength: 2)
        TimelineView(.periodic(from: .now, by: 1)) { _ in
          VStack(spacing: 9) {
            Text(fmtTime(elapsed()))
              .font(.system(size: Fit.s(40), weight: .medium, design: .monospaced)).monospacedDigit()
              .foregroundStyle(Palette.ink0)
              .lineLimit(1).minimumScaleFactor(0.5)
            kmProgress
            /*
             * ⛔ PACE JOINS THE ROW AND DISTANCE LEAVES IT (founder 2026-08-04): *"put the pace per
             * kilometre in with the heart rate and the calories, and then make the 4.62 km under the
             * bar bigger — running, she will certainly not see it."*
             *
             * The row read km · heart · burn, and the number every runner reads first was not on the
             * wrist at all — which is where a runner actually looks, because the phone is in a
             * pocket. Distance moves under the bar that is already drawing it, as a FIGURE.
             */
            HStack(spacing: 4) {
              Metric(value: paceLabel, label: WatchCopy.perKm)
              Metric(value: metrics.heartRateBpm.map { "\($0)" } ?? "––", label: WatchCopy.metricHeart)
              Metric(value: metrics.activeKcal.map { "\($0)" } ?? "––", label: WatchCopy.metricKcal)
            }
          }
        }
        Spacer(minLength: 2)
      }
    }
  }

  /// The line to the next whole kilometre, and the metres standing on it.
  ///
  /// The canonical draws "0 … 1,000 M" with a knob and the current metres beneath. It is the one
  /// piece of a run a clock cannot tell her: how close the next split is. With no GPS fix yet the
  /// track draws empty rather than inventing a position.
  private var kmProgress: some View {
    let km = metrics.distanceKm ?? 0
    let intoKm = km - km.rounded(.down)
    return VStack(spacing: 3) {
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(Palette.ink0.opacity(0.16)).frame(height: 2)
          Capsule().fill(Palette.signal).frame(width: max(0, geo.size.width * intoKm), height: 3)
          Circle().fill(Palette.signal)
            .frame(width: 8, height: 8)
            .offset(x: max(0, min(geo.size.width - 8, geo.size.width * intoKm - 4)))
        }
        .frame(height: 8)
      }
      .frame(height: 8)
      /*
       * ⚠️ TOTAL DISTANCE, NOT METRES-INTO-THIS-KILOMETRE, and at 24 points rather than 11. The bar
       * above already draws the position inside the kilometre — as a position, which is what a bar
       * is for. Printing the same thing as a number under it was the one seat this line had, spent.
       */
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(String(format: "%.2f", km))
          .font(.system(size: Fit.s(24), weight: .semibold, design: .monospaced)).monospacedDigit()
          .foregroundStyle(Palette.ink0)
        Text(WatchCopy.metricKm.lowercased())
          .font(.system(size: Fit.s(12), design: .monospaced))
          .foregroundStyle(Palette.ink2)
      }
      .lineLimit(1).minimumScaleFactor(0.6)
    }
  }

  /// Minutes per kilometre — measured, never modelled, and a dash until there is a kilometre.
  private var paceLabel: String {
    let km = metrics.distanceKm ?? 0
    let secs = elapsed()
    guard km >= 0.05, secs > 0 else { return "––" }
    return fmtTime(secs / km)
  }
}

/// The cardio pause page — the gym's own, one swipe left, and the only place a run ends.
private struct CardioPausedScreen: View {
  let paused: Bool
  var onPage: Bool = true
  let onPauseToggle: () -> Void
  let onEnd: () -> Void
  @State private var confirmingEnd = false

  var body: some View {
    if confirmingEnd {
      EndConfirmScreen(
        title: WatchCopy.finishConfirmTitle, confirmTitle: WatchCopy.finishSave,
        onConfirm: onEnd, onKeep: { confirmingEnd = false }
      )
      .onChange(of: onPage) { _, on in if !on { confirmingEnd = false } }
    } else {
      WristScreen {
        VStack(spacing: 0) {
          TopStrip()
          Spacer(minLength: 2)
          VStack(spacing: 8) {
            ZStack {
              Circle().strokeBorder(Palette.ink0.opacity(0.3), lineWidth: 1.5).frame(width: Fit.s(40), height: Fit.s(40))
              Image(systemName: paused ? "play.fill" : "pause.fill").font(.system(size: 15)).foregroundStyle(Palette.ink0)
            }
            Text(paused ? WatchCopy.pausedTitle : WatchCopy.cardio)
              .font(.system(size: Fit.s(19), design: .serif)).foregroundStyle(Palette.ink0)
          }
          .frame(maxWidth: .infinity)
          Spacer(minLength: 2)
        }
      } actions: {
        VStack(spacing: 5) {
          StageButton(title: paused ? WatchCopy.resume : WatchCopy.pause, kind: .moss,
                      height: Wrist.action, fontSize: 15, action: onPauseToggle)
          // Finish only ARMS the guard (founder 2026-07-12) — the save happens behind it.
          OutlineButton(title: WatchCopy.finishSave, tint: Palette.ink1,
                        border: Palette.ink0.opacity(0.22), height: 36, fontSize: 13) { confirmingEnd = true }
        }
      }
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
    /*
     * Founder, device review 2026-08-01: *"the CR4 screen does not match at all the one that
     * appears on our watch at the end of the workout."*
     *
     * It did not. The build showed "✓ RECORDED", "Run complete." across two lines of 24 pt, and a
     * TIME / KM / KCAL row in which the two figures that matter read "—" because a 24-second test
     * never covered a metre.
     *
     * The canonical CR4 leads with the DISTANCE, because that is what a run earned: "✓ CARDIO ·
     * SAVED", the serif "That's the distance.", 4.2 km as the hero, a rule, then time, burn and
     * average heart. The same shape as WT6, which is the point — a run closes the way a workout
     * closes, and neither is graded.
     */
    WristScreen {
      VStack(alignment: .leading, spacing: 0) {
        TopStrip()
        Spacer(minLength: 2)
        /*
         * ⛔ THE MARK REPLACES THE MOOD (founder 2026-08-04). "That's the distance." took a whole
         * block on a 41 mm case to say what the enormous figure under it already says. The wordmark
         * costs one row and makes a screenshot of a wrist carry the product — the same reason it
         * went onto the phone's poster.
         */
        HStack(spacing: 6) {
          RangeGlyph()
          Text("hush").font(.system(size: Fit.s(15), design: .serif)).foregroundStyle(Palette.ink0)
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .padding(.top, 2)
        HStack(alignment: .firstTextBaseline, spacing: 5) {
          Text(summary.distanceKm.map { String(format: "%.2f", $0) } ?? "––")
            .font(.system(size: Fit.s(42), weight: .medium, design: .monospaced)).monospacedDigit()
            .foregroundStyle(Palette.ink0)
            .lineLimit(1).minimumScaleFactor(0.5)
          Text(WatchCopy.metricKm.lowercased())
            .font(.system(size: 14, design: .monospaced)).foregroundStyle(Palette.ink2)
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .padding(.top, 2)
        Rectangle().fill(Palette.stage2).frame(height: 1).padding(.vertical, 7)
        HStack(spacing: 4) {
          Metric(value: fmtTime(summary.elapsedS), label: WatchCopy.metricTime)
          Metric(value: summary.kcal.map { "\($0)" } ?? "––", label: WatchCopy.metricKcalShort)
          Metric(value: paceLabel, label: WatchCopy.perKm)
        }
        Spacer(minLength: 2)
      }
    } actions: {
      StageButton(title: WatchCopy.done, kind: .primary, height: Fit.s(42), fontSize: 15, action: onDone)
    }
  }

  /// Minutes per kilometre — measured, not modelled. A dash until there is a kilometre to divide by.
  private var paceLabel: String {
    guard let km = summary.distanceKm, km >= 0.05, summary.elapsedS > 0 else { return "––" }
    return fmtTime(summary.elapsedS / km)
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
    .padding(.horizontal, Wrist.side).padding(.bottom, Wrist.foot)
    .contentShape(Rectangle())
    .onTapGesture { TapGate.pass(finishReading) }
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
    /*
     * Founder, device review 2026-08-01: *"you have a row of minutes, calories, TON and UP — you
     * can space them out much better, and if UP is gone because we added the AI then remove it.
     * You can even shrink Done a little and give those numbers more size."*
     *
     * UP is gone, and he is right about why. It counted the lifts the ENGINE raised, and the coach
     * owns progression now — the field still rides the wire, but on a coach-run session it is 0,
     * which is what his screenshot shows. A metric that is always zero is not a quiet metric; it
     * is a claim that nothing happened.
     *
     * Three facts left, so each gets a third of the row instead of a quarter: 15 pt → 22 pt on the
     * figure, 8 pt → 10 on the label. Done drops from 48 to 42, which is where the size came from.
     */
    WristScreen {
      VStack(spacing: 0) {
        TopStrip()
        Spacer(minLength: 2)
        VStack(spacing: 10) {
          TallyMark()
          /*
           * ⛔ THE WORKOUT'S NAME, NOT A MOOD (founder 2026-08-04, applying the phone's poster to the
           * wrist). `WireMirror.workoutName` has ridden the wire the whole time and this screen never
           * drew it: **"That's the work." is a mood; "Lower A" is a fact**, and the tally mark above
           * it has already said the work is done.
           *
           * ⚠️ IT IS ON THE MIRROR, NOT ON THE SUMMARY. I wrote `summary?.workoutName` and that field
           * does not exist — `WireSummary` carries the figures, `WireLobby` and `WireRecord` carry a
           * name of their own, and the live mirror carries this one. A Swift compile error I could
           * not have seen without a build, found by reading the struct rather than trusting the
           * spelling.
           *
           * ⚠️ The sentence stands in when the name is absent, which is what a standalone workout
           * with no phone-side programme looks like.
           */
          Text(mirror.workoutName ?? WatchCopy.thatsTheWork)
            .font(.system(size: Fit.s(23), design: .serif))
            .foregroundStyle(Palette.ink0)
            .multilineTextAlignment(.center)
            .lineSpacing(1)
            .lineLimit(2).minimumScaleFactor(0.7)
            .fixedSize(horizontal: false, vertical: true)
          if let sm = mirror.summary {
            HStack(alignment: .top, spacing: 4) {
              completeMetric(minutesLabel(sm.timeLabel), WatchCopy.metricMinShort)
              // Kcal from the OS runtime; an honest dash when HealthKit gave nothing, never a model.
              completeMetric(shownKcal.map { "\($0)" } ?? "––", WatchCopy.metricKcalShort)
              completeMetric(fmtTonnes(sm.volumeKg), WatchCopy.metricTonnesShort)
            }
          }
        }
        .frame(maxWidth: .infinity)
        Spacer(minLength: 2)
      }
    } actions: {
      // The way out passes through the mark, exactly as it does on the phone: any exit from the
      // result plays beat 4 once, and only on the session that earned it.
      StageButton(title: WatchCopy.done, kind: .primary, height: Fit.s(42), fontSize: 15) {
        guard milestone != nil else {
          onDone()
          return
        }
        WatchHaptics.play(.receiptEarned)
        withAnimation(.spring(response: 0.34, dampingFraction: 0.7)) { stamped = true }
      }
    }
  }

  /// One column of the WT6 metric row — mono figure over a muted mono label, a third of the row each.
  private func completeMetric(_ value: String, _ label: String) -> some View {
    VStack(spacing: 3) {
      Text(value)
        .font(.system(size: Fit.s(22), weight: .medium, design: .monospaced)).monospacedDigit()
        .foregroundStyle(Palette.ink0)
        .lineLimit(1).minimumScaleFactor(0.5)
      Text(label)
        .font(.system(size: Wrist.legend, weight: .regular, design: .monospaced)).tracking(0.8)
        .foregroundStyle(Palette.ink2)
    }
    .frame(maxWidth: .infinity)
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
    // Founder, device review 2026-08-01: *"on the MILESTONES screen, Done is cut off on the watch."*
    // A 96 pt seal, a serif line, two Spacers and a 48 pt button came to more than the case had.
    // The seal scales with the case; the button is measured first and no longer negotiates.
    WristScreen {
      VStack(spacing: 0) {
        TopStrip()
        Spacer(minLength: 2)
        VStack(spacing: 11) {
          // The mock's seal: a dashed CREAM outer ring around a faint solid inner ring, the engraved
          // figure + its unit stacked at the centre (a check when the mark is an event, not a number).
          ZStack {
            Circle().strokeBorder(
              Palette.ink0.opacity(0.4),
              style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])
            ).frame(width: Fit.s(86), height: Fit.s(86))
            Circle().strokeBorder(Palette.ink0.opacity(0.18), lineWidth: 1).frame(width: Fit.s(66), height: Fit.s(66))
            VStack(spacing: 1) {
              if let v = m.value, !v.isEmpty {
                Text(v)
                  .font(.system(size: Fit.s(28), weight: .medium, design: .monospaced)).monospacedDigit()
                  .foregroundStyle(Palette.ink0)
                  .lineLimit(1).minimumScaleFactor(0.6)
                if let c = m.caption, !c.isEmpty {
                  Text(c.uppercased())
                    .font(.system(size: 9, weight: .medium, design: .monospaced)).tracking(1.2)
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
            .font(.system(size: Fit.s(18), design: .serif)).foregroundStyle(Palette.ink0)
            .multilineTextAlignment(.center)
            .lineLimit(2).minimumScaleFactor(0.7).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        Spacer(minLength: 2)
      }
    } actions: {
      StageButton(title: WatchCopy.done, kind: .primary, height: Fit.s(42), fontSize: 15, action: onDone)
    }
  }
}

// MARK: 07 · Paused}

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
  /// The swipe-in variant (the page beside a live set) owns its own end guard, because backing out
  /// of that PAGE has to disarm it. When it supplies one, Resume is not offered — the way back to
  /// the set is the swipe she came in on, and a button that did the same thing would be a second
  /// answer to a question she has already answered.
  var armEnd: (() -> Void)? = nil
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
      /*
       * Founder, device review 2026-08-01: *"on the PAUSED screen with SOMETHING FEELS OFF, that
       * button gets cut off by the screen — look."*
       *
       * Three stacked buttons plus a 44 pt glyph, a serif title and two Spacers came to more than
       * the case had. The container now measures the three actions first; the mark above them is
       * what gives way, which is the right thing to lose — she knows she paused, she just tapped it.
       */
      WristScreen {
        VStack(spacing: 0) {
          TopStrip()
          Spacer(minLength: 2)
          VStack(spacing: 8) {
            ZStack {
              Circle().strokeBorder(Palette.ink0.opacity(0.3), lineWidth: 1.5).frame(width: Fit.s(40), height: Fit.s(40))
              Image(systemName: "pause.fill").font(.system(size: 15)).foregroundStyle(Palette.ink0)
            }
            Text(WatchCopy.pausedTitle)
              .font(.system(size: Fit.s(19), design: .serif)).foregroundStyle(Palette.ink0)
          }
          .frame(maxWidth: .infinity)
          Spacer(minLength: 2)
        }
      } actions: {
        VStack(spacing: 5) {
          if armEnd == nil {
            StageButton(title: WatchCopy.resume, kind: .moss, height: Fit.s(40), fontSize: 14, action: onResume)
          }
          OutlineButton(title: WatchCopy.endWorkout, systemImage: "stop", tint: Palette.ink1,
                        border: Palette.ink0.opacity(0.22), height: 36, fontSize: 13) {
            if let armEnd { armEnd() } else { confirmingEnd = true }
          }
          OutlineButton(title: WatchCopy.somethingOff, tint: Palette.clay,
                        border: Palette.clay.opacity(0.55), height: 36, fontSize: 13) { reportingPain = true }
        }
      }
    }
  }
}

private struct PainAreaScreen: View {
  let onPick: (String) -> Void
  let onBack: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 6) {
        Button(action: { TapGate.pass(onBack) }) {
          Image(systemName: "chevron.left").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.ink2)
        }
        .buttonStyle(.plain)
        Legend(WatchCopy.whereIsIt, size: 10)
      }
      ScrollView {
        /*
         * Founder, device review 2026-08-01: *"on the injury screen please make the buttons bigger
         * — I would rather three fit per screen and be clear than four the way it is now, all
         * squeezed."*
         *
         * 44 pt rows at 15 pt type: three land on a 41 mm case with the fourth peeking, which is
         * also the honest scroll affordance. She is reporting pain — this is not the screen to make
         * her aim.
         */
        VStack(spacing: 6) {
          // She taps the label; the phone receives the VALUE.
          ForEach(WatchCopy.painAreas) { area in
            Button { TapGate.pass { onPick(area.value) } } label: {
              HStack {
                Text(area.label).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink0)
                  .lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .medium)).foregroundStyle(Palette.ink2)
              }
              .padding(.horizontal, 12)
              .frame(maxWidth: .infinity).frame(height: Fit.s(44))
              .overlay(RoundedRectangle(cornerRadius: 13).strokeBorder(Palette.ink0.opacity(0.16), lineWidth: 1))
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
        .padding(.top, 4)
      }
    }
    .padding(.horizontal, Wrist.side).padding(.top, 2).padding(.bottom, Wrist.foot)
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
        Button(action: { TapGate.pass(onBack) }) {
          Image(systemName: "chevron.left").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.ink2)
        }
        .buttonStyle(.plain)
        Legend(WatchCopy.howSharp, size: 10)
      }
      // `muscle` is the map's own name — what the wire carries. She reads hers.
      Text(WatchCopy.muscle(muscle))
        .font(.system(size: Fit.s(17), design: .serif)).foregroundStyle(Palette.ink0)
        .lineLimit(1).minimumScaleFactor(0.8)
        .padding(.top, 3)
      Spacer(minLength: 4)
      VStack(spacing: 6) {
        ForEach(WatchCopy.severityChoices) { choice in
          Button { TapGate.pass { onPick(choice.value) } } label: {
            HStack {
              Text(choice.label).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink0)
                .lineLimit(1).minimumScaleFactor(0.8)
              Spacer(minLength: 4)
              Image(systemName: "chevron.right").font(.system(size: 11, weight: .medium)).foregroundStyle(Palette.ink2)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity).frame(height: Fit.s(44))
            .overlay(RoundedRectangle(cornerRadius: 13).strokeBorder(Palette.clay.opacity(0.45), lineWidth: 1))
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
      Spacer(minLength: 4)
    }
    .padding(.horizontal, Wrist.side).padding(.top, 2).padding(.bottom, Wrist.foot)
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
    .padding(.horizontal, Wrist.side).padding(.bottom, Wrist.foot)
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
