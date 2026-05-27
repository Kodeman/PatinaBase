//
//  ReceiveDeliveryViewModel.swift
//  Patina
//
//  Sprint 2 / Wave 2.3 — iOS receiving flow. Designer-on-site path:
//  list arriving POs, capture inspection photos, mark outcome, write
//  receiving_inspections (+ damage_claims when outcome != 'clean')
//  through Supabase PostgREST.
//
//  Mirrors the web `useCreateReceivingInspection` mutation from
//  packages/supabase/src/hooks/use-procurement.ts (S2 W2.2). The
//  inspection insert is the critical path; the damage_claim insert
//  uses a compensating delete on the inspection if it fails. PO
//  status/delivered_date updates are best-effort.
//
//  Existing conventions read & followed:
//    - APIConfiguration: Services/API/APIConfiguration.swift (DeploymentTarget.current)
//    - Supabase access: SupabaseClientManager.shared.client (Core/Network/SupabaseClient.swift)
//      + module-level `supabase` accessor — same pattern as
//      Features/Help/Services/SupabaseHelpStateAdapter.swift
//    - PostgREST queries via the supabase-swift SDK:
//        `client.from("table").select(...).eq(...).execute().value`
//      (see SupabaseHelpStateAdapter for the canonical example)
//    - Feature layout: Features/Receiving/{ViewModels,Views}/ only
//      (matches Features/Decisions; no Models/Network/Services subdirs)
//    - View model style: @Observable + @MainActor final class
//      (DecisionsViewModel pattern — same isLoading/error vars)
//

import Foundation
import SwiftUI
import Supabase

// MARK: - Wire types

/// Subset of a `purchase_orders` row needed by the receiving flow plus the
/// joined vendor + project names. Mirrors the SELECT columns below.
public struct ReceivingArrivingPO: Codable, Sendable, Identifiable {
    public let id: String
    public let vendor_po_number: String?
    public let confirmed_eta: String?      // YYYY-MM-DD
    public let status: String              // 'confirmed' | 'in_production' | 'shipped' | ...
    public let payment_pattern: String?    // purchase_order_payment_pattern enum
    public let delivered_date: String?
    public let vendor: VendorRef?
    public let project: ProjectRef?

    public struct VendorRef: Codable, Sendable {
        public let id: String
        public let name: String
    }

    public struct ProjectRef: Codable, Sendable {
        public let id: String
        public let name: String
    }
}

/// Outcome enum matching the `receiving_inspection_outcome` Postgres type
/// (migration 00150). `partial` is desktop-only per the W2.3 dossier; iOS
/// surfaces just `clean` and `damaged`. Kept in the enum so the auto-draft
/// template stays compatible with the web hook.
public enum ReceivingOutcome: String, Codable, Sendable, CaseIterable {
    case clean
    case damaged
    case partial
}

// MARK: - View model

@Observable
@MainActor
final class ReceiveDeliveryViewModel {

    // List state
    var arrivingPOs: [ReceivingArrivingPO] = []
    var isLoading: Bool = false
    var error: String?

    // Inspection state (per-PO selection)
    var selectedPO: ReceivingArrivingPO?
    var photos: [UIImage] = []
    var notes: String = ""
    var outcome: ReceivingOutcome?
    var isSubmitting: Bool = false
    var didSubmitSuccessfully: Bool = false

    /// Max photos per inspection. Matches the PRD §9 guidance ("up to 3").
    let maxPhotos: Int = 3

    // MARK: - Load arriving POs

