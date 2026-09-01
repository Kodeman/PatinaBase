//  FieldVerbControls.swift
//  CaptureKit
//
//  The rendering half of `FieldVerbMenu`: an overflow control and the notice
//  beneath it. Both surfaces that carry the three verbs — the C3 quick-confirm
//  card (`CaptureCardOverlay`) and N5 (`SmartGuessSheet`) — build them from
//  here, so the menu cannot say one thing on one screen and another elsewhere.
//
//  The views hold no state of their own. `FieldVerbMenu` is the state and its
//  owner keeps it, because the confirm step must survive a body pass and must
//  reset when the card does.

import SwiftUI

/// The overflow control. It sits BESIDE the surface's primary action, never in
/// place of it — saving the capture is still the primary act on the card.
public struct FieldVerbOverflowMenu: View {
    @Binding private var menu: FieldVerbMenu
    private let facts: FieldVerbFacts
    private let parties: [FieldPartyRef]
    private let onAction: (FieldVerbAction) -> Void

    public init(
        menu: Binding<FieldVerbMenu>,
        facts: FieldVerbFacts,
        parties: [FieldPartyRef],
        onAction: @escaping (FieldVerbAction) -> Void
    ) {
        _menu = menu
        self.facts = facts
        self.parties = parties
        self.onAction = onAction
    }

    public var body: some View {
        Menu {
            ForEach(menu.rows(facts), id: \.self) { row in
                rowView(row)
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.inkSoft)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("More ways to file this")
        .accessibilityIdentifier("card.verbs")
    }

    @ViewBuilder private func rowView(_ row: FieldVerbRow) -> some View {
        if row.isVerb {
            Button(row.title) {
                if let action = menu.tap(row, facts: facts, parties: parties) {
                    onAction(action)
                }
            }
            .disabled(!menu.isEnabled(row, facts))
        } else if row == .needsProject {
            Text(row.title)
        } else {
            Label(row.title, systemImage: "checkmark")
                .labelStyle(.titleAndIcon)
        }
    }
}

/// The punch confirm step and the lane's own status line. Renders nothing when
/// there is neither — an empty row on the card would take space from the
/// controls §7.5 puts there.
public struct FieldVerbNotice: View {
    @Binding private var menu: FieldVerbMenu
    private let facts: FieldVerbFacts
    private let parties: [FieldPartyRef]
    private let onAction: (FieldVerbAction) -> Void

    public init(
        menu: Binding<FieldVerbMenu>,
        facts: FieldVerbFacts,
        parties: [FieldPartyRef],
        onAction: @escaping (FieldVerbAction) -> Void
    ) {
        _menu = menu
        self.facts = facts
        self.parties = parties
        self.onAction = onAction
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let intent = menu.intentLine {
                // An INTENTION. The row is not written yet, and
                // fc_dispatch_task_assignment re-reads the party's real consent
                // when it is.
                line(intent)
                Button("Add") {
                    if let action = menu.confirmPunch() { onAction(action) }
                }
                .buttonStyle(FieldVerbConfirmButtonStyle())
                .accessibilityIdentifier("card.verbs.confirm")
            }
            if let status = menu.statusLine(facts, parties: parties) {
                line(status)
                    .accessibilityIdentifier("card.verbs.status")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func line(_ text: String) -> some View {
        Text(text)
            .font(CaptureType.footnote)
            .foregroundStyle(CaptureColor.inkSoft)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The card's own primary shape (verdigris, 12pt corner), so the confirm reads
/// as the same kind of act as Save rather than importing a second idiom.
public struct FieldVerbConfirmButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(CaptureType.bodyEmph)
            .foregroundStyle(CaptureColor.paper3)
            .padding(.horizontal, 22)
            .padding(.vertical, 13)
            .background(RoundedRectangle(cornerRadius: 12)
                .fill(CaptureColor.verdigris.opacity(configuration.isPressed ? 0.8 : 1)))
    }
}
