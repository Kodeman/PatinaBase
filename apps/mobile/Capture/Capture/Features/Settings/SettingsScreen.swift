//  SettingsScreen.swift
//  Capture · Team F (System Surface)
//
//  T1 · Settings (route `.settings`, id `t1Settings`). The real T1 — replaces the
//  _Template placeholder. Per-designer dials that tune capture: default project &
//  save, units, Action Button rebind, capture haptics, multi-shot hold sensitivity,
//  and large-photos Wi-Fi behaviour. Preferences persist to the App Group defaults
//  (CapturePrefs) so the capture flow (S1/S3/N3) reads the same keys.

import SwiftUI
import UIKit
import CaptureKit

/// Shared preference store + keys + typed option enums. Lives in the App Group
/// suite so other capture surfaces can read the same dials.
enum CapturePrefs {
    static let store: UserDefaults = UserDefaults(suiteName: CaptureStore.appGroupID) ?? .standard

    enum Key {
        static let defaultProject  = "pref.defaultProject"
        static let defaultSave     = "pref.defaultSave"
        static let units           = "pref.units"
        static let captureHaptics  = "pref.captureHaptics"
        static let multiShotHold   = "pref.multiShotHold"
        static let largePhotos     = "pref.largePhotos"
    }

    enum DefaultSave: String, CaseIterable {
        case ask, library, inbox
        var label: String {
            switch self {
            case .ask: return "Ask each time"
            case .library: return "Library"
            case .inbox: return "Inbox"
            }
        }
    }
    enum Units: String, CaseIterable {
        case inches, centimeters
        var label: String { self == .inches ? "Inches" : "Centimetres" }
    }
    enum Haptics: String, CaseIterable {
        case off, standard, strong
        var label: String {
            switch self {
            case .off: return "Off"
            case .standard: return "On"
            case .strong: return "Strong"
            }
        }
    }
    enum LargePhotos: String, CaseIterable {
        case wifi, immediate
        var label: String { self == .wifi ? "Sync on Wi-Fi" : "Sync immediately" }
    }
    static let holdOptions: [Double] = [0.3, 0.4, 0.6]
}

struct SettingsScreen: View {
    let store: CaptureStore
    let analytics: any CaptureAnalytics

    @Environment(\.openURL) private var openURL

    @AppStorage(CapturePrefs.Key.defaultProject, store: CapturePrefs.store) private var defaultProject = ""
    @AppStorage(CapturePrefs.Key.defaultSave, store: CapturePrefs.store) private var defaultSaveRaw = CapturePrefs.DefaultSave.ask.rawValue
    @AppStorage(CapturePrefs.Key.units, store: CapturePrefs.store) private var unitsRaw = CapturePrefs.Units.inches.rawValue
    @AppStorage(CapturePrefs.Key.captureHaptics, store: CapturePrefs.store) private var hapticsRaw = CapturePrefs.Haptics.standard.rawValue
    @AppStorage(CapturePrefs.Key.multiShotHold, store: CapturePrefs.store) private var multiShotHold = 0.4
    @AppStorage(CapturePrefs.Key.largePhotos, store: CapturePrefs.store) private var largePhotosRaw = CapturePrefs.LargePhotos.wifi.rawValue

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                section("Capture") {
                    projectRow
                    divider
                    menuRow("Default save", current: defaultSaveLabel) {
                        Picker("Default save", selection: $defaultSaveRaw) {
                            ForEach(CapturePrefs.DefaultSave.allCases, id: \.self) { Text($0.label).tag($0.rawValue) }
                        }
                    }
                    divider
                    menuRow("Units", current: unitsLabel) {
                        Picker("Units", selection: $unitsRaw) {
                            ForEach(CapturePrefs.Units.allCases, id: \.self) { Text($0.label).tag($0.rawValue) }
                        }
                    }
                }

