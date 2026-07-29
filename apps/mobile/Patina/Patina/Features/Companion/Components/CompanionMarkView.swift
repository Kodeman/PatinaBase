//
//  CompanionMarkView.swift
//  Patina
//
//  The living Companion mark: breathing glow ring, charcoal disc, and three
//  strata capsules — extracted from the static resting mark in
//  `CompanionOverlay` (`companionMark`, Views/CompanionOverlay.swift ~528–567)
//  and given two independent axes of animation:
//
//   - `MarkAttention` (from `CompanionCoachingModel`, Task 1) sets how loudly
//     the resting mark draws attention — full / ambient / calm.
//   - `WakePhase` sequences the one-time wake-up choreography a brand-new
//     user sees before the mark settles into its resting state (dormant →
//     rising → drawing → pulse → awake).
//
//  This view is a pure function of `(attention, wakePhase)` plus
//  `accessibilityReduceMotion` — no side effects, safe to preview, safe to
//  re-render on every parent update. A later task (the Companion overlay)
//  owns driving `wakePhase` forward over time and wrapping the
//  dormant → rising step in the `.patinaHero` spring; this view only renders
//  whichever phase it's handed.
//
//  Under reduce motion the view always renders the steady `.awake`
//  appearance — no shimmer, no pulses, no breathing, no staggered draw-in.
//

import SwiftUI

// MARK: - Wake phase

/// Wake-up choreography phases for the Companion mark's one-time intro.
/// `CompanionMarkView` only *renders* a given phase — the host (the
/// Companion overlay, a later task) drives progression through these.
public enum WakePhase: Equatable {
    /// Mark hidden — shrunk and invisible, before the intro begins.
    case dormant
    /// Mark risen to full scale/opacity; strata lines not yet drawn.
    case rising
    /// Strata capsules drawing in, staggered left to right.
    case drawing
    /// Everything full, plus a one-shot attention-pulse burst.
    case pulse
    /// Steady state — the mark's ordinary resting appearance.
    case awake
}

// MARK: - Mark view

/// The Companion's animated resting mark.
/// Controls whether the living Strata mark supplies its own charcoal disc or
/// is embedded into the larger Companion shell during a morph.
public enum CompanionMarkSurface: Equatable, Sendable {
    case disc
    case embedded
}

public struct CompanionMarkView: View {
    let attention: MarkAttention
    let wakePhase: WakePhase
    let surface: CompanionMarkSurface
    let allowsAmbientMotion: Bool

    /// Preview-only override — see the `previewReduceMotion:` initializer
    /// below for why this exists instead of a `.environment(...)` override
    /// at the preview call site.
    private let reduceMotionOverride: Bool?

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion

    public init(
        attention: MarkAttention,
        wakePhase: WakePhase = .awake,
        surface: CompanionMarkSurface = .disc,
        allowsAmbientMotion: Bool = true
    ) {
        self.attention = attention
        self.wakePhase = wakePhase
        self.surface = surface
        self.allowsAmbientMotion = allowsAmbientMotion
        self.reduceMotionOverride = nil
    }

    /// Preview-only seam for forcing the reduce-motion rendering path
    /// deterministically. `EnvironmentValues.accessibilityReduceMotion` is a
    /// read-only `KeyPath` (not `WritableKeyPath`) in this SDK — verified via
    /// an isolated `swiftc -typecheck` repro — so
    /// `.environment(\.accessibilityReduceMotion, true)` does not compile at
    /// a preview call site. `fileprivate` so production code outside this
    /// file cannot reach it; the reduce-motion `#Preview` below lives in the
    /// same file.
    fileprivate init(attention: MarkAttention, wakePhase: WakePhase = .awake, previewReduceMotion: Bool) {
        self.attention = attention
        self.wakePhase = wakePhase
        self.surface = .disc
        self.allowsAmbientMotion = true
        self.reduceMotionOverride = previewReduceMotion
    }

    private var reduceMotion: Bool {
        reduceMotionOverride ?? systemReduceMotion
    }

