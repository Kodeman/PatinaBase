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
        queue = urls
        isPlaying = true
        advance()
    }

    public func stop() {
        player?.stop()
        player = nil
        queue = []
        isPlaying = false
    }

    private func advance() {
        guard !queue.isEmpty else { isPlaying = false; return }
        let url = queue.removeFirst()
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
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
