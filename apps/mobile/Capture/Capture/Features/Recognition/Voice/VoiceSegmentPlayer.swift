//  VoiceSegmentPlayer.swift
//  Capture
//
//  "The audio is here" was, until this file, an assertion she could not check:
//  there is no AVAudioPlayer or AVPlayer anywhere in Patina Field, and portal
//  playback is wave 4 behind a fail-closed flag. The files are already in the
//  App Group; this plays them back in order.

import Foundation
import AVFoundation

@MainActor
@Observable
public final class VoiceSegmentPlayer: NSObject, AVAudioPlayerDelegate {
    public private(set) var isPlaying = false
    private var player: AVAudioPlayer?
    private var queue: [URL] = []

    public func play(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        // The session is claimed ONCE per run, not per segment: inside advance()
        // a session failure was indistinguishable from an unreadable file and
        // was silently skipped as if the audio were missing.
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            return
        }
        queue = urls
        isPlaying = true
        advance()
    }

    public func stop() {
        // Five callers reach here on paths where nothing ever sounded - every
        // take start among them - and an unguarded setActive(false) there
        // un-ducks her music microseconds before the recorder re-ducks it, or
        // aims a deactivation at a live .record session.
        guard player != nil || isPlaying else { return }
        player?.stop()
        player = nil
        queue = []
        isPlaying = false
        // The recorder hands the session back at four sites; so does this, or
        // her music stays ducked until something else happens to claim it.
        try? AVAudioSession.sharedInstance()
            .setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func advance() {
        guard !queue.isEmpty else { stop(); return }
        let url = queue.removeFirst()
        do {
            let next = try AVAudioPlayer(contentsOf: url)
            next.delegate = self
            player = next
            next.play()
        } catch {
            advance()   // a missing or unreadable segment is skipped, never fatal
        }
    }

    nonisolated public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer,
                                                        successfully flag: Bool) {
        Task { @MainActor in self.advance() }
    }
}
