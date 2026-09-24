//  VisitReviewRowMappingTests.swift
//  CaptureTests
//
//  V4 reads Pieces and speaks in VisitReviewRows. The mapping is the only
//  part of the screen that can be tested at all (constraint C1: CaptureTests
//  links CaptureKit alone), so it carries the judgement calls — what counts as
//  a photo, what counts as placed — and the SwiftUI above it carries none.

import Foundation
import Testing
@testable import CaptureKit

struct VisitReviewRowMappingTests {
    @Test func aPieceWithNoPhotosAndNoWordsIsNeitherAPhotoNorANote() {
        let row = VisitReviewRow(piece: Piece())
        #expect(row.hasPhoto == false)
        #expect(row.hasTranscript == false)
    }

    @Test func aSpokenNoteCarriesItsTranscript() {
        let piece = Piece()
        piece.voiceTranscript = "the alcove reads about forty-two"
        #expect(VisitReviewRow(piece: piece).hasTranscript)
    }

    @Test func aPartialTranscriptStillCountsAsWords() {
        let piece = Piece()
        piece.voicePartialTranscript = "the alcove reads"
        #expect(VisitReviewRow(piece: piece).hasTranscript)
    }

    @Test func blankWordsDoNotCountAsANote() {
        let piece = Piece()
        piece.voiceTranscript = "   \n "
        #expect(VisitReviewRow(piece: piece).hasTranscript == false)
    }

    @Test func aCaptureIsPlacedWhenItHasAProject_becauseFiledMeansProjectIDIsNotNull() {
        let piece = Piece()
        #expect(VisitReviewRow(piece: piece).isPlaced == false)

        piece.venue = VenueStamp(projectId: "b2222222-2222-4222-8222-222222222222")
        #expect(VisitReviewRow(piece: piece).isPlaced)
    }

    @Test func theRowKeepsThePieceIDSoTheScreenCanActOnIt() {
        let piece = Piece()
        #expect(VisitReviewRow(piece: piece).pieceID == piece.id)
    }
}
