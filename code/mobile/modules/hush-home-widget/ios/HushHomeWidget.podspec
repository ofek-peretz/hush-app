Pod::Spec.new do |s|
  s.name           = 'HushHomeWidget'
  s.version        = '1.0.0'
  s.summary        = 'Hush home-screen widget bridge — one JSON snapshot into the App Group'
  s.description    = 'A dumb pipe: writes the already-localized widget snapshot to the shared App Group and asks WidgetKit to redraw. All content decisions and every word live in JS (platform/homeWidget).'
  s.author         = 'Hush'
  s.homepage       = 'https://hushfitness.app'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/hushfitness/hush.git', :tag => s.version.to_s }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
