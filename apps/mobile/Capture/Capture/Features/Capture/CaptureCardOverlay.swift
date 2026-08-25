//  CaptureCardOverlay.swift
//  Capture
//
//  C3 — the moment after the shutter. A paper card rises over the frozen frame
//  showing category and material as they stand: a field the read filled is badged
//  with where the value came from and never silently trusted, and a field nothing
//  filled shows "—" with no badge at all. Save commits & routes (S3);
//  Add detail opens the full sheet (C5);
//  swipe down keeps shooting. This is a transient overlay INSIDE the viewfinder,
//  not a registered sheet (Team C owns CaptureSheet.smartGuessCard).

import SwiftUI
import CaptureKit

struct CaptureCardOverlay: View {
    let specimen: Specimen
    let saveTitle: String
    let onSave: () -> Void
    let onAddDetail: () -> Void
    let onDismiss: () -> Void
    let placementLine: String
    let placementIsUnplaced: Bool
    let onPlacement: () -> Void
    /// The mic is not rendered at all when the flag is off (FC-R11's off-switch):
    /// a control that cannot record must not be offered.
    let micIsAvailable: Bool
    let isRecording: Bool
    let transcript: String
    /// FC-R11: drives the affirmation GATE, not a caption.
    let noteSetting: FieldNoteSetting?
    let onMicPressChanged: (Bool) -> Void
    /// One source of truth for the tap, owned by ViewfinderScreen so the SAME
    /// value the chip sets is the one the model's second gate is handed.
    @Binding var affirmed: Bool

    @State private var dragOffset: CGFloat = 0

    var body: some View {
        VStack {
            Spacer()
            card
                .offset(y: max(dragOffset, 0))
                .gesture(
                    DragGesture()
                        .onChanged { value in dragOffset = value.translation.height }
                        .onEnded { value in
                            if value.translation.height > 90 { onDismiss() }
                            dragOffset = 0
                        }
                )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .background(
            Color.black.opacity(0.001)            // catch a tap below the card without dimming the scene
                .ignoresSafeArea()
        )
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 16) {
            Capsule()
                .fill(CaptureColor.line2)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)

            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(CaptureColor.verdigris)
                Text("Ready to place")
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
            }

            guessRow(label: "Category",
                     value: categoryLabel,
                     source: specimen.provenance(for: .category))
            guessRow(label: "Material",
                     value: specimen.materialNote ?? "—",
                     source: specimen.provenance(for: .material))

            Button(action: onPlacement) {
                HStack(spacing: 8) {
                    Text(placementLine)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(placementIsUnplaced
                                         ? CaptureColor.terracotta : CaptureColor.ink)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .accessibilityLabel("Placement: \(placementLine)")
            .accessibilityHint("Opens the visit")
            .accessibilityIdentifier("card.placement")
            .overlay(alignment: .bottom) {
                Rectangle().fill(CaptureColor.line).frame(height: 1)
            }

            micRow

            HStack(spacing: 12) {
                Button(action: onAddDetail) {
                    Text("Add detail")
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(CaptureColor.line2, lineWidth: 1))
                }
                Button(action: onSave) {
                    Text(saveTitle)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.paper3)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(CaptureColor.verdigris, in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding(18)
        .background(CaptureColor.paper3, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(CaptureColor.line, lineWidth: 1))
        .padding(.horizontal, 12)
        .padding(.bottom, 14)
        .shadow(color: .black.opacity(0.35), radius: 24, y: 10)
    }

    /// FC-R11 gates this row twice over: the chip must be tapped before a
    /// conversation note can start (here), and `beginCardNote(affirmed:)`
    /// refuses independently — a DragGesture on a disabled subview is one
    /// layout change away from coming back.
    @ViewBuilder private var micRow: some View {
        if micIsAvailable {
            VStack(alignment: .leading, spacing: 8) {
                // FC-R11: the chip comes FIRST and gates the mic beneath it.
                FieldAffirmationChip(noteSetting: noteSetting, affirmed: $affirmed)

                HStack(spacing: 10) {
                    Image(systemName: isRecording ? "stop.circle.fill" : "mic.circle.fill")
                        .font(CaptureType.title2)
                        .foregroundStyle(isRecording
                                         ? CaptureColor.terracotta : CaptureColor.verdigris)
                    Text(isRecording ? "Recording — release to keep it"
                                     : "Hold to add a note")
                        .font(CaptureType.callout)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { _ in if !isRecording { onMicPressChanged(true) } }
                        .onEnded { _ in onMicPressChanged(false) })
                .disabled(isBlocked)
                .opacity(isBlocked ? 0.45 : 1)
                .accessibilityLabel(isBlocked
                    ? "Confirm everyone knows before recording"
                    : "Hold to add a note")
                .accessibilityIdentifier("card.mic")

                if !transcript.isEmpty {
                    Text(transcript)
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.ink)
                        .lineLimit(3)
                }
            }
        }
    }

    private var isBlocked: Bool {
        FieldAffirmationPolicy.recordingIsBlocked(noteSetting: noteSetting,
                                                  affirmed: affirmed) && !isRecording
    }

    /// `source` is nil when nothing has filled the field — the read couldn't
    /// place it and nobody typed one. Badge only what actually has a source.
    private func guessRow(label: String, value: String, source: ProvenanceSource?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                Spacer()
                if let source { ProvenanceBadge(source) }
            }
            Text(value)
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.ink)
        }
        .padding(.vertical, 6)
        .overlay(alignment: .bottom) { Rectangle().fill(CaptureColor.line).frame(height: 1) }
    }

    private var categoryLabel: String {
        specimen.category == .unknown ? "—" : specimen.category.rawValue.capitalized
    }
}
