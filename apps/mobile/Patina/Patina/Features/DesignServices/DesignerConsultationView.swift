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
                .padding(.top, 56)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PatinaColors.Background.dark)

                // A1-14: a hard-coded "Matched Designer" card sat here — a
                // gradient circle, a name nothing resolves, and a promise the
                // screen cannot keep. The hero above says what this is; the
                // door below is the only act.
                // Door into the request flow
                PatinaButton("Start a request", style: .primary) {
                    coordinator.presentDesignServices(roomId: nil)
                }
                .padding(.horizontal, 24)
                .padding(.top, 32)
                .companionBottomClearance()
            }
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome. `.dark` style: light chevron
        // on a translucent dark pill, matching the hero band this overlays.
        .patinaScreen(title: nil, style: .dark)
    }

}

#Preview {
    DesignerConsultationView()
}
