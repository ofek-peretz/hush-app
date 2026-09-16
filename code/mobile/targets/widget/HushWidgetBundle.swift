import SwiftUI
import WidgetKit

// Widget extension entry point. Hush ships three widgets — the strength session
// Live Activity, the cardio (Open training) Live Activity (Lock Screen + Dynamic
// Island), and — since 2026-08-23 (the world-class mandate) — the HOME-SCREEN
// Today widget (`HushTodayWidget`): her next workout and the week's dots, fed one
// finished snapshot through the App Group. Only one ACTIVITY is ever in flight
// (HushLiveActivityModule ends one kind before starting the other).
//
// Deployment target is iOS 16.2, so everything here is unconditionally available —
// no `if #available` in the bundle (which is a WidgetBundleBuilder edge case).
@main
struct HushWidgetBundle: WidgetBundle {
  var body: some Widget {
    HushStrengthLiveActivity()
    HushCardioLiveActivity()
    HushTodayWidget()
  }
}
