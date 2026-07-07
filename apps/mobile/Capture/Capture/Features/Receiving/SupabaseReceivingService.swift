//  SupabaseReceivingService.swift
//  Capture · Wave G (Receiving / goods-in)
//
//  Real `ReceivingService`. Mirrors the query/insert shapes of the reference
//  apps/mobile/Patina/Patina/Features/Receiving/ViewModels/ReceiveDeliveryViewModel.swift
//  (arriving-PO SELECT, inspection insert, damage-claims insert with a
//  compensating delete on failure, best-effort PO sync). Backend truth:
//  supabase/migrations/00150_receiving_and_damage_claims.sql (tables + RLS) and
//  00184_procurement_state_chain.sql (receiving_inspection_side_effects trigger —
//  see the note on `bestEffortSyncPurchaseOrder` below for how this concrete
//  deliberately diverges from the pre-00184 reference behaviour).

import Foundation
import Supabase
import CaptureKit

/// Errors specific to this concrete. Narrow and typed — screens show
/// `error.localizedDescription` inline per the wave brief (never crash, never
/// blank the screen for one failed section).
enum ReceivingServiceError: LocalizedError {
    /// `receiving_inspection_outcome` (migration 00150) is `clean`/`damaged`/
    /// `partial` only — there is no DB representation for `.refused`. G3 never
    /// offers that choice, but the frozen `FieldInspectionOutcome` still carries
    /// the case, so this concrete guards defensively rather than letting a
    /// stray `.refused` reach Postgres as an invalid enum literal.
    case refusedOutcomeUnsupported
    /// The frozen `FieldInspectionSubmission.damageDescription` doc states it's
    /// "required by the concrete when outcome != clean" — enforced here.
    case damageDescriptionRequired
    case notAuthenticated
    case damageClaimFailed(cleanedUp: Bool)

    var errorDescription: String? {
        switch self {
        case .refusedOutcomeUnsupported:
            return "\"Refused\" can't be recorded from the field app yet — choose Damaged or Partial and note the refusal in the description."
        case .damageDescriptionRequired:
            return "Add a description of the damage before submitting."
        case .notAuthenticated:
            return "You're not signed in."
        case .damageClaimFailed(let cleanedUp):
            return cleanedUp
                ? "The inspection saved, but the damage report failed to save — it's been rolled back. Try again."
                : "The inspection saved, but the damage report failed to save, and the automatic rollback also failed. Please retry from the desktop app."
        }
    }
}

struct SupabaseReceivingService: ReceivingService {
    let client: SupabaseClient

    // MARK: - G1: arriving POs

    /// Mirrors `ReceiveDeliveryViewModel.loadArriving()` exactly: in_production/
    /// shipped POs with a confirmed ETA, embedding the vendor + project names.
    /// RLS ("Designers manage their own purchase orders", 00148) scopes rows to
    /// the signed-in designer — no client-side filtering needed.
    func arrivingPOs() async throws -> [FieldArrivingPO] {
        let rows: [ArrivingPORow] = try await client
            .from("purchase_orders")
            .select(
                """
                id, vendor_po_number, confirmed_eta, status, payment_pattern,
                vendor:vendors!purchase_orders_vendor_id_fkey(id, name),
                project:projects!purchase_orders_project_id_fkey(id, name)
                """
            )
            .in("status", values: ["in_production", "shipped"])
            .not("confirmed_eta", operator: .is, value: "null")
            .order("confirmed_eta", ascending: true)
            .execute()
            .value
        return rows.map { $0.toField() }
    }

    // MARK: - G2: photo upload

    func uploadInspectionPhoto(_ data: Data, poID: String) async throws -> String {
        try await ReceivingMediaUploadClient(client: client).upload(data)
    }

    // MARK: - G3: submit

