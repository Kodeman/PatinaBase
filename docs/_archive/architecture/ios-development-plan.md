# Patina iOS App — Claude Code Development Plan

> **Project:** Patina - Immersive Furniture Discovery Companion
> **Platform:** iOS 17.0+
> **Architecture:** SwiftUI + MVVM + Swift Concurrency
> **Version:** 1.0.0

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Development Environment Setup](#2-development-environment-setup)
3. [Xcode Project Creation](#3-xcode-project-creation)
4. [Project Architecture](#4-project-architecture)
5. [File Structure](#5-file-structure)
6. [Design System Implementation](#6-design-system-implementation)
7. [Core Features Implementation](#7-core-features-implementation)
8. [Phase-by-Phase Development](#8-phase-by-phase-development)
9. [Testing Strategy](#9-testing-strategy)
10. [Build & Deployment](#10-build--deployment)

---

## 1. Project Overview

### 1.1 App Concept

Patina is an unconventional iOS app that reimagines furniture discovery as a companion experience. Unlike typical e-commerce apps, Patina uses:

- **Conversational UI** instead of quizzes
- **Meditative AR walks** instead of clinical scanning
- **Emergent recommendations** instead of product grids
- **Physical table metaphor** instead of wishlists
- **Companion presence** instead of tab navigation

### 1.2 Core Experiences

| Experience | Description | Primary Technologies |
|------------|-------------|---------------------|
| **The Threshold** | Atmospheric entry with time-shifting light | SwiftUI animations, Metal shaders |
| **The Conversation** | NLP-powered dialogue | OpenAI/Claude API, SwiftUI |
| **The Walk** | Narrated AR room scanning | ARKit, RoomPlan, AVSpeechSynthesizer |
| **The Emergence** | Single-piece story reveals | Custom transitions, Core Data |
| **The Table** | Physics-based collection | SpriteKit or UIKit Dynamics |
| **The Companion** | Always-present assistant | Persistent overlay, gesture recognizers |

### 1.3 Technical Requirements

- **iOS Version:** 17.0 minimum (for latest SwiftUI features)
- **Devices:** iPhone 12+ (LiDAR preferred for AR)
- **Frameworks:** SwiftUI, ARKit, RoomPlan, CoreML, Combine
- **Backend:** REST API (to be integrated)
- **Auth:** Sign in with Apple, Email/Password

---

## 2. Development Environment Setup

### 2.1 Prerequisites

```bash
# Verify Xcode installation (requires 15.0+)
xcode-select --version

# If not installed, install from App Store or:
xcode-select --install

# Verify Command Line Tools
xcode-select -p
# Should output: /Applications/Xcode.app/Contents/Developer

# Install Homebrew if needed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install SwiftLint for code quality
brew install swiftlint

# Install SwiftFormat for consistent formatting
brew install swiftformat
```

### 2.2 Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Xcode | 15.0+ | IDE and build tools |
| Swift | 5.9+ | Programming language |
| SwiftLint | Latest | Code linting |
| SwiftFormat | Latest | Code formatting |
| SF Symbols | 5.0 | System icons |

### 2.3 Apple Developer Account

Required for:
- Device testing
- ARKit/RoomPlan access
- Sign in with Apple
- App Store distribution

```bash
# Verify signing identity
security find-identity -v -p codesigning
```

---

## 3. Xcode Project Creation

### 3.1 Create New Project

1. **Open Xcode** → File → New → Project

2. **Select Template:**
   - Platform: iOS
   - Application: App
   - Click Next

3. **Project Options:**
   ```
   Product Name: Patina
   Team: [Your Development Team]
   Organization Identifier: com.middleweststudio
   Bundle Identifier: com.middleweststudio.patina
   Interface: SwiftUI
   Language: Swift
   Storage: None (we'll add Core Data manually)
   ☑️ Include Tests
   ```

4. **Save Location:** Choose your development directory

### 3.2 Initial Project Configuration

After project creation, configure these settings:

#### 3.2.1 Deployment Target

```
Project → Patina → General → Minimum Deployments
iOS: 17.0
```

#### 3.2.2 Device Orientation

```
Project → Patina → General → Deployment Info
☑️ Portrait
☐ Upside Down
☐ Landscape Left
☐ Landscape Right
```

#### 3.2.3 Required Capabilities

Navigate to: Project → Patina → Signing & Capabilities → + Capability

Add these capabilities:
- **Sign in with Apple**
- **Push Notifications** (for emergence alerts)

#### 3.2.4 Info.plist Permissions

Add these keys to Info.plist (or via Project → Info → Custom iOS Target Properties):

```xml
<!-- Camera Access for AR -->
<key>NSCameraUsageDescription</key>
<string>Patina uses your camera to walk through your space together and visualize furniture in your room.</string>

<!-- Photo Library for saving AR captures -->
<key>NSPhotoLibraryUsageDescription</key>
<string>Save room designs and furniture visualizations to your photo library.</string>

<!-- Speech Recognition for voice input -->
<key>NSSpeechRecognitionUsageDescription</key>
<string>Speak naturally with Patina instead of typing.</string>

<!-- Microphone for voice conversation -->
<key>NSMicrophoneUsageDescription</key>
<string>Have a voice conversation with Patina about your space and style.</string>
```

### 3.3 Add SwiftLint Build Phase

1. Project → Patina → Build Phases
2. Click + → New Run Script Phase
3. Rename to "SwiftLint"
4. Add script:

```bash
if which swiftlint > /dev/null; then
  swiftlint
else
  echo "warning: SwiftLint not installed, download from https://github.com/realm/SwiftLint"
fi
```

### 3.4 Create .swiftlint.yml

Create `.swiftlint.yml` in project root:

```yaml
# Patina SwiftLint Configuration

disabled_rules:
  - trailing_whitespace
  - line_length

opt_in_rules:
  - empty_count
  - empty_string
  - closure_spacing
  - contains_over_first_not_nil
  - discouraged_object_literal
  - explicit_init
  - first_where
  - modifier_order
  - overridden_super_call
  - private_action
  - private_outlet
  - prohibited_super_call
  - redundant_nil_coalescing
  - single_test_class
  - sorted_first_last
  - unavailable_function
  - unneeded_parentheses_in_closure_argument
  - vertical_parameter_alignment_on_call
  - yoda_condition

included:
  - Patina

excluded:
  - Pods
  - Packages
  - PatinaTests
  - PatinaUITests

line_length:
  warning: 120
  error: 200

type_body_length:
  warning: 300
  error: 500

file_length:
  warning: 500
  error: 1000

identifier_name:
  min_length: 2
  excluded:
    - id
    - x
    - y
    - z
```

---

## 4. Project Architecture

### 4.1 MVVM + Coordinator Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                         App Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  PatinaApp  │  │ AppDelegate │  │ SceneDelegate       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     Coordinator Layer                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   AppCoordinator                         ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ ││
│  │  │Threshold │ │Conversa- │ │  Walk    │ │ Emergence  │ ││
│  │  │Coordinator│ │tion Coord│ │Coordinator│ │Coordinator │ ││
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘ ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                       View Layer                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│  │ Threshold  │ │Conversation│ │  WalkView  │ │Emergence │ │
│  │   View     │ │   View     │ │            │ │  View    │ │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘ │
│  ┌────────────┐ ┌────────────┐                              │
│  │ TableView  │ │ Companion  │                              │
│  │            │ │  Overlay   │                              │
│  └────────────┘ └────────────┘                              │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    ViewModel Layer                           │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│  │ Threshold  │ │Conversation│ │   Walk     │ │Emergence │ │
│  │ ViewModel  │ │ ViewModel  │ │ ViewModel  │ │ViewModel │ │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     Service Layer                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │   API    │ │Companion │ │   AR     │ │  Persistence   │ │
│  │ Service  │ │ Service  │ │ Service  │ │   Service      │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │  Models  │ │Core Data │ │ Keychain │ │   UserDefaults │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI Framework | SwiftUI | Modern, declarative, great animations |
| State Management | Combine + @Observable | Native, type-safe reactivity |
| Navigation | Custom Coordinator | Non-linear journey flow |
| AR Framework | RoomPlan + ARKit | Apple's latest room scanning |
| Persistence | Core Data + SwiftData | Complex relationships, offline support |
| Networking | async/await + URLSession | Native, no dependencies |
| DI Pattern | Environment Objects | SwiftUI-native injection |

### 4.3 Data Flow

```
User Gesture
     │
     ▼
┌─────────┐    ┌─────────────┐    ┌─────────────┐
│  View   │───▶│  ViewModel  │───▶│   Service   │
└─────────┘    └─────────────┘    └─────────────┘
     ▲                │                   │
     │                ▼                   ▼
     │         ┌─────────────┐    ┌─────────────┐
     │         │    State    │    │  API/Store  │
     │         └─────────────┘    └─────────────┘
     │                │                   │
     └────────────────┴───────────────────┘
              @Published updates
```

---

## 5. File Structure

### 5.1 Create Directory Structure

Run these commands from your project directory (where `.xcodeproj` is located):

```bash
# Navigate to project directory
cd /path/to/Patina

# Create main directory structure
mkdir -p Patina/{App,Features,Core,Design,Services,Utilities,Resources}

# App layer
mkdir -p Patina/App/{Coordinators,Configuration}

# Features - one folder per experience
mkdir -p Patina/Features/Threshold/{Views,ViewModels,Models}
mkdir -p Patina/Features/Conversation/{Views,ViewModels,Models,Components}
mkdir -p Patina/Features/Walk/{Views,ViewModels,Models,AR}
mkdir -p Patina/Features/Emergence/{Views,ViewModels,Models,Components}
mkdir -p Patina/Features/Table/{Views,ViewModels,Models,Physics}
mkdir -p Patina/Features/Companion/{Views,ViewModels,Components}
mkdir -p Patina/Features/Authentication/{Views,ViewModels}
mkdir -p Patina/Features/Onboarding/{Views,ViewModels}

# Core layer
mkdir -p Patina/Core/{Models,Persistence,Network,Extensions}

# Design system
mkdir -p Patina/Design/{Tokens,Components,Animations,Gestures}

# Services
mkdir -p Patina/Services/{API,Companion,AR,Analytics,Notifications}

# Utilities
mkdir -p Patina/Utilities/{Helpers,PropertyWrappers,Protocols}

# Resources
mkdir -p Patina/Resources/{Assets,Fonts,Localizations,Shaders}

# Print structure to verify
find Patina -type d | head -50
```

### 5.2 Complete File Structure

```
Patina/
├── App/
│   ├── PatinaApp.swift                 # App entry point
│   ├── AppDelegate.swift               # UIKit lifecycle hooks
│   ├── Coordinators/
│   │   ├── AppCoordinator.swift        # Root coordinator
│   │   ├── Coordinator.swift           # Protocol definition
│   │   └── NavigationPath+Extensions.swift
│   └── Configuration/
│       ├── AppConfiguration.swift      # Environment configs
│       ├── FeatureFlags.swift          # Feature toggles
│       └── Secrets.swift               # API keys (gitignored)
│
├── Features/
│   ├── Threshold/
│   │   ├── Views/
│   │   │   ├── ThresholdView.swift     # Main threshold experience
│   │   │   ├── LivingSceneView.swift   # Animated room scene
│   │   │   └── HoldToEnterView.swift   # Hold gesture component
│   │   ├── ViewModels/
│   │   │   └── ThresholdViewModel.swift
│   │   └── Models/
│   │       └── TimeOfDay.swift         # Dawn/day/dusk/night
│   │
│   ├── Conversation/
│   │   ├── Views/
│   │   │   ├── ConversationView.swift  # Main chat interface
│   │   │   ├── MessageBubble.swift     # Individual messages
│   │   │   └── TypingIndicator.swift   # Patina thinking dots
│   │   ├── ViewModels/
│   │   │   └── ConversationViewModel.swift
│   │   ├── Models/
│   │   │   ├── Message.swift           # Message data model
│   │   │   ├── ConversationState.swift # Dialogue state
│   │   │   └── StyleProfile.swift      # Extracted preferences
│   │   └── Components/
│   │       ├── VoiceInputButton.swift  # Speech-to-text
│   │       └── SuggestionChips.swift   # Optional quick replies
│   │
│   ├── Walk/
│   │   ├── Views/
│   │   │   ├── WalkView.swift          # Main AR walk experience
│   │   │   ├── WalkNarrationOverlay.swift
│   │   │   └── WalkProgressView.swift
│   │   ├── ViewModels/
│   │   │   └── WalkViewModel.swift
│   │   ├── Models/
│   │   │   ├── RoomScan.swift          # Scanned room data
│   │   │   ├── WalkNarration.swift     # Narration scripts
│   │   │   └── DetectedFeature.swift   # Walls, windows, etc.
│   │   └── AR/
│   │       ├── RoomCaptureManager.swift
│   │       ├── ARCoachingOverlay.swift
│   │       └── SpatialAnchorManager.swift
│   │
│   ├── Emergence/
│   │   ├── Views/
│   │   │   ├── EmergenceView.swift     # Single piece reveal
│   │   │   ├── PieceStoryView.swift    # Provenance display
│   │   │   └── EmergenceActionsView.swift
│   │   ├── ViewModels/
│   │   │   └── EmergenceViewModel.swift
│   │   ├── Models/
│   │   │   ├── FurniturePiece.swift    # Product model
│   │   │   ├── Maker.swift             # Manufacturer info
│   │   │   └── EmergenceEvent.swift    # Timing/trigger
│   │   └── Components/
│   │       ├── FloatingPieceView.swift # Animated product
│   │       └── StayOrDriftButtons.swift
│   │
│   ├── Table/
│   │   ├── Views/
│   │   │   ├── TableView.swift         # Collection surface
│   │   │   ├── TableItemView.swift     # Individual piece
│   │   │   └── TableSurfaceView.swift  # Background texture
│   │   ├── ViewModels/
│   │   │   └── TableViewModel.swift
│   │   ├── Models/
│   │   │   ├── TableItem.swift         # Positioned piece
│   │   │   └── ItemAge.swift           # Visual patina level
│   │   └── Physics/
│   │       ├── TablePhysicsEngine.swift
│   │       └── DragBehavior.swift
│   │
│   ├── Companion/
│   │   ├── Views/
│   │   │   ├── CompanionOverlay.swift  # Always-present mark
│   │   │   ├── CompanionSheet.swift    # Pulled-up interface
│   │   │   └── StrataMark.swift        # Animated brand mark
│   │   ├── ViewModels/
│   │   │   └── CompanionViewModel.swift
│   │   └── Components/
│   │       ├── PulseAnimation.swift
│   │       └── CompanionVoice.swift    # Text-to-speech
│   │
│   ├── Authentication/
│   │   ├── Views/
│   │   │   ├── AuthenticationView.swift
│   │   │   ├── SignInWithAppleButton.swift
│   │   │   └── EmailSignInView.swift
│   │   └── ViewModels/
│   │       └── AuthViewModel.swift
│   │
│   └── Onboarding/
│       ├── Views/
│       │   └── OnboardingRouter.swift  # First-launch flow
│       └── ViewModels/
│           └── OnboardingViewModel.swift
│
├── Core/
│   ├── Models/
│   │   ├── User.swift
│   │   ├── Room.swift
│   │   ├── Collection.swift
│   │   └── Recommendation.swift
│   ├── Persistence/
│   │   ├── PersistenceController.swift
│   │   ├── CoreDataStack.swift
│   │   └── Patina.xcdatamodeld/
│   ├── Network/
│   │   ├── APIClient.swift
│   │   ├── Endpoints.swift
│   │   ├── NetworkError.swift
│   │   └── RequestBuilder.swift
│   └── Extensions/
│       ├── View+Extensions.swift
│       ├── Color+Patina.swift
│       ├── Animation+Patina.swift
│       └── Date+Extensions.swift
│
├── Design/
│   ├── Tokens/
│   │   ├── PatinaColors.swift          # Color palette
│   │   ├── PatinaTypography.swift      # Font styles
│   │   ├── PatinaSpacing.swift         # Spacing scale
│   │   └── PatinaShadows.swift         # Shadow definitions
│   ├── Components/
│   │   ├── PatinaButton.swift
│   │   ├── PatinaCard.swift
│   │   ├── PatinaTextField.swift
│   │   └── StrataMarkView.swift
│   ├── Animations/
│   │   ├── BreathingAnimation.swift
│   │   ├── EmergenceTransition.swift
│   │   ├── ThresholdTransition.swift
│   │   └── PatinaTransitions.swift
│   └── Gestures/
│       ├── HoldGesture.swift           # Custom hold recognizer
│       ├── PullGesture.swift           # Pull-up gesture
│       ├── LingerGesture.swift         # Long-press variant
│       └── PlaceGesture.swift          # Drag with physics
│
├── Services/
│   ├── API/
│   │   ├── PatinaAPIService.swift
│   │   ├── RecommendationService.swift
│   │   └── UserService.swift
│   ├── Companion/
│   │   ├── CompanionService.swift      # AI conversation
│   │   ├── NLPProcessor.swift          # Intent extraction
│   │   └── VoiceSynthesizer.swift      # TTS for narration
│   ├── AR/
│   │   ├── ARSessionService.swift
│   │   ├── RoomPlanService.swift
│   │   └── FurniturePlacementService.swift
│   ├── Analytics/
│   │   └── AnalyticsService.swift
│   └── Notifications/
│       └── EmergenceNotificationService.swift
│
├── Utilities/
│   ├── Helpers/
│   │   ├── HapticManager.swift
│   │   ├── TimeFormatter.swift
│   │   └── ImageLoader.swift
│   ├── PropertyWrappers/
│   │   ├── UserDefaultsBacked.swift
│   │   └── KeychainBacked.swift
│   └── Protocols/
│       ├── Coordinator.swift
│       └── ViewModelProtocol.swift
│
├── Resources/
│   ├── Assets.xcassets/
│   │   ├── AppIcon.appiconset/
│   │   ├── Colors/
│   │   │   ├── PatinaOffWhite.colorset/
│   │   │   ├── PatinaClayBeige.colorset/
│   │   │   ├── PatinaMochaBrown.colorset/
│   │   │   └── PatinaCharcoal.colorset/
│   │   ├── Images/
│   │   │   └── threshold-room.imageset/
│   │   └── Symbols/
│   ├── Fonts/
│   │   ├── PlayfairDisplay-Regular.ttf
│   │   ├── PlayfairDisplay-Medium.ttf
│   │   ├── PlayfairDisplay-Italic.ttf
│   │   └── Inter-Variable.ttf
│   ├── Localizations/
│   │   ├── Localizable.strings
│   │   └── en.lproj/
│   └── Shaders/
│       └── TimeOfDayShader.metal       # Light shifting effect
│
├── PatinaTests/
│   ├── ViewModelTests/
│   ├── ServiceTests/
│   └── Mocks/
│
└── PatinaUITests/
    └── JourneyFlowTests.swift
```

### 5.3 Add Files to Xcode

After creating the directory structure, add files to Xcode:

1. In Xcode, right-click on the Patina folder in the navigator
2. Select "Add Files to 'Patina'"
3. Navigate to the Patina folder
4. Select all created folders
5. Ensure "Create groups" is selected
6. Click Add

---

## 6. Design System Implementation

### 6.1 Color Tokens

Create `Patina/Design/Tokens/PatinaColors.swift`:

```swift
import SwiftUI

/// Patina Design System - Color Tokens
/// Brand: "Where Time Adds Value"
public enum PatinaColors {
    
    // MARK: - Core Palette
    
    /// Primary background - warm, inviting canvas
    public static let offWhite = Color("PatinaOffWhite")
    
    /// Interactive elements, accents
    public static let clayBeige = Color("PatinaClayBeige")
    
    /// Headlines, emphasis
    public static let mochaBrown = Color("PatinaMochaBrown")
    
    /// Primary text, dark backgrounds
    public static let charcoal = Color("PatinaCharcoal")
    
    // MARK: - Extended Palette
    
    /// Card backgrounds, subtle surfaces
    public static let softCream = Color("PatinaSoftCream")
    
    /// Hero sections, special backgrounds
    public static let warmWhite = Color("PatinaWarmWhite")
    
    // MARK: - Semantic Colors
    
    public enum Background {
        public static let primary = offWhite
        public static let secondary = softCream
        public static let tertiary = warmWhite
        public static let dark = charcoal
    }
    
    public enum Text {
        public static let primary = charcoal
        public static let secondary = mochaBrown
        public static let muted = clayBeige
        public static let inverse = offWhite
    }
    
    public enum Interactive {
        public static let `default` = clayBeige
        public static let hover = mochaBrown
        public static let active = charcoal
    }
    
    // MARK: - Strata Mark Colors
    
    public enum Strata {
        public static let line1 = mochaBrown
        public static let line2 = clayBeige
        public static let line3 = clayBeige.opacity(0.5)
    }
}

// MARK: - Color Extension for Hex Values

extension Color {
    /// Initialize with hex string
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Fallback Colors (if asset catalog not set up)

extension PatinaColors {
    public enum Hex {
        public static let offWhite = "#EDE9E4"
        public static let clayBeige = "#A3927C"
        public static let mochaBrown = "#655B52"
        public static let charcoal = "#3F3B37"
        public static let softCream = "#F5F2ED"
        public static let warmWhite = "#FAF7F2"
    }
}
```

### 6.2 Typography Tokens

Create `Patina/Design/Tokens/PatinaTypography.swift`:

```swift
import SwiftUI

/// Patina Design System - Typography
public enum PatinaTypography {
    
    // MARK: - Font Names
    
    private static let displayFont = "PlayfairDisplay"
    private static let bodyFont = "Inter"
    
    // MARK: - Display Styles (Playfair Display)
    
    public static let display1 = Font.custom(displayFont, size: 56, relativeTo: .largeTitle)
        .weight(.medium)
    
    public static let display2 = Font.custom(displayFont, size: 40, relativeTo: .largeTitle)
        .weight(.medium)
    
    public static let h1 = Font.custom(displayFont, size: 32, relativeTo: .title)
        .weight(.medium)
    
    public static let h2 = Font.custom(displayFont, size: 24, relativeTo: .title2)
        .weight(.medium)
    
    public static let h3 = Font.custom(displayFont, size: 20, relativeTo: .title3)
        .weight(.medium)
    
    // MARK: - Body Styles (Inter)
    
    public static let bodyLarge = Font.custom(bodyFont, size: 18, relativeTo: .body)
    
    public static let body = Font.custom(bodyFont, size: 16, relativeTo: .body)
    
    public static let bodySmall = Font.custom(bodyFont, size: 14, relativeTo: .subheadline)
    
    public static let caption = Font.custom(bodyFont, size: 12, relativeTo: .caption)
        .weight(.medium)
    
    // MARK: - Special Styles
    
    /// Uppercase tracking for labels
    public static let eyebrow = Font.custom(bodyFont, size: 12, relativeTo: .caption)
        .weight(.semibold)
    
    /// Italic for Patina's voice
    public static let patinaVoice = Font.custom(displayFont, size: 18, relativeTo: .body)
        .italic()
    
    /// Wordmark style
    public static let wordmark = Font.custom(displayFont, size: 18, relativeTo: .headline)
        .weight(.medium)
}

// MARK: - View Modifiers

extension View {
    /// Apply Patina display style
    public func patinaDisplay(_ style: Font = PatinaTypography.display1) -> some View {
        self
            .font(style)
            .foregroundColor(PatinaColors.Text.primary)
    }
    
    /// Apply Patina body style
    public func patinaBody(_ style: Font = PatinaTypography.body) -> some View {
        self
            .font(style)
            .foregroundColor(PatinaColors.Text.secondary)
    }
    
    /// Apply eyebrow style (uppercase, tracked)
    public func patinaEyebrow() -> some View {
        self
            .font(PatinaTypography.eyebrow)
            .foregroundColor(PatinaColors.Text.muted)
            .textCase(.uppercase)
            .tracking(1.5)
    }
}

// MARK: - Font Registration

public enum FontRegistration {
    /// Register custom fonts at app launch
    public static func registerFonts() {
        let fontNames = [
            "PlayfairDisplay-Regular",
            "PlayfairDisplay-Medium",
            "PlayfairDisplay-Italic",
            "PlayfairDisplay-MediumItalic",
            "Inter-Regular",
            "Inter-Medium",
            "Inter-SemiBold"
        ]
        
        fontNames.forEach { fontName in
            guard let fontURL = Bundle.main.url(forResource: fontName, withExtension: "ttf"),
                  let fontDataProvider = CGDataProvider(url: fontURL as CFURL),
                  let font = CGFont(fontDataProvider) else {
                print("Failed to load font: \(fontName)")
                return
            }
            
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterGraphicsFont(font, &error) {
                print("Error registering font: \(fontName) - \(error.debugDescription)")
            }
        }
    }
}
```

### 6.3 Spacing & Shadows

Create `Patina/Design/Tokens/PatinaSpacing.swift`:

```swift
import SwiftUI

/// Patina Design System - Spacing Scale
public enum PatinaSpacing {
    public static let xs: CGFloat = 4
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 16
    public static let lg: CGFloat = 24
    public static let xl: CGFloat = 32
    public static let xxl: CGFloat = 48
    public static let xxxl: CGFloat = 64
}

/// Patina Design System - Shadows
public enum PatinaShadows {
    
    public static let sm = Shadow(
        color: Color(hex: "655B52").opacity(0.06),
        radius: 4,
        x: 0,
        y: 2
    )
    
    public static let md = Shadow(
        color: Color(hex: "655B52").opacity(0.08),
        radius: 8,
        x: 0,
        y: 4
    )
    
    public static let lg = Shadow(
        color: Color(hex: "655B52").opacity(0.12),
        radius: 16,
        x: 0,
        y: 8
    )
    
    public static let xl = Shadow(
        color: Color(hex: "655B52").opacity(0.16),
        radius: 24,
        x: 0,
        y: 12
    )
    
    public struct Shadow {
        let color: Color
        let radius: CGFloat
        let x: CGFloat
        let y: CGFloat
    }
}

// MARK: - View Extension for Shadows

extension View {
    public func patinaShadow(_ shadow: PatinaShadows.Shadow) -> some View {
        self.shadow(
            color: shadow.color,
            radius: shadow.radius,
            x: shadow.x,
            y: shadow.y
        )
    }
}

/// Patina Design System - Corner Radius
public enum PatinaRadius {
    public static let sm: CGFloat = 4
    public static let md: CGFloat = 8
    public static let lg: CGFloat = 12
    public static let xl: CGFloat = 16
    public static let xxl: CGFloat = 24
    public static let full: CGFloat = 9999
}
```

---

## 7. Core Features Implementation

### 7.1 The Threshold

Create `Patina/Features/Threshold/Views/ThresholdView.swift`:

```swift
import SwiftUI

/// The Threshold - Entry experience with time-shifting light
/// No carousel, no explanation - just presence and invitation
struct ThresholdView: View {
    @StateObject private var viewModel = ThresholdViewModel()
    @State private var holdProgress: CGFloat = 0
    @State private var isHolding = false
    
    private let holdDuration: Double = 2.0
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Living scene background
                LivingSceneView(timeOfDay: viewModel.timeOfDay)
                    .ignoresSafeArea()
                
                // Content overlay
                VStack(spacing: 0) {
                    Spacer()
                    
                    // Time indicator
                    Text(viewModel.timeOfDay.greeting)
                        .font(PatinaTypography.caption)
                        .foregroundColor(.white.opacity(0.4))
                        .textCase(.uppercase)
                        .tracking(2)
                    
                    Spacer().frame(height: PatinaSpacing.lg)
                    
                    // Main message
                    Text("Every room\ntells a story.")
                        .font(PatinaTypography.h1)
                        .foregroundColor(.white.opacity(0.9))
                        .multilineTextAlignment(.center)
                        .lineSpacing(8)
                    
                    Spacer().frame(height: PatinaSpacing.xxxl)
                    
                    // Hold to enter instruction
                    VStack(spacing: PatinaSpacing.md) {
                        // Progress ring
                        ZStack {
                            Circle()
                                .stroke(Color.white.opacity(0.2), lineWidth: 2)
                                .frame(width: 64, height: 64)
                            
                            Circle()
                                .trim(from: 0, to: holdProgress)
                                .stroke(Color.white, lineWidth: 2)
                                .frame(width: 64, height: 64)
                                .rotationEffect(.degrees(-90))
                                .animation(.linear(duration: 0.1), value: holdProgress)
                            
                            // Strata mark inside
                            StrataMarkView(color: .white, scale: 0.5)
                                .opacity(isHolding ? 1 : 0.6)
                        }
                        
                        Text("Hold gently to enter")
                            .font(PatinaTypography.bodySmall)
                            .foregroundColor(.white.opacity(0.6))
                    }
                    
                    Spacer().frame(height: 80)
                }
                .padding(.horizontal, PatinaSpacing.xl)
            }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        if !isHolding {
                            isHolding = true
                            startHoldTimer()
                        }
                    }
                    .onEnded { _ in
                        isHolding = false
                        cancelHoldTimer()
                    }
            )
        }
        .onAppear {
            viewModel.startTimeProgression()
        }
    }
    
    // MARK: - Hold Timer
    
    private func startHoldTimer() {
        // Animate progress
        withAnimation(.linear(duration: holdDuration)) {
            holdProgress = 1.0
        }
        
        // Schedule completion
        DispatchQueue.main.asyncAfter(deadline: .now() + holdDuration) {
            if isHolding {
                viewModel.completeThreshold()
                HapticManager.shared.impact(.medium)
            }
        }
    }
    
    private func cancelHoldTimer() {
        withAnimation(.easeOut(duration: 0.3)) {
            holdProgress = 0
        }
    }
}

// MARK: - Preview

#Preview {
    ThresholdView()
}
```

### 7.2 The Companion Overlay

Create `Patina/Features/Companion/Views/CompanionOverlay.swift`:

```swift
import SwiftUI

/// The Companion - Always-present assistant via Strata Mark
/// Pull up to speak, pulses when Patina has something to share
struct CompanionOverlay: View {
    @StateObject private var viewModel = CompanionViewModel()
    @State private var pullOffset: CGFloat = 0
    @State private var isExpanded = false
    
    private let collapsedHeight: CGFloat = 80
    private let expandedHeight: CGFloat = 400
    private let pullThreshold: CGFloat = 100
    
    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 0) {
                Spacer()
                
                // Companion container
                VStack(spacing: 0) {
                    // Handle / Strata Mark
                    companionHandle
                        .gesture(pullGesture)
                    
                    // Expanded content
                    if isExpanded {
                        CompanionSheet(viewModel: viewModel)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .frame(height: isExpanded ? expandedHeight : collapsedHeight)
                .background(
                    RoundedRectangle(cornerRadius: PatinaRadius.xxl, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .shadow(color: .black.opacity(0.15), radius: 20, y: -5)
                )
                .offset(y: -pullOffset)
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: isExpanded)
            }
            .ignoresSafeArea(edges: .bottom)
        }
    }
    
    // MARK: - Companion Handle
    
    private var companionHandle: some View {
        VStack(spacing: PatinaSpacing.sm) {
            // Pull indicator
            Capsule()
                .fill(PatinaColors.clayBeige.opacity(0.3))
                .frame(width: 36, height: 4)
                .padding(.top, PatinaSpacing.sm)
            
            // Strata Mark (breathing animation when not expanded)
            StrataMarkView(
                color: PatinaColors.clayBeige,
                scale: 0.8,
                breathing: !isExpanded && viewModel.hasPendingMessage
            )
            .frame(height: 40)
            
            if !isExpanded {
                Text("Pull up to speak with Patina")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.Text.muted)
            }
        }
        .frame(height: collapsedHeight)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
    }
    
    // MARK: - Pull Gesture
    
    private var pullGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                let translation = -value.translation.height
                if translation > 0 {
                    pullOffset = min(translation, pullThreshold * 1.5)
                }
            }
            .onEnded { value in
                let translation = -value.translation.height
                
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    if translation > pullThreshold {
                        isExpanded = true
                        HapticManager.shared.impact(.light)
                    }
                    pullOffset = 0
                }
            }
    }
}

// MARK: - Strata Mark View

struct StrataMarkView: View {
    let color: Color
    var scale: CGFloat = 1.0
    var breathing: Bool = false
    
    @State private var breatheScale: CGFloat = 1.0
    
    var body: some View {
        VStack(spacing: 4 * scale) {
            // Line 1 - full width
            Capsule()
                .fill(color)
                .frame(width: 24 * scale, height: 3 * scale)
            
            // Line 2 - 80%
            Capsule()
                .fill(color.opacity(0.7))
                .frame(width: 18 * scale, height: 3 * scale)
            
            // Line 3 - 60%, faded
            Capsule()
                .fill(color.opacity(0.4))
                .frame(width: 12 * scale, height: 3 * scale)
        }
        .scaleEffect(breathing ? breatheScale : 1.0)
        .onAppear {
            if breathing {
                withAnimation(
                    .easeInOut(duration: 2)
                    .repeatForever(autoreverses: true)
                ) {
                    breatheScale = 1.08
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        PatinaColors.Background.primary
            .ignoresSafeArea()
        
        CompanionOverlay()
    }
}
```

### 7.3 Custom Hold Gesture

Create `Patina/Design/Gestures/HoldGesture.swift`:

```swift
import SwiftUI

/// Custom hold gesture that tracks duration
/// Used for threshold crossing and thoughtful interactions
struct HoldGesture: Gesture {
    let minimumDuration: Double
    let onHoldStart: () -> Void
    let onHoldProgress: (Double) -> Void
    let onHoldComplete: () -> Void
    let onHoldCancel: () -> Void
    
    init(
        minimumDuration: Double = 2.0,
        onHoldStart: @escaping () -> Void = {},
        onHoldProgress: @escaping (Double) -> Void = { _ in },
        onHoldComplete: @escaping () -> Void = {},
        onHoldCancel: @escaping () -> Void = {}
    ) {
        self.minimumDuration = minimumDuration
        self.onHoldStart = onHoldStart
        self.onHoldProgress = onHoldProgress
        self.onHoldComplete = onHoldComplete
        self.onHoldCancel = onHoldCancel
    }
    
    var body: some Gesture {
        LongPressGesture(minimumDuration: minimumDuration)
            .onChanged { isPressing in
                if isPressing {
                    onHoldStart()
                }
            }
            .onEnded { completed in
                if completed {
                    onHoldComplete()
                } else {
                    onHoldCancel()
                }
            }
    }
}

// MARK: - Hold Button Modifier

struct HoldableModifier: ViewModifier {
    let duration: Double
    let onComplete: () -> Void
    
    @State private var isHolding = false
    @State private var progress: CGFloat = 0
    @State private var holdTask: Task<Void, Never>?
    
    func body(content: Content) -> some View {
        content
            .scaleEffect(isHolding ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: isHolding)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        guard !isHolding else { return }
                        isHolding = true
                        startHold()
                    }
                    .onEnded { _ in
                        cancelHold()
                    }
            )
    }
    
    private func startHold() {
        holdTask = Task {
            let steps = 60
            let stepDuration = duration / Double(steps)
            
            for step in 1...steps {
                guard !Task.isCancelled else { return }
                
                try? await Task.sleep(nanoseconds: UInt64(stepDuration * 1_000_000_000))
                
                await MainActor.run {
                    progress = CGFloat(step) / CGFloat(steps)
                }
            }
            
            await MainActor.run {
                if isHolding {
                    HapticManager.shared.notification(.success)
                    onComplete()
                }
                resetState()
            }
        }
    }
    
    private func cancelHold() {
        holdTask?.cancel()
        holdTask = nil
        
        withAnimation(.easeOut(duration: 0.2)) {
            resetState()
        }
    }
    
    private func resetState() {
        isHolding = false
        progress = 0
    }
}

extension View {
    /// Add hold-to-activate behavior
    func holdable(duration: Double = 2.0, onComplete: @escaping () -> Void) -> some View {
        modifier(HoldableModifier(duration: duration, onComplete: onComplete))
    }
}
```

---

## 8. Phase-by-Phase Development

### Phase 1: Foundation (Weeks 1-2)

**Goals:** Project setup, design system, basic navigation

**Tasks:**

```markdown
- [ ] Create Xcode project with settings from Section 3
- [ ] Set up directory structure from Section 5
- [ ] Implement design tokens (colors, typography, spacing)
- [ ] Create StrataMarkView component
- [ ] Set up AppCoordinator with basic navigation
- [ ] Implement ThresholdView with hold gesture
- [ ] Create LivingSceneView with time-of-day animation
- [ ] Add haptic feedback manager
- [ ] Configure asset catalog with brand colors
- [ ] Add custom fonts (Playfair Display, Inter)
```

**Deliverables:**
- Working threshold screen with hold-to-enter
- Time-shifting light animation
- Basic app structure

---

### Phase 2: Conversation (Weeks 3-4)

**Goals:** Conversational UI, NLP integration

**Tasks:**

```markdown
- [ ] Create ConversationView with message bubbles
- [ ] Implement ConversationViewModel with state management
- [ ] Design Message model with sender types
- [ ] Build typing indicator animation
- [ ] Integrate LLM API for conversation (Claude/OpenAI)
- [ ] Create NLPProcessor for intent extraction
- [ ] Implement StyleProfile model from conversation
- [ ] Add voice input with Speech framework
- [ ] Build VoiceSynthesizer for Patina's responses
- [ ] Persist conversation history with Core Data
```

**API Integration Example:**

```swift
// Services/Companion/CompanionService.swift

actor CompanionService {
    private let apiClient: APIClient
    private var conversationHistory: [Message] = []
    
    func sendMessage(_ content: String) async throws -> Message {
        let userMessage = Message(content: content, sender: .user)
        conversationHistory.append(userMessage)
        
        let response = try await apiClient.post(
            endpoint: .conversation,
            body: ConversationRequest(
                messages: conversationHistory,
                context: getCurrentContext()
            )
        )
        
        let patinaMessage = Message(
            content: response.reply,
            sender: .patina,
            extractedIntent: response.intent
        )
        
        conversationHistory.append(patinaMessage)
        return patinaMessage
    }
}
```

**Deliverables:**
- Working conversation interface
- Natural language understanding
- Style preference extraction

---

### Phase 3: The Walk (Weeks 5-7)

**Goals:** AR room scanning with narrative overlay

**Tasks:**

```markdown
- [ ] Set up ARKit session management
- [ ] Integrate RoomPlan framework
- [ ] Create RoomCaptureManager
- [ ] Build WalkView with AR background
- [ ] Implement WalkNarrationOverlay
- [ ] Create narration script system
- [ ] Add detected feature highlighting
- [ ] Build progress indicator (non-numeric)
- [ ] Implement meditative pauses
- [ ] Create room completion celebration
- [ ] Persist scanned room data
- [ ] Add walk coaching for AR guidance
```

**RoomPlan Integration:**

```swift
// Features/Walk/AR/RoomCaptureManager.swift

import RoomPlan

@MainActor
class RoomCaptureManager: NSObject, ObservableObject {
    @Published var captureProgress: Double = 0
    @Published var detectedFeatures: [DetectedFeature] = []
    @Published var isScanning = false
    
    private var captureSession: RoomCaptureSession?
    private var captureView: RoomCaptureView?
    
    func startCapture() {
        let session = RoomCaptureSession()
        session.delegate = self
        
        let config = RoomCaptureSession.Configuration()
        config.isCoachingEnabled = false // We provide custom coaching
        
        session.run(configuration: config)
        captureSession = session
        isScanning = true
    }
    
    func stopCapture() async -> CapturedRoom? {
        guard let session = captureSession else { return nil }
        isScanning = false
        
        let result = try? await session.stop()
        return result
    }
}

extension RoomCaptureManager: RoomCaptureSessionDelegate {
    func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        // Update detected features for narration
        detectedFeatures = room.walls.map { wall in
            DetectedFeature(
                type: .wall,
                dimensions: wall.dimensions,
                position: wall.transform.position
            )
        }
        
        // Estimate progress based on coverage
        captureProgress = estimateCoverage(room)
    }
}
```

**Deliverables:**
- AR room scanning experience
- Narrated walk-through
- Room data persistence

---

### Phase 4: Emergence (Weeks 8-9)

**Goals:** Single-piece recommendation reveals

**Tasks:**

```markdown
- [ ] Design FurniturePiece model with provenance
- [ ] Create EmergenceView with floating animation
- [ ] Build PieceStoryView for provenance display
- [ ] Implement stay/drift gesture actions
- [ ] Create emergence scheduling system
- [ ] Build EmergenceNotificationService
- [ ] Design recommendation algorithm interface
- [ ] Add AR preview integration
- [ ] Create piece detail expansion
- [ ] Implement "why this piece" explanation
```

**Emergence Animation:**

```swift
// Design/Animations/EmergenceTransition.swift

struct EmergenceTransition: ViewModifier {
    let isPresented: Bool
    
    func body(content: Content) -> some View {
        content
            .scaleEffect(isPresented ? 1 : 0.8)
            .opacity(isPresented ? 1 : 0)
            .blur(radius: isPresented ? 0 : 10)
            .offset(y: isPresented ? 0 : 50)
            .animation(
                .spring(response: 0.8, dampingFraction: 0.7),
                value: isPresented
            )
    }
}

extension AnyTransition {
    static var emergence: AnyTransition {
        .asymmetric(
            insertion: .modifier(
                active: EmergenceTransition(isPresented: false),
                identity: EmergenceTransition(isPresented: true)
            ),
            removal: .opacity.combined(with: .scale(scale: 0.9))
        )
    }
}
```

**Deliverables:**
- Single-piece emergence experience
- Story-first product reveals
- Timed recommendations

---

### Phase 5: The Table (Weeks 10-11)

**Goals:** Physics-based collection interface

**Tasks:**

```markdown
- [ ] Create TableView with wooden surface aesthetic
- [ ] Implement TablePhysicsEngine (UIKit Dynamics or custom)
- [ ] Build draggable TableItemView
- [ ] Add visual aging based on save duration
- [ ] Implement item stacking behavior
- [ ] Create resonance detection between items
- [ ] Build table arrangement persistence
- [ ] Add item detail expansion
- [ ] Create table sharing/export
- [ ] Implement "Patina notices" hints
```

**Physics Implementation:**

```swift
// Features/Table/Physics/TablePhysicsEngine.swift

import UIKit

class TablePhysicsEngine {
    private var animator: UIDynamicAnimator?
    private var behaviors: [UIDynamicBehavior] = []
    
    func setup(in referenceView: UIView) {
        animator = UIDynamicAnimator(referenceView: referenceView)
        
        // Gravity (slight, for settling)
        let gravity = UIGravityBehavior()
        gravity.magnitude = 0.1
        animator?.addBehavior(gravity)
        
        // Collision with table edges
        let collision = UICollisionBehavior()
        collision.translatesReferenceBoundsIntoBoundary = true
        animator?.addBehavior(collision)
        
        behaviors = [gravity, collision]
    }
    
    func addItem(_ view: UIView) {
        behaviors.compactMap { $0 as? UIGravityBehavior }.first?.addItem(view)
        behaviors.compactMap { $0 as? UICollisionBehavior }.first?.addItem(view)
        
        // Item properties (slight friction, bounciness)
        let itemBehavior = UIDynamicItemBehavior(items: [view])
        itemBehavior.elasticity = 0.3
        itemBehavior.friction = 0.7
        itemBehavior.resistance = 0.5
        animator?.addBehavior(itemBehavior)
    }
    
    func createDragAttachment(for view: UIView, at point: CGPoint) -> UIAttachmentBehavior {
        let attachment = UIAttachmentBehavior(item: view, attachedToAnchor: point)
        attachment.damping = 0.5
        attachment.frequency = 2.0
        animator?.addBehavior(attachment)
        return attachment
    }
}
```

**Deliverables:**
- Physics-based collection surface
- Visual item aging
- Resonance hints

---

### Phase 6: Companion & Polish (Weeks 12-14)

**Goals:** Complete companion system, integration, polish

**Tasks:**

```markdown
- [ ] Complete CompanionOverlay with pull gesture
- [ ] Implement CompanionSheet interface
- [ ] Add contextual awareness (knows current screen)
- [ ] Build intent-based navigation ("Show me my rooms")
- [ ] Create pulse animation for pending messages
- [ ] Integrate companion across all screens
- [ ] Add authentication flow (Sign in with Apple)
- [ ] Implement settings screen
- [ ] Create onboarding for returning users
- [ ] Performance optimization pass
- [ ] Accessibility audit and fixes
- [ ] Final animation polish
- [ ] Bug fixes and edge cases
```

**Deliverables:**
- Complete companion experience
- Polished transitions
- Production-ready build

---

## 9. Testing Strategy

### 9.1 Unit Tests

```swift
// PatinaTests/ViewModelTests/ConversationViewModelTests.swift

import XCTest
@testable import Patina

final class ConversationViewModelTests: XCTestCase {
    var sut: ConversationViewModel!
    var mockCompanionService: MockCompanionService!
    
    override func setUp() {
        super.setUp()
        mockCompanionService = MockCompanionService()
        sut = ConversationViewModel(companionService: mockCompanionService)
    }
    
    func testSendMessage_AddsUserMessage() async {
        // Given
        let content = "I love natural light"
        
        // When
        await sut.sendMessage(content)
        
        // Then
        XCTAssertEqual(sut.messages.count, 2) // User + Patina response
        XCTAssertEqual(sut.messages.first?.sender, .user)
        XCTAssertEqual(sut.messages.first?.content, content)
    }
    
    func testExtractStylePreferences_FromConversation() async {
        // Given
        mockCompanionService.extractedStyle = StyleProfile(
            warmth: .warm,
            formality: .casual,
            materials: [.wood, .leather]
        )
        
        // When
        await sut.sendMessage("I prefer cozy spaces with natural materials")
        
        // Then
        XCTAssertNotNil(sut.currentStyleProfile)
        XCTAssertTrue(sut.currentStyleProfile?.materials.contains(.wood) ?? false)
    }
}
```

### 9.2 UI Tests

```swift
// PatinaUITests/ThresholdFlowTests.swift

import XCTest

final class ThresholdFlowTests: XCTestCase {
    var app: XCUIApplication!
    
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--uitesting"]
        app.launch()
    }
    
    func testThreshold_HoldToEnter_TransitionsToConversation() {
        // Given - threshold screen is shown
        let thresholdView = app.otherElements["ThresholdView"]
        XCTAssertTrue(thresholdView.waitForExistence(timeout: 5))
        
        // When - user holds for 2 seconds
        thresholdView.press(forDuration: 2.5)
        
        // Then - conversation view appears
        let conversationView = app.otherElements["ConversationView"]
        XCTAssertTrue(conversationView.waitForExistence(timeout: 3))
    }
    
    func testCompanion_PullUp_OpensSheet() {
        // Navigate past threshold
        app.otherElements["ThresholdView"].press(forDuration: 2.5)
        
        // Given - companion mark is visible
        let companionMark = app.otherElements["CompanionMark"]
        XCTAssertTrue(companionMark.waitForExistence(timeout: 3))
        
        // When - pull up gesture
        companionMark.swipeUp()
        
        // Then - companion sheet is expanded
        let companionSheet = app.otherElements["CompanionSheet"]
        XCTAssertTrue(companionSheet.waitForExistence(timeout: 2))
    }
}
```

### 9.3 AR Testing

AR features require device testing. Create a test harness:

```swift
// PatinaTests/AR/ARTestHarness.swift

#if DEBUG
import ARKit
import RoomPlan

/// Test harness for AR features - run on physical device
class ARTestHarness {
    
    static func validateDeviceCapabilities() -> [String: Bool] {
        return [
            "ARKit Supported": ARWorldTrackingConfiguration.isSupported,
            "LiDAR Available": ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh),
            "RoomPlan Supported": RoomCaptureSession.isSupported,
            "Face Tracking": ARFaceTrackingConfiguration.isSupported
        ]
    }
    
    static func runDiagnostics() {
        let capabilities = validateDeviceCapabilities()
        
        for (feature, supported) in capabilities {
            print("[\(supported ? "✓" : "✗")] \(feature)")
        }
    }
}
#endif
```

---

## 10. Build & Deployment

### 10.1 Build Configurations

Create three build configurations in Xcode:

| Configuration | Use Case | API Environment |
|--------------|----------|-----------------|
| Debug | Development | localhost / staging |
| Staging | TestFlight | staging |
| Release | App Store | production |

### 10.2 Environment Configuration

Create `Patina/App/Configuration/AppConfiguration.swift`:

```swift
import Foundation

enum AppEnvironment {
    case debug
    case staging
    case release
    
    static var current: AppEnvironment {
        #if DEBUG
        return .debug
        #elseif STAGING
        return .staging
        #else
        return .release
        #endif
    }
}

enum AppConfiguration {
    
    static var apiBaseURL: URL {
        switch AppEnvironment.current {
        case .debug:
            return URL(string: "http://localhost:3000/api")!
        case .staging:
            return URL(string: "https://staging-api.patina.cloud/api")!
        case .release:
            return URL(string: "https://api.patina.cloud/api")!
        }
    }
    
    static var enableDebugOverlay: Bool {
        AppEnvironment.current == .debug
    }
    
    static var analyticsEnabled: Bool {
        AppEnvironment.current != .debug
    }
}
```

### 10.3 Fastlane Setup (Optional)

For automated builds, create `fastlane/Fastfile`:

```ruby
default_platform(:ios)

platform :ios do
  
  desc "Run tests"
  lane :test do
    run_tests(
      scheme: "Patina",
      devices: ["iPhone 15 Pro"],
      code_coverage: true
    )
  end
  
  desc "Build for TestFlight"
  lane :beta do
    increment_build_number
    build_app(
      scheme: "Patina",
      configuration: "Staging",
      export_method: "app-store"
    )
    upload_to_testflight
  end
  
  desc "Deploy to App Store"
  lane :release do
    increment_version_number(bump_type: "patch")
    increment_build_number
    build_app(
      scheme: "Patina",
      configuration: "Release",
      export_method: "app-store"
    )
    upload_to_app_store(
      submit_for_review: true,
      automatic_release: false
    )
  end
  
end
```

### 10.4 Pre-Launch Checklist

```markdown
## App Store Submission Checklist

### Assets
- [ ] App icon (1024x1024)
- [ ] Screenshots for all device sizes
- [ ] App preview videos (optional but recommended)

### Metadata
- [ ] App name: Patina
- [ ] Subtitle: Furniture that grows with your space
- [ ] Keywords: furniture, AR, interior design, home decor, room planner
- [ ] Description (4000 chars max)
- [ ] Privacy policy URL
- [ ] Support URL

### Technical
- [ ] All capabilities configured
- [ ] Privacy manifest complete
- [ ] No private API usage
- [ ] Archive builds successfully
- [ ] All tests passing
- [ ] No memory leaks (Instruments)
- [ ] Battery usage acceptable

### Review Preparation
- [ ] Demo account credentials (if applicable)
- [ ] Notes for reviewer
- [ ] Contact information
```

---

## Quick Reference

### Key Commands

```bash
# Build project
xcodebuild -scheme Patina -configuration Debug build

# Run tests
xcodebuild -scheme Patina -destination 'platform=iOS Simulator,name=iPhone 15 Pro' test

# Archive for distribution
xcodebuild -scheme Patina -configuration Release archive -archivePath build/Patina.xcarchive

# Lint code
swiftlint

# Format code
swiftformat Patina/
```

### Important Files

| File | Purpose |
|------|---------|
| `PatinaApp.swift` | App entry point |
| `AppCoordinator.swift` | Navigation management |
| `PatinaColors.swift` | Color tokens |
| `PatinaTypography.swift` | Font definitions |
| `CompanionService.swift` | AI conversation |
| `RoomCaptureManager.swift` | AR scanning |

### Design System Quick Access

```swift
// Colors
PatinaColors.offWhite
PatinaColors.clayBeige
PatinaColors.Text.primary
PatinaColors.Background.secondary

// Typography
PatinaTypography.h1
PatinaTypography.body
PatinaTypography.patinaVoice

// Spacing
PatinaSpacing.md  // 16pt
PatinaSpacing.xl  // 32pt
```

---

*Patina — Where Time Adds Value*

**Document Version:** 1.0.0  
**Last Updated:** January 2026  
**Prepared for:** Claude Code Development
