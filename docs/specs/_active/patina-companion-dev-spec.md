# Patina Companion MVP — Development Specification

**Version:** 1.0  
**Status:** Draft  
**Date:** January 2025  
**Target Release:** MVP - Phase 1

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement & Solution](#2-problem-statement--solution)
3. [User Stories & Acceptance Criteria](#3-user-stories--acceptance-criteria)
4. [Authentication System](#4-authentication-system)
5. [Companion UI Architecture](#5-companion-ui-architecture)
6. [Context-Aware Quick Actions](#6-context-aware-quick-actions)
7. [Screen Integration Map](#7-screen-integration-map)
8. [Data Models](#8-data-models)
9. [API Specification](#9-api-specification)
10. [Wireframes & UI Specifications](#10-wireframes--ui-specifications)
11. [Technical Requirements](#11-technical-requirements)
12. [Success Metrics](#12-success-metrics)
13. [Implementation Checklist](#13-implementation-checklist)

---

## 1. Executive Summary

### 1.1 Overview

The Patina Companion is a context-aware AI assistant integrated into the Patina iOS application. It serves as a personal design guide that anticipates user needs, offers relevant suggestions, and helps users navigate from room scanning to furniture discovery.

### 1.2 Design Philosophy

> "The best technology disappears. The Companion should feel less like an AI assistant and more like having a thoughtful designer friend who's been working alongside you for years."

### 1.3 MVP Scope

| In Scope | Out of Scope (Future) |
|----------|----------------------|
| Context-aware quick actions | Proactive push suggestions |
| Basic conversational assistance | Voice input/output |
| Authentication gate with SSO | Aesthete Engine deep integration |
| Screen-specific action mapping | Multi-language support |
| Session-based conversation history | Cross-device sync |

### 1.4 Key Metrics Targets

| Metric | Target |
|--------|--------|
| Companion Open Rate | >40% of sessions |
| Quick Action Usage | >60% of opens |
| Auth Conversion | >35% of prompts |
| Scan Completion Lift | +15% vs control |

---

## 2. Problem Statement & Solution

### 2.1 User Pain Points

1. **Navigation Uncertainty** — Users don't know what to do next in their design journey
2. **Articulation Difficulty** — Hard to express style preferences in words
3. **Decision Paralysis** — Too many options without guidance
4. **Context Switching** — Questions arise mid-browse requiring app navigation
5. **Professional Gap** — Need guidance but not full designer consultation

### 2.2 Solution: The Patina Companion

The Companion addresses these pain points through:

- **Context-Aware Quick Actions** — Relevant suggestions based on current screen and user state
- **Natural Language Interface** — Ask complex style questions conversationally
- **Behavioral Awareness** — Detect when users seem stuck and offer help
- **Seamless Escalation** — Easy path to professional designer consultation
- **Learning System** — Improves recommendations with each interaction

---

## 3. User Stories & Acceptance Criteria

### 3.1 Personas

#### Sarah, The First-Timer
- **Profile:** New Homeowner, 32
- **Need:** Guidance through the design process
- **Quote:** "I just moved in and have no idea where to start."

#### Marcus, The Refinement Seeker
- **Profile:** Design-Conscious Professional, 41
- **Need:** Finding pieces that fit specific dimensions
- **Quote:** "I know what I like, but I struggle to find pieces that fit my space."

#### Elena, The Budget-Conscious
- **Profile:** Young Professional, 28
- **Need:** Quality within budget constraints
- **Quote:** "I want quality pieces that will last, but I need to balance my budget."

### 3.2 User Stories

#### US-001: First-Time Guidance
**Priority:** P0  
**Persona:** Sarah

> As a first-time user, I want the Companion to suggest what to do next so I don't feel lost.

**Acceptance Criteria:**
- [ ] Companion shows relevant quick actions on Home screen for new users
- [ ] Quick actions include "Scan your first room" and "Take the style quiz"
- [ ] Tapping quick action navigates to appropriate screen
- [ ] Actions update after user completes suggested task

---

#### US-002: Product Quick Actions
**Priority:** P0  
**Persona:** All

> As a user viewing a product, I want quick actions to see it in AR, save it, or ask questions without navigating away.

**Acceptance Criteria:**
- [ ] Product Detail screen shows product-specific quick actions
- [ ] "See in AR" action launches AR placement mode
- [ ] "Find similar" action shows related products
- [ ] "Will this fit?" uses room dimensions if available
- [ ] Actions execute without full page navigation

---

#### US-003: Room Context Awareness
**Priority:** P0  
**Persona:** Marcus

> As a user with a scanned room, I want the Companion to remember my room dimensions when suggesting furniture.

**Acceptance Criteria:**
- [ ] Companion context includes active scanned room data
- [ ] "Will this fit?" calculates against room dimensions
- [ ] Recommendations filtered by room constraints
- [ ] Room name displayed in relevant Companion responses

---

#### US-004: Budget Alternatives
**Priority:** P1  
**Persona:** Elena

> As a budget-conscious user, I want to ask the Companion to show similar items at a lower price point.

**Acceptance Criteria:**
- [ ] Conversational input accepts budget-related queries
- [ ] Response includes lower-priced alternatives
- [ ] Style similarity maintained in suggestions
- [ ] Price range clearly displayed in results

---

#### US-005: Login Value Explanation
**Priority:** P0  
**Persona:** All

> As a user who hasn't logged in, I want to understand why logging in unlocks better recommendations.

**Acceptance Criteria:**
- [ ] Unauthenticated Companion tap shows login panel
- [ ] Panel explains personalization benefits
- [ ] Three auth options displayed (Apple, Google, Email)
- [ ] "Already have an account?" link visible
- [ ] Panel dismissible without logging in

---

#### US-006: Frictionless Account Creation
**Priority:** P0  
**Persona:** Sarah

> As a new user, I want to create an account quickly using Apple or Google sign-in.

**Acceptance Criteria:**
- [ ] Apple Sign-In completes in ≤3 taps
- [ ] Google Sign-In completes in ≤3 taps
- [ ] Account created server-side on first SSO
- [ ] User redirected to previous screen after auth
- [ ] Style profile initialized for new accounts

---

#### US-007: Conversation Persistence
**Priority:** P1  
**Persona:** Marcus

> As a returning user, I want the Companion to remember my past conversations and preferences.

**Acceptance Criteria:**
- [ ] Conversation history persisted for session
- [ ] Previous context loaded when Companion reopened
- [ ] Style profile informs all responses
- [ ] Room data accessible across conversations

---

## 4. Authentication System

### 4.1 Authentication Requirement

The Patina Companion requires user authentication to function. This enables:
- Personalized recommendations based on style profile
- Room scan persistence and cross-session access
- Conversation history and preference learning
- Seamless designer consultation handoff

### 4.2 Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    APP LAUNCH                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Splash Screen (2s animation)                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                   ┌────────────────┐
                   │ First Launch?  │
                   └────────────────┘
                     │           │
                Yes  │           │  No
                     ▼           ▼
        ┌──────────────────┐  ┌────────────────────┐
        │ Welcome Carousel │  │ Has Stored Token?  │
        │   (3 slides)     │  └────────────────────┘
        └──────────────────┘       │           │
                │               Yes │           │ No
                ▼                   ▼           ▼
        ┌──────────────────┐  ┌─────────┐  ┌──────────────┐
        │  Auth Options    │  │ Validate│  │ Auth Options │
        │     Screen       │  │  Token  │  │    Screen    │
        └──────────────────┘  └─────────┘  └──────────────┘
                │                   │           │
                ▼                   ▼           ▼
        ┌─────────────────────────────────────────────────────┐
        │                    HOME SCREEN                       │
        │              (Companion FAB visible)                 │
        └─────────────────────────────────────────────────────┘
```

### 4.3 Authentication Methods

#### 4.3.1 Apple Sign-In (Primary)

**Implementation:** `ASAuthorizationAppleIDProvider`

```swift
import AuthenticationServices

class AppleSignInManager: NSObject {
    
    func initiateSignIn() {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }
}

extension AppleSignInManager: ASAuthorizationControllerDelegate {
    
    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            return
        }
        
        let authData = AppleAuthData(
            userIdentifier: credential.user,
            email: credential.email,
            fullName: credential.fullName,
            identityToken: credential.identityToken,
            authorizationCode: credential.authorizationCode
        )
        
        // Send to backend for token exchange
        AuthService.shared.authenticateWithApple(authData)
    }
}
```

**Requirements:**
- Must be top/primary button per App Store guidelines
- Support "Hide My Email" relay addresses
- Handle credential revocation via `ASAuthorizationAppleIDProvider.credentialRevokedNotification`

#### 4.3.2 Google Sign-In (Secondary)

**Implementation:** Google Sign-In SDK

```swift
import GoogleSignIn

class GoogleSignInManager {
    
    func initiateSignIn(presenting viewController: UIViewController) {
        GIDSignIn.sharedInstance.signIn(withPresenting: viewController) { result, error in
            guard let result = result, error == nil else {
                self.handleError(error)
                return
            }
            
            let authData = GoogleAuthData(
                userID: result.user.userID,
                email: result.user.profile?.email,
                fullName: result.user.profile?.name,
                idToken: result.user.idToken?.tokenString
            )
            
            // Send to backend for token exchange
            AuthService.shared.authenticateWithGoogle(authData)
        }
    }
}
```

#### 4.3.3 Email + Password (Tertiary)

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character

```swift
struct PasswordValidator {
    
    static func validate(_ password: String) -> ValidationResult {
        var errors: [String] = []
        
        if password.count < 8 {
            errors.append("At least 8 characters required")
        }
        if !password.contains(where: { $0.isUppercase }) {
            errors.append("At least 1 uppercase letter required")
        }
        if !password.contains(where: { $0.isLowercase }) {
            errors.append("At least 1 lowercase letter required")
        }
        if !password.contains(where: { $0.isNumber }) {
            errors.append("At least 1 number required")
        }
        if !password.contains(where: { "!@#$%^&*()_+-=[]{}|;':\",./<>?".contains($0) }) {
            errors.append("At least 1 special character required")
        }
        
        return ValidationResult(isValid: errors.isEmpty, errors: errors)
    }
}
```

### 4.4 Token Management

```swift
class TokenManager {
    
    private let keychain = KeychainService()
    private let accessTokenKey = "patina.auth.accessToken"
    private let refreshTokenKey = "patina.auth.refreshToken"
    
    // MARK: - Storage
    
    func storeTokens(access: String, refresh: String) throws {
        try keychain.set(access, forKey: accessTokenKey, withBiometric: true)
        try keychain.set(refresh, forKey: refreshTokenKey, withBiometric: true)
    }
    
    func getAccessToken() throws -> String? {
        return try keychain.get(accessTokenKey)
    }
    
    func clearTokens() throws {
        try keychain.delete(accessTokenKey)
        try keychain.delete(refreshTokenKey)
    }
    
    // MARK: - Refresh
    
    func refreshIfNeeded() async throws -> String {
        guard let accessToken = try getAccessToken() else {
            throw AuthError.noToken
        }
        
        if isTokenExpired(accessToken) {
            return try await refreshToken()
        }
        
        return accessToken
    }
    
    private func refreshToken() async throws -> String {
        guard let refreshToken = try keychain.get(refreshTokenKey) else {
            throw AuthError.noRefreshToken
        }
        
        let response = try await AuthAPI.refresh(token: refreshToken)
        try storeTokens(access: response.accessToken, refresh: response.refreshToken)
        
        return response.accessToken
    }
}
```

### 4.5 Authentication Requirements Checklist

| ID | Requirement | Priority |
|----|-------------|----------|
| AUTH-001 | Apple Sign-In as primary (top) option | P0 |
| AUTH-002 | All auth options complete in ≤3 taps | P0 |
| AUTH-003 | Tokens stored in iOS Keychain with biometric | P0 |
| AUTH-004 | Clear, actionable error messages on failure | P1 |
| AUTH-005 | Password reset accessible from login screen | P1 |
| AUTH-006 | Guest browsing with Companion redirect to auth | P2 |

---

## 5. Companion UI Architecture

### 5.1 Component States

The Companion exists in three distinct states:

#### State 1: Dormant
- FAB visible at rest position
- Subtle breathing animation indicates availability
- User taps to expand

#### State 2: Quick Actions
- Panel slides up from bottom
- Context-aware action chips displayed
- No keyboard, optimized for quick taps
- "Ask me anything..." prompt at bottom

#### State 3: Conversational
- Full panel with chat interface
- Text input field with send button
- Message history displayed
- Quick reply suggestions after responses

### 5.2 Visual Specifications

#### 5.2.1 Floating Action Button (FAB)

```
┌─────────────────────────────────────────┐
│  FLOATING ACTION BUTTON SPECIFICATION   │
├─────────────────────────────────────────┤
│                                         │
│  Position:                              │
│    - Fixed, bottom-right                │
│    - With tab bar: bottom 88pt          │
│    - Without tab bar: bottom 32pt       │
│    - Right: 20pt                        │
│                                         │
│  Dimensions:                            │
│    - Width: 56pt                        │
│    - Height: 56pt                       │
│    - Corner radius: 28pt (circular)     │
│                                         │
│  Appearance:                            │
│    - Background: Linear gradient        │
│      - Start: #A3927C (Clay Beige)      │
│      - End: #655B52 (Mocha Brown)       │
│      - Direction: 135°                  │
│    - Icon: Sparkle glyph, 24×24pt       │
│    - Icon color: #EDE9E4 (Off-White)    │
│                                         │
│  Shadow:                                │
│    - Offset: (0, 4)                     │
│    - Blur: 16pt                         │
│    - Color: #3F3B37 @ 30% opacity       │
│                                         │
│  Animation (Dormant):                   │
│    - Type: Scale breathing              │
│    - Range: 1.0 → 1.02 → 1.0            │
│    - Duration: 3s                       │
│    - Timing: ease-in-out                │
│    - Repeat: infinite                   │
│                                         │
└─────────────────────────────────────────┘
```

#### 5.2.2 Companion Panel

```
┌─────────────────────────────────────────┐
│  COMPANION PANEL SPECIFICATION          │
├─────────────────────────────────────────┤
│                                         │
│  Position:                              │
│    - Fixed to bottom of screen          │
│    - Full width                         │
│                                         │
│  Entry Animation:                       │
│    - Type: Slide up from bottom         │
│    - Duration: 300ms                    │
│    - Easing: Spring (damping 0.8)       │
│                                         │
│  Appearance:                            │
│    - Background: #FFFFFF                │
│    - Corner radius: 24pt 24pt 0 0       │
│    - Shadow offset: (0, -8)             │
│    - Shadow blur: 32pt                  │
│    - Shadow color: #3F3B37 @ 20%        │
│                                         │
│  Header (56pt height):                  │
│    - Avatar: 32×32pt, gradient bg       │
│    - Title: "How can I help?" / Name    │
│    - Close button: 24×24pt, right       │
│                                         │
│  Quick Actions Area:                    │
│    - Chip height: 36pt                  │
│    - Chip padding: 12pt horizontal      │
│    - Chip gap: 8pt                      │
│    - Scroll: horizontal if overflow     │
│    - Max visible: 4 chips               │
│                                         │
│  Input Field (Conversational):          │
│    - Height: 48pt                       │
│    - Corner radius: 24pt                │
│    - Background: #EDE9E4                │
│    - Placeholder: "Ask me anything..."  │
│    - Send button: 44×44pt, right        │
│                                         │
└─────────────────────────────────────────┘
```

#### 5.2.3 Quick Action Chip

```
┌─────────────────────────────────────────┐
│  QUICK ACTION CHIP SPECIFICATION        │
├─────────────────────────────────────────┤
│                                         │
│  Dimensions:                            │
│    - Height: 36pt                       │
│    - Padding: 12pt horizontal, 8pt vert │
│    - Corner radius: 18pt (pill shape)   │
│                                         │
│  Appearance:                            │
│    - Background: #A3927C @ 15%          │
│    - Border: 1pt solid #A3927C          │
│    - Text color: #655B52                │
│    - Font: Inter Medium, 13pt           │
│                                         │
│  Content:                               │
│    - Icon: Emoji, left aligned          │
│    - Label: Action text                 │
│    - Gap: 6pt between icon and label    │
│                                         │
│  States:                                │
│    - Default: As specified above        │
│    - Pressed: Background #A3927C @ 30%  │
│    - Disabled: Opacity 50%              │
│                                         │
│  Touch Target:                          │
│    - Minimum: 44×44pt                   │
│    - Extends beyond visual bounds       │
│                                         │
└─────────────────────────────────────────┘
```

### 5.3 SwiftUI Implementation

```swift
// MARK: - Companion FAB

struct CompanionFAB: View {
    @Binding var isExpanded: Bool
    @State private var breathingScale: CGFloat = 1.0
    
    private let gradient = LinearGradient(
        colors: [Color("ClayBeige"), Color("MochaBrown")],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    var body: some View {
        Button(action: { isExpanded.toggle() }) {
            ZStack {
                Circle()
                    .fill(gradient)
                    .frame(width: 56, height: 56)
                    .shadow(
                        color: Color("Charcoal").opacity(0.3),
                        radius: 8,
                        x: 0,
                        y: 4
                    )
                
                Image("sparkle")
                    .resizable()
                    .frame(width: 24, height: 24)
                    .foregroundColor(Color("OffWhite"))
            }
            .scaleEffect(breathingScale)
        }
        .onAppear {
            withAnimation(
                .easeInOut(duration: 1.5)
                .repeatForever(autoreverses: true)
            ) {
                breathingScale = 1.02
            }
        }
    }
}

// MARK: - Companion Panel

struct CompanionPanel: View {
    @ObservedObject var viewModel: CompanionViewModel
    @Binding var isPresented: Bool
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            CompanionHeader(
                title: viewModel.headerTitle,
                onClose: { isPresented = false }
            )
            
            // Quick Actions
            if viewModel.showQuickActions {
                QuickActionsView(
                    actions: viewModel.quickActions,
                    onSelect: viewModel.handleQuickAction
                )
            }
            
            // Conversation
            if viewModel.showConversation {
                ConversationView(messages: viewModel.messages)
            }
            
            // Input
            CompanionInputField(
                text: $viewModel.inputText,
                placeholder: "Ask me anything...",
                onSend: viewModel.sendMessage
            )
        }
        .background(Color.white)
        .cornerRadius(24, corners: [.topLeft, .topRight])
        .shadow(
            color: Color("Charcoal").opacity(0.2),
            radius: 16,
            x: 0,
            y: -8
        )
    }
}

// MARK: - Quick Action Chip

struct QuickActionChip: View {
    let action: QuickAction
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Text(action.icon)
                    .font(.system(size: 14))
                
                Text(action.label)
                    .font(.custom("Inter-Medium", size: 13))
                    .foregroundColor(Color("MochaBrown"))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color("ClayBeige").opacity(0.15))
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color("ClayBeige"), lineWidth: 1)
            )
            .cornerRadius(18)
        }
        .buttonStyle(ChipButtonStyle())
    }
}

struct ChipButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                configuration.isPressed 
                    ? Color("ClayBeige").opacity(0.3) 
                    : Color.clear
            )
            .cornerRadius(18)
    }
}
```

---

## 6. Context-Aware Quick Actions

### 6.1 Context Signal Sources

The Companion uses four primary signals to determine quick actions:

| Signal | Source | Weight |
|--------|--------|--------|
| Current Screen | Navigation state | High |
| User State | Profile, auth, history | High |
| Scanned Rooms | RoomPlan data | Medium |
| Style Profile | Quiz results, behavior | Medium |

### 6.2 Screen-Specific Quick Actions

#### Home Screen

| User Context | Quick Actions |
|--------------|---------------|
| First visit, no rooms | 📷 Scan your first room, 🎨 Take the style quiz, 💡 Browse for inspiration, 👋 Give me a tour |
| Has scanned rooms | 🔄 Continue designing [room], 📷 Scan another room, ✨ See what's new for you, 📊 View your style evolution |
| Has saved items | ❤️ Review saved items, 🛒 Create a room set, 📞 Talk to a designer |

#### Room Scan Screen

| User Context | Quick Actions |
|--------------|---------------|
| Pre-scan | 💡 Scanning tips, 🎬 Watch how-to video, ❓ What can I scan? |
| Mid-scan (active) | 🔆 Improve lighting, ↩️ Start over, ❓ Having trouble? |
| Post-scan complete | 🎨 Get recommendations, ✏️ Edit room details, 📷 Scan adjoining room |

#### Style Quiz Screen

| User Context | Quick Actions |
|--------------|---------------|
| In progress | ❓ Why these questions?, ↩️ Go back, ⏭️ Skip this step |
| Complete | 🎉 See my style profile, 🎨 Get recommendations, 🔄 Retake quiz |

#### Recommendations Screen

| User Context | Quick Actions |
|--------------|---------------|
| Viewing grid | 🎯 Why these picks?, 💰 Adjust budget range, 🔀 Show different styles, 📞 Talk to a designer |
| Filtered view | ✖️ Clear filters, 🔍 Narrow further, 💾 Save this search |

#### Product Detail Screen

| User Context | Quick Actions |
|--------------|---------------|
| Viewing product | 📱 See in AR, 🔍 Find similar pieces, ❓ Tell me about the maker, 📏 Will this fit my room? |
| Product saved | ✓ Saved!, 🛒 Add to room set, 🔔 Alert me on price drop |

#### AR Placement Screen

| User Context | Quick Actions |
|--------------|---------------|
| Placing furniture | 📐 Check dimensions, 🔄 Try another piece, 📸 Save this view, ➕ Add complementary item |

#### Saved Items Screen

| User Context | Quick Actions |
|--------------|---------------|
| Has saved items | 🛒 Create a room set, 💰 Check prices, 📞 Share with a designer, 🔔 Alert me on sales |
| Empty | 💡 Discover furniture, 📷 Scan a room first, 🎨 Take style quiz |

#### Profile Screen

| User Context | Quick Actions |
|--------------|---------------|
| Any | 🎨 Retake style quiz, 🏠 Manage my rooms, ❓ Help & support, 💬 Send feedback |

### 6.3 Quick Action Generation Algorithm

```swift
class QuickActionEngine {
    
    func generateQuickActions(context: CompanionContext) -> [QuickAction] {
        var actions: [QuickAction] = []
        
        // 1. Always include screen-specific primary action
        actions.append(contentsOf: getPrimaryActions(for: context.currentScreen))
        
        // 2. Add user-state specific actions
        actions.append(contentsOf: getUserStateActions(context.user))
        
        // 3. Add room-context actions if applicable
        if let room = context.activeRoom {
            actions.append(contentsOf: getRoomActions(room))
        }
        
        // 4. Add style-profile informed actions
        if let styleProfile = context.user.styleProfile {
            actions.append(contentsOf: getStyleActions(styleProfile))
        }
        
        // 5. Add contextual help if user seems stuck
        if context.sessionMetrics.suggestsUserStuck {
            actions.append(.needHelp)
        }
        
        // 6. Deduplicate and prioritize
        let prioritized = prioritize(actions)
        
        // 7. Return top 4 actions
        return Array(prioritized.prefix(4))
    }
    
    private func getPrimaryActions(for screen: ScreenIdentifier) -> [QuickAction] {
        switch screen {
        case .home:
            return [.scanRoom, .styleQuiz]
        case .productDetail(let productId):
            return [.seeInAR(productId), .findSimilar(productId)]
        case .roomScan(let state):
            switch state {
            case .preScan: return [.scanningTips]
            case .active: return [.improveLighting, .startOver]
            case .complete: return [.getRecommendations]
            }
        case .recommendations:
            return [.whyThesePicks, .adjustBudget]
        case .savedItems:
            return [.createRoomSet, .talkToDesigner]
        case .profile:
            return [.retakeStyleQuiz, .helpSupport]
        default:
            return []
        }
    }
    
    private func getUserStateActions(_ user: User) -> [QuickAction] {
        var actions: [QuickAction] = []
        
        if user.scannedRooms.isEmpty {
            actions.append(.scanFirstRoom)
        } else if let lastRoom = user.mostRecentRoom {
            actions.append(.continueDesigning(room: lastRoom))
        }
        
        if !user.hasCompletedStyleQuiz {
            actions.append(.takeStyleQuiz)
        }
        
        if user.savedItems.isEmpty {
            actions.append(.discoverFurniture)
        }
        
        return actions
    }
    
    private func prioritize(_ actions: [QuickAction]) -> [QuickAction] {
        // Remove duplicates
        let unique = Array(Set(actions))
        
        // Sort by priority
        return unique.sorted { $0.priority > $1.priority }
    }
}

// MARK: - Stuck Detection

extension SessionMetrics {
    
    var suggestsUserStuck: Bool {
        // User has been on same screen for >30s with no interactions
        let longDwell = dwellTimeOnCurrentScreen > 30
        let noInteractions = interactionCountOnCurrentScreen == 0
        
        // Or user has scrolled up and down multiple times (searching)
        let searchingBehavior = scrollDirectionChanges > 3
        
        return (longDwell && noInteractions) || searchingBehavior
    }
}
```

---

## 7. Screen Integration Map

### 7.1 Companion Visibility Matrix

| Screen | Companion Visible | FAB Position | Notes |
|--------|-------------------|--------------|-------|
| Splash | ❌ | — | Brand animation only |
| Onboarding Carousel | ❌ | — | Focus on value prop |
| Authentication | ❌ | — | Focus on credentials |
| Home | ✅ | Bottom-right, above tab | Primary entry point |
| Discover/Browse | ✅ | Bottom-right, above tab | Product browsing |
| My Rooms | ✅ | Bottom-right, above tab | Room management |
| Saved/Favorites | ✅ | Bottom-right, above tab | Wishlist management |
| Profile | ✅ | Bottom-right, above tab | Settings and help |
| Product Detail | ✅ | Bottom-right, above tab | Product assistance |
| Room Detail | ✅ | Bottom-right, above tab | Room planning |
| Style Quiz | ✅ | Bottom-right, no tab | Question assistance |
| Recommendations | ✅ | Bottom-right, above tab | Result explanation |
| AR Placement | ✅ | **Top-right, minimized** | Repositioned for camera |
| Active Room Scan | ❌ | — | Full-screen AR capture |
| Checkout | ❌ | — | Transaction focus |
| Permission Dialogs | ❌ | — | System focus |

### 7.2 Special Positioning: AR Mode

During AR Placement (not scanning), the Companion minimizes to the top-right corner:

```
┌─────────────────────────────────────────┐
│  AR MODE COMPANION SPECIFICATION        │
├─────────────────────────────────────────┤
│                                         │
│  Position:                              │
│    - Top-right corner                   │
│    - Top: 48pt (below notch/status)     │
│    - Right: 16pt                        │
│                                         │
│  Dimensions (Minimized):                │
│    - Width: 40pt                        │
│    - Height: 40pt                       │
│    - Corner radius: 20pt                │
│                                         │
│  Appearance:                            │
│    - Same gradient as main FAB          │
│    - Icon: Smaller sparkle (16pt)       │
│    - Semi-transparent: 90% opacity      │
│                                         │
│  Interaction:                           │
│    - Tap to expand quick actions        │
│    - Panel slides down from top         │
│    - Dismiss on outside tap             │
│                                         │
└─────────────────────────────────────────┘
```

### 7.3 Screen Transition Handling

```swift
class CompanionCoordinator {
    
    @Published var isVisible: Bool = false
    @Published var position: CompanionPosition = .bottomRight
    @Published var state: CompanionState = .dormant
    
    private var currentScreen: ScreenIdentifier?
    
    func handleScreenChange(to screen: ScreenIdentifier) {
        currentScreen = screen
        
        // Determine visibility
        isVisible = shouldShowCompanion(for: screen)
        
        // Determine position
        position = getPosition(for: screen)
        
        // Collapse if expanded
        if state != .dormant {
            state = .dormant
        }
        
        // Update quick actions
        if isVisible {
            refreshQuickActions()
        }
    }
    
    private func shouldShowCompanion(for screen: ScreenIdentifier) -> Bool {
        let hiddenScreens: [ScreenIdentifier] = [
            .splash,
            .onboarding,
            .authentication,
            .activeRoomScan,
            .checkout,
            .permissionDialog
        ]
        
        return !hiddenScreens.contains(screen)
    }
    
    private func getPosition(for screen: ScreenIdentifier) -> CompanionPosition {
        switch screen {
        case .arPlacement:
            return .topRight
        default:
            return .bottomRight
        }
    }
}
```

---

## 8. Data Models

### 8.1 Core Models

```swift
// MARK: - Companion Context

struct CompanionContext: Codable {
    let currentScreen: ScreenIdentifier
    let user: AuthenticatedUser
    let sessionMetrics: SessionMetrics
    let activeRoom: ScannedRoom?
    let viewedProduct: Product?
    let conversationHistory: [CompanionMessage]
    
    var toAPIPayload: [String: Any] {
        return [
            "user_id": user.id,
            "screen": currentScreen.rawValue,
            "screen_data": screenData,
            "session_metrics": sessionMetrics.toDict(),
            "room_id": activeRoom?.id,
            "product_id": viewedProduct?.id
        ]
    }
    
    private var screenData: [String: Any] {
        switch currentScreen {
        case .productDetail(let productId):
            return ["product_id": productId]
        case .roomDetail(let roomId):
            return ["room_id": roomId]
        case .recommendations(let filters):
            return ["filters": filters.toDict()]
        default:
            return [:]
        }
    }
}

// MARK: - Screen Identifier

enum ScreenIdentifier: String, Codable {
    case splash
    case onboarding
    case authentication
    case home
    case discover
    case myRooms
    case savedItems
    case profile
    case productDetail
    case roomDetail
    case styleQuiz
    case recommendations
    case arPlacement
    case activeRoomScan
    case checkout
    case permissionDialog
}

// MARK: - Quick Action

struct QuickAction: Codable, Hashable, Identifiable {
    let id: String
    let icon: String
    let label: String
    let actionType: ActionType
    let payload: [String: String]?
    let priority: Int
    
    enum ActionType: String, Codable {
        case navigate
        case trigger
        case prompt
        case deeplink
    }
}

// Predefined Quick Actions
extension QuickAction {
    static let scanRoom = QuickAction(
        id: "scan_room",
        icon: "📷",
        label: "Scan a room",
        actionType: .navigate,
        payload: ["destination": "room_scan"],
        priority: 100
    )
    
    static let styleQuiz = QuickAction(
        id: "style_quiz",
        icon: "🎨",
        label: "Take the style quiz",
        actionType: .navigate,
        payload: ["destination": "style_quiz"],
        priority: 90
    )
    
    static func seeInAR(_ productId: String) -> QuickAction {
        QuickAction(
            id: "see_in_ar_\(productId)",
            icon: "📱",
            label: "See in AR",
            actionType: .trigger,
            payload: ["action": "launch_ar", "product_id": productId],
            priority: 95
        )
    }
    
    // ... additional predefined actions
}

// MARK: - Companion Message

struct CompanionMessage: Codable, Identifiable {
    let id: UUID
    let role: MessageRole
    let content: String
    let timestamp: Date
    let attachments: [Attachment]?
    let quickReplies: [QuickAction]?
    
    enum MessageRole: String, Codable {
        case user
        case companion
    }
}

// MARK: - Session Metrics

struct SessionMetrics: Codable {
    let sessionId: String
    let sessionStartTime: Date
    let currentScreenEntryTime: Date
    let interactionCountOnCurrentScreen: Int
    let scrollDirectionChanges: Int
    let totalScreensVisited: Int
    
    var dwellTimeOnCurrentScreen: TimeInterval {
        Date().timeIntervalSince(currentScreenEntryTime)
    }
    
    func toDict() -> [String: Any] {
        return [
            "session_id": sessionId,
            "dwell_time": dwellTimeOnCurrentScreen,
            "interactions": interactionCountOnCurrentScreen,
            "scroll_changes": scrollDirectionChanges,
            "screens_visited": totalScreensVisited
        ]
    }
}

// MARK: - Authenticated User

struct AuthenticatedUser: Codable {
    let id: String
    let email: String
    let firstName: String?
    let lastName: String?
    let styleProfile: StyleProfile?
    let scannedRooms: [ScannedRoom]
    let savedItems: [String]  // Product IDs
    let hasCompletedStyleQuiz: Bool
    
    var mostRecentRoom: ScannedRoom? {
        scannedRooms.max(by: { $0.updatedAt < $1.updatedAt })
    }
}

// MARK: - Scanned Room

struct ScannedRoom: Codable, Identifiable {
    let id: String
    let name: String
    let roomType: RoomType
    let dimensions: RoomDimensions
    let createdAt: Date
    let updatedAt: Date
    let scanData: Data?  // RoomPlan captured data
    
    enum RoomType: String, Codable {
        case livingRoom, bedroom, diningRoom, office, kitchen, bathroom, other
    }
}

struct RoomDimensions: Codable {
    let width: Double  // meters
    let length: Double
    let height: Double
    let area: Double   // square meters
    
    var areaInSquareFeet: Double {
        area * 10.764
    }
}
```

### 8.2 API Response Models

```swift
// MARK: - Quick Actions Response

struct QuickActionsResponse: Codable {
    let quickActions: [QuickAction]
    let proactiveMessage: String?
    let timestamp: Date
}

// MARK: - Conversation Response

struct ConversationResponse: Codable {
    let messageId: String
    let response: String
    let quickActions: [QuickAction]?
    let suggestedProducts: [ProductSuggestion]?
    let metadata: ResponseMetadata?
}

struct ProductSuggestion: Codable {
    let productId: String
    let name: String
    let price: Decimal
    let imageUrl: URL
    let matchScore: Double
    let reason: String
}

struct ResponseMetadata: Codable {
    let confidence: Double
    let sources: [String]
    let processingTime: TimeInterval
}
```

---

## 9. API Specification

### 9.1 Base Configuration

```
Base URL: https://api.patina.cloud/v1
Authentication: Bearer token (JWT)
Content-Type: application/json
```

### 9.2 Endpoints

#### POST /companion/context

Retrieves context-aware quick actions based on current user state.

**Request:**
```json
{
  "user_id": "uuid-string",
  "screen": "product_detail",
  "screen_data": {
    "product_id": "prod_123",
    "room_id": "room_456"
  },
  "session_metrics": {
    "session_id": "sess_abc",
    "dwell_time": 45.2,
    "interactions": 3,
    "scroll_changes": 1,
    "screens_visited": 5
  }
}
```

**Response (200 OK):**
```json
{
  "quick_actions": [
    {
      "id": "see_in_ar_prod_123",
      "icon": "📱",
      "label": "See in AR",
      "action_type": "trigger",
      "payload": {
        "action": "launch_ar",
        "product_id": "prod_123"
      },
      "priority": 95
    },
    {
      "id": "find_similar",
      "icon": "🔍",
      "label": "Find similar pieces",
      "action_type": "navigate",
      "payload": {
        "destination": "search",
        "filters": {
          "similar_to": "prod_123"
        }
      },
      "priority": 80
    }
  ],
  "proactive_message": null,
  "timestamp": "2025-01-25T14:30:00Z"
}
```

**Error Responses:**
- `401 Unauthorized` — Invalid or expired token
- `400 Bad Request` — Invalid request payload

---

#### POST /companion/message

Sends a conversational message and receives AI response.

**Request:**
```json
{
  "user_id": "uuid-string",
  "message": "Will this sofa fit in my living room?",
  "context": {
    "screen": "product_detail",
    "product_id": "prod_123",
    "room_id": "room_456"
  },
  "conversation_id": "conv_xyz"
}
```

**Response (200 OK):**
```json
{
  "message_id": "msg_789",
  "response": "Based on your living room dimensions (12' × 15'), this sofa would fit well! It's 84\" wide, leaving about 3 feet of clearance on each side. Would you like to see how it looks in AR?",
  "quick_actions": [
    {
      "id": "see_in_ar",
      "icon": "📱",
      "label": "See in AR",
      "action_type": "trigger",
      "payload": { "action": "launch_ar" },
      "priority": 100
    },
    {
      "id": "check_dimensions",
      "icon": "📐",
      "label": "Show dimension details",
      "action_type": "prompt",
      "payload": { "message": "Show me the exact dimensions" },
      "priority": 80
    }
  ],
  "suggested_products": null,
  "metadata": {
    "confidence": 0.92,
    "sources": ["room_scan", "product_catalog"],
    "processing_time": 0.847
  }
}
```

---

#### GET /companion/history

Retrieves conversation history for a user.

**Query Parameters:**
- `user_id` (required): User identifier
- `limit` (optional): Max messages to return (default: 50)
- `before` (optional): Cursor for pagination

**Response (200 OK):**
```json
{
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "content": "What style would work in my living room?",
      "timestamp": "2025-01-25T14:25:00Z",
      "attachments": null
    },
    {
      "id": "msg_002",
      "role": "companion",
      "content": "Based on your style quiz results and the natural light in your living room, I'd recommend exploring mid-century modern pieces...",
      "timestamp": "2025-01-25T14:25:02Z",
      "quick_replies": [...]
    }
  ],
  "has_more": false,
  "cursor": null
}
```

---

### 9.3 Error Handling

```swift
enum CompanionAPIError: Error {
    case unauthorized
    case badRequest(message: String)
    case serverError
    case networkError
    case decodingError
    
