//
//  DecisionSpread.swift
//  Patina
//
//  `P-30`. The choice between named alternatives, laid out as a spread rather
//  than a vertical stack of full-width submit buttons.
//
//  Three things this file decides, so a test can hold them rather than reading
//  them out of a body:
//
//   • WHICH LAYOUT the options get. Two plates share a row; three or more are
//     paged; at accessibility text sizes the width cannot hold two plates side
//     by side at all and they stack.
//   • WHAT THE ACT IS CALLED. One named act — "I choose Shaker Oak" — never
//     "Choose this", which is the same words under both plates and says
//     nothing about what was chosen.
//   • HOW THE SCREEN ARRIVES. The zoom from the Record row, and the still
//     arrival a reader who has turned motion off asked for.
//
//  The leaning is NOT here: it is view-model state (`leaningOptionId`),
//  because the whole point of it is that it is not an answer.
//

import Foundation

enum DecisionSpread {

    // MARK: - Layout

    /// How the plates are laid out.
    enum Layout: Equatable {
        /// Two plates, equal, shoulder to shoulder.
        case sideBySide
        /// Three or more: a horizontally paged spread, one plate at a time,
        /// with a page dot in clay. Never a numeric indicator ("2 of 4") —
        /// that is the count chip the refusals name, drawn as a caption.
        case paged
        /// One plate at a time down the page. The accessibility sizes land
        /// here whatever the count: at `.accessibility1` and above a plate's
        /// own title, price and description need the full width, and two of
        /// them in a row broke the title inside its word (`C-06`, the same
        /// defect the Recommended capsule had).
        case stacked
    }

    static func layout(optionCount: Int, isAccessibilitySize: Bool) -> Layout {
        if isAccessibilitySize { return .stacked }
        if optionCount >= 3 { return .paged }
        if optionCount == 2 { return .sideBySide }
        return .stacked
    }

    // MARK: - The act

    /// The one named act. `P-30`: "I choose Shaker Oak", not "Choose this" —
    /// the act says what it is agreeing to, so the sentence a homeowner
    /// commits to is legible without looking back up at which plate is lit.
    ///
    /// An option whose title did not resolve gets the general: the act still
    /// names the ONE she is holding rather than borrowing a neighbour's name.
    static func actLabel(optionTitle: String?) -> String {
        let name = optionTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let name, !name.isEmpty else { return "I choose this one" }
        return "I choose \(name)"
    }

    /// Above the plates, while nothing is leaning. It says the tap is safe —
    /// which is the whole of what the leaning state is for.
    static let leaningPrompt = "Tap one to sit with it. Nothing is sent until you hold the act."

    /// `r1 M2`. What the act DOES, said beside it.
    ///
    /// The consent step this path replaced carried the only sentence naming
    /// the consequence; `leaningPrompt` names only what is not happening, so a
    /// homeowner arriving at a lit plate had nothing telling her what holding
    /// it sets off. This is the sheet's own sentence, in the choice's words.
    /// "Any work waiting on it" is hedged because the app cannot see whether
    /// there is any — `R9`: name the real consequence or stay silent.
    static let actConsequence =
        "Choosing sends your decision to your designer and unblocks any work waiting on it."

    // MARK: - The signature, which is optional here

    /// `r1 M2`. The typed name under the spread.
    ///
    /// The option path used to reach `client_consent_method` through a consent
    /// sheet whose "Add my signature" toggle could put `electronic_signature`
    /// on a choice (00117 carries the column per decision, and it is not the
    /// ceremony rail's column). `P-30` replaced the sheet with one held act;
    /// removing the sheet must not remove the capability, so the name moves
    /// under the spread as one optional line.
    ///
    /// Optional is the whole point: the mid-Wave-2 ruling requires a typed
    /// name on Stage-2 *Approve*, and says nothing about a choice between two
    /// finishes. Empty is the ordinary path and is recorded as `click_through`.
    static let signatureTitle = "Sign it, if you’d like"

    static let signatureNote =
        "Optional. Type your full legal name and your choice is recorded as signed; "
        + "leave it empty and it is recorded as confirmed in Patina."

    static let signatureFieldLabel = "Full legal name"

    /// Drawn only while the field holds something too short to be a name, so a
    /// stray keystroke is never silently dropped into an unsigned submit. A
    /// statement of what the field takes — no apology and no instruction about
    /// what she should have done.
    static let signatureTooShort = "Your full legal name, or leave it empty."

    /// What one held act sends, given whatever is in the name field.
    ///
    /// The two-character floor is `_apply_client_decision`'s own: a consent
    /// method and a signature are written together or not at all, and a
    /// one-character "signature" is a check violation server-side. Below the
    /// floor this reports `.tooShort` rather than quietly downgrading to
    /// click-through — the view holds the act until the field is a name or
    /// empty again.
    enum Consent: Equatable {
        case clickThrough
        case signed(String)
        case tooShort
    }

    static func consent(forTypedName typed: String?) -> Consent {
        let name = (typed ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return .clickThrough }
        return name.count >= 2 ? .signed(name) : .tooShort
    }

    /// Beside a leaning plate, for VoiceOver: the mark itself is a dot, and a
    /// dot reads as nothing.
    static let leaningLabel = "Leaning toward this"

    /// The page dot's accessibility, on the paged spread. Words, never
    /// "2 of 4": the plates are named and the reader is on one of them.
    static let pagedSpreadLabel = "Swipe to see the other options"

    // MARK: - Arrival

    /// How the detail screen arrives from the Record row.
    ///
    /// There is no third case. `.navigationTransition` and
    /// `.matchedTransitionSource` are iOS 18 APIs and this app's deployment
    /// target is iOS 26.0, so P-30's "standard push fallback on older OS
    /// versions" is unreachable here — the zoom is always available, and the
    /// only real branch is the one a reader chooses in Settings.
    enum Transition: Equatable {
        /// `.zoom(sourceID:in:)` from the row that was tapped.
        case zoom
        /// No zoom and no slide: the screen is simply there. `W2R2-n1` is the
        /// precedent — a presentation's own animation is the system's, and it
        /// keeps moving under Reduce Motion unless the surface stills it
        /// itself rather than waiting on a second switch she has not found.
        case crossFade
    }

    static func transition(reduceMotion: Bool) -> Transition {
        reduceMotion ? .crossFade : .zoom
    }
}
