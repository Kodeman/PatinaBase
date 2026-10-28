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

    /// The statement a required signer accepts. Exact wording, per WP-10C-d.
    static let acceptStatement = "You confirm the studio delivered the service described in this agreed scope."
    static let returnStatement = "Your studio gets your reason and prepares a new request. Nothing is accepted."

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
    static func status(_ request: RemoteServiceAcceptanceRequest) -> String {
        if let line = lifecycleStatus(request.lifecycle) ?? outcomeStatus(request.aggregateOutcome) {
            return line
        }
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
        case .signerRequired: return nil
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

    static func refusal(_ refusal: ServiceAcceptanceRefusal) -> String {
        switch refusal {
        case .stale: return "Your studio updated this request since you opened it. Reload to see the current version."
        case .alreadyResponded: return "Your response is already on the record."
        case .requestNotOpen: return "This request is closed. Its final state is shown here."
        case .paused: return "Responses are paused for now. Nothing you’ve seen is lost."
        case .notYours: return "This request is no longer yours to answer."
        case .failed: return "That didn’t go through. Try again."
        }
    }
}
