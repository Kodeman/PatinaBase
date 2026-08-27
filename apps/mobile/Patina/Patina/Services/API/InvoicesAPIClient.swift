//
//  InvoicesAPIClient.swift
//  Patina
//
//  Client-side invoice read + Stripe Checkout hand-off, mirroring the
//  client portal's `use-invoices` hooks (`useInvoices`, `useInvoice`,
//  `useStartCheckout`) and the `create-checkout-session` edge function.
//  Everything goes through supabase-swift against the configured Supabase
//  URL. RLS (00178) scopes reads to NON-DRAFT invoices on the client's
//  projects (`projects.client_id = auth.uid()`), so the list never returns
//  drafts.
//
//  Money columns are integer cents. Payable statuses are `sent` and
//  `partially_paid` with a positive balance. Payment settles server-side via
//  the Stripe webhook; the app confirms by polling the invoice row after the
//  Checkout hand-off (R30: poll-first, no deep link this wave).
//

import Foundation
import Supabase

// MARK: - Wire models

public struct RemoteInvoiceProjectRef: Codable, Sendable {
    public let id: String?
    public let name: String?
}

public struct RemoteInvoiceDesignerRef: Codable, Sendable {
    public let id: String?
    public let full_name: String?
    public let business_name: String?

    /// Best display name for the designer, mirroring the portal fallback.
    public var displayName: String {
        if let full_name, !full_name.isEmpty { return full_name }
        if let business_name, !business_name.isEmpty { return business_name }
        return "your designer"
    }
}

public struct RemoteInvoiceLineItem: Codable, Sendable, Identifiable {
    public let id: String
    public let invoice_id: String?
    public let kind: String?
    public let description: String?
    public let quantity: Double?
    public let unit_amount_cents: Int?
    public let amount_cents: Int?
    public let sort_order: Int?
}

public struct RemoteInvoicePayment: Codable, Sendable, Identifiable {
    public let id: String
    public let invoice_id: String?
    public let amount_cents: Int?
    public let method: String?
    public let status: String?
    public let stripe_payment_intent_id: String?
    public let reference: String?
    public let received_at: String?
    public let created_at: String?

    public var isSucceeded: Bool { status == "succeeded" }
    public var isPending: Bool { status == "pending" }
    public var isStripe: Bool { method == "stripe" }
}

public struct RemoteInvoice: Codable, Sendable, Identifiable {
    public let id: String
    public let project_id: String?
    public let designer_id: String?
    public let client_id: String?
    public let invoice_number: String?
    /// draft | sent | partially_paid | paid | void (client never sees draft).
    public let status: String?
    public let issue_date: String?
    public let due_date: String?
    public let currency: String?
    public let subtotal_cents: Int?
    public let tax_rate: Double?
    public let tax_cents: Int?
    public let total_cents: Int?
    public let amount_paid_cents: Int?
    public let memo: String?
    public let sent_at: String?
    public let paid_at: String?
    public let voided_at: String?
    public let void_reason: String?
    public let created_at: String?
    public let project: RemoteInvoiceProjectRef?
    public let designer: RemoteInvoiceDesignerRef?
    public let line_items: [RemoteInvoiceLineItem]?
    public let payments: [RemoteInvoicePayment]?

    public var currencyCode: String { currency ?? "USD" }

    /// Remaining balance in cents (never negative).
    public var balanceCents: Int {
        max((total_cents ?? 0) - (amount_paid_cents ?? 0), 0)
    }

    public var isPaid: Bool { status == "paid" }
    public var isVoid: Bool { status == "void" }
    public var isPartiallyPaid: Bool { status == "partially_paid" }

    /// A Stripe payment already in flight (ACH/card confirming) — blocks a
    /// second Pay tap, matching the portal's `hasProcessingStripe`.
    public var hasProcessingStripePayment: Bool {
        (payments ?? []).contains {
            $0.isPending && $0.isStripe && ($0.stripe_payment_intent_id?.isEmpty == false)
        }
    }

    /// Any pending payment at all (drives the "processing" banner).
    public var hasPendingPayment: Bool {
        (payments ?? []).contains { $0.isPending }
    }

    /// Client can pay online: sent/partially_paid, positive balance, and no
    /// Stripe payment already processing.
    public var isPayable: Bool {
        (status == "sent" || status == "partially_paid")
            && balanceCents > 0
            && !hasProcessingStripePayment
    }

    /// True once a Stripe payment has settled (used by the return-poll).
    public var stripeSettled: Bool {
        isPaid || (payments ?? []).contains { $0.isStripe && $0.isSucceeded }
    }
}

