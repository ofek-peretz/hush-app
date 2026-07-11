import SwiftUI
import WidgetKit

// Hush watch-face complication (founder 2026-07-10) — the app's spot ON the watch
// face: circular / corner / inline / rectangular accessory families (which also
// cover the Smart Stack). Static in v1 — it is a LAUNCHER (tapping any complication
// opens the watch app); no live workout data crosses into WidgetKit yet.

struct HushEntry: TimelineEntry {
  let date: Date
}

struct HushProvider: TimelineProvider {
  func placeholder(in context: Context) -> HushEntry { HushEntry(date: .now) }
  func getSnapshot(in context: Context, completion: @escaping (HushEntry) -> Void) {
    completion(HushEntry(date: .now))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<HushEntry>) -> Void) {
    // Static launcher — one entry, never refreshed.
    completion(Timeline(entries: [HushEntry(date: .now)], policy: .never))
  }
}

struct HushComplicationView: View {
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      switch family {
      case .accessoryInline:
        // Inline slots render text only.
        Text("Hush")
      case .accessoryRectangular:
        HStack(spacing: 6) {
          Image(systemName: "dumbbell.fill").font(.system(size: 16, weight: .semibold))
          Text("Hush").font(.system(size: 15, weight: .semibold))
        }
        .widgetAccentable()
      default: // .accessoryCircular, .accessoryCorner
        Image(systemName: "dumbbell.fill")
          .font(.system(size: 17, weight: .semibold))
          .widgetAccentable()
      }
    }
    .containerBackground(for: .widget) { Color.clear }
  }
}

struct HushComplication: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "HushComplication", provider: HushProvider()) { _ in
      HushComplicationView()
    }
    .configurationDisplayName("Hush")
    .description("Open Hush from the watch face.")
    .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryInline, .accessoryRectangular])
  }
}

@main
struct HushWatchWidgetBundle: WidgetBundle {
  var body: some Widget {
    HushComplication()
  }
}
