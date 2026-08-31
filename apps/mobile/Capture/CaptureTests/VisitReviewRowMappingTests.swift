//  VisitReviewRowMappingTests.swift
//  CaptureTests
//
//  V4 reads Specimens and speaks in VisitReviewRows. The mapping is the only
//  part of the screen that can be tested at all (constraint C1: CaptureTests
//  links CaptureKit alone), so it carries the judgement calls — what counts as
//  a photo, what counts as placed — and the SwiftUI above it carries none.

import Foundation
import Testing
@testable import CaptureKit

struct VisitReviewRowMappingTests {
    @Test func aSpecimenWithNoPhotosAndNoWordsIsNeitherAPhotoNorANote() {
        let row = VisitReviewRow(specimen: Specimen())
        #expect(row.hasPhoto == false)
        #expect(row.hasTranscript == false)
    }

    @Test func aSpokenNoteCarriesItsTranscript() {
        let specimen = Specimen()
        specimen.voiceTranscript = "the alcove reads about forty-two"
        #expect(VisitReviewRow(specimen: specimen).hasTranscript)
    }

    @Test func aPartialTranscriptStillCountsAsWords() {
        let specimen = Specimen()
        specimen.voicePartialTranscript = "the alcove reads"
        #expect(VisitReviewRow(specimen: specimen).hasTranscript)
    }

    @Test func blankWordsDoNotCountAsANote() {
        let specimen = Specimen()
        specimen.voiceTranscript = "   \n "
        #expect(VisitReviewRow(specimen: specimen).hasTranscript == false)
    }

    @Test func aCaptureIsPlacedWhenItHasAProject_becauseFiledMeansProjectIDIsNotNull() {
        let specimen = Specimen()
        #expect(VisitReviewRow(specimen: specimen).isPlaced == false)

        specimen.venue = VenueStamp(projectId: "b2222222-2222-4222-8222-222222222222")
        #expect(VisitReviewRow(specimen: specimen).isPlaced)
    }

    @Test func theRowKeepsTheSpecimenIDSoTheScreenCanActOnIt() {
        let specimen = Specimen()
        #expect(VisitReviewRow(specimen: specimen).specimenID == specimen.id)
    }
}
