Pod::Spec.new do |s|
  s.name           = 'HushVoiceAudio'
  s.version        = '1.0.0'
  s.summary        = 'The audio session under the voice coach'
  s.description    = 'Headset detection, the silent keep-alive loop that keeps the session clock awake in a pocket, ducking while the coach speaks, and the rest-over chime. Decides nothing — the conductor in JS does.'
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
