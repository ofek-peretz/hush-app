Pod::Spec.new do |s|
  s.name           = 'HushPedometer'
  s.version        = '1.0.0'
  s.summary        = 'The live indoor distance'
  s.description    = 'Core Motion pedometer distance since an instant, for treadmill runs and walks. Answers a window; decides nothing — the tracker in JS does.'
  s.author         = 'Hush'
  s.homepage       = 'https://hushfitness.app'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/hushfitness/hush.git', :tag => s.version.to_s }
  s.static_framework = true
  s.frameworks     = 'CoreMotion'

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
