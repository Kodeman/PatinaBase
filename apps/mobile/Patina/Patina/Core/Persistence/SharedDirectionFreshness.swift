//
//  SharedDirectionFreshness.swift
//  Patina
//
//  W1A-10 · CONTRACT-C §C.7. How old a cached edition is, without ever
//  reading the device's wall clock.
//
//  The process holds one anchor: a server timestamp and the monotonic instant
//  it was observed at. Estimated server now is the anchor plus monotonic time
//  elapsed since. A delayed, older envelope never moves the anchor back, and a
//  decode failure never touches it. With no anchor yet the label is the
//  absolute server timestamp in the device's zone, never a relative one.
//

import Foundation

struct SharedDirectionAnchor: Sendable, Equatable {
    private(set) var servedAt: Date?
    private(set) var instant: ContinuousClock.Instant?

    /// The server's clock, estimated; nil before any envelope has decoded in
    /// this process. `ContinuousClock` instants are never persisted.
    func estimatedServerNow(at now: ContinuousClock.Instant) -> Date? {
        guard let servedAt, let instant else { return nil }
        return servedAt.addingTimeInterval(Self.seconds(instant.duration(to: now)))
    }

    /// A decoded envelope replaces the anchor only when its `servedAt` is
    /// later than the current estimate (N9, ruling I), so the estimate never
    /// moves backward.
    mutating func observe(servedAt: Date, at now: ContinuousClock.Instant) {
        if let estimate = estimatedServerNow(at: now), servedAt <= estimate { return }
        self.servedAt = servedAt
        self.instant = now
    }

    /// Estimate minus the edition's `servedAt`, floored at zero.
    func age(of servedAt: Date, at now: ContinuousClock.Instant) -> TimeInterval? {
        estimatedServerNow(at: now).map { max(0, $0.timeIntervalSince(servedAt)) }
    }

    private static func seconds(_ duration: Duration) -> TimeInterval {
        let parts = duration.components
        return TimeInterval(parts.seconds) + TimeInterval(parts.attoseconds) / 1e18
    }
}

enum SharedDirectionFreshness {

    /// The stamp beside a cached edition. Relative when the process has an
    /// anchor, absolute ("Updated 24 Sep, 3:12 PM") when it does not.
    static func label(
        servedAt: Date,
        anchor: SharedDirectionAnchor,
        now: ContinuousClock.Instant,
        timeZone: TimeZone = .current
    ) -> String {
        guard let age = anchor.age(of: servedAt, at: now) else {
            return "Updated " + absolute(servedAt, timeZone: timeZone)
        }
        return "Updated " + relative(age)
    }

    static func relative(_ age: TimeInterval) -> String {
        let minutes = Int(age / 60)
        if minutes < 1 { return "just now" }
        if minutes < 60 { return "\(minutes) min ago" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours) hr ago" }
        let days = hours / 24
        return days == 1 ? "1 day ago" : "\(days) days ago"
    }

    static func absolute(_ date: Date, timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "d MMM, h:mm a"
        return formatter.string(from: date)
    }
}
