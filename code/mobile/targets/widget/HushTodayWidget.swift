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
    TodayEntry(date: Date(), snap: TodaySnapshot(title: "hush", sub: "", weekLabel: "", dots: [false, false, false, false], done: false))
  }
  func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
    completion(TodayEntry(date: Date(), snap: readSnapshot()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
    completion(Timeline(entries: [TodayEntry(date: Date(), snap: readSnapshot())], policy: .never))
  }
}

/// The measuring-mark glyph — the brand, tiny, exactly as the Live Activity draws it.
private struct TodayRangeMark: View {
  var width: CGFloat = 16
  var height: CGFloat = 8
  var body: some View {
    ZStack {
      Rectangle().fill(TX.accent).frame(width: width, height: 1.2)
      HStack {
        Rectangle().fill(TX.accent).frame(width: 1.2, height: height)
        Spacer(minLength: 0)
        Rectangle().fill(TX.accent).frame(width: 1.2, height: height)
      }.frame(width: width)
      Circle().fill(TX.accent).frame(width: 4, height: 4)
    }.frame(width: width, height: height)
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
        Text("hush").font(.system(size: 13, design: .serif)).foregroundColor(TX.ink1)
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
    .configurationDisplayName("Hush")
    .description("Your next workout, and the week.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
