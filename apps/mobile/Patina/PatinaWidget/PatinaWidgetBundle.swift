//
//  PatinaWidgetBundle.swift
//  PatinaWidget
//
//  The app's first extension (F130). One widget, three families — Q8's "one
//  small widget, Home + Lock Screen" is a single kind the person adds once and
//  can place in either room, not two separate entries in the gallery.
//

import PatinaDesignKit
import SwiftUI
import WidgetKit

@main
struct PatinaWidgetBundle: WidgetBundle {

    init() {
        // The extension is its own process and cannot see the host app's
        // `UIAppFonts`; `PatinaFonts` registers the design package's own TTFs
        // from the SwiftPM resource bundle, which travels inside the framework.
        PatinaFonts.registerAll()
    }

    var body: some Widget {
        HouseWidget()
    }
}
