//
//  WalkQuestion.swift
//  Patina
//
//  Questions asked during the room walk to understand user preferences.
//  Questions only appear when the user is stationary.
//

import Foundation

/// A question to ask during the walk
public struct WalkQuestion: Identifiable, Equatable {
    public let id: String
    public let text: String
    public let options: [QuestionOption]
    public let styleSignalKey: String
    public let triggerCondition: QuestionTrigger
    public let allowsTextInput: Bool

    public init(
        id: String,
        text: String,
        options: [QuestionOption],
        styleSignalKey: String,
        triggerCondition: QuestionTrigger,
        allowsTextInput: Bool = false
    ) {
        self.id = id
        self.text = text
        self.options = options
        self.styleSignalKey = styleSignalKey
        self.triggerCondition = triggerCondition
        self.allowsTextInput = allowsTextInput
    }
}

/// An option for a walk question
public struct QuestionOption: Identifiable, Equatable {
    public let id: String
    public let text: String
    public let value: String

    public init(id: String = UUID().uuidString, text: String, value: String) {
        self.id = id
        self.text = text
        self.value = value
    }
}

/// Trigger condition for when to show a question
public enum QuestionTrigger: Equatable {
    /// Show after a certain time in the walk
    case timeInWalk(seconds: Int)

    /// Show after detecting a specific feature
    case featureDetected(FeatureCategory)

    /// Show when user has been stationary for a duration
    case userStationary(seconds: Int)
}

// MARK: - Predefined Questions

extension WalkQuestion {

    /// All questions for the first walk (in order of priority)
    public static let firstWalkQuestions: [WalkQuestion] = [
        .timeOfDayQuestion,
        .lightPreferenceQuestion,
        .seatingPreferenceQuestion,
        .roomFeelingQuestion
    ]

    /// Time of day preference question
    public static let timeOfDayQuestion = WalkQuestion(
        id: "time_of_day",
        text: "This room — is it where you spend your mornings, or evenings?",
        options: [
            QuestionOption(text: "Mornings", value: "mornings"),
            QuestionOption(text: "Evenings", value: "evenings"),
            QuestionOption(text: "Both", value: "both")
        ],
        styleSignalKey: "timeOfDay",
        triggerCondition: .timeInWalk(seconds: 45)
    )

    /// Light preference question
    public static let lightPreferenceQuestion = WalkQuestion(
        id: "light_preference",
        text: "That light... do you like it soft and diffused, or do you let the sun pour in?",
        options: [
            QuestionOption(text: "Soft", value: "soft"),
            QuestionOption(text: "Pour in", value: "direct"),
            QuestionOption(text: "Depends on mood", value: "depends")
        ],
        styleSignalKey: "lightPreference",
        triggerCondition: .featureDetected(.window)
    )

    /// Seating preference question
    public static let seatingPreferenceQuestion = WalkQuestion(
        id: "seating_preference",
        text: "When you imagine yourself here, truly relaxed — are you sitting up or sinking in?",
        options: [
            QuestionOption(text: "Sitting up", value: "sitting_up"),
            QuestionOption(text: "Sinking in", value: "sinking_in")
        ],
        styleSignalKey: "seatingPreference",
        triggerCondition: .featureDetected(.seatingArea)
    )

    /// Room feeling word question (free-form)
    public static let roomFeelingQuestion = WalkQuestion(
        id: "room_feeling",
        text: "What word comes to mind for this space? Not what it is, but what you want it to feel like.",
        options: [], // No predefined options for text input
        styleSignalKey: "roomFeeling",
        triggerCondition: .timeInWalk(seconds: 120),
        allowsTextInput: true
    )
}

// MARK: - Question Answer

/// A recorded answer to a walk question
public struct QuestionAnswer: Codable, Equatable {
    public let questionId: String
    public let value: String
    public let answeredAt: Date

    public init(questionId: String, value: String, answeredAt: Date = Date()) {
        self.questionId = questionId
        self.value = value
        self.answeredAt = answeredAt
    }
}
