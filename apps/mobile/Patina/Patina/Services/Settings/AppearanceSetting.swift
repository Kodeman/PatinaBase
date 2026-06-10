//
//  AppearanceSetting.swift
//  Patina
//
//  User-selectable appearance override (Wave 3 dark-mode adoption).
//  Persisted via @AppStorage under `patina.appearance`; PatinaApp applies
//  the resolved ColorScheme with `.preferredColorScheme(_:)` (nil = follow
//  the system appearance).
//

import SwiftUI

enum AppearanceSetting: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    /// UserDefaults key shared by the Settings picker and PatinaApp.
    static let storageKey = "patina.appearance"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "System"
        case .light:  return "Light"
        case .dark:   return "Dark"
        }
    }

    /// The scheme to force, or `nil` to follow the system appearance.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }
}
