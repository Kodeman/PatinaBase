//
//  PluralisationTests.swift
//  PatinaTests
//
//  C-30: the profile stat rendered "1 ROOMS". The accessibility label at the
//  same site already inflected correctly, so the bug was visible only to
//  people who could see it.
//
//  PROGRAM.md §3 · L1-E: "counts inflect ('1 ROOM', not '1 ROOMS') in the
//  visible label, not only in the accessibility label."
//
//  `ProfileView.swift` is L1-C's, so the site pin is wrapped — see
//  `ErrorVoiceTests`'s header. The claim-sheet half is L1-A's and is pinned
//  in `GuestPromiseTests`.
//

import Testing
import Foundation

struct PluralisationTests {

    /// `ProfileView` draws the stat row twice — stacked at accessibility text
    /// sizes and horizontally otherwise — and both call sites printed
    /// "1 ROOMS". Counting the inflected form catches a fix applied to only
    /// one of them.
    @Test("both room-count stat call sites inflect the visible label")
    func roomCountInflectsAtEveryCallSite() throws {
        withKnownIssue("deck row C-30 / ProfileView.swift:201,207 is L1-C's; unwrap after L1-C merges") {
            let source = try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
            let inflected = source.components(separatedBy: "roomCount == 1 ? \"Room\" : \"Rooms\"").count - 1
            #expect(inflected == 2, "expected both stat call sites to inflect; found \(inflected)")
            #expect(!source.contains("label: \"Rooms\")"), "a stat still passes the fixed plural")
        }
    }

    /// The original defect was a *disagreement*: the accessibility label
    /// inflected and the visible one did not. Pinning that the announcement
    /// is composed from the same `label` the eye reads is what stops the two
    /// diverging a second time.
    @Test("the stat's accessibility label is composed from the visible word")
    func statAccessibilityLabelSharesTheVisibleWord() throws {
        let source = try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
        #expect(
            source.contains(".accessibilityLabel(\"\\(label): \\(value)\")"),
            "the stat announcement no longer derives from the visible label; the two can diverge again"
        )
    }
}
