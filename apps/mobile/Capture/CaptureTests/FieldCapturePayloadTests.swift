//  FieldCapturePayloadTests.swift
//  CaptureTests
//
//  The `commit_field_capture` (migration 00235) wire contract. FieldCapturePayload
//  is pure Codable, so these assert the exact JSON keys/paths the RPC reads —
//  encoded with a plain JSONEncoder (no key strategy), matching supabase-swift's
//  PostgREST encoder which also applies none.

import Foundation
import Testing
@testable import CaptureKit

struct FieldCapturePayloadTests {

    private static let device = FieldCapturePayload.Device(
        model: "iPhone16,1", osVersion: "18.0", appVersion: "0.1 (1)")

    /// Encode → JSON object, exactly as the RPC will receive `p_payload`.
    private func json(_ payload: FieldCapturePayload) throws -> [String: Any] {
        let data = try JSONEncoder().encode(payload)
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: full mapping — every scalar/array/child lands under the contract key

    @Test @MainActor func fullSpecimenMapsEveryKeyToTheRightPath() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.title = "Lounge chair"
        s.note = "warmer bouclé"
        s.categoryRaw = SpecimenCategory.seating.rawValue
        s.maker = "Holloway & Co."
        s.sku = "LQ-3S-OAK"
        s.priceTradeCents = 312_000
        s.priceRetailCents = 480_000
        s.materials = ["oak", "bouclé"]
        s.colors = ["oatmeal"]
        s.styleTags = ["organic-modern"]
        s.finish = "oiled"
        s.addMeasurement(axis: .width, millimeters: 720, source: .manual)
        s.addMeasurement(axis: .height, millimeters: 810, source: .arkit)
        s.addMeasurement(axis: .depth, millimeters: 690, source: .manual)
        s.voiceTranscript = "Oak base, warmer bouclé."
        s.voicePartialTranscript = "Oak base"
        s.voiceAudioFilename = "voice-1.m4a"
        s.voiceDurationSeconds = 6.5
        s.scannedCodes = ["gtin:0012345678905"]
        let catalogId = UUID()
        s.catalogMatchRemoteId = catalogId.uuidString
        s.provenanceRaw = ["title": "ocr", "sku": "code"]
        s.guessConfidenceRaw = ["material": 0.6]

        let photo = CapturePhoto(filename: "shot.heic", width: 1170, height: 1560,
                                 isPrimary: true, order: 0)
        photo.remotePath = "uid/tok/shot.heic"
        photo.specimen = s
        s.photos.append(photo)

        s.venue = VenueStamp(latitude: 35.97, longitude: -79.99, accuracyMeters: 8,
                             placemarkName: "High Point · Showroom 214", placeId: "pid_1",
                             capturedAt: Date(timeIntervalSince1970: 1_700_000_000),
                             timezoneIdentifier: "America/New_York")

        let dict = try json(FieldCapturePayload(specimen: s, device: Self.device))

        // top-level scalars
        #expect(dict["title"] as? String == "Lounge chair")
        #expect(dict["notes"] as? String == "warmer bouclé")
        #expect(dict["category"] as? String == "seating")
        #expect(dict["schemaVersion"] as? Int == 1)
        // clientToken is the RPC arg, NOT a payload field
        #expect(dict["clientToken"] == nil)

        let m = dict["measurements"] as? [String: Any]
        #expect(m?["width"] as? Double == 720)
        #expect(m?["height"] as? Double == 810)
        #expect(m?["depth"] as? Double == 690)
        #expect(m?["unit"] as? String == "mm")

        let tag = dict["tag"] as? [String: Any]
        #expect(tag?["vendorName"] as? String == "Holloway & Co.")
        #expect(tag?["sku"] as? String == "LQ-3S-OAK")
        #expect(tag?["priceTradeCents"] as? Int == 312_000)
        #expect(tag?["priceRetailCents"] as? Int == 480_000)

        let barcode = dict["barcode"] as? [String: Any]
        #expect(barcode?["value"] as? String == "0012345678905")
        #expect(barcode?["symbology"] as? String == "gtin")
        #expect(barcode?["catalogMatchProductId"] as? String == catalogId.uuidString)

        let attrs = dict["attributes"] as? [String: Any]
        #expect(attrs?["materials"] as? [String] == ["oak", "bouclé"])
        #expect(attrs?["colors"] as? [String] == ["oatmeal"])
        #expect(attrs?["styleTags"] as? [String] == ["organic-modern"])
        #expect(attrs?["finish"] as? String == "oiled")

        let guesses = dict["guesses"] as? [String: Any]
        #expect(guesses?["material"] as? Double == 0.6)
        let prov = dict["provenance"] as? [String: Any]
        #expect(prov?["title"] as? String == "ocr")
        #expect(prov?["sku"] as? String == "code")

        let voice = dict["voice"] as? [String: Any]
        #expect(voice?["audioPath"] as? String == "voice-1.m4a")
        #expect(voice?["transcript"] as? String == "Oak base, warmer bouclé.")
        #expect(voice?["partialTranscript"] as? String == "Oak base")
        #expect(voice?["durationSeconds"] as? Double == 6.5)

        let photos = dict["photos"] as? [[String: Any]]
        #expect(photos?.count == 1)
        #expect(photos?.first?["path"] as? String == "uid/tok/shot.heic")
        #expect(photos?.first?["isPrimary"] as? Bool == true)
        #expect(photos?.first?["isDuplicate"] as? Bool == false)
        #expect(photos?.first?["width"] as? Int == 1170)
        #expect(photos?.first?["height"] as? Int == 1560)
        #expect(photos?.first?["order"] as? Int == 0)
        #expect(photos?.first?["captureMode"] as? String == "photo")
        // private bucket → no publicUrl emitted
        #expect(photos?.first?["publicUrl"] == nil)

        let venue = dict["venue"] as? [String: Any]
        #expect(venue?["lat"] as? Double == 35.97)
        #expect(venue?["lng"] as? Double == -79.99)
        #expect(venue?["accuracyM"] as? Double == 8)
        #expect(venue?["label"] as? String == "High Point · Showroom 214")
        #expect(venue?["placeId"] as? String == "pid_1")
        #expect(venue?["timezone"] as? String == "America/New_York")
        // capturedAt is an ISO8601 string parseable as ::timestamptz
        let capturedAt = try #require(venue?["capturedAt"] as? String)
        #expect(ISO8601DateFormatter().date(from: capturedAt) != nil)

        let device = dict["device"] as? [String: Any]
        #expect(device?["model"] as? String == "iPhone16,1")
        #expect(device?["osVersion"] as? String == "18.0")
        #expect(device?["appVersion"] as? String == "0.1 (1)")
    }

