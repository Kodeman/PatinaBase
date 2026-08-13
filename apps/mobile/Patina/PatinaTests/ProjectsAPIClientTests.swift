//
//  ProjectsAPIClientTests.swift
//  PatinaTests
//

import Foundation
import Testing
@testable import Patina

struct ProjectsAPIClientTests {
    @Test
    func decodesCuratedSelectionLogisticsStatus() throws {
        let data = Data(#"""
        {
          "projectId":"project-1",
          "selections":[{
            "id":"selection-1",
            "name":"Walnut chair",
            "logisticsStatus":"shipped",
            "roomName":"Living room"
          }]
        }
        """#.utf8)

        let bundle = try JSONDecoder().decode(RemoteClientSelectionsBundle.self, from: data)
        #expect(bundle.selections.count == 1)
        #expect(bundle.selections[0].logisticsStatus == "shipped")
        #expect(bundle.selections[0].room_name == "Living room")
    }

    @Test
    func doesNotFallbackToRawStatusKey() throws {
        let data = Data(#"{"selections":[{"id":"selection-1","status":"installed"}]}"#.utf8)
        let bundle = try JSONDecoder().decode(RemoteClientSelectionsBundle.self, from: data)
        #expect(bundle.selections[0].logisticsStatus == nil)
    }
}
