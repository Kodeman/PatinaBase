//  SuggestionEngineTests.swift
//  CaptureTests
//
//  The suggestion lane (spec §9.3, graft from Direction B). A suggestion is
//  ALWAYS a question with its basis in words — never a fact, never a number.

import Foundation
import Testing
@testable import CaptureKit

struct SuggestionEngineTests {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func project(_ id: String, name: String,
                         centroid: CaptureCoordinate?, filings: Int,
                         rooms: [CaptureCachedRoom] = []) -> CaptureProjectSnapshot {
        CaptureProjectSnapshot(id: id, name: name, specRooms: rooms, rooms: [],
                               lastRefreshedAt: now, lastVisitedAt: now,
                               lastFiledCoordinate: centroid, filedCaptureCount: filings)
    }

    @Test func standingWhereSheHasFiledBeforeSuggestsThatProject() throws {
        let here = CaptureCoordinate(latitude: 43.0731, longitude: -89.4012)
        let suggestion = try #require(CaptureSuggestionEngine.suggest(
            coordinate: here, venueLabel: nil,
            projects: [project("p1", name: "Maple St", centroid: here, filings: 9)],
            now: now))
        #expect(suggestion.projectID == "p1")
        #expect(suggestion.basis == .proximity)
        #expect(suggestion.reason == "You filed 9 captures to Maple St from right here")
    }

    @Test func theReasonIsWordsAndNeverANumberOfConfidence() throws {
        let here = CaptureCoordinate(latitude: 43.0731, longitude: -89.4012)
        let suggestion = try #require(CaptureSuggestionEngine.suggest(
            coordinate: here, venueLabel: nil,
            projects: [project("p1", name: "Maple St", centroid: here, filings: 9)],
            now: now))
        #expect(!suggestion.reason.contains("%"))
        #expect(!suggestion.reason.contains(String(format: "%.2f", suggestion.confidence)))
        #expect(suggestion.confidence > 0 && suggestion.confidence <= 1)
    }

    @Test func tooFewFilingsIsNotEnoughToSuggest() {
        let here = CaptureCoordinate(latitude: 43.0731, longitude: -89.4012)
        #expect(CaptureSuggestionEngine.suggest(
            coordinate: here, venueLabel: nil,
            projects: [project("p1", name: "Maple St", centroid: here, filings: 2)],
            now: now) == nil)
    }

    @Test func standingFarAwaySuggestsNothing() {
        let here = CaptureCoordinate(latitude: 43.0731, longitude: -89.4012)
        let farAway = CaptureCoordinate(latitude: 44.0, longitude: -90.0)
        #expect(CaptureSuggestionEngine.suggest(
            coordinate: farAway, venueLabel: nil,
            projects: [project("p1", name: "Maple St", centroid: here, filings: 9)],
            now: now) == nil)
    }

    @Test func theNearestCentroidWins() throws {
        let here = CaptureCoordinate(latitude: 43.0731, longitude: -89.4012)
        let near = CaptureCoordinate(latitude: 43.0732, longitude: -89.4012)
        let lessNear = CaptureCoordinate(latitude: 43.0740, longitude: -89.4012)
        let suggestion = try #require(CaptureSuggestionEngine.suggest(
            coordinate: here, venueLabel: nil,
            projects: [project("far", name: "Harbor loft", centroid: lessNear, filings: 20),
                       project("near", name: "Maple St", centroid: near, filings: 4)],
            now: now))
        #expect(suggestion.projectID == "near")
    }

    @Test func aVenueNameMatchIsAWeakerBasisThanProximity() throws {
        let suggestion = try #require(CaptureSuggestionEngine.suggest(
            coordinate: nil, venueLabel: "Maple St residence",
            projects: [project("p1", name: "Maple St residence", centroid: nil, filings: 0)],
            now: now))
        #expect(suggestion.basis == .venue)
        #expect(suggestion.reason == "You're at a place called Maple St residence")
        #expect(suggestion.confidence < 0.6)
    }

    @Test func noSignalAndNoNameSuggestsNothingRatherThanGuessing() {
        #expect(CaptureSuggestionEngine.suggest(
            coordinate: nil, venueLabel: nil,
            projects: [project("p1", name: "Maple St", centroid: nil, filings: 9)],
            now: now) == nil)
    }
}
