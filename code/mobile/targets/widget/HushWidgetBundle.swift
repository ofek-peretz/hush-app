import SwiftUI
import WidgetKit

// Widget extension entry point. Hush ships exactly one widget: the session Live
// Activity (Lock Screen + Dynamic Island). No home-screen widgets in v1.
//
// Deployment target is iOS 16.2, so the Live Activity widget is unconditionally
// available — no `if #available` in the bundle (which is a WidgetBundleBuilder edge case).
@main
struct HushWidgetBundle: WidgetBundle {
  var body: some Widget {
    HushLiveActivityWidget()
  }
}
