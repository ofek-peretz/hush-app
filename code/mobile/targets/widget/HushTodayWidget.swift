import SwiftUI
import WidgetKit

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE TODAY WIDGET — her next workout, on the home screen she unlocks fifty times a day.
//
// (Founder, 2026-08-23: the world-class mandate. Deferred by name since the world-class pass —
// "home-screen Today widget (App Group + native Swift)" — and a build cycle is here.)
//
// ⛔ THE WIDGET DRAWS, IT NEVER COMPOSES. Every word arrives already localized and every figure
// already derived, in one JSON snapshot the phone writes to the App Group
// (`platform/homeWidget.ts` → HushHomeWidgetModule). A widget process cannot run the copy system,
// so the copy system runs where it lives and ships finished sentences — the exact division
// notifications use. Nothing here knows what a workout is.
//
// ⚠️ NO TRIAL, NO PAYWALL, NO COUNTDOWN ON THE HOME SCREEN. The widget is the product's face on
// her phone; a meter there would be the countdown the founder had taken off Home itself (A.14).
//
// The timeline is a single entry with `.never` — the phone reloads it explicitly
// (WidgetCenter.reloadAllTimelines) whenever the snapshot changes: boot, a completed session,
// a rebuilt week.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

private let kSuite = "group.com.hushfitness.app"
private let kKey = "hush.widget.today"

// The stage palette — duplicated from HushLiveActivityWidget's file-private enum (a Swift
// `private enum` is file-scoped, so it cannot be shared; the five constants must not drift).
private enum TX {
  static let stage = Color(red: 0.075, green: 0.071, blue: 0.063) // stage[0] #131210
  static let ink0 = Color(red: 0.945, green: 0.933, blue: 0.898) // cream[0] #f1eee5
  static let ink1 = Color(red: 0.788, green: 0.769, blue: 0.706) // #c9c4b4
  static let ink2 = Color(red: 0.545, green: 0.518, blue: 0.455) // cream[2] #8b8474
  static let accent = Color(red: 0.663, green: 0.769, blue: 0.624) // lit moss #a9c49f
}

/// The snapshot the phone writes — already localized, already derived. Unknown fields are ignored
/// and missing ones take the placeholder path, so the two sides can evolve independently.
struct TodaySnapshot: Codable {
  /// The workout's name ("Upper A"), or the done/rest sentence when the week is behind her.
  var title: String
  /// "5 תרגילים · 42 דק׳" — empty when there is nothing to add.
  var sub: String
  /// "2 מתוך 4 השבוע" — the week, as one phrase.
  var weekLabel: String
  /// One flag per workout of the week, in order — the dots. True = done.
  var dots: [Bool]
  /// The whole week is behind her — the dots row renders full-accent and the title celebrates.
  var done: Bool
}

private func readSnapshot() -> TodaySnapshot? {
  guard
    let raw = UserDefaults(suiteName: kSuite)?.string(forKey: kKey),
    let data = raw.data(using: .utf8)
  else { return nil }
  return try? JSONDecoder().decode(TodaySnapshot.self, from: data)
}

struct TodayEntry: TimelineEntry {
  let date: Date
  let snap: TodaySnapshot?
}

