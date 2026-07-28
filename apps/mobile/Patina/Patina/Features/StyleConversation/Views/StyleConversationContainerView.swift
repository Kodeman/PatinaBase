//
//  StyleConversationContainerView.swift
//  Patina
//
//  Parent container for Movement 2: The Conversation.
//  Hosts all 5 questions with shared header + footer scaffolding.
//  Per PRD §4.6.
//

import SwiftUI
import SwiftData

struct StyleConversationContainerView: View {

    var viewModel: StyleConversationViewModel
    @Namespace private var whisperNamespace

    let onComplete: (StyleProfileResponse) -> Void

    @State private var currentProfile: StyleProfileResponse?
    /// Writes the resolved profile to `StylePreferenceModel` — the row Home
    /// and Profile read to decide whether a style profile exists.
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        ZStack {
            PatinaColors.Background.primary.ignoresSafeArea()

            if let profile = currentProfile {
                // Q5 → Contemplative Pause → onComplete
                ContemplativePauseView(
                    session: viewModel.session,
                    responses: viewModel.responses,
                    onComplete: { resolved in
                        finish(resolved)
                    }
                )
                // `currentProfile` guard above prevents re-running once resolved.
                // The outer `onComplete` forwards the resolved profile to the coordinator.
                .onAppear {
                    // Unused — the Task on .onAppear of ContemplativePauseView handles scoring.
                    _ = profile
                }
            } else {
                VStack(spacing: 0) {
                    ConversationHeaderView(
                        whisperTop: viewModel.whisperTop,
                        question: header.question,
                        subtext: header.subtext,
                        whisperGeometryNamespace: whisperNamespace
                    )
                    .padding(.bottom, 24)

                    Group {
                        switch viewModel.currentQuestion {
                        case 1: VisualResonanceView(viewModel: viewModel)
                        case 2: LifestyleRealityView(viewModel: viewModel)
                        case 3: MaterialConnectionView(viewModel: viewModel)
                        case 4: InvestmentPerspectiveView(viewModel: viewModel)
                        case 5: PriorityView(viewModel: viewModel)
                        default: EmptyView()
                        }
                    }

                    Spacer(minLength: 0)

                    if showContinueButton {
                        StyleContinueButton(isEnabled: continueEnabled) {
                            continueAction()
                        }
                        .padding(.horizontal, 24)
                        .padding(.bottom, 42)
                    }
                }
            }
        }
        .onAppear {
            viewModel.onFinished = { profile in
                finish(profile)
            }
        }
    }

    /// The conversation's one completion seam. Both routes in — the view
    /// model's `onFinished` and the Contemplative Pause's own scoring — land
    /// here, so the taste profile is persisted exactly where the profile is
    /// handed upward. The write is an upsert, so the double resolution the
    /// two routes produce leaves a single row.
    private func finish(_ profile: StyleProfileResponse) {
        currentProfile = profile
        viewModel.persistToSwiftData(context: modelContext, profile: profile)
        onComplete(profile)
    }

    // MARK: - Current-question configuration

    private var header: (question: String, subtext: String?) {
        switch viewModel.currentQuestion {
        case 1: return ("Which room speaks to you?", nil)
        case 2: return ("How do you actually live in this space?", "Select all that apply")
        case 3: return ("What texture calls to you?", "Choose up to three")
        case 4: return ("Let's talk about investment.", "What feels right for this room?")
        case 5: return ("What would change everything?", nil)
        default: return ("", nil)
        }
    }

    private var showContinueButton: Bool {
        // Q1, Q4, Q5 auto-advance — only Q2 and Q3 need Continue
        switch viewModel.currentQuestion {
        case 2, 3: return true
        default: return false
        }
    }

    private var continueEnabled: Bool {
        switch viewModel.currentQuestion {
        case 2: return viewModel.canContinueQ2
        case 3: return viewModel.canContinueQ3
        default: return false
        }
    }

    private func continueAction() {
        switch viewModel.currentQuestion {
        case 2: viewModel.submitQ2()
        case 3: viewModel.submitQ3()
        default: break
        }
    }
}
