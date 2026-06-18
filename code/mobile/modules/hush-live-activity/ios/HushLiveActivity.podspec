Pod::Spec.new do |s|
  s.name           = 'HushLiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Hush session Live Activity (ActivityKit) controller'
  s.description    = 'Starts / updates / ends the Hush session Live Activity from JS, driven by the canonical SessionMirror. Read-only; the phone owns the workout lifecycle.'
  s.author         = 'Hush'
  s.homepage       = 'https://hushfitness.app'
  s.license        = { :type => 'MIT' }
  # Match the app's baseline (expo-modules-core = iOS 15.1). ActivityKit (16.1+) is
  # weak-linked and gated by `#available(iOS 16.2, *)` in the Swift, so the pod must
  # NOT demand 16.2 — that would conflict with the 15.1 app target during pod install.
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/hushfitness/hush.git', :tag => s.version.to_s }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
