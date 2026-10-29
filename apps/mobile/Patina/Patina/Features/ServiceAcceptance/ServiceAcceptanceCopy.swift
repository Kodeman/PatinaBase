//
//  ServiceAcceptanceCopy.swift
//  Patina
//
//  Every sentence the agreed-services surface draws. K5: this is an
//  authenticated click-through, never a signature, so no line here says
//  "sign" or "signature" (C4 §2.6).
//

import Foundation

enum ServiceAcceptanceCopy {
    static let eyebrow = "Agreed services"
    static let entryTitle = "Review the agreed services"
    static let detailTitle = "The agreed services"
    static let intro = "Your studio asked you to confirm the services in your agreed scope."

    /// The statement a required signer accepts. WP-10C-d's wording, naming
    /// the exact scope edition the request binds.
    static func acceptStatement(_ request: RemoteServiceAcceptanceRequest) -> String {
        "You confirm the studio delivered the service described in this agreed scope (edition \(request.scopeEditionId))."
    }
    static let returnStatement = "Your studio gets your reason and prepares a new request. Nothing is accepted."

    // The exact references the request binds, as the web client shows them.
    static func referencesTitle(_ request: RemoteServiceAcceptanceRequest) -> String {
        request.viewerRole == .signerRequired ? "What you’re accepting" : "Agreed scope and evidence"
    }
    static let scopeEditionLabel = "Agreed scope edition"
    static func scopeReference(_ hash: String) -> String { "Scope reference · \(shortReference(hash))" }
    static func evidenceReference(_ hash: String) -> String { "Evidence reference · \(shortReference(hash))" }
    /// The web client's short form: the first twelve characters.
    static func shortReference(_ hash: String) -> String { String(hash.prefix(12)) }

    static func inclusion(_ value: String) -> String {
        switch value {
        case "included": return "Included"
        case "excluded": return "Not included"
        case "conditional": return "Included if conditions are met"
        default: return "Scope item"
        }
    }

    static func party(_ value: String) -> String? {
        switch value {
        case "studio": return "your studio"
        case "client": return "you"
        case "gc": return "your general contractor"
        case "other": return "another party"
        case "none": return nil
        default: return nil
        }
    }

    static func source(_ value: String) -> String {
        switch value {
        case "plan_issue": return "Issued plan"
        case "plan_issue_print": return "Issued plan print"
        case "plan_print": return "Plan print"
        case "product_configuration": return "Furniture selection"
        case "custom_commission_revision": return "Custom piece"
        case "review_item": return "Review item"
        case "approval_artifact": return "Approval"
        default: return "Issued item"
        }
    }

    static func service(_ value: String) -> String {
        switch value {
        case "design": return "Design"
        case "installation": return "Installation"
        default: return "Service"
        }
    }

    static func evidenceError(canRespond: Bool) -> String {
        "Couldn’t load the agreed scope and evidence."
            + (canRespond ? " Your response is unavailable until you can review them." : "")
    }

    static func documentError(_ title: String) -> String { "Couldn’t open \(title). Try again." }

    static func evidenceHint(ready: Bool) -> String {
        ready ? "" : "Review the agreed scope and evidence before responding."
    }

    static func issue(_ issue: ServiceAcceptanceAnswerIssue) -> String? {
        switch issue {
        case .missingCondition, .missingReason: return nil
        case .tooManyConditions: return "Use no more than 20 conditions."
        case .conditionTooLong(let row): return "Condition \(row) is over 2,000 characters. Shorten it to send."
        case .reasonTooLong: return "Your reason is over 2,000 characters. Shorten it to send."
        }
    }

    static let recorded = "Your response is recorded."
    static let settledNoAnswer = "Reload to see where this request stands."
    static let signersChanged = "The signers on this request changed. Reload and review it again before you send. "
        + "Your words are kept."
    static let reviewAgain = "Reload and review again"
    static let refreshFailed = "Couldn’t refresh the agreed services."
    static let loading = "Loading the agreed services…"
    static let pastRequests = "Past requests"
    static let unavailable = "This request isn’t available to this account."

    static let conditionsLabel = "Your conditions"
    static let conditionPlaceholder = "A condition your studio needs to meet"
    static let addCondition = "Add another condition"
    static let conditionsHelp = "Add at least one condition."
    static let returnLabel = "Your reason"
    static let returnPlaceholder = "What needs to change before you accept"
    static let returnHelp = "A reason is required to return the services."

    static let responsesLabel = "Responses"
    static let you = "You"
    static let required = "Required"
    static let optional = "Optional"
    static let noResponseYet = "No response yet"
    static let back = "Back"
    static let close = "Close"
    static let reload = "Reload"
    static let tryAgain = "Try again"
    static let loadFailed = "Couldn’t load the agreed services."

    static func requestNumber(_ number: Int) -> String { "Request \(number)" }

    static func sent(_ when: String) -> String { "Sent \(when)" }

