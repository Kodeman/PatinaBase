#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Generates apps/mobile/Capture/Capture.xcodeproj from the source tree.
# Re-runnable: it scans the folders for *.swift (and fonts) and rebuilds the
# project, so teams add files and re-run this rather than hand-editing pbxproj.
# Targets: CaptureKit (framework), CaptureKitMocks (framework), Capture (app).
#
#   ruby scripts/generate_project.rb
#
$LOAD_PATH.unshift(*Dir[File.join(Dir.home, '.gem', 'ruby', '*', 'gems', '*', 'lib')])
require 'fileutils'
require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
PROJECT_PATH = File.join(ROOT, 'Capture.xcodeproj')
DEPLOYMENT = '18.0'

# Remove any prior project so generation is deterministic.
FileUtils.rm_rf(PROJECT_PATH)
project = Xcodeproj::Project.new(PROJECT_PATH, false, 77)

def swift_files(dir)
  Dir.glob(File.join(dir, '**', '*.swift')).sort
end

# ── Targets ───────────────────────────────────────────────────────────────
kit   = project.new_target(:framework,   'CaptureKit',      :ios, DEPLOYMENT)
mocks = project.new_target(:framework,   'CaptureKitMocks', :ios, DEPLOYMENT)
app   = project.new_target(:application, 'Capture',         :ios, DEPLOYMENT)

