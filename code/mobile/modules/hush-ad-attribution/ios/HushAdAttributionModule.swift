// ════ THE INSTALL ATTRIBUTION TOKEN (2026-09-16, the growth playbook §02) ════
//
// Apple Search Ads says which campaign brought an install through AdServices: the app asks for an
// opaque token and posts it to Apple, and Apple answers with the campaign. It needs no App Tracking
// Transparency prompt and carries no identifier of the athlete — the token is Apple's, single-use,
// and expires in 24 hours. This module only fetches it; `src/platform/adAttribution.ts` resolves it.

import AdServices
import ExpoModulesCore

public class HushAdAttributionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HushAdAttribution")

    AsyncFunction("attributionToken") { () -> String? in
      return try? AAAttribution.attributionToken()
    }
  }
}
