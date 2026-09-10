import SwiftUI
import WidgetKit

// Hush watch-face complication (founder 2026-07-10) — the app's spot ON the watch
// face: circular / corner / inline / rectangular accessory families (which also
// cover the Smart Stack). Tapping any of them opens the watch app.
//
// ════ DESIGN PASS 2026-09-09 — THE FACE SAYS WHAT THE HOME SCREEN SAYS ════
//
// It was a launcher: a dumbbell and the word "Hush", one entry, never refreshed. The
// founder's brief for the wrist asks for complications that carry the product, and the
// product's first fact is on the Home screen already — WHAT IS NEXT, and HOW FAR INTO
// THE WEEK she is. Both are drawn here, in the Home screen's own grammar:
//
//   · rectangular (Smart Stack): the "up next" legend, the workout name in the serif,
//     and the week rail (moss = trained · outline = queued · dim = to come).
//   · circular: the week as a capacity gauge, the count of trained workouts at centre.
//   · corner: the range mark, with the week rail as the corner's curved label.
//   · inline: "UP NEXT · Upper B" — text is all an inline slot renders.
//
// THE DATA IS A SNAPSHOT THE WATCH APP WRITES, never a wire of its own. The app already
// holds the lobby (the phone publishes it, and a plan survives on disk for the
// phone-absent case); on every lobby it writes `WristFaceSnapshot` into the shared
// App Group container and asks WidgetKit to reload. This extension reads that file and
// nothing else — no HealthKit, no WatchConnectivity, no copy runtime. The strings ride
// in the snapshot, resolved by the phone for her language and gender, so the face
// speaks Hebrew exactly when the app does.
//
// NOTHING LIVE DURING A WORKOUT, DELIBERATELY. A complication that showed the running
// set would need a reload per set, and WidgetKit budgets reloads per day; a face that
// is right for the first five sets and stale for the rest is worse than one that says
// what is next. During a session the snapshot simply keeps saying which workout — which
// is true.
//
// With no snapshot (no App Group provisioned, or the app never ran) every family
// degrades to the launcher it always was.

// MARK: The snapshot (mirror of WatchStore.WristFaceSnapshot — two targets, one shape)

struct WristFaceSnapshot: Codable {
  /// Schema, bumped when the SHAPE changes.
  var v: Int
  /// The queued workout's name — or the recovery title on a resting week.
  var workoutName: String
  /// "Up next", in her language (the Home screen's legend).
  var legend: String
  /// Workouts in the plan, and how many of them are trained this week.
  var weekCount: Int
  var weekDone: Int
  /// Position of the queued workout in the plan (0-based), for the rail's outline mark.
  var queuedIndex: Int?
  /// The plan is resting this week — no rail, the recovery word as the name.
  var resting: Bool
  /// Lay the face right-to-left, as the phone reported for the app.
  var rtl: Bool
  var updatedAt: Double
}

enum WristFace {
  static let suite = "group.com.hushfitness.app"
  static let file = "wrist-face.json"

  /// The last snapshot the watch app wrote, or nil (no container, nothing written yet).
  static func load() -> WristFaceSnapshot? {
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: suite) else { return nil }
    guard let data = try? Data(contentsOf: dir.appendingPathComponent(file)) else { return nil }
    return try? JSONDecoder().decode(WristFaceSnapshot.self, from: data)
  }
}

// MARK: Palette (the wrist's own stage tokens — the face is the app, smaller)

private enum FacePalette {
  static let ink0 = Color(red: 0.945, green: 0.933, blue: 0.898) // cream #f1eee5
  static let ink1 = Color(red: 0.659, green: 0.635, blue: 0.565) // #a8a290
  static let ink2 = Color(red: 0.545, green: 0.518, blue: 0.455) // #8b8474
  static let ink3 = Color(red: 0.341, green: 0.325, blue: 0.290) // #57534a
  static let signal = Color(red: 0.663, green: 0.769, blue: 0.624) // moss #a9c49f
}

// MARK: Timeline

struct HushEntry: TimelineEntry {
  let date: Date
  let face: WristFaceSnapshot?
}

