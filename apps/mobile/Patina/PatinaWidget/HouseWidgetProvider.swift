//
//  HouseWidgetProvider.swift
//  PatinaWidget
//
//  The timeline. It reads the payload the app leaves in the App Group and does
//  nothing else — the extension has no network, no session, and no way to ask
//  who is signed in, so everything it draws was decided by the app.
//
//  Q8: refreshed on app foreground (the app calls
//  `WidgetCenter.shared.reloadTimelines(ofKind:)`) and by the policy below. A
//  delivered alert does not run app code, so the widget may sit one open
//  behind — and `HouseWidgetPayload.refreshedLine(now:)` is how it says so.
//

import WidgetKit

struct HouseWidgetEntry: TimelineEntry {
    let date: Date
    /// nil when there is nothing on disk at all — the widget's no-data state.
    let snapshot: HouseWidgetPayload?
}

struct HouseWidgetProvider: TimelineProvider {

    /// Half an hour. Short enough that a stale line corrects itself within one
    /// open, long enough that WidgetKit keeps honouring the request.
    static let refreshInterval: TimeInterval = 30 * 60

    private let store: HouseWidgetPayloadStore

    init(store: HouseWidgetPayloadStore = HouseWidgetPayloadStore()) {
        self.store = store
    }

    /// The skeleton, and the gallery preview. Both draw the no-data state on
    /// purpose: a sample row would be a fabricated row (C5), and the honest
    /// thing for a widget with nothing yet to say is to say so.
    func placeholder(in context: Context) -> HouseWidgetEntry {
        HouseWidgetEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (HouseWidgetEntry) -> Void) {
        let snapshot = context.isPreview ? nil : store.load()
        completion(HouseWidgetEntry(date: Date(), snapshot: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HouseWidgetEntry>) -> Void) {
        let now = Date()
        let entry = HouseWidgetEntry(date: now, snapshot: store.load())
        let next = now.addingTimeInterval(Self.refreshInterval)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}
