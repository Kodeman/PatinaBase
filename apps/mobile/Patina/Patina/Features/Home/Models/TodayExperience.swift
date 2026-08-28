//
//  TodayExperience.swift
//  Patina
//
//  Deterministic prioritization for Option B's three-part Today surface:
//  one next move, one editorial story, and one active room.
//

import Foundation

struct TodayPriorityInput: Equatable {
    var hasPendingDesignDraft: Bool = false
    var resumableScanPhotoCount: Int?
    var promotedDesignRequestID: String?
    var promotedDesignRequestStatus: String?
    var pendingDecisionCount: Int = 0
    var unreadMessageCount: Int = 0
    var hasStyleProfile: Bool = false
    var activeRoom: ContextRoomCandidate?
    /// The client's live project, where there is one. With nothing waiting,
    /// the Next Move names the phase the project is actually in rather than
    /// inventing a chore (synthesis §5's graft from Direction A).
    var activeProjectID: String?
    var activeProjectName: String?
    /// `projects.current_phase`, raw. Empty or nil means the app does not know
    /// the phase and says nothing about it.
    var activeProjectPhase: String?
}

struct TodayNextMove: Equatable {
    enum Kind: String, Equatable {
        case resumeDesignRequest
        case resumeScan
        case trackDesignRequest
        case reviewDecisions
        case readMessages
        case openProject
        case scanFirstRoom
        case discoverStyle
        case exploreActiveRoom
        case reviewActiveRoom
    }

    let kind: Kind
    let title: String
    let detail: String
    let symbol: String
    let targetID: String?

    var analyticsID: String { kind.rawValue }
}

enum TodayExperience {

    /// A single, honest priority. Every branch is backed by a real local or
    /// remote signal; order encodes interruption cost and urgency.
    static func nextMove(for input: TodayPriorityInput) -> TodayNextMove {
        if let continuation = continuationMove(for: input) {
            return continuation
        }
        if let project = projectMove(for: input) {
            return project
        }
        return roomMove(for: input)
    }

    private static func continuationMove(for input: TodayPriorityInput) -> TodayNextMove? {
        if input.hasPendingDesignDraft {
            return TodayNextMove(
                kind: .resumeDesignRequest,
                title: "Finish your design request",
                detail: "Your draft is saved and ready to review.",
                symbol: "paperplane",
                targetID: nil
            )
        }

        if let photos = input.resumableScanPhotoCount {
            let noun = photos == 1 ? "view" : "views"
            return TodayNextMove(
                kind: .resumeScan,
                title: "Continue your room scan",
                detail: "\(photos) \(noun) are safely held on this device.",
                symbol: "camera.viewfinder",
                targetID: nil
            )
        }

        if let requestID = input.promotedDesignRequestID {
            let status = input.promotedDesignRequestStatus?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return TodayNextMove(
                kind: .trackDesignRequest,
                title: "See your design request",
                detail: (status?.isEmpty == false ? status : nil)
                    ?? "There is an update waiting for you.",
                symbol: "person.crop.circle.badge.checkmark",
                targetID: requestID
            )
        }
        return nil
    }

    private static func projectMove(for input: TodayPriorityInput) -> TodayNextMove? {
        if input.pendingDecisionCount > 0 {
            // SP-16: "N things need your eye" belongs to the attention count
            // and is printed by the Companion footer on this same screen.
            // This move speaks for decisions alone, so it says so rather than
            // stacking a second, smaller number under the same sentence.
            let noun = input.pendingDecisionCount == 1 ? "decision is" : "decisions are"
            return TodayNextMove(
                kind: .reviewDecisions,
                title: "Review a project decision",
                detail: "\(input.pendingDecisionCount) \(noun) waiting on you.",
                symbol: "checkmark.seal",
                targetID: nil
            )
        }

        if input.unreadMessageCount > 0 {
            let noun = input.unreadMessageCount == 1 ? "message is" : "messages are"
            return TodayNextMove(
                kind: .readMessages,
                title: "Pick up the conversation",
                detail: "\(input.unreadMessageCount) unread \(noun) waiting.",
                symbol: "bubble.left.and.bubble.right",
                targetID: nil
            )
        }

        // Nothing is waiting. The queue is empty and the project is still
        // moving, so the move names where it has got to — the phase is already
        // on the wire (`projects.current_phase`) and was being discarded.
        if let projectId = input.activeProjectID,
           let phase = input.activeProjectPhase,
           !phase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return TodayNextMove(
                kind: .openProject,
                title: input.activeProjectName.map { "See where \($0) stands" }
                    ?? "See where your project stands",
                detail: "Now in \(PhaseDisplay.clientLabel(for: phase)).",
                symbol: "list.bullet.rectangle",
                targetID: projectId
            )
        }
        return nil
    }

    private static func roomMove(for input: TodayPriorityInput) -> TodayNextMove {
        guard let room = input.activeRoom else {
            return TodayNextMove(
                kind: .scanFirstRoom,
                title: "Bring your first room into Patina",
                detail: "A short scan gives the Companion a real space to work from.",
                symbol: "camera.viewfinder",
                targetID: nil
            )
        }

        if !input.hasStyleProfile {
            return TodayNextMove(
                kind: .discoverStyle,
                title: "Shape your taste portrait",
                detail: "Five choices give Patina a clearer material and palette direction.",
                symbol: "paintpalette",
                targetID: nil
            )
        }

        if room.itemCount == 0 {
            return TodayNextMove(
                kind: .exploreActiveRoom,
                title: "Find the first piece for \(room.name)",
                detail: room.hasBeenScanned
                    ? "See the room-aware edit for this space."
                    : "Browse Patina's edit and begin shaping the room.",
                symbol: "sparkles",
                targetID: room.id.uuidString
            )
        }

        return TodayNextMove(
            kind: .reviewActiveRoom,
            title: "Return to \(room.name)",
            detail: "\(room.itemCount) \(room.itemCount == 1 ? "piece is" : "pieces are") gathering there.",
            symbol: "house",
            targetID: room.id.uuidString
        )
    }
}