    var userMessage: String {
        switch self {
        case .unauthorized:
            return "Please sign in to continue"
        case .badRequest(let message):
            return message
        case .serverError:
            return "Something went wrong. Please try again."
        case .networkError:
            return "Check your connection and try again"
        case .decodingError:
            return "Something went wrong. Please try again."
        }
    }
}

class CompanionAPIClient {
    
    func fetchQuickActions(context: CompanionContext) async throws -> QuickActionsResponse {
        let request = try buildRequest(
            endpoint: "/companion/context",
            method: .post,
            body: context.toAPIPayload
        )
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw CompanionAPIError.networkError
        }
        
        switch httpResponse.statusCode {
        case 200:
            return try JSONDecoder().decode(QuickActionsResponse.self, from: data)
        case 401:
            throw CompanionAPIError.unauthorized
        case 400:
            let error = try JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw CompanionAPIError.badRequest(message: error.message)
        default:
            throw CompanionAPIError.serverError
        }
    }
}
```

---

## 10. Wireframes & UI Specifications

### 10.1 Unauthenticated Companion Prompt

```
┌─────────────────────────────────────────┐
│ ← Discover                          🔔  │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │    [Product Grid - Blurred]    │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤  ← Panel slides up
│                                         │
│  ┌──┐  Patina Companion           ✕    │
│  │✨│                                   │
│  └──┘                                   │
│                                         │
│       Your design journey awaits        │
│                                         │
│  Sign in to unlock personalized         │
│  recommendations, save your scanned     │
│  rooms, and get assistance tailored     │
│  to your unique style.                  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  🍎  Continue with Apple        │   │  ← Primary (black bg)
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  G   Continue with Google       │   │  ← Secondary (outline)
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  ✉️  Continue with Email        │   │  ← Secondary (outline)
│  └─────────────────────────────────┘   │
│                                         │
│    Already have an account? Sign In     │
│                                         │
└─────────────────────────────────────────┘
```

### 10.2 Quick Actions State (Home - New User)

```
┌─────────────────────────────────────────┐
│   Home                              👤  │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │   Welcome Message + Style       │   │
│  │          Summary                │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │       Recent Rooms              │   │
│  │      (Empty State)              │   │
│  └─────────────────────────────────┘   │
│                                         │  ← Content dimmed (40% opacity)
├─────────────────────────────────────────┤
│                                         │  ← Panel (200pt height)
│  ┌──┐  How can I help?            ✕    │
│  │✨│                                   │
│  └──┘                                   │
│                                         │
│  ┌────────────┐ ┌──────────────────┐   │
│  │📷 Scan a   │ │🎨 Refine my      │   │
│  │   room     │ │   style          │   │
│  └────────────┘ └──────────────────┘   │
│  ┌────────────┐ ┌──────────────────┐   │
│  │💡 Get      │ │👋 Show me        │   │
│  │  inspired  │ │   around         │   │
│  └────────────┘ └──────────────────┘   │
│                                         │
│  Or ask me anything...                  │
│                                         │
├─────────────────────────────────────────┤
│  🏠    🔍    📷    ❤️    👤           │  ← Tab bar (dimmed)
└─────────────────────────────────────────┘
```

### 10.3 Conversational State (Product Detail)

```
┌─────────────────────────────────────────┐
│ ← Back                          ♡ Share │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │      [Product Image]           │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │  ← Content (30% opacity)
│                                         │
├─────────────────────────────────────────┤
│                                         │  ← Panel (340pt height)
│  ┌──┐  Patina Companion           ✕    │
│  │✨│                                   │
│  └──┘                                   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ I noticed you've been looking  │   │  ← Companion message
│  │ at mid-century modern pieces.  │   │     (left aligned, gray bg)
│  │ Would you like to see some     │   │
│  │ complementary items?           │   │
│  └─────────────────────────────────┘   │
│                                         │
│          ┌─────────────────────────┐   │
│          │ Yes! But I'm worried   │   │  ← User message
│          │ about the budget       │   │     (right aligned, clay bg)
│          └─────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ I hear you. Let me show you    │   │  ← Companion response
│  │ some quality pieces under      │   │
│  │ $1,200 that capture that same  │   │
│  │ aesthetic...                   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────┐ ┌──┐ │
│  │ Ask me anything...          │ │→ │ │  ← Input field
│  └─────────────────────────────┘ └──┘ │
│                                         │
└─────────────────────────────────────────┘
```

### 10.4 AR Mode (Minimized Companion)

```
┌─────────────────────────────────────────┐
│                                    ┌──┐ │
│  ✕                          ⚙️    │✨│ │  ← Minimized FAB (top-right)
│                                    └──┘ │
│                                         │
│                                         │
│                                         │
│           ┌─────────────────┐           │
│           │                 │           │
│           │   [AR Preview   │           │
│           │   of Furniture] │           │
│           │                 │           │
│           └─────────────────┘           │
│                                         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│     ↻          ⤢          📸           │  ← AR Controls
│   Rotate     Scale     Capture          │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │      ✓ Save This View           │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