    // MARK: empty specimen — minimal payload (absent keys stay absent)

    @Test @MainActor func emptySpecimenEmitsMinimalPayload() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft() // unknown category, no fields, no children

        let dict = try json(FieldCapturePayload(specimen: s, device: Self.device))

        // Always present:
        #expect(dict["schemaVersion"] as? Int == 1)
        #expect(dict["device"] as? [String: Any] != nil)
        #expect((dict["photos"] as? [Any])?.isEmpty == true)

        // Absent when there is nothing to say:
        for key in ["title", "notes", "category", "subcategory", "measurements",
                    "tag", "barcode", "attributes", "guesses", "voice",
                    "venue", "provenance", "thumbnailUrl"] {
            #expect(dict[key] == nil, "expected \(key) to be absent in the minimal payload")
        }
    }

    // MARK: provenance / guesses pass through unchanged

    @Test @MainActor func provenanceAndGuessesPassThrough() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.provenanceRaw = ["maker": "ocr", "price": "manual", "category": "smartGuess"]
        s.guessConfidenceRaw = ["category": 0.72, "material": 0.6]

        let dict = try json(FieldCapturePayload(specimen: s, device: Self.device))

        let prov = dict["provenance"] as? [String: Any]
        #expect(prov?["maker"] as? String == "ocr")
        #expect(prov?["price"] as? String == "manual")
        #expect(prov?["category"] as? String == "smartGuess")

        let guesses = dict["guesses"] as? [String: Any]
        #expect(guesses?["category"] as? Double == 0.72)
        #expect(guesses?["material"] as? Double == 0.6)
    }

    // MARK: measurement axis → width/height/depth with a unit

    @Test @MainActor func measurementsCollapseToWidthHeightDepthWithUnit() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.addMeasurement(axis: .width, millimeters: 1400, source: .manual)
        s.addMeasurement(axis: .height, millimeters: 900, source: .manual)
        // A later width remeasure wins (most recent per axis):
        s.addMeasurement(axis: .width, millimeters: 1420, source: .arkit)
        // diagonal has no {width,height,depth} slot and is dropped:
        s.addMeasurement(axis: .diagonal, millimeters: 1660, source: .manual)

        let dict = try json(FieldCapturePayload(specimen: s, device: Self.device))
        let m = try #require(dict["measurements"] as? [String: Any])
        #expect(m["width"] as? Double == 1420)
        #expect(m["height"] as? Double == 900)
        #expect(m["unit"] as? String == "mm")
        #expect(m["depth"] == nil) // no depth measurement was taken
    }
}
