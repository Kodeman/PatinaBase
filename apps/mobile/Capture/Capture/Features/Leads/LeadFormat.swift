//  LeadFormat.swift
//  Capture · Wave L (Leads)
//
//  Display-string derivation for L1/L2. `clientName`/`budgetLabel` mirror
//  existing, shipped recipes exactly (see doc comments below) so the field app
//  reads the same names/labels the designer already sees in the web portal;
//  `age`/`receivedDate`/status chip styling are this flow's own field-instrument
//  presentation (terse mono idiom, not a system RelativeDateTimeFormatter
//  string, to keep output deterministic and consistent with the app's other
//  eyebrow/mono labels).

import Foundation
import SwiftUI
import CaptureKit

enum LeadFormat {
    // MARK: - Client name (mirrors the 00221 `people_directory` view's
    // COALESCE(contact_name, homeowner.full_name, homeowner.display_name,
    // contact_email, 'New lead') exactly — contact_name wins over the profile
    // name because a designer-recorded prospect's own naming should win over a
    // possibly-unrelated homeowner profile lookup.)

    static func clientName(contactName: String?, homeownerFullName: String?,
                           homeownerDisplayName: String?, contactEmail: String?) -> String {
        [contactName, homeownerFullName, homeownerDisplayName, contactEmail]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? "New lead"
    }

    // MARK: - Budget label (label table ported verbatim from
    // apps/designer-portal/src/lib/lead-format.ts BUDGET_RANGE_LABELS; falls
    // back to the raw value for anything unmapped since `budget_range` is a
    // free TEXT column, not a DB-enforced enum).

    private static let budgetLabels: [String: String] = [
        "under_5k": "Under $5k",
        "5k_15k": "$5k – $15k",
        "15k_50k": "$15k – $50k",
        "50k_100k": "$50k – $100k",
        "over_100k": "Over $100k"
    ]

    static func budgetLabel(_ raw: String?) -> String? {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
        return budgetLabels[raw] ?? raw
    }

    // MARK: - Age (L1 row) — terse field-instrument idiom ("2d ago"), not a
    // localized RelativeDateTimeFormatter string.

    static func age(_ date: Date?, now: Date = Date()) -> String? {
        guard let date else { return nil }
        let seconds = max(0, now.timeIntervalSince(date))
        let minute = 60.0, hour = 3_600.0, day = 86_400.0, month = 30 * day, year = 365 * day
        switch seconds {
        case ..<minute: return "just now"
        case ..<hour:   return "\(Int(seconds / minute))m ago"
        case ..<day:    return "\(Int(seconds / hour))h ago"
        case ..<month:  return "\(Int(seconds / day))d ago"
        case ..<year:   return "\(Int(seconds / month))mo ago"
        default:        return "\(Int(seconds / year))yr ago"
        }
    }

    // MARK: - Received date (L2 meta row) — absolute, e.g. "Jun 13, 2026".

    static func receivedDate(_ date: Date?) -> String? {
        guard let date else { return nil }
        return CaptureDates.mediumDate(date)
    }

    // MARK: - Status chip (L1 source chip uses brass directly; this is the L2
    // status chip). `leads.status` domain (00014): new, viewed, contacted,
    // accepted, declined, expired. Tinted by pipeline meaning, not literally —
    // brass = fresh/needs a look, verdigris = moving/converted, rust = closed
    // out, inkSoft = neutral/seen. Falls back to inkSoft for any future value.

    static func statusLabel(_ raw: String) -> String {
        raw.replacingOccurrences(of: "_", with: " ").capitalized
    }

    static func statusColor(_ raw: String) -> Color {
        switch raw {
        case "new":                return CaptureColor.goldenHour
        case "viewed":              return CaptureColor.inkSoft
        case "contacted", "accepted": return CaptureColor.success
        case "declined", "expired": return CaptureColor.terracotta
        default:                   return CaptureColor.inkSoft
        }
    }
}
