//
//  HomeStoryRetryRow.swift
//  Patina
//
//  Today's editorial story failed to load. A slim retry in the story slot —
//  the alternative was an unexplained gap where the hero belongs (U29).
//
//  Re-homed out of `DailyRoomStateBlocks.swift` (Q4 hygiene pass, W2 R3):
//  that file's other two structs (`HomeStudioBlock`, `HomeFilteredFeedEmpty`)
//  were the dead July home-rail composition and were deleted outright: zero
//  production call sites (grep, `waves/w2/r3-tasks.md` §0). This struct is
//  the one piece of that file a live surface still needs — `DailyRoomView.swift`
//  calls it on a story-load failure — so it moved rather than went with the
//  rest. The signature is unchanged; the call site required no edit.
//

import SwiftUI

struct HomeStoryRetryRow: View {
    let onRetry: () -> Void

    var body: some View {
        HStack(spacing: PatinaSpacing.sm) {
            Text("Today's story couldn't load")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)

            Spacer(minLength: PatinaSpacing.xs)

            Button(action: onRetry) {
                Text("Let's try that again")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .frame(minHeight: 44)
        .padding(.horizontal, 20)
        .padding(.top, 14)
    }
}

#Preview {
    HomeStoryRetryRow(onRetry: {})
        .background(PatinaColors.Background.primary)
}