---

## 11. Technical Requirements

### 11.1 Functional Requirements

#### P0 — Must Have for MVP

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FUNC-001 | Companion requires authentication | Unauthenticated taps show login panel |
| FUNC-002 | Support Apple Sign-In | Completes in ≤3 taps, follows Apple guidelines |
| FUNC-003 | Support Google Sign-In | Completes in ≤3 taps |
| FUNC-004 | Support Email authentication | Includes validation, password requirements |
| FUNC-005 | Persist auth state | Tokens in Keychain with biometric |
| FUNC-006 | FAB visible on all applicable screens | See Screen Integration Map |
| FUNC-007 | Quick actions update on screen change | Within 100ms of navigation |
| FUNC-008 | Context includes current screen | ScreenIdentifier passed to API |
| FUNC-009 | Context includes user profile | Style profile, rooms, saved items |
| FUNC-010 | Product context in Product Detail | Product ID, dimensions, price |
| FUNC-011 | Room context when applicable | Room ID, dimensions |
| FUNC-012 | Panel animation smooth | Spring physics, 300ms duration |
| FUNC-013 | Quick action chips tappable | 44pt minimum touch target |
| FUNC-014 | Conversational input accepts text | Standard iOS keyboard |
| FUNC-015 | Conversation history in session | Messages persist until app close |

