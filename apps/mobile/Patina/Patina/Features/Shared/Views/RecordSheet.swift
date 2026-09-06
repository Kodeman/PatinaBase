//
//  RecordSheet.swift
//  Patina
//
//  `P-26`. The Record of Decision, drawn as a sheet of paper and handed to the
//  share sheet as an image.
//
//  It is deliberately not the screen it was taken from. A screen is a place a
//  homeowner acts; this is a thing she keeps, so it is laid out as paper —
//  fixed width, generous margins, a masthead, one mark drawn square, and a
//  reference line at the foot. `ImageRenderer` draws it off-screen at three
//  times scale, so what lands in Mail or Files is legible at print size.
//
//  Everything on it comes from `RecordOfDecision.printedLines` and its own
//  fields; nothing is looked up here. That is what makes "the IP address is
//  never on the keepsake" a fact a test can hold rather than a promise.
//

import SwiftUI
import UIKit

struct RecordSheet: View {
    let record: RecordOfDecision

    /// US Letter at 72 points to the inch. A fixed width is what makes the
    /// rendered image the same paper on every phone.
    static let sheetWidth: CGFloat = 612
    /// The scale `ImageRenderer` draws at. Three is legible when the image is
    /// printed rather than looked at on a phone.
    static let renderScale: CGFloat = 3

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            masthead
            Rectangle()
                .fill(PatinaColors.Border.strong)
                .frame(height: 1)
                .padding(.top, 18)
            subject.padding(.top, 28)
            mark.padding(.top, 32)
            signature.padding(.top, 32)
            Spacer(minLength: 40)
            reference
        }
        .padding(56)
        .frame(width: Self.sheetWidth, alignment: .topLeading)
        .background(PatinaColors.Background.primary)
    }

    private var masthead: some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoLabel(text: RecordOfDecisionCopy.masthead)
                .tracking(3)
            if let studio = record.studio {
                Text(studio)
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.Text.primary)
            }
        }
    }

    private var subject: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(record.title)
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
            if let editionLine = record.editionLine {
                Text(editionLine)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
        }
    }

    /// The mark, square to the page, with the act beside it.
    private var mark: some View {
        HStack(alignment: .firstTextBaseline, spacing: 16) {
            PatinaStamp(state: record.stamp, isUpright: true)
            Text(record.outcomeSentence)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Her name over a ruled line, the day beside it, and how she agreed
    /// beneath. Each half draws only where the app holds it.
    private var signature: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let signedName = record.signedName {
                MonoLabel(text: RecordOfDecisionCopy.signatureLabel)
                Text(signedName)
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.Text.primary)
                Rectangle()
                    .fill(PatinaColors.Border.strong)
                    .frame(width: 260, height: 1)
            }
            if let recordedOn = record.recordedOn {
                Text(recordedOn)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
            if let consentSentence = record.consentSentence {
                Text(consentSentence)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// `R6`: the twelve characters, at the foot, as provenance. Absent where
    /// the paper has no hash.
    @ViewBuilder
    private var reference: some View {
        if let checksum = record.checksum {
            VStack(alignment: .leading, spacing: 4) {
                MonoLabel(text: RecordOfDecisionCopy.referenceLabel)
                Text(checksum)
                    .font(PatinaTypography.monoLabel)
                    .tracking(1.4)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
    }
}

// MARK: - The image

enum RecordKeepsake {

    /// The sheet, drawn off-screen.
    ///
    /// `ImageRenderer` is the whole of the mechanism: no snapshotting of a
    /// live view, so what is rendered cannot pick up a keyboard, a scroll
    /// offset, or the half of the screen the sheet was drawn over.
    @MainActor
    static func image(_ record: RecordOfDecision) -> UIImage? {
        let renderer = ImageRenderer(content: RecordSheet(record: record))
        renderer.scale = RecordSheet.renderScale
        renderer.isOpaque = true
        return renderer.uiImage
    }
}

// MARK: - The act

/// `P-26`. "Keep a copy", beside the mark.
///
/// The image is rendered when the act appears rather than when it is tapped,
/// so the share sheet opens on the first press with the paper already in it.
/// Until it exists there is no act — an act that cannot succeed is not
/// offered, which is the same rule the deferral pair follows.
struct KeepACopyAct: View {
    let record: RecordOfDecision

    @State private var sheetImage: Image?

    var body: some View {
        Group {
            if let sheetImage {
                ShareLink(
                    item: sheetImage,
                    preview: SharePreview(record.title, image: sheetImage)
                ) {
                    Text(RecordOfDecisionCopy.keepACopy)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("record.keepACopy")
            }
        }
        .task {
            guard sheetImage == nil else { return }
            sheetImage = RecordKeepsake.image(record).map(Image.init(uiImage:))
        }
    }
}
