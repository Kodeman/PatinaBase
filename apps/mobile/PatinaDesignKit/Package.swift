// swift-tools-version: 6.0
//
//  PatinaDesignKit — the shared iOS design system (R27, Wave 0).
//
//  Consumed by BOTH iOS apps: Patina (client) links it directly from
//  Patina.xcodeproj; Patina Field links it into the Capture app target and
//  the embedded CaptureKit framework via scripts/generate_project.rb.
//
//  Rules:
//  - SwiftUI/UIKit/CoreText ONLY. Never import Supabase, PostHog, or any
//    other SDK here — this package must stay a pure design layer.
//  - The library product is .dynamic ON PURPOSE: it lands in both the
//    Capture app target and the embedded CaptureKit framework; a static
//    product linked to both would duplicate every symbol.
//  - Swift language mode is pinned to 5 to match the two consuming apps
//    (the moved sources predate strict concurrency).

import PackageDescription

let package = Package(
    name: "PatinaDesignKit",
    platforms: [
        .iOS(.v18) // both apps target iOS 18+ (Patina + Capture DEPLOYMENT = 18.0)
    ],
    products: [
        .library(
            name: "PatinaDesignKit",
            type: .dynamic,
            targets: ["PatinaDesignKit"]
        )
    ],
    targets: [
        .target(
            name: "PatinaDesignKit",
            resources: [
                .process("Resources/Fonts")
            ],
            swiftSettings: [
                .swiftLanguageMode(.v5)
            ]
        )
    ]
)
