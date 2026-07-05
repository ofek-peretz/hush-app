import SwiftUI
import WidgetKit

// Widget extension entry point. Hush ships exactly two widgets — the strength
// session Live Activity and the cardio (Open training) Live Activity (Lock Screen
// + Dynamic Island). No home-screen widgets in v1. Only one activity is ever in
// flight (HushLiveActivityModule ends one kind before starting the other).
//
// Deployment target is iOS 16.2, so the Live Activity widgets are unconditionally
// available — no `if #available` in the bundle (which is a WidgetBundleBuilder edge case).
@main
struct HushWidgetBundle: WidgetBundle {
  var body: some Widget {
    HushStrengthLiveActivity()
    HushCardioLiveActivity()
  }
}
