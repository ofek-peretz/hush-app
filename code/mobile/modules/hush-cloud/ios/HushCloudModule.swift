import ExpoModulesCore

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE ACCOUNT IS HER APPLE ID (founder, 2026-08-23: "קח את כל המוצר שלי לרמת הקצה").
//
// Hush is 100% on-device by ruling, and a paid product whose record lives on one phone is not a
// paid product. The classic answer is an account server — infrastructure, passwords, a login
// screen, a monthly bill, a breach surface. The Apple-native answer is iCloud: the athlete's
// record rides her Apple ID, restores on a new phone with no sign-in screen at all, and costs
// nothing to run. This module is that seam, and like every native module in this repo it is a
// DUMB PIPE: what a record IS lives in `domain/record`; what the trial ledger MEANS lives in
// `domain/trialLedger`; this file moves bytes.
//
// Two instruments, deliberately different:
//  · THE RECORD FILE → the iCloud Drive ubiquity container (Documents/). Megabytes-scale, synced
//    by the OS, downloadable on a fresh install. `readRecord` returning nil can mean "not synced
//    down YET" — it asks iCloud to start the download and the JS side retries; nil is never
//    proof of absence.
//  · THE TRIAL LEDGER → NSUbiquitousKeyValueStore. Kilobytes-scale, per-Apple-ID, survives app
//    deletion AND a new device — which is exactly the surface the Keychain cannot cover (see
//    domain/trialLedger: the Keychain turns the free loop into a device wipe; the KV store turns
//    it into a new Apple ID). Writes are monotonic ON THE JS SIDE (nextLedger); this pipe does
//    not re-derive that rule.
//
// ⚠️ `url(forUbiquityContainerIdentifier:)` can block on first call — every function that touches
// the container is an AsyncFunction, which Expo Modules runs off the main thread.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

public final class HushCloudModule: Module {
  private func containerDocs() -> URL? {
    guard let base = FileManager.default.url(forUbiquityContainerIdentifier: nil) else { return nil }
    return base.appendingPathComponent("Documents", isDirectory: true)
  }

  public func definition() -> ModuleDefinition {
    Name("HushCloud")

    // Is an iCloud identity present at all? (Signed out of iCloud / iCloud Drive off → false.)
    // Cheap and synchronous by design — callers gate their UI lines on it.
    Function("available") { () -> Bool in
      FileManager.default.ubiquityIdentityToken != nil
    }

    AsyncFunction("writeRecord") { (json: String) -> Bool in
      guard let docs = self.containerDocs() else { return false }
      do {
        try FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
        let url = docs.appendingPathComponent("hush-record.json")
        guard let data = json.data(using: .utf8) else { return false }
        try data.write(to: url, options: .atomic)
        return true
      } catch {
        return false
      }
    }

    AsyncFunction("readRecord") { () -> String? in
      guard let docs = self.containerDocs() else { return nil }
      let url = docs.appendingPathComponent("hush-record.json")
      let fm = FileManager.default
      if !fm.fileExists(atPath: url.path) {
        // A fresh install: the file may exist in the CLOUD and not on this device yet — iCloud
        // materialises container files lazily. Ask for it and answer "not yet"; the JS boot
        // retries. (An undownloaded item lives as a hidden ".name.icloud" placeholder, so the
        // plain-path existence check is the right one.)
        try? fm.startDownloadingUbiquitousItem(at: url)
        return nil
      }
      return try? String(contentsOf: url, encoding: .utf8)
    }

    // ── The trial ledger's cloud half. Numbers only — the pipe carries no meaning. ──

    Function("kvGetNumber") { (key: String) -> Double? in
      let store = NSUbiquitousKeyValueStore.default
      store.synchronize()
      // `double(forKey:)` returns 0 for a missing key — indistinguishable from a stored zero, and
      // 0-vs-nil is a distinction `trialUsed` treats identically, but the honest answer is nil.
      guard store.object(forKey: key) != nil else { return nil }
      return store.double(forKey: key)
    }

    Function("kvSetNumber") { (key: String, value: Double) in
      let store = NSUbiquitousKeyValueStore.default
      store.set(value, forKey: key)
      store.synchronize()
    }
  }
}