#### P1 — Should Have

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FUNC-016 | Clear error messages on auth failure | User-friendly text, actionable |
| FUNC-017 | Password reset flow | Accessible from login screen |
| FUNC-018 | Session metrics tracked | Dwell time, interactions, scroll |
| FUNC-019 | "Stuck" detection | Offer help after 30s inactivity |
| FUNC-020 | Conversation history persistent | Available on next session |
| FUNC-021 | Product suggestions in responses | When contextually appropriate |
| FUNC-022 | Designer escalation | "Talk to designer" action works |

#### P2 — Nice to Have

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FUNC-023 | Guest browsing mode | Limited exploration, auth redirect |
| FUNC-024 | Proactive messages | API returns suggestions |
| FUNC-025 | Voice input | Speech-to-text for queries |

### 11.2 Non-Functional Requirements

#### Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Quick action generation (local) | < 100ms | Time from screen change to UI update |
| Quick action generation (API) | < 500ms | Time from API call to response |
| Conversation response | < 2s | Time to first token streamed |
| Panel animation | 60 FPS | No dropped frames during open/close |
| FAB breathing animation | 60 FPS | Continuous, no jank |

#### Reliability

| Metric | Target | Notes |
|--------|--------|-------|
| Companion service uptime | 99.5% | Monthly measured |
| Graceful degradation | Required | Show cached actions when offline |
| Error recovery | Required | Retry logic with exponential backoff |

