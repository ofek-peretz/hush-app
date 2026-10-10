import ExpoModulesCore
import WidgetKit

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE HOME-SCREEN WIDGET'S ONLY DOOR (founder, 2026-08-23: "קח את האפליקציה לקצה בכל תחום").
//
// The widget process cannot run JS, so the phone writes ONE already-finished snapshot — every word
// localized, every figure derived — into the shared App Group, and the widget only draws it
// (`targets/widget/HushTodayWidget.swift`). The same division as notifications: copy is baked
// where the copy system lives, and the OS surface is a dumb renderer.
//
// A dumb pipe, like every native module in this repo: no content decisions here.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

public final class HushHomeWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HushHomeWidget")

    Function("setSnapshot") { (json: String) in
      let store = UserDefaults(suiteName: "group.com.hushfitness.app")
      store?.set(json, forKey: "hush.widget.today")
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
