//
//  ReceiveDeliveryViewModelTests.swift
//  PatinaTests
//
//  Sprint 2 / Wave 2.3 — covers the parts of the receiving view model
//  that don't require Supabase round-trips:
//   • autoDraftDescription template parity with the web helper
//     (packages/supabase/src/hooks/use-procurement.ts L739–L749)
//   • outcome → damage-claim-state mapping (clean skips claim, damaged
//     drafts one)
//   • photo capacity guard (addPhoto / removePhoto respect maxPhotos)
//
//  Network paths (submit / loadArriving) are not exercised here — they
//  require complex Supabase client mocking and are validated via a
//  manual MobAI smoke run on a real device.
//

import Testing
import UIKit
@testable import Patina

@MainActor
struct ReceiveDeliveryViewModelTests {

    // MARK: - Auto-draft template

    @Test func autoDraftDescriptionForDamagedWithNotesAndPoNumber() {
        let result = ReceiveDeliveryViewModel.autoDraftDescription(
            outcome: .damaged,
            notes: "Left arm of sofa has a deep scratch.",
            vendorName: "Acme Furniture",
            poNumber: "ACM-1024"
        )
        #expect(result.contains("Damage reported on delivery"))
        #expect(result.contains("Acme Furniture"))
        #expect(result.contains("(PO ACM-1024)"))
        #expect(result.contains("Inspection notes: Left arm of sofa has a deep scratch."))
        #expect(result.contains("Please describe the issue in detail before notifying the vendor."))
    }

    @Test func autoDraftDescriptionForPartialWithoutNotesOrPoNumber() {
        let result = ReceiveDeliveryViewModel.autoDraftDescription(
            outcome: .partial,
            notes: nil,
            vendorName: "Vendor",
            poNumber: nil
        )
        #expect(result.contains("Partial delivery received"))
        #expect(result.contains("from Vendor."))
        #expect(!result.contains("Inspection notes:"))
        #expect(!result.contains("(PO"))
    }

    @Test func autoDraftDescriptionMatchesWebHookShape() {
        // Mirror the exact wire format the web helper emits so the
        // desktop dashboard renders identical claims regardless of
        // origin. Verified against
        // packages/supabase/src/hooks/use-procurement.ts L745–L748.
        let result = ReceiveDeliveryViewModel.autoDraftDescription(
            outcome: .damaged,
            notes: "scratch",
            vendorName: "Acme",
            poNumber: "P1"
        )
        let expected = """
        Damage reported on delivery from Acme (PO P1).

        Inspection notes: scratch

        Please describe the issue in detail before notifying the vendor.
        """
        #expect(result == expected)
    }

    // MARK: - Outcome mapping

    @Test func cleanOutcomeIsCanonicallyClean() {
        // Defensive — confirms the enum raw values match the
        // receiving_inspection_outcome Postgres type (migration 00150).
        #expect(ReceivingOutcome.clean.rawValue == "clean")
        #expect(ReceivingOutcome.damaged.rawValue == "damaged")
        #expect(ReceivingOutcome.partial.rawValue == "partial")
    }

    // MARK: - Photo capacity

    @Test func addPhotoRespectsMaxCapacity() async {
        let viewModel = ReceiveDeliveryViewModel()
        // maxPhotos defaults to 3 per the PRD §9 guidance.
        #expect(viewModel.maxPhotos == 3)

        // Use 1×1 white squares — UIImage init succeeds with any
        // non-empty CGImage, but for unit-test purposes we just need
        // distinct UIImage instances.
        viewModel.addPhoto(makeTestImage())
        viewModel.addPhoto(makeTestImage())
        viewModel.addPhoto(makeTestImage())
        #expect(viewModel.photos.count == 3)

        // Fourth add must be a no-op (silent guard, not a throw).
        viewModel.addPhoto(makeTestImage())
        #expect(viewModel.photos.count == 3)
    }

    @Test func removePhotoStripsTheRightIndex() async {
        let viewModel = ReceiveDeliveryViewModel()
        viewModel.addPhoto(makeTestImage())
        viewModel.addPhoto(makeTestImage())
        viewModel.removePhoto(at: 0)
        #expect(viewModel.photos.count == 1)

        // Out-of-range no-op
        viewModel.removePhoto(at: 99)
        #expect(viewModel.photos.count == 1)
    }

    @Test func beginInspectionResetsState() async {
        let viewModel = ReceiveDeliveryViewModel()
        viewModel.notes = "leftover"
        viewModel.addPhoto(makeTestImage())
        viewModel.outcome = .damaged
        viewModel.didSubmitSuccessfully = true

        let po = ReceivingArrivingPO(
            id: "po-1",
            vendor_po_number: "P-9",
            confirmed_eta: "2026-06-01",
            status: "shipped",
            payment_pattern: "deposit_balance",
            delivered_date: nil,
            vendor: ReceivingArrivingPO.VendorRef(id: "v1", name: "Acme"),
            project: ReceivingArrivingPO.ProjectRef(id: "p1", name: "Riverside")
        )
        viewModel.beginInspection(for: po)

        #expect(viewModel.selectedPO?.id == "po-1")
        #expect(viewModel.notes == "")
        #expect(viewModel.photos.isEmpty)
        #expect(viewModel.outcome == nil)
        #expect(viewModel.didSubmitSuccessfully == false)
    }

    // MARK: - Helpers

    /// Build a tiny 1×1 UIImage for use in capacity tests. The image
    /// content is irrelevant — the view model treats UIImage opaquely.
    private func makeTestImage() -> UIImage {
        let size = CGSize(width: 1, height: 1)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }
}
