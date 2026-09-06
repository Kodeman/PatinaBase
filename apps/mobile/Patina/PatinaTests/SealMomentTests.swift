//
//  SealMomentTests.swift
//  PatinaTests
//
//  `P-19`. The seal and the act, full screen: the restated terms carried over
//  unchanged, the edition line above them, and one settle that never becomes
//  a celebration.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct SealMomentTests {

    // MARK: - The terms are carried, not rewritten

    /// The sheet's trustworthiness was `ProposalSignTerms`' contract:
    /// "Nothing here is invented. Every line is a value the RPC sent or it is
    /// absent." The full-screen act inherits it by using the same composer,
    /// not by re-composing the rows.
    @Test("the restated terms are byte-identical to the sheet's")
    func theTermsAreUnchanged() throws {
        let terms = ProposalSignTerms(
            projectName: "Aspen Loft Refresh",
            total: "$100,000.00",
            depositLabel: "Retainer",
            deposit: "$25,000.00",
            terms: "Net 30",
            expiry: "Expires Sep 8"
        )
        #expect(terms.lines.map(\.label) == ["Project", "Total", "Retainer", "Terms", "Expiry"])
        #expect(terms.lines.map(\.value) == [
            "Aspen Loft Refresh", "$100,000.00", "$25,000.00", "Net 30", "Expires Sep 8"
        ])
        // An absent field draws nothing — the row is not invented as a blank.
        #expect(ProposalSignTerms.empty.lines.isEmpty)

        let composer = try SourcePin.read("Patina/Features/Proposals/ProposalSignTerms.swift")
        #expect(composer.contains("Nothing here is invented. Every line is a value the RPC"))

        // The act reads the composer; it does not carry a second copy. The
        // preview is excluded — a `#Preview` builds sample data by hand, which
        // is what a preview is for.
        let whole = try SourcePin.readCode("Patina/Features/Proposals/Views/SignActView.swift")
        let act = String(whole[..<(whole.range(of: "#Preview")?.lowerBound ?? whole.endIndex)])
        #expect(act.contains("let lines = terms.lines"))
        #expect(!act.contains("ProposalSignTerms("), "the act composes its own terms")
    }

    // MARK: - The edition line

    /// From `version` and `sent_at`, which `get_client_proposal_bundle`
    /// already returns (00407:366). Neither is invented, and a bundle carrying
    /// neither draws no line at all.
    @Test("the edition line uses what the bundle sent, or says nothing")
    func theEditionLineIsNeverInvented() {
        // The day is the device's, so the expectation composes it the same way
        // rather than pinning a literal that moves with the simulator's zone.
        let issued = "2026-09-02T12:00:00Z"
        let day = DateDisplay.fromTimestamp(issued)
        #expect(
            ProposalSignActCopy.edition(version: 3, issuedAt: issued)
                == "Edition 3 · Issued \(day)"
        )
        #expect(ProposalSignActCopy.edition(version: 3, issuedAt: nil) == "Edition 3")
        #expect(
            ProposalSignActCopy.edition(version: nil, issuedAt: issued) == "Issued \(day)"
        )
        #expect(ProposalSignActCopy.edition(version: nil, issuedAt: nil) == nil)
    }

    // MARK: - The act

    /// Parity with the web: the consent is ticked and the name is typed, and
    /// the whole thing is a full-screen cover rather than a medium detent over
    /// a document the reader can still half-see.
    @Test("the act is full screen, consented and signed")
    func theActIsFullScreenConsentedAndSigned() throws {
        let detail = try SourcePin.readCode(
            "Patina/Features/Proposals/Views/ProposalDetailView.swift"
        )
        #expect(detail.contains("isPresented: $viewModel.showSignSheet"))
        #expect(detail.contains(".fullScreenCover(isPresented: $viewModel.showSealMoment)"))
        #expect(!detail.contains(".presentationDetents"), "the detent survived")

        let act = try SourcePin.readCode("Patina/Features/Proposals/Views/SignActView.swift")
        #expect(act.contains("hasConsented && trimmedName.count >= ProposalSignActCopy.signatureFloor"))
        #expect(act.contains("HoldToActButton("))
        #expect(act.contains("ProposalSignActCopy.signatureNotice"))
        #expect(act.contains("DateDisplay.long(Date())"))
    }

    /// The consent sentence is `consentLineFor`'s fallback branch, verbatim: a
    /// `proposals` row carries no commercial-document kind, so it is the only
    /// branch it may claim, and the stronger ones assert countersignatures and
    /// deposit terms this paper has not got.
    @Test("the consent line is the portals' own fallback branch")
    func theConsentLineIsThePortalsOwn() {
        #expect(
            ProposalSignActCopy.consentLine
                == "I agree to the scope and investment in this proposal."
        )
        #expect(
            ProposalSignActCopy.signatureNotice
                == "Your typed name acts as your electronic signature."
        )
    }

    // MARK: - The seal

    @Test("the seal is SIGNED, in mocha, and it says so out loud")
    func theSealStatesItsWord() {
        let seal = PatinaStamp.State.signed
        #expect(seal.word == "SIGNED")
        #expect(seal.borderPigment == .mocha)
        #expect(seal.wordPigment == .mocha)
        #expect(seal.weight == .doubled)
        #expect(ProposalSignActCopy.sealHeading == "Signed")
    }

    /// What happens next, and nothing else. The studio is named where the app
    /// already holds a name for it and never invented; no timing is stated,
    /// because none is known.
    @Test("the seal says what happens next without inventing a name or a date")
    func theSealSaysWhatHappensNext() throws {
        // RULED 2026-09-05: "countersigns" asserted a second act nothing in
        // the app waits on or records. What is true is that the studio has
        // her name, and that a copy is hers.
        #expect(
            ProposalSignActCopy.whatHappensNext(studio: "Quist Interiors")
                == "Quist Interiors has your signature. You’ll have a copy."
        )
        // `W2R1-m2`: the sentence names a STUDIO on every branch. It used to
        // fall back to the designer's own full name, which is truthful and is
        // not the ruled line — a signature is held by the practice, not by the
        // person who asked for it.
        #expect(
            ProposalSignActCopy.whatHappensNext(studio: nil)
                == "Your studio has your signature. You’ll have a copy."
        )
        #expect(
            ProposalSignActCopy.whatHappensNext(studio: "")
                == "Your studio has your signature. You’ll have a copy."
        )
        #expect(!ProposalSignActCopy.whatHappensNext(studio: nil).contains("designer"))
        // …and the resolver behind it never hands a person's name over as one.
        let resolver = try SourcePin.readCode(
            "Patina/Features/Proposals/ViewModels/ProposalsViewModel.swift"
        )
        #expect(resolver.contains("var signingStudio: String?"))
        #expect(!resolver.contains("designerStudioName ?? "))
        for line in [ProposalSignActCopy.whatHappensNext(studio: "Quist Interiors"),
                     ProposalSignActCopy.whatHappensNext(studio: nil)] {
            #expect(!line.lowercased().contains("countersign"), "\(line) still promises a countersignature")
        }
        for line in [ProposalSignActCopy.whatHappensNext(studio: "Quist Interiors"),
                     ProposalSignActCopy.whatHappensNext(studio: nil)] {
            for invented in ["soon", "shortly", "within", "hours", "days"] {
                #expect(!line.lowercased().contains(invented), "\(line) invents timing")
            }
        }
    }

    /// One settle, 420 ms, and then the mark stops moving forever. Reduced
    /// motion cross-fades: no scale, no rotation, and the haptic still fires,
    /// because for that reader the haptic IS the confirmation.
    @Test("the settle is one curve, and reduced motion drops the transform")
    func theSettleIsOneCurveAndReducedMotionDropsIt() throws {
        #expect(ProposalSignActCopy.settleDuration == 0.42)
        #expect(ProposalSignActCopy.settleFromScale == 1.06)

        let source = try SourcePin.readCode(
            "Patina/Features/Shared/Views/SealMomentView.swift"
        )
        #expect(source.contains("guard !reduceMotion else { return 1 }"))
        #expect(source.contains("guard !reduceMotion else { return 0 }"))
        #expect(source.contains(".easeOut(duration: ProposalSignActCopy.settleDuration)"))
        // The haptic is outside every motion branch.
        let settle = try #require(source.range(of: "private func settle()"))
        let body = String(source[settle.lowerBound...].prefix(260))
        #expect(body.contains("HapticManager.shared.notification(.success)"))
        #expect(!body.contains("reduceMotion"), "the haptic was gated on the motion setting")
    }

    /// `W2R1-n2`. After this wave took red off every other line a homeowner
    /// reads, the refused signature was the only red sentence left in the
    /// ceremony — and it meets her at the moment she has just tried to sign.
    @Test("the signature refusal is body ink, not the error ramp")
    func theSignatureRefusalIsBodyInk() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Proposals/Views/SignActView.swift"
        )
        let error = try #require(source.range(of: "if let errorMessage {"))
        let body = String(source[error.lowerBound...].prefix(600))
        #expect(body.contains("PatinaColors.Text.secondary"))
        #expect(!body.contains("PatinaColors.Text.error"))
    }

    /// `W2R2-n1`. The stamp's own settle is already a cross-fade under Reduce
    /// Motion; the COVER carrying it still slid ~65 pt, because a
    /// `.fullScreenCover` presentation is the system's and cross-fades only
    /// under a second switch (Prefer Cross-Fade Transitions) that is off by
    /// default. The ceremony's covers honour the setting themselves.
    @Test("the ceremony's covers present without a slide under Reduce Motion")
    func theCoversHonourReducedMotion() throws {
        let detail = try SourcePin.readCode(
            "Patina/Features/Proposals/Views/ProposalDetailView.swift"
        )
        #expect(detail.contains("@Environment(\\.accessibilityReduceMotion) private var reduceMotion"))
        // Guarded by the setting: nothing is stilled for a reader who has not
        // asked for it.
        #expect(
            detail.contains("if reduceMotion { transaction.disablesAnimations = true }")
        )
    }

    /// The stamp is the reward. No party, no noise — she may be reading this
    /// in bed at eleven at night.
    @Test("there is no celebration anywhere in the seal")
    func thereIsNoCelebration() throws {
        // Comments stripped: the file's own header names the refusals it
        // keeps, and a pin that fires on its own documentation measures the
        // file rather than the code.
        let source = try SourcePin.readCode(
            "Patina/Features/Shared/Views/SealMomentView.swift"
        )
        for banned in ["confetti", "AudioServices", "AVAudio", "SystemSoundID",
                       "repeatForever", "celebrat"] {
            #expect(!source.lowercased().contains(banned.lowercased()),
                    "the seal draws \(banned)")
        }
    }

    /// It plays once, in the session the signature landed — never on a
    /// revisit. A mark that re-settles on every open is a badge pretending to
    /// be paper.
    @Test("the seal opens only on a signature given in this session")
    func theSealOpensOnceOnly() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Proposals/ViewModels/ProposalsViewModel.swift"
        )
        let sign = try #require(source.range(of: "func sign(proposalId: String, name: String)"))
        let body = String(source[sign.lowerBound...].prefix(700))
        #expect(body.contains("self.armSeal(name: name)"))
        let arm = try #require(source.range(of: "func armSeal(name: String)"))
        let armBody = String(source[arm.lowerBound...].prefix(240))
        #expect(armBody.contains("signedName = name"))
        #expect(armBody.contains("sealPending = true"))
        #expect(!armBody.contains("showSealMoment"), "the act presented the seal itself again")
        // Nothing else opens it, and `load` in particular does not.
        #expect(source.components(separatedBy: "showSealMoment = true").count - 1 == 1)
    }

    // MARK: - `IOSC-05` · the two covers never overlap

    /// Dismissing one `fullScreenCover` and presenting another in the SAME
    /// state mutation is the classic SwiftUI race: UIKit is asked to present
    /// while a dismissal is in flight and drops the second, so the payoff of
    /// the whole ceremony silently never appears — and no source pin would
    /// notice, because every string is still there.
    ///
    /// This is the state machine that replaced it, driven with no view at
    /// all: the act ARMS the seal and dismisses; the host fires the seal from
    /// the sign cover's `onDismiss`, one runloop later, with nothing in
    /// flight.
    @Test("signing arms the seal and dismisses; the dismissal presents it")
    func theSealIsPresentedAfterTheSignCoverDismisses() {
        let viewModel = ProposalDetailViewModel()
        viewModel.showSignSheet = true

        viewModel.armSeal(name: "Margaret Whitfield")

        // The instant after the act: the sign cover is going away and the
        // seal is owed but NOT yet presented.
        #expect(!viewModel.showSignSheet)
        #expect(viewModel.sealPending)
        #expect(!viewModel.showSealMoment, "both covers were live in one mutation")

        viewModel.signCoverDismissed()

        #expect(viewModel.showSealMoment)
        #expect(!viewModel.sealPending, "the seal stayed armed after it fired")
    }

    /// A cancelled act arms nothing, and a seal already shown cannot be
    /// re-opened by a later dismissal — "Not yet" must not end in a seal.
    @Test("a dismissal with nothing armed opens no seal")
    func anUnarmedDismissalOpensNothing() {
        let viewModel = ProposalDetailViewModel()
        viewModel.showSignSheet = true
        viewModel.cancelSigning()

        viewModel.signCoverDismissed()
        #expect(!viewModel.showSealMoment)

        // …and once it has fired, it does not fire twice.
        viewModel.armSeal(name: "Margaret Whitfield")
        viewModel.signCoverDismissed()
        viewModel.showSealMoment = false
        viewModel.signCoverDismissed()
        #expect(!viewModel.showSealMoment)
    }

    /// The host is the other half: the seal is presented from the sign
    /// cover's own `onDismiss`, on the same view that owns both covers.
    @Test("the host fires the seal from the sign cover's onDismiss")
    func theHostWiresOnDismiss() throws {
        let detail = try SourcePin.readCode(
            "Patina/Features/Proposals/Views/ProposalDetailView.swift"
        )
        let cover = try #require(detail.range(of: "isPresented: $viewModel.showSignSheet"))
        let body = String(detail[cover.lowerBound...].prefix(140))
        #expect(body.contains("onDismiss: { viewModel.signCoverDismissed() }"))
    }
}
