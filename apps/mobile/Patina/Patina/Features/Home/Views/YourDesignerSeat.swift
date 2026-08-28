//
//  YourDesignerSeat.swift
//  Patina
//
//  The designer's permanent seat on the home (B §2, M1 block 3). Name, studio,
//  one line of what she is doing, and Message.
//
//  It draws from engaged upward and persists from the moment a designer exists
//  until she is gone (F09, F79, F25). Where no designer is known it does not
//  draw at all — a seat with "Your designer" in it would be a guess wearing a
//  monogram.
//

import SwiftUI

/// What the seat prints, resolved once from the two sources that know: the
/// client's live lead and their projects.
struct DesignerSeat: Equatable {
    let designerId: UUID?
    let name: String
    /// Studio · project, or the lead's own stage line. One line, never two
    /// facts pretending to be one.
    let meta: String?
    /// The project the Message action opens a thread on. Nil at engaged, where
    /// there is no project yet and the direct thread is the path.
    let projectId: String?

    /// Initials for the seat's circle. A studio name gives one letter as
    /// readily as a person's does.
    var monogram: String {
        let words = name.split(separator: " ").prefix(2)
        let letters = words.compactMap { $0.first.map(String.init) }
        return letters.joined().uppercased()
    }

    /// - Parameters:
    ///   - liveLead: `DesignRequestStatusService.liveLead` — the newest open
    ///     request a designer is actually on (W1a's ruling: never
    ///     `promotedRequest`, which carries a 14-day display window).
    ///   - projects: `BadgeCountService.projects`, retained rows.
    static func make(
        liveLead: DesignRequestStatus?,
        projects: [RemoteProject]
    ) -> DesignerSeat? {
        let project = projects.first {
            !StudioQueueBuilder.projectIsArchived($0) && $0.designer != nil
        }

        if let project, let name = project.designer?.displayName, !name.isEmpty {
            let meta = [project.designerStudioName, project.name]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " · ")
            return DesignerSeat(
                designerId: project.designer_id.flatMap(UUID.init(uuidString:)),
                name: name,
                meta: meta.isEmpty ? nil : meta,
                projectId: project.id
            )
        }

        guard let lead = liveLead, let name = lead.designerName, !name.isEmpty else {
            return nil
        }
        return DesignerSeat(
            designerId: lead.designerId,
            name: name,
            // What she is doing, in the app's own words for that stage.
            meta: lead.stage.cardTitle(
                studioName: lead.studioName,
                designerName: name,
                bookedSlotStartsAt: lead.introduction?.pickedSlotStartsAt
            ),
            projectId: nil
        )
    }
}

struct YourDesignerSeat: View {
    let seat: DesignerSeat
    var isOpeningThread: Bool = false
    var onMessage: () -> Void = {}

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: PatinaSpacing.lg) {
                    HStack(spacing: PatinaSpacing.xsm) {
                        monogram
                        copy
                    }
                    messageButton
                }
            } else {
                HStack(spacing: PatinaSpacing.xsm) {
                    monogram
                    copy
                    Spacer(minLength: PatinaSpacing.sm)
                    messageButton
                }
            }
        }
        .padding(.vertical, 10)
        .padding(.leading, PatinaSpacing.md)
        .padding(.trailing, PatinaSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
        .accessibilityIdentifier("DailyRoomView.DesignerSeat")
    }

    private var monogram: some View {
        ZStack {
            Circle()
                .fill(PatinaColors.clay.opacity(0.15))
                .frame(width: 44, height: 44)
            Text(seat.monogram)
                // A glyph in a fixed circle, not running text.
                .font(PatinaTypography.monogramGlyph)
                .foregroundStyle(PatinaColors.clayDeep)
        }
        .accessibilityHidden(true)
    }

    private var copy: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(seat.name)
                .font(PatinaTypography.headlineMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
            if let meta = seat.meta {
                Text(meta)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var messageButton: some View {
        Button(action: onMessage) {
            Group {
                if isOpeningThread {
                    ProgressView()
                        .tint(PatinaColors.Text.interactive)
                } else {
                    Text("Message")
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.interactive)
                }
            }
            .padding(.horizontal, PatinaSpacing.xsm)
            .frame(minHeight: 44)
            .background(Capsule().fill(PatinaColors.clay.opacity(0.14)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isOpeningThread)
        .accessibilityLabel("Message \(seat.name)")
        .accessibilityIdentifier("DailyRoomView.DesignerSeatMessage")
    }
}