#### Security

| Requirement | Implementation |
|-------------|----------------|
| Token storage | iOS Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` |
| Biometric protection | Enable for token access |
| API communication | TLS 1.3, certificate pinning |
| Token refresh | Silent refresh before expiry |
| Session invalidation | Clear on logout, token revocation |

#### Accessibility

| Requirement | Target |
|-------------|--------|
| VoiceOver support | All elements labeled |
| Dynamic Type | 100% - 150% scaling supported |
| Minimum touch target | 44 × 44 pt |
| Color contrast | WCAG AA compliant |
| Reduced motion | Respect system preference |

---

## 12. Success Metrics

### 12.1 Primary KPIs

| Metric | Definition | MVP Target | Stretch |
|--------|------------|------------|---------|
| Companion Open Rate | % of sessions with ≥1 Companion open | 40% | 55% |
| Quick Action Usage | % of opens resulting in action tap | 60% | 75% |
| Auth Conversion | % of login prompts → successful auth | 35% | 50% |
| Scan Completion Lift | Δ in room scan completion vs control | +15% | +25% |
| Helpfulness Rating | User survey score (1-5) | 4.2 | 4.5 |

### 12.2 Secondary KPIs

| Metric | Definition | Target |
|--------|------------|--------|
| Companion DAU/MAU | Daily users interacting / Monthly users | 25% |
| Conversation Depth | Average messages per conversation | 2.5 |
| First Save Time | Time from first Companion use → first product save | < 8 min |
| Designer Escalation | % of users requesting designer via Companion | 5% |
| Context Accuracy | % of quick actions rated "relevant" | 75% |

### 12.3 Analytics Events

```swift
enum CompanionAnalyticsEvent {
    case fabTapped(screen: String)
    case panelOpened(screen: String, isAuthenticated: Bool)
    case panelClosed(screen: String, interactionCount: Int)
    case quickActionTapped(actionId: String, screen: String)
    case messageSent(screen: String, messageLength: Int)
    case responseReceived(screen: String, responseTime: TimeInterval)
    case authPromptShown(screen: String)
    case authCompleted(method: String, isNewUser: Bool)
    case authFailed(method: String, errorCode: String)
    case productSuggestionTapped(productId: String, position: Int)
    case designerEscalationTapped(screen: String)
}

