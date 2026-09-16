Pod::Spec.new do |s|
  s.name           = 'HushCloud'
  s.version        = '1.0.0'
  s.summary        = 'Hush iCloud seam — the record file in the ubiquity container, the trial ledger in the KV store'
  s.description    = 'The account IS the Apple ID (founder, 2026-08-23). A dumb pipe: writes/reads the athlete record file in the iCloud Drive container and a monotonic number in NSUbiquitousKeyValueStore. All record semantics live in JS (domain/record); all trial arithmetic in domain/trialLedger.'
  s.author         = 'Hush'
  s.homepage       = 'https://hushfitness.app'
  s.license        = { :type => 'MIT' }
  # Match the app's baseline (expo-modules-core = iOS 15.1); both APIs are far older.
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/hushfitness/hush.git', :tag => s.version.to_s }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
