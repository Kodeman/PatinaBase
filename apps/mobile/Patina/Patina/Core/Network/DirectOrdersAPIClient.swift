//
//  DirectOrdersAPIClient.swift
//  Patina
//
//  The client half of B §5's Path A. Four calls, no more:
//
//    1. `get_direct_order_terms()`  — what the order sheet may promise.
//    2. `create_direct_order(p_product_id, p_quantity)` — the payable row,
//       with the money and the attribution snapshotted server-side.
//    3. `create-checkout-session { direct_order_id }` — the hosted Stripe
//       Checkout URL, opened in `SFSafariViewController` (C15: physical goods
//       never through IAP; Apple Pay is already inside that page).
//    4. a poll of the order row after the Safari sheet dismisses — the same
//       poll-first pattern `InvoicesViewModel` has used since R30, because a
//       webhook settles the row and no deep link comes back.
//
//  No error this file throws carries a server sentence. The raw text is logged
//  in DEBUG and mapped to a code; `OrderFailureCopy` turns the code into
//  Patina's own words (C5 — the Pay path shipped Stripe's "Invalid API Key
//  provided: sk_test_…" to a homeowner and this is the rail that repeats it).
//

import Foundation
import Supabase

// MARK: - Errors

/// A `create_direct_order` refusal, already reduced to a gate case. Carries no
/// server text.
enum DirectOrderError: Error, Sendable, Equatable {
    /// The RPC refused. `refusal` is the gate case its message named.
    case refused(BuyabilityGate.Refusal)
    case notAuthenticated
    /// The call did not complete (transport, decode, an empty return).
    case unavailable
}

// MARK: - Client

public actor DirectOrdersAPIClient {

    public static let shared = DirectOrdersAPIClient()

    public init() {}

    private var client: SupabaseClient { SupabaseClientManager.shared.client }

    // MARK: Terms

    /// The three `fulfillment_config` values the order sheet may print. The RPC
    /// is SECURITY DEFINER and always returns exactly one row; a missing key
    /// yields NULL text and `false`, so a failure to read resolves to
    /// `.unknown` — which promises nothing and keeps Path A off.
    public func fetchTerms() async throws -> DirectOrderTerms {
        let rows: [DirectOrderTerms] = try await client
            .rpc("get_direct_order_terms")
            .execute()
            .value
        guard let first = rows.first else { throw DirectOrderError.unavailable }
        return first
    }

    // MARK: Create

    private struct CreateParams: Encodable, Sendable {
        // PostgREST maps these names 1:1 to the function's argument names.
        // swiftlint:disable identifier_name
        let p_product_id: String
        let p_quantity: Int
        // swiftlint:enable identifier_name
    }

    /// `create_direct_order` — SECURITY DEFINER, `authenticated` only. Returns
    /// the created row; its `commission_rate` is masked to NULL by the function
    /// itself (00540 §1b), and this type does not carry the column at all.
    public func createOrder(productId: String, quantity: Int = 1) async throws -> DirectOrder {
        do {
            let order: DirectOrder = try await client
                .rpc("create_direct_order", params: CreateParams(
                    p_product_id: productId,
                    p_quantity: max(1, quantity)
                ))
                .execute()
                .value
            return order
        } catch {
            throw Self.mapCreate(error)
        }
    }

    /// Reduce whatever the RPC raised to a gate case. The message is read for
    /// its stable fragment and then discarded.
    nonisolated static func mapCreate(_ error: Error) -> DirectOrderError {
        if let typed = error as? DirectOrderError { return typed }
        guard let pg = error as? PostgrestError else { return .unavailable }
        MoneyFailureCopy.log("direct-order create", error)
        if pg.message.lowercased().contains("not authenticated") { return .notAuthenticated }
        return .refused(BuyabilityGate.refusal(fromServerMessage: pg.message))
    }

    // MARK: Checkout

    private struct StartCheckoutBody: Encodable {
        // The edge function accepts both spellings; iOS sends the snake_case
        // one the function's own dispatch reads first.
        let direct_order_id: String  // swiftlint:disable:this identifier_name
    }

    private struct CheckoutResponse: Decodable {
        let url: String
    }

    private struct EdgeErrorBody: Decodable {
        let error: String?
        let detail: String?
    }

    /// The hosted Checkout URL for an existing order. Errors come back as the
    /// function's own codes; `detail` (Stripe's sentence, on a 502) is logged
    /// and never returned.
    public func startCheckout(orderId: String) async throws -> URL {
        do {
            let response: CheckoutResponse = try await client.functions.invoke(
                "create-checkout-session",
                options: FunctionInvokeOptions(body: StartCheckoutBody(direct_order_id: orderId))
            )
            guard let url = URL(string: response.url) else { throw CheckoutError.unavailable }
            return url
        } catch let FunctionsError.httpError(_, data) {
            let body = try? JSONDecoder().decode(EdgeErrorBody.self, from: data)
            throw OrderCheckoutError.from(code: body?.error, detail: body?.detail)
        } catch let error as CheckoutError {
            throw error
        } catch {
            MoneyFailureCopy.log("direct-order checkout", error)
            throw CheckoutError.unavailable
        }
    }

    // MARK: Poll

    /// One read of the order row, named column by column. `select=*` is a
    /// 42501 for `authenticated` under 00540 §1b.
    public func fetchOrder(id: String) async throws -> DirectOrder? {
        let rows: [DirectOrder] = try await client
            .from("direct_orders")
            .select(DirectOrder.selectColumns)
            .eq("id", value: id)
            .limit(1)
            .execute()
            .value
        return rows.first
    }
}
