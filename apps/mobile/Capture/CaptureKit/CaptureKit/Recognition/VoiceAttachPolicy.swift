//  VoiceAttachPolicy.swift
//  CaptureKit
//
//  What a voice take may overwrite on a capture that already carries one.
//
//  The N4 sheet is keyed per specimen and re-openable on a capture whose audio
//  has ALREADY synced: the objects are in Storage, the specimen's remote-path
//  stamps are set, and the local .m4a files have been deleted by the receipt.
//  The only key by which the sync layer can still reach those stamps is the
//  SEGMENT NAME LIST — stampedVoicePaths keys voiceAudioRemotePathsRaw by
//  trailing path component and is consulted only for names still present in
//  voiceAudioSegmentsRaw. So clearing that list does not merely forget a local
//  file: it makes durable server audio unreachable, and the next commit sends
//  audioPath = nil with an omitted segments key, which 00530 writes as
//  voice_audio_path = NULL and voice_audio_segments = '[]' over audio sitting
//  intact in the bucket.
//
//  Hence the rule, in one pure function so it can be tested and so both the
//  sheet and any later surface share it: a re-attach may REPLACE the audio
//  only when the new take published at least one segment. Otherwise every
//  existing stamp, path and duration is preserved untouched.
//
//  Deliberately NOT here: superseding a take on purpose. That is a wave-2
//  decision, and it has to delete the old files AND clear the stamps together
//  or it reopens the same hole from the other side.

import Foundation

/// The four voice fields an attach writes to a specimen, as one value.
public struct VoiceAttachment: Sendable, Equatable {
    /// Segment 0, for every legacy reader.
    public var audioFilename: String?
    /// Ordered segment names — the key to the remote-path stamps.
    public var audioSegments: [String]?
    /// One of 00530's allow-list: device, device_partial, server, designer.
    public var transcriptSource: String?
    public var durationSeconds: Double?

    public init(audioFilename: String? = nil,
                audioSegments: [String]? = nil,
                transcriptSource: String? = nil,
                durationSeconds: Double? = nil) {
        self.audioFilename = audioFilename
        self.audioSegments = audioSegments
        self.transcriptSource = transcriptSource
        self.durationSeconds = durationSeconds
    }

    /// A legacy single-file note carries a filename and no segment list, so
    /// "has audio" cannot be read off the list alone.
    public var hasAudio: Bool {
        if !(audioSegments ?? []).isEmpty { return true }
        return !(audioFilename ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

public enum VoiceAttachPolicy {
    /// Merge the take that is being attached into what the specimen already
    /// holds.
    ///
    /// - A take with at least one published segment REPLACES all four fields:
    ///   it is a real recording and the specimen is now about that recording.
    /// - A take with no segments — a typed note, a re-attach of an edit, or a
    ///   recording whose file never opened — preserves the existing audio
    ///   fields verbatim. It may still correct the transcript source: a take
    ///   that produced WORDS was spoken, and a specimen that has never had any
    ///   audio at all is plainly the designer's own typing.
    public static func merge(existing: VoiceAttachment,
                             new: VoiceNoteResult?) -> VoiceAttachment {
        let segments = new?.audioSegments ?? []
        guard segments.isEmpty else {
            return VoiceAttachment(
                audioFilename: new?.audioFilename,
                audioSegments: segments,
                transcriptSource: (new?.transcript ?? "").isEmpty ? "device_partial" : "device",
                durationSeconds: new?.durationSeconds)
        }

        var kept = existing
        if let new, !new.transcript.isEmpty {
            // Words with no file: recognition ran, the write did not. The
            // transcript is device-spoken whatever happened to the audio.
            kept.transcriptSource = "device"
            // The duration travels with the AUDIO — reporting this take's
            // length over an earlier take's file would time the wrong note.
            if !existing.hasAudio { kept.durationSeconds = new.durationSeconds }
        } else if !existing.hasAudio {
            // Nothing here was ever spoken: no words now, no audio ever.
            kept.transcriptSource = "designer"
            kept.durationSeconds = nil
        }
        // else: audio is attached and the words were typed over it. The stored
        // source describes that audio, so it is left exactly as it stands —
        // relabelling it "designer" would deny a recording that exists.
        return kept
    }
}
