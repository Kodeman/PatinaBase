//  HardwareEntryPolicy.swift
//  CaptureKit
//
//  W1A-03 — derives whether THIS device's fastest capture entry is the
//  Action Button, from an explicit machine-identifier allowlist. Pro vs.
//  non-Pro is deliberately NOT the test: the iPhone 14 Pro has no Action
//  Button, while the base iPhone 16 does. An injectable probe keeps the
//  mapping pure and testable without needing the device under test.

import Foundation

public enum HardwareEntryPolicy {

    /// Reads `utsname.machine`, e.g. `"iPhone17,3"` — the identifier Apple's
    /// own diagnostics key off, not the marketing name.
    public static func currentMachineIdentifier() -> String {
        var info = utsname()
        guard uname(&info) == 0 else { return "unknown" }
        // The String must be built INSIDE the closure — the byte slice does
        // not outlive the pointer.
        let identifier = withUnsafeBytes(of: info.machine) { raw -> String in
            String(bytes: raw.prefix { $0 != 0 }, encoding: .utf8) ?? ""
        }
        return identifier.isEmpty ? "unknown" : identifier
    }

    /// Every model identifier that ships with an Action Button: iPhone 15
    /// Pro / Pro Max onward, every iPhone 16 (base, Plus, Pro, Pro Max,
    /// 16e), iPhone Air and the iPhone 17 family. Absent from every
    /// iPhone 14 — including 14 Pro — and from iPhone 15 / 15 Plus.
    static let actionButtonIdentifiers: Set<String> = [
        "iPhone16,1", "iPhone16,2",                                    // 15 Pro, 15 Pro Max
        "iPhone17,1", "iPhone17,2", "iPhone17,3", "iPhone17,4", "iPhone17,5",
        // 16 Pro, 16 Pro Max, 16, 16 Plus, 16e
        "iPhone18,1", "iPhone18,2", "iPhone18,3", "iPhone18,4", "iPhone18,5",
        // 17 Pro, 17 Pro Max, 17, Air, 17e
    ]

    /// `true` when `machineIdentifier` ships with an Action Button.
    /// Defaults to probing the running device; a test supplies any
    /// identifier directly. An identifier this policy has never been told
    /// about — a future device, or the Simulator's synthetic string —
    /// returns `false`: the Ready screen must not promise a control it
    /// cannot verify exists.
    public static func hasActionButton(machineIdentifier: String = currentMachineIdentifier()) -> Bool {
        actionButtonIdentifiers.contains(machineIdentifier)
    }
}
