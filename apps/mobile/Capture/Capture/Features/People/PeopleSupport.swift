//  PeopleSupport.swift
//  Capture · W5 (the People room, on the job)
//
//  Presentation shared by PR1/PR2/PR3: the four word families' pigment, the
//  `tel:` line (its own ≥44pt target, never nested inside the row's button),
//  the held clause's terracotta leading rule, and the "last loaded" line a
//  cached copy prints instead of a spinner.

import SwiftUI
import CaptureKit

// MARK: - Words

/// The four families (direction §3.8). Current reads sage, pending golden,
/// blocked terracotta, dormant quiet — one map, so reach, consent, stage and
/// paper can never disagree about what a word means.
enum PeopleWord {
    static func tint(_ word: String) -> Color {
        switch word {
        case "Account", "Texting", "On the job", "Current":
            return CaptureColor.success
        case "Field link", "Invited", "Awarded", "Bidding", "Closing out", "Lapses in 30 days":
            return CaptureColor.goldenHour
        case "Opted out", "Lapsed":
            return CaptureColor.terracotta
        default:
            return CaptureColor.inkSoft
        }
    }
}

/// A word, printed plain. Not a badge, not a dot — the room prints words.
struct PeopleWordLabel: View {
    let word: String

    var body: some View {
        Text(word)
            .font(CaptureType.footnote)
            .foregroundStyle(PeopleWord.tint(word))
    }
}

/// Authority and other plain facts: uncoloured, never a state word (§3.8).
struct PeoplePlainWords: View {
    let words: [String]

    var body: some View {
        ForEach(words, id: \.self) { word in
            Text(word)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.ink2)
        }
    }
}

// MARK: - Clauses

/// A clause in words with a 2px leading rule — terracotta when it blocks,
/// quiet when it merely rules (§A14, R-S).
struct PeopleClause: View {
    let text: String
    var blocks: Bool = false
    var routedTo: String?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Rectangle()
                .fill(blocks ? CaptureColor.terracotta : CaptureColor.line2)
                .frame(width: 2)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(text)
                    .font(CaptureType.footnote)
                    .foregroundStyle(blocks ? CaptureColor.terracotta : CaptureColor.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                if let routedTo {
                    Text("Write \(routedTo).")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - The tel: line

/// A phone, as a tap target of its own. FM-6: an anchor may not live inside the
/// row's button, so the row and the number are two sibling controls; this one
/// is the full width of the row and at least 44pt tall (R-X).
struct PeopleTelLine: View {
    let display: String?
    let e164: String?
    /// Words printed on the same line — reach, then stage.
    var words: [String] = []
    var identifier: String?

    private var url: URL? { FieldPhoneLine.telURL(e164: e164, display: display) }

    var body: some View {
        if let url, let display {
            Link(destination: url) { line(display, dialable: true) }
                .buttonStyle(.plain)
                .accessibilityLabel("Call \(display)")
                .accessibilityAddTraits(.isButton)
                .modifier(OptionalIdentifier(identifier: identifier))
        } else {
            line(display ?? FieldPhoneLine.noPhone, dialable: false)
                .accessibilityElement(children: .combine)
        }
    }

    private func line(_ text: String, dialable: Bool) -> some View {
        HStack(spacing: 10) {
            ForEach(words, id: \.self) { PeopleWordLabel(word: $0) }
            Spacer(minLength: 8)
            Text(text)
                .font(dialable ? CaptureType.bodyEmph : CaptureType.footnote)
                .foregroundStyle(dialable ? CaptureColor.verdigrisInk : CaptureColor.inkSoft)
            if dialable {
                Image(systemName: "phone")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.verdigrisInk)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }
}

/// `accessibilityIdentifier` takes a non-optional; this keeps the call sites
/// from branching around it.
private struct OptionalIdentifier: ViewModifier {
    let identifier: String?

    func body(content: Content) -> some View {
        if let identifier {
            content.accessibilityIdentifier(identifier)
        } else {
            content
        }
    }
}

// MARK: - Chrome

extension View {
    func peopleCard() -> some View {
        background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }
}

struct PeopleSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.verdigrisInk)
                .padding(.leading, 4)
            VStack(alignment: .leading, spacing: 0) { content }
                .frame(maxWidth: .infinity, alignment: .leading)
                .peopleCard()
        }
    }
}

struct PeopleDivider: View {
    var body: some View {
        Rectangle().fill(CaptureColor.line).frame(height: 1).padding(.leading, 16)
    }
}

/// The offline line. Ink, never a spinner (ux-4-field-mobile §6).
struct PeopleStaleLine: View {
    let storedAt: Date
    var pendingWrites: Int = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(FieldPeopleDates.lastLoaded(storedAt))
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
            if pendingWrites > 0 {
                Text(pendingWrites == 1
                     ? "1 note will send when you have signal."
                     : "\(pendingWrites) notes will send when you have signal.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.goldenHour)
            }
        }
        .padding(.horizontal, 4)
        .accessibilityIdentifier("people.lastLoaded")
    }
}
