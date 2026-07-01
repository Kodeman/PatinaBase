//  CoreLocationService.swift
//  Capture
//
//  Concrete LocationService (Team E): CoreLocation when-in-use + reverse geocode
//  → VenueStamp for S1's auto-stamped venue chip (F-08/F-09). Permission is
//  primed just-in-time the first time a capture is routed. Compiles + runs on the
//  simulator SDK (CoreLocation is available there; geocoding simply yields nil
//  without a simulated location, and the stamp still carries capture time).

import Foundation
import CoreLocation
import CaptureKit

@MainActor
public final class CoreLocationService: NSObject, LocationService {
    private let manager = CLLocationManager()
    private let geocoder = CLGeocoder()

    private var authContinuation: CheckedContinuation<Bool, Never>?
    /// Resolved with primitive, Sendable coordinates so nothing non-Sendable
    /// crosses the delegate → main-actor hop.
    private var locationContinuation: CheckedContinuation<Coordinate?, Never>?

    private struct Coordinate: Sendable {
        let latitude: Double
        let longitude: Double
        let accuracy: Double
    }

    public override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    // MARK: LocationService

    public func requestWhenInUse() async -> Bool {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            return true
        case .denied, .restricted:
            return false
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                authContinuation = continuation
                manager.requestWhenInUseAuthorization()
            }
        @unknown default:
            return false
        }
    }

    public func currentVenue() async -> VenueStamp? {
        let now = Date()
        guard await requestWhenInUse() else {
            // No permission: still stamp *when* it was captured (edge case S1).
            return VenueStamp(capturedAt: now)
        }
        guard let coordinate = await requestLocation() else {
            return VenueStamp(capturedAt: now)
        }
        let placemarkName = await reverseGeocode(
            latitude: coordinate.latitude, longitude: coordinate.longitude
        )
        return VenueStamp(
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            accuracyMeters: coordinate.accuracy >= 0 ? coordinate.accuracy : nil,
            placemarkName: placemarkName,
            capturedAt: now
        )
    }

    // MARK: One-shot fix

    private func requestLocation() async -> Coordinate? {
        await withCheckedContinuation { continuation in
            locationContinuation = continuation
            manager.requestLocation()
            // Safety net: never hang the route flow if the delegate stays silent
            // (e.g. a simulator with no simulated location).
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(8))
                guard let self, let pending = self.locationContinuation else { return }
                self.locationContinuation = nil
                pending.resume(returning: nil)
            }
        }
    }

    private func reverseGeocode(latitude: Double, longitude: Double) async -> String? {
        let location = CLLocation(latitude: latitude, longitude: longitude)
        guard let placemark = try? await geocoder.reverseGeocodeLocation(location).first else {
            return nil
        }
        let detail = placemark.name ?? placemark.subLocality ?? placemark.thoroughfare
        let city = placemark.locality ?? placemark.administrativeArea
        switch (city, detail) {
        case let (city?, detail?) where city != detail:
            return "\(city) · \(detail)"
        case let (city?, _):
            return city
        case let (_, detail?):
            return detail
        default:
            return nil
        }
    }
}

extension CoreLocationService: CLLocationManagerDelegate {
    public nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        // CL delivers on the thread the manager was created on (the main thread).
        MainActor.assumeIsolated {
            guard status != .notDetermined, let continuation = authContinuation else { return }
            authContinuation = nil
            let granted = status == .authorizedWhenInUse || status == .authorizedAlways
            continuation.resume(returning: granted)
        }
    }

    public nonisolated func locationManager(_ manager: CLLocationManager,
                                            didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let coordinate = Coordinate(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            accuracy: location.horizontalAccuracy
        )
        MainActor.assumeIsolated {
            guard let continuation = locationContinuation else { return }
            locationContinuation = nil
            continuation.resume(returning: coordinate)
        }
    }

    public nonisolated func locationManager(_ manager: CLLocationManager,
                                            didFailWithError error: Error) {
        MainActor.assumeIsolated {
            guard let continuation = locationContinuation else { return }
            locationContinuation = nil
            continuation.resume(returning: nil)
        }
    }
}