    static func choiceLabel(_ choice: ServiceAcceptanceChoice) -> String {
        switch choice {
        case .accept: return "Accept"
        case .acceptWithConditions: return "Accept with conditions"
        case .returnToStudio: return "Return"
        }
    }

    static func submitLabel(_ choice: ServiceAcceptanceChoice) -> String {
        switch choice {
        case .accept: return "Accept the agreed services"
        case .acceptWithConditions: return "Accept with these conditions"
        case .returnToStudio: return "Return to your studio"
        }
    }

    /// One line on the entry card and at the head of the detail.
    static func status(_ request: RemoteServiceAcceptanceRequest, settled: ServiceAcceptanceSettled? = nil) -> String {
        if let line = lifecycleStatus(request.lifecycle) ?? outcomeStatus(request.aggregateOutcome) {
            return line
        }
        if let settled { return settled.answer == nil ? settledNoAnswer : recorded }
        if request.canRespond { return "Waiting on your response." }
        if request.viewerResponse != nil { return "Your response is recorded. Waiting on the others." }
        switch request.viewerRole {
        case .signerOptional: return "Your response isn’t needed on this one."
        case .signerRequired, .observer: return "Waiting on the people your studio asked."
        }
    }

    static let readOnly = "Shown for your records."

    /// A lifecycle that ends the conversation, or one this build cannot read.
    private static func lifecycleStatus(_ lifecycle: ServiceAcceptanceLifecycle) -> String? {
        switch lifecycle {
        case .withdrawn: return "Your studio withdrew this request."
        case .superseded: return "A newer request replaced this one."
        case .draft, .unknown: return readOnly
        case .sent, .closed: return nil
        }
    }

    /// The server's derived outcome, once there is one.
    private static func outcomeStatus(_ outcome: ServiceAcceptanceOutcome) -> String? {
        switch outcome {
        case .accepted: return "Accepted."
        case .acceptedWithConditions: return "Accepted with conditions."
        case .returned: return "Returned to your studio."
        case .unknown: return readOnly
        case .pending: return nil
        }
    }

    /// Why a reader who is not a required signer sees no acts.
    static func roleNote(_ request: RemoteServiceAcceptanceRequest) -> String? {
        guard request.isOpen, !request.canRespond, request.viewerResponse == nil else { return nil }
        switch request.viewerRole {
        case .observer: return "You can follow this request. Someone else on the project was asked to respond."
        case .signerOptional: return "You’re listed on this request, but your response isn’t needed."
        case .signerRequired:
            // A required role whose own signer entry is missing or
            // inconsistent: malformed, so read-only.
            return request.viewerSigner == nil ? readOnly : nil
        }
    }

    static func response(_ kind: ServiceAcceptanceResponseKind) -> String {
        switch kind {
        case .accept: return "Accepted"
        case .acceptWithConditions: return "Accepted with conditions"
        case .return: return "Returned"
        case .unknown: return "Responded"
        }
    }

    static func method(_ method: ServiceAcceptanceMethod) -> String? {
        switch method {
        case .iosAuthenticated: return "in the app"
        case .portalAuthenticated: return "online"
        case .paperIntake: return "on paper"
        case .unknown: return nil
        }
    }

    /// A slot name as the studio wrote it, made readable.
    static func slot(_ raw: String) -> String {
        let words = raw.replacingOccurrences(of: "_", with: " ").trimmingCharacters(in: .whitespaces)
        guard let first = words.first else { return "Respondent" }
        return first.uppercased() + words.dropFirst()
    }

    // MARK: Studio service (C6). The client portal's wording (SQ-2232). It
    // never names a financial hold and never says the project is closed.

    static let studioServiceTitle = "Studio service"

    static func studioServiceStatus(_ status: StudioServiceStatus) -> String {
        switch status {
        case .complete:
            // U+2019, as every app literal types it (AppApostropheLintTests).
            return "The studio’s service is complete"
        case .completeWithConditions:
            return "Complete, with conditions still being resolved"
        case .notYet:
            return "The studio will confirm when its service is complete"
        }
    }

    static func studioServiceCompleted(_ when: String) -> String { "Completed \(when)" }

    static func acceptedScope(_ reading: StudioServiceReading) -> String? {
        guard let hash = reading.scopeContentHash else { return nil }
        let request = reading.requestNumber.map { " · \(requestNumber($0))" } ?? ""
        return "Accepted scope\(request) · \(shortReference(hash))"
    }

    static func refusal(_ refusal: ServiceAcceptanceRefusal) -> String {
        switch refusal {
        case .stale: return "Your studio updated this request since you opened it. Reload to see the current version."
        case .alreadyResponded: return "Your response is already on the record."
        case .requestNotOpen: return "This request is closed. Its final state is shown here."
        case .paused: return "Responses are paused for now. Nothing you’ve seen is lost."
        case .notYours: return "This request is no longer yours to answer."
        case .invalid:
            return "Your response is outside the limits: 1–20 conditions, each up to 2,000 characters, "
                + "or a reason up to 2,000 characters. Edit it to send."
        case .failed: return "That didn’t go through. Try again."
        }
    }
}
