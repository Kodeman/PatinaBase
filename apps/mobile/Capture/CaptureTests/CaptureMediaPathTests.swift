//  CaptureMediaPathTests.swift
//  CaptureTests
//
//  Storage RLS on capture-media (migration 00234) gates on
//  `auth.uid()::text = (storage.foldername(name))[1]` — Postgres's lowercase
//  canonical UUID rendering. Foundation's `UUID.uuidString` is uppercase, so
//  this guards `CaptureMediaPath.folder` against ever building an upload path
//  that would throw an RLS violation.

import Foundation
import Testing
@testable import CaptureKit

struct CaptureMediaPathTests {
    @Test func folderIsFullyLowercasedFromUppercaseUUIDs() {
        let userID = UUID(uuidString: "9AD8F978-58B1-4E1A-9C2D-3F1B2C4D5E6F")!
        let clientToken = UUID(uuidString: "ABCDEF01-2345-6789-ABCD-EF0123456789")!

        let folder = CaptureMediaPath.folder(userID: userID, clientToken: clientToken)

        #expect(folder == "9ad8f978-58b1-4e1a-9c2d-3f1b2c4d5e6f/abcdef01-2345-6789-abcd-ef0123456789")
        #expect(folder == folder.lowercased())
    }
}