struct HushProvider: TimelineProvider {
  func placeholder(in context: Context) -> HushEntry {
    HushEntry(date: .now, face: WristFaceSnapshot(
      v: 1, workoutName: "Upper A", legend: "Up next", weekCount: 3, weekDone: 1,
      queuedIndex: 1, resting: false, rtl: false, updatedAt: Date().timeIntervalSince1970
    ))
  }
  func getSnapshot(in context: Context, completion: @escaping (HushEntry) -> Void) {
    completion(HushEntry(date: .now, face: context.isPreview ? placeholder(in: context).face : WristFace.load()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<HushEntry>) -> Void) {
    // One entry; the watch app asks for a reload whenever the lobby changes. Nothing here
    // predicts a future the phone has not published.
    completion(Timeline(entries: [HushEntry(date: .now, face: WristFace.load())], policy: .never))
  }
}

// MARK: Marks

/// The brand's range mark — a rule between two end ticks — at complication scale.
private struct RangeMark: View {
  var width: CGFloat = 18
  var body: some View {
    ZStack {
      Rectangle().fill(FacePalette.ink0).frame(width: width, height: 1.4)
      HStack {
        Rectangle().fill(FacePalette.ink0).frame(width: 1.4, height: width * 0.45)
        Spacer()
        Rectangle().fill(FacePalette.ink0).frame(width: 1.4, height: width * 0.45)
      }
      .frame(width: width)
    }
    .frame(width: width, height: width * 0.45)
    .widgetAccentable()
  }
}

/// The Home screen's week rail, one mark per workout: trained · queued (outline) · to come.
private struct WeekRailMark: View {
  let count: Int
  let done: Int
  let queued: Int?
  var body: some View {
    HStack(spacing: 3) {
      ForEach(0..<max(count, 1), id: \.self) { i in
        if i < done {
          Capsule().fill(FacePalette.signal).frame(width: 12, height: 4)
        } else if i == queued {
          Capsule().strokeBorder(FacePalette.ink0, lineWidth: 1.2).frame(width: 12, height: 4)
        } else {
          Capsule().fill(FacePalette.ink3).frame(width: 12, height: 4)
        }
      }
    }
  }
}

// MARK: The families

struct HushComplicationView: View {
  @Environment(\.widgetFamily) private var family
  let entry: HushEntry

  var body: some View {
    Group {
      if let face = entry.face {
        faces(face)
          .environment(\.layoutDirection, face.rtl ? .rightToLeft : .leftToRight)
      } else {
        launcher
      }
    }
    .containerBackground(for: .widget) { Color.clear }
  }

  /// The launcher — what every family was, and what it still is with nothing to say.
  @ViewBuilder private var launcher: some View {
    switch family {
    case .accessoryInline:
      Text("hush")
    case .accessoryRectangular:
      HStack(spacing: 6) {
        RangeMark()
        Text("hush").font(.system(size: 15, design: .serif))
      }
    default:
      RangeMark(width: 22)
    }
  }

  @ViewBuilder private func faces(_ f: WristFaceSnapshot) -> some View {
    switch family {
    case .accessoryInline:
      // Text only, and the slot is narrow: the legend and the name, nothing else.
      Text("\(f.legend.uppercased()) · \(f.workoutName)")

    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 2) {
        Text(f.legend.uppercased())
          .font(.system(size: 11, weight: .medium)).tracking(0.8)
          .foregroundStyle(FacePalette.ink2)
        Text(f.workoutName)
          .font(.system(size: 17, design: .serif))
          .foregroundStyle(FacePalette.ink0)
          .lineLimit(1).minimumScaleFactor(0.7)
        if !f.resting && f.weekCount > 1 {
          WeekRailMark(count: f.weekCount, done: f.weekDone, queued: f.queuedIndex)
            .padding(.top, 1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .widgetAccentable()

    case .accessoryCorner:
      // The mark in the corner, the week along its curve.
      RangeMark(width: 22)
        .widgetLabel {
          if f.resting || f.weekCount < 2 {
            Text(f.workoutName)
          } else {
            Gauge(value: Double(f.weekDone), in: 0...Double(max(f.weekCount, 1))) { EmptyView() }
              .tint(FacePalette.signal)
          }
        }

    default: // .accessoryCircular
      if f.resting || f.weekCount < 2 {
        ZStack {
          Circle().strokeBorder(FacePalette.ink3, lineWidth: 3)
          RangeMark(width: 20)
        }
      } else {
        // The week as capacity: how much of it is trained, and the count at the centre.
        Gauge(value: Double(f.weekDone), in: 0...Double(max(f.weekCount, 1))) {
          RangeMark(width: 14)
        } currentValueLabel: {
          Text("\(f.weekDone)")
            .font(.system(size: 18, weight: .semibold, design: .monospaced)).monospacedDigit()
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .tint(FacePalette.signal)
      }
    }
  }
}

struct HushComplication: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "HushComplication", provider: HushProvider()) { entry in
      HushComplicationView(entry: entry)
    }
    .configurationDisplayName("Hush")
    .description("What is next, and how far into the week you are.")
    .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryInline, .accessoryRectangular])
  }
}

@main
struct HushWatchWidgetBundle: WidgetBundle {
  var body: some Widget {
    HushComplication()
  }
}
