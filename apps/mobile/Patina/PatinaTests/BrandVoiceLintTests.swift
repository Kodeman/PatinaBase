//
//  BrandVoiceLintTests.swift
//  PatinaTests
//
//  C5-20: "Start Your Journey" and "Join the furniture discovery journey"
//  are brand-voice violations — `.claude/skills/patina-brand-voice/SKILL.md`'s
//  lexicon bans "journey", "curated", "elevated", "disrupt", "revolutionize"
//  in consumer copy, and the app-wide sweep (assignment note 9) is already
//  clean of the AI-word set.
//
//  A-06: the apostrophe half. The finding's fix line is "sweep every
//  user-facing string for U+2019; **add a lint rule**" —
//  `apostrophesAreCurly` is that rule.
//
//  The lint reads **double-quoted string literals only**, never comments or
//  identifiers: a future `elevatedSurface` token or a comment quoting a
//  finding title is not user-facing copy and must not fail the gate.
//  Interpolated expressions are stripped before the scan for the same
//  reason — `\(PatinaTypography.bodySmallMedium)` is code that happens to
//  contain "llm".
//
//  Scoped to the files this wave's deck touches, not the whole app — W2 ·
//  L1-E's 48-row table is the full sweep.
//
//  `RL1E2-01`: the scan used to read `deckFiles` alone — the nine files this
//  lane owns — so every deck row an OTHER lane applies was unchecked, and
//  five of them landed with U+0027. The second half of this file pins one
//  `@Test` per cross-lane file. Files that are clean today are pinned
//  **unwrapped**, so the gate goes red at the deck pass if the owning lane
//  lands a straight apostrophe; files that are dirty today are wrapped in
//  `withKnownIssue`, which unwraps when the row lands.
//

import Testing
import Foundation

struct BrandVoiceLintTests {

    private static let bannedWords = [
        "journey", "curated", "curation", "elevated", "disrupt", "revolutioniz"
    ]

    /// `RL1E2-18`: these were once `" gpt"` / `" llm"` — leading-space needles
    /// that a literal beginning "GPT-4 …" or containing "ChatGPT" walked
    /// straight past. Plain `contains` instead: no word in consumer copy
    /// carries "gpt" or "llm", the scan reads a fixed file list, and a false
    /// positive would be visible the moment it appeared.
    private static let aiWords = [
        "artificial intelligence", "machine learning", "gpt", "llm"
    ]

    /// Every double-quoted string literal in a Swift source, with line
    /// comments, block comments and identifiers excluded. Multi-line (`"""`)
    /// literals are returned as one string each.
    static func stringLiterals(in source: String) -> [String] {
        let chars = Array(source)
        var literals: [String] = []
        var index = 0
        while index < chars.count {
            if let next = endOfComment(chars, at: index) {
                index = next
            } else if let (literal, next) = literal(chars, at: index) {
                literals.append(literal)
                index = next
            } else {
                index += 1
            }
        }
        return literals
    }

    /// The index just past a `//` or `/* */` comment starting at `index`,
    /// or `nil` if one does not start there.
    private static func endOfComment(_ chars: [Character], at index: Int) -> Int? {
        guard chars[index] == "/", index + 1 < chars.count else { return nil }
        if chars[index + 1] == "/" {
            var cursor = index
            while cursor < chars.count, chars[cursor] != "\n" { cursor += 1 }
            return cursor
        }
        guard chars[index + 1] == "*" else { return nil }
        var cursor = index + 2
        while cursor + 1 < chars.count, !(chars[cursor] == "*" && chars[cursor + 1] == "/") {
            cursor += 1
        }
        return min(cursor + 2, chars.count)
    }

    private static func literal(_ chars: [Character], at index: Int) -> (String, Int)? {
        guard chars[index] == "\"" else { return nil }
        if isTripleQuote(chars, at: index) { return multilineLiteral(chars, at: index) }
        return singleLineLiteral(chars, at: index)
    }

    private static func isTripleQuote(_ chars: [Character], at index: Int) -> Bool {
        index + 2 < chars.count
            && chars[index] == "\"" && chars[index + 1] == "\"" && chars[index + 2] == "\""
    }

    private static func multilineLiteral(_ chars: [Character], at index: Int) -> (String, Int) {
        var cursor = index + 3
        var current = ""
        while cursor + 2 < chars.count, !isTripleQuote(chars, at: cursor) {
            current.append(chars[cursor])
            cursor += 1
        }
        return (current, min(cursor + 3, chars.count))
    }

