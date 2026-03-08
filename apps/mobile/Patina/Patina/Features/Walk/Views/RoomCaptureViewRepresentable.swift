//
//  RoomCaptureViewRepresentable.swift
//  Patina
//
//  SwiftUI wrapper for Apple's RoomCaptureView.
//  Provides AR room scanning interface for the Walk feature.
//

import SwiftUI
import RoomPlan

/// SwiftUI wrapper for RoomCaptureView
struct RoomCaptureViewRepresentable: UIViewRepresentable {

    @ObservedObject var captureService: RoomCaptureService

    func makeUIView(context: Context) -> RoomCaptureView {
        let view = captureService.getRoomCaptureView()
        // Don't set backgroundColor - let RoomPlan show its camera feed
        // Don't modify translatesAutoresizingMaskIntoConstraints - SwiftUI handles sizing
        return view
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {
        // RoomCaptureView manages its own session internally
        // No additional updates needed
    }
}

// MARK: - Availability Check View

/// View that checks RoomPlan availability and shows appropriate content
struct RoomPlanAvailabilityView<Content: View, Fallback: View>: View {

    let content: () -> Content
    let fallback: () -> Fallback

    init(
        @ViewBuilder content: @escaping () -> Content,
        @ViewBuilder fallback: @escaping () -> Fallback
    ) {
        self.content = content
        self.fallback = fallback
    }

    var body: some View {
        if RoomCaptureService.isSupported {
            content()
        } else {
            fallback()
        }
    }
}

// MARK: - Unsupported Device View

struct RoomPlanUnsupportedView: View {
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: PatinaSpacing.xl) {
            Image(systemName: "camera.viewfinder")
                .font(.system(size: 48, weight: .light))
                .foregroundColor(PatinaColors.Text.muted)

            VStack(spacing: PatinaSpacing.md) {
                Text("Room Scanning Not Available")
                    .font(PatinaTypography.h2)
                    .foregroundColor(PatinaColors.Text.primary)

                Text("Your device doesn't support room scanning. You can still explore Patina and see what pieces might work for your space.")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, PatinaSpacing.xl)

            Button(action: onContinue) {
                Text("Continue")
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(PatinaColors.offWhite)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PatinaSpacing.md)
                    .background(PatinaColors.clayBeige)
                    .cornerRadius(PatinaRadius.lg)
            }
            .padding(.horizontal, PatinaSpacing.xl)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PatinaColors.Background.primary)
    }
}

// MARK: - Preview

#Preview("Room Capture View") {
    RoomCaptureViewRepresentable(captureService: RoomCaptureService())
}

#Preview("Unsupported Device") {
    RoomPlanUnsupportedView {
        print("Continue")
    }
}
