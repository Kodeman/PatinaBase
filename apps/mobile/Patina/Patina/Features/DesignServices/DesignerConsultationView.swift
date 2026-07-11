//
//  DesignerConsultationView.swift
//  Patina
//
//  Slimmed to a single door into the design-request flow. The full request
//  UI (scan picker, details, upload, submit) lives in `DesignRequestFlowView`,
//  presented via the `.designServices` sheet — this screen is just the hero +
//  "Start a request" entry when reached as a standalone nav destination.
//

import SwiftUI

struct DesignerConsultationView: View {
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                // Hero
                VStack(alignment: .leading, spacing: 8) {
                    Text("Work with a designer")
                        .font(PatinaTypography.h2)
                        .foregroundStyle(PatinaColors.offWhite)

                    Text("Send your room scans to a Patina designer. They'll reach out to help bring your space to life — and your scans stay on your phone until you choose to share them.")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.pearl)
                        .lineSpacing(4)
                }
                .padding(24)
                .padding(.top, 40)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PatinaColors.Background.dark)

                // Designer card
                designerCard
                    .padding(.horizontal, 24)
                    .padding(.top, 28)

                // Door into the request flow
                PatinaButton("Start a request", style: .primary) {
                    coordinator.presentedSheet = .designServices(roomId: nil, preselectedScanIds: [])
                }
                .padding(.horizontal, 24)
                .padding(.top, 32)
                .padding(.bottom, 120)
            }
        }
        .background(PatinaColors.Background.primary)
        .toolbarTitleDisplayMode(.inline)
    }

    private var designerCard: some View {
        HStack(spacing: 16) {
            Circle()
                .fill(PatinaGradients.earth)
                .frame(width: 60, height: 60)

            VStack(alignment: .leading, spacing: 4) {
                Text("Matched Designer")
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)

                MonoLabel(text: "Based on your style profile")

                Text("We'll pair you with a designer who understands your aesthetic")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .lineSpacing(2)
            }
        }
        .padding(20)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

#Preview {
    DesignerConsultationView()
}