# ── Common build settings ──────────────────────────────────────────────────
def common!(config)
  s = config.build_settings
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['SDKROOT'] = 'iphoneos'
  s['SUPPORTED_PLATFORMS'] = 'iphoneos iphonesimulator'
  s['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['ENABLE_USER_SCRIPT_SANDBOXING'] = 'YES'
  s['ENABLE_TESTABILITY'] = config.name == 'Debug' ? 'YES' : 'NO'
end

def framework!(target, project, name)
  target.build_configurations.each do |c|
    common!(c)
    s = c.build_settings
    s['DEFINES_MODULE'] = 'YES'
    s['PRODUCT_NAME'] = name
    s['PRODUCT_BUNDLE_IDENTIFIER'] = "cloud.patina.field.#{name.downcase}"
    s['GENERATE_INFOPLIST_FILE'] = 'YES'
    s['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'NO'
    s['SKIP_INSTALL'] = 'YES'
    s['CURRENT_PROJECT_VERSION'] = '1'
    s['MARKETING_VERSION'] = '0.1'
  end
end

framework!(kit, project, 'CaptureKit')
framework!(mocks, project, 'CaptureKitMocks')

app.build_configurations.each do |c|
  common!(c)
  s = c.build_settings
  s['PRODUCT_NAME'] = 'Capture'
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'cloud.patina.field'
  s['GENERATE_INFOPLIST_FILE'] = 'YES'
  # Partial plist merged into the generated one — currently just the URL scheme
  # (Xcode merges GENERATE_INFOPLIST_FILE keys into this physical file's keys).
  s['INFOPLIST_FILE'] = 'Capture/Info.plist'
  s['CODE_SIGN_ENTITLEMENTS'] = 'Capture/Capture.entitlements'
  s['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  s['CURRENT_PROJECT_VERSION'] = '1'
  s['MARKETING_VERSION'] = '0.1'
  s['INFOPLIST_KEY_CFBundleDisplayName'] = 'Patina Field'
  s['INFOPLIST_KEY_UILaunchScreen_Generation'] = 'YES'
  s['INFOPLIST_KEY_UIApplicationSceneManifest_Generation'] = 'YES'
  s['INFOPLIST_KEY_UISupportedInterfaceOrientations'] = 'UIInterfaceOrientationPortrait'
  # Just-in-time permission usage strings (Phase 0 sets all).
  s['INFOPLIST_KEY_NSCameraUsageDescription'] =
    'Patina Field uses the camera to photograph products and read their labels, barcodes, and dimensions.'
  s['INFOPLIST_KEY_NSMicrophoneUsageDescription'] =
    'Used to record a quick voice note about a piece.'
  s['INFOPLIST_KEY_NSSpeechRecognitionUsageDescription'] =
    'Transcribes your voice notes on-device.'
  s['INFOPLIST_KEY_NSPhotoLibraryAddUsageDescription'] =
    'Saves captures to your photo library.'
  s['INFOPLIST_KEY_NSPhotoLibraryUsageDescription'] =
    'Import existing photos into a capture when the camera is unavailable.'
  s['INFOPLIST_KEY_NSLocationWhenInUseUsageDescription'] =
    'Stamps each capture with the venue where you found it.'
  s['INFOPLIST_KEY_NSMotionUsageDescription'] =
    'Shows a level guide for square, steady captures.'
  s['INFOPLIST_KEY_NSFaceIDUsageDescription'] =
    'Unlock Patina Field with Face ID.'
end

# ── Source groups (one synced-style group per target source root) ───────────
def add_sources(project, target, group_name, abs_dir, exclude: [])
  group = project.main_group.new_group(group_name, abs_dir)
  refs = []
  swift_files(abs_dir).each do |path|
    next if exclude.any? { |e| path.end_with?(e) }
    refs << group.new_file(path)
  end
  target.add_file_references(refs)
  group
end

add_sources(project, kit,   'CaptureKit',      File.join(ROOT, 'CaptureKit', 'CaptureKit'))
add_sources(project, mocks, 'CaptureKitMocks', File.join(ROOT, 'CaptureKitMocks'))
app_group = add_sources(project, app, 'Capture', File.join(ROOT, 'Capture'),
                         exclude: ['Secrets.example.swift'])

# Non-Swift app files the glob above doesn't see: the URL-scheme partial
# Info.plist and entitlements (referenced only via build settings, no build
# phase needed) and the app-icon asset catalog (needs the Resources phase so
# actool compiles it).
app_group.new_file(File.join(ROOT, 'Capture', 'Info.plist'))
app_group.new_file(File.join(ROOT, 'Capture', 'Capture.entitlements'))
assets_ref = app_group.new_file(File.join(ROOT, 'Capture', 'Assets.xcassets'))
app.add_resources([assets_ref])

# Unit tests (logic tests linking CaptureKit; no app host).
tests = project.new_target(:unit_test_bundle, 'CaptureTests', :ios, DEPLOYMENT)
tests.build_configurations.each do |c|
  common!(c)
  c.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'cloud.patina.field.tests'
  c.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
end
add_sources(project, tests, 'CaptureTests', File.join(ROOT, 'CaptureTests'))

# Font resources → CaptureKit resources build phase.
fonts_dir = File.join(ROOT, 'CaptureKit', 'CaptureKit', 'Resources', 'Fonts')
font_refs = Dir.glob(File.join(fonts_dir, '*.ttf')).sort.map do |p|
  project.main_group.new_file(p)
end
kit.add_resources(font_refs) unless font_refs.empty?

# ── Dependencies + linking + embedding ──────────────────────────────────────
mocks.add_dependency(kit)
app.add_dependency(kit)
app.add_dependency(mocks)
tests.add_dependency(kit)

mocks.frameworks_build_phase.add_file_reference(kit.product_reference)
app.frameworks_build_phase.add_file_reference(kit.product_reference)
app.frameworks_build_phase.add_file_reference(mocks.product_reference)
tests.frameworks_build_phase.add_file_reference(kit.product_reference)

embed = app.new_copy_files_build_phase('Embed Frameworks')
embed.symbol_dst_subfolder_spec = :frameworks
[kit, mocks].each do |fw|
  bf = embed.add_file_reference(fw.product_reference)
  bf.settings = { 'ATTRIBUTES' => %w[CodeSignOnCopy RemoveHeadersOnCopy] }
end

# ── Remote SPM packages (APP TARGET ONLY) ───────────────────────────────────
# Architecture rule: feature teams import CaptureKit only; SDK use is app-side.
# CaptureKit / CaptureKitMocks / CaptureTests must NOT link these. supabase-swift
# powers real auth/session/persistence (Phase 1a); posthog-ios is linked now and
# consumed in Phase 1b (analytics).
def link_remote_package(project, target, url:, minimum_version:, product:)
  ref = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
  ref.repositoryURL = url
  ref.requirement = { 'kind' => 'upToNextMajorVersion', 'minimumVersion' => minimum_version }
  project.root_object.package_references << ref

  dep = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
  dep.package = ref
  dep.product_name = product
  target.package_product_dependencies << dep

  build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
  build_file.product_ref = dep
  target.frameworks_build_phase.files << build_file
  ref
end

link_remote_package(project, app,
                    url: 'https://github.com/supabase/supabase-swift',
                    minimum_version: '2.40.0', product: 'Supabase')
link_remote_package(project, app,
                    url: 'https://github.com/PostHog/posthog-ios.git',
                    minimum_version: '3.48.0', product: 'PostHog')

# Deterministic UUIDs so re-running this script on an unchanged source tree
# leaves `git status` clean instead of rewriting every object identifier.
# Called twice: pass 1 assigns content-derived UUIDs, but PBXContainerItemProxy
# hashes partly off the *pre-fixup* remoteGlobalIDString it's still holding, so
# its own new UUID isn't yet reproducible; pass 1 also rewrites that string to
# the now-stable target UUID via fixup_uuid_references. Pass 2 re-hashes with
# that already-stable value in place, so the proxy/dependency objects settle
# too. (Everything else is idempotent across the extra call.)
project.predictabilize_uuids
project.predictabilize_uuids

# Shared schemes so `xcodebuild -scheme …` works deterministically.
project.save

app_scheme = Xcodeproj::XCScheme.new
app_scheme.add_build_target(app)
app_scheme.set_launch_target(app)
app_scheme.add_test_target(tests)
app_scheme.save_as(PROJECT_PATH, 'Capture', true)

kit_scheme = Xcodeproj::XCScheme.new
kit_scheme.add_build_target(kit)
kit_scheme.add_test_target(tests)
kit_scheme.save_as(PROJECT_PATH, 'CaptureKit', true)

puts "Generated #{PROJECT_PATH}"
puts "  CaptureKit:      #{swift_files(File.join(ROOT, 'CaptureKit')).size} files"
puts "  CaptureKitMocks: #{swift_files(File.join(ROOT, 'CaptureKitMocks')).size} files"
puts "  Capture(app):    #{swift_files(File.join(ROOT, 'Capture')).size} files"
