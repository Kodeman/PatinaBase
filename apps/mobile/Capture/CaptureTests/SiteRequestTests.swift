//  SiteRequestTests.swift
//  CaptureTests
//
//  P1 K-01 canonical-unit and durable delivery-state contracts.

import Foundation
import Testing
@testable import CaptureKit

struct SiteRequestTests {
    @Test func imperialFractionsRoundToCanonicalIntegerMillimetres() throws {
        #expect(try SiteMeasurement.millimetres(fromImperial: "41 3/8 in") == 1_051)
        #expect(try SiteMeasurement.millimetres(fromImperial: "25¾") == 654)
        #expect(try SiteMeasurement.millimetres(fromImperial: "96 1/4") == 2_445)
        #expect(SiteMeasurement.imperialString(millimetres: 1_051) == "41 3/8 in")
    }

    @Test func imperialEntryQuantizesToOneSixteenth() throws {
        let millimetres = try SiteMeasurement.millimetres(fromImperial: "10.04")
        #expect(SiteMeasurement.imperialString(millimetres: millimetres) == "10 1/16 in")
    }

    @Test func metricEntryStoresRoundedIntegerMillimetres() throws {
        #expect(try SiteMeasurement.millimetres(fromMetric: "654.4 mm") == 654)
        #expect(try SiteMeasurement.millimetres(fromMetric: "654.6") == 655)
    }

    @Test func checksumIsStableSHA256() {
        #expect(SiteRequestChecksum.sha256(Data("abc".utf8))
                == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test func outboxRequiresServerReceiptBeforeDelivered() throws {
        let record = makeRecord()
        try record.transition(to: .uploading)
        try record.transition(to: .awaitingReceipt)
        #expect(record.state == .awaitingReceipt)
        #expect(record.serverDeliverableID == nil)
        try record.transition(to: .delivered, serverDeliverableID: "delivery-1")
        #expect(record.state == .delivered)
        #expect(record.serverDeliverableID == "delivery-1")
    }

    @Test func invalidReceiptBypassIsRejected() {
        let record = makeRecord()
        #expect(throws: SiteRequestOutboxError.invalidTransition(from: .queued, to: .delivered)) {
            try record.transition(to: .delivered)
        }
    }

    @Test func failedRetryPreservesIdempotencyAndSchedulesBackoff() throws {
        let id = UUID()
        let record = makeRecord(id: id)
        let now = Date(timeIntervalSince1970: 100)
        try record.transition(to: .failed, error: "offline", now: now)
        #expect(record.clientDeliveryID == id)
        #expect(record.retryCount == 1)
        #expect(record.nextAttemptAt == now.addingTimeInterval(5))
        try record.transition(to: .queued)
        #expect(record.clientDeliveryID == id)
        #expect(record.nextAttemptAt == nil)
    }

    @MainActor
    @Test func storeEnqueueIsIdempotentByClientDeliveryID() throws {
        let store = try CaptureStore.inMemory()
        let id = UUID()
        let first = try store.enqueueSiteRequestDelivery(makeRecord(id: id))
        let duplicate = try store.enqueueSiteRequestDelivery(makeRecord(id: id))
        #expect(first === duplicate)
        #expect(store.siteRequestOutbox().count == 1)
    }

    private func makeRecord(id: UUID = UUID()) -> SiteRequestOutboxRecord {
        SiteRequestOutboxRecord(
            clientDeliveryID: id,
            requestID: "request-1",
            itemID: "item-1",
            itemVersionID: "item-version-1",
            payloadPath: "/tmp/site-delivery.json",
            checksumSHA256: String(repeating: "a", count: 64))
    }
}
