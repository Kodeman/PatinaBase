//
//  ApprovalDiscussionBlock.swift
//  Patina
//
//  `IOSC-R2-01`. What is written on this approval, hers and the studio's,
//  oldest first.
//
//  The note a homeowner writes with a Return lands here (`ApprovalNoteWriter`
//  → `decision_comments`) and nothing on the phone read it back, so her own
//  sentence vanished the moment she sent it — "Discuss this with your
//  designer" opens the project thread, which is deliberately not where the
//  note went. The web has drawn this thread since the Threshold
//  (`approval-ask.tsx`'s `Discussion`).
//
//  Quiet where there is nothing to read: an approval with no notes draws no
//  heading and no empty state. There is no composer — the change-note
//  composer on the return is the one place a note is written on this surface,
//  and a second field here would be a second rail into the table `IOSC-02`
//  narrowed to one.
//
//  A third file on the Stage-2 branch, and `ProjectApprovalActTests
//  .theStage2BranchHasNoStatusColour` reads all three: the branch-wide refusal
//  is only worth its name while it covers every view the branch draws.
//
//  Its own file rather than another member of `ProjectApprovalBlock` because
//  that struct is at SwiftLint's 300-line `type_body_length`.
//

import SwiftUI

struct ApprovalDiscussionBlock: View {
    let decisionId: String?
    /// What the read is keyed on. Owned by the view model
    /// (`approvalDiscussionKey`) because the moment to reread is a fact about
    /// the ceremony — after an act has finished recording, note and all — and
    /// not one this view can see.
    let readKey: String
    let designerGivenName: String?
    let studioName: String?

    @State private var discussion = ApprovalDiscussion()

    var body: some View {
        content
            .task(id: readKey) {
                await discussion.load(decisionId: decisionId)
            }
    }

    @ViewBuilder
    private var content: some View {
        if !discussion.comments.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                MonoLabel(text: ProjectApprovalCopy.discussionLabel)
                    .tracking(2)
                ForEach(discussion.comments) { comment in
                    note(comment)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("decisionDetail.approval.discussion")
        } else if discussion.isUnreadable {
            Text(ProjectApprovalCopy.discussionUnreadable)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("decisionDetail.approval.discussionUnreadable")
        }
    }

    private func note(_ comment: ApprovalComment) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: ProjectApprovalCopy.noteAttribution(
                isMine: discussion.isMine(comment),
                designer: designerGivenName,
                studio: studioName,
                date: DateDisplay.fromTimestamp(comment.createdAt)
            ))
            Text(comment.body)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
