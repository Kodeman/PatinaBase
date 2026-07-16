//
//  MatchCeremonyPreviewFixtures.swift
//  Patina
//
//  Fixture builders for the Match Ceremony surfaces' SwiftUI previews — every
//  reachable state (introduced / stale / booked / held) with NO network. DEBUG
//  only, so nothing ships in the release binary.
//

#if DEBUG
import Foundation

extension IntroductionInfo {
    /// Three offered slots, either all future (`future: true`) or all past.
    fileprivate static func previewSlots(future: Bool) -> [IntroductionSlot] {
        let base = future ? 2.0 : -6.0            // days from now, first slot
        let durations = [30, 30, 45]
        return (0..<3).map { index in
            IntroductionSlot(
                id: UUID(),
                startsAt: Date().addingTimeInterval((base + Double(index)) * 86_400),
                durationMinutes: durations[index]
            )
        }
    }

    static func preview(state: String, picked: Bool, future: Bool) -> IntroductionInfo {
        let slots = previewSlots(future: future)
        return IntroductionInfo(
            ceremonyId: UUID(),
            state: state,
            introText: "Elena — I keep thinking about what you said: collected, "
                + "not decorated. Your scan shows beautiful west light we can work "
                + "with. Let's talk about how the room actually lives.",
            credentialLine: "Principal, Middle Studio · 12 years in residential",
            portfolioUrl: "https://middlestudio.example/portfolio",
            slots: slots,
            timezone: "America/Chicago",
            offeredAt: Date().addingTimeInterval(-2 * 3_600),
            pickedSlotId: picked ? slots.first?.id : nil,
            pickedSlotStartsAt: picked ? slots.first?.startsAt : nil,
            threadId: UUID(),
            createdAt: Date().addingTimeInterval(-2 * 3_600)
        )
    }
}

extension DesignRequestStatus {
    fileprivate static func previewBase(introduction: IntroductionInfo?) -> DesignRequestStatus {
        DesignRequestStatus(
            leadId: UUID(),
            statusRaw: "new",
            designerId: UUID(),
            designerName: "Ada Chen",
            projectTypeRaw: "full_room",
            budgetRange: "15k_50k",
            timeline: "1_3_months",
            requestDescription: "Living room — collected, not decorated.",
            scanCount: 2,
            createdAt: Date().addingTimeInterval(-3 * 86_400),
            updatedAt: Date().addingTimeInterval(-2 * 3_600),
            dismissedAt: nil,
            dismissedStageRaw: nil,
            introduction: introduction,
            studioName: "Middle Studio"
        )
    }

    static var previewIntroduced: DesignRequestStatus {
        previewBase(introduction: .preview(state: "sent", picked: false, future: true))
    }

    static var previewStale: DesignRequestStatus {
        previewBase(introduction: .preview(state: "sent", picked: false, future: false))
    }

    static var previewBooked: DesignRequestStatus {
        previewBase(introduction: .preview(state: "picked", picked: true, future: true))
    }

    static var previewHeld: DesignRequestStatus {
        previewBase(introduction: nil)
    }
}
#endif
