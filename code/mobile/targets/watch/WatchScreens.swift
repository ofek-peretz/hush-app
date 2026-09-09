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
  /* ⛔ `foot` is DELETED (2026-08-05). It was "the gap under the action zone", and the founder's
     answer to that gap was that there should not be one: the action zone reaches the bottom edge.
     Four screens had to be un-padded by hand to make it true, which is precisely why the constant
     goes rather than being set to zero — a named gap is a gap somebody re-applies. */
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
        .padding(.horizontal, Wrist.side)
      /*
       * ⛔ THE ACTION ZONE OWNS THE FLOOR — founder, asked four times and answered plainly on
       * 2026-08-05: *"you have not answered me for several messages now — did you understand that
       * I want the button to START from the bottom of the watch's own frame, in order to free up
       * space?"*
       *
       * I HAD BUILT IT AND APPLIED IT TO ONE SCREEN. `StageButton.seated` cancels the container's
       * gutters with negative padding of its own, and exactly one call site out of ten passed the
       * flag — so Rest, Paused, Edit Set, the cardio menu and cardio-saved all kept a floating
       * button with three points of dead air under it, and all five are the screenshots where the
       * button is sliced.
       *
       * **A flag every call site must remember is a flag nine call sites will forget.** The gutter
       * moves onto the CONTENT and the action zone simply has none: it reaches the bottom edge and
       * both sides, on every screen, without anything being passed anywhere.
       *
       * ⚠️ `Wrist.foot` is gone from here entirely rather than set to zero. A three-point gap under
       * a button is not a design decision anybody made — it was the container's own bottom padding
       * leaking past the thing it was padding.
       */
      actions
        .layoutPriority(1)
    }
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
  static let stage0 = Color.black // stage[0] #000000 — absolute black (founder 2026-08-05)
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
    ClockLane {
      HStack(spacing: 7) {
        if let text {
          Text(text)
            .font(.system(size: Wrist.label, weight: .medium, design: .monospaced)).tracking(0.8)
            .foregroundStyle(Palette.ink1)
            .lineLimit(1).minimumScaleFactor(0.75)
        } else if let lift {
          // Her word for it (2026-09-09): this was the literal "LIFT" on a Hebrew wrist, on the one
          // strip every execution screen carries.
          Text("\(WatchCopy.liftWord.uppercased()) \(lift.i)/\(lift.n)")
            .font(.system(size: Wrist.label, weight: .medium, design: .monospaced)).tracking(0.8)
            .foregroundStyle(Palette.ink1)
        }
        if controlsHint {
          /*
           * THE WAY TO PAUSE IS A TARGET, NOT A GLYPH (design pass 2026-09-09). The chip was 18 pt
           * tall — the smallest thing on a screen she reaches for at a stride. Its glyphs stay the
           * size they were; the capsule around them grows to the row's full height, because the
           * thing she taps is the capsule.
           */
          Button(action: { TapGate.pass(goControls) }) {
            HStack(spacing: 3) {
              Image(systemName: "chevron.backward").font(.system(size: 12, weight: .semibold))
              Image(systemName: "pause.fill").font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(Palette.ink2)
            .padding(.horizontal, 8)
            .frame(height: Wrist.head)
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
    }
    .frame(height: Wrist.head)
  }
}

/*
 * ════ THE CLOCK'S LANE IS PHYSICAL ════ (WT1 · WT2 · every strip)
 *
 * watchOS draws the time at the top-RIGHT of the glass in every language, and nothing may sit under
 * it. The strip used to reserve that width with `.padding(.trailing, 52)` — which is the trailing
 * side of the LAYOUT, and on a Hebrew wrist the layout's trailing side is the left. So the moment
 * the phone reported `rtl: true`, every header on every screen moved to the right edge and sat
 * exactly under the clock, and the 52 points of padding kept an empty corner on the left.
 *
 * The lane is reserved on the right of the SCREEN, whatever the language: this row lays itself out
 * left-to-right by decree, keeps 52 pt on the physical right, and hands the remaining width back to
 * the header in the header's own direction. A Hebrew strip hugs the clock's left edge — the
 * top-right corner that is hers — and an English one keeps the top-left it always had.
 */
private struct ClockLane<Content: View>: View {
  @Environment(\.layoutDirection) private var direction
  @ViewBuilder let content: () -> Content
  var body: some View {
    content()
      .frame(maxWidth: .infinity, alignment: .leading)
      // `.leading` / `.trailing` are edges of the LAYOUT, and the layout is what turns around —
      // so the physical right is the trailing edge in English and the leading edge in Hebrew.
      // No second `layoutDirection` is written here: the wrist turns around once, at the root.
      .padding(direction == .rightToLeft ? .leading : .trailing, 52)
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
  /// A leading SF glyph — the play mark on Begin. Declared before `seated` for the same
  /// positional reason `seated` is declared before `action`.
  var glyph: String? = nil
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
  /**
   * ⚠️ `seated` NO LONGER MEANS "reach the edge" — `WristScreen` does that for every action now
   * (see its note). What is left is the SHAPE: a button sitting on the bottom edge wants square
   * bottom corners, because the case's own curve finishes them, and a 14-point radius down there
   * reads as a button that failed to arrive. The bleed pushes the rounded bottom past the glass.
   */
  var seated: Bool = false
  let action: () -> Void
  var body: some View {
    Button(action: { TapGate.pass(action) }) {
      HStack(spacing: 6) {
        if let glyph { Image(systemName: glyph).font(.system(size: fontSize * 0.8, weight: .semibold)) }
        Text(title).font(.system(size: fontSize, weight: .semibold))
      }
        .frame(maxWidth: .infinity).frame(height: Fit.s(height)) // taller targets on larger cases
        .padding(.bottom, seated ? SEAT_BLEED : 0)
        .foregroundStyle(fg)
        .background(bg)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        // The drawn shape overhangs its layout box by the bleed, so the row below it is unmoved.
        .padding(.bottom, seated ? -SEAT_BLEED : 0)
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
    // The unit in her language — "kg" was a literal here while every other unit on the wrist
    // went through `WatchCopy.kg` (2026-09-09). Two runs, so the mono face never meets Hebrew.
    return (dir > 0 ? "+" : "−") + fmtW(abs(deltaKg)) + " " + WatchCopy.kg
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
        Text("→").font(.system(size: 12, design: .monospaced)).foregroundStyle(Palette.ink2)
        Text(fmtW(c.to))
          .font(.system(size: 17, weight: .semibold, design: .monospaced)).monospacedDigit()
          // The engine's new load, IN THE DIRECTION IT MOVED. It was moss either way — so the wrist
          // announced an ease in the colour of a raise (founder 2026-07-29, phone parity).
          .foregroundStyle(up ? Palette.up : Palette.down)
        Text(WatchCopy.kg).font(.system(size: 12)).foregroundStyle(Palette.ink2)
      }
      // The reason, under the number it earned — never apart from it (phone parity).
      Text(WatchCopy.corrected(c.reps, up: up))
        .font(.system(size: 12))
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

/// The check as a stroke, so it can be DRAWN — the phone's "green check animation" (founder
/// 2026-07-13), which the wrist had as a static glyph. Two segments, the short one first.
private struct CheckShape: Shape {
  func path(in r: CGRect) -> Path {
    var p = Path()
    p.move(to: CGPoint(x: r.minX + r.width * 0.08, y: r.minY + r.height * 0.55))
    p.addLine(to: CGPoint(x: r.minX + r.width * 0.38, y: r.minY + r.height * 0.86))
    p.addLine(to: CGPoint(x: r.minX + r.width * 0.94, y: r.minY + r.height * 0.16))
    return p
  }
}

/// A check that draws itself on arrival — 0.35 s, the short stroke then the long one. Motion on
/// a beat is the one place motion serves here: the beat lasts a breath, and the drawing IS the
/// news landing. Still under reduced motion, still in the Always-On state.
private struct DrawCheck: View {
  var size: CGFloat = 22
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.isLuminanceReduced) private var dimmed
  @State private var drawn = false
  var body: some View {
    CheckShape()
      .trim(from: 0, to: drawn ? 1 : 0)
      .stroke(Palette.up, style: StrokeStyle(lineWidth: max(2.4, size * 0.13), lineCap: .round, lineJoin: .round))
      .frame(width: size, height: size * 0.82)
      .onAppear {
        if reduceMotion || dimmed { drawn = true } else { withAnimation(.easeOut(duration: 0.35)) { drawn = true } }
      }
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
        Image(systemName: "arrow.uturn.backward").font(.system(size: 12, weight: .semibold))
        Text(WatchCopy.undo).font(.system(size: 12, weight: .semibold))
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
  /// The label under the time while counting. Her word (2026-09-09): the ring said "REST" and
  /// "READY" in English under a Hebrew countdown, because the two literals never went through
  /// `WatchCopy`, whose `rest` and `ready` keys sat unread the whole time.
  var restingLabel: String = WatchCopy.rest.uppercased()
  /// The running arc's colour when this rest FOLLOWS a load the engine moved (founder 2026-07-29:
  /// the ring is blue behind an eased load, on the phone and on the wrist alike). Default = the
  /// ordinary rest, and the arc keeps the moss accent it has always had.
  var arc: Color = Palette.signal
  /// The time's share of the diameter. 0.24 on the big rings; a ring that shares its row with a
  /// card is smaller, and its time must not shrink with it.
  var timeScale: CGFloat = 0.24

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
            .font(.system(size: diameter * timeScale, weight: .semibold, design: .monospaced))
            .monospacedDigit().foregroundStyle(Palette.ink0)
          Text(ready ? WatchCopy.ready.uppercased() : restingLabel).font(.system(size: 12, weight: .medium)).tracking(0.8).foregroundStyle(Palette.ink2)
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

/*
 * ════ THE PAUSE FACE'S ACTIONS — TWO ROWS, NOT THREE ════
 *
 * Founder, device review 2026-08-01, of the strength Paused page: *"that button gets cut off by
 * the screen — look."* His 2026-09-09 screenshot of the CARDIO pause page shows the same thing
 * a month later: "משהו לא מרגיש טוב" sliced at the bottom of a 45 mm case. Three stacked buttons
 * (44 + 36 + 36 and two gaps) are 126 pt of a 242 pt case before a single fact is drawn, and the
 * report — the door this product most needs her to find — is the one that goes under the glass.
 *
 * Two rows: the primary (Pause / Resume) full width, and beneath it End and the report SIDE BY
 * SIDE, both seated. Same three ways out, 87 pt instead of 126, and the row is the same on the
 * lifting page and the running page — one shape for "I have stopped".
 */
private struct PauseActions: View {
  /// Resume / Pause — nil on the swipe-in page, where the way back is the swipe she came in on.
  var primary: (title: String, action: () -> Void)? = nil
  let endTitle: String
  let onEnd: () -> Void
  let onPain: () -> Void
  var body: some View {
    VStack(spacing: 5) {
      if let primary {
        StageButton(title: primary.title, kind: .moss, height: Wrist.action, fontSize: 15, action: primary.action)
      }
      HStack(spacing: 5) {
        OutlineButton(title: endTitle, systemImage: "stop", tint: Palette.ink1,
                      border: Palette.ink0.opacity(0.22), height: 38, fontSize: 12,
                      seated: true, action: onEnd)
        // Clay, as before — pain is the one thing in this product that is neither a direction nor
        // a decision. Half the row, but the whole half, and never under the bezel again.
        OutlineButton(title: WatchCopy.somethingOff, tint: Palette.clay,
                      border: Palette.clay.opacity(0.55), height: 38, fontSize: 12,
                      seated: true, action: onPain)
      }
    }
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
    row
  }
  private var row: some View {
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
        // A figure never measured stands in the superseded ink: a cream dash reads as data.
        .foregroundStyle(value == "––" ? Palette.ink3 : Palette.ink0)
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
  /// The heart tile: the glyph is `PulseHeart`, beating at `bpm`, in place of the static symbol.
  var heart: Bool = false
  var bpm: Int? = nil
  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(spacing: 5) {
        if heart {
          PulseHeart(bpm: bpm)
        } else if let glyph {
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
  /// Her sets so far — the figure WT13b names as what "saved as-is" keeps (design pass 2026-09-09).
  var sets: Int? = nil
  /// The workout's pause-aware clock, for the Paused face.
  var elapsed: (() -> TimeInterval?)? = nil
  /// This page is the one on screen. An armed end-guard DISARMS the moment the athlete
  /// swipes back to the stage — a guard they walked away from must never be waiting for
  /// them, cocked, the next time they come to pause.
  var onPage: Bool = true
  let onPause: () -> Void
  let onEnd: () -> Void
  /// Returns whether the report actually reached the phone — WT15 is a claim about what the PHONE
  /// did, so a report that went nowhere must not draw one.
  var onReportPain: (String, String) -> WatchModel.PainReport = { _, _ in .queued }
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
      EndConfirmScreen(lift: lift, fact: sets.map { (value: "\($0)", label: WatchCopy.metricSets) },
                       onConfirm: onEnd, onKeep: { confirmingEnd = false })
        .onChange(of: onPage) { _, on in if !on { confirmingEnd = false } }
    } else {
      PausedScreen(lift: lift, elapsed: elapsed, onResume: {}, onEnd: onEnd, onReportPain: onReportPain,
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
/// mirror; nothing here computes, and nothing here is a verdict.
///
/// There is no button. The way out is the swipe she came in on, and the foot of the screen says so.
private struct GlanceScreen: View {
  @ObservedObject var metrics: LiveMetrics
  /// The same lift counter every execution page carries in its strip — the glance is a page of
  /// the same workout, and "UPPE… · עכשיו" (the founder's screenshot, 2026-09-09) was the name
  /// uppercased into one string with a Hebrew legend, truncated AND reordered by the bidi
  /// algorithm. The name buys nothing here: she is inside it.
  var lift: (i: Int, n: Int)? = nil

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
          TopStrip(lift: lift, trailing: elapsedText)
        }
        Spacer(minLength: 4)
        TimelineView(.periodic(from: .now, by: 1)) { _ in
          VStack(spacing: 6) {
            // Her word for it — "BPM" was the Latin `bpm` key on a Hebrew wrist — and the glyph
            // beats at her measured rate, the same heart the run's stage carries.
            MetricTile(value: metrics.heartRateBpm.map { "\($0)" } ?? "––",
                       label: WatchCopy.metricHeart, glyph: "heart.fill", tint: Palette.clay,
                       valueSize: Fit.s(34), heart: true, bpm: metrics.heartRateBpm)
            /*
             * ⛔ THE TONNAGE TILE IS DELETED (founder 2026-08-05): *"in the watch screen, what is
             * that 1,000 KG SET thing — what is it even supposed to be? I did not understand. I
             * wanted you to show only calories and heart rate. Take it out and run the calories
             * rectangle all the way across like the heart rate one."*
             *
             * He is right that it was unreadable, and the reason is worth keeping: the tile held
             * TWO facts — kilograms lifted so far and a set count — in one label, so on a 41 mm
             * case it truncated to "1,000 KG · SET…" and became a number with no noun. Half a
             * label is worse than no label.
             *
             * It is also the wrong fact for this screen. She swiped here mid-set to see her heart
             * and her burn; cumulative tonnage is a thing to read AFTER, and the finish screen
             * leads with it.
             */
            MetricTile(value: metrics.activeKcal.map { "\($0)" } ?? "––",
                       label: WatchCopy.metricKcalShort, glyph: "flame.fill", tint: Palette.ink1,
                       valueSize: Fit.s(30))
          }
        }
        Spacer(minLength: 4)
        HStack(spacing: 4) {
          // `backward`, not `left`: the symbol mirrors with the layout, so a Hebrew wrist points
          // the way its swipe actually goes.
          Image(systemName: "chevron.backward").font(.system(size: 12, weight: .semibold))
          Text(WatchCopy.backToYourSet).font(.system(size: 12))
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
  /*
   * WHAT "SAVED AS-IS" MEANS, AS A FIGURE (design pass 2026-09-09). The reassurance line said the
   * workout is kept at this point; this says what "this point" holds — the sets she has logged, or
   * the minutes a run has run. A decision to end is a decision about that figure, and the screen
   * that asks for it did not show it. Nil where the screen has no session to read (the standalone
   * Paused face), and then the line is simply not drawn.
   */
  var fact: (value: String, label: String)? = nil
  let onConfirm: () -> Void
  let onKeep: () -> Void
  var body: some View {
    WristScreen {
      VStack(spacing: 0) {
        TopStrip(lift: lift)
        Spacer(minLength: 4)
        VStack(spacing: 6) {
          Text(title)
            .font(.system(size: Fit.s(21), design: .serif)).foregroundStyle(Palette.ink0)
            .multilineTextAlignment(.center).lineSpacing(1)
            .fixedSize(horizontal: false, vertical: true)
          Text(WatchCopy.endConfirmSub)
            .font(.system(size: 12)).foregroundStyle(Palette.ink2)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
          if let fact {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
              Text(fact.value)
                .font(.system(size: Fit.s(22), weight: .semibold, design: .monospaced)).monospacedDigit()
                .foregroundStyle(Palette.ink0)
              Legend(fact.label, size: Wrist.legend)
            }
            .padding(.top, 2)
          }
        }
        .frame(maxWidth: .infinity)
        Spacer(minLength: 4)
      }
    } actions: {
      VStack(spacing: 5) {
        // Clay FILL, stage ink — the irreversible act, now the primary (the guard was the earlier tap).
        StageButton(title: confirmTitle, kind: .danger, height: Wrist.action, fontSize: 15, action: onConfirm)
        // The way back keeps the floor — and it is 40 pt now, not 34: on a screen whose other
        // button ends the workout, the safe answer must never be the harder one to hit.
        OutlineButton(title: WatchCopy.keepGoing, tint: Palette.ink1,
                      border: Palette.ink0.opacity(0.22), height: 40, fontSize: 13,
                      seated: true, action: onKeep)
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
  var lift: (i: Int, n: Int)? = nil
  /// Her logged sets, for the end guard's one figure. (`liveSets` is READ again — for the guard,
  /// not for the glance: the founder's 2026-08-05 ruling deleted a tonnage tile he could not read,
  /// and a count of sets beside "saved as-is" is the opposite of that — it is the thing being saved.)
  var sets: Int? = nil
  let onPause: () -> Void
  let onEnd: () -> Void
  /// WT13c's two live figures about her own lifting, carried from the mirror.
  /* ⛔ `liveVolumeKg` / `liveSets` are GONE (2026-08-05) — they fed the glance's tonnage tile,
     which the founder could not read and did not want. The wire still carries them; nothing on the
     wrist draws them, and a prop nobody reads is a prop somebody re-wires to the wrong thing. */
  /// The paused page owns the "something feels off" path now, so the reporter travels with it.
  var onReportPain: (String, String) -> WatchModel.PainReport = { _, _ in .queued }
  @ViewBuilder let content: () -> Content
  @State private var page = 1

  var body: some View {
    // THREE pages, the Apple Workout idiom exactly: stop on one side, glance on the other, and the
    // work in the middle. It was two — the only thing beside the stage was the way to END, so a
    // swipe the "wrong" way found nothing at all (founder 2026-07-28).
    TabView(selection: $page) {
      ControlsScreen(lift: lift, sets: sets, elapsed: { metrics.elapsed() }, onPage: page == 0,
                     onPause: onPause, onEnd: onEnd, onReportPain: onReportPain).tag(0)
      // The stage is handed the way IN to the Controls page: the "‹ ⏸" hint taps through
      // to exactly where the swipe lands. The page index never leaves this view.
      content()
        .environment(\.goControls, { withAnimation { page = 0 } })
        .tag(1)
      GlanceScreen(metrics: metrics, lift: lift)
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
      VStack(spacing: 10) {
        // The wordmark, not a dumbbell — this is the first face the wrist ever shows, and a
        // borrowed SF glyph is nobody's product (design pass 2026-09-09).
        HStack(spacing: 6) {
          RangeGlyph()
          Text("hush").font(.system(size: Fit.s(17), design: .serif)).foregroundStyle(Palette.ink0)
        }
        Text(WatchCopy.idleWaiting).font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.ink1)
        /*
         * The wire's testimony (build-59 silence), and it names the FAULT now rather than the
         * category (founder 2026-08-30, photographing `wc:badframe · rx:0` — four letters that
         * could mean any of three unrelated things):
         *
         *   wc:on · rx:0        the pipe is open and the phone has sent nothing
         *   wc:on!<code>        activation completed broken; the code is the NSError's
         *   wc:nokey:<keys>     something arrived that is not ours — no `envelope` string. The
         *                       keys it DID carry follow, which is how a stale application context
         *                       from an older build announces itself
         *   wc:badframe:<why>   it is ours and it will not decode. `<why>` is the decoder's own
         *                       account: `miss:lobby.muscles` (the phone stopped sending a field
         *                       Swift requires), `type:plan.workouts[0].steps[3].targetReps` (a
         *                       float where Int is declared), `null:…`, and for a document the
         *                       parser refused outright, `json@245«…the text around it…»` — the
         *                       offset Foundation named and ten characters either side, escapes
         *                       left as written (founder 2026-09-08: bare `json` was the next
         *                       four letters that said nothing; the one cause stringify output
         *                       can have is a lone `\uD83D` escape, and that is visible here)
         *
         * ⚠️ AND IT CLEARS. A good frame puts this back to `wc:on` — a complaint that cannot go
         * back to healthy is one nobody can act on, and one stale context used to pin it for the
         * life of the app over a pipe that had since started working.
         *
         * One line, only on the one screen that means "nothing has arrived".
         */
        if !model.wireDiag.isEmpty {
          Text(model.wireDiag).font(.system(size: 12, design: .monospaced)).foregroundStyle(Palette.ink2.opacity(0.6))
        }
      }
    case let .start(lobby):
      StartScreen(lobby: lobby, onBegin: model.begin, onSelect: model.selectWorkout, onCardio: model.startCardio)
    case let .connectionLost(m):
      ConnectionLostScreen(mirror: m)
    case let .workoutComplete(m):
      CompleteScreen(mirror: m, kcal: model.completedKcal, onDone: model.dismissComplete)
    case let .liftDone(name):
      // WT10 — the lift is closed. One beat, then the transition rest names what is next.
      LiftDoneScreen(name: name, lift: model.liftProgress, onTap: model.dismissSetConfirm)
    case let .correction(c):
      // WT3 — the set is logged AND it moved the next load, so this beat says the news instead of
      // restating a load and a rep count she chose herself thirty seconds ago.
      CorrectionScreen(c: c, onTap: model.dismissSetConfirm)
    case let .activeSet(m, draft):
      ExecutionPager(metrics: model.liveMetrics,
                     lift: (i: m.liftIndex ?? 1, n: m.liftCount ?? 1), sets: m.liveSets,
                     onPause: model.pause, onEnd: model.endWorkout,
                     onReportPain: model.reportPain) {
        ActiveSetScreen(mirror: m, draft: draft, onSave: model.saveEdit,
                        onComplete: model.completeSet)
      }
    case let .interRest(m):
      ExecutionPager(metrics: model.liveMetrics,
                     lift: (i: m.liftIndex ?? 1, n: m.liftCount ?? 1), sets: m.liveSets,
                     onPause: model.pause, onEnd: model.endWorkout,
                     onReportPain: model.reportPain) {
        InterRestScreen(mirror: m, onReady: model.ready, onAdd: model.addRest,
                        announced: model.announcedCorrectionAt == m.globalIndex)
      }
    case let .transitionRest(m):
      ExecutionPager(metrics: model.liveMetrics,
                     lift: (i: (m.liftIndex ?? 1) + 1, n: m.liftCount ?? 1), sets: m.liveSets,
                     onPause: model.pause, onEnd: model.endWorkout,
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
                  onPauseToggle: model.toggleCardioPause, onEnd: model.endCardio,
                  onReportPain: model.reportPain)
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
  /// The 3 · 2 · 1 into a free workout is a FACE of this screen, not a sheet over it: a sheet
  /// keeps the system's own close button in the header lane and its own top inset, and the count
  /// wants the whole case (design pass 2026-09-09).
  @State private var counting = false
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
    if counting {
      CardioPicker(onCardio: { gait in counting = false; onCardio(gait) }, onCancel: { counting = false })
    } else if firstTime {
      firstWorkoutFace
    } else {
      lobbyFace
    }
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
      // WT7 says "Start" where WT1 says "Begin" — the same act, named for the moment it is in.
      StageButton(title: WatchCopy.start, kind: .primary, height: 46, fontSize: 16,
                  glyph: "play.fill", seated: true, action: onBegin)
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
     *
     * ── DESIGN PASS 2026-09-09 (founder: free hand, every screen) ──────────────────────────────
     * Three things changed on this face, each from his own screenshot of it:
     *
     *  1. THE PRIMARY IS THE FLOOR. Begin floated at 44 pt over a split row of two outlines, so the
     *     one button she taps every session was the one NOT on the bottom edge, and the two she
     *     taps once a fortnight had the seat. The founder's own ruling (2026-08-05) is that the
     *     action zone reaches the bottom edge; it now reaches it with the action that matters.
     *     The pair above it shrinks to two raised capsules — visible, hittable, and quieter.
     *
     *  2. THE WEEK IS DRAWN, NOT COUNTED. The lobby already carries every workout of the week and
     *     which are done; the wrist showed none of that unless she opened the list. One row of
     *     marks — trained · queued · to come — says "day two of three" without a word, and costs
     *     one line the name and the meta were not using.
     *
     *  3. THE META LINE IS THREE RUNS. See `metaRow`.
     */
    WristScreen {
      VStack(alignment: .leading, spacing: 0) {
        TopStrip(text: WatchCopy.upNext.uppercased())
        Spacer(minLength: 2)
        VStack(alignment: .leading, spacing: 6) {
          Text(resting ? WatchCopy.recoveryTitle : lobby.workoutName)
            .font(.system(size: Fit.s(30), design: .serif)).foregroundStyle(Palette.ink0)
            .lineLimit(2).minimumScaleFactor(0.6)
          if gated {
            Text(WatchCopy.membershipNeeded).font(.system(size: 13)).foregroundStyle(Palette.ink2).lineLimit(3)
          } else if resting {
            Text(WatchCopy.recovery).font(.system(size: 13)).foregroundStyle(Palette.ink2).lineLimit(3)
          } else {
            metaRow
          }
          if !gated {
            WeekRail(workouts: lobby.workouts, currentId: lobby.workoutId)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Spacer(minLength: 2)
      }
    } actions: {
      if !resting && !gated {
        VStack(spacing: 6) {
          HStack(spacing: 6) {
            ChipButton(title: WatchCopy.another, systemImage: "arrow.left.arrow.right", tint: Palette.ink1) { showList = true }
            // Open training is never gated, and it is never asked which way (CR1's own ruling).
            ChipButton(title: WatchCopy.cardio, systemImage: "waveform.path.ecg", tint: Palette.signal) { counting = true }
          }
          StageButton(title: WatchCopy.begin, kind: .primary, height: 46, fontSize: 16,
                      glyph: "play.fill", seated: true, action: onBegin)
        }
      } else {
        // No Begin to seat, so the pair takes the floor itself — at a height a wet thumb can hit.
        HStack(spacing: 5) {
          OutlineButton(title: WatchCopy.another, systemImage: "arrow.left.arrow.right", tint: Palette.ink1,
                        border: Palette.ink0.opacity(0.22), height: 40, fontSize: 13,
                        seated: true) { showList = true }
          OutlineButton(title: WatchCopy.cardio, systemImage: "waveform.path.ecg", tint: Palette.signal,
                        border: Palette.signal.opacity(0.4), height: 40, fontSize: 13,
                        seated: true) { counting = true }
        }
      }
    }
    .sheet(isPresented: $showList) {
      ChooseOverlay(
        lobby: lobby,
        onSelect: { id in onSelect(id); showList = false }
      )
    }
  }

  /*
   * ⛔ THE META LINE IS THREE RUNS, NOT ONE STRING (founder's screenshot, 2026-09-09: "MIN 57 ·
   * תרגילים 6").
   *
   * It was built as one string — "6 LIFTS · 57 MIN" — and handed to one `Text`. A Hebrew word, two
   * numbers, a separator and a Latin unit in ONE paragraph is exactly the case the bidi algorithm
   * decides for itself, and it decided the separator went between the wrong pair and the unit went
   * first. Isolates would patch it; the honest fix is not to build the sentence at all. Each fact
   * is its own `Text` (its own paragraph, ordered internally by its own first strong character),
   * and the HStack orders the facts by the layout direction — which the phone declared, and
   * nothing here guesses.
   */
  private var metaRow: some View {
    HStack(spacing: 6) {
      if let n = lobby.lifts {
        Text(WatchCopy.lifts(n))
          .font(.system(size: 13, weight: .medium)).foregroundStyle(Palette.ink1)
      }
      if lobby.lifts != nil, lobby.durationLabel != nil {
        Circle().fill(Palette.ink2).frame(width: 3, height: 3)
      }
      if let d = lobby.durationLabel {
        Text(d)
          .font(.system(size: 13, weight: .medium)).monospacedDigit().foregroundStyle(Palette.ink1)
      }
    }
    .lineLimit(1).minimumScaleFactor(0.7)
  }
}

/// The week, as marks — one per workout in the plan, in the plan's own order. A moss bar is a
/// workout trained this week; the cream outline is the one queued; a quiet bar is still to come.
/// Three states, three FORMS (filled · outlined · dim), so it reads the same to an eye that cannot
/// tell moss from cream. Drawn from the list the lobby already carries; no new wire field.
private struct WeekRail: View {
  let workouts: [WireLobbyWorkout]
  let currentId: String?
  var body: some View {
    // One workout is not a week — a single mark would be a decoration.
    if workouts.count > 1 {
      HStack(spacing: 5) {
        ForEach(workouts, id: \.id) { w in
          mark(done: w.done == true, current: w.id == currentId)
        }
      }
      .frame(height: 7)
      .padding(.top, 3)
    }
  }
  @ViewBuilder private func mark(done: Bool, current: Bool) -> some View {
    if done {
      Capsule().fill(Palette.signal).frame(width: 16, height: 5)
    } else if current {
      Capsule().strokeBorder(Palette.ink0, lineWidth: 1.5).frame(width: 16, height: 5)
    } else {
      Capsule().fill(Palette.ink3).frame(width: 16, height: 5)
    }
  }
}

/// The quiet pair above the primary — a glyph and a word in a raised capsule. Secondary by height
/// and by ground (stage[1], no light on it), never by being harder to hit: each is half the row.
private struct ChipButton: View {
  let title: String
  let systemImage: String
  let tint: Color
  let action: () -> Void
  var body: some View {
    Button(action: { TapGate.pass(action) }) {
      HStack(spacing: 4) {
        Image(systemName: systemImage).font(.system(size: 12, weight: .semibold))
        Text(title).font(.system(size: 12, weight: .semibold))
          .lineLimit(1).minimumScaleFactor(0.7)
      }
      .frame(maxWidth: .infinity).frame(height: Fit.s(30))
      .foregroundStyle(tint)
      .background(Palette.stage1)
      .clipShape(Capsule())
      .contentShape(Capsule())
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
  /**
   * ⚠️ THE SAME FLOOR SHAPE AS `StageButton`. Three of the five action blocks END in an outline
   * button — Rest, the cardio menu, Paused — so without this the bottom-most control on those
   * screens is the one that keeps a rounded bottom corner floating over the bezel, which is the
   * exact thing the founder photographed and asked about four times.
   */
  var seated: Bool = false
  let action: () -> Void
  var body: some View {
    Button(action: { TapGate.pass(action) }) {
      HStack(spacing: 5) {
        if let systemImage { Image(systemName: systemImage).font(.system(size: 12)) }
        Text(title).font(.system(size: fontSize, weight: .semibold))
          .lineLimit(1).minimumScaleFactor(0.7)
      }
      .frame(maxWidth: .infinity).frame(height: Fit.s(height))
      .padding(.bottom, seated ? SEAT_BLEED : 0)
      .foregroundStyle(tint)
      .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(border, lineWidth: 1))
      .padding(.bottom, seated ? -SEAT_BLEED : 0)
    }
    .buttonStyle(.plain)
  }
}

/*
 * ════ CR1 · READY — WAS A SCREEN. IT IS A COUNT NOW ════
 *
 * Founder, device review 2026-08-01: *"in cardio mode, why was there a Run option and a Walk
 * option? It was just general cardio at the start — check this."* — and the two-gait picker became
 * the canonical CR1: a serif "Cardio", one line of reassurance, one "Start cardio".
 *
 * Design pass 2026-09-09 (founder: *"challenge every screen"*): a screen whose entire content is
 * ONE button is a confirmation dialog nobody asked for. She tapped "free workout" on the face
 * before it; this face asked her to say it again, and its only other line ("recorded beside your
 * lifting") was reassurance about a thing she was not worried about. Rams: less, but better.
 *
 * What replaces it is the idiom every runner already has in her thumb — Apple's own 3 · 2 · 1. It
 * does the two jobs CR1 was actually doing: it gives GPS and the heart sensor their first seconds
 * before the clock starts, and it leaves a mis-tap a whole breath to cancel — on a seated control,
 * where her thumb already is. Three soft ticks count her in; the recording's own "go" is the
 * model's beat when it starts. VoiceOver hears the act by its old name (`startCardio`).
 *
 * The gait is still not asked (it never was after 2026-08-01): the wrist records a run, and the
 * consequence stated on the record then still holds — a walk registers with HealthKit as a run.
 */
private struct CardioPicker: View {
  let onCardio: (String) -> Void
  let onCancel: () -> Void
  /// The count runs on the wall clock, not on frames: a dropped frame skips a number rather than
  /// stretching the three seconds.
  @State private var startedAt = Date()
  private static let seconds: TimeInterval = 3

  var body: some View {
    WristScreen {
      VStack(spacing: 0) {
        TopStrip(text: WatchCopy.cardio.uppercased())
        Spacer(minLength: 2)
        TimelineView(.animation) { ctx in
          let left = max(0, Self.seconds - ctx.date.timeIntervalSince(startedAt))
          // Holds "1" until the stage takes over; a "0" would be a number for nothing.
          let digit = max(1, Int(left.rounded(.up)))
          ZStack {
            Circle().stroke(Palette.stage2, lineWidth: 5)
            Circle().trim(from: 0, to: left / Self.seconds)
              .stroke(Palette.signal, style: StrokeStyle(lineWidth: 5, lineCap: .round))
              .rotationEffect(.degrees(-90))
            Text("\(digit)")
              .font(.system(size: Fit.s(56), weight: .semibold, design: .monospaced)).monospacedDigit()
              .foregroundStyle(Palette.ink0)
              .contentTransition(.numericText(countsDown: true))
          }
          .frame(width: Fit.s(104), height: Fit.s(104))
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(WatchCopy.startCardio)
          .accessibilityValue("\(digit)")
          // Three soft ticks — the rest countdown's own approach tick, so the wrist has ONE
          // vocabulary for "nearly".
          .onChange(of: digit) { _, _ in WatchHaptics.play(.restApproach) }
        }
        Spacer(minLength: 2)
      }
    } actions: {
      OutlineButton(title: WatchCopy.cancel, tint: Palette.ink1, border: Palette.ink0.opacity(0.22),
                    height: 38, fontSize: 13, seated: true, action: onCancel)
    }
    .onAppear { WatchHaptics.play(.restApproach) }
    // The recording starts on the clock, not on the last frame drawn: a wrist that dropped
    // mid-count still starts on time, and leaving the screen (cancel) cancels the task with it.
    .task {
      try? await Task.sleep(nanoseconds: UInt64(Self.seconds * 1_000_000_000))
      guard !Task.isCancelled else { return }
      onCardio("run")
    }
  }
}

/// WT1b · CHOOSE — the week's workouts under the crown, unfinished work first.
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
        let queued = w.id == lobby.workoutId && !done
        Button { TapGate.pass { onSelect(w.id) } } label: {
          /*
           * THE STATE IS A RAIL, NOT A BORDER (design pass 2026-09-09). The queued card wore a
           * 2 pt moss border on all four sides, which on a carousel is the shape of FOCUS — it
           * said "this one is under the crown", not "this one is next". A rail on the leading
           * edge is the same mark the phone's week uses, and it leaves the crown's own focus
           * ring to mean what the system means by it.
           */
          HStack(spacing: 9) {
            RoundedRectangle(cornerRadius: 1.5)
              .fill(queued ? Palette.signal : (done ? Palette.ink3 : Palette.stage2))
              .frame(width: 3, height: 30)
            VStack(alignment: .leading, spacing: 2) {
              Text(w.name).font(.system(size: 16, weight: .semibold))
                .foregroundStyle(done ? Palette.ink2 : Palette.ink0)
                .lineLimit(1).minimumScaleFactor(0.8)
              HStack(spacing: 4) {
                if done {
                  Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Palette.up)
                }
                // "6 lifts" in her language — and the muscles only when the phone named any: the
                // coach sends `muscles: ''`, so this row read "6 lifts · " with a separator to
                // nothing (2026-09-09). A DONE row says so in her word instead of a count she
                // already trained ("סיום" was the Done BUTTON's word standing in for it).
                Text(done ? WatchCopy.doneLegend : chooseMeta(w))
                  .font(.system(size: 12)).foregroundStyle(Palette.ink2).lineLimit(1)
              }
            }
            Spacer(minLength: 0)
          }
          .padding(.vertical, 2)
        }
        .disabled(done)
        .listRowBackground(
          RoundedRectangle(cornerRadius: 10)
            .fill(Palette.stage1)
            .opacity(done ? 0.5 : 1)
        )
      }
    }
    .listStyle(.carousel)
    .background(Palette.stage0)
  }

  private func chooseMeta(_ w: WireLobbyWorkout) -> String {
    let lifts = WatchCopy.lifts(w.lifts ?? 0)
    guard let muscles = w.muscles, !muscles.isEmpty else { return lifts }
    return "\(lifts) · \(muscles)"
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
  /// The crown has turned at least once in this edit — the hint under the rows has done its job.
  @State private var crownMoved = false

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
          // The header lives top-left on every screen (the wrist's second rule); the edit legend was
          // the one exception, centred on a row of its own (design pass 2026-09-09).
          TopStrip(text: WatchCopy.editSet.uppercased())
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
    /*
     * ⛔ THE WRIST COULD NOT SAY 32.5 (founder 2026-08-05): *"the watch and the phone do not show
     * the same weight — it showed me 33 kg on the watch and 32.5 on the phone."*
     *
     * `by: 1` with `w = v.rounded()`. Whole kilos only, and the comment defending it said "like the
     * rest of the app" — which was simply false: the phone's wheel has run 0.5 detents since it was
     * built, because that is the union of every real gym granularity. A 1.25 kg plate per side is a
     * 2.5 kg change and the wrist could not express it.
     *
     * ⚠️ AND IT WAS NOT ONLY A DISPLAY BUG. `w` is what Done writes, so a prescription of 32.5
     * opened, touched and confirmed on the wrist LOGGED 33 — a weight she never lifted, in the
     * record the coach reads.
     *
     * Reps stay whole, because half a rep is not a thing.
     */
    .digitalCrownRotation(
      $crown,
      from: 0, through: field == .weight ? 600 : 50,
      by: field == .weight ? 0.5 : 1, sensitivity: .low, isContinuous: false
    )
    .onChange(of: crown) { _, v in
      guard editing else { return }
      crownMoved = true
      // Snapped to the detent rather than to a whole number — `by:` sets the crown's step, and this
      // has to agree with it or the value drifts off the notches the crown is clicking through.
      if field == .weight { if !bodyweight { w = max(0, (v * 2).rounded() / 2) } } else { r = max(0, v.rounded()) }
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
        /*
         * ⛔ THE DOTS ARE DELETED (founder 2026-08-05, from his own screenshot). "QUADS · 1/4"
         * and a row of four pips beside it are the same sentence twice — and the SET ROW below
         * already says it a third time, in figures, with what she lifted in each.
         *
         * Their cost was the header wrapping to two lines on a 41 mm case, which is why "1/4" sat
         * under "QUADS" in his photograph with the pips colliding with the clock's lane.
         */
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
  /// A warm-up bridge announces itself instead of the muscle ("WARM-UP · 1/2"), so a half-weight
  /// bar can never read as a broken prescription on the wrist.
  private var setPosition: String {
    let n = mirror.setNumber ?? 1
    let m = mirror.setsInExercise ?? 1
    if mirror.isWarmup == true { return "\(WatchCopy.warmupWord.uppercased()) · \(n)/\(m)" }
    // "CHEST" on a Hebrew wrist (founder's screenshot, 2026-09-09): the group arrives as the
    // library's own muscle name, and the copy pack already carries those in her language for the
    // pain report — the same word, looked up before it is uppercased. An unmapped group stays as sent.
    let group = WatchCopy.muscle(mirror.exerciseGroup ?? "").uppercased()
    // The coach names no muscles (`muscles: ''` from Home), so this branch is the one that draws —
    // and it said "SET" in English on a Hebrew wrist (2026-09-09).
    return group.isEmpty ? "\(WatchCopy.setWord.uppercased()) \(n)/\(m)" : "\(group) · \(n)/\(m)"
  }

  /* ⛔ `setDots` is DELETED (2026-08-05) — see the note where it used to be drawn. It said the same
     thing as the position beside it and the set FIGURES below it, and it cost the header its
     second line on a 41 mm case. Removed rather than hidden: an unused view is a view someone
     re-adds. */

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
            Text(WatchCopy.kg).font(.system(size: Fit.s(15))).foregroundStyle(Palette.ink2)
            newsMark
          }
          .lineLimit(1).minimumScaleFactor(0.5)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        bandLine
        /*
         * ⛔ UNDER THE BAND, NOT UNDER THE SET ROW (founder 2026-08-05): *"in the screen you
         * yourself are showing, it says 50 a side in really tiny type — put it under the reps and
         * not under the set row, exactly like the phone, and make it bigger so it can be seen."*
         *
         * Twice mine, and the second half is the worse half: **this is the number she ACTS on.** It
         * is what she puts on the bar, and it was the smallest thing on the screen, below the row
         * of set figures, on a watch. The phone has always had it directly under the load.
         */
        if showsPerSide { perSideLine }
        if showsEquipment { equipmentLine }
        if setFiguresSpeak { setFigures }
        if firstSetOfSession { tapToEditPill }
      } else {
        Button { TapGate.pass { enterEdit(.reps) } } label: {
          HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text("\(shownReps)").font(.system(size: Fit.s(46), weight: .medium, design: .monospaced)).monospacedDigit().foregroundStyle(Palette.lift)
            Text(WatchCopy.reps).font(.system(size: Fit.s(15))).foregroundStyle(Palette.ink2)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Legend(WatchCopy.bodyweightQuiet, size: Wrist.legend)
        if setFiguresSpeak { setFigures }
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

  /*
   * THE SET ROW IS DRAWN WHEN IT HAS A FIGURE (design pass 2026-09-09). On a first set with no
   * history it read "– · · ·": a dash for the ghost it did not have and a dot for every set ahead —
   * four marks to say "I know nothing yet", under the largest number on the screen. The row's own
   * rule is that a slot speaks only when it has something to say; this applies it to the row.
   */
  private var setFiguresSpeak: Bool {
    !(mirror.setsSoFar ?? []).isEmpty || !(mirror.lastReps ?? []).isEmpty
  }

  /*
   * THE EQUIPMENT LINE FOR EVERYTHING THAT IS NOT A BARBELL (design pass 2026-09-09). The per-side
   * figure has had its row since 2026-08-05; a dumbbell lift showed "18 kg" and nothing else, and
   * 18 kg on a dumbbell press is 18 in EACH hand — the one thing she must not get wrong at the
   * rack. `setupLine` has said "per hand" / "pin 55" since item 11 and no screen drew it. Same
   * rhythm as the per-side rule: on the lift's first set, and again the moment the load moves.
   */
  private var showsEquipment: Bool {
    guard let style = mirror.loadSetup?.style, style != "barbell", style != "plate_loaded" else { return false }
    return showsPerSide
  }
  @ViewBuilder private var equipmentLine: some View {
    if let line = setupLine(mirror.loadSetup) {
      Text(line).font(.system(size: 13, weight: .medium)).foregroundStyle(Palette.ink1)
        .lineLimit(1).minimumScaleFactor(0.8)
    }
  }

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
      // 15 and 13, up from 13 and 12 — see the note at the call site. The FIGURE is mono and the
      // words beside it are sans, which is the same two-voice split every unit slot makes.
      // ⚠️ THE FIGURE AND THE UNIT ARE TWO RUNS. They were one mono string — and `WatchCopy.kg` is
      // "ק\"ג" in Hebrew, so a monospaced face with no Hebrew swapped mid-word. Same law as the
      // phone's `monoCarriesNoWords`, which had never been pointed at Swift.
      (Text(fmtW(ps)).font(.system(size: Fit.s(15), weight: .semibold, design: .monospaced)).foregroundStyle(Palette.ink0)
        + Text(" " + WatchCopy.kg).font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.ink0)
        + Text(" " + WatchCopy.aSide).font(.system(size: 13)).foregroundStyle(Palette.ink1))
        .lineLimit(1).minimumScaleFactor(0.8)
    }
  }

  /// The dashed edit hint — a hint, not a button; the tap target is the hero load above it.
  ///
  /// It read "הקש על המשקל לערי…" in the founder's screenshot: a Hebrew sentence set in the mono
  /// face (which has no Hebrew, so it fell back wider than measured), uppercased for a script with
  /// no case, and cut. Sans, at 12, allowed to shrink — a hint that cannot be read teaches nothing.
  private var tapToEditPill: some View {
    HStack(spacing: 5) {
      Image(systemName: "pencil").font(.system(size: 12)).foregroundStyle(Palette.ink2)
      Text(WatchCopy.tapWeightToEdit)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(Palette.ink2)
        .lineLimit(1).minimumScaleFactor(0.75)
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
      // A hint teaches; once the crown has turned it is a sentence she has already read, and the
      // system's own crown indicator is beside her thumb. The row keeps its height so nothing jumps.
      crownHint.opacity(crownMoved ? 0 : 1)
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
      Image(systemName: "arrow.clockwise").font(.system(size: 12, weight: .semibold))
      Text(WatchCopy.turnCrownToSet).font(.system(size: Wrist.legend, weight: .medium)).tracking(1.1)
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
    /*
     * ⛔ THE SEED WAS STILL WHOLE KILOS (code review 2026-09-09). The crown got its half-kilo detent
     * on 2026-08-05 — and the value it started FROM was still `.rounded()`, so a prescription of
     * 32.5 opened the editor reading 33, and Done wrote 33 without the crown ever moving. Snapped
     * to the same 0.5 detent the crown clicks through, so the figure she opens is the figure she
     * was given.
     */
    w = ((shownWeight ?? 0) * 2).rounded() / 2
    r = Double(shownReps)
    field = bodyweight ? .reps : f
    crown = field == .weight ? w : r
    crownMoved = false
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
      Legend(up ? WatchCopy.raisedForYou : WatchCopy.easedForYou, size: 11)
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
        Text(WatchCopy.kg).font(.system(size: Fit.s(15))).foregroundStyle(Palette.ink2)
      }
      // ONE line, always: "34 31.5 kg" on a 40 mm case is already tight and a heavy lift
      // ("112.5 107.5 kg") is tighter. It scales before it wraps.
      .lineLimit(1).minimumScaleFactor(0.5)
      /*
       * THE REASON, IN HER WORDS (design pass 2026-09-09). The beat said which way and by how much
       * and then "logged · resting" — where she is. What it never said is the one clause that
       * EARNS the change, and the wire has carried it the whole time: the reps she just did.
       * "You did 12, so I added weight." is measured fact, the wrist's own shorter half of the
       * phone's sentence (the band clause stays on the phone, which owns the band). The closer
       * keeps its line beneath, quieter — she is about to see the ring anyway.
       */
      Text(WatchCopy.corrected(c.reps, up: up))
        .font(.system(size: Fit.s(13), design: .serif)).foregroundStyle(Palette.ink1)
        .multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.8)
        .fixedSize(horizontal: false, vertical: true)
      Legend(WatchCopy.loggedResting, size: Wrist.legend)
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
  /// Where this lift sits in the workout — (done, of). The beat used to say WHAT closed and
  /// nothing about how much of the workout that was; one row of marks says "one of six" without a
  /// word, at the one moment she is looking for exactly that (design pass 2026-09-09).
  var lift: (done: Int, count: Int)? = nil
  let onTap: () -> Void
  var body: some View {
    WristScreen {
      VStack(spacing: 12) {
        Spacer(minLength: 0)
        ZStack {
          Circle().strokeBorder(Palette.signal, lineWidth: 1.6).frame(width: Fit.s(52), height: Fit.s(52))
          DrawCheck(size: Fit.s(22))
        }
        Text(WatchCopy.liftDone(name))
          .font(.system(size: Fit.s(20), design: .serif)).foregroundStyle(Palette.ink0)
          .multilineTextAlignment(.center)
          .lineLimit(2).minimumScaleFactor(0.6)
        if let lift { LiftRail(done: lift.done, count: lift.count) }
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity)
    }
    .contentShape(Rectangle())
    .onTapGesture { TapGate.pass(onTap) }
  }
}

/// The workout as marks — one per lift, filled moss up to the one just closed. The same grammar
/// as the Start screen's week rail, one level down: filled = behind her, dim = ahead.
private struct LiftRail: View {
  let done: Int
  let count: Int
  var body: some View {
    if count > 1 {
      HStack(spacing: 4) {
        ForEach(0..<count, id: \.self) { i in
          Capsule().fill(i < done ? Palette.signal : Palette.ink3).frame(width: 14, height: 4)
        }
      }
      .frame(height: 6)
    }
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
  private var note: WireCorrection? { announced ? nil : mirror.correction }

  /*
   * ⛔ READY IS MEASURED OFF THE CLOCK, NOT OFF THE FRAME (code review 2026-09-09). `restRemainingS`
   * is a snapshot the phone took when it PUBLISHED, and a phone asleep in a pocket publishes
   * nothing when the rest runs out — so the ring above reached 0:00 and said READY while the row
   * beneath it still read "Skip rest" and offered +15 s on a rest that was already over. The ring
   * has always run on the absolute end; the row runs on the same clock now, one tick a second.
   */
  private func isReady(at now: Date) -> Bool {
    if let end = WatchWire.parseDate(mirror.restEndsAt) { return end.timeIntervalSince(now) <= 0.5 }
    return (mirror.restRemainingS ?? 0) <= 0
  }

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
          diameter: Fit.s(note == nil ? 78 : 62),
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
            .font(.system(size: 12, design: .serif)).italic()
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
      TimelineView(.periodic(from: .now, by: 1)) { ctx in
        let ready = isReady(at: ctx.date)
        RestActions(ready: ready, primaryTitle: ready ? WatchCopy.startNextSet : WatchCopy.skipRest, onReady: onReady, onAdd: onAdd)
      }
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

  /// UP NEXT: the set that is coming, its load, and its lift — at a size that reads at a glance.
  ///
  /// THE NAME AND THE LOAD NO LONGER SHARE A LINE (design pass 2026-09-09, from the founder's
  /// screenshot: "Incline Dumbb…"). Side by side, the load took its 24 pt and the name got what was
  /// left, which on a 45 mm case was eleven letters. Stacked, each gets the whole width: the load
  /// first, because it is the figure she acts on; the name under it, two lines if it needs them.
  /// The legend keeps the one fact the ring cannot say — WHICH set is coming.
  private var upNextCard: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("\(WatchCopy.upNext.uppercased()) · \(mirror.nextIsWarmup == true ? WatchCopy.warmupWord : WatchCopy.setWord) \(mirror.nextSetNumber ?? ((mirror.setNumber ?? 1) + 1))/\(mirror.nextIsWarmup == true ? (mirror.nextSetsInExercise ?? 1) : (mirror.setsInExercise ?? 1))")
        .font(.system(size: Wrist.legend, weight: .medium, design: .monospaced)).tracking(0.9)
        .foregroundStyle(Palette.ink1)
        .lineLimit(1).minimumScaleFactor(0.8)
      if let wt = nextLoad {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(fmtW(wt))
            .font(.system(size: Fit.s(26), weight: .medium, design: .monospaced)).monospacedDigit()
            .foregroundStyle(Palette.signal)
          Text(WatchCopy.kg).font(.system(size: 13, weight: .medium)).foregroundStyle(Palette.signal)
        }
        .lineLimit(1)
      } else {
        Text(WatchCopy.bodyweight).font(.system(size: Fit.s(20), weight: .medium)).foregroundStyle(Palette.signal)
      }
      Text(mirror.exerciseName)
        .font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.ink0)
        .lineLimit(2).minimumScaleFactor(0.85)
        .fixedSize(horizontal: false, vertical: true)
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
  private var swaps: [WireSwapOption] { mirror.nextSwapOptions ?? [] }
  /// Off the clock, not off the frame — see `InterRestScreen.isReady`.
  private func isReady(at now: Date) -> Bool {
    if let end = WatchWire.parseDate(mirror.restEndsAt) { return end.timeIntervalSince(now) <= 0.5 }
    return (mirror.restRemainingS ?? 0) <= 0
  }
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
    /*
     * ── DESIGN PASS 2026-09-09 (founder's screenshot: the ring under the CLOCK, the header gone) ──
     * The screen overflowed its case. An 84 pt ring scales to 103 on a 45 mm case; under it a card
     * of three lines and beneath that Start plus a row — more than 242 points, and the VStack gave
     * up the top, so the ring rose into the clock's lane and the strip vanished. On a 41 mm case it
     * is worse.
     *
     * THE RING AND THE CARD SHARE A ROW NOW. A transition rest is the one rest where the clock is
     * not the whole point — she is walking to the next station — so the ring gives up its solo row
     * and stands at 62 beside the card, with its time drawn at a larger share of the diameter so
     * the figure stays readable. The card stacks the way the inter-set card does: legend, load,
     * name. Height: strip + row + actions ≈ 176 pt; it fits every case.
     *
     * (The crossing's "as written?" ask that stood in the strip and above Start for two days went
     * with the clock's presumption — founder, 2026-09-09: no set is written by time, so there is
     * never a lift behind her that only the clock stood behind.)
     */
    WristScreen {
      VStack(spacing: 0) {
        TopStrip(text: crossing, controlsHint: true)
        Spacer(minLength: 2)
        HStack(alignment: .center, spacing: 8) {
          RestRing(
            endsAt: mirror.restEndsAt,
            totalS: mirror.restTotalS ?? 120,
            diameter: Fit.s(62),
            arc: Palette.signal,
            timeScale: 0.3
          )
          nextLiftCard
        }
        if undo != nil {
          SwapUndoChip(action: onUndo).padding(.top, 5)
        }
        Spacer(minLength: 2)
      }
    } actions: {
      TimelineView(.periodic(from: .now, by: 1)) { ctx in
      let ready = isReady(at: ctx.date)
      VStack(spacing: 5) {
        StageButton(title: ready ? WatchCopy.startNextLift : WatchCopy.skipRest,
                    kind: ready ? .primary : .onstage, height: Wrist.action, fontSize: 15, action: onReady)
        HStack(spacing: 5) {
          OutlineButton(title: WatchCopy.addShort, tint: Palette.ink0,
                        border: Palette.ink0.opacity(0.22), height: 34, fontSize: 12, action: onAdd)
          if let best = swaps.first {
            OutlineButton(title: WatchCopy.swapTitle, systemImage: "arrow.left.arrow.right",
                          tint: Palette.ink1, border: Palette.ink0.opacity(0.22), height: 34, fontSize: 12,
                          seated: true) {
              onSwap(best.id)
            }
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
    // The arrow points the way the line is READ. Under a right-to-left layout "1 → 2" lays out as
    // 2 → 1 with the arrow against the reading direction; the same string `easedSwapped` already
    // turns its arrow in he.json, and the header does the same (2026-09-09).
    let arrow = WatchCopyStore.isRTL ? "←" : "→"
    return "\(WatchCopy.liftWord) \(i) \(arrow) \(min(i + 1, n))"
  }

  /// The lift that is coming, named once, with the load the phone decided for it.
  ///
  /// ⛔ "Leg Press 100…" AND "Standing Calf… 32…" (founder 2026-08-05, two screenshots): the name
  /// and the load competed for one row and SwiftUI truncated both. They are stacked now, the load
  /// first because it is the figure she acts on, the name under it on up to two lines — the same
  /// shape as the inter-set card, so the two rests read as one instrument.
  private var nextLiftCard: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("\(WatchCopy.upNext.uppercased()) · \(WatchCopy.liftWord)")
        .font(.system(size: Wrist.legend, weight: .medium, design: .monospaced)).tracking(0.9)
        .foregroundStyle(Palette.ink1)
        .lineLimit(1).minimumScaleFactor(0.8)
      HStack(alignment: .firstTextBaseline, spacing: 5) {
        if let wt = mirror.nextTargetWeight {
          Text(fmtW(wt))
            .font(.system(size: Fit.s(24), weight: .medium, design: .monospaced)).monospacedDigit()
            .foregroundStyle(Palette.signal)
          Text(WatchCopy.kg).font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.signal)
        } else {
          Text(WatchCopy.bodyweight).font(.system(size: Fit.s(18), weight: .medium)).foregroundStyle(Palette.signal)
        }
        // The direction the new lift's opening load moved, if it moved — beside the figure it
        // describes, at the type floor (founder 2026-08-04).
        if (mirror.nextLoadDeltaKg ?? 0) != 0 {
          LoadDelta(deltaKg: mirror.nextLoadDeltaKg ?? 0, fontSize: Wrist.legend)
        }
      }
      .lineLimit(1).minimumScaleFactor(0.7)
      Text(mirror.nextExerciseName ?? "")
        .font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.ink0)
        .lineLimit(2).minimumScaleFactor(0.8)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.vertical, 8).padding(.horizontal, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
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
  /// The injury door, carried through to the controls page — see `CardioPausedScreen.onReportPain`.
  var onReportPain: (String, String) -> WatchModel.PainReport = { _, _ in .queued }
  @State private var page = 1

  var body: some View {
    if let sp = split {
      KmLoggedScreen(split: sp)
    } else {
      // Two pages, the gym's gesture: stop on one side, the run in the middle. There is no glance
      // page — every figure a glance would carry is already on the stage.
      TabView(selection: $page) {
        CardioPausedScreen(paused: paused, onPage: page == 0,
                           metrics: metrics, elapsed: elapsed,
                           onPauseToggle: onPauseToggle, onEnd: onEnd,
                           onReportPain: onReportPain).tag(0)
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
          /*
           * Design pass 2026-09-09: the split at 44, with the pace legend under it instead of the
           * "/km" unit beside it — the unit read as a cipher in Hebrew, and a legend is what every
           * other figure on the wrist wears. The "LOGGED · BACK TO RUN" footer is gone: it
           * narrated the beat's own dwell, the sentence the founder's build-36 ruling removed
           * from every other screen, minus the number.
           */
          VStack(spacing: 2) {
            Text(fmtTime(split.splitS))
              .font(.system(size: Fit.s(44), weight: .semibold, design: .monospaced)).monospacedDigit()
              .foregroundStyle(Palette.signal)
              .lineLimit(1).minimumScaleFactor(0.6)
            Legend(WatchCopy.metricPace, size: Wrist.legend)
          }
          if split.quickest {
            HStack(spacing: 4) {
              Image(systemName: "checkmark").font(.system(size: 12, weight: .bold))
              Text(WatchCopy.quickestThisRun)
                .font(.system(size: 12, design: .monospaced)).tracking(0.5)
            }
            .foregroundStyle(Palette.signal)
          }
        }
        .frame(maxWidth: .infinity)
        Spacer(minLength: 4)
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
 * The progress line to the next whole kilometre stays — it is the one thing a clock cannot tell
 * her — and so does the gym's own swipe. What the design pass of 2026-09-09 (founder: free hand)
 * changed is WHICH figure is the hero, and it changed it by the rule CR4 already lives by: **a
 * poster leads with the largest true fact it has.**
 *
 *  · A run is measured in distance. The elapsed clock was the 40 pt hero and the distance a 24 pt
 *    line under a bar; a runner glances for the kilometres and the pace, and the clock third. So
 *    the distance is the hero (44 pt) with the kilometre meter drawn under it, and the elapsed
 *    clock moves to the header row — the same lane Apple's own Workout app gives it, beside the
 *    time of day, where two clocks on one row read as what they are.
 *  · UNTIL THERE IS A DISTANCE, the clock is the hero. Indoors, or before the first GPS fix,
 *    "0.00 km" as the largest mark on the screen is a screen announcing what it does not know.
 *    The clock is always known — the wrist measured it itself — so it leads, and the header says
 *    the activity's name in its place. The swap happens once, at the first metre.
 *  · Pace and heart share the second row at 26 pt, the heart with a glyph that BEATS at her
 *    measured rate — the one animation on the screen, and it is a fact. Burn is the footer.
 *  · A figure not yet measured is drawn in the superseded ink (`ink3`), not in cream: a dash that
 *    reads as data is a lie of emphasis. Three cream dashes at the top of every run were the
 *    screen the founder photographed.
 *  · Always-On: the beating glyph holds still and the pause chip hides — a dimmed screen is for
 *    reading, not for tapping. The figures themselves are not hidden: watchOS grants a live
 *    workout its 1 Hz updates in the dimmed state, and a stale second would be the wrong kind of
 *    honest.
 *
 * The controls stay off the stage (founder 2026-07-12) — the only control a runner needs in a
 * hurry should not be something to read past when she does not.
 */
private struct CardioStageScreen: View {
  @ObservedObject var metrics: LiveMetrics
  let elapsed: () -> TimeInterval
  @Environment(\.isLuminanceReduced) private var dimmed

  var body: some View {
    WristScreen {
      TimelineView(.periodic(from: .now, by: 1)) { _ in
        let km = metrics.distanceKm
        let hasDistance = (km ?? 0) > 0
        VStack(alignment: .leading, spacing: 0) {
          TopStrip(text: hasDistance ? fmtTime(elapsed()) : WatchCopy.cardio.uppercased(),
                   controlsHint: !dimmed)
          Spacer(minLength: 2)
          VStack(alignment: .leading, spacing: 7) {
            if hasDistance {
              HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(String(format: "%.2f", km ?? 0))
                  .font(.system(size: Fit.s(44), weight: .semibold, design: .monospaced)).monospacedDigit()
                  .foregroundStyle(Palette.ink0)
                  .lineLimit(1).minimumScaleFactor(0.5)
                Text(WatchCopy.metricKm)
                  .font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.ink2)
              }
            } else {
              Text(fmtTime(elapsed()))
                .font(.system(size: Fit.s(44), weight: .semibold, design: .monospaced)).monospacedDigit()
                .foregroundStyle(Palette.ink0)
                .lineLimit(1).minimumScaleFactor(0.5)
            }
            kmMeter(km ?? 0)
            HStack(alignment: .top, spacing: 8) {
              Figure(value: paceLabel, label: WatchCopy.metricPace)
              Figure(value: metrics.heartRateBpm.map { "\($0)" }, label: WatchCopy.metricHeart) {
                PulseHeart(bpm: metrics.heartRateBpm)
              }
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
              Image(systemName: "flame.fill").font(.system(size: 12, weight: .semibold))
                .foregroundStyle(metrics.activeKcal == nil ? Palette.ink3 : Palette.ink2)
              Text(metrics.activeKcal.map { "\($0)" } ?? "––")
                .font(.system(size: 15, weight: .semibold, design: .monospaced)).monospacedDigit()
                .foregroundStyle(metrics.activeKcal == nil ? Palette.ink3 : Palette.ink1)
              Legend(WatchCopy.metricKcalShort, size: Wrist.legend)
            }
          }
          Spacer(minLength: 2)
        }
      }
    }
  }

  /// The line to the next whole kilometre, and the knob standing on it.
  ///
  /// It is the one piece of a run a clock cannot tell her: how close the next split is. With no
  /// GPS fix yet the track draws empty rather than inventing a position. The distance itself is no
  /// longer printed under it — it is the hero above it now, and the bar is for the POSITION inside
  /// the kilometre, which is what a bar is for.
  private func kmMeter(_ km: Double) -> some View {
    let intoKm = km - km.rounded(.down)
    return GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(Palette.stage2).frame(height: 3)
        Capsule().fill(Palette.signal).frame(width: max(0, geo.size.width * intoKm), height: 3)
        Circle().fill(Palette.signal)
          .frame(width: 9, height: 9)
          .offset(x: max(0, min(geo.size.width - 9, geo.size.width * intoKm - 4.5)))
      }
      .frame(height: 9)
    }
    .frame(height: 9)
  }

  /// Minutes per kilometre — measured, never modelled, and nil until there is a kilometre.
  private var paceLabel: String? {
    let km = metrics.distanceKm ?? 0
    let secs = elapsed()
    guard km >= 0.05, secs > 0 else { return nil }
    return fmtTime(secs / km)
  }
}

/// A leading-aligned figure with its legend under it — the live stage's second row. `nil` is a
/// figure not yet measured, and it is drawn in the superseded ink so a dash never reads as data.
private struct Figure<Glyph: View>: View {
  let value: String?
  let label: String
  @ViewBuilder let glyph: () -> Glyph
  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(alignment: .center, spacing: 4) {
        glyph()
        Text(value ?? "––")
          .font(.system(size: Fit.s(26), weight: .semibold, design: .monospaced)).monospacedDigit()
          .foregroundStyle(value == nil ? Palette.ink3 : Palette.ink0)
          .lineLimit(1).minimumScaleFactor(0.6)
      }
      Legend(label, size: Wrist.legend)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

extension Figure where Glyph == EmptyView {
  init(value: String?, label: String) {
    self.init(value: value, label: label, glyph: { EmptyView() })
  }
}

/// The heart glyph, beating at her measured rate. One animation on the stage, and it is a
/// measurement: the period is 60 / bpm, re-derived whenever the reading changes. Still in the
/// Always-On state (nothing on a dimmed screen should move) and still — in the superseded ink —
/// until there is a reading to beat to.
private struct PulseHeart: View {
  let bpm: Int?
  @Environment(\.isLuminanceReduced) private var dimmed
  @State private var beat = false
  var body: some View {
    Image(systemName: "heart.fill")
      .font(.system(size: 13, weight: .semibold))
      .foregroundStyle(bpm == nil ? Palette.ink3 : Palette.clay)
      .scaleEffect(beat || period == nil ? 1.0 : 0.82)
      .animation(period.map { Animation.easeInOut(duration: $0).repeatForever(autoreverses: true) }, value: beat)
      .onAppear { beat = bpm != nil && !dimmed }
      .onChange(of: bpm) { _, b in beat = b != nil && !dimmed }
      .onChange(of: dimmed) { _, d in beat = bpm != nil && !d }
  }
  /// Half a beat per direction, so one full scale cycle is one heartbeat.
  private var period: Double? {
    guard !dimmed, let bpm, bpm > 0 else { return nil }
    return 30.0 / Double(bpm)
  }
}

/// The cardio pause page — the gym's own, one swipe left, and the only place a run ends.
private struct CardioPausedScreen: View {
  let paused: Bool
  var onPage: Bool = true
  /*
   * THE PAUSE PAGE SAYS WHERE THE RUN IS (design pass 2026-09-09). It drew a pause glyph in a ring
   * and the words "free workout" — a mark and a name for a page she reached by swiping, to tell her
   * what she had just done. Apple's own pause view keeps the figures on screen, and for the same
   * reason: the question at a stop is "how far, how long", and then "pause or finish". The clock
   * and the distance take the glyph's place, and the guard beneath quotes the clock as the figure
   * "saved as-is" refers to.
   */
  @ObservedObject var metrics: LiveMetrics
  let elapsed: () -> TimeInterval
  let onPauseToggle: () -> Void
  let onEnd: () -> Void
  /**
   * ⛔ THE INJURY DOOR WAS MISSING FROM CARDIO ENTIRELY (founder 2026-08-05): *"in the cardio
   * screen on the watch, the injury option does not appear."*
   *
   * It exists on the lifting Paused page and never reached this one, and the omission is backwards:
   * **a run is the likeliest place to need it.** She is a kilometre from the building, the phone is
   * strapped to her arm or left behind, and something in her knee has just changed. Reporting it
   * from the wrist mid-run is the exact scenario the durable channel was built for.
   */
  var onReportPain: (String, String) -> WatchModel.PainReport = { _, _ in .queued }
  @State private var confirmingEnd = false
  @State private var reportingPain = false
  @State private var painArea: String?
  @State private var acknowledged: (muscle: String, delivered: Bool)?

  var body: some View {
    if let ack = acknowledged {
      // The same two acknowledgements the lifting flow draws — one screen per truth, not per surface.
      if ack.delivered {
        PainAcknowledgedScreen(muscle: ack.muscle, onResume: { acknowledged = nil })
      } else {
        PainQueuedScreen(muscle: ack.muscle, onResume: { acknowledged = nil })
      }
    } else if let area = painArea {
      PainSeverityScreen(
        muscle: area,
        onPick: { severity in
          painArea = nil
          reportingPain = false
          acknowledged = (area, onReportPain(area, severity) == .delivered)
        },
        onBack: { painArea = nil }
      )
    } else if reportingPain {
      PainAreaScreen(onPick: { area in painArea = area }, onBack: { reportingPain = false })
    } else if confirmingEnd {
      EndConfirmScreen(
        title: WatchCopy.finishConfirmTitle, confirmTitle: WatchCopy.finishSave,
        fact: (value: fmtTime(elapsed()), label: WatchCopy.metricTime),
        onConfirm: onEnd, onKeep: { confirmingEnd = false }
      )
      .onChange(of: onPage) { _, on in if !on { confirmingEnd = false } }
    } else {
      WristScreen {
        VStack(alignment: .leading, spacing: 0) {
          TopStrip(text: (paused ? WatchCopy.pausedTitle : WatchCopy.cardio).uppercased())
          Spacer(minLength: 2)
          TimelineView(.periodic(from: .now, by: 1)) { _ in
            VStack(alignment: .leading, spacing: 4) {
              Text(fmtTime(elapsed()))
                .font(.system(size: Fit.s(40), weight: .semibold, design: .monospaced)).monospacedDigit()
                .foregroundStyle(paused ? Palette.ink1 : Palette.ink0)
                .lineLimit(1).minimumScaleFactor(0.5)
              HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(metrics.distanceKm.map { String(format: "%.2f", $0) } ?? "––")
                  .font(.system(size: Fit.s(20), weight: .semibold, design: .monospaced)).monospacedDigit()
                  .foregroundStyle(metrics.distanceKm == nil ? Palette.ink3 : Palette.ink1)
                Text(WatchCopy.metricKm)
                  .font(.system(size: 13, weight: .medium)).foregroundStyle(Palette.ink2)
              }
            }
          }
          Spacer(minLength: 2)
        }
      } actions: {
        // Finish only ARMS the guard (founder 2026-07-12) — the save happens behind it.
        PauseActions(
          primary: (title: paused ? WatchCopy.resume : WatchCopy.pause, action: onPauseToggle),
          endTitle: WatchCopy.finishSave,
          onEnd: { confirmingEnd = true },
          onPain: { reportingPain = true }
        )
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
     * The canonical CR4 leads with the DISTANCE, because that is what a run earned — the same
     * shape as WT6, which is the point: a run closes the way a workout closes, and neither is
     * graded.
     *
     * ⛔ THE MARK REPLACES THE MOOD (founder 2026-08-04). "That's the distance." took a whole
     * block on a 41 mm case to say what the enormous figure under it already says. The wordmark
     * costs one row and makes a screenshot of a wrist carry the product.
     *
     * Design pass 2026-09-09: the wordmark keeps its place and gives back its row. It moves into
     * the header lane — the corner every other screen spends on a legend, and the one this screen
     * left empty while spending a centred line of its own on the mark. The row it frees goes to
     * the figures: the hero to 48 pt, the three under it to 24. The seal between them is WT6's
     * own tally — counted, and filed — so the two closings share one mark, and a figure the run
     * never measured is drawn in the superseded ink rather than in cream.
     */
    WristScreen {
      VStack(alignment: .leading, spacing: 0) {
        ClockLane {
          HStack(spacing: 6) {
            RangeGlyph()
            Text("hush").font(.system(size: 15, design: .serif)).foregroundStyle(Palette.ink0)
          }
        }
        .frame(height: Wrist.head)
        Spacer(minLength: 2)
        /*
         * ⛔ THE HERO FALLS THROUGH (founder 2026-08-05, from a screenshot reading "hush / –– km /
         * TIME 0:31 / KCAL –– / /KM ––").
         *
         * ⚠️ AND IT WAS NOT LYING. That was a thirty-one-second indoor test with no GPS fix — there
         * genuinely was no distance and HealthKit had not yet reported a calorie. The screen was
         * doing the honest thing and refusing to invent one.
         *
         * It was still a bad screen, and for a reason the phone settled a day earlier: **a poster
         * leads with the largest true fact it has.** `sessionPoster` falls record → tonnes → sets
         * for exactly this, and a bodyweight session never opens on "0.0 t". A run with no distance
         * opens on its TIME, which is always known, because the watch measured it itself.
         *
         * The distance does not vanish — it drops to the row below, where a dash is a dash rather
         * than the subject of the screen.
         */
        VStack(spacing: 8) {
          if let km = summary.distanceKm, km > 0 {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
              Text(String(format: "%.2f", km))
                .font(.system(size: Fit.s(48), weight: .medium, design: .monospaced)).monospacedDigit()
                .foregroundStyle(Palette.ink0)
                .lineLimit(1).minimumScaleFactor(0.5)
              Text(WatchCopy.metricKm)
                .font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.ink2)
            }
          } else {
            Text(fmtTime(summary.elapsedS))
              .font(.system(size: Fit.s(48), weight: .medium, design: .monospaced)).monospacedDigit()
              .foregroundStyle(Palette.ink0)
              .lineLimit(1).minimumScaleFactor(0.5)
          }
          TallyMark()
          // The row carries whichever of the two did NOT take the hero, so nothing is said twice.
          HStack(spacing: 4) {
            // ⓘ Parenthesised: `??` binds LOOSER than `>`, so `a ?? 0 > 0` is `a ?? (0 > 0)`.
            if (summary.distanceKm ?? 0) > 0 {
              Metric(value: fmtTime(summary.elapsedS), label: WatchCopy.metricTime, valueSize: Fit.s(24))
            } else {
              Metric(value: summary.distanceKm.map { String(format: "%.2f", $0) } ?? "––", label: WatchCopy.metricKm, valueSize: Fit.s(24))
            }
            Metric(value: paceLabel, label: WatchCopy.metricPace, valueSize: Fit.s(24))
            Metric(value: summary.kcal.map { "\($0)" } ?? "––", label: WatchCopy.metricKcalShort, valueSize: Fit.s(24))
          }
        }
        .frame(maxWidth: .infinity)
        Spacer(minLength: 2)
      }
    } actions: {
      StageButton(title: WatchCopy.done, kind: .primary, height: Fit.s(42), fontSize: 15, seated: true, action: onDone)
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
      TopStrip(text: WatchCopy.reading.uppercased())
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
                      .font(.system(size: 12, weight: .bold))
                      .foregroundStyle(Palette.stage0)
                  }
                }
                .frame(width: 15, height: 15)
                Text(lift.name)
                  .font(.system(size: 14))
                  .foregroundStyle(Palette.ink0)
                  .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                if let best = lift.best, !best.isEmpty {
                  Text(best)
                    .font(.system(size: 13, design: .monospaced)).monospacedDigit()
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
    .padding(.horizontal, Wrist.side)
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
            .font(.system(size: Fit.s(26), design: .serif))
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
      StageButton(title: WatchCopy.done, kind: .primary, height: Fit.s(42), fontSize: 15, seated: true) {
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
        .font(.system(size: Fit.s(26), weight: .medium, design: .monospaced)).monospacedDigit()
        // A figure the session never measured stands in the superseded ink, never in cream.
        .foregroundStyle(value == "––" ? Palette.ink3 : Palette.ink0)
        .lineLimit(1).minimumScaleFactor(0.5)
      // The legend view, not a mono `Text`: "דק׳ · קק״ל · טון" were Hebrew words set in a face
      // with no Hebrew (design pass 2026-09-09).
      Legend(label, size: Wrist.legend)
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
                  // The legend view — the caption is a WORD ("workouts", "tonnes"), and a mono
                  // face has no Hebrew (design pass 2026-09-09).
                  Legend(c, size: Wrist.legend)
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
      StageButton(title: WatchCopy.done, kind: .primary, height: Fit.s(42), fontSize: 15, seated: true, action: onDone)
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
  /// The lift counter — the strip every execution page carries (nil on the standalone face).
  var lift: (i: Int, n: Int)? = nil
  /// The workout's pause-aware clock from the OS runtime. Present on the swipe-in page, where it
  /// takes the pause glyph's place — one shape for "I have stopped", the same as the run's.
  var elapsed: (() -> TimeInterval?)? = nil
  let onResume: () -> Void
  let onEnd: () -> Void
  /// How the report travelled — WT15 is a claim about what the PHONE DID, so a report that is
  /// still in the queue draws the honest acknowledgement instead (see `WatchModel.reportPain`).
  var onReportPain: (String, String) -> WatchModel.PainReport = { _, _ in .queued }
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
  /// ⚠️ The muscle reported while the phone was away — taken, not yet acted on. A different screen
  /// from WT15 because it is a different truth: nothing has happened to her programme yet.
  @State private var queuedArea: String?
  var body: some View {
    if confirmingEnd {
      EndConfirmScreen(onConfirm: onEnd, onKeep: { confirmingEnd = false })
    } else if let queued = queuedArea {
      // ⛔ THE REPORT IS SAFE AND THE PROGRAMME HAS NOT MOVED. Both facts, one screen.
      PainQueuedScreen(muscle: queued, onResume: {
        queuedArea = nil
        onResume()
      })
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
          // The flag is taken either way now; only WHICH acknowledgement she reads depends on
          // whether the phone was there to act on it.
          switch onReportPain(area, severity) {
          case .delivered: easedArea = area
          case .queued: queuedArea = area
          }
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
          TopStrip(lift: lift)
          Spacer(minLength: 2)
          VStack(spacing: 6) {
            if let elapsed {
              // The held clock, in the secondary ink — held, not running. A glyph said "paused";
              // the clock says paused AND how long the workout has run (design pass 2026-09-09).
              TimelineView(.periodic(from: .now, by: 1)) { _ in
                Text(elapsed().map { fmtTime($0) } ?? "–:––")
                  .font(.system(size: Fit.s(40), weight: .semibold, design: .monospaced)).monospacedDigit()
                  .foregroundStyle(Palette.ink1)
                  .lineLimit(1).minimumScaleFactor(0.5)
              }
            } else {
              ZStack {
                Circle().strokeBorder(Palette.ink0.opacity(0.3), lineWidth: 1.5).frame(width: Fit.s(40), height: Fit.s(40))
                Image(systemName: "pause.fill").font(.system(size: 15)).foregroundStyle(Palette.ink0)
              }
            }
            Text(WatchCopy.pausedTitle)
              .font(.system(size: Fit.s(19), design: .serif)).foregroundStyle(Palette.ink0)
          }
          .frame(maxWidth: .infinity)
          Spacer(minLength: 2)
        }
      } actions: {
        PauseActions(
          primary: armEnd == nil ? (title: WatchCopy.resume, action: onResume) : nil,
          endTitle: WatchCopy.endWorkout,
          onEnd: { if let armEnd { armEnd() } else { confirmingEnd = true } },
          onPain: { reportingPain = true }
        )
      }
    }
  }
}

private struct PainAreaScreen: View {
  let onPick: (String) -> Void
  let onBack: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // The lane every strip keeps, and a back chevron that mirrors with the layout.
      ClockLane {
        HStack(spacing: 6) {
          Button(action: { TapGate.pass(onBack) }) {
            Image(systemName: "chevron.backward").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.ink2)
              .frame(width: 24, height: Wrist.head).contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          Legend(WatchCopy.whereIsIt, size: Wrist.legend)
        }
      }
      .frame(height: Wrist.head)
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
                Image(systemName: "chevron.forward").font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.ink2)
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
    .padding(.horizontal, Wrist.side).padding(.top, 2)
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
      ClockLane {
        HStack(spacing: 6) {
          Button(action: { TapGate.pass(onBack) }) {
            Image(systemName: "chevron.backward").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.ink2)
              .frame(width: 24, height: Wrist.head).contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          Legend(WatchCopy.howSharp, size: Wrist.legend)
        }
      }
      .frame(height: Wrist.head)
      // `muscle` is the map's own name — what the wire carries. She reads hers.
      Text(WatchCopy.muscle(muscle))
        .font(.system(size: Fit.s(19), design: .serif)).foregroundStyle(Palette.ink0)
        .lineLimit(1).minimumScaleFactor(0.8)
        .padding(.top, 3)
      Spacer(minLength: 4)
      /*
       * SEVERITY IS A WEIGHT, NOT ONLY A WORD (design pass 2026-09-09). The three rows wore one
       * border; the answer they ask for is a degree, and a degree can be drawn — the border
       * thickens with the word, so the row that says "sharp" looks like the sharpest of the three
       * before it is read. Same clay throughout: pain is never a direction.
       */
      VStack(spacing: 6) {
        ForEach(Array(WatchCopy.severityChoices.enumerated()), id: \.element.id) { i, choice in
          Button { TapGate.pass { onPick(choice.value) } } label: {
            HStack {
              Text(choice.label).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink0)
                .lineLimit(1).minimumScaleFactor(0.8)
              Spacer(minLength: 4)
              Image(systemName: "chevron.forward").font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.ink2)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity).frame(height: Fit.s(44))
            .overlay(RoundedRectangle(cornerRadius: 13).strokeBorder(
              Palette.clay.opacity(0.35 + 0.2 * Double(i)), lineWidth: 1 + CGFloat(i) * 0.7
            ))
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
      Spacer(minLength: 4)
    }
    .padding(.horizontal, Wrist.side).padding(.top, 2)
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
    /*
     * ⚠️ ON THE CONTAINER NOW (2026-08-05). This laid itself out by hand — its own gutters, its
     * own foot — which is exactly how it stayed one of the four screens the action-zone floor could
     * not reach. `WristScreen` measures the button first and the body compresses into the rest;
     * that is the difference between a layout and a hope, and it is why this one clipped.
     */
    WristScreen {
      VStack(spacing: 0) {
        // "GOT IT" rode its own row under an empty strip; it is the strip's fact (design pass
        // 2026-09-09), and the sentence takes the row it frees.
        TopStrip(text: WatchCopy.gotIt.uppercased())
        Spacer(minLength: 4)
        VStack(alignment: .leading, spacing: 8) {
          Text(WatchCopy.easingToday(muscle))
            .font(.system(size: Fit.s(21), design: .serif)).foregroundStyle(Palette.ink0)
            .multilineTextAlignment(.leading).lineSpacing(1)
            .fixedSize(horizontal: false, vertical: true)
          VStack(alignment: .leading, spacing: 3) {
            Text(WatchCopy.easedSwapped).font(.system(size: 12)).foregroundStyle(Palette.ink2)
            Text(WatchCopy.easedRests).font(.system(size: 12)).foregroundStyle(Palette.ink2)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Spacer(minLength: 4)
      }
    } actions: {
      StageButton(title: WatchCopy.resume, kind: .moss, height: 40, fontSize: 14, seated: true, action: onResume)
    }
  }
}

/**
 * ⛔ WT14c · THE REPORT IS TAKEN, AND THE PROGRAMME HAS NOT MOVED (2026-08-05).
 *
 * The state that did not exist — and its absence was the founder's *"when I press it nothing
 * happens."* With the phone away, `reportPain` returned false, WT15 was correctly suppressed
 * because nothing had been eased, and she was returned to Paused having apparently done nothing.
 *
 * The fix put the report on the durable channel, which creates a third truth this screen states:
 * **it is recorded, and the coach has not answered yet.** It deliberately does NOT say a muscle
 * rests or a lift was swapped — WT15 says those, and only once the phone has acted on it.
 *
 * ⚠️ No "retry", no spinner, nothing to wait for. She is mid-workout and the delivery is the
 * system's problem, not hers.
 */
private struct PainQueuedScreen: View {
  let muscle: String
  let onResume: () -> Void
  var body: some View {
    WristScreen {
      VStack(alignment: .leading, spacing: 8) {
        TopStrip(text: WatchCopy.gotIt.uppercased())
        Spacer(minLength: 4)
        Text(WatchCopy.painNoted(muscle))
          .font(.system(size: Fit.s(21), design: .serif)).foregroundStyle(Palette.ink0)
          .multilineTextAlignment(.leading).lineSpacing(1)
          .fixedSize(horizontal: false, vertical: true)
        Text(WatchCopy.painWhenPhoneBack)
          .font(.system(size: 12)).foregroundStyle(Palette.ink2)
          .fixedSize(horizontal: false, vertical: true)
        Spacer(minLength: 4)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    } actions: {
      StageButton(title: WatchCopy.resume, kind: .moss, height: 40, fontSize: 14, seated: true, action: onResume)
    }
  }
}

// MARK: Connection Lost (the trust state — a watch-structure necessity)

struct ConnectionLostScreen: View {
  let mirror: WireMirror?
  var body: some View {
    /*
     * Design pass 2026-09-09. The screen drew the set's NAME as a ghost behind a wifi glyph and two
     * lines — and not the load. The phone is away; the one thing she may still need from the wrist
     * in the next ninety seconds is the number she was given, so the ghost carries the whole set:
     * name, load, set count, dimmed to say "as of the last frame" and no more. The status takes
     * the strip, the way every fact does, and the way out ("continue on iPhone") is the floor line.
     */
    WristScreen {
      VStack(alignment: .leading, spacing: 0) {
        ClockLane {
          HStack(spacing: 5) {
            Image(systemName: "wifi.slash").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.ink2)
            Text(WatchCopy.reconnecting.uppercased())
              .font(.system(size: Wrist.label, weight: .medium)).tracking(0.8)
              .foregroundStyle(Palette.ink1)
              .lineLimit(1).minimumScaleFactor(0.75)
          }
        }
        .frame(height: Wrist.head)
        Spacer(minLength: 2)
        if let m = mirror {
          VStack(alignment: .leading, spacing: 3) {
            Text(m.exerciseName)
              .font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink0.opacity(0.4))
              .lineLimit(2).minimumScaleFactor(0.8)
            if let wt = m.targetWeight {
              HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(fmtW(wt))
                  .font(.system(size: Fit.s(40), weight: .medium, design: .monospaced)).monospacedDigit()
                  .foregroundStyle(Palette.ink0.opacity(0.4))
                Text(WatchCopy.kg).font(.system(size: 14)).foregroundStyle(Palette.ink2.opacity(0.6))
              }
              .lineLimit(1).minimumScaleFactor(0.6)
            }
            // Composed here rather than `m.setLabel`, which is the phone's English fallback string
            // ("Set 2 of 4") — the one line on this screen that never turned Hebrew (2026-09-09).
            Text("\(WatchCopy.setWord.uppercased()) \(m.setNumber ?? 1)/\(m.setsInExercise ?? 1)")
              .font(.system(size: Wrist.legend, weight: .medium, design: .monospaced)).tracking(0.9)
              .foregroundStyle(Palette.ink2.opacity(0.6))
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        } else {
          Image(systemName: "wifi.slash").font(.system(size: Fit.s(28), weight: .semibold)).foregroundStyle(Palette.ink2)
            .frame(maxWidth: .infinity)
        }
        Spacer(minLength: 2)
        Text(WatchCopy.continueOnPhone)
          .font(.system(size: 13, weight: .medium)).foregroundStyle(Palette.ink1)
          .frame(maxWidth: .infinity)
          .lineLimit(2).minimumScaleFactor(0.8)
      }
    }
  }
}
