//  RecognitionSupport.swift
//  Capture
//
//  Shared chrome for the Flow-3 enrich-in-place sheets (N1–N5): the paper card,
//  the scanner viewport stand-in, the two-button action bar, and the button
//  styles. All colours/fonts come from CaptureColor/CaptureType tokens.

import SwiftUI
import CaptureKit

// MARK: - Specimen image loading

enum RecognitionImageLoader {
    /// The still recognition works from: the specimen's primary photo if it has
    /// one, otherwise a fresh frame off the camera seam (mocked in CP0/previews).
    @MainActor
    static func captureImage(for specimen: Specimen,
                             store: CaptureStore,
                             camera: any CameraService) async -> CaptureImage {
        if let photo = specimen.primaryPhoto {
            let url = store.mediaURL(for: photo.filename)
            if let data = try? Data(contentsOf: url), !data.isEmpty {
                return CaptureImage(data: data, width: photo.width, height: photo.height)
            }
        }
        if let frame = try? await camera.capture() {
            return CaptureImage(data: frame.data, width: frame.width, height: frame.height)
        }
        return CaptureImage(data: Data(), width: 0, height: 0)
    }
}

// MARK: - Sheet header

struct RecognitionHeader: View {
    let eyebrow: String
    let title: String
    var onClose: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(eyebrow)
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    // clayDeep(light)/clay(dark): AA on the cream sheet in light
                    // mode; goldenHour was sub-AA (R28/R33 text classification).
                    .foregroundStyle(CaptureColor.verdigrisInk)
                Text(title)
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.ink)
            }
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .padding(8)
                    .background(Circle().fill(CaptureColor.paper2))
            }
            .accessibilityLabel("Close")
        }
    }
}

// MARK: - Scanner viewport stand-in

/// The "look through the lens" region at the top of N1/N2/N3. The live camera is
/// owned by the CameraService behind this sheet; this is the reticle + prompt the
/// recognition modes draw over it, plus the simulator placeholder.
struct RecognitionViewport: View {
    let prompt: String
    var tint: Color = CaptureColor.goldenHour
    var isActive: Bool = true

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18)
                .fill(CaptureColor.ink)
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(tint.opacity(isActive ? 0.9 : 0.4),
                              style: StrokeStyle(lineWidth: 2, dash: isActive ? [] : [6, 4]))
                .padding(20)
            VStack(spacing: 10) {
                Image(systemName: "viewfinder")
                    .font(CaptureType.display)
                    .foregroundStyle(tint.opacity(0.9))
                Text(prompt)
                    .font(CaptureType.monoBody)
                    .foregroundStyle(CaptureColor.paper)
                    .multilineTextAlignment(.center)
            }
            .padding()
        }
        .frame(height: 220)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        // The viewport mimics a camera window — deliberately dark; pin light
        // so ink/paper keep their designed values under system dark mode.
        .environment(\.colorScheme, .light)
    }
}

// MARK: - Result card

struct RecognitionCard<Content: View>: View {
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }
}

/// A read-only recognised value with its ✓ and provenance badge (the "locked in"
/// look from the N1/N2 mocks). Tap to correct via the supplied action.
struct RecognisedValueRow: View {
    let label: String
    let value: String
    var source: ProvenanceSource = .ocr
    var onTap: (() -> Void)?

    var body: some View {
        Button { onTap?() } label: {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(label)
                            .font(CaptureType.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(CaptureColor.inkSoft)
                        ProvenanceBadge(source)
                    }
                    Text(value.isEmpty ? "—" : value)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(value.isEmpty ? CaptureColor.inkSoft : CaptureColor.verdigrisInk)
                }
                Spacer()
                Image(systemName: "checkmark")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.verdigris)
            }
            .padding(.vertical, 8)
            .overlay(alignment: .bottom) { Rectangle().fill(CaptureColor.line).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(onTap == nil)
    }
}

// MARK: - Action bar + button styles

struct RecognitionActionBar: View {
    let secondaryTitle: String
    let primaryTitle: String
    var primaryEnabled: Bool = true
    var secondaryRole: ButtonRole? = nil
    var onSecondary: () -> Void
    var onPrimary: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(role: secondaryRole, action: onSecondary) {
                Text(secondaryTitle).frame(maxWidth: .infinity)
            }
            .buttonStyle(RecognitionGhostButtonStyle())
            Button(action: onPrimary) {
                Text(primaryTitle).frame(maxWidth: .infinity)
            }
            .buttonStyle(RecognitionPrimaryButtonStyle())
            .disabled(!primaryEnabled)
            .opacity(primaryEnabled ? 1 : 0.5)
        }
    }
}

struct RecognitionPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(CaptureType.bodyEmph)
            .foregroundStyle(CaptureColor.paper3)
            .padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: 12)
                .fill(CaptureColor.verdigris.opacity(configuration.isPressed ? 0.8 : 1)))
    }
}

struct RecognitionGhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(CaptureType.body)
            .foregroundStyle(CaptureColor.ink2)
            .padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: 12)
                .fill(CaptureColor.paper2.opacity(configuration.isPressed ? 0.6 : 1)))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(CaptureColor.line2, lineWidth: 1))
    }
}

// MARK: - Layout shell

/// Common padded VStack used by every N-sheet body.
struct RecognitionSheetLayout<Content: View>: View {
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) { content }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(CaptureColor.paper.ignoresSafeArea())
    }
}
