//
//  AuthScreenView.swift
//  Patina
//
//  Welcome / authentication screen. Passwordless-first: Apple is the hero,
//  email uses a one-time code (no password, no confirmation round-trip), and a
//  prominent "Look around first" fully defers the account (soft wall). Password
//  is a de-emphasized fallback for returning users.
//
//  A3-06 / D3 — the provider stack is rendered from `AuthProviderCatalog`,
//  which asks GoTrue what is actually enabled. Google has never been
//  configured on Strata, so it does not render.
//
//  P-29 — the status slot below the subtitle has a FIXED height and is always
//  present. A failed sign-in used to appear here and push the whole stack down
//  33 pt, so a second tap at the remembered position landed on "Look around
//  first" and dropped the tester into the guest flow. Nothing moves now, and
//  only errors raised BY THIS SCREEN reach it (`AuthService.rootErrorMessage`).
//

import SwiftUI
import AuthenticationServices

struct AuthScreenView: View {
    /// Apple completion carries the raw nonce so the service can pass it to
    /// `signInWithIdToken(nonce:)`.
    var onSignInWithApple: (Result<ASAuthorization, Error>, _ rawNonce: String) -> Void = { _, _ in }
    var onSignInWithGoogle: () -> Void = {}
    /// Opens the passwordless email-code flow (unified sign-up + sign-in).
    var onContinueWithEmail: () -> Void = {}
    /// Soft wall — browse the marketplace without an account.
    var onBrowseAsGuest: () -> Void = {}
    /// De-emphasized fallback for returning password users.
    var onUsePassword: () -> Void = {}
    /// Whether to show the "Look around first" guest affordance. Hidden when
    /// the screen is used as a hard gate (e.g. the design-request upload step),
    /// where browsing without an account isn't a meaningful action.
    var showGuest: Bool = true
    /// Latest auth error raised BY THIS SCREEN (C1-05's Apple/Google paths).
    /// Sheet failures never arrive here — see `AuthService.rootErrorMessage`.
    var errorMessage: String? = nil
    /// Whether a sign-in this screen started is in flight (C1-05).
    var isLoading: Bool = false
    /// C2-21 / GAP7B-09 — a link tapped while signed out is held, and this
    /// says so. Second in the slot's precedence: an error wins (L1F→A-2).
    var pendingLinkNotice: String? = nil

    /// The catalog resolves once per process; every auth surface may ask.
    @State private var catalog = AuthProviderCatalog.shared
    /// Which row the reader pressed, so only that row spins (C1-05).
    @State private var pressed: AuthProvider?

    /// P-29: the status slot is always in the layout at this height, so
    /// showing or clearing a message cannot move the buttons underneath it.
    /// Two lines of `bodySmall` plus the 16 pt gap the banner used to add.
    static let statusSlotHeight: CGFloat = 52

