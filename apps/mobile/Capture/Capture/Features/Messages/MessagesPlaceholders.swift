//  MessagesPlaceholders.swift
//  Capture · Wave M (Messages)
//
//  M1/M2 freeze placeholders. Wave M replaces these with the real inbox + thread,
//  reading from `container.messaging` (and its live `observeMessages` tail).

import SwiftUI
import CaptureKit

struct InboxPlaceholder: View {
    var body: some View {
        FieldPlaceholderScreen(screenID: .m1Inbox, title: "Messages", wave: "M",
                               symbol: "bubble.left.and.bubble.right")
    }
}

struct ThreadPlaceholder: View {
    let threadID: String
    var body: some View {
        FieldPlaceholderScreen(screenID: .m2Thread, title: "Thread", wave: "M",
                               symbol: "bubble.left.and.bubble.right", note: "Thread \(threadID)")
    }
}
