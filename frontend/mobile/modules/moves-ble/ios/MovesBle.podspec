Pod::Spec.new do |s|
  s.name           = 'MovesBle'
  s.version        = '1.0.0'
  s.summary        = 'BLE advertise + scan for Moves proximity'
  s.description    = 'Advertises a rotating Moves token as a service UUID and scans for others.'
  s.author         = ''
  s.homepage       = 'https://example.invalid/moves'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'CoreBluetooth'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
