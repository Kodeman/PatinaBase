//
//  LocalStoreRecoveryNotice.swift
//  Patina
//
//  The one-time screen behind which the app starts a store over.
//
//  It exists so the recovery in `PersistenceController` is not silent. A
//  person whose rooms and saved pieces vanished between launches is owed the
//  sentence; without it the app has quietly deleted their work and let them
//  find out.
//

import SwiftUI

struct LocalStoreRecoveryNotice: View {

    let onDismiss: () -> Void

    static let title = "We had to start this phone's copy over"
    static let body = """
        Something went wrong with the copy of your home kept on this phone, \
        and we couldn't read it. Anything saved to your account is still \
        there and will come back as you go. Rooms you scanned on this phone \
        and never sent are gone.
        """

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer(minLength: 0)

            MonoLabel(text: "THIS PHONE", size: PatinaTypography.monoMedium)
                .foregroundStyle(PatinaColors.Text.secondary)

            Text(Self.title)
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)

            Text(Self.body)
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            PatinaButton("Continue", style: .primary, action: onDismiss)
                .accessibilityIdentifier("LocalStoreRecoveryNotice.Continue")
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(PatinaColors.Background.primary.ignoresSafeArea())
        .accessibilityIdentifier("LocalStoreRecoveryNotice")
    }
}

// MARK: - Presentation

private struct LocalStoreRecoveryNoticeModifier: ViewModifier {
    @State private var recovery = LocalStoreRecovery.shared

    func body(content: Content) -> some View {
        content.fullScreenCover(isPresented: Binding(
            get: { recovery.pending != nil },
            set: { if !$0 { recovery.acknowledge() } }
        )) {
            LocalStoreRecoveryNotice { recovery.acknowledge() }
        }
    }
}

extension View {
    /// Presents the start-over notice once, over whatever the app root is
    /// showing, when this launch had to recover the local store.
    func localStoreRecoveryNotice() -> some View {
        modifier(LocalStoreRecoveryNoticeModifier())
    }
}

#Preview {
    LocalStoreRecoveryNotice(onDismiss: {})
}