// MARK: - Home composition (Direction B §2)

/// One block of the home, top to bottom. The list a tier mounts is a rule, not
/// a view — so it can be pinned by a test that renders nothing.
enum HomeBlock: String, Equatable, CaseIterable {
    case header
    case record
    case nextMove
    case designerSeat
    case houseRail
    /// M2 block 3: at discovering the house is ONE room, so it is drawn whole
    /// rather than as a rail of one card.
    case roomHero
    case startWithARoom
    case newThisWeek
    /// M2 block 5: the door to the pieces the person has gathered.
    case savedSummary
    case story
    case signInLine
}

/// How much room a card takes. Weight follows content: the record takes the
/// hero footprint the moment it has something true to say, and the story drops
/// to a row when it does.
enum HomeCardWeight: Equatable {
    case hero
    case row(CGFloat)
}

struct HomeCompositionInput: Equatable {
    var isSignedIn: Bool = false
    var tier: EngagementTier = .discovering
    var record: HouseRecord = .empty
    /// Every room the person's house holds — the rooms they typed or scanned
    /// AND the project rooms a designer owns. An activeProject client whose
    /// rooms all live on the project is not an empty house.
    var roomCount: Int = 0
    var newThisWeekCount: Int = 0
    var hasStory: Bool = false
    var hasDesigner: Bool = false
    /// Rooms the PERSON made, as opposed to the designer's project rooms. The
    /// discovering house draws the one they made; a project room is not theirs
    /// to be shown as theirs.
    var localRoomCount: Int = 0
    var savedPieceCount: Int = 0
}

enum HomeComposition {

    /// `NEW THIS WEEK` renders at three or more genuinely new rows, or not at
    /// all. It is never padded (B §2, supply floor).
    static let newThisWeekFloor = 3

    /// The story's demoted height when the record carried the screen.
    static let storyRowHeight: CGFloat = 96

    /// Honesty (C5), the tier half: at guest and discovering an empty record
    /// draws NOTHING — an empty half is not drawn, and no "Nothing moved since
    /// Thursday." is printed to a person with no house on file (synthesis §5,
    /// which overrides B §2's guest bullet). From engaged upward the truthful
    /// empties do draw, because there a silence is itself the answer.
    static func recordDraws(for input: HomeCompositionInput) -> Bool {
        if !input.record.isEmpty { return true }
        return input.isSignedIn && input.tier >= .engaged
    }

    /// The record is the next move whenever it holds one. The Next Move card
    /// keeps the second slot only when nothing needs the person.
    static func nextMoveDraws(for input: HomeCompositionInput) -> Bool {
        guard recordDraws(for: input) else { return true }
        return input.record.needsYou.isEmpty
    }

    static func recordWeight(for input: HomeCompositionInput) -> HomeCardWeight {
        input.record.isEmpty ? .row(storyRowHeight) : .hero
    }

    static func storyWeight(for input: HomeCompositionInput) -> HomeCardWeight {
        input.record.isEmpty ? .hero : .row(storyRowHeight)
    }

    static func blocks(for input: HomeCompositionInput) -> [HomeBlock] {
        var blocks: [HomeBlock] = [.header]
        if recordDraws(for: input) { blocks.append(.record) }
        if nextMoveDraws(for: input) { blocks.append(.nextMove) }
        // The seat persists from the moment a designer exists until she is
        // gone — never at discovering, where naming one would be a guess.
        if input.isSignedIn, input.tier >= .engaged, input.hasDesigner {
            blocks.append(.designerSeat)
        }
        // Below engaged the house is the person's own rooms, and one room is
        // a card, not a rail (M2 block 3). From engaged upward the rail holds
        // the designer's project rooms beside them.
        if input.tier < .engaged, input.localRoomCount == 1, input.roomCount == 1 {
            blocks.append(.roomHero)
        } else {
            blocks.append(input.roomCount > 0 ? .houseRail : .startWithARoom)
        }
        if input.newThisWeekCount >= newThisWeekFloor { blocks.append(.newThisWeek) }
        // The Saved door, where the person has saved anything. Signed in only:
        // a guest's saves are not on file anywhere yet (M2's tier note).
        if input.isSignedIn, input.savedPieceCount > 0 { blocks.append(.savedSummary) }
        if input.hasStory { blocks.append(.story) }
        if !input.isSignedIn { blocks.append(.signInLine) }
        return blocks
    }
}
