//  LocationService.swift
//  CaptureKit
//
//  Venue stamp source (S1, F-08). Concrete CoreLocationService is app-side
//  (Team E). Permission is primed just-in-time on first route.

import Foundation

@MainActor
public protocol LocationService: AnyObject {
    func requestWhenInUse() async -> Bool
    /// CLLocation + reverse-geocoded placemark → a venue stamp.
    func currentVenue() async -> VenueStamp?
}