// Implementation
class CompanionAnalytics {
    
    static func track(_ event: CompanionAnalyticsEvent) {
        let properties = event.properties
        Analytics.track(event.name, properties: properties)
    }
}

extension CompanionAnalyticsEvent {
    
    var name: String {
        switch self {
        case .fabTapped: return "companion_fab_tapped"
        case .panelOpened: return "companion_panel_opened"
        case .panelClosed: return "companion_panel_closed"
        case .quickActionTapped: return "companion_quick_action_tapped"
        case .messageSent: return "companion_message_sent"
        case .responseReceived: return "companion_response_received"
        case .authPromptShown: return "companion_auth_prompt_shown"
        case .authCompleted: return "companion_auth_completed"
        case .authFailed: return "companion_auth_failed"
        case .productSuggestionTapped: return "companion_product_suggestion_tapped"
        case .designerEscalationTapped: return "companion_designer_escalation_tapped"
        }
    }
    
    var properties: [String: Any] {
        switch self {
        case .fabTapped(let screen):
            return ["screen": screen]
        case .panelOpened(let screen, let isAuthenticated):
            return ["screen": screen, "is_authenticated": isAuthenticated]
        case .quickActionTapped(let actionId, let screen):
            return ["action_id": actionId, "screen": screen]
        // ... etc
        }
    }
}
```

---

## 13. Implementation Checklist

### Phase 1: Foundation (Week 1-2)

- [ ] Set up Companion module structure
- [ ] Implement `CompanionCoordinator` for state management
- [ ] Create `CompanionFAB` SwiftUI component
- [ ] Implement FAB breathing animation
- [ ] Create `CompanionPanel` base component
- [ ] Implement panel slide animation (spring physics)
- [ ] Set up screen visibility logic
- [ ] Integrate FAB into main app navigation

### Phase 2: Authentication (Week 2-3)

- [ ] Implement `AppleSignInManager`
- [ ] Implement `GoogleSignInManager`
- [ ] Implement email/password authentication
- [ ] Create `TokenManager` for secure storage
- [ ] Build authentication UI (login panel in Companion)
- [ ] Build full authentication screen
- [ ] Implement token refresh logic
- [ ] Handle credential revocation
- [ ] Add authentication analytics events

### Phase 3: Quick Actions (Week 3-4)

- [ ] Define all `QuickAction` models
- [ ] Implement `QuickActionEngine`
- [ ] Create `QuickActionChip` component
- [ ] Build screen-specific action mappings
- [ ] Implement `CompanionAPIClient` for context endpoint
- [ ] Handle action tap navigation/triggers
- [ ] Add action analytics events
- [ ] Test all screen contexts

### Phase 4: Conversation (Week 4-5)

- [ ] Create `ConversationView` component
- [ ] Implement `CompanionInputField`
- [ ] Build message bubble components
- [ ] Implement `/companion/message` API integration
- [ ] Handle response parsing and display
- [ ] Implement quick replies in responses
- [ ] Add conversation history management
- [ ] Handle product suggestions in responses

### Phase 5: Polish & Testing (Week 5-6)

- [ ] Accessibility audit and fixes
- [ ] VoiceOver labeling
- [ ] Dynamic Type support
- [ ] Reduced motion support
- [ ] Error state handling
- [ ] Offline mode (cached quick actions)
- [ ] Performance optimization
- [ ] Unit tests for all managers
- [ ] UI tests for critical flows
- [ ] Integration tests with API

### Phase 6: Launch Prep (Week 6)

- [ ] Analytics validation
- [ ] A/B test setup (Companion vs control)
- [ ] Feature flag configuration
- [ ] Documentation finalization
- [ ] QA sign-off
- [ ] App Store screenshot updates
- [ ] Release notes

---

## Appendix A: Brand Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Off-White | #EDE9E4 | 237, 233, 228 | Primary backgrounds |
| Clay Beige | #A3927C | 163, 146, 124 | Interactive elements, accents |
| Mocha Brown | #655B52 | 101, 91, 82 | Headlines, emphasis |
| Charcoal | #3F3B37 | 63, 59, 55 | Primary text, dark backgrounds |
| Success | #7A9C85 | 122, 156, 133 | Success states |
| Warning | #D4A574 | 212, 165, 116 | Warning states |
| Error | #B87969 | 184, 121, 105 | Error states |
| Info | #6B8FAD | 107, 143, 173 | Info states |

---

## Appendix B: Typography

| Style | Font | Size | Weight | Line Height |
|-------|------|------|--------|-------------|
| Panel Title | Playfair Display | 18pt | Medium | 1.3 |
| Quick Action | Inter | 13pt | Medium | 1.4 |
| Message Body | Inter | 14pt | Regular | 1.5 |
| Input Placeholder | Inter | 14pt | Regular | 1.5 |
| Hint Text | Inter | 12pt | Regular | 1.4 |
| Auth Button | Inter | 16pt | Medium | 1.0 |

---

## Appendix C: Related Documents

- Patina iOS App Design Document
- User Journey Complete Flow Documentation
- Style Profile System Specification
- The Aesthete Engine Technical Architecture
- Patina Brand Guidelines v2.0

---

**Document History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2025 | — | Initial specification |

---

*© 2025 Patina. Where Time Adds Value.*
