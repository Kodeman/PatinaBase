//  HardwareEntryPolicyTests.swift
//  CaptureTests
//
//  W1A-03 — Pro/non-Pro is deliberately NOT the axis under test here: the
//  iPhone 14 Pro has no Action Button, and the base iPhone 16 does. Every
//  case below passes an identifier directly through the injectable probe —
//  none of these devices need to be in hand to run this suite.

import Foundation
import Testing
@testable import CaptureKit

struct HardwareEntryPolicyTests {
    @Test func iPhone14ProHasNoActionButton() {
        #expect(HardwareEntryPolicy.hasActionButton(machineIdentifier: "iPhone15,2") == false)
    }

    @Test func baseIPhone16HasAnActionButton() {
        #expect(HardwareEntryPolicy.hasActionButton(machineIdentifier: "iPhone17,3") == true)
    }

    @Test func iPhone15HasNoActionButton() {
        #expect(HardwareEntryPolicy.hasActionButton(machineIdentifier: "iPhone15,4") == false)
    }

    @Test func anUnrecognizedFutureIdentifierDefaultsToNoPromise() {
        #expect(HardwareEntryPolicy.hasActionButton(machineIdentifier: "iPhone99,9") == false)
    }

    @Test func iPhone15ProHasAnActionButton() {
        #expect(HardwareEntryPolicy.hasActionButton(machineIdentifier: "iPhone16,1") == true)
    }

    @Test func the16eHasAnActionButton() {
        #expect(HardwareEntryPolicy.hasActionButton(machineIdentifier: "iPhone17,5") == true)
    }

    @Test func currentMachineIdentifierIsNeverEmpty() {
        #expect(!HardwareEntryPolicy.currentMachineIdentifier().isEmpty)
    }
}
