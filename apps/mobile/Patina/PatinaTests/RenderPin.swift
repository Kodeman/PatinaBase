//
//  RenderPin.swift
//  PatinaTests
//
//  Rasterises a SwiftUI view so a test can measure what a screen actually
//  draws, rather than what its tokens compute to.
//
//  `PatinaContrast` measures tokens, which is the right instrument for a
//  palette and the wrong one for a *modifier*. `RL1D-R3-01` is the case that
//  proves it: `HouseRecordCard` put `.disabled(…)` on a plain `Button`, SwiftUI
//  halved the ink's opacity, and the rendered row sat at C-20's own 4.27:1
//  while every token bar in `ContrastTests` stayed green — because no token
//  had changed. This renders through a `UIHostingController` with
//  `overrideUserInterfaceStyle`, so the trait-aware `PatinaColors` providers
//  resolve the way they do on the device.
//

import Foundation
import SwiftUI
import UIKit

@MainActor
enum RenderPin {

    /// A rasterised view, as straight sRGB bytes.
    struct Raster {
        let pixels: [UInt8]   // RGBA, 4 bytes per pixel
        let width: Int
        let height: Int

        /// WCAG relative luminance of one pixel.
        func luminance(x: Int, y: Int) -> Double {
            let offset = (y * width + x) * 4
            func linear(_ byte: UInt8) -> Double {
                let value = Double(byte) / 255
                return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * linear(pixels[offset])
                + 0.7152 * linear(pixels[offset + 1])
                + 0.0722 * linear(pixels[offset + 2])
        }

        /// The luminance furthest from `ground` anywhere in the raster — the
        /// darkest ink on a light field, or the brightest on a dark one. This
        /// is the number a dim moves and a token does not.
        func extremeInk(from ground: Double) -> Double {
            var extreme = ground
            for y in 0..<height {
                for x in 0..<width {
                    let value = luminance(x: x, y: y)
                    if abs(value - ground) > abs(extreme - ground) { extreme = value }
                }
            }
            return extreme
        }

        /// How many distinct luminance buckets the raster contains. A render
        /// that never drew — a blank field of the ground colour — reports 1,
        /// and a blank render would otherwise make every ink assertion pass by
        /// measuring nothing. Every test here calls this first.
        var distinctTones: Int {
            var buckets = Set<Int>()
            for y in 0..<height {
                for x in 0..<width {
                    buckets.insert(Int(luminance(x: x, y: y) * 255))
                }
            }
            return buckets.count
        }
    }

    /// `ImageRenderer` rather than `drawHierarchy`: the latter needs the view on
    /// a visible screen and, headless in a test process, returns a flat field of
    /// the ground — a silently-green measurement of a blank image. Every suite
    /// here checks `distinctTones` first so that failure mode cannot come back.
    ///
    /// The appearance is set on the environment. `PatinaColors`' tokens are
    /// trait-aware `UIColor` providers bridged through `Color`, and SwiftUI
    /// resolves them against the renderer's environment — `groundIsTheToken`
    /// in `HouseRecordRowInkTests` asserts that, so a future SwiftUI that
    /// stopped honouring it would fail rather than measure the light side twice.
    static func raster(
        _ view: some View,
        size: CGSize,
        style: UIUserInterfaceStyle,
        scale: CGFloat = 3
    ) -> Raster {
        let renderer = ImageRenderer(
            content: AnyView(
                view
                    .frame(width: size.width, height: size.height)
                    .environment(\.colorScheme, style == .dark ? .dark : .light)
            )
        )
        renderer.scale = scale
        let image = renderer.uiImage ?? UIImage()

        let width = Int(size.width * scale)
        let height = Int(size.height * scale)
        var pixels = [UInt8](repeating: 0, count: width * height * 4)

        pixels.withUnsafeMutableBytes { buffer in
            guard
                let cgImage = image.cgImage,
                let context = CGContext(
                    data: buffer.baseAddress,
                    width: width,
                    height: height,
                    bitsPerComponent: 8,
                    bytesPerRow: width * 4,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
                )
            else { return }
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        }

        return Raster(pixels: pixels, width: width, height: height)
    }

    /// The luminance a `PatinaColors` token resolves to in one appearance —
    /// the ground a raster's ink is measured against.
    static func groundLuminance(_ color: Color, _ style: UIUserInterfaceStyle) -> Double {
        PatinaContrast.luminance(color, style)
    }
}