// MARK: - Errors

/// Checkout failures, mapped from the edge function's error codes.
///
/// SP-15 / C5: **no case carries a server or vendor string.** The previous
/// `.generic(String)` was constructed with the edge function's `detail`, which
/// put Stripe's "Invalid API Key provided: sk_test_…" on a homeowner's payment
/// screen (`research/05-rewalk.md` §2b). The words a client reads are chosen
/// in `MoneyFailureCopy`; `detail` survives only in the DEBUG log.
public enum CheckoutError: LocalizedError, Sendable {
    case notPayable
    case paymentProcessing
    case nothingDue
    case notConfigured
    case notFound
    /// Anything else the function returned. Deliberately carries no payload.
    case unavailable

    public var errorDescription: String? {
        MoneyFailureCopy.checkout(self).sentence
    }

    static func from(code: String?, detail: String?) -> CheckoutError {
        #if DEBUG
        if let detail, !detail.isEmpty {
            PatinaLog.ui.error("[Invoices] checkout error detail (never shown): \(detail)")
        }
        #endif
        switch code {
        case "invoice_not_payable": return .notPayable
        case "payment_processing": return .paymentProcessing
        case "nothing_due": return .nothingDue
        case "stripe_not_configured": return .notConfigured
        case "invoice_not_found": return .notFound
        default: return .unavailable
        }
    }
}

// MARK: - Client

public actor InvoicesAPIClient {
    public static let shared = InvoicesAPIClient()

    public init() {}

    private var client: SupabaseClient { SupabaseClientManager.shared.client }

    private static let listSelect =
        "id,project_id,designer_id,client_id,invoice_number,status,issue_date,due_date,"
        + "currency,subtotal_cents,tax_rate,tax_cents,total_cents,amount_paid_cents,memo,"
        + "sent_at,paid_at,voided_at,void_reason,created_at,"
        + "project:projects!invoices_project_id_fkey(id,name),"
        + "payments:invoice_payments(id,invoice_id,amount_cents,method,status,"
        + "stripe_payment_intent_id,reference,received_at,created_at)"

    private static let detailSelect =
        listSelect
        + ",designer:profiles!invoices_designer_id_fkey(id,full_name,business_name),"
        + "line_items:invoice_line_items(id,invoice_id,kind,description,quantity,"
        + "unit_amount_cents,amount_cents,sort_order)"

    // MARK: Reads

    /// Every invoice visible to this client (RLS: non-draft, own projects),
    /// newest first — mirrors the portal `useInvoices` order.
    public func listInvoices() async throws -> [RemoteInvoice] {
        try await client
            .from("invoices")
            .select(Self.listSelect)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    /// One invoice with line items + payments + designer, sorted for display.
    public func fetchInvoice(id: String) async throws -> RemoteInvoice? {
        let rows: [RemoteInvoice] = try await client
            .from("invoices")
            .select(Self.detailSelect)
            .eq("id", value: id)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    /// Whether the project has any invoices the client can see — powers
    /// ProjectDetailView's payments → invoices affordance.
    public func hasInvoices(forProject projectId: String) async throws -> Bool {
        struct IdRow: Decodable { let id: String }
        let rows: [IdRow] = try await client
            .from("invoices")
            .select("id")
            .eq("project_id", value: projectId)
            .limit(1)
            .execute()
            .value
        return !rows.isEmpty
    }

    // MARK: Checkout

    private struct StartCheckoutBody: Encodable {
        let invoiceId: String
    }

    private struct CheckoutResponse: Decodable {
        let url: String
    }

    private struct EdgeErrorBody: Decodable {
        let error: String?
        let detail: String?
    }

    /// Start a Stripe Checkout session for the invoice's remaining balance and
    /// return the hosted-checkout URL. Maps the edge function's error codes to
    /// friendly `CheckoutError`s.
    public func startCheckout(invoiceId: String) async throws -> URL {
        do {
            let response: CheckoutResponse = try await client.functions.invoke(
                "create-checkout-session",
                options: FunctionInvokeOptions(body: StartCheckoutBody(invoiceId: invoiceId))
            )
            guard let url = URL(string: response.url) else {
                throw CheckoutError.unavailable
            }
            return url
        } catch let FunctionsError.httpError(_, data) {
            let body = try? JSONDecoder().decode(EdgeErrorBody.self, from: data)
            throw CheckoutError.from(code: body?.error, detail: body?.detail)
        } catch let error as CheckoutError {
            throw error
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[Invoices] checkout invoke failed: \(error.localizedDescription)")
            #endif
            throw CheckoutError.unavailable
        }
    }
}