    private static func singleLineLiteral(_ chars: [Character], at index: Int) -> (String, Int) {
        var cursor = index + 1
        var current = ""
        while cursor < chars.count, chars[cursor] != "\"", chars[cursor] != "\n" {
            if chars[cursor] == "\\", cursor + 1 < chars.count {
                current.append(chars[cursor])
                cursor += 1
            }
            current.append(chars[cursor])
            cursor += 1
        }
        let closed = cursor < chars.count && chars[cursor] == "\""
        return (current, closed ? cursor + 1 : cursor)
    }

    /// The reader-facing half of a literal: interpolated expressions removed.
    private static func copyText(_ literal: String) -> String {
        literal.replacingOccurrences(
            of: #"\\\([^)]*\)"#, with: " ", options: .regularExpression
        )
    }

    /// A→E-5, applied at merge 6. `lint` walked every string literal, so
    /// `QuizOption(key: "eclectic_curated")` and `key: "curated_comfort"`
    /// were read as copy — both carry "curated", which is on `bannedWords`.
    /// They are wire keys: `StyleQuizViewModel` matches on them and
    /// `styleQuizWireKeysAreUnchanged` requires them to stay, so the two pins
    /// would have been in direct conflict. The exclusion is exactly one
    /// argument label wide; a banned word in a `label:` still fails.
    private static let wireArgumentLabels = ["key"]

    /// The values of the wire-key arguments in a source, which are code the
    /// server reads rather than words a person does.
    private static func wireKeyValues(in source: String) -> Set<String> {
        var out: Set<String> = []
        for label in wireArgumentLabels {
            let pattern = "\\b" + label + "\\s*:\\s*\"([^\"]*)\""
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            let range = NSRange(source.startIndex..., in: source)
            for match in regex.matches(in: source, range: range) {
                if let value = Range(match.range(at: 1), in: source) {
                    out.insert(String(source[value]))
                }
            }
        }
        return out
    }

    /// Every literal a reader can see: `stringLiterals` less the wire keys.
    static func copyLiterals(in source: String) -> [String] {
        let wire = wireKeyValues(in: source)
        return stringLiterals(in: source).filter { !wire.contains($0) }
    }

    private static func lint(_ source: String, file: String) {
        for literal in copyLiterals(in: source).map(copyText) {
            let lower = literal.lowercased()
            for word in bannedWords {
                #expect(!lower.contains(word), "\(file) ships \"\(literal)\" — banned lexicon word \"\(word)\"")
            }
            for word in aiWords {
                #expect(!lower.contains(word), "\(file) ships \"\(literal)\" — AI-label phrase \"\(word)\"")
            }
            #expect(
                literal.range(of: #"(?<![A-Za-z])AI(?![A-Za-z])"#, options: .regularExpression) == nil,
                "\(file) ships \"\(literal)\" — the standalone word AI"
            )
        }
    }

