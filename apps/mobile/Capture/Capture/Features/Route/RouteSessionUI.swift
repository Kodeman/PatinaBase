//  RouteSessionUI.swift
//  Capture
//
//  Shared building blocks for Team E's Route (S1–S5) and Session (V1–V3) screens:
//  the paper/ink button kit, sheet header, field shells, status chips, and the
//  small formatters that turn a Specimen into showroom-readable copy. Tokens only
//  (CaptureColor / CaptureType) — no raw hex or system fonts.

import Foundation
import SwiftUI
import CaptureKit
import PatinaDesignKit

// MARK: - Buttons

enum RouteButtonKind {
    case primary    // clay fill (the keep/commit move)
    case secondary  // outline
    case ghost      // text-only
    case danger     // error fill (a cull / inbox-deferral)
}

/// The shared Route/Session action button. B.2: it now delegates to
/// PatinaDesignKit's `PatinaButton` — every S1–S5 / V1–V3 call site adopts the
/// design-system button (canonical capsule, offWhite label on the clay/error
/// fills, so it stays legible in dark mode where the old paper3 label went
/// dark-on-clay) without touching a single call site. The kind→style map:
/// primary→clay, secondary→secondary, ghost→ghost, danger→destructive.
struct RouteActionButton: View {
    let title: String
    var systemImage: String?
    var kind: RouteButtonKind = .primary
    var isLoading: Bool = false
    let action: () -> Void

    init(_ title: String, systemImage: String? = nil, kind: RouteButtonKind = .primary,
         isLoading: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.kind = kind
        self.isLoading = isLoading
        self.action = action
    }

    var body: some View {
        PatinaButton(title, style: style,
                     icon: systemImage.map { Image(systemName: $0) },
                     isLoading: isLoading, action: action)
    }

    private var style: PatinaButtonStyle {
        switch kind {
        case .primary: return .clay
        case .secondary: return .secondary
        case .ghost: return .ghost
        case .danger: return .destructive
        }
    }
}

// MARK: - Sheet header

struct RouteSheetHeader: View {
    var eyebrow: String?
    let title: String
    var subtitle: String?
    var onClose: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    if let eyebrow {
                        Text(eyebrow)
                            .font(CaptureType.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                    Text(title)
                        .font(CaptureType.title)
                        .foregroundStyle(CaptureColor.ink)
                }
                Spacer(minLength: 12)
                if let onClose {
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.inkSoft)
                            .padding(6)
                    }
                    .accessibilityLabel("Close")
                }
            }
            if let subtitle {
                Text(subtitle)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Field shell (a labelled, underlined slot)

struct RouteFieldShell<Content: View>: View {
    let label: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            content()
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            Rectangle().fill(CaptureColor.line).frame(height: 1)
        }
    }
}

// MARK: - Card surface

private struct RouteCardModifier: ViewModifier {
    var tint: Color?
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tint ?? CaptureColor.paper)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }
}

extension View {
    func routeCard(tint: Color? = nil) -> some View { modifier(RouteCardModifier(tint: tint)) }
}

// MARK: - Session status

enum RouteRowKind {
    case ready, inbox, guess

    var label: String {
        switch self {
        case .ready: return "ready"
        case .inbox: return "held"
        case .guess: return "guess"
        }
    }
    var color: Color {
        switch self {
        case .ready: return CaptureColor.success   // value / trustworthy
        case .inbox: return CaptureColor.warning        // a decision deferred
        case .guess: return CaptureColor.terracotta         // friction / needs a look
        }
    }
}

struct RouteStatusChip: View {
    let kind: RouteRowKind
    var body: some View {
        Text(kind.label)
            .font(CaptureType.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(kind.color)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .overlay(
                Capsule().stroke(kind.color.opacity(0.45), lineWidth: 1)
            )
            .accessibilityLabel("Status: \(kind.label)")
    }
}

// MARK: - Formatters / derivations over a Specimen

enum RouteFormat {
    static func status(for specimen: Specimen) -> RouteRowKind {
        if specimen.hasUnconfirmedGuess { return .guess }
        if specimen.destination == .inbox { return .inbox }
        return .ready
    }

    /// A short "how it was read" descriptor for the session tray (e.g. "4 PHOTOS").
    static func descriptor(for specimen: Specimen) -> String {
        if !specimen.measurements.isEmpty { return "measured" }
        if !specimen.scannedCodes.isEmpty { return "scanned" }
        if specimen.provenance(for: .maker) == .ocr || specimen.provenance(for: .sku) == .ocr {
            return "tag read"
        }
        if specimen.voiceTranscript?.isEmpty == false { return "voice note" }
        let count = specimen.photos.count
        if count == 0 { return "photo" }
        return count == 1 ? "1 photo" : "\(count) photos"
    }

