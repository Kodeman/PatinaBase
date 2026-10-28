//
//  StudioServiceReading.swift
//  Patina
//
//  US-52 WP-10B-d. The read-only **Studio service** section an accepted
//  request shows, derived from one `get_studio_service_completion` read
//  (decoded in `DecisionsAPIClient+ServiceAcceptance.swift`).
//

import SwiftUI

/// C6, read-only: whether the studio has confirmed its service on this
/// accepted request. Drawn only once a read has succeeded.
struct StudioServiceSection: View {
    let reading: StudioServiceReading

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoLabel(text: ServiceAcceptanceCopy.studioServiceTitle)
            Text(ServiceAcceptanceCopy.studioServiceStatus(reading.status))
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
            if let completedAt = reading.completedAt {
                Text(ServiceAcceptanceCopy.studioServiceCompleted(DateDisplay.fromTimestamp(completedAt)))
                    .font(PatinaTypography.captionSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            if let scope = ServiceAcceptanceCopy.acceptedScope(reading) {
                Text(scope)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("serviceAcceptance.studioService")
    }
}

/// What the section says. C6 §2.4 gives the client no open-condition count
/// or texts, so none is shown.
nonisolated enum StudioServiceStatus: Equatable, Sendable {
    /// No live completion for this request, or a state this build cannot read.
    case notYet
    case complete
    /// `completed_with_conditions` whose conditions are not yet closed.
    case completeWithConditions
}

nonisolated struct StudioServiceReading: Equatable, Sendable {
    let status: StudioServiceStatus
    let completedAt: String?
    let scopeContentHash: String?
    let requestNumber: Int?

    /// The section for `request` from one read, or nil when it stays hidden:
    /// the request is not accepted yet, or the capability is inactive.
    init?(request: RemoteServiceAcceptanceRequest, read: RemoteStudioServiceCompletionRead) {
        guard request.showsStudioService, read.capability != "inactive" else { return nil }
        let completion = read.completions.first { $0.acceptanceRequestId == request.requestId }
        switch completion?.state {
        case .completed:
            status = .complete
        case .completedWithConditions:
            status = completion?.conditionsClosedAt == nil ? .completeWithConditions : .complete
        case .unknown, nil:
            status = .notYet
        }
        // "Not yet" carries no date or reference.
        let shown = status == .notYet ? nil : completion
        completedAt = shown?.completedAt
        scopeContentHash = shown?.scopeContentHash
        requestNumber = shown?.requestNumber
    }
}

nonisolated extension RemoteServiceAcceptanceRequest {
    /// The homeowner's acceptance has closed as accepted: only then does the
    /// studio's completion mean anything to her.
    var showsStudioService: Bool {
        aggregateOutcome == .accepted || aggregateOutcome == .acceptedWithConditions
    }
}
