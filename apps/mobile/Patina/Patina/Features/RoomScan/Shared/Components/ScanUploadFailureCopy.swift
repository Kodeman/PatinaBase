//
//  ScanUploadFailureCopy.swift
//  Patina
//
//  Every way a scan upload can fail, said in Patina's words.
//
//  C4-09, from L1-E's copy deck. `ScanUploadProgressView` printed
//  `package.lastError` raw — storage and Postgres text, written from
//  `error.localizedDescription` in `RoomScanSyncService(+AdvancedBundle)` —
//  under a photograph of the reader's own living room.
//
//  Modelled on `Features/Purchase/OrderFailureCopy.swift` and obeying the
//  same rule: the thrown error is logged, never interpolated.
//  `RoomScanPackage.lastError` stays exactly as it is — it is the on-disk
//  diagnostic column, it is unit-tested, and it is what a support ask reads.
//  Only the view stops printing it.
//

import Foundation

enum ScanUploadFailureCopy {

    static let connection = "Upload paused — check your connection. It'll pick up automatically."
    static let unfinished = "We couldn't finish uploading your scan. Try again from here."

    /// The sentence for a package that is failed or parked.
    ///
    /// `nil` where there is nothing to say: no recorded error, or a package
    /// in a state the reader is not waiting on.
    static func message(for package: RoomScanPackage) -> String? {
        guard let raw = package.lastError, !raw.isEmpty else { return nil }
        guard package.status == .failed || package.status == .pending else { return nil }
        #if DEBUG
        PatinaLog.sync.error("[ScanUpload] failure detail (never shown): \(raw)")
        #endif
        return message(forRawError: raw)
    }

    /// The classification, separated so a test can call it directly. Only two
    /// answers, because only two things a reader can do follow from it: wait
    /// for the network, or ask again from this screen.
    static func message(forRawError raw: String) -> String {
        isTransport(raw) ? connection : unfinished
    }

    /// URLError's own vocabulary, plus the phrases `localizedDescription`
    /// produces for the offline and timeout cases.
    private static func isTransport(_ raw: String) -> Bool {
        let needles = [
            "offline", "internet connection", "network connection",
            "timed out", "timeout", "could not connect",
            "cannot connect", "connection was lost", "unreachable"
        ]
        return needles.contains { raw.localizedCaseInsensitiveContains($0) }
    }
}
