Pod::Spec.new do |s|
  s.name           = 'HushWatchConnectivity'
  s.version        = '1.0.0'
  s.summary        = 'Hush phone↔watch WCSession transport'
  s.description    = 'Phone-side WatchConnectivity transport. Forwards the canonical session envelope to the watch and surfaces watch intents to JS. A dumb pipe — all authority/validation lives in the JS WatchSession bridge.'
  s.author         = 'Hush'
  s.homepage       = 'https://hushfitness.app'
  s.license        = { :type => 'MIT' }
  # Match the app's baseline (expo-modules-core = iOS 15.1). WatchConnectivity is
  # available since iOS 9, so no higher target is needed.
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/hushfitness/hush.git', :tag => s.version.to_s }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
