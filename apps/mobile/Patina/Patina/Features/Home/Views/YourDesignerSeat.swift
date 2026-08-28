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
    ///     `promotedRequest`, which carries a display window).
    ///   - projects: `BadgeCountService.projects`, retained rows.
    ///   - record: the Record as drawn. Its first NEEDS YOU row is the most
    ///     urgent thing the house is waiting on, and the seat's project is the
    ///     one that row belongs to (W2 walk §2: the seat printed `Birch
    ///     Hollow` while every NEEDS YOU row was `Aspen Loft Refresh`, and
    ///     `Message` opened the wrong conversation).
    ///   - decisions/proposals/invoices: the retained rows the record's own
    ///     rows were composed from — the only place a row's `project_id`
    ///     survives, since `HouseRecordRow` carries a route and not a project.
    ///   - nextMoveDetail: what the Next Move card is already printing. Where
    ///     the seat would repeat it, the seat says something else instead
    ///     (`waves/w2/r2-notes.md` §4.3).
    static func make(
        liveLead: DesignRequestStatus?,
        projects: [RemoteProject],
        record: HouseRecord? = nil,
        decisions: [RemoteClientDecision] = [],
        proposals: [RemoteProposal] = [],
        invoices: [RemoteInvoice] = [],
        nextMoveDetail: String? = nil
    ) -> DesignerSeat? {
        let candidates = projects.filter {
            !StudioQueueBuilder.projectIsArchived($0) && $0.designer != nil
        }
        // The project the house is waiting on, else the most recently updated
        // one (`ProjectsAPIClient.listProjects` orders `updated_at.desc`).
        let urgentId = urgentProjectId(
            record: record, decisions: decisions, proposals: proposals, invoices: invoices
        )
        let project = urgentId.flatMap { id in candidates.first { $0.id == id } }
            ?? candidates.first

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
        // What she is doing, in the app's own words for that stage.
        let stageLine = lead.stage.cardTitle(
            studioName: lead.studioName,
            designerName: name,
            bookedSlotStartsAt: lead.introduction?.pickedSlotStartsAt
        )
        return DesignerSeat(
            designerId: lead.designerId,
            name: name,
            meta: meta(stageLine: stageLine, lead: lead, nextMoveDetail: nextMoveDetail),
            projectId: nil
        )
    }

    /// At engaged the seat and the Next Move both took the lead's stage
    /// sentence, so one screen carried it twice. Where that happens the seat
    /// names the studio and the stage instead — the two facts the Next Move
    /// is not printing. Both lines stay true; neither is a paraphrase.
    private static func meta(
        stageLine: String,
        lead: DesignRequestStatus,
        nextMoveDetail: String?
    ) -> String {
        guard let nextMoveDetail,
              nextMoveDetail.trimmingCharacters(in: .whitespacesAndNewlines) == stageLine
        else { return stageLine }
        return [lead.studioName, lead.stage.badgeTitle]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    /// The project behind the record's most urgent NEEDS YOU row. The row
    /// carries a route, so the id in it is matched back to the collection it
    /// came from — the one place `project_id` still exists.
    static func urgentProjectId(
        record: HouseRecord?,
        decisions: [RemoteClientDecision],
        proposals: [RemoteProposal],
        invoices: [RemoteInvoice]
    ) -> String? {
        guard let route = record?.needsYou.first?.route else { return nil }
        switch route {
        case .decisionDetail(let decisionId):
            return decisions.first { $0.id == decisionId }?.project_id
        case .proposalDetail(let proposalId):
            return proposals.first { $0.id == proposalId }?.project_id
        case .invoiceDetail(let invoiceId):
            return invoices.first { $0.id == invoiceId }?.project_id
        case .projectDetail(let projectId):
            return projectId
        default:
            return nil
        }
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