    /// `wakePhase` collapsed to `.awake` under reduce motion, so the whole
    /// wake choreography (scale/opacity rise, staggered strata draw-in, the
    /// pulse burst) disappears and the view renders its steady state
    /// regardless of what phase it was actually handed.
    private var effectiveWakePhase: WakePhase {
        reduceMotion ? .awake : wakePhase
    }

    private var isDormant: Bool { effectiveWakePhase == .dormant }
    private var isAwake: Bool { effectiveWakePhase == .awake }

    /// Strata capsules are hidden (zero width) until the choreography passes
    /// `.rising` — they draw in during `.drawing` and stay shown through
    /// `.pulse`/`.awake`.
    private var strataRevealed: Bool {
        effectiveWakePhase != .dormant && effectiveWakePhase != .rising
    }

    public var body: some View {
        ZStack {
            // 1. Attention pulse rings — full attention, steady state only.
            // Structurally unmounted under reduce motion: no vestigial pulse
            // ring should render, even inert.
            if allowsAmbientMotion, attention == .full, isAwake, !reduceMotion {
                PulseAnimation(color: PatinaColors.clay, isActive: true)
                    .frame(width: 58, height: 58)
                    .allowsHitTesting(false)
            }

            // Wake-phase pulse burst — a one-shot "I'm awake" announcement,
            // distinct from the steady attention-pulse above and shown
            // regardless of attention level. `PulseAnimation` has no
            // built-in one-shot mode (it repeats for as long as it's mounted
            // and active — see PulseAnimation.swift), so the "one-shot"
            // quality comes from the host advancing `wakePhase` past
            // `.pulse` shortly after mounting it; that sequencing is owned
            // by the overlay, out of scope here. Also structurally unmounted
            // under reduce motion, matching the steady-state pulse above.
            if allowsAmbientMotion, effectiveWakePhase == .pulse, !reduceMotion {
                PulseAnimation(color: PatinaColors.clay, isActive: true)
                    .frame(width: 58, height: 58)
                    .allowsHitTesting(false)
            }

            // 2. Breathing glow ring — belongs only to the resting circle.
            // Progress and expanded states keep the mark still inside the shell.
            if allowsAmbientMotion {
                Circle()
                    .stroke(PatinaColors.clay.opacity(0.35), lineWidth: 1.5)
                    .frame(width: 58, height: 58)
                    .breathing(
                        minScale: 1.0,
                        maxScale: 1.10,
                        duration: 3.0,
                        isActive: isAwake
                    )
            }

            // 3. Charcoal disc — supplied by the mark at rest, and by the
            // shared shell while the Companion is communicating.
            if surface == .disc {
                Circle()
                    .fill(PatinaColors.Background.dark)
                    .frame(width: 52, height: 52)
                    .patinaShadow(PatinaShadows.companion)
            }

            // 4. Exact three-strata mark (white on charcoal).
            strataLines
        }
        .scaleEffect(isDormant ? 0.6 : 1.0)
        .opacity(isDormant ? 0 : 1)
    }

    // MARK: Strata lines

    private static let strataBaseWidths: [CGFloat] = [20, 16, 12]
    private static let strataBaseOpacities: [Double] = [1.0, 0.7, 0.4]

    /// Shimmer wave phases. `.rest` is the long dwell; `.line1`/`.line2`/
    /// `.line3` each briefly boost one capsule's opacity/width as the wave
    /// rolls through.
    private enum ShimmerPhase: CaseIterable {
        case rest, line1, line2, line3

        var activeIndex: Int? {
            switch self {
            case .rest: return nil
            case .line1: return 0
            case .line2: return 1
            case .line3: return 2
            }
        }
    }

    /// Whether the shimmer wave is mounted at all: only once awake, only for
    /// `.full`/`.ambient` attention, and never under reduce motion. Gated
    /// structurally (the `phaseAnimator` simply isn't in the view tree)
    /// rather than merely deactivated, since it's a repeating animator.
    private var shimmerActive: Bool {
        allowsAmbientMotion && isAwake && !reduceMotion && (attention == .full || attention == .ambient)
    }