    var body: some View {
        // P-34 (L1-C's row, this lane's file): above `.accessibility1` the
        // fixed stack cannot fit, so it scrolls instead of truncating.
        //
        // The content is given the viewport's own height as a MINIMUM. Round
        // one shipped a bare `ScrollView`, and inside one a `Spacer` takes its
        // ideal length rather than expanding: the legal footer rose from y≈771
        // to y≈607 and the screen ended in ~200 pt of dead space at the default
        // text size. With the floor in place the Spacers expand again below
        // `.accessibility1`, and above it the content exceeds the floor and
        // scrolls.
        GeometryReader { proxy in
            ScrollView(showsIndicators: false) {
                content
                    .frame(minHeight: proxy.size.height)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PatinaColors.Background.primary)
        .task { await catalog.resolveIfNeeded() }
        .onChange(of: isLoading) { _, loading in
            if !loading { pressed = nil }
        }
    }

    private var content: some View {
        VStack(spacing: 0) {
            Spacer()
                .frame(height: 80)

            // PATINA wordmark
            Text("PATINA")
                .font(PatinaTypography.authLogo)
                .foregroundStyle(PatinaColors.Text.primary)
                .tracking(6)
                .minimumScaleFactor(0.6)
                .lineLimit(1)

            // Strata mini mark
            VStack(spacing: 3) {
                Capsule().fill(PatinaColors.Strata.line1).frame(width: 40, height: 1.5)
                Capsule().fill(PatinaColors.Strata.line2).frame(width: 32, height: 1.5)
                Capsule().fill(PatinaColors.Strata.line3).frame(width: 24, height: 1.5)
            }
            .padding(.top, 10)
            .padding(.bottom, 40)

            // Welcome text
            Text("Welcome home")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 28)
                .padding(.bottom, 6)

            Text("Start with a piece you love")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 28)

            AuthStatusSlot(errorMessage: errorMessage, pendingLinkNotice: pendingLinkNotice)

            providerStack
                .padding(.horizontal, 28)
                .disabled(isLoading)

            if showGuest {
                divider
                guestButton
            }

            passwordFallback

            Spacer(minLength: 40)

            legalFooter
        }
    }

    // MARK: - Providers (A3-06 / D3, A-03, P-02, C1-05)

    private var providerStack: some View {
        VStack(spacing: 12) {
            ForEach(catalog.providers, id: \.self) { provider in
                providerRow(provider)
            }
        }
    }

    @ViewBuilder
    private func providerRow(_ provider: AuthProvider) -> some View {
        switch provider {
        case .apple:
            ZStack {
                PatinaSignInWithAppleButton { result, rawNonce in
                    pressed = Self.inFlightProvider(
                        forAppleSucceeded: (try? result.get()) != nil
                    )
                    onSignInWithApple(result, rawNonce)
                }
                .opacity(pressed == .apple ? 0.35 : 1)
                if pressed == .apple {
                    ProgressView().tint(PatinaColors.Text.inverse)
                }
            }
            .accessibilityIdentifier("auth.welcome.appleButton")

        case .google:
            // The letter "G" set in the UI font is not Google's mark, and
            // shipping the wrong one breaks their branding terms — so the row
            // is label-only until L1-D lands the asset. Dark for round one
            // either way (D3): this branch renders only if GoTrue enables it.
            AuthProviderRow(
                title: "Continue with Google",
                systemImage: nil,
                isBusy: pressed == .google
            ) {
                pressed = .google
                onSignInWithGoogle()
            }
            .accessibilityIdentifier("auth.welcome.googleButton")

        case .email:
            // A-03 / P-02: an SF Symbol envelope in the ink token, not the
            // full-colour U+2709 emoji, and no glyph in the AX label.
            //
            // No `isBusy`: this door opens a sheet synchronously and has
            // nothing to wait for, so a busy branch here would be a parameter
            // nothing could ever set.
            AuthProviderRow(
                title: "Continue with email",
                systemImage: "envelope"
            ) {
                onContinueWithEmail()
            }
            .accessibilityIdentifier("auth.welcome.emailButton")
        }
    }

    /// C1-05 — which row may spin after an Apple result.
    ///
    /// `PatinaSignInWithAppleButton` hands back a completion, not a tap, so
    /// "in flight" starts at the token exchange. A cancelled Apple sheet comes
    /// back as `.failure` with nothing running: round one marked the row busy
    /// anyway, and because `AuthService.isLoading` never moved there was no
    /// falling edge to clear it — the hero button held `opacity(0.35)` under a
    /// spinner for the rest of the screen's life.
    static func inFlightProvider(forAppleSucceeded succeeded: Bool) -> AuthProvider? {
        succeeded ? .apple : nil
    }

    // MARK: - Guest

    private var divider: some View {
        HStack(spacing: 16) {
            Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
            Text("or")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
            Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 20)
    }

    private var guestButton: some View {
        // Soft wall — prominent "look around" that fully works without
        // an account (browse + save via the marketplace home).
        Button {
            // W3 ruling 9: the choice is recorded where the reader
            // makes it, so the next launch honours it instead of
            // putting the same wall back.
            GuestSessionStore.shared.optIn()
            onBrowseAsGuest()
        } label: {
            HStack(spacing: 8) {
                Text("Look around first")
                Image(systemName: "arrow.right")
                    .font(.system(size: 14, weight: .semibold))
            }
            .font(PatinaTypography.uiAction)
            .foregroundStyle(PatinaColors.Text.primary)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 50)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(PatinaColors.pearl, lineWidth: 1.5)
            )
        }
        .buttonStyle(PressableButtonStyle())
        .padding(.horizontal, 28)
        .accessibilityIdentifier("auth.welcome.guestButton")
    }

    private var passwordFallback: some View {
        // Password fallback — de-emphasized, for returning password users.
        // GAP1B-08: 44 pt, like every other control on the screen.
        Button(action: onUsePassword) {
            (Text("Have a password? ")
                .foregroundStyle(PatinaColors.Text.muted)
             + Text("Sign in")
                .foregroundStyle(PatinaColors.Text.interactive))
                .font(PatinaTypography.caption)
                .multilineTextAlignment(.center)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .padding(.top, 16)
        .padding(.horizontal, 28)
        .accessibilityIdentifier("auth.welcome.passwordButton")
    }

    // MARK: - Legal (C1-30, C5-04)

    private var legalFooter: some View {
        // U05: these read as links, so they behave as links. C1-30 / C5-04:
        // they now resolve to two different pages, because /privacy exists
        // and the consent line makes two promises.
        VStack(spacing: 2) {
            Text("By continuing, you agree to our")
                .foregroundStyle(PatinaColors.Text.muted)

            // P-34: stacked at accessibility sizes so neither link truncates.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 4) {
                    termsLink
                    Text("and").foregroundStyle(PatinaColors.Text.muted)
                    privacyLink
                }
                VStack(spacing: 2) {
                    termsLink
                    privacyLink
                }
            }
            .foregroundStyle(PatinaColors.Text.interactive)
        }
        .font(PatinaTypography.caption)
        .multilineTextAlignment(.center)
        .lineSpacing(2)
        .padding(.horizontal, 28)
        .padding(.bottom, 40)
    }

    // GAP1B-08: 14.67 pt tall links were the first controls a tester met.
    private var termsLink: some View {
        Link("Terms of Service", destination: Self.termsURL)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityIdentifier("auth.welcome.termsLink")
    }

    private var privacyLink: some View {
        Link("Privacy Policy", destination: Self.privacyURL)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityIdentifier("auth.welcome.privacyLink")
    }

    /// C1-30 / C5-04: two promises, two pages. Both were
    /// `https://patina.cloud/terms`; `/privacy` exists and returns
    /// `<title>Privacy Policy | Patina</title>`.
    static let termsURL = URL(string: "https://patina.cloud/terms")!
    static let privacyURL = URL(string: "https://patina.cloud/privacy")!
}

