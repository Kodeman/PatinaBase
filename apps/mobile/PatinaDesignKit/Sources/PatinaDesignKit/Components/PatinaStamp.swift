//
//  PatinaStamp.swift
//  PatinaDesignKit
//
//  `P-17` / `R13`. One stamp, eleven states, four dials — the iOS port of the
//  portals' `GateStamp` grammar, so a homeowner meets the same mark in her
//  inbox, on the web and on her phone.
//
//  The four dials are the whole component: BORDER WEIGHT (single / doubled),
//  BORDER PIGMENT, WORD INK, and ROTATION. There is no fifth. In particular
//  there is no fill and no shadow: an inspection tag is ink on paper, and a
//  filled pill is a badge, which the vision refuses.
//
//  Rotation is −1.1°, which is the Threshold's own value
//  (`approval-ask.tsx:111`, `wall-gate.tsx:211`) rather than the −2° the
//  ceremony doc drafted before the 2026-09-04 client-page cutover. The web is
//  what a homeowner compares against, so the web wins.
//
//  Two pigment rulings are load-bearing and are not a matter of taste:
//  SIGNED is `mocha`, never `sage` — a green mark on the most consequential
//  state is exactly the read VISION §6 refuses — and `terracotta` appears
//  exactly once, as DECLINED, with no sage counterpart, so no traffic-light
//  reading is available anywhere in the table.
//

import SwiftUI

/// An inspection tag, not a status pill.
///
/// The stamp is decoration over a sentence: every caller draws it beside text
/// that already says the state, so the mark itself is hidden from VoiceOver
/// rather than reading the state twice.
public struct PatinaStamp: View {

    // MARK: - The eleven states

    public enum State: String, CaseIterable, Sendable {
        /// Not stamped yet, and drawn so: an upright outline, deliberately
        /// unlike every mark beside it.
        case awaiting
        case approved
        /// `changes_requested` on every surface. Never "Declined" — that word
        /// belongs to a commercial document a client refused, and using it for
        /// both made one row read two ways on two screens.
        case returned
        /// `needs_discussion`. As loud as the seal: a holding approval must
        /// never read as a soft approval.
        case held
        case signed
        /// Signed away from this surface, so it was not stamped on it.
        case signedOnPaper
        /// The reading act, recorded (`R-C9`): she attested to the exact
        /// edition and the studio has it now.
        case reviewed
        case withdrawn
        case superseded
        case expired
        /// A commercial document the client declined. The one warm exception.
        case declined

        /// The word inside the rule. Uppercase is applied at draw time.
        public var word: String {
            switch self {
            case .awaiting: return "AWAITING YOU"
            case .approved: return "APPROVED"
            case .returned: return "RETURNED"
            case .held: return "HELD"
            case .signed, .signedOnPaper: return "SIGNED"
            case .reviewed: return "REVIEWED"
            case .withdrawn: return "WITHDRAWN"
            case .superseded: return "SUPERSEDED"
            case .expired: return "EXPIRED"
            case .declined: return "DECLINED"
            }
        }

        /// A second mono line INSIDE the rule. Only paper-signing has one —
        /// the word is still SIGNED, and where it happened is the qualifier.
        public var innerLine: String? {
            self == .signedOnPaper ? "ON PAPER" : nil
        }

        public var borderPigment: Pigment {
            switch self {
            case .approved, .signed, .signedOnPaper: return .mocha
            case .awaiting, .held: return .goldenHour
            case .returned: return .clay
            case .declined: return .terracotta
            case .reviewed, .withdrawn, .superseded, .expired: return .muted
            }
        }

        /// The word never degrades: it is the page's own primary ink wherever
        /// the border is a coloured rule, and the muted ink only where the
        /// whole mark is muted.
        public var wordPigment: Pigment {
            switch self {
            case .approved, .signed, .signedOnPaper: return .mocha
            case .awaiting, .held, .returned, .declined: return .word
            case .reviewed, .withdrawn, .superseded, .expired: return .muted
            }
        }

        /// Doubled reads terminal; a single rule reads still-open.
        public var weight: Weight {
            switch self {
            case .approved, .signed, .signedOnPaper, .held: return .doubled
            case .awaiting, .returned, .declined, .reviewed,
                 .withdrawn, .superseded, .expired: return .single
            }
        }

        /// Stamped on this surface, or not stamped at all. Upright is not a
        /// missing rotation — it is the statement that no hand pressed this
        /// mark here.
        public var rotationDegrees: Double {
            switch self {
            case .awaiting, .signedOnPaper, .withdrawn, .superseded, .expired:
                return 0
            case .approved, .returned, .held, .signed, .reviewed, .declined:
                return PatinaStamp.rotationDegrees
            }
        }

        /// The word is struck through, once, where the studio pulled the paper
        /// back.
        public var isStruckThrough: Bool { self == .withdrawn }

        /// Terminal states settle and then age. The three that are still
        /// asking something stay at full ink no matter how old, because a
        /// faded question is a question the product has given up on.
        public var ages: Bool {
            switch self {
            case .awaiting, .returned, .held: return false
            case .approved, .signed, .signedOnPaper, .reviewed,
                 .withdrawn, .superseded, .expired, .declined: return true
            }
        }
    }

    // MARK: - The dials

    public enum Pigment: String, CaseIterable, Sendable {
        case mocha
        case goldenHour
        case clay
        case terracotta
        case muted
        /// The page's primary ink, for a word inside a coloured rule.
        case word

        /// The rule this pigment draws.
        public var rule: Color {
            switch self {
            case .mocha: return PatinaColors.Stamp.mocha
            case .goldenHour: return PatinaColors.Stamp.goldenHour
            case .clay: return PatinaColors.Stamp.clay
            case .terracotta: return PatinaColors.Stamp.terracotta
            case .muted: return PatinaColors.Stamp.mutedRule
            case .word: return PatinaColors.Stamp.word
            }
        }