    /// Inspection insert (critical) → best-effort PO sync → damage_claims
    /// insert when outcome != clean (critical, compensating-delete on failure).
    /// Mirrors `ReceiveDeliveryViewModel.submit()`'s three steps and column
    /// names one-to-one.
    func submitInspection(_ submission: FieldInspectionSubmission) async throws {
        guard submission.outcome != .refused else {
            throw ReceivingServiceError.refusedOutcomeUnsupported
        }
        let trimmedDamageDescription = submission.damageDescription?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if submission.outcome != .clean, (trimmedDamageDescription ?? "").isEmpty {
            throw ReceivingServiceError.damageDescriptionRequired
        }

        // RLS rejects a forged inspected_by, so resolve the signed-in user
        // explicitly rather than trusting caller-supplied identity.
        guard let userID = try? await client.auth.session.user.id.uuidString else {
            throw ReceivingServiceError.notAuthenticated
        }

        let trimmedNotes = submission.notes?.trimmingCharacters(in: .whitespacesAndNewlines)

        // ── Step 1: INSERT receiving_inspections (critical path) ──
        let inspectionRow: InspectionInsertResult = try await client
            .from("receiving_inspections")
            .insert(
                InspectionInsert(
                    purchaseOrderID: submission.poID,
                    inspectedBy: userID,
                    outcome: submission.outcome.rawValue,
                    notes: (trimmedNotes?.isEmpty ?? true) ? nil : trimmedNotes,
                    photoAssetIDs: submission.photoRefs
                ),
                returning: .representation
            )
            .select("id, inspected_at")
            .single()
            .execute()
            .value

        // ── Step 2: best-effort purchase_orders sync ──
        await bestEffortSyncPurchaseOrder(poID: submission.poID, outcome: submission.outcome,
                                          inspectedAt: inspectionRow.inspectedAt)

        // ── Step 3: damage_claims (critical when outcome != clean) ──
        guard submission.outcome != .clean else { return }
        do {
            try await client
                .from("damage_claims")
                .insert(DamageClaimInsert(
                    receivingInspectionID: inspectionRow.id,
                    state: "drafted",
                    description: trimmedDamageDescription ?? ""
                ))
                .execute()
        } catch {
            var cleanedUp = true
            do {
                try await client.from("receiving_inspections").delete()
                    .eq("id", value: inspectionRow.id).execute()
            } catch {
                cleanedUp = false
            }
            throw ReceivingServiceError.damageClaimFailed(cleanedUp: cleanedUp)
        }
    }

    // MARK: - Private

    /// Best-effort delivered_date/status sync, mirroring the reference's
    /// column names and "failure doesn't roll back the inspection" posture.
    ///
    /// This deliberately does NOT flip status unconditionally like the
    /// pre-00184 reference client does. Migration 00184's
    /// `trg_receiving_inspection_side_effects` (AFTER INSERT ON
    /// receiving_inspections) already stamps delivered_date on every outcome
    /// and — as a deliberate tightening vs the old client hook — advances
    /// status to 'delivered' ONLY on a clean outcome. That trigger already ran
    /// (same transaction as Step 1's insert) by the time this executes, so
    /// this step is a defensive fallback, not the source of truth; it stays
    /// gated the same way the trigger is, so it can never re-introduce the
    /// behaviour 00184 closed off. Both writes are expressed as single atomic
    /// filtered UPDATEs (WHERE delivered_date IS NULL / WHERE status NOT IN
    /// (…)) rather than a read-then-write, so there's no read/write race.
    private func bestEffortSyncPurchaseOrder(poID: String, outcome: FieldInspectionOutcome,
                                             inspectedAt: String) async {
        let deliveredDate = String(inspectedAt.prefix(10))
        try? await client.from("purchase_orders")
            .update(["delivered_date": deliveredDate])
            .eq("id", value: poID)
            .is("delivered_date", value: nil)
            .execute()

        guard outcome == .clean else { return }
        try? await client.from("purchase_orders")
            .update(["status": "delivered"])
            .eq("id", value: poID)
            .neq("status", value: "delivered")
            .neq("status", value: "cancelled")
            .execute()
    }
}

// MARK: - Wire rows (file-scope; keys are literal PostgREST column names)

private struct ArrivingPORow: Decodable {
    struct NameRef: Decodable {
        let id: String
        let name: String
    }

    let id: String
    let vendorPONumber: String?
    let confirmedETA: String?
    let status: String
    let paymentPattern: String?
    let vendor: NameRef?
    let project: NameRef?

    enum CodingKeys: String, CodingKey {
        case id
        case vendorPONumber = "vendor_po_number"
        case confirmedETA = "confirmed_eta"
        case status
        case paymentPattern = "payment_pattern"
        case vendor
        case project
    }

    /// `confirmed_eta` is a Postgres DATE (`YYYY-MM-DD`, no time/zone).
    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .iso8601)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    func toField() -> FieldArrivingPO {
        FieldArrivingPO(
            id: id,
            poNumber: vendorPONumber,
            vendorName: vendor?.name,
            projectName: project?.name,
            eta: confirmedETA.flatMap(Self.dateFormatter.date(from:)),
            status: status,
            paymentPattern: paymentPattern
        )
    }
}

private struct InspectionInsert: Encodable {
    let purchaseOrderID: String
    let inspectedBy: String
    let outcome: String
    let notes: String?
    let photoAssetIDs: [String]

    enum CodingKeys: String, CodingKey {
        case purchaseOrderID = "purchase_order_id"
        case inspectedBy = "inspected_by"
        case outcome
        case notes
        case photoAssetIDs = "photo_asset_ids"
    }
}

private struct InspectionInsertResult: Decodable {
    let id: String
    let inspectedAt: String
    enum CodingKeys: String, CodingKey {
        case id
        case inspectedAt = "inspected_at"
    }
}

private struct DamageClaimInsert: Encodable {
    let receivingInspectionID: String
    let state: String
    let description: String

    enum CodingKeys: String, CodingKey {
        case receivingInspectionID = "receiving_inspection_id"
        case state
        case description
    }
}
