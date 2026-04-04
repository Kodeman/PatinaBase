//
//  PatinaGradients.swift
//  Patina
//
//  Patina Design System - Gradient Fills
//  Used as placeholder image fills throughout the app
//

import SwiftUI

/// Patina Design System - Gradient Fills for placeholder images
public enum PatinaGradients {

    public static let warm = LinearGradient(
        colors: [PatinaColors.softCream, PatinaColors.clay],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let dusk = LinearGradient(
        colors: [PatinaColors.dustyBlue, PatinaColors.mocha],
        startPoint: .top, endPoint: .bottom
    )

    public static let earth = LinearGradient(
        colors: [PatinaColors.agedOak, PatinaColors.clay],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let sageGradient = LinearGradient(
        colors: [PatinaColors.sage, PatinaColors.pearl],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let leather = LinearGradient(
        colors: [Color(hex: "8B6F47"), Color(hex: "A3927C")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let linen = LinearGradient(
        colors: [Color(hex: "D4CFC7"), Color(hex: "E5E2DD")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let stone = LinearGradient(
        colors: [Color(hex: "9E9689"), Color(hex: "B8B0A5")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let wood = LinearGradient(
        colors: [Color(hex: "6B5B4E"), Color(hex: "8B7355")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let metal = LinearGradient(
        colors: [Color(hex: "7A7B80"), Color(hex: "A8A9AD")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let rattan = LinearGradient(
        colors: [Color(hex: "B8A080"), Color(hex: "D4C4A8")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let sunrise = LinearGradient(
        colors: [PatinaColors.offWhite, PatinaColors.goldenHour, PatinaColors.clay],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
}