    /// A-06's lint rule: one apostrophe glyph, U+2019, in anything a reader
    /// sees. Only apostrophes *between letters* are checked, so a literal
    /// carrying a Swift selector or a possessive-free path is untouched.
    static func lintApostrophes(_ source: String, file: String) {
        for literal in copyLiterals(in: source) {
            // The reader-facing scan, with interpolations removed.
            let copy = copyText(literal)
            #expect(
                copy.range(of: "[A-Za-z]'[A-Za-z]", options: .regularExpression) == nil,
                "\(file) ships \"\(copy)\" with a straight apostrophe (U+0027); A-06 wants U+2019"
            )
            // …and the possessive that hangs off an interpolation, which the
            // scan above cannot see: `copyText` turns `\(room.name)'s` into
            // ` 's`, so "Your Living Room's longest wall is 18 ft." passed the
            // lint for the whole of W1 while rendering a straight apostrophe on
            // screen (`W1-B-07`). Read on the RAW literal, where the closing
            // paren of the interpolation is still there to anchor against.
            #expect(
                literal.range(of: "\\)'[A-Za-z]", options: .regularExpression) == nil,
                "\(file) ships \"\(literal)\" with a straight apostrophe after an interpolation"
            )
        }
    }

    /// Every directory this lane owns, as **globs** rather than named files.
    ///
    /// `RL1E3-03` added the first two, after `deckFiles` named one file of
    /// `Services/DesignServices/`'s four and the other three carried eleven
    /// straight apostrophes.
    ///
    /// `RL1E4-01` adds the remaining four. PROGRAM.md §3 · L1-E's ownership
    /// rule is "the three files it owns outright **and any file no other W1
    /// lane owns**" — a clause the deck already edits under
    /// (`Services/Companion/**`, `Features/Collections/Views/**`,
    /// `App/Coordinators/Coordinator.swift`, `Features/Conversation/**`) while
    /// the lint only walked the two directories named as globs. Every
    /// directory the lane edits in is walked now, so "L1-E's files are swept"
    /// means the ownership set and not a subset of it.
    private static let ownedDirectories = [
        "Patina/Features/ARPlacement",
        "Patina/Services/DesignServices",
        "Patina/Features/DesignServices",
        "Patina/Services/Companion",
        "Patina/Features/Collections/Views",
        "Patina/Features/Conversation"
    ]

    /// The one file inside `ownedDirectories` another lane owns:
    /// `steward.md` §5.4 gives `Features/DesignServices/DesignerConsultationView.swift`
    /// to **L1-C**. Excluded from the walk rather than swept here, so a row in
    /// it goes to L1-C as a deck row like every other cross-lane row.
    private static let ownedGlobExclusions = [
        "Patina/Features/DesignServices/DesignerConsultationView.swift"
    ]

    /// Every `.swift` file under `ownedDirectories`, as (readable path, source).
    private static func ownedGlobSources() throws -> [(path: String, source: String)] {
        try ownedDirectories.flatMap { directory in
            try SourcePin.swiftFiles(under: directory).compactMap { absolute in
                let readable = absolute.components(separatedBy: "/apps/mobile/Patina/").last ?? absolute
                guard !ownedGlobExclusions.contains(readable) else { return nil }
                return (readable, try String(contentsOfFile: absolute, encoding: .utf8))
            }
        }
    }

    /// The files whose copy this wave's deck rewrites, and which this lane
    /// owns outright. `PatinaDesignKit` sits beside the app target, hence the
    /// `../` prefix `SourcePin` resolves. Files inside `ownedDirectories` are
    /// deliberately absent — the walk above covers them, and a file in two
    /// lists is a file whose real coverage nobody can read off the source.
    private static let deckFiles = [
        "Patina/Design/Components/PatinaErrorState.swift",
        "../PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift",
        // `RL1E4-01`: this lane's pin on `Coordinator.swift`. `AppCoordinator.swift`
        // is L1-F's whole file; `Coordinator.swift` is a different file in no
        // lane's glob, so it is named here rather than by walking
        // `App/Coordinators/`, which would drag L1-F's file in with it.
        "Patina/App/Coordinators/Coordinator.swift",
        "Patina/Features/Collections/ViewModels/CollectionsViewModel.swift",
        // `RL1E2-03`: PROGRAM.md §3 lists this file FIRST under "files it owns
        // outright" and the scan never read it; eleven of its sentences were
        // still U+0027, several on the invoice branch D10 makes live.
        "Patina/Features/Purchase/OrderFailureCopy.swift"
    ]

    @Test("every file this wave's copy deck touches carries no brand-voice violation")
    func deckFilesAreClean() throws {
        for path in Self.deckFiles {
            Self.lint(try SourcePin.read(path), file: path)
        }
    }

    @Test("every file this lane owns types its apostrophes as U+2019 (A-06)")
    func apostrophesAreCurly() throws {
        for path in Self.deckFiles {
            Self.lintApostrophes(try SourcePin.read(path), file: path)
        }
    }

    // MARK: - The globs this lane owns outright (`RL1E3-03`)

    /// Thirty-one files today: three under `Features/ARPlacement`, four under
    /// `Services/DesignServices`, thirteen under `Features/DesignServices`
    /// (fourteen less L1-C's `DesignerConsultationView.swift`), four under
    /// `Services/Companion`, four under `Features/Collections/Views` and three
    /// under `Features/Conversation`. The count is asserted so a moved or
    /// renamed directory is a hard failure rather than an empty set that
    /// passes.
    private static let ownedGlobFileCount = 31

    @Test("every file in L1-E's own globs carries no brand-voice violation")
    func ownedGlobsAreClean() throws {
        let files = try Self.ownedGlobSources()
        #expect(
            files.count >= Self.ownedGlobFileCount,
            "the owned-glob walk found \(files.count) files, not \(Self.ownedGlobFileCount)"
        )
        for file in files {
            Self.lint(file.source, file: file.path)
        }
    }

    @Test("every file in L1-E's own globs types its apostrophes as U+2019 (A-06)")
    func ownedGlobApostrophesAreCurly() throws {
        let files = try Self.ownedGlobSources()
        #expect(
            files.count >= Self.ownedGlobFileCount,
            "the owned-glob walk found \(files.count) files, not \(Self.ownedGlobFileCount)"
        )
        for file in files {
            Self.lintApostrophes(file.source, file: file.path)
        }
    }
}

