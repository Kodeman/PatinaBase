//
//  ContemplativePauseView.swift
//  Patina
//
//  Screen 15: The Contemplative Pause. Emotional buffer between Conversation
//  and Reveal. Aesthete Engine API call happens here.
//  Per PRD §4.7.
//

import SwiftUI

struct ContemplativePauseView: View {

    let session: RoomScanSession
    let responses: StyleResponseModel
    let onComplete: (StyleProfileResponse) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dotScales: [CGFloat] = [1, 1, 1]

    private let engine: AestheteEngineService = AestheteEngine.make()

    var body: some View {
        ZStack {
            PatinaColors.Background.primary.ignoresSafeArea()

            VStack(spacing: 32) {
                Text("Let me think about this.")
                    .font(.custom("PlayfairDisplay-Italic", size: 20, relativeTo: .title3))
                    .foregroundStyle(PatinaColors.Text.primary.opacity(0.6))

                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { i in
                        Circle()
                            .fill(PatinaColors.clay)
                            .frame(width: 4, height: 4)
                            .scaleEffect(dotScales[i])
                    }
                }
            }
        }
        .onAppear {
            startDotAnimation()
            runScoring()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Thinking about your style"))
    }

    private func startDotAnimation() {
        guard !reduceMotion else { return }
        for i in 0..<3 {
            withAnimation(
                .easeInOut(duration: 1.5)
                    .repeatForever(autoreverses: true)
                    .delay(Double(i) * 0.3)
            ) {
                dotScales[i] = 2.0
            }
        }
    }

    private func runScoring() {
        Task {
            async let minPause: Void = Task.sleep(nanoseconds: 1_200_000_000)
            async let profileTask: StyleProfileResponse = {
                let request = StyleScoreRequest(
                    userId: session.userId,
                    roomId: session.sessionId.uuidString,
                    responses: responses,
                    roomType: session.features.roomType
                )
                do {
                    return try await engine.score(request)
                } catch {
                    // Fall back to local if the HTTP client is in use and fails
                    return try await LocalAestheteEngine().score(request)
                }
            }()

            do {
                let (_, profile) = try await (minPause, profileTask)
                StyleProfileStore.shared.save(profile)
                await MainActor.run { onComplete(profile) }
            } catch {
                // Should never hit this — LocalAestheteEngine doesn't throw.
                let fallback = try? await LocalAestheteEngine().score(
                    StyleScoreRequest(
                        userId: session.userId,
                        roomId: session.sessionId.uuidString,
                        responses: responses,
                        roomType: session.features.roomType
                    )
                )
                if let fallback {
                    StyleProfileStore.shared.save(fallback)
                    await MainActor.run { onComplete(fallback) }
                }
            }
        }
    }
}
