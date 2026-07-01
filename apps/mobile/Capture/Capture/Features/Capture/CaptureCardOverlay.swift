//  CaptureCardOverlay.swift
//  Capture
//
//  C3 — the moment after the shutter. A paper card rises over the frozen frame
//  already guessing category + material (each badged "guess" — never silently
//  trusted). Save commits & routes (S3); Add detail opens the full sheet (C5);
//  swipe down keeps shooting. This is a transient overlay INSIDE the viewfinder,
//  not a registered sheet (Team C owns CaptureSheet.smartGuessCard).

import SwiftUI
import CaptureKit

struct CaptureCardOverlay: View {
    let specimen: Specimen
    let onSave: () -> Void
    let onAddDetail: () -> Void
    let onDismiss: () -> Void

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
                ProgressView().controlSize(.small).tint(CaptureColor.brass)
                Text("Identifying…")
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
            }

            guessRow(label: "Category",
                     value: categoryLabel,
                     source: specimen.provenance(for: .category) ?? .smartGuess)
            guessRow(label: "Material",
                     value: specimen.materialNote ?? "—",
                     source: specimen.provenance(for: .material) ?? .smartGuess)

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
                    Text("Save")
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

    private func guessRow(label: String, value: String, source: ProvenanceSource) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                Spacer()
                ProvenanceBadge(source)
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