struct TodayProvider: TimelineProvider {
  func placeholder(in context: Context) -> TodayEntry {
    TodayEntry(date: Date(), snap: TodaySnapshot(title: "FERROX", sub: "", weekLabel: "", dots: [false, false, false, false], done: false))
  }
  func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
    completion(TodayEntry(date: Date(), snap: readSnapshot()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
    completion(Timeline(entries: [TodayEntry(date: Date(), snap: readSnapshot())], policy: .never))
  }
}

/// The measuring-mark glyph — the brand, tiny, exactly as the Live Activity draws it.
/// THE FERROX MARK (2026-09-16) — two horns whose flat middle is a bar, with a notch that cradles
/// the dot. Geometry from `brand/logo/export/ferrox-mark.svg` (box 9.5,16 · 81×59); do not redraw.
private struct FerroxHorns: Shape {
  func path(in rect: CGRect) -> Path {
    let s = min(rect.width / 81, rect.height / 59)
    let ox = rect.minX + (rect.width - 81 * s) / 2
    let oy = rect.minY + (rect.height - 59 * s) / 2
    func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: ox + (x - 9.5) * s, y: oy + (y - 16) * s) }
    var path = Path()
    path.move(to: p(62, 60))
    path.addCurve(to: p(89.5, 17), control1: p(79, 60), control2: p(88, 46))
    path.addCurve(to: p(61, 44), control1: p(82, 34), control2: p(74, 44))
    path.addLine(to: p(39, 44))
    path.addCurve(to: p(10.5, 17), control1: p(26, 44), control2: p(18, 34))
    path.addCurve(to: p(38, 60), control1: p(12, 46), control2: p(21, 60))
    path.addLine(to: p(36.584, 60))
    // the notch: over the top of a circle r 14 around the dot's centre (visually clockwise)
    path.addArc(center: p(50, 64), radius: 14 * s, startAngle: .degrees(196.6), endAngle: .degrees(343.4), clockwise: false)
    path.closeSubpath()
    return path
  }
}

private struct FerroxDot: Shape {
  func path(in rect: CGRect) -> Path {
    let s = min(rect.width / 81, rect.height / 59)
    let cx = rect.minX + (rect.width - 81 * s) / 2 + (50 - 9.5) * s
    let cy = rect.minY + (rect.height - 59 * s) / 2 + (64 - 16) * s
    return Path(ellipseIn: CGRect(x: cx - 10 * s, y: cy - 10 * s, width: 20 * s, height: 20 * s))
  }
}

private struct TodayRangeMark: View {
  var width: CGFloat = 16
  var height: CGFloat = 8
  var body: some View {
    ZStack {
      FerroxHorns().fill(TX.ink1)
      FerroxDot().fill(TX.accent)
    }
    .frame(width: width, height: width * 59 / 81)
  }
}

private struct WeekDots: View {
  let dots: [Bool]
  var body: some View {
    HStack(spacing: 5) {
      ForEach(Array(dots.enumerated()), id: \.offset) { _, on in
        Circle()
          .fill(on ? TX.accent : TX.ink0.opacity(0.16))
          .frame(width: 7, height: 7)
      }
    }
  }
}

struct HushTodayView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TodayEntry

  var body: some View {
    let snap = entry.snap
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 6) {
        TodayRangeMark()
        Text("FERROX").font(.system(size: 11, weight: .semibold)).tracking(1.4).foregroundColor(TX.ink1)
        Spacer(minLength: 0)
      }

      Spacer(minLength: 4)

      if let s = snap {
        Text(s.title)
          .font(.system(size: family == .systemSmall ? 17 : 21, weight: .semibold, design: .serif))
          .foregroundColor(TX.ink0)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
        if !s.sub.isEmpty && family != .systemSmall {
          Text(s.sub).font(.system(size: 13)).foregroundColor(TX.ink1).lineLimit(1).padding(.top, 2)
        }

        Spacer(minLength: 4)

        HStack(spacing: 8) {
          WeekDots(dots: s.dots)
          if !s.weekLabel.isEmpty {
            Text(s.weekLabel).font(.system(size: 11)).foregroundColor(TX.ink2).lineLimit(1)
          }
          Spacer(minLength: 0)
        }
      } else {
        // No snapshot yet (first install, the app not yet opened): the brand, quietly. Never an
        // invented workout and never an empty black square.
        Text("—").font(.system(size: 21, weight: .semibold, design: .serif)).foregroundColor(TX.ink2)
        Spacer(minLength: 4)
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetBackground(TX.stage)
  }
}

// containerBackground is required from iOS 17; the modifier below spans both worlds.
extension View {
  @ViewBuilder
  func widgetBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(for: .widget) { color }
    } else {
      background(color)
    }
  }
}

struct HushTodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "HushToday", provider: TodayProvider()) { entry in
      HushTodayView(entry: entry)
    }
    .configurationDisplayName("FERROX")
    .description("Your next workout, and the week.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