// MARK: - Status slot (P-29, C2-21)
//
// Always in the layout, always `AuthScreenView.statusSlotHeight` tall. The
// message inside it changes; the geometry never does. Its own type so a test
// can measure the thing that used to move the stack, rather than compare a
// constant to itself.

struct AuthStatusSlot: View {
    let errorMessage: String?
    var pendingLinkNotice: String?

    /// L1F→A-2's precedence: something went wrong and they must act beats a
    /// promise being kept. A person who just failed to sign in does not need
    /// to be told their link is safe in the same 52 pt.
    var message: (text: String, isError: Bool)? {
        if let errorMessage { return (errorMessage, true) }
        if let pendingLinkNotice { return (pendingLinkNotice, false) }
        return nil
    }

    var body: some View {
        Group {
            if let message {
                Text(message.text)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(
                        message.isError
                            ? PatinaColors.terracotta
                            : PatinaColors.Text.muted
                    )
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
                    .padding(.horizontal, 28)
                    .accessibilityIdentifier(
                        message.isError
                            ? "auth.welcome.errorBanner"
                            : "auth.welcome.linkNotice"
                    )
            } else {
                Color.clear
            }
        }
        .frame(height: AuthScreenView.statusSlotHeight)
        .frame(maxWidth: .infinity)
        .accessibilityHidden(message == nil)
    }
}

// MARK: - Provider row
//
// The design-kit `AuthButton` renders its icon as `Text(icon)` — a string —
// which is why the first screen shipped a full-colour U+2709 emoji and the
// letter "G" (A-03, P-02). This row is the same chrome with a real SF Symbol
// slot, an accessibility label that carries no glyph, and the in-flight state
// C1-05 asks for. `AuthButton` itself is L1-D's file.

struct AuthProviderRow: View {
    let title: String
    let systemImage: String?
    var isBusy: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isBusy {
                    ProgressView()
                        .tint(PatinaColors.Text.primary)
                } else if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(PatinaColors.Text.primary)
                }
                Text(title)
                    .font(PatinaTypography.uiAction)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .foregroundStyle(PatinaColors.Text.primary)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 50)
            .background(PatinaColors.Background.primary)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(PatinaColors.pearl, lineWidth: 1.5)
            )
        }
        .buttonStyle(PressableButtonStyle())
        .accessibilityLabel(title)
    }
}

#Preview {
    AuthScreenView(errorMessage: nil)
}

#Preview("With error") {
    AuthScreenView(errorMessage: "Apple Sign In couldn't be completed. Please try again.")
}
