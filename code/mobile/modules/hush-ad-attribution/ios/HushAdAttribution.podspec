Pod::Spec.new do |s|
  s.name           = 'HushAdAttribution'
  s.version        = '1.0.0'
  s.summary        = 'The install attribution token'
  s.description    = 'AdServices attribution token for Apple Search Ads. No tracking permission, no identifiers: one opaque token Apple itself resolves to a campaign.'
  s.author         = 'FERROX'
  s.homepage       = 'https://getferrox.com'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/ofek-peretz/hush-app.git', :tag => s.version.to_s }
  s.static_framework = true
  s.frameworks     = 'AdServices'

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
