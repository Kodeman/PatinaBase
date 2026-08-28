//
//  AskComposer.swift
//  Patina
//
//  What Paths B and C actually send, as values.
//
//  Path B is a message into the conversation the client and designer already
//  share — `rpc_start_project_thread` is idempotent per project, so the piece,
//  the decision and the home block all add to one thread rather than minting
//  an inbox item each (D2's test). The body names the piece, the price and the
//  room, because M7's caption promises exactly that: "She'll see the piece,
//  the price and the room."
//
//  Path C is a lead, and its idempotency key is the piece's own id. The
//  `submit_design_request` RPC has no product parameter — verified against
//  `00314:25-34` — so the piece is named in the description and the
//  `(homeowner_id, client_request_id)` unique index (`00285:77-79`) is what
//  makes "one lead, never a duplicate" a fact rather than a hope. A second tap
//  on the same piece replays the same lead and writes nothing new.
//

import Foundation
import CryptoKit

enum AskComposer {

    // MARK: - Path B

    /// The editable sentence the sheet opens with. The reader can rewrite it;
    /// nothing sends without a tap.
    static func defaultMessage(product: Product, roomName: String?) -> String {
        let noun = product.name
        guard let roomName, !roomName.isEmpty else {
            return "Can we use the \(noun)?"
        }
        return "Can we use the \(noun) in the \(roomName)?"
    }

    /// The body as sent: the reader's words, then one line of the facts the
    /// designer needs to act — piece, price, maker, and the room where there
    /// is one. Kept as a separate line so a rewritten message never loses
    /// them.
    static func body(message: String, product: Product, roomName: String?) -> String {
        let written = message.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts: [String] = [
            product.name,
            product.priceCents > 0 ? PatinaCurrency.format(cents: product.priceCents) : nil,
            product.resolvedMakerName,
            roomName
        ].compactMap { $0 }
        let facts = parts.joined(separator: " · ")
        return written.isEmpty ? facts : "\(written)\n\n\(facts)"
    }

    // MARK: - Path C

    /// One lead per client per piece. The key is the product's own uuid, which
    /// the unique index scopes to this homeowner — two clients asking about
    /// the same piece do not collide.
    static func clientRequestId(for product: Product) -> UUID {
        if let direct = UUID(uuidString: product.id) { return direct }
        // A catalogue id that is not a uuid (preview and synthetic rows) must
        // still key the SAME lead on a second tap. `UUID()` would mint a fresh
        // key each time and quietly write a second lead, which is the one
        // failure `(homeowner_id, client_request_id)` exists to prevent — so
        // the key is derived from the id rather than invented.
        var bytes = Array(SHA256.hash(data: Data(product.id.utf8)).prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x50
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        return UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }

    static func defaultQuestion(product: Product) -> String {
        "Can you tell me more about the \(product.name)?"
    }

    /// The `submit_design_request` call Path C makes at every tier with no
    /// live designer. `single_piece` is the RPC's own vocabulary for "help
    /// selecting and placing the perfect piece" — the closest true answer to
    /// what the reader asked.
    static func leadParams(
        message: String,
        product: Product,
        roomName: String?
    ) -> SubmitDesignRequestParams {
        SubmitDesignRequestParams(
            scanIds: [],
            projectType: DesignServiceType.furniturePlacement.rawValue,
            primaryScanId: nil,
            budgetRange: nil,
            timeline: nil,
            description: body(message: message, product: product, roomName: roomName),
            source: "Patina app · piece",
            clientRequestId: clientRequestId(for: product)
        )
    }
}
