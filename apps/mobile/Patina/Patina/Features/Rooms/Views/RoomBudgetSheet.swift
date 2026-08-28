//
//  RoomBudgetSheet.swift
//  Patina
//
//  M4 block 6 — `Set a budget` on the room the person made.
//
//  The figure is theirs: typed in whole dollars, stored in integer cents on
//  `RoomModel.budgetCents` and mirrored to `rooms.budget_cents`. Nothing here
//  derives, suggests or ranges a number (C5) — an unset budget shows this
//  sheet, never a `—`.
//

import SwiftUI
import SwiftData

struct RoomBudgetSheet: View {

    let room: RoomModel

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var dollars: String = ""
    @State private var isSaving = false

    /// Whole dollars as typed → integer cents. Grouping separators and a
    /// leading `$` are accepted because people type them; anything that is not
    /// a number is not a budget and writes nothing.
    static func parse(_ text: String) -> Int? {
        let cleaned = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: "")
        guard !cleaned.isEmpty, let value = Double(cleaned), value >= 0 else { return nil }
        return Int((value * 100).rounded())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Set a budget")
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text(room.name)
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
            }

            Text("What you mean to spend on this room. Only you see it.")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                Text("$")
                    .font(.custom("PlayfairDisplay-Regular", size: 20, relativeTo: .title3))
                    .foregroundStyle(PatinaColors.Text.muted)
                TextField("9,000", text: $dollars)
                    .keyboardType(.numberPad)
                    .font(.custom("PlayfairDisplay-Regular", size: 20, relativeTo: .title3))
                    .foregroundStyle(PatinaColors.Text.primary)
                    .accessibilityIdentifier("RoomBudgetSheet.Amount")
            }
            .padding(.horizontal, 14)
            .frame(height: 52)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(PatinaColors.Background.secondary)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(PatinaColors.pearl, lineWidth: 1.5)
            )

            Button(action: save) {
                Text("Save")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.inverse)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Capsule().fill(PatinaColors.Interactive.active))
            }
            .buttonStyle(.plain)
            .disabled(isSaving || Self.parse(dollars) == nil)
            .accessibilityIdentifier("RoomBudgetSheet.Save")

            if room.budgetCents != nil {
                Button(action: remove) {
                    Text("Remove this budget")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.terracotta)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .buttonStyle(.plain)
                .disabled(isSaving)
                .accessibilityIdentifier("RoomBudgetSheet.Remove")
            }

            Spacer(minLength: 0)
        }
        .padding(20)
        .background(PatinaColors.Background.primary.ignoresSafeArea())
        .onAppear {
            if let cents = room.budgetCents {
                dollars = String(cents / 100)
            }
        }
    }

    private func save() {
        guard let cents = Self.parse(dollars) else { return }
        write(cents)
    }

    private func remove() {
        write(nil)
    }

    private func write(_ cents: Int?) {
        isSaving = true
        let coordinator = RoomBudgetCoordinator(store: RoomStore(context: modelContext))
        Task { @MainActor in
            await coordinator.setBudget(room, cents: cents)
            PostHogService.shared.capture("room_budget_set", properties: [
                "has_budget": cents != nil
            ])
            isSaving = false
            dismiss()
        }
    }
}