                section("Hardware & feel") {
                    actionButtonRow
                    divider
                    menuRow("Capture haptics", current: hapticsLabel) {
                        Picker("Capture haptics", selection: $hapticsRaw) {
                            ForEach(CapturePrefs.Haptics.allCases, id: \.self) { Text($0.label).tag($0.rawValue) }
                        }
                    }
                    divider
                    menuRow("Multi-shot hold", current: "\(holdString)s") {
                        Picker("Multi-shot hold", selection: $multiShotHold) {
                            ForEach(CapturePrefs.holdOptions, id: \.self) { Text("\(format($0))s").tag($0) }
                        }
                    }
                }

                section("Sync") {
                    menuRow("Large photos", current: largePhotosLabel) {
                        Picker("Large photos", selection: $largePhotosRaw) {
                            ForEach(CapturePrefs.LargePhotos.allCases, id: \.self) { Text($0.label).tag($0.rawValue) }
                        }
                    }
                }

                Text("Privacy controls — camera, microphone, location — live in iOS Settings.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .padding(.horizontal, 4)
            }
            .padding(20)
        }
        .background(CaptureColor.paper)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.large)
        .task { analytics.screen(CaptureScreenID.t1Settings.rawValue) }
        .accessibilityIdentifier(CaptureScreenID.t1Settings.rawValue)
    }

    // MARK: rows

    private var projectRow: some View {
        rowChrome("Default project") {
            Menu {
                Picker("Default project", selection: $defaultProject) {
                    Text("Not set").tag("")
                    ForEach(projectOptions(), id: \.self) { Text($0).tag($0) }
                }
            } label: {
                valueLabel(defaultProject.isEmpty ? "Not set" : defaultProject)
            }
        }
    }

    private var actionButtonRow: some View {
        rowChrome("Action Button") {
            HStack(spacing: 10) {
                Text("Capture")
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink)
                Button("Rebind") {
                    analytics.event("settings.action_button_rebind")
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
                .font(CaptureType.callout.weight(.semibold))
                .foregroundStyle(CaptureColor.verdigris)
            }
        }
    }

    private func menuRow<P: View>(_ title: String, current: String, @ViewBuilder picker: () -> P) -> some View {
        rowChrome(title) {
            Menu { picker() } label: { valueLabel(current) }
        }
    }

    // MARK: chrome

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.verdigrisInk)
                .padding(.leading, 4)
            VStack(spacing: 0) { content() }
                .background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
        }
    }

    private func rowChrome<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(title)
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            Spacer(minLength: 12)
            content()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 15)
    }

    private var divider: some View {
        Rectangle().fill(CaptureColor.line).frame(height: 1).padding(.leading, 16)
    }

    private func valueLabel(_ text: String) -> some View {
        HStack(spacing: 4) {
            Text(text).font(CaptureType.body).foregroundStyle(CaptureColor.ink)
            Image(systemName: "chevron.down").font(.caption2).foregroundStyle(CaptureColor.inkSoft)
        }
    }

    // MARK: derived

    private func projectOptions() -> [String] {
        let names = store.search(SpecimenQuery()).compactMap { $0.venue?.projectName }
        var set = Array(Set(names)).sorted()
        if !defaultProject.isEmpty && !set.contains(defaultProject) { set.insert(defaultProject, at: 0) }
        return set
    }
    private func format(_ d: Double) -> String { String(format: "%.1f", d) }
    private var holdString: String { format(multiShotHold) }
    private var defaultSaveLabel: String { (CapturePrefs.DefaultSave(rawValue: defaultSaveRaw) ?? .ask).label }
    private var unitsLabel: String { (CapturePrefs.Units(rawValue: unitsRaw) ?? .inches).label }
    private var hapticsLabel: String { (CapturePrefs.Haptics(rawValue: hapticsRaw) ?? .standard).label }
    private var largePhotosLabel: String { (CapturePrefs.LargePhotos(rawValue: largePhotosRaw) ?? .wifi).label }
}

#if DEBUG
import CaptureKitMocks

#Preview {
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    let s = store.newDraft()
    s.title = "Lounge chair"
    s.venue = VenueStamp(projectName: "Walbridge Res.")
    let s2 = store.newDraft()
    s2.venue = VenueStamp(projectName: "Market Pull")

    return NavigationStack {
        SettingsScreen(store: store, analytics: MockCaptureAnalytics())
    }
}
#endif
