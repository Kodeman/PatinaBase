//
//  SavedNoteSheet.swift
//  Patina
//
//  One sentence about a piece, in the reader's own words (B §3).
//
//  B §10 refuses a compare surface by name — F162 and F52 both. This sheet is
//  the cheapest half of deciding and nothing else: no rating, no pros and
//  cons, no second piece to hold it against.
//

import SwiftUI

struct SavedNoteSheet: View {
    let pieceName: String
    @State private var draft: String
    let onSave: (String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @FocusState private var isFocused: Bool

    init(pieceName: String, note: String?, onSave: @escaping (String?) -> Void) {
        self.pieceName = pieceName
        self._draft = State(initialValue: note ?? "")
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text(pieceName)
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)

                TextEditor(text: $draft)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .scrollContentBackground(.hidden)
                    .padding(10)
                    .frame(minHeight: 140)
                    .background(PatinaColors.Background.secondary)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .focused($isFocused)
                    .accessibilityLabel("Your note about \(pieceName)")
                    .overlay(alignment: .topLeading) {
                        if draft.isEmpty {
                            Text("Why you saved it, what it's for, what to check.")
                                .font(PatinaTypography.bodySmall)
                                .foregroundStyle(PatinaColors.Text.muted)
                                .padding(.horizontal, 15)
                                .padding(.vertical, 18)
                                .allowsHitTesting(false)
                        }
                    }

                Spacer()
            }
            .padding(24)
            .background(PatinaColors.Background.primary)
            .navigationTitle("Note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(SavedRowMeta.note(draft))
                        dismiss()
                    }
                }
            }
            .onAppear { isFocused = true }
        }
    }
}

#Preview {
    SavedNoteSheet(pieceName: "Brass Arc Floor Lamp", note: nil) { _ in }
}