    /// Loads POs that are currently arriving — status in
    /// (`in_production`, `shipped`) and a confirmed ETA. RLS scopes
    /// the rows to the authenticated designer.
    func loadArriving() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let rows: [ReceivingArrivingPO] = try await supabase
                .from("purchase_orders")
                .select(
                    """
                    id, vendor_po_number, confirmed_eta, status,
                    payment_pattern, delivered_date,
                    vendor:vendors!purchase_orders_vendor_id_fkey(id, name),
                    project:projects!purchase_orders_project_id_fkey(id, name)
                    """
                )
                .in("status", values: ["in_production", "shipped"])
                .not("confirmed_eta", operator: .is, value: "null")
                .order("confirmed_eta", ascending: true)
                .execute()
                .value
            arrivingPOs = rows
        } catch {
            self.error = "Couldn't load arriving deliveries"
            #if DEBUG
            print("[Receiving] loadArriving failed: \(error.localizedDescription)")
            #endif
        }
    }

    // MARK: - Inspection selection

    /// Begin an inspection for the given PO. Resets photo / notes / outcome
    /// state so subsequent inspections in the same session start fresh.
    func beginInspection(for po: ReceivingArrivingPO) {
        selectedPO = po
        photos = []
        notes = ""
        outcome = nil
        didSubmitSuccessfully = false
        error = nil
    }

    /// Dismiss the inspection sheet (cancel or post-success).
    func dismissInspection() {
        selectedPO = nil
        photos = []
        notes = ""
        outcome = nil
        didSubmitSuccessfully = false
    }

    /// Append a captured photo, respecting `maxPhotos`. Caller invokes once
    /// per accepted image; over-capacity calls no-op.
    func addPhoto(_ image: UIImage) {
        guard photos.count < maxPhotos else { return }
        photos.append(image)
    }

    func removePhoto(at index: Int) {
        guard photos.indices.contains(index) else { return }
        photos.remove(at: index)
    }

    // MARK: - Submit

    /// Submit the inspection. Mirrors the web `useCreateReceivingInspection`
    /// flow from packages/supabase/src/hooks/use-procurement.ts:
    ///
    ///   0. Upload each captured photo via `MediaUploadClient` and collect
    ///      the returned MediaAsset UUIDs (W2.4 — sequential, fail-fast).
    ///   1. INSERT receiving_inspections (critical)
    ///   2. UPDATE purchase_orders.delivered_date / status (best-effort)
    ///   3. IF outcome != 'clean': INSERT damage_claims with auto-drafted
    ///      description (critical). On failure, compensating-delete the
    ///      inspection row.
    func submit() async {
        guard let po = selectedPO, let outcome else {
            error = "Pick an outcome before submitting"
            return
        }
        guard !isSubmitting else { return }

        isSubmitting = true
        error = nil
        defer { isSubmitting = false }

        // Resolve the authenticated user so we can pass `inspected_by`
        // explicitly (RLS will reject a forged value).
        let userId: UUID
        do {
            userId = try await supabase.auth.session.user.id
        } catch {
            self.error = "You're not signed in"
            return
        }

        // Upload each captured photo through the media service's
        // upload-session flow (W2.4). Sequential uploads — 3 photos max,
        // no benefit to parallelism. Any single failure aborts the whole
        // submit; we DON'T persist a partial inspection. The compensating-
        // delete pattern in step 3 only protects against post-DB-write
        // failures, not pre-write ones.
        let photoAssetIds: [String]
        if photos.isEmpty {
            photoAssetIds = []
        } else {
            let uploader = MediaUploadClient()
            var ids: [String] = []
            ids.reserveCapacity(photos.count)
            for image in photos {
                do {
                    let assetId = try await uploader.upload(image)
                    ids.append(assetId.uuidString)
                } catch {
                    self.error = "Couldn't upload inspection photo"
                    #if DEBUG
                    print("[Receiving] photo upload failed: \(error.localizedDescription)")
                    #endif
                    return
                }
            }
            photoAssetIds = ids
        }

        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let notesPayload: String? = trimmedNotes.isEmpty ? nil : trimmedNotes

        // ─── Step 1: INSERT receiving_inspections ────────────────────────
        let inspectionRow: InspectionRow
        do {
            inspectionRow = try await supabase
                .from("receiving_inspections")
                .insert(
                    InspectionInsert(
                        purchase_order_id: po.id,
                        inspected_by: userId.uuidString,
                        outcome: outcome.rawValue,
                        notes: notesPayload,
                        photo_asset_ids: photoAssetIds
                    ),
                    returning: .representation
                )
                .select()
                .single()
                .execute()
                .value
        } catch {
            self.error = "Couldn't save the inspection"
            #if DEBUG
            print("[Receiving] inspection insert failed: \(error.localizedDescription)")
            #endif
            return
        }

        let inspectionId = inspectionRow.id

        // ─── Step 2: UPDATE purchase_orders (best-effort) ───────────────
        // Mirrors the web hook: set delivered_date if NULL, set status to
        // 'delivered' if not already terminal. Failure is logged, not
        // surfaced — the inspection row is the source of truth.
        let inspectedDate = String(inspectionRow.inspected_at.prefix(10))
        let deliveredDateWasNull = (po.delivered_date == nil)
        let shouldFlipStatus = (po.status != "delivered" && po.status != "cancelled")
        if deliveredDateWasNull || shouldFlipStatus {
            do {
                var updates = POUpdate()
                if deliveredDateWasNull { updates.delivered_date = inspectedDate }
                if shouldFlipStatus { updates.status = "delivered" }
                try await supabase
                    .from("purchase_orders")
                    .update(updates)
                    .eq("id", value: po.id)
                    .execute()
            } catch {
                #if DEBUG
                print("[Receiving] PO update failed (continuing): \(error.localizedDescription)")
                #endif
            }
        }

        // ─── Step 3: damage_claims (critical path when outcome != clean) ─
        if outcome != .clean {
            let vendorName = po.vendor?.name ?? "vendor"
            let poNumber = po.vendor_po_number
            let description = Self.autoDraftDescription(
                outcome: outcome,
                notes: notesPayload,
                vendorName: vendorName,
                poNumber: poNumber
            )

            do {
                try await supabase
                    .from("damage_claims")
                    .insert(
                        DamageClaimInsert(
                            receiving_inspection_id: inspectionId,
                            state: "drafted",
                            description: description
                        )
                    )
                    .execute()
            } catch {
                // Compensating delete on the inspection — keep the data
                // store consistent with the web hook's contract.
                let cleanup = await compensatingDeleteInspection(id: inspectionId)
                self.error = "Inspection saved but damage report failed. \(cleanup)"
                #if DEBUG
                print("[Receiving] damage_claims insert failed: \(error.localizedDescription); cleanup=\(cleanup)")
                #endif
                return
            }
        }

        didSubmitSuccessfully = true
    }

    /// Best-effort compensating delete used when the damage_claims insert
    /// fails after the inspection has been written. Returns a short status
    /// string suitable for embedding in the user-facing error.
    private func compensatingDeleteInspection(id: String) async -> String {
        do {
            try await supabase
                .from("receiving_inspections")
                .delete()
                .eq("id", value: id)
                .execute()
            return "Inspection rolled back."
        } catch {
            #if DEBUG
            print("[Receiving] compensating delete failed: \(error.localizedDescription)")
            #endif
            return "Inspection rollback also failed — please retry from desktop."
        }
    }

    // MARK: - Auto-draft template

    /// Build the auto-drafted damage-claim description. Mirrors
    /// `autoDraftDamageClaimDescription` in
    /// packages/supabase/src/hooks/use-procurement.ts so the iOS-side
    /// claim is indistinguishable from the web-side one.
    static func autoDraftDescription(
        outcome: ReceivingOutcome,
        notes: String?,
        vendorName: String,
        poNumber: String?
    ) -> String {
        let head: String
        switch outcome {
        case .damaged:
            head = "Damage reported on delivery"
        case .partial:
            head = "Partial delivery received"
        case .clean:
            // Defensive — should never be called for clean, but the web
            // helper has the same shape and we keep parity.
            head = "Delivery received"
        }
        let poBit = (poNumber.map { " (PO \($0))" }) ?? ""
        let notesBit = (notes.map { "\n\nInspection notes: \($0)" }) ?? ""
        return "\(head) from \(vendorName)\(poBit).\(notesBit)\n\nPlease describe the issue in detail before notifying the vendor."
    }
}

// MARK: - Wire payloads (private to this file)

/// Insert payload for `receiving_inspections`. Field names match the
/// PostgREST column names so the supabase-swift encoder writes them
/// straight through.
private struct InspectionInsert: Encodable {
    let purchase_order_id: String
    let inspected_by: String
    let outcome: String
    let notes: String?
    let photo_asset_ids: [String]
}

/// Subset of the `receiving_inspections` row we read back after insert.
struct InspectionRow: Codable, Sendable {
    let id: String
    let inspected_at: String  // ISO-8601 timestamp
}

private struct DamageClaimInsert: Encodable {
    let receiving_inspection_id: String
    let state: String
    let description: String
}

/// Optional-field update payload for `purchase_orders`. Nil fields are
/// omitted from the encoded JSON so we only PATCH what's actually
/// changing.
private struct POUpdate: Encodable {
    var delivered_date: String?
    var status: String?
}