    @ViewBuilder
    private var strataLines: some View {
        if shimmerActive {
            strataStack(activeLine: nil)
                .phaseAnimator(ShimmerPhase.allCases) { _, phase in
                    strataStack(activeLine: phase.activeIndex)
                } animation: { phase in
                    // The long transition INTO .rest is the dwell; the three
                    // 0.5s transitions into line1/line2/line3 are the wave.
                    // 5.0 + 0.5×3 = 6.5s per cycle.
                    phase == .rest ? .easeInOut(duration: 5.0) : .easeInOut(duration: 0.5)
                }
        } else {
            strataStack(activeLine: nil)
        }
    }

    private func strataStack(activeLine: Int?) -> some View {
        VStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { index in
                strataCapsule(index: index, activeLine: activeLine)
            }
        }
    }

    private func strataCapsule(index: Int, activeLine: Int?) -> some View {
        let baseWidth = Self.strataBaseWidths[index]
        let baseOpacity = Self.strataBaseOpacities[index]
        let isShimmerActive = activeLine == index
        let width: CGFloat = strataRevealed ? (isShimmerActive ? baseWidth * 1.15 : baseWidth) : 0
        let opacity = isShimmerActive ? 1.0 : baseOpacity

        return Capsule()
            .fill(PatinaColors.offWhite.opacity(opacity))
            .frame(width: width, height: 1.5)
            // Staggered draw-in when the choreography flips from .rising to
            // .drawing. Inert (never fires) once `strataRevealed` is already
            // true on first render — i.e. normal `.awake` mounts, and every
            // render under reduce motion.
            .animation(
                .easeOut(duration: 0.25).delay(0.15 * Double(index)),
                value: wakePhase
            )
    }
}

// MARK: - Previews

#Preview("Attention Levels") {
    HStack(spacing: 32) {
        VStack(spacing: 8) {
            CompanionMarkView(attention: .full)
            Text("full").font(PatinaTypography.captionSmall).foregroundStyle(PatinaColors.Text.muted)
        }
        VStack(spacing: 8) {
            CompanionMarkView(attention: .ambient)
            Text("ambient").font(PatinaTypography.captionSmall).foregroundStyle(PatinaColors.Text.muted)
        }
        VStack(spacing: 8) {
            CompanionMarkView(attention: .calm)
            Text("calm").font(PatinaTypography.captionSmall).foregroundStyle(PatinaColors.Text.muted)
        }
    }
    .padding(40)
    .background(PatinaColors.Background.primary)
}

#Preview("Wake Phase") {
    WakePhaseSteppingPreview()
}

/// Preview-only helper that steps through the wake choreography on demand so
/// each phase (and the `.patinaHero`-sprung transition between them) can be
/// eyeballed in Xcode's canvas.
private struct WakePhaseSteppingPreview: View {
    private static let phases: [WakePhase] = [.dormant, .rising, .drawing, .pulse, .awake]

    @State private var index = 0

    var body: some View {
        VStack(spacing: 24) {
            CompanionMarkView(attention: .full, wakePhase: Self.phases[index])
                .frame(height: 80)

            Text(String(describing: Self.phases[index]))
                .font(PatinaTypography.monoSmall)
                .foregroundStyle(PatinaColors.Text.muted)

            Button("Next phase →") {
                withAnimation(.patinaHero) {
                    index = (index + 1) % Self.phases.count
                }
            }
            .buttonStyle(.bordered)
        }
        .padding(40)
        .background(PatinaColors.Background.primary)
    }
}

#Preview("Reduce Motion") {
    // Deliberately handed a mid-choreography phase to demonstrate the
    // collapse to `.awake` appearance under reduce motion. Forced via the
    // `previewReduceMotion:` seam rather than `.environment(...)` — see its
    // doc comment for why.
    CompanionMarkView(attention: .full, wakePhase: .drawing, previewReduceMotion: true)
        .padding(40)
        .background(PatinaColors.Background.primary)
}