// MARK: - The deck's rows in files another lane owns (`RL1E2-01`)

/// `RL1E4-01`: the cross-lane pins live in an extension rather than in the
/// suite's own body. Adding the `DesignerConsultationView` pin took the struct
/// past SwiftLint's 300-line `type_body_length`, and the honest fix is that
/// this half of the file is a different job from the lint engine above it —
/// one `@Test` per file another lane owns, growing by one every review round.
/// Swift Testing associates a `@Test` in an extension with the extended suite,
/// so the suite and its count are unchanged.
extension BrandVoiceLintTests {

    // One `@Test` per file, so a half-applied group cannot hide behind a
    // sibling assertion (`RL1E2-05`), and every read is hoisted out of the
    // wrapper, so a file another lane renames is a hard failure rather than a
    // satisfied known issue (`RL1E2-15`).

    private static func pinCleanToday(_ path: String) throws {
        lintApostrophes(try SourcePin.read(path), file: path)
    }

    private static func pinDirtyToday(_ path: String, row: Comment) throws {
        let source = try SourcePin.read(path)
        withKnownIssue(row) { lintApostrophes(source, file: path) }
    }

    @Test("L1-A · the delete-account sentences type their apostrophes as U+2019")
    func accountDeletionApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Features/Account/AccountDeletionService.swift")
    }

    @Test("L1-A · the style quiz's sentences type their apostrophes as U+2019")
    func styleQuizApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Features/StyleQuiz/Models/QuizModels.swift")
    }

    /// Clean today — the only two straight apostrophes in this file are in
    /// comments — so this is an unwrapped gate. `first-flight/w1-l1b` adds
    /// `"We didn't get a response."` here for `C4-08`, with U+0027; that is
    /// the failure this pin is written to catch at the deck pass.
    @Test("L1-B · RoomsAPIError's sentences type their apostrophes as U+2019")
    func roomsAPIClientApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Core/Network/RoomsAPIClient.swift")
    }

    @Test("L1-B · the money rail's sentences type their apostrophes as U+2019")
    func moneyFailureCopyApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Features/Money/MoneyFailureCopy.swift")
    }

    @Test("L1-B · the scan review screen's sentences type their apostrophes as U+2019")
    func scanReviewApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Features/RoomScan/Views/ScanReviewView.swift")
    }

    @Test("L1-B · the scan walk screen's sentences type their apostrophes as U+2019")
    func scanWalkApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Features/RoomScan/Views/ScanWalkView.swift")
    }

    @Test("L1-B · the style response model's display names type their apostrophes as U+2019")
    func styleResponseModelApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Features/RoomScan/Shared/Models/StyleResponseModel.swift")
    }

    @Test("L1-C · the Today story's retry row types its apostrophes as U+2019")
    func homeStoryRetryRowApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Features/Home/Views/HomeStoryRetryRow.swift")
    }

    /// `RL1E3-01`: the one file carrying a sentence *this deck wrote*
    /// (`A-52`'s `"See what’s on Patina"`) had no apostrophe pin at all, and
    /// L1-C landed it with U+0027. Round 4's note to L1-C carries the byte.
    @Test("L1-C · the Companion's action rows type their apostrophes as U+2019")
    func companionActionRowsApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Features/Companion/Services/CompanionActionRows.swift")
    }

    /// `RL1E4-01`: the one file inside this lane's widened walk that another
    /// lane owns. It is excluded from `ownedDirectories` and pinned here
    /// instead, so the row goes to L1-C like every other cross-lane row.
    /// Two recorded issues on this branch; one after L1-C merges, because
    /// `A1-14` deletes `designerCard` and `:68` with it.
    @Test("L1-C · the consultation hero types its apostrophes as U+2019")
    func designerConsultationApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Features/DesignServices/DesignerConsultationView.swift")
    }

    /// `RL1E3-04`: L1-F is the one lane the round-3 sweep skipped entirely,
    /// and its new send-failure sentence (`:413`, rendered at
    /// `ThreadDetailView.swift:198`) ships with U+0027 and had no deck row.
    @Test("L1-F · the message send-failure sentence types its apostrophes as U+2019")
    func messagingViewModelApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Features/Messaging/ViewModels/MessagingViewModel.swift")
    }

    /// The two files below do **not** exist on this branch — L1-B creates
    /// them in its own wave. The `SourcePin.read` therefore stays *inside*
    /// the wrapper: the throw is the recorded known issue, and it is what
    /// "the row has not landed yet" looks like for a file that arrives with
    /// the row. At the deck pass both reads move outside, like every other
    /// pin in this file.
    @Test("L1-B · the scan upload failure copy types its apostrophes as U+2019")
    func scanUploadFailureCopyApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Features/RoomScan/Shared/Components/ScanUploadFailureCopy.swift")
    }

    @Test("L1-B · the local-store recovery notice types its apostrophes as U+2019")
    func localStoreRecoveryNoticeApostrophesAreCurly() throws {
        try Self.pinCleanToday("Patina/Core/Persistence/LocalStoreRecoveryNotice.swift")
    }

    // MARK: - Brand-voice violations in files another lane owns

    @Test("the onboarding carousel carries no brand-voice violation")
    func onboardingIsClean() throws {
        let path = "Patina/Features/Onboarding/Views/OnboardingFlowView.swift"
        let source = try SourcePin.read(path)
        Self.lint(source, file: path)
    }

    @Test("the authentication screens carry no brand-voice violation")
    func authenticationIsClean() throws {
        let path = "Patina/Features/Authentication/Views/AuthenticationView.swift"
        let source = try SourcePin.read(path)
        Self.lint(source, file: path)
    }

    /// `RL1E2-02`: this test used to hand-write six `contains` assertions,
    /// so the file's *other* literals were never scanned — and question 5 of
    /// 5 of the mandatory first-run quiz asks "What's driving your design
    /// journey?", the one word `C5-20` is filed about. The whole file is
    /// linted now. `Features/StyleQuiz/**` is L1-A's.
    @Test("the style quiz's labels and questions carry no brand-voice violation")
    func styleQuizIsClean() throws {
        let path = "Patina/Features/StyleQuiz/Models/QuizModels.swift"
        let source = try SourcePin.read(path)
        Self.lint(source, file: path)
    }

    @Test("the style quiz's renamed labels read as the deck writes them")
    func styleQuizLabelsAreRenamed() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Models/QuizModels.swift")
        #expect(source.contains("label: \"Collected Eclectic\""))
        #expect(source.contains("label: \"Considered Comfort\""))
        #expect(source.contains("title: \"What’s bringing you here?\""))
    }

    /// Unwrapped, and permanently so: the wire keys feed the spectrum mapping
    /// (`StyleQuizViewModel.swift:221,242,296`) and the budget lookup. A copy
    /// rename that takes them with it is a silent behaviour change.
    @Test("the style quiz's wire keys survive the label rename untouched")
    func styleQuizWireKeysAreUnchanged() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Models/QuizModels.swift")
        #expect(source.contains("key: \"eclectic_curated\""))
        #expect(source.contains("key: \"curated_comfort\""))
    }

    /// `RL1E2-19`: a second display-name table names the same budget band
    /// `"Curated Comfort"`, so renaming only the quiz label would leave the
    /// app saying both. `Features/RoomScan/**` is L1-B's.
    @Test("the style response model's display names carry no brand-voice violation")
    func styleResponseModelIsClean() throws {
        let path = "Patina/Features/RoomScan/Shared/Models/StyleResponseModel.swift"
        let source = try SourcePin.read(path)
        // Both deck rows landed (`:23` "Collected Mix", `:97` "Considered
        // Comfort"). What is left is `case curatedMix = "curated_mix"` — an
        // enum RAW VALUE the server reads, which the deck rules must not be
        // renamed, and which `wireArgumentLabels` cannot reach because it is
        // not an argument. W2 · L1-E's call: widen the exclusion to raw
        // values, or move the lint off this file.
        withKnownIssue("StyleResponseModel.swift's remaining hit is the wire raw value curated_mix, which the deck rules stays") {
            Self.lint(source, file: path)
        }
    }

    @Test("the named aesthetics carry no brand-voice violation")
    func namedAestheticIsClean() throws {
        let path = "Patina/Features/RoomScan/Shared/Models/NamedAesthetic.swift"
        let source = try SourcePin.read(path)
        Self.lint(source, file: path)
    }
}
