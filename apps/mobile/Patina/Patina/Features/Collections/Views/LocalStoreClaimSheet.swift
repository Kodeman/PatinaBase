//
//  LocalStoreClaimSheet.swift
//  Patina
//
//  SP-06. The one screen that turns the silent inheritance of a guest's rooms
//  and saves into the account's own decision.
//

import SwiftData
import SwiftUI

struct LocalStoreClaimSheet: View {
    let onKeep: () -> Void
    let onStartFresh: () -> Void

    /// A-79 (L1-E copy deck) — the title claimed "the room and the pieces"
    /// whatever was actually there; the evidence session had 0 rooms and 1
    /// piece. The counts come from the same store `LocalStoreClaim.hasGuestWork`
    /// counts, read here rather than on `LocalStoreClaim` itself, which is
    /// L1-B's file this wave.
    @Environment(\.modelContext) private var modelContext

    /// rooms only · pieces only · both. Never rendered at zero — the sheet is
    /// only presented when `LocalStoreClaim.shouldAsk` found guest work.
    static func title(rooms: Int, pieces: Int) -> String {
        let roomPhrase = "\(rooms) room\(rooms == 1 ? "" : "s")"
        let piecePhrase = "\(pieces) piece\(pieces == 1 ? "" : "s")"
        switch (rooms > 0, pieces > 0) {
        case (true, true):
            return "Keep the \(roomPhrase) and \(piecePhrase) you saved on this phone?"
        case (true, false):
            return "Keep the \(roomPhrase) you saved on this phone?"
        default:
            return "Keep the \(piecePhrase) you saved on this phone?"
        }
    }

    /// RL3A-14 — the counts are read once, not on every body evaluation. Two
    /// SwiftData `fetchCount`s ran per render of a sheet whose counts cannot
    /// change while it is up: it is a one-shot claim decision. Cached rather
    /// than deferred to `.task` alone, so the title is never blank for a frame
    /// while the sheet animates in.
    @State private var counts: (rooms: Int, pieces: Int)?

    private func readCounts() -> (rooms: Int, pieces: Int) {
        (
            rooms: (try? modelContext.fetchCount(FetchDescriptor<RoomModel>())) ?? 0,
            pieces: (try? modelContext.fetchCount(FetchDescriptor<TableItemModel>())) ?? 0
        )
    }

    private var title: String {
        let resolved = counts ?? readCounts()
        return Self.title(rooms: resolved.rooms, pieces: resolved.pieces)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 40)
                .task {
                    guard counts == nil else { return }
                    counts = readCounts()
                }

            Text("They were saved before you signed in. Keep them and they become yours; start fresh and this phone keeps nothing from before.")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)

            Spacer(minLength: 24)

            Button(action: onKeep) {
                Text("Keep them")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.inverse)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(PatinaColors.Interactive.active)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("LocalStoreClaim.Keep")

            Button(action: onStartFresh) {
                Text("Start fresh")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
            .padding(.bottom, 28)
            .accessibilityIdentifier("LocalStoreClaim.StartFresh")
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.primary)
        .presentationDetents([.height(320)])
        // Dismissing without choosing is the safe answer, and the sheet's
        // binding treats it as "Keep them" — nothing is destroyed by walking
        // away from this question.
        .interactiveDismissDisabled(false)
    }
}

#Preview {
    LocalStoreClaimSheet(onKeep: {}, onStartFresh: {})
}
