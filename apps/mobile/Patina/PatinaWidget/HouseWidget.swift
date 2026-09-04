//
//  HouseWidget.swift
//  PatinaWidget
//
//  One widget, three families (Q8). `systemSmall` is M6b; `accessoryRectangular`
//  and `accessoryCircular` are M6a's Lock Screen.
//

import SwiftUI
import WidgetKit

struct HouseWidget: Widget {

    /// The kind string the app reloads. It is a contract with X2's producer —
    /// `WidgetCenter.shared.reloadTimelines(ofKind: HouseWidget.kind)`.
    static let kind = "PatinaHouseWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: HouseWidgetProvider()) { entry in
            HouseWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Patina")
        .description("What moved on your house.")
        // D5 adds `.systemMedium`: the small family has one `widgetURL` and it
        // wins every pixel, so a list of rows there can only ever have one
        // door. Medium is where each row gets its own.
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
    }
}