    static func time(_ date: Date) -> String {
        CaptureDates.time(date)
    }

    static func displayPrice(_ cents: Int?) -> String? {
        guard let cents else { return nil }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = cents % 100 == 0 ? 0 : 2
        return formatter.string(from: NSNumber(value: Double(cents) / 100.0))
    }

    /// An editable dollar string for V3's price field ("3120" / "3120.50").
    static func editablePrice(_ cents: Int?) -> String {
        guard let cents else { return "" }
        if cents % 100 == 0 { return String(cents / 100) }
        return String(format: "%.2f", Double(cents) / 100.0)
    }

    /// Dollars typed into a field → cents for storage.
    static func centsFromEditable(_ text: String) -> Int? {
        let digits = text.filter { $0.isNumber || $0 == "." }
        guard !digits.isEmpty, let dollars = Double(digits) else { return nil }
        return Int((dollars * 100).rounded())
    }

    static func dimensions(_ measurements: [CaptureMeasurement]) -> String? {
        guard !measurements.isEmpty else { return nil }
        func value(_ axis: MeasurementAxis) -> Double? {
            measurements.first { $0.axisRaw == axis.rawValue }?.millimeters
        }
        let ordered = [MeasurementAxis.width, .height, .depth].compactMap(value)
        let values = ordered.isEmpty ? measurements.map(\.millimeters) : ordered
        guard !values.isEmpty else { return nil }
        return values.map(inches).joined(separator: " × ") + " in"
    }

    static func dimensionsSource(_ measurements: [CaptureMeasurement]) -> ProvenanceSource {
        measurements.contains { $0.sourceRaw == MeasureSource.arkit.rawValue } ? .measure : .manual
    }

    private static func inches(_ millimeters: Double) -> String {
        let value = millimeters / 25.4
        let half = (value * 2).rounded() / 2
        if half == half.rounded() { return String(Int(half)) }
        return String(format: "%.1f", half)
    }
}

// MARK: - Not-found fallback (a routed/specimen id that no longer resolves)

struct RouteMissingSpecimen: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "questionmark.square.dashed")
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.inkSoft)
            Text("This capture is no longer here")
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.ink)
            Text("It may have already been routed.")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
        .background(CaptureColor.paper3)
    }
}

#if DEBUG
@MainActor
enum RoutePreviewData {
    struct Demo {
        let store: CaptureStore
        let specimen: Specimen
    }

    /// A seeded in-memory store + a flagship specimen plus a couple of siblings so
    /// the session tray / cull deck render with real content in previews.
    static func make() -> Demo {
        // swiftlint:disable:next force_try
        let store = try! CaptureStore.inMemory()
        let venue = VenueStamp(
            projectName: "Walbridge Res.",
            room: "Living Room",
            shelf: "Seating · maybe",
            placemarkName: "High Point · Showroom 214"
        )
        let visitID = CaptureSessionContextStore.shared.current(
            identity: CaptureSessionIdentity(
                userID: "00000000-0000-0000-0000-000000000001",
                workspaceID: "00000000-0000-0000-0000-0000000000aa")
        ).visitID

        let chair = store.newDraft(sessionID: visitID)
        chair.title = "Lounge chair"
        chair.category = .seating
        chair.setValue("Holloway & Co.", for: .maker, source: .ocr)
        chair.setValue("LQ-3S-OAK", for: .sku, source: .ocr)
        chair.setValue("312000", for: .price, source: .ocr)
        chair.setValue("Oak / bouclé", for: .material, source: .smartGuess)
        chair.setConfidence(0.6, for: .material)
        chair.addMeasurement(axis: .width, millimeters: 800, source: .arkit)
        chair.addMeasurement(axis: .height, millimeters: 762, source: .arkit)
        chair.addMeasurement(axis: .depth, millimeters: 864, source: .arkit)
        chair.voiceTranscript = "rep is Dana, the warmer bouclé"
        chair.voiceDurationSeconds = 6
        chair.venue = venue

        let lamp = store.newDraft(sessionID: visitID)
        lamp.title = "Brass lamp"
        lamp.setValue("Brass lamp", for: .title, source: .manual)
        lamp.setValue("Soane", for: .maker, source: .ocr)
        lamp.destination = .inbox
        lamp.venue = venue

        let table = store.newDraft(sessionID: visitID)
        table.title = "Side table"
        table.scannedCodes = ["gtin:0012345678905"]
        table.status = .ready
        table.venue = venue

        try? store.save()
        return Demo(store: store, specimen: chair)
    }
}
#endif