        /// The ink this pigment writes in.
        public var ink: Color {
            switch self {
            case .muted: return PatinaColors.Stamp.mutedInk
            case .word: return PatinaColors.Stamp.word
            default: return rule
            }
        }

        /// The measured light-appearance value of the INK, so a test can prove
        /// which pigment a state actually writes in rather than trusting the
        /// name. `muted` is the one pigment whose rule and ink differ — a
        /// closed mark is drawn in the page's rule and written in its muted
        /// ink — so the two are named separately.
        public var lightInkHex: String {
            switch self {
            case .mocha: return "5C4A3C"
            case .goldenHour: return "79651E"
            case .clay: return "82612F"
            case .terracotta: return "9C5340"
            case .muted: return "8B7355"
            case .word: return "2C2926"
            }
        }

        /// The measured light-appearance value of the RULE. `muted` is the
        /// one pigment whose rule and ink differ: the mark is drawn in the
        /// page's subtle ink and written in its muted ink.
        public var lightRuleHex: String {
            self == .muted ? "5A4E43" : lightInkHex
        }
    }

    public enum Weight: String, Sendable {
        case single
        case doubled
    }

    // MARK: - Aging

    /// One aging step, at thirty days. Nothing ages further, ever — patina
    /// settles, it does not fade to nothing.
    public static let agingDays = 30
    public static let borderOpacity: Double = 0.88
    public static let agedBorderOpacity: Double = 0.74
    public static let innerRuleOpacity: Double = 0.42
    public static let agedInnerRuleOpacity: Double = 0.26
    public static let rotationDegrees: Double = -1.1

    /// Whether this mark has taken its one aging step.
    ///
    /// An open state never ages, and a state with no recorded date has not
    /// settled yet, so neither can.
    public static func isAged(
        state: State, recordedAt: Date?, now: Date = Date()
    ) -> Bool {
        guard state.ages, let recordedAt else { return false }
        let elapsed = now.timeIntervalSince(recordedAt)
        return elapsed >= Double(agingDays) * 86_400
    }

    // MARK: - Init

    public let state: State
    /// A line beneath the mark: the signer's name on a signature, the edition
    /// that replaced this one on a supersession, the date on an expiry.
    /// Absent draws nothing — the stamp never invents its own footnote.
    public let sublabel: String?
    public let isAged: Bool
    /// Nil — the default, and the right answer nearly everywhere — hides the
    /// mark from VoiceOver: it is drawn beside a sentence that already says
    /// the state, and speaking both reads the state twice. A caller that
    /// draws the stamp with NO sentence beside it passes the word it stands
    /// for, and the mark speaks.
    public let accessibilityLabel: String?

    public init(
        state: State,
        sublabel: String? = nil,
        isAged: Bool = false,
        accessibilityLabel: String? = nil
    ) {
        self.state = state
        self.sublabel = sublabel
        self.isAged = isAged
        self.accessibilityLabel = accessibilityLabel
    }

    /// The same stamp, aged from the day the outcome was recorded.
    public init(
        state: State,
        sublabel: String? = nil,
        recordedAt: Date?,
        now: Date = Date(),
        accessibilityLabel: String? = nil
    ) {
        self.init(
            state: state,
            sublabel: sublabel,
            isAged: Self.isAged(state: state, recordedAt: recordedAt, now: now),
            accessibilityLabel: accessibilityLabel
        )
    }

    // MARK: - Body

    public var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            mark
            if let sublabel, !sublabel.isEmpty {
                Text(sublabel)
                    .font(PatinaTypography.monoLabel)
                    .tracking(1.1)
                    .foregroundStyle(PatinaColors.Stamp.mutedInk)
                    .textCase(.uppercase)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityHidden(accessibilityLabel == nil)
        .accessibilityLabel(Text(accessibilityLabel ?? ""))
    }

    private var outerOpacity: Double {
        isAged ? Self.agedBorderOpacity : Self.borderOpacity
    }

    private var innerOpacity: Double {
        isAged ? Self.agedInnerRuleOpacity : Self.innerRuleOpacity
    }

    private var mark: some View {
        words
            .padding(.horizontal, 10)
            .padding(.top, 6)
            .padding(.bottom, 5)
            .overlay {
                Rectangle()
                    .strokeBorder(
                        state.borderPigment.rule.opacity(outerOpacity),
                        lineWidth: 1.5
                    )
            }
            .overlay {
                if state.weight == .doubled {
                    Rectangle()
                        .strokeBorder(
                            state.borderPigment.rule.opacity(innerOpacity),
                            lineWidth: 1
                        )
                        .padding(2.5)
                }
            }
            .rotationEffect(.degrees(state.rotationDegrees))
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(state.word)
                .font(PatinaTypography.monoMedium)
                .tracking(1.1)
                .textCase(.uppercase)
                .foregroundStyle(state.wordPigment.ink)
                .overlay(alignment: .center) {
                    if state.isStruckThrough {
                        Rectangle()
                            .fill(state.wordPigment.ink)
                            .frame(height: 1)
                    }
                }
            if let innerLine = state.innerLine {
                Text(innerLine)
                    .font(PatinaTypography.monoLabel)
                    .tracking(1.1)
                    .textCase(.uppercase)
                    .foregroundStyle(state.wordPigment.ink)
            }
        }
        .fixedSize(horizontal: true, vertical: false)
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 20) {
        ForEach(PatinaStamp.State.allCases, id: \.rawValue) { state in
            PatinaStamp(state: state)
        }
    }
    .padding(32)
    .background(PatinaColors.Background.primary)
}
