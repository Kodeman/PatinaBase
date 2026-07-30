//  PatinaCompanionMotion.swift
//  PatinaDesignKit
//
//  Cross-app motion tokens for the Option B Companion shell.

import SwiftUI

public enum PatinaCompanionMotion {
    /// Calm shell morph, shared by Patina and Patina Field.
    public static let morphResponse: Double = 0.48
    public static let morphDampingFraction: Double = 0.86

    /// Copy follows the geometry instead of competing with it.
    public static let contentFollowDelay: Double = 0.08
    public static let contentFadeDuration: Double = 0.20

    /// Reduce Motion removes geometry interpolation and uses this crossfade.
    public static let reducedMotionCrossfadeDuration: Double = 0.18

    /// Ambient breathing belongs only to the collapsed Hearth.
    public static let breathingDuration: Double = 3.0

    public static func shellAnimation(reduceMotion: Bool) -> Animation {
        reduceMotion
            ? .easeOut(duration: reducedMotionCrossfadeDuration)
            : .spring(
                response: morphResponse,
                dampingFraction: morphDampingFraction
            )
    }

    public static var contentAnimation: Animation {
        .easeOut(duration: contentFadeDuration)
            .delay(contentFollowDelay)
    }
}
