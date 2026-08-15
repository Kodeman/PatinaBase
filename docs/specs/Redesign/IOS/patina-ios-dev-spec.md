# Patina iOS Application — Phased Development Specification

**v4 · The Companion · Claude Code Build Plan**
**April 2026 · Internal Working Document**

---

## Preamble: What This Document Is

This is a sprint-by-sprint, file-by-file development specification for building the Patina iOS application as designed in the v4 design document. It is written for execution by a solo developer (Kody) working with Claude Code. Every sprint has explicit acceptance criteria, file paths, data models, and API contracts.

### What This Is Not

- A design rationale document (see: `patina-ios-complete-v4.html`)
- An aspirational architecture doc (the Master PRD's 8-microservice architecture is Phase 3+)
- A complete backend spec (see: `Phase_1_spec` for server-side details)

### Hard Constraints

| Constraint | Reality |
|---|---|
| **Team** | One developer + Claude Code. No iOS specialist. |
| **iOS Stack** | Swift / SwiftUI / RealityKit / RoomPlan |
| **Backend** | Next.js API routes on `api.patina.cloud`, Supabase Auth + PostgreSQL |
| **Infrastructure** | Supabase Strata + Cloudflare Workers/Containers. |
| **Auth** | Supabase Auth (Apple Sign-In configured: Team ID VP22LXHT7L, Key ID 2HGZ6W89AU, Service ID cloud.patina.app) |
| **Monorepo** | `strata` repo, pnpm workspaces + Turborepo, packages namespaced `@strata/*` |
| **Budget** | Zero SaaS spend beyond existing free tiers |
| **LiDAR** | Required for RoomPlan. Graceful fallback for non-LiDAR devices. |
| **Timeline** | 6 months to functional MVP aligned with Phase 1 spec sprints |

---

## Architecture Overview

```
┌──────────────────────────────┐
│  Patina iOS App (Swift/SwiftUI)  │
│  ├── PatinaApp (entry point)     │
│  ├── Core/                       │
│  │   ├── DesignSystem/           │  ← Colors, Type, Strata Mark
│  │   ├── Companion/              │  ← The Companion (5 states)
│  │   ├── Networking/             │  ← APIClient, Supabase
│  │   └── Models/                 │  ← Shared data models
│  ├── Features/                   │
│  │   ├── Onboarding/             │
│  │   ├── Auth/                   │
│  │   ├── StyleQuiz/              │
│  │   ├── RoomScan/               │
│  │   ├── Recommendations/        │
│  │   ├── ProductDetail/          │
│  │   ├── ARPlacement/            │
│  │   ├── Home/                   │
│  │   ├── Collections/            │
│  │   ├── Profile/                │
│  │   ├── Designer/               │
│  │   ├── QRAuth/                 │
│  │   ├── Notifications/          │
│  │   └── Settings/               │
│  └── Resources/                  │
│      ├── Assets.xcassets          │
│      └── Localizable.strings     │
└──────────────────────────────┘
         │
         ▼ HTTPS
┌──────────────────────────────┐
│  api.patina.cloud (Next.js)      │
│  ├── /api/auth/*    (Supabase)   │
│  ├── /api/style/*   (Quiz/Profile│)
│  ├── /api/rooms/*   (Scan data)  │
│  ├── /api/products/* (Catalog)   │
│  ├── /api/recs/*    (Recs engine)│
│  ├── /api/qr/*      (QR Auth)   │
│  └── /api/leads/*   (Designer)   │
└──────────────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│  PostgreSQL (Supabase)           │
│  + pgvector · Cloudflare R2      │
└──────────────────────────────┘
```

---

## Sprint Map (12 Sprints · 2 Weeks Each)

| Sprint | Focus | Screens Built | Validates |
|---|---|---|---|
| **1** | Xcode project + Design System + Companion shell | — (Foundation) | Can we render Patina's type system natively? |
| **2** | Onboarding + Auth | 1–5 (Splash, Onboarding ×3, Auth) | Does Supabase Auth work with Apple Sign-In on iOS? |
| **3** | Style Quiz flow | 6–11 (5 Questions + Result) | Can we capture and POST quiz data to API? |
| **4** | Home + Companion navigation | 19 (Home), Companion all states | Does The Companion feel right as sole navigation? |
| **5** | Room Scan + RoomPlan | 12–15 (Pre-scan, Scan, Floor Plan) | Does RoomPlan work with our coaching UX? |
| **6** | Recommendations + Product Detail | 16–17 (Recs Feed, Product) | Do server-side recs render with maker stories? |
| **7** | AR Placement | 18 (AR) | Can we place USDZ in scanned room context? |
| **8** | Collections + Profile | 20–21 (Collections, Profile) | Can users organize saves and see style evolution? |
| **9** | QR Auth flow | 24–26 (Scanner, Confirm, Success) | Does cross-platform QR auth work end-to-end? |
| **10** | Designer Consultation + Notifications | 22–23 (Designer, Notifications) | Can leads flow from app to designer portal? |
| **11** | Settings + Edge Cases + Accessibility | 27–28 (Settings, Error states) | WCAG AA compliance? Offline graceful degradation? |
| **12** | Polish, TestFlight, Performance | All screens | Ready for beta testers? |

---

## Sprint 1: Foundation — Xcode Project + Design System + Companion Shell

**Duration:** 2 weeks
**Goal:** Establish the iOS project with the complete Patina design system and a working Companion component that can render all 5 states.

### 1.1 Xcode Project Setup

```
PatinaApp/
├── PatinaApp.swift                 # @main entry
├── Info.plist
├── Core/
│   ├── DesignSystem/
│   │   ├── PatinaColors.swift      # All color tokens
│   │   ├── PatinaTypography.swift  # Type scale + font loading
│   │   ├── PatinaSpacing.swift     # Spacing tokens
│   │   ├── PatinaIcons.swift       # Icon set (SF Symbols mapping)
│   │   ├── StrataMark.swift        # Strata Mark SwiftUI component
│   │   └── PatinaButton.swift      # Button component variants
│   ├── Companion/
│   │   ├── CompanionView.swift     # Main Companion container
│   │   ├── CompanionState.swift    # State machine (5 states)
│   │   ├── CompanionResting.swift  # Floating mark with breathing glow
│   │   ├── CompanionNudge.swift    # Contextual label above mark
│   │   ├── CompanionExpanded.swift # Full action menu panel
│   │   ├── CompanionJourney.swift  # Scan progress capsule
│   │   ├── CompanionMinimal.swift  # Translucent corner orb
│   │   └── CompanionContext.swift  # Context-aware action provider
│   ├── Networking/
│   │   ├── APIClient.swift         # Async/await HTTP client
│   │   ├── Endpoints.swift         # API endpoint definitions
│   │   └── TokenManager.swift      # Supabase JWT storage
│   └── Models/
│       ├── User.swift
│       ├── StyleProfile.swift
│       ├── Room.swift
│       ├── Product.swift
│       └── Interaction.swift
├── Features/                       # Empty folders for future sprints
├── Resources/
│   ├── Assets.xcassets/
│   │   ├── Colors/                 # Named color sets
│   │   └── AppIcon.appiconset/     # Strata Mark icon (F4 light canvas)
│   ├── Fonts/
│   │   ├── PlayfairDisplay-*.ttf   # Bundled (Google Fonts license)
│   │   └── DMMono-*.ttf            # Bundled
│   └── Localizable.strings
└── PatinaApp.entitlements          # Sign in with Apple capability
```

### 1.2 Design System Implementation

**PatinaColors.swift**

```swift
import SwiftUI

extension Color {
    // Core
    static let patinaOffWhite = Color(hex: "FAF7F2")
    static let patinaSoftCream = Color(hex: "F5F2ED")
    static let patinaClay = Color(hex: "C4A57B")
    static let patinaAgedOak = Color(hex: "8B7355")
    static let patinaMocha = Color(hex: "5C4A3C")
    static let patinaCharcoal = Color(hex: "2C2926")

    // Extended
    static let patinaSage = Color(hex: "A8B5A0")
    static let patinaDustyBlue = Color(hex: "8B9CAD")
    static let patinaTerracotta = Color(hex: "D4A090")
    static let patinaPearl = Color(hex: "E5E2DD")
    static let patinaGoldenHour = Color(hex: "E8C547")

    // Semantic
    static let patinaSuccess = Color(hex: "7A9B76")
    static let patinaWarning = Color(hex: "D4A574")
    static let patinaError = Color(hex: "C77B6E")
}
```

**PatinaTypography.swift**

```swift
import SwiftUI

struct PatinaFont {
    // Display — Playfair Display
    static func display(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom("PlayfairDisplay-\(weightName(weight))", size: size)
    }

    // Body — Inter (system fallback: -apple-system maps well)
    static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }

    // Mono — DM Mono
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom("DMMono-\(weightName(weight))", size: size)
    }

    // Type Scale
    static let displayLarge = display(34)      // Screen titles
    static let displayMedium = display(26)     // Section heads
    static let heading = display(22, weight: .medium)
    static let subheading = display(18, weight: .medium)
    static let bodyLarge = body(17)            // Primary body
    static let bodyDefault = body(15)          // Secondary body
    static let bodySmall = body(13)            // Tertiary
    static let caption = body(11, weight: .medium)
    static let label = mono(10, weight: .regular)  // Metadata
    static let overline = mono(9, weight: .regular) // Tags, timestamps
}
```

### 1.3 The Companion — State Machine

**CompanionState.swift**

```swift
import SwiftUI

enum CompanionState: Equatable {
    case resting
    case nudging(label: String, action: CompanionAction)
    case expanded(context: CompanionContext)
    case journey(progress: Float, step: Int, totalSteps: Int, label: String)
    case minimal
}

enum CompanionAction: String {
    case scanRoom
    case placeInAR
    case viewRecommendations
    case talkToDesigner
    case connectPortal
    case saveToCollection
    case startProject
    case nextQuestion
    case seeMatches
}

struct CompanionContextItem: Identifiable {
    let id = UUID()
    let icon: String
    let label: String
    let hint: String
    let action: CompanionAction
    let isSuggested: Bool
}
```

**CompanionContext.swift — Context-Aware Action Provider**

```swift
struct CompanionContextProvider {
    static func actions(for screen: AppScreen) -> [CompanionContextItem] {
        switch screen {
        case .home:
            return [
                .init(icon: "◎", label: "Scan a room",
                      hint: "Suggested next step", action: .scanRoom, isSuggested: true),
                .init(icon: "✦", label: "Your recommendations",
                      hint: "18 items · Living room", action: .viewRecommendations, isSuggested: false),
                .init(icon: "♡", label: "Collections",
                      hint: "2 boards · 13 items", action: .saveToCollection, isSuggested: false),
                .init(icon: "⊞", label: "Connect to portal",
                      hint: "Scan QR · patina.cloud", action: .connectPortal, isSuggested: false),
            ]
        case .recommendations:
            return [
                .init(icon: "♡", label: "Save to collection",
                      hint: "Create or add to board", action: .saveToCollection, isSuggested: true),
                .init(icon: "◎", label: "Scan another room",
                      hint: "Add rooms to your profile", action: .scanRoom, isSuggested: false),
                .init(icon: "⊞", label: "Connect to portal",
                      hint: "Scan QR · patina.cloud", action: .connectPortal, isSuggested: false),
            ]
        case .productDetail:
            return [
                .init(icon: "◎", label: "Place in AR",
                      hint: "See it in your room", action: .placeInAR, isSuggested: true),
                .init(icon: "♡", label: "Save",
                      hint: "Add to collection", action: .saveToCollection, isSuggested: false),
                .init(icon: "💬", label: "Ask a designer",
                      hint: "Get expert advice", action: .talkToDesigner, isSuggested: false),
            ]
        case .profile:
            return [
                .init(icon: "💬", label: "Work with a designer",
                      hint: "Your profile is ready", action: .talkToDesigner, isSuggested: true),
                .init(icon: "✦", label: "Edit style preferences",
                      hint: "Retake quiz · Refine", action: .viewRecommendations, isSuggested: false),
                .init(icon: "⊞", label: "Connect to portal",
                      hint: "Scan QR · patina.cloud", action: .connectPortal, isSuggested: false),
            ]
        case .collections:
            return [
                .init(icon: "✦", label: "Start a project",
                      hint: "From your saved items", action: .startProject, isSuggested: true),
                .init(icon: "◎", label: "Scan a room",
                      hint: "Add context for your saves", action: .scanRoom, isSuggested: false),
                .init(icon: "⊞", label: "Connect to portal",
                      hint: "Scan QR · patina.cloud", action: .connectPortal, isSuggested: false),
            ]
        // Additional cases: .arPlacement, .roomScan, .designer, .notifications, .settings
        default:
            return []
        }
    }

    static func nudge(for screen: AppScreen) -> (String, CompanionAction)? {
        switch screen {
        case .home: return ("Scan a room →", .scanRoom)
        case .productDetail: return ("Place in your room →", .placeInAR)
        case .profile: return ("Talk to a designer →", .talkToDesigner)
        case .collections: return ("Start a project →", .startProject)
        case .floorPlan: return ("See your matches →", .seeMatches)
        case .styleQuiz: return ("Next question →", .nextQuestion)
        default: return nil
        }
    }
}
```

### 1.4 Companion View Implementation

**CompanionView.swift**

```swift
import SwiftUI

struct CompanionView: View {
    @Binding var state: CompanionState
    let onAction: (CompanionAction) -> Void
    @State private var isExpanded = false

    var body: some View {
        ZStack {
            // Backdrop blur when expanded
            if isExpanded {
                Color.black.opacity(0.35)
                    .ignoresSafeArea()
                    .transition(.opacity)
                    .onTapGesture { withAnimation(.spring()) { isExpanded = false } }
            }

            // Render correct state
            switch state {
            case .resting:
                companionResting
            case .nudging(let label, let action):
                companionNudging(label: label, action: action)
            case .expanded(let context):
                companionExpandedPanel(context: context)
            case .journey(let progress, let step, let total, let label):
                CompanionJourney(progress: progress, step: step,
                                 totalSteps: total, label: label)
            case .minimal:
                companionMinimal
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: state)
    }

    // Resting: centered bottom, breathing glow
    var companionResting: some View {
        VStack {
            Spacer()
            StrataMarkButton {
                withAnimation(.spring()) { isExpanded = true }
            }
            .padding(.bottom, 28)
        }
    }

    // Nudging: label + mark
    func companionNudging(label: String, action: CompanionAction) -> some View {
        VStack {
            Spacer()
            VStack(spacing: 8) {
                // Nudge bubble
                Text(label)
                    .font(PatinaFont.bodySmall)
                    .fontWeight(.medium)
                    .foregroundColor(.patinaOffWhite)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(Color.patinaCharcoal)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .onTapGesture { onAction(action) }

                StrataMarkButton {
                    withAnimation(.spring()) { isExpanded = true }
                }
            }
            .padding(.bottom, 28)
        }
    }

    // Minimal: bottom-right translucent
    var companionMinimal: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                StrataMarkMini {
                    withAnimation(.spring()) { isExpanded = true }
                }
                .padding(.trailing, 20)
                .padding(.bottom, 28)
            }
        }
    }
}
```

### 1.5 Sprint 1 Acceptance Criteria

- [ ] Xcode project compiles and runs on iPhone 15 Pro simulator
- [ ] Playfair Display and DM Mono render correctly at all type scale sizes
- [ ] All Patina colors render correctly including dark mode mapping
- [ ] Strata Mark component renders with breathing animation
- [ ] Companion renders all 5 states: resting, nudging, expanded, journey, minimal
- [ ] Companion expanded panel shows context-aware actions with correct icons
- [ ] Spring animations on Companion state transitions feel "organic, not mechanical"
- [ ] App icon uses F4 Light Canvas design (Strata Mark on Off-White)
- [ ] Project structure matches file tree above

---

## Sprint 2: Onboarding + Authentication

**Duration:** 2 weeks
**Goal:** Build screens 1–5. First-time user can go from Splash → Onboarding × 3 → Auth → signed in with Apple.

### 2.1 Files to Create

```
Features/
├── Onboarding/
│   ├── SplashView.swift           # Animated Strata Mark reveal
│   ├── OnboardingContainerView.swift  # Paged carousel
│   ├── OnboardingPageView.swift   # Single page (image + text)
│   ├── OnboardingViewModel.swift  # Page state, skip logic
│   └── OnboardingContent.swift    # Static page data
├── Auth/
│   ├── AuthView.swift             # Auth options screen
│   ├── AuthViewModel.swift        # Supabase auth logic
│   ├── AppleSignInHandler.swift   # ASAuthorization delegate
│   └── GuestModeManager.swift     # Limited functionality gate
```

### 2.2 Splash Screen Spec

- **Duration:** 2 seconds
- **Animation:** "Patina" wordmark fades in (0.8s ease-out), Strata Mark draws below (0.5s staggered per line, 0.3s delay after wordmark)
- **Background:** `Color.patinaOffWhite`
- **Typography:** Playfair Display Medium, 38pt, letter-spacing 0.2em, uppercase
- **Transition:** Cross-dissolve to onboarding or home (if returning user)
- **Launch state detection:**

```swift
enum LaunchState {
    case firstTime        // → Onboarding
    case returningUser    // → Home (with Companion)
    case needsUpdate      // → Update prompt
}

func detectLaunchState() -> LaunchState {
    if !UserDefaults.standard.bool(forKey: "hasCompletedOnboarding") {
        return .firstTime
    }
    if TokenManager.shared.hasValidSession {
        return .returningUser
    }
    return .firstTime
}
```

### 2.3 Onboarding Pages

| Page | Headline | Body | Image Zone |
|---|---|---|---|
| 1 — Philosophy | "Every room tells a story" | "Let's discover yours. Walk your space, uncover your style, find pieces that grow more beautiful with time." | Abstract room: floor plane, furniture silhouettes, window with light beam, warm Clay tones |
| 2 — Promise | "See it in *your* space" | "Walk your room. Our camera captures every corner. Then watch as perfectly matched furniture appears right where it belongs." | Phone silhouette with AR overlay, sage/pearl gradient background |
| 3 — Permission | "We'll need your camera" | "To see your space and place furniture in it. Nothing leaves your device until you choose to share." | Camera icon (80×80, Clay at 18% opacity) + "Your room stays private" badge with lock icon |

**Interactions:**
- Swipe horizontal to advance (UIPageViewController or TabView with .page style)
- "Skip" button top-right (appears after 2s delay on page 1)
- Progress dots at bottom: inactive = Pearl, active = Clay with 24px width pill
- CTA button bottom: "Start Your Journey" (page 1), "Continue" (page 2), "Let's Begin" (page 3)
- Page 3 CTA triggers camera permission request before navigating to Auth

### 2.4 Authentication Screen

**Layout:**
- Logo: Playfair Display Medium, 32pt, 0.15em tracking, uppercase, centered
- Strata Mark mini: 40/32/24px lines below logo
- Title: "Welcome home" in Playfair 24pt
- Subtitle: "Join thousands of design enthusiasts" in Inter 14pt, Aged Oak
- Buttons (full width, 50px height, 12px radius):
  - "Continue with Apple" — Charcoal bg, Off-White text (primary)
  - "Continue with Google" — Off-White bg, Pearl border, Charcoal text
  - "Continue with Email" — same as Google
- Divider: `── or ──` with Pearl lines
- Guest link: "Browse as Guest" in Clay, 14pt, centered
- Footer: Terms + Privacy links, 11pt, Aged Oak

**Supabase Auth Integration:**

```swift
// AppleSignInHandler.swift
import AuthenticationServices

class AppleSignInHandler: NSObject, ASAuthorizationControllerDelegate {
    func performSignIn() async throws -> Session {
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]

        let result = try await withCheckedThrowingContinuation { continuation in
            // ASAuthorizationController delegate pattern
        }

        // Exchange Apple credential for Supabase session
        let session = try await SupabaseClient.shared.auth.signInWithIdToken(
            credentials: .init(
                provider: .apple,
                idToken: result.identityToken
            )
        )
        return session
    }
}
```

### 2.5 API Contract

```
POST /api/auth/register
Body: { email, source: "ios_app", deviceInfo: { model, os, hasLiDAR } }
Response: { user: { id, email }, session: { accessToken, refreshToken } }

POST /api/auth/apple
Body: { identityToken, authorizationCode, fullName?, email? }
Response: { user: { id, email }, session: { accessToken, refreshToken } }
```

### 2.6 Sprint 2 Acceptance Criteria

- [ ] Splash animates correctly: wordmark → strata → transition (2s total)
- [ ] Onboarding carousel swipes between 3 pages with dot indicators
- [ ] Skip button works from any onboarding page
- [ ] Camera permission requested on page 3 CTA with custom pre-prompt
- [ ] Apple Sign-In creates Supabase session and stores JWT
- [ ] Guest mode skips auth but gates save/profile features
- [ ] Returning users skip onboarding entirely → Home
- [ ] All typography matches v4 design spec (Playfair headlines, Inter body, DM Mono labels)

---

## Sprint 3: Style Quiz Flow

**Duration:** 2 weeks
**Goal:** Build screens 6–11. User completes 5-question style quiz, sees result, data persisted to API.

### 3.1 Files to Create

```
Features/
├── StyleQuiz/
│   ├── StyleQuizContainerView.swift    # Flow coordinator
│   ├── StyleQuizViewModel.swift        # State, navigation, submission
│   ├── QuizProgressBar.swift           # 5-dot progress indicator
│   ├── Questions/
│   │   ├── VisualResonanceView.swift   # Q1: 2×2 image grid
│   │   ├── LifestyleRealityView.swift  # Q2: Multi-select cards
│   │   ├── MaterialConnectionView.swift # Q3: Material swatches
│   │   ├── InvestmentView.swift        # Q4: Budget tiers
│   │   └── ChangeCatalystView.swift    # Q5: Single-select cards
│   ├── StyleResultView.swift           # Profile result screen
│   └── QuizModels.swift               # Question/Answer models
```

### 3.2 Quiz State Machine

```swift
class StyleQuizViewModel: ObservableObject {
    @Published var currentQuestion: Int = 0  // 0-4
    @Published var answers: [Int: QuizAnswer] = [:]
    @Published var isSubmitting = false
    @Published var result: StyleProfileResult?

    let questions: [QuizQuestion] = QuizContent.allQuestions

    var progress: Float { Float(currentQuestion + 1) / 5.0 }
    var canAdvance: Bool { answers[currentQuestion] != nil }

    // Companion state for quiz context
    var companionState: CompanionState {
        if currentQuestion < 4 {
            return .nudging(label: "Next question →", action: .nextQuestion)
        } else if canAdvance {
            return .nudging(label: "See your style →", action: .seeMatches)
        } else {
            return .resting
        }
    }

    func advance() {
        if currentQuestion < 4 {
            withAnimation(.spring()) { currentQuestion += 1 }
        } else {
            submitQuiz()
        }
    }

    func submitQuiz() {
        isSubmitting = true
        Task {
            let response = try await APIClient.shared.post(
                "/api/style/quiz",
                body: QuizSubmission(
                    answers: answers,
                    timings: questionTimings,
                    version: "2.0"
                )
            )
            await MainActor.run {
                self.result = response
                self.isSubmitting = false
            }
        }
    }
}
```

### 3.3 Question Specifications

| Question | Type | UI Pattern | Selection | Hidden Signals |
|---|---|---|---|---|
| Q1: Visual Resonance | Single-select | 2×2 image grid | Tap image → 2.5px Clay outline, label fills Clay | Tap speed, zoom behavior, hesitation |
| Q2: Lifestyle | Multi-select | Vertical card list with emoji icons | Tap to toggle Clay fill | Selection order, time between taps |
| Q3: Material | Single-select | Vertical cards with 52×52 texture swatches | Tap to fill Clay | Dwell time on each swatch |
| Q4: Investment | Single-select | Tier cards with icons | Tap to fill Charcoal | Time to decide, scroll exploration |
| Q5: Catalyst | Single-select | Vertical cards with emoji icons | Tap to fill Clay | Overall quiz completion time |

### 3.4 Style Result Screen

**Layout (centered, no nav bar):**
1. Badge ring: 96px circle, 2.5px Clay border, inner 76px Soft Cream circle with ✦ icon
2. Title: Playfair 28pt "Warm Minimalist"
3. Subtitle: DM Mono 10px "YOUR PRIMARY STYLE"
4. Attributes row: Three columns (Material, Palette, Budget) each with Playfair 20pt value + DM Mono 8px label
5. Confidence bar: 200px wide, 6px height, Pearl bg, Clay fill at computed percentage
6. Match label: DM Mono 10px "87% STYLE CONFIDENCE"
7. CTA: "View Recommendations" — full-width Charcoal button
8. Secondary: "Refine your style →" in Clay 13pt

**The Companion appears in Resting state on this screen.**

### 3.5 API Contract

```
POST /api/style/quiz
Body: {
  answers: {
    visualResonance: "warm_minimal",
    lifestyle: ["entertaining", "work_from_home"],
    material: "soft_linen",
    investment: "curated_comfort",
    catalyst: "making_it_mine"
  },
  timings: { q1: 3.2, q2: 5.1, q3: 4.8, q4: 2.9, q5: 3.5 },
  version: "2.0"
}

Response: {
  profile: {
    primaryStyle: "warm_minimalist",
    secondaryStyle: "scandinavian",
    colorPreference: { warm: 0.7, cool: 0.3, neutral: 0.8 },
    materialAffinity: { wood: 0.9, metal: 0.3, fabric: 0.7, linen: 0.95 },
    budgetRange: { min: 2000, max: 5000 },
    confidence: 0.87,
    styleVector: [0.72, -0.15, 0.43, ...] // pgvector embedding
  }
}
```

### 3.6 Sprint 3 Acceptance Criteria

- [ ] Quiz flows through 5 questions with progress bar updating
- [ ] Each question type renders correctly (grid, multi-select, swatches, tiers)
- [ ] Selections animate with spring physics (scale 0.97 on press, Clay fill on select)
- [ ] Companion shows "Next question →" nudge on Q1-Q4, "See your style →" on Q5
- [ ] Quiz data POSTs to API with timing metadata
- [ ] Style Result screen renders with computed profile from API
- [ ] Haptic feedback on selection (light impact)
- [ ] Auto-advance 800ms after selection on single-select questions

---

## Sprint 4: Home Screen + Companion Navigation

**Duration:** 2 weeks
**Goal:** Build screen 19 (Home). Companion fully functional as primary navigation. All state transitions working. User can navigate to any section via The Companion.

### 4.1 Navigation Architecture

```swift
// AppRouter.swift
class AppRouter: ObservableObject {
    @Published var currentScreen: AppScreen = .home
    @Published var navigationPath = NavigationPath()
    @Published var companionState: CompanionState = .resting

    func navigate(to screen: AppScreen) {
        withAnimation(.spring()) {
            currentScreen = screen
            updateCompanionState()
        }
    }

    func handleCompanionAction(_ action: CompanionAction) {
        switch action {
        case .scanRoom: navigate(to: .preScan)
        case .placeInAR: navigate(to: .arPlacement)
        case .viewRecommendations: navigate(to: .recommendations)
        case .talkToDesigner: navigate(to: .designer)
        case .connectPortal: navigate(to: .qrScanner)
        case .saveToCollection: navigate(to: .collections)
        case .startProject: navigate(to: .designer)
        case .nextQuestion: /* handled by quiz VM */  break
        case .seeMatches: navigate(to: .recommendations)
        }
    }

    private func updateCompanionState() {
        if let nudge = CompanionContextProvider.nudge(for: currentScreen) {
            companionState = .nudging(label: nudge.0, action: nudge.1)
        } else {
            companionState = .resting
        }
    }
}
```

**ContentView.swift — Root with Companion overlay:**

```swift
struct ContentView: View {
    @StateObject var router = AppRouter()

    var body: some View {
        ZStack {
            // Current screen
            screenContent
                .transition(.opacity.combined(with: .move(edge: .trailing)))

            // The Companion — always on top
            CompanionView(
                state: $router.companionState,
                onAction: router.handleCompanionAction
            )
        }
        .environmentObject(router)
    }

    @ViewBuilder
    var screenContent: some View {
        switch router.currentScreen {
        case .home: HomeView()
        case .recommendations: RecommendationsView()
        case .productDetail: ProductDetailView()
        // ... all 28 screens
        default: HomeView()
        }
    }
}
```

### 4.2 Home Screen Elements

| Zone | Content | Typography |
|---|---|---|
| Greeting | "Good Morning" / "Welcome back" | DM Mono 10px (time) + Playfair 26pt (greeting) |
| Search | Pill search bar, Soft Cream bg | Inter 14pt placeholder, Aged Oak |
| Scan Prompt | Dark card with Clay icon | Playfair 17pt title + Inter 12pt body on Charcoal |
| Featured Section | Horizontal scroll of 260px cards | Playfair 18pt section head + Inter 13pt card titles |
| Makers Section | Horizontal scroll with artisan cards | Playfair 15pt name + DM Mono 9pt location |

### 4.3 Sprint 4 Acceptance Criteria

- [ ] Home screen renders all zones with correct typography and spacing
- [ ] Companion shows "Scan a room →" nudge on Home
- [ ] Tapping Companion mark opens expanded panel with 5 context actions
- [ ] "Scan a room" action highlighted with Clay background (suggested)
- [ ] "Connect to portal" present in every expanded menu
- [ ] Backdrop blur renders behind expanded panel
- [ ] Tapping backdrop closes expanded panel
- [ ] Navigation between Home → any screen works via Companion actions
- [ ] Companion nudge label updates when screen changes
- [ ] Back navigation via swipe gesture (iOS standard)

---

## Sprint 5: Room Scan + RoomPlan

**Duration:** 2 weeks
**Goal:** Build screens 12–15. Full room scanning flow with RoomPlan, coaching UX, and Companion in Journey Mode.

### 5.1 Key Technical Details

```swift
import RoomPlan

class RoomScanManager: NSObject, ObservableObject, RoomCaptureSessionDelegate {
    @Published var progress: Float = 0.0
    @Published var currentStep: Int = 1  // 1-4: Scan, Style, Budget, Focus
    @Published var capturedRoom: CapturedRoom?
    @Published var coachingText: String = "Let's walk your room together"

    private var session: RoomCaptureSession?

    func startScanning() {
        session = RoomCaptureSession()
        session?.delegate = self
        let config = RoomCaptureSession.Configuration()
        session?.run(configuration: config)
    }

    // Companion state derived from scan progress
    var companionState: CompanionState {
        .journey(
            progress: progress,
            step: currentStep,
            totalSteps: 4,
            label: stepLabel
        )
    }

    var stepLabel: String {
        switch currentStep {
        case 1: return "Starting scan"
        case 2: return "Capturing walls"
        case 3: return "Finding features"
        case 4: return "Almost done"
        default: return "Scanning"
        }
    }
}
```

### 5.2 Coaching Text Progression

| Progress | Coaching Text | Companion Step |
|---|---|---|
| 0% | "Let's walk your room together" | Step 1 of 4 |
| 10% | "Start with this wall" | Step 1 of 4 |
| 25% | "Good — now turn slowly" | Step 2 of 4 |
| 42% | "Step toward the window" | Step 2 of 4 |
| 60% | "Capturing the details" | Step 3 of 4 |
| 75% | "Almost there — one more corner" | Step 3 of 4 |
| 90% | "Beautiful — finishing up" | Step 4 of 4 |
| 100% | → Transition to Floor Plan | — |

**Visual language during scan:**
- 5% Clay Beige warm overlay tint on camera feed
- 3-5 floating particles (3px, Clay at 30% opacity, `float` animation 5-6s)
- Coaching text: Playfair Display Italic 20pt, Charcoal at 75% opacity, centered
- Wall detection: 1.5px dashed Clay border, 30% opacity, fades in on recognition
- Haptic: light impact on each wall recognized

### 5.3 Floor Plan Preview

**Elements:**
- Title: Playfair 22pt "Your Room"
- Subtitle: DM Mono "LIVING ROOM · HIGH CONFIDENCE"
- Confidence badge: top-right of viewer, Success green background, DM Mono 8pt "✓ HIGH CONFIDENCE"
- Room outline: 2px Mocha border, 3px radius
- Detected items: semi-transparent Clay/DustyBlue shapes
- Dimension labels: DM Mono 8pt, Aged Oak
- Metrics row: Three cards (Sq Ft, Windows, Items) — Playfair 18pt value + DM Mono 7pt label
- Actions: "Rescan" (secondary) + "Use This Scan" (primary)
- Companion: nudge "See your matches →"

### 5.4 Non-LiDAR Fallback

```swift
func checkLiDARCapport() -> Bool {
    ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
}

// If no LiDAR: skip scan, show manual room entry
// Manual entry: room type picker + dimension sliders
// Then proceed to recommendations (no AR placement available)
```

### 5.5 API Contract

```
POST /api/rooms
Headers: Authorization: Bearer {jwt}
Body: multipart/form-data {
  name: "Living Room",
  dimensions: { width: 18.5, length: 14.25, height: 8.0, unit: "feet" },
  detected_objects: [
    { type: "sofa", position: { x, y, z }, dimensions: { w, h, d } },
    { type: "table", position: { x, y, z }, dimensions: { w, h, d } }
  ],
  scan_file: <USD/USDZ binary>,  // uploaded to R2, URL stored in DB
  window_count: 2,
  door_count: 1,
  lighting_conditions: "bright_natural",
  confidence: 0.92
}

Response: {
  room: { id, name, dimensions, scan_url, created_at },
  recommendations_ready: true
}
```

### 5.6 Sprint 5 Acceptance Criteria

- [ ] Pre-scan checklist renders with 4 items and "Ready to Scan" CTA
- [ ] RoomPlan session starts on LiDAR devices, coaching text overlays camera
- [ ] Companion transitions to Journey Mode with progress ring and step dots
- [ ] Progress updates in real-time as room surfaces are captured
- [ ] Floating particles animate during scan
- [ ] Haptic feedback on wall recognition events
- [ ] Floor plan renders with room outline, dimensions, detected items
- [ ] Confidence badge displays correctly (green/yellow/red)
- [ ] Room data POSTs to API with scan file upload to R2
- [ ] Non-LiDAR devices show manual room entry fallback

---

## Sprint 6: Recommendations + Product Detail

**Duration:** 2 weeks
**Goal:** Build screens 16–17. Personalized recommendations from API. Product detail with maker stories, badges, and swipe gestures.

### 6.1 Recommendation Card

```swift
struct RecommendationCard: View {
    let product: Product

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Image with match badge + save button
            ZStack(alignment: .topLeading) {
                AsyncImage(url: product.imageURL) { ... }
                    .frame(height: 150)
                    .clipShape(RoundedRectangle(cornerRadius: 13))

                // Match score
                Text("\(product.matchScore)% match")
                    .font(PatinaFont.overline)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 5))
                    .padding(7)
            }

            // Info
            VStack(alignment: .leading, spacing: 1) {
                Text(product.makerName.uppercased())
                    .font(PatinaFont.overline)
                    .foregroundColor(.patinaAgedOak)
                Text(product.name)
                    .font(PatinaFont.bodySmall)
                    .fontWeight(.medium)
                Text(product.formattedPrice)
                    .font(PatinaFont.subheading)
            }
            .padding(10)
        }
        .background(Color.patinaSoftCream)
        .clipShape(RoundedRectangle(cornerRadius: 13))
    }
}
```

### 6.2 Swipe Gestures on Product Cards

| Gesture | Action | Feedback |
|---|---|---|
| Tap | Navigate to Product Detail | — |
| Long press | Material close-up (haptic + scale) | Medium impact haptic |
| Swipe right | Save to collection | Spring bounce + heart animation |
| Swipe left | Not for me (trains Aesthete Engine) | Fade out, no haptic (silence is intentional) |
| Swipe up | Share externally | Share sheet |

### 6.3 Product Detail Layout

Reference v4 screen 17. Key implementation notes:
- Hero image: 320px height, full bleed, with back button + action buttons overlaid
- Maker tag: DM Mono 9px, Clay color, 0.08em tracking
- Product name: Playfair 24pt
- Subtitle: Inter 13pt, Aged Oak (provenance line: "Hand-turned in Maine since 1904")
- Price row: Playfair 26pt price + DM Mono match pill (Success green bg)
- Badges: horizontal wrap, 16px radius pills on Soft Cream
- Maker story card: Soft Cream bg, 13px radius, avatar + name + location + italic quote
- Companion: nudge "Place in your room →"

### 6.4 API Contract

```
GET /api/recs?room_id={id}&limit=20&offset=0
Response: {
  items: [{
    id, name, price_cents, match_score,
    maker: { name, location, story_excerpt },
    image_url, usdz_url?,
    style_tags, material_tags,
    badges: ["fsc_certified", "handcrafted", "made_in_usa"],
    tier: "designer_selection" | "style_match"
  }],
  total: 18,
  room: { id, name }
}

GET /api/products/{id}
Response: { ...full product with maker story, dimensions, sustainability info }

POST /api/interactions
Body: { product_id, event_type: "view"|"save"|"skip"|"ar_place"|"dwell", metadata }
```

### 6.5 Sprint 6 Acceptance Criteria

- [ ] Recommendation grid loads from API with match scores and maker tags
- [ ] Filter chips filter by category (All, Seating, Tables, Lighting, Storage)
- [ ] Swipe gestures work: right=save, left=skip, up=share
- [ ] Product detail shows hero image, maker story, badges, price
- [ ] Behavioral events POST to /api/interactions on view, save, skip
- [ ] Companion resting on recommendations, nudge "Place in AR" on product detail
- [ ] Loading state shows animated Strata Mark (three lines drawing left to right)

---

## Sprint 7: AR Placement

**Duration:** 2 weeks
**Goal:** Build screen 18. Place USDZ furniture in scanned room. Companion in Minimal state.

### 7.1 Key Implementation

```swift
import RealityKit

class ARPlacementManager: ObservableObject {
    @Published var currentProduct: Product?
    @Published var isPlaced = false

    func placeProduct(_ product: Product, in arView: ARView) {
        guard let usdzURL = product.usdzURL else { return }

        Task {
            let entity = try await ModelEntity(contentsOf: usdzURL)
            // Physics-based placement
            entity.generateCollisionShapes(recursive: true)

            // Floor anchor with snapping
            let anchor = AnchorEntity(.plane(.horizontal, classification: .floor,
                                              minimumBounds: [0.3, 0.3]))
            anchor.addChild(entity)
            arView.scene.addAnchor(anchor)

            // Shadow rendering
            let shadow = entity.clone(recursive: false)
            shadow.model?.materials = [SimpleMaterial(color: .black.withAlphaComponent(0.08),
                                                       isMetallic: false)]
            anchor.addChild(shadow)

            await MainActor.run { isPlaced = true }
        }
    }
}
```

### 7.2 AR Controls

- Product name label: Playfair 17pt on frosted glass pill (90% Off-White, 12px blur)
- Control row: Rotate (↻) + Save View (primary) + Screenshot (📷)
- Light slider: right edge, vertical, Golden Hour fill, DM Mono 7pt "LIGHT" label
- Companion: Minimal state (44px translucent orb, bottom-right)

### 7.3 Sprint 7 Acceptance Criteria

- [ ] USDZ models load and place on detected floor planes
- [ ] Magnetic snapping to walls/corners
- [ ] Shadow renders beneath placed furniture
- [ ] Time-of-day lighting slider adjusts scene lighting
- [ ] Rotate gesture works (drag to rotate placed item)
- [ ] Save View captures AR scene screenshot to camera roll
- [ ] Companion in Minimal state, tap expands to AR-specific controls
- [ ] Products without USDZ show "3D model not available" gracefully

---

## Sprint 8: Collections + Profile

**Duration:** 2 weeks
**Goal:** Build screens 20–21. Collections as mood boards. Profile as design journal with style evolution.

### 8.1 Collections

- Board view: Pinterest-style grid (first item spans 2×2)
- Board creation: "New Collection" → name input → select items
- Tab bar: Collections | All Items | Rooms
- Companion nudge: "Start a project →"

### 8.2 Profile

- Avatar: 76px circle, gradient fill, Playfair initial
- Stats row: Rooms | Saved | Match % — separated by Pearl dividers
- Style badge: "✦ Warm Minimalist" pill
- Style Evolution section (future: visual timeline of preference changes)
- Your Rooms: horizontal scroll of room cards with scan date
- Companion nudge: "Talk to a designer →"

### 8.3 Sprint 8 Acceptance Criteria

- [ ] Collections display saved items organized by board
- [ ] New board creation flow works
- [ ] Profile displays user data, style badge, room scans
- [ ] Stats update from real data (rooms scanned, items saved)
- [ ] Companion nudge contextually correct on both screens

---

## Sprint 9: QR Portal Authentication

**Duration:** 2 weeks
**Goal:** Build screens 24–26. Full QR auth flow connecting iOS app to patina.cloud web portals.

### 9.1 QR Auth Protocol

```
                     iOS App                           Web Portal
                       │                                   │
                       │     1. Portal shows QR code       │
                       │     (contains session_token)       │
                       │                                   │
User taps              │     2. App scans QR code          │
"Connect to portal"    │────────────────────────────────►  │
in Companion           │                                   │
                       │     3. App shows confirmation     │
                       │     "Designer Portal requesting   │
                       │      access. Confirm?"            │
                       │                                   │
User confirms          │     4. App POSTs to API           │
(optional FaceID)      │────► POST /api/qr/authenticate    │
                       │      { session_token, user_jwt }  │
                       │                                   │
                       │     5. API validates both tokens  │
                       │     Creates authenticated session │
                       │                                   │
                       │     6. Web portal receives auth   │
                       │     via WebSocket/polling          │
                       │     Page transitions to dashboard ◄│
                       │                                   │
                       │     7. App shows "Connected"      │
                       │     with portal name + URL         │
                       │                                   │
```

### 9.2 QR Scanner UI

- Full-screen camera view on Charcoal background
- Back button: top-left, 34px circle, 12% Off-White bg
- Title: DM Mono 9px "CONNECT TO PORTAL" top-center, Clay color
- Reticle: 200×200px, four Clay corners (3px thick, 24px segments)
- Scan line: horizontal Clay gradient, sweeps top to bottom in 2s loop
- Instruction zone: bottom, Charcoal bg, Playfair 18pt title + Inter 13pt body

### 9.3 QR Confirmation Screen (intermediate)

After scanning, before sending auth:
- Show portal info: icon + "Designer Portal" + "patina.cloud/designer"
- "This portal is requesting access to your Patina account"
- Confirm button (triggers optional Face ID)
- Cancel button

### 9.4 QR Success Screen

- Background: Charcoal, centered layout
- Success ring: 76px circle, 3px Clay border, ✓ checkmark in Clay
- "Connected" in Playfair 22pt
- Description in Inter 13pt, Pearl
- Portal card: icon + portal name + URL
- "Done" button in Clay, returns to previous screen

### 9.5 API Contract

```
POST /api/qr/authenticate
Body: {
  session_token: "scanned_from_qr",
  user_jwt: "current_supabase_token",
  device_info: { model, os_version }
}

Response: {
  success: true,
  portal: {
    name: "Designer Portal",
    url: "patina.cloud/designer",
    type: "designer" | "client" | "admin"
  }
}

// Web portal polls or receives via WebSocket:
GET /api/qr/status/{session_token}
Response: { authenticated: true, user: { id, name, role } }
```

### 9.6 Sprint 9 Acceptance Criteria

- [ ] "Connect to portal" action available in every Companion expanded menu
- [ ] Camera opens in QR mode with Clay reticle and sweep animation
- [ ] QR code decodes and extracts session_token
- [ ] Confirmation screen shows portal info before authenticating
- [ ] Optional Face ID/Touch ID gates the confirmation
- [ ] API call authenticates the web session
- [ ] Success screen shows portal name and URL
- [ ] Web portal (tested in browser) transitions to authenticated state
- [ ] Error handling: expired QR code, network failure, invalid portal

---

## Sprint 10: Designer Consultation + Notifications

**Duration:** 2 weeks
**Goal:** Build screens 22–23. Designer request flow. Notification feed.

### 10.1 Designer Consultation

- Hero: Charcoal bg, Playfair 24pt "Work with a designer"
- Designer card: photo + name + DM Mono studio + Inter bio
- Form: room tag selector (pill toggles) + vision textarea
- Submit CTA: full-width Charcoal button

### 10.2 API Contract

```
POST /api/leads
Body: {
  rooms: ["room_id_1", "room_id_2"],
  vision_text: "I want a space that feels warm...",
  style_profile_id: "profile_uuid",
  saved_products: ["prod_1", "prod_2"],
  budget_range: { min: 2000, max: 5000 }
}

Response: { lead: { id, status: "submitted", designer: { name, studio } } }
```

### 10.3 Sprint 10 Acceptance Criteria

- [ ] Designer consultation form submits lead to API
- [ ] Saved rooms auto-attached as tag selections
- [ ] Notification feed loads from API with correct time formatting
- [ ] Unread notifications have subtle Clay background tint
- [ ] Companion resting on both screens

---

## Sprint 11: Settings + Edge Cases + Accessibility

**Duration:** 2 weeks
**Goal:** Build screens 27–28. Settings. Error states. Accessibility compliance.

### 11.1 Error States (Warm Recovery)

| Scenario | Detection | Message | Recovery |
|---|---|---|---|
| Poor lighting | Luminance < 50 lux | "Let's brighten things up a bit" | Torch toggle + pause |
| Complex room | > 8 corners detected | "Large space! Let's focus on one area" | Section-by-section |
| Network failure | API timeout | "Taking a moment to curate..." | Cached/offline catalog |
| Empty room | No furniture detected | "A blank canvas — exciting!" | Skip to full furnish mode |
| No LiDAR | Device check | "Your phone doesn't have a depth sensor" | Manual room entry |

**Error colors:** Terracotta (#D4A090), not system red. Conversational tone, never technical.

### 11.2 Accessibility

- [ ] All touch targets ≥ 44pt
- [ ] VoiceOver labels on every interactive element
- [ ] Dynamic Type support (100%–150% scaling)
- [ ] Reduced Motion: disable floating particles, Companion breathing, parallax
- [ ] High Contrast mode: maintain brand warmth (Charcoal on Off-White = 8.5:1)
- [ ] Color blind: never rely on color alone for state (add icons/text)
- [ ] AR audio cues: spoken coaching when VoiceOver enabled

### 11.3 Sprint 11 Acceptance Criteria

- [ ] Settings screen renders all groups with toggles and navigation
- [ ] All error states render with correct warm recovery messaging
- [ ] Accessibility audit passes with zero VoiceOver blockers
- [ ] Reduced Motion preference disables all non-essential animation
- [ ] Strata Mark loading animation renders as three drawing lines

---

## Sprint 12: Polish, TestFlight, Performance

**Duration:** 2 weeks
**Goal:** Performance optimization. Animation polish. TestFlight beta submission.

### 12.1 Performance Targets

| Metric | Target | Measurement |
|---|---|---|
| Cold start | < 2s to interactive | Instruments → Time Profiler |
| Scan init | < 3s to camera ready | RoomPlan delegate timing |
| Image loading | < 1s for catalog images | Kingfisher/NukeUI cache hits |
| API response | < 200ms p95 | Network profiler |
| Memory | < 200MB during AR | Instruments → Allocations |
| Animation | 60fps during Companion transitions | Core Animation profiler |

### 12.2 TestFlight Checklist

- [ ] App Store Connect setup with Patina metadata
- [ ] App icon: F4 Light Canvas (Strata Mark on Off-White, 22.5% corner radius)
- [ ] Screenshots: 5 screens (Home, Scan, Recommendations, Product, AR)
- [ ] App Store description: "Find furniture that ages beautifully"
- [ ] Privacy nutrition labels accurate
- [ ] Camera usage description: "Patina uses your camera to scan rooms and place furniture in AR"
- [ ] TestFlight internal group: Kody + Leah
- [ ] Crash-free rate > 99% across all flows

### 12.3 Sprint 12 Acceptance Criteria

- [ ] All 28 screens render at 60fps
- [ ] No memory leaks in Instruments during full user journey
- [ ] Companion state transitions feel polished (spring physics, no jank)
- [ ] TestFlight build uploaded and accessible to internal testers
- [ ] Leah can complete full flow: onboarding → quiz → scan → recommendations → save → designer request

---

## Data Model Reference (PostgreSQL / Supabase)

Matches the Phase 1 spec data model. Key tables for iOS:

```sql
-- Style profiles (quiz results)
style_profiles: id, user_id, quiz_responses (jsonb), computed_vector (vector),
                explicit_preferences (jsonb), primary_style, secondary_style,
                budget_range_min, budget_range_max, confidence, updated_at

-- Rooms (scan data)
rooms: id, user_id, name, scan_data_url, dimensions (jsonb),
       detected_objects (jsonb), confidence, created_at

-- Products (catalog)
products: id, name, price_cents, maker_name, maker_location, maker_story,
          style_tags (text[]), material_tags (text[]), image_urls (text[]),
          usdz_url, embedding (vector), tier, badges (text[])

-- Interactions (behavioral tracking)
interactions: id, user_id, product_id, room_id, event_type, metadata (jsonb), created_at

-- QR auth sessions
qr_sessions: id, session_token, portal_type, user_id, authenticated_at,
             expires_at, device_info (jsonb)

-- Leads (designer requests)
leads: id, client_id, status, rooms (text[]), style_profile_id,
       saved_products (int[]), vision_text, created_at
```

---

## Dependency List

```swift
// Package.swift dependencies (minimal)
dependencies: [
    // Supabase
    .package(url: "https://github.com/supabase/supabase-swift", from: "2.0.0"),
    // Image loading + caching
    .package(url: "https://github.com/kean/Nuke", from: "12.0.0"),
    // QR code scanning (or use native AVFoundation)
    // No third-party needed — AVCaptureSession + AVMetadataMachineReadableCodeObject
]
// Everything else is Apple-native:
// SwiftUI, RealityKit, RoomPlan, ARKit, AuthenticationServices, AVFoundation, CoreHaptics
```

---

## What Comes After Sprint 12

These are explicitly **not** in this spec but are on the horizon:

- Behavioral event pipeline → ML recommendation re-ranking
- Core ML on-device inference (Phase 2 optimization)
- Affiliate link attribution and purchase tracking
- Advanced style profile (photo sorting, slider matrix, story completion)
- Push notification infrastructure (APNs + server-side)
- Multi-room composition views
- Designer portal mobile companion (separate app or responsive web)
- Community features (design challenges, room makeovers)

---

*Build the smallest thing that teaches the most. Ship it. Watch Leah use it. Iterate.*

---

**Document Version:** 1.0
**Last Updated:** April 2026
**Author:** Patina Design + Engineering
**Companion Design Reference:** `patina-ios-complete-v4.html`
**Backend Reference:** `Phase_1_spec`
