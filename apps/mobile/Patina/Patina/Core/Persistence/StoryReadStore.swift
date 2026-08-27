//
//  StoryReadStore.swift
//  Patina
//
//  SP-18. The editorial story's unread dot was hard-coded `true`, so the same
//  card was permanently marked new — on the guest home, the engaged home, in
//  dark mode, and after every relaunch. This is the per-story read timestamp
//  the dot is driven from, and the record the story pick uses to serve
//  something the reader has not opened.
//
//  UserDefaults, deliberately: a read mark is a per-device convenience, it is
//  tiny, and it must survive without a schema change.
//

import Foundation

public struct StoryReadStore: Sendable {

    private static let key = "patina.story.readAt"

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// When this story was last opened, or nil if it never was.
    public func readAt(storyId: String) -> Date? {
        guard let raw = defaults.dictionary(forKey: Self.key) as? [String: Double],
              let stamp = raw[storyId] else { return nil }
        return Date(timeIntervalSince1970: stamp)
    }

    public func isUnread(storyId: String) -> Bool {
        readAt(storyId: storyId) == nil
    }

    public func markRead(storyId: String, at date: Date = Date()) {
        var raw = (defaults.dictionary(forKey: Self.key) as? [String: Double]) ?? [:]
        raw[storyId] = date.timeIntervalSince1970
        defaults.set(raw, forKey: Self.key)
    }

    /// SP-18: the highest-`sort_order` story the reader has not opened, and the
    /// first of the list when they have opened all of them. `candidates` must
    /// already be ordered `sort_order desc, published_at desc`.
    public func nextStoryId(from candidates: [String]) -> String? {
        candidates.first(where: isUnread(storyId:)) ?? candidates.first
    }
}
