# Patina Companion & Application Flow Specification

> **Module:** iOS Mobile App
> **Version:** 1.0.0
> **Status:** Active
> **Started:** 2026-01
> **Completed:** —

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Philosophy](#2-design-philosophy)
3. [The Companion System](#3-the-companion-system)
4. [Visual States & Transitions](#4-visual-states--transitions)
5. [Context Awareness](#5-context-awareness)
6. [Intent-Based Navigation](#6-intent-based-navigation)
7. [Screen Inventory](#7-screen-inventory)
8. [User Journey Flows](#8-user-journey-flows)
9. [Gesture Interactions](#9-gesture-interactions)
10. [Notification System](#10-notification-system)
11. [Voice & Tone](#11-voice--tone)
12. [State Machine Specification](#12-state-machine-specification)
13. [Animation Specifications](#13-animation-specifications)
14. [Accessibility](#14-accessibility)
15. [Error States](#15-error-states)
16. [Implementation Checklist](#16-implementation-checklist)

---

## 1. Executive Summary

### 1.1 Overview

The Patina Companion is a revolutionary navigation paradigm that replaces traditional mobile navigation patterns (tab bars, hamburger menus, bottom navigation) with a single, always-present conversational interface represented by the **Strata Mark**.

### 1.2 Core Principle

> **"Navigation as Conversation"**  
> Users don't tap icons to move between screens. They express intent through natural dialogue, and Patina guides them to where they want to go.

### 1.3 Key Differentiators

| Traditional Apps | Patina |
|------------------|--------|
| Tab bar with 4-5 icons | Single Companion presence |
| Tap to navigate | Speak/type intent to navigate |
| Static icons | Breathing, living mark |
| Context-free | Deeply context-aware |
| Transactional | Conversational |

### 1.4 The Strata Mark

The Companion is visually represented by the **Strata Mark** — three horizontal lines of decreasing width that evoke geological layers, accumulated time, and the patina concept itself.

```
━━━━━━━━━━━━━━━━━━━━  (Line 1: 100% width, Mocha Brown)
  ━━━━━━━━━━━━━━━━    (Line 2: 80% width, Clay Beige)
    ━━━━━━━━━━━━      (Line 3: 60% width, Clay Beige @ 50%)
```

---

## 2. Design Philosophy

### 2.1 Guiding Principles

#### Principle 1: Always Present, Never Intrusive

The Companion appears on every screen (except the Threshold) but never demands attention. It rests quietly until summoned, like a knowledgeable friend waiting in the room.

#### Principle 2: Context Over Configuration

The Companion always knows:
- Which screen the user is viewing
- What piece, room, or content is in focus
- The user's conversation history
- Pending notifications or emergences

This context shapes every interaction without the user needing to explain.

#### Principle 3: Intent Over Instruction

Users describe *what they want to do*, not *where they want to go*:

| Instead of | Users say |
|------------|-----------|
| "Go to Rooms tab" | "Show me my rooms" |
| "Open saved items" | "What's on my table?" |
| "Start new scan" | "Let's walk my bedroom" |

#### Principle 4: Graceful Uncertainty

When Patina doesn't understand, it asks for clarification rather than guessing wrong:

> *"I want to make sure I understand — are you asking about the chair you saved, or looking for something new?"*

### 2.2 What We're Replacing

| Conventional Pattern | Patina Alternative |
|---------------------|-------------------|
| Onboarding carousel | Single Threshold moment |
| Multiple-choice quiz | Open conversation |
| Tab bar navigation | Companion intent navigation |
| Product grid/carousel | Single-piece emergence |
| Wishlist/favorites | The Table (physical metaphor) |
| Push notification banners | Companion pulse + reveal |

---

## 3. The Companion System

### 3.1 Architectural Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPANION LAYER                          │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                  CompanionOverlay                      │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐  │ │
│  │  │   Strata    │  │   Quick     │  │  Conversation │  │ │
│  │  │    Mark     │  │  Actions    │  │     Sheet     │  │ │
│  │  └─────────────┘  └─────────────┘  └───────────────┘  │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Always on top
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     SCREEN LAYER                            │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│  │ Threshold │ │Conversation│ │   Walk    │ │ Emergence │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│  │   Table   │ │ Room List │ │  Detail   │ │    AR     │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Component Hierarchy

```swift
CompanionOverlay
├── CompanionContainer
│   ├── HandleView
│   │   └── Capsule (drag indicator)
│   ├── StrataMarkView
│   │   ├── Line1 (Mocha Brown, 100%)
│   │   ├── Line2 (Clay Beige, 80%)
│   │   └── Line3 (Clay Beige @ 50%, 60%)
│   ├── HintText
│   ├── QuickActionsBar (visible during pull)
│   │   └── [ActionChip, ActionChip, ActionChip]
│   ├── ContextBar (visible when expanded)
│   │   ├── ContextIcon
│   │   └── ContextLabel
│   ├── ConversationView (visible when expanded)
│   │   └── [MessageBubble, MessageBubble, ...]
│   └── InputBar (visible when expanded)
│       ├── TextField
│       └── VoiceButton
└── NotificationBadge (conditional)
```

### 3.3 Z-Index Layering

| Layer | Z-Index | Content |
|-------|---------|---------|
| Companion | 1000 | Always on top |
| Modals | 900 | Alerts, confirmations |
| Screen Content | 100 | Main app screens |
| Background | 0 | Base layer |

---

## 4. Visual States & Transitions

### 4.1 State Overview

The Companion exists in five distinct states:

| State | Height | Visual | User Action |
|-------|--------|--------|-------------|
| `collapsed` | 80px | Breathing mark | Resting |
| `pulling` | 80-400px | Expanding, actions appear | Dragging |
| `expanded` | 400px | Full conversation | Engaged |
| `pulsing` | 80px | Animated pulse | Has notification |
| `hidden` | 0px | Not visible | Threshold only |

### 4.2 Collapsed State

**Dimensions:**
- Height: 80px
- Width: 100% of screen
- Corner radius: 24px (top corners only)

**Visual Elements:**
- Handle: 36×4px capsule, Clay Beige @ 40%
- Strata Mark: 20×14px, breathing animation
- Hint text: "Pull up to speak" (10px, Clay Beige)

**Behavior:**
- Breathing animation: scale 1.0 → 1.08 over 3s, ease-in-out, infinite
- Background: white @ 95% opacity, blur(20px)
- Shadow: 0 -4px 20px rgba(0,0,0,0.08)

```css
/* Collapsed state styling */
.companion-collapsed {
    height: 80px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(20px);
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
}

.strata-mark--breathing {
    animation: breathe 3s ease-in-out infinite;
}

@keyframes breathe {
    0%, 100% { transform: scale(1.0); }
    50% { transform: scale(1.08); }
}
```

### 4.3 Pulling State

**Trigger:** User drags upward on collapsed Companion

**Behavior:**
- Height interpolates from 80px toward 400px based on drag distance
- Quick actions appear at 100px threshold
- Strata Mark scales up (1.0 → 1.3) during pull
- Haptic feedback at 100px (light) and 150px (medium) thresholds

**Thresholds:**
| Drag Distance | Action |
|---------------|--------|
| 0-80px | Visual feedback only |
| 80-100px | Quick actions begin to appear |
| 100-150px | Quick actions fully visible |
| >150px | Will expand on release |
| <150px | Will collapse on release |

**Quick Actions Appearance:**
```swift
// Opacity based on drag progress
let quickActionsOpacity = max(0, min(1, (dragDistance - 80) / 40))
```

### 4.4 Expanded State

**Dimensions:**
- Height: 400px (adjustable based on content)
- Maximum height: 70% of screen height

**Layout:**
```
┌──────────────────────────────────────┐
│           Handle (4px)               │  12px
├──────────────────────────────────────┤
│  [Icon] Context: Living Room         │  40px
├──────────────────────────────────────┤
│                                      │
│  Patina:                             │
│  "Something surfaced for your        │
│   living room..."                    │
│                                      │  ~260px
│  You:                                │
│  "Show me"                           │
│                                      │
├──────────────────────────────────────┤
│  [Walk a room] [My table] [What's new]│  48px
├──────────────────────────────────────┤
│  [Ask or say anything...        🎤]  │  56px (+ safe area)
└──────────────────────────────────────┘
```

**Components:**

1. **Context Bar**
   - Height: 40px
   - Background: Soft Cream (#F5F2ED)
   - Icon: 20×20px rounded square
   - Text: 11px Inter, Mocha Brown

2. **Conversation Area**
   - Flexible height
   - Scrollable when content exceeds space
   - Messages aligned left (Patina) or right (User)

3. **Quick Actions Bar**
   - Height: 48px
   - Horizontal scroll if more than 3 actions
   - Chips: 8px vertical padding, 14px horizontal

4. **Input Bar**
   - Height: 56px + safe area inset
   - Text field: full width minus voice button
   - Voice button: 44×44px

### 4.5 Pulsing State

**Trigger:** New notification (emergence, insight, etc.)

**Visual:**
- Strata Mark pulses: opacity 1.0 → 0.5 over 1.5s
- Notification dot: 10×10px, Clay Beige, top-right of mark
- Hint text changes: "Something surfaced" (Mocha Brown)

```css
.strata-mark--pulsing {
    animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1.0; }
    50% { opacity: 0.5; }
}

.notification-dot {
    width: 10px;
    height: 10px;
    background: var(--patina-clay-beige);
    border-radius: 50%;
    position: absolute;
    top: -2px;
    right: -2px;
}
```

### 4.6 Hidden State

**Used only on:** Threshold screen

**Reason:** The first entry into Patina should feel unmediated. The Companion appears *after* the user crosses the threshold.

### 4.7 State Transitions

```
                    ┌─────────────┐
                    │   hidden    │
                    └──────┬──────┘
                           │ (threshold complete)
                           ▼
    ┌──────────────────────────────────────────────┐
    │                                              │
    ▼                                              │
┌───────────┐  (drag up)   ┌───────────┐           │
│ collapsed │─────────────▶│  pulling  │           │
└───────────┘              └─────┬─────┘           │
    ▲                            │                 │
    │ (release <150px)           │ (release >150px)│
    │                            ▼                 │
    │                      ┌───────────┐           │
    │◀─────────────────────│ expanded  │           │
    │  (push down/tap out) └───────────┘           │
    │                            │                 │
    │                            │ (navigate)      │
    │                            ▼                 │
    │                      ┌───────────┐           │
    │◀─────────────────────│navigating │───────────┘
    │  (transition complete)└───────────┘
    │
    │  (notification arrives)
    ▼
┌───────────┐
│  pulsing  │
└───────────┘
```

---

## 5. Context Awareness

### 5.1 Context Model

```swift
struct CompanionContext {
    // Current screen
    let currentScreen: Screen
    
    // Content in focus
    let viewingPiece: FurniturePiece?
    let activeRoom: Room?
    let selectedItems: [TableItem]
    
    // Progress states
    let walkProgress: Float? // 0.0-1.0 if walk in progress
    let conversationPhase: ConversationPhase
    
    // Notifications
    let pendingNotification: CompanionNotification?
    
    // History
    let recentScreens: [Screen]
    let conversationHistory: [Message]
}

enum Screen {
    case threshold
    case conversation
    case walk
    case emergence
    case table
    case roomList
    case pieceDetail
    case arPlacement
    case settings
}
```

### 5.2 Context-Specific Behaviors

#### Conversation Screen
```yaml
context_icon: 💬
context_label: "Getting to know you"
quick_actions:
  - "Walk a room"
  - "Skip ahead"
  - "Start fresh"
companion_knows:
  - Conversation progress
  - Extracted style preferences
  - User's expressed needs
```

#### Walk Screen
```yaml
context_icon: 🚶
context_label: "Walking: {room_name} ({progress}% complete)"
quick_actions:
  - "Continue walking"
  - "Save progress"
  - "Start over"
companion_knows:
  - Current room being scanned
  - Scan progress percentage
  - Detected features
  - Can pause/resume narration
```

#### Emergence Screen
```yaml
context_icon: ✨ (or piece emoji)
context_label: "Viewing: {piece_name} by {maker}"
quick_actions:
  - "Why this piece?"
  - "See in my room"
  - "Similar pieces"
companion_knows:
  - Full piece details
  - Why it was recommended
  - User's relevant preferences
  - Room fit analysis
```

#### Table Screen
```yaml
context_icon: 🪵
context_label: "Your Table: {count} pieces gathering"
quick_actions:
  - "What's missing?"
  - "See together"
  - "Share my table"
companion_knows:
  - All saved pieces
  - Time each has been saved
  - Resonance between pieces
  - Gaps in collection
```

#### Room List Screen
```yaml
context_icon: 🏠
context_label: "Your Rooms"
quick_actions:
  - "Walk new room"
  - "Latest emergence"
  - "My table"
companion_knows:
  - All scanned rooms
  - Last activity per room
  - Pending emergences per room
```

#### Piece Detail Screen
```yaml
context_icon: {piece_category_emoji}
context_label: "Viewing: {piece_name}"
quick_actions:
  - "See in room"
  - "Similar pieces"
  - "Add to table"
companion_knows:
  - Full piece provenance
  - Maker story
  - Material details
  - Price and availability
```

#### AR Placement Screen
```yaml
context_icon: 📍
context_label: "{piece_name} in {room_name}"
quick_actions:
  - "Save photo"
  - "Try another piece"
  - "Exit AR"
companion_knows:
  - Placement position
  - Fit analysis
  - Light conditions
  - Alternative positions
```

### 5.3 Context Inheritance

When navigating between screens, context flows naturally:

```
Emergence (viewing Edo Chair)
    │
    │ User: "See in my room"
    ▼
AR Placement
    │ context.viewingPiece = Edo Chair (preserved)
    │ context.activeRoom = Living Room (selected)
    │
    │ User: "Try another piece"
    ▼
Emergence (similar pieces)
    │ context.activeRoom = Living Room (preserved)
    │ context.viewingPiece = new piece
```

---

## 6. Intent-Based Navigation

### 6.1 Intent Categories

```swift
enum NavigationIntent {
    // Screen navigation
    case goToRooms
    case goToTable
    case goToEmergence
    case startWalk(roomName: String?)
    case viewPiece(pieceId: String)
    
    // Actions
    case saveToTable
    case removeFromTable
    case shareCollection
    case seeInRoom
    
    // Information
    case explainPiece
    case showSimilar
    case whatsMissing
    
    // Meta
    case goBack
    case startOver
    case needHelp
}
```

### 6.2 Natural Language Mapping

| User Input | Parsed Intent | Navigation |
|------------|---------------|------------|
| "Show me my rooms" | `goToRooms` | → Room List |
| "My spaces" | `goToRooms` | → Room List |
| "Where I've scanned" | `goToRooms` | → Room List |
| "Let's walk my bedroom" | `startWalk("bedroom")` | → Walk |
| "Scan a new room" | `startWalk(nil)` | → Walk (room select) |
| "Walk another space" | `startWalk(nil)` | → Walk (room select) |
| "What's new?" | `goToEmergence` | → Latest Emergence |
| "Show me what surfaced" | `goToEmergence` | → Latest Emergence |
| "Any new pieces?" | `goToEmergence` | → Emergence List |
| "My table" | `goToTable` | → The Table |
| "My collection" | `goToTable` | → The Table |
| "What I've saved" | `goToTable` | → The Table |
| "That chair again" | `viewPiece(lastViewed)` | → Piece Detail |
| "The Moser piece" | `viewPiece(fuzzyMatch)` | → Piece Detail |
| "Take me back" | `goBack` | → Previous Screen |
| "Go back" | `goBack` | → Previous Screen |
| "Start over" | `startOver` | → Conversation Reset |
| "I need help" | `needHelp` | → Help Overlay |

### 6.3 Intent Resolution Flow

```
User Input
    │
    ▼
┌─────────────────┐
│  NLP Processor  │
│  (parse intent) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ High Confidence │────▶│ Execute Intent  │
│    (>0.85)      │     │                 │
└─────────────────┘     └─────────────────┘
         │
         │ Low Confidence
         ▼
┌─────────────────┐
│   Clarify with  │
│      User       │
└─────────────────┘
         │
         ▼
"I want to make sure I understand..."
```

### 6.4 Clarification Patterns

When intent is ambiguous:

```
User: "Show me the chair"

Patina: "I want to make sure I show you the right one — 
        are you thinking of the Edo Lounge Chair you saved 
        last week, or would you like to see new chairs 
        that have surfaced?"

Options:
[The Edo Chair] [New chairs] [Something else]
```

### 6.5 Navigation Transitions

When Companion triggers navigation:

1. **Collapse Animation** (300ms)
   - Companion height animates to collapsed
   - Conversation preserved in memory

2. **Screen Transition** (400ms)
   - New screen slides in from right
   - Previous screen slides out to left
   - Companion remains at bottom throughout

3. **Context Update** (immediate)
   - CompanionContext updates for new screen
   - Quick actions refresh
   - Hint text updates if relevant

---

## 7. Screen Inventory

### 7.1 Complete Screen List

| Screen | Companion State | Context | Primary Actions |
|--------|-----------------|---------|-----------------|
| Threshold | Hidden | — | Hold to enter |
| Conversation | Collapsed | Phase, preferences | Navigate, respond |
| Walk | Collapsed | Room, progress | Pause, save, restart |
| Walk Complete | Collapsed | Room summary | See fits, walk another |
| Emergence | Collapsed | Piece details | Stay, drift, explain |
| Emergence List | Collapsed | Count, recency | View, filter |
| Table | Collapsed | Collection | Arrange, share |
| Room List | Collapsed | Room count | Walk, view room |
| Room Detail | Collapsed | Room info | Walk again, see fits |
| Piece Detail | Collapsed | Full piece info | Save, see in room |
| AR Placement | Collapsed | Piece + room | Save, swap, exit |
| Settings | Collapsed | User info | Edit, logout |

### 7.2 Screen Specifications

#### 7.2.1 Threshold

```yaml
purpose: First entry, atmospheric invitation
companion: Hidden
entry:
  trigger: App launch (first time or logged out)
  animation: Fade in over 1s
elements:
  - Living scene with time-shifting light
  - Poetic text ("Every room tells a story")
  - Hold-to-enter affordance
exit:
  trigger: Hold gesture (2s)
  animation: Dissolve to Conversation
  companion_appears: Yes, fades in at bottom
```

#### 7.2.2 Conversation

```yaml
purpose: Build understanding through dialogue
companion: Collapsed, subtle
entry:
  from: Threshold, Companion navigation
  animation: Slide from right
elements:
  - Message bubbles (Patina left, User right)
  - Text input at bottom
  - Voice input option
  - Typing indicator
phases:
  1: Welcome + open question
  2: Style exploration
  3: Space understanding
  4: Transition to Walk
exit:
  to: Walk (natural flow), any screen (Companion)
```

#### 7.2.3 The Walk

```yaml
purpose: Narrated AR room scanning
companion: Collapsed, narrates through overlay
entry:
  from: Conversation, Room List, Companion
  animation: Camera view fade in
elements:
  - AR camera view
  - Detected feature highlights
  - Narration overlay (Patina's voice)
  - Progress indicator (non-numeric, organic)
  - Pause button
states:
  scanning: Active capture
  paused: Capture paused
  complete: Ready to process
exit:
  to: Walk Complete, any screen (Companion)
```

#### 7.2.4 Emergence

```yaml
purpose: Single-piece revelation with story
companion: Collapsed, can explain
entry:
  from: Walk Complete, Notification, Companion
  animation: Piece floats in from blur
elements:
  - Floating piece image (centered, large)
  - Maker attribution
  - Piece name
  - Provenance (one line)
  - Stay/Drift actions
gestures:
  - Tap piece: Expand to detail
  - Swipe down: Drift (release)
  - Hold: Invite to stay
exit:
  to: Table (if stayed), next Emergence, Companion
```

#### 7.2.5 The Table

```yaml
purpose: Physical collection surface
companion: Collapsed, offers insights
entry:
  from: Any screen via Companion
  animation: Table surface slides up
elements:
  - Wooden surface texture
  - Draggable piece thumbnails
  - Visual aging on older pieces
  - Resonance highlights (when pieces near)
gestures:
  - Drag: Move pieces
  - Tap: View detail
  - Pinch two: See together
  - Long press: Remove option
exit:
  to: Piece Detail (tap), Companion navigation
```

### 7.3 Screen Transition Matrix

From/To matrix showing valid transitions:

| From ↓ | Threshold | Convo | Walk | Emerge | Table | Rooms | Detail | AR |
|--------|-----------|-------|------|--------|-------|-------|--------|-----|
| Threshold | — | ✓ | — | — | — | — | — | — |
| Conversation | — | — | ✓ | — | ✓ | ✓ | — | — |
| Walk | — | — | — | ✓ | ✓ | ✓ | — | — |
| Emergence | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Table | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Rooms | — | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Detail | — | — | — | ✓ | ✓ | — | — | ✓ |
| AR | — | — | — | ✓ | ✓ | — | ✓ | — |

---

## 8. User Journey Flows

### 8.1 First Launch (New User)

```
┌─────────────┐
│ App Launch  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Threshold  │ ← Companion hidden
│ (Hold 2s)   │
└──────┬──────┘
       │ Companion fades in
       ▼
┌─────────────┐
│Conversation │ ← "Welcome to Patina..."
│  (5-10 min) │
└──────┬──────┘
       │ Natural transition
       ▼
┌─────────────┐
│  The Walk   │ ← First room scan
│  (2-3 min)  │
└──────┬──────┘
       │ Processing
       ▼
┌─────────────┐
│  Emergence  │ ← First piece surfaces
│             │
└──────┬──────┘
       │ "Invite to stay"
       ▼
┌─────────────┐
│  The Table  │ ← First saved piece
│             │
└─────────────┘
```

**Duration:** ~15-20 minutes for complete first journey  
**Key Moments:**
- Threshold crossing (emotional entry)
- First Patina question (relationship begins)
- First narration during walk (companion presence)
- First emergence (discovery moment)
- First table save (collection begins)

### 8.2 Returning User (Has Content)

```
┌─────────────┐
│ App Launch  │
└──────┬──────┘
       │ Skip threshold
       ▼
┌─────────────┐     ┌─────────────┐
│  Room List  │────▶│  Companion  │
│   (Home)    │◀────│  (pulsing)  │
└─────────────┘     └──────┬──────┘
                           │ "Something surfaced"
                           ▼
                    ┌─────────────┐
                    │  Emergence  │
                    │             │
                    └─────────────┘
```

**Key Differences from First Launch:**
- No threshold (already "inside")
- Lands on Room List (their spaces)
- Companion may pulse if new content
- Full navigation freedom immediately

### 8.3 Daily Engagement Loop

```
┌─────────────────────────────────────────────────┐
│                                                 │
│    ┌─────────────┐                              │
│    │  Any Screen │                              │
│    └──────┬──────┘                              │
│           │                                     │
│           ▼                                     │
│    ┌─────────────┐                              │
│    │  Pull up    │                              │
│    │  Companion  │                              │
│    └──────┬──────┘                              │
│           │                                     │
│           ▼                                     │
│    ┌─────────────┐                              │
│    │"What's new?"│                              │
│    └──────┬──────┘                              │
│           │                                     │
│           ▼                                     │
│    ┌─────────────┐     ┌─────────────┐         │
│    │  Emergence  │────▶│   Table     │         │
│    │             │     │ (if stayed) │         │
│    └─────────────┘     └──────┬──────┘         │
│                               │                 │
│                               │ "What's missing?"
│                               ▼                 │
│                        ┌─────────────┐         │
│                        │  Companion  │         │
│                        │  suggests   │─────────┘
│                        └─────────────┘
│
└─────────────────────────────────────────────────┘
```

**Loop Characteristics:**
- Initiated from any screen
- Low friction (just pull up)
- Can be completed in <1 minute
- Builds collection over time

### 8.4 Walk Another Room

```
┌─────────────┐
│  Room List  │
└──────┬──────┘
       │ Pull Companion
       ▼
┌─────────────┐
│ "Walk my    │
│  bedroom"   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Permissions │ ← Only if new session
│  (Camera)   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  The Walk   │
│  (Bedroom)  │
└──────┬──────┘
       │ Complete
       ▼
┌─────────────┐
│  Walk Done  │
│ "Beautiful  │
│  light..."  │
└─────────────┘
```

### 8.5 Piece Deep Dive

```
┌─────────────┐
│  Emergence  │
│ (Edo Chair) │
└──────┬──────┘
       │ Tap piece
       ▼
┌─────────────┐
│Piece Detail │
│ - Story     │
│ - Materials │
│ - Dimensions│
│ - Price     │
└──────┬──────┘
       │ Pull Companion
       ▼
┌─────────────┐
│"See in my   │
│ room"       │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│Room Selector│
│ (if multiple)│
└──────┬──────┘
       │
       ▼
┌─────────────┐
│AR Placement │
│ (Edo in LR) │
└──────┬──────┘
       │ "Save photo"
       ▼
┌─────────────┐
│Photo Saved  │
│→ Camera Roll│
└─────────────┘
```

---

## 9. Gesture Interactions

### 9.1 Gesture Inventory

| Gesture | Target | Action | Haptic |
|---------|--------|--------|--------|
| Pull Up | Strata Mark | Begin expansion | Light @ 100px |
| Release (>150px) | Pulling state | Expand fully | Medium |
| Release (<150px) | Pulling state | Collapse | None |
| Push Down | Expanded | Collapse | None |
| Tap Outside | Expanded | Collapse | None |
| Tap Mark | Collapsed | Expand fully | Light |
| Long Press (0.5s) | Strata Mark | Voice input | Medium |
| Long Press Release | Voice active | Send message | Light |
| Edge Swipe Right | Any screen | Go back | None |

### 9.2 Pull Gesture Specification

```swift
struct PullGesture {
    // Thresholds
    static let quickActionsThreshold: CGFloat = 100
    static let expandThreshold: CGFloat = 150
    static let maxPull: CGFloat = 450
    
    // Physics
    static let resistance: CGFloat = 0.7 // Rubber band effect past max
    static let springResponse: Double = 0.4
    static let springDamping: Double = 0.8
    
    // Haptics
    static let lightHapticAt: CGFloat = 100
    static let mediumHapticAt: CGFloat = 150
}
```

### 9.3 Voice Input Gesture

```swift
struct VoiceInputGesture {
    // Activation
    static let holdDuration: TimeInterval = 0.5
    static let activationHaptic: UIImpactFeedbackGenerator.FeedbackStyle = .medium
    
    // Active state
    static let visualFeedback: Bool = true // Pulsing mic icon
    static let audioFeedback: Bool = true // Subtle tone on start
    
    // Deactivation
    static let releaseAction: Action = .sendMessage
    static let releaseHaptic: UIImpactFeedbackGenerator.FeedbackStyle = .light
    
    // Cancel
    static let dragAwayDistance: CGFloat = 100 // Drag away to cancel
    static let cancelHaptic: UINotificationFeedbackGenerator.FeedbackType = .warning
}
```

### 9.4 Gesture Conflicts & Priority

When multiple gestures could apply:

| Conflict | Resolution |
|----------|------------|
| Pull vs. Scroll | Pull wins if started on Companion |
| Tap vs. Long Press | Tap fires after 0.5s timeout, Long Press takes over after |
| Edge Swipe vs. Pull | Edge swipe wins (native navigation) |
| Companion Pull vs. Screen Pull | Companion wins if touch started on Companion |

---

## 10. Notification System

### 10.1 Notification Types

```swift
enum CompanionNotification {
    case emergence(piece: FurniturePiece, room: Room)
    case collectionInsight(insight: String)
    case walkReminder(room: Room, daysSince: Int)
    case priceChange(piece: FurniturePiece, change: PriceChange)
    case newFromMaker(maker: Maker, pieceCount: Int)
}
```

### 10.2 Notification Delivery

**In-App (Companion is visible):**
1. Companion transitions to pulsing state
2. Hint text changes to notification preview
3. User pulls up to see full message
4. Companion presents contextual response options

**Background (App not active):**
1. iOS push notification delivered
2. Notification text: "[Patina] Something surfaced for your living room"
3. Tap opens app directly to Emergence

### 10.3 Notification Content

#### Emergence Notification
```yaml
trigger: New recommendation generated
pulse_message: "Something surfaced"
expanded_message: |
  "A piece emerged that might speak to your {room_name} — 
  {material_type} from a workshop in {location}. 
  Shall I show you?"
quick_actions:
  - "Show me" (primary)
  - "Later"
  - "Tell me more first"
push_title: "Patina"
push_body: "Something surfaced for your {room_name}"
```

#### Collection Insight
```yaml
trigger: Pattern detected in saved items
pulse_message: "I noticed something"
expanded_message: |
  "The pieces you've gathered share something — 
  {insight_description}. You might be drawn to 
  {suggested_direction}."
quick_actions:
  - "Tell me more"
  - "Show similar"
  - "That's interesting"
```

### 10.4 Notification Timing

| Type | Earliest | Latest | Frequency Cap |
|------|----------|--------|---------------|
| Emergence | 9:00 AM | 9:00 PM | 1 per day |
| Insight | 10:00 AM | 8:00 PM | 2 per week |
| Walk Reminder | 11:00 AM | 7:00 PM | 1 per week |
| Price Change | 9:00 AM | 9:00 PM | Immediate |

---

## 11. Voice & Tone

### 11.1 Companion Personality

**Character Traits:**
- Warm but not effusive
- Knowledgeable but not pedantic
- Curious about the user
- Patient, never rushing
- Specific, not generic
- Uses sensory language

**Voice Attributes:**
| Attribute | Expression |
|-----------|------------|
| Warm | "I noticed..." not "Data indicates..." |
| Curious | "Tell me about..." not "Select from..." |
| Unhurried | "Take your time" not "Hurry before..." |
| Specific | "The walnut grain" not "The material" |
| Sensory | "Wants to be touched" not "Has good texture" |

### 11.2 Language Patterns

**Greetings (context-aware):**
```
Morning: "Good morning. Ready to explore?"
Afternoon: "Afternoon. What brings you back?"
Evening: "Evening. Unwinding with some browsing?"
Return (same day): "Back again. Picking up where we left off?"
Return (days later): "It's been a few days. Shall I show you what surfaced?"
```

**Questions:**
```
Open: "What does 'home' feel like to you?"
Follow-up: "You mentioned natural light — morning or afternoon?"
Clarifying: "When you say 'cozy,' do you mean warm or intimate?"
Confirming: "So, layers and texture, not minimalism. Got it."
```

**Observations:**
```
Room: "I notice tall ceilings here. That opens possibilities."
Piece: "This one's been on your table awhile. It's speaking to you."
Collection: "Your pieces share something — they all age gracefully."
Time: "You've been here a moment. No rush, but I'm here when ready."
```

**Transitions:**
```
To Walk: "Shall we walk your space together?"
To Emergence: "Something surfaced that might speak to you."
To Table: "Let's see what you've gathered."
Completion: "Ready when you are. No rush."
```

### 11.3 Things Patina Never Says

| Avoid | Why |
|-------|-----|
| "Our AI algorithm..." | Technology is invisible |
| "Premium luxury..." | Pretentious |
| "Act now!" | Creates pressure |
| "You should..." | Prescriptive |
| "Perfect for you!" | Overpromising |
| "I think you'll love..." | Presumptuous |
| "Amazing deal!" | Salesy |
| "Don't miss out!" | FOMO manipulation |

### 11.4 Sample Dialogues

**First Conversation:**
```
Patina: "Before we begin — and there's no rush — tell me: 
        when you imagine yourself at home, truly at rest, 
        what's around you?"

User: "Natural light. Books everywhere. Something soft to sit on."

Patina: "Natural light. That's specific. Morning light or afternoon? 
        They feel quite different."

User: "Morning, I think. I like waking up with it."

Patina: "East-facing spaces, then. And books everywhere — 
        shelved and organized, or stacked in friendly piles?"
```

**During Walk:**
```
Patina: "I see tall ceilings here... that opens possibilities. 
        The light's coming from two directions — that's something special."

[pause]

Patina: "Let's move toward that corner. I want to see how the 
        afternoon sun falls there."
```

**Emergence:**
```
Patina: "Something surfaced for your living room — 
        a reading chair that caught my attention. 
        Hand-shaped cherry from a workshop in Maine. 
        The kind of piece that only gets better with Sunday afternoons."
```

---

## 12. State Machine Specification

### 12.1 Companion States

```swift
enum CompanionState {
    case hidden
    case collapsed
    case pulling(offset: CGFloat)
    case expanded
    case pulsing(notification: CompanionNotification)
    case navigating(to: Screen)
    case voiceActive
}
```

### 12.2 State Transitions

```swift
enum CompanionEvent {
    // User gestures
    case pullStarted
    case pullUpdated(offset: CGFloat)
    case pullEnded(offset: CGFloat, velocity: CGFloat)
    case tapMark
    case tapOutside
    case pushDown
    case longPressStart
    case longPressEnd
    case edgeSwipeBack
    
    // System events
    case notificationArrived(CompanionNotification)
    case notificationDismissed
    case navigationRequested(Screen)
    case navigationComplete
    case thresholdComplete
    case screenChanged(Screen)
}
```

### 12.3 Transition Table

| Current State | Event | Next State | Side Effects |
|---------------|-------|------------|--------------|
| hidden | thresholdComplete | collapsed | fadeIn animation |
| collapsed | pullStarted | pulling(0) | — |
| collapsed | tapMark | expanded | haptic, animation |
| collapsed | notificationArrived | pulsing | startPulseAnimation |
| collapsed | longPressStart | voiceActive | haptic, startListening |
| pulling | pullUpdated(offset) | pulling(offset) | updateHeight |
| pulling | pullEnded(>150, _) | expanded | haptic, springAnimation |
| pulling | pullEnded(<150, _) | collapsed | springAnimation |
| expanded | tapOutside | collapsed | animation |
| expanded | pushDown | collapsed | animation |
| expanded | navigationRequested | navigating | — |
| pulsing | tapMark | expanded | showNotification |
| pulsing | notificationDismissed | collapsed | — |
| navigating | navigationComplete | collapsed | — |
| voiceActive | longPressEnd | expanded | haptic, sendMessage |

### 12.4 State Machine Implementation

```swift
@Observable
class CompanionStateMachine {
    private(set) var state: CompanionState = .collapsed
    private(set) var context: CompanionContext
    
    func send(_ event: CompanionEvent) {
        let nextState = reduce(state: state, event: event)
        
        // Execute side effects
        executeSideEffects(from: state, to: nextState, event: event)
        
        // Update state
        state = nextState
    }
    
    private func reduce(state: CompanionState, event: CompanionEvent) -> CompanionState {
        switch (state, event) {
        case (.hidden, .thresholdComplete):
            return .collapsed
            
        case (.collapsed, .pullStarted):
            return .pulling(offset: 0)
            
        case (.collapsed, .tapMark):
            return .expanded
            
        case (.collapsed, .notificationArrived(let notification)):
            return .pulsing(notification: notification)
            
        case (.collapsed, .longPressStart):
            return .voiceActive
            
        case (.pulling, .pullUpdated(let offset)):
            return .pulling(offset: offset)
            
        case (.pulling(let offset), .pullEnded(let finalOffset, _)) where finalOffset > 150:
            return .expanded
            
        case (.pulling, .pullEnded):
            return .collapsed
            
        case (.expanded, .tapOutside), (.expanded, .pushDown):
            return .collapsed
            
        case (.expanded, .navigationRequested(let screen)):
            return .navigating(to: screen)
            
        case (.pulsing, .tapMark):
            return .expanded
            
        case (.pulsing, .notificationDismissed):
            return .collapsed
            
        case (.navigating, .navigationComplete):
            return .collapsed
            
        case (.voiceActive, .longPressEnd):
            return .expanded
            
        default:
            return state
        }
    }
}
```

---

## 13. Animation Specifications

### 13.1 Core Animations

#### Breathing (Collapsed)
```swift
Animation.easeInOut(duration: 3.0)
    .repeatForever(autoreverses: true)
// Scale: 1.0 → 1.08
```

#### Pulsing (Notification)
```swift
Animation.easeInOut(duration: 1.5)
    .repeatForever(autoreverses: true)
// Opacity: 1.0 → 0.5
```

#### Expand/Collapse
```swift
Animation.spring(response: 0.4, dampingFraction: 0.8)
// Height: 80px ↔ 400px
```

#### Pull Resistance
```swift
// When pulling past maxHeight
let resistedOffset = maxHeight + (offset - maxHeight) * 0.3
```

#### Navigation Transition
```swift
// Screen transition
Animation.easeInOut(duration: 0.4)
// Companion collapse
Animation.spring(response: 0.3, dampingFraction: 0.85)
```

### 13.2 Micro-Interactions

| Element | Trigger | Animation |
|---------|---------|-----------|
| Quick Action Chip | Appear | FadeIn + ScaleUp (0.8→1.0), 200ms |
| Quick Action Chip | Tap | ScaleDown (1.0→0.95→1.0), 100ms |
| Context Bar | Expand | SlideDown + FadeIn, 250ms |
| Message Bubble | Appear | SlideUp + FadeIn, 300ms |
| Notification Dot | Appear | ScaleUp (0→1.0) + Bounce, 400ms |
| Voice Indicator | Active | Pulse (scale 1.0→1.1), 500ms loop |

### 13.3 Timing Curves

```swift
// Named curves for consistency
extension Animation {
    static let patinaSpring = Animation.spring(response: 0.4, dampingFraction: 0.8)
    static let patinaEase = Animation.easeInOut(duration: 0.3)
    static let patinaSlow = Animation.easeInOut(duration: 0.5)
    static let patinaSnap = Animation.spring(response: 0.25, dampingFraction: 0.9)
}
```

---

## 14. Accessibility

### 14.1 VoiceOver Support

| Element | Label | Hint |
|---------|-------|------|
| Strata Mark | "Patina Companion" | "Double tap to open, or drag up for quick actions" |
| Quick Action | "{action name}" | "Double tap to {action}" |
| Notification Dot | "New notification" | "Patina has something to share" |
| Voice Button | "Voice input" | "Double tap and hold to speak" |

### 14.2 Reduced Motion

When "Reduce Motion" is enabled:

| Normal | Reduced Motion |
|--------|----------------|
| Breathing animation | Static mark |
| Spring transitions | Fade transitions |
| Pulse animation | Subtle glow |
| Slide transitions | Cross-fade |

### 14.3 Dynamic Type

All Companion text scales with system settings:

| Element | Base Size | Scaling |
|---------|-----------|---------|
| Hint text | 10pt | Scales to 16pt max |
| Context label | 11pt | Scales to 17pt max |
| Message text | 14pt | Scales to 22pt max |
| Quick action | 12pt | Scales to 18pt max |
| Input placeholder | 13pt | Scales to 20pt max |

### 14.4 Alternative Interactions

| Standard Gesture | Alternative |
|------------------|-------------|
| Pull up | Double-tap mark |
| Long press voice | Voice button in input bar |
| Swipe quick actions | Scroll in expanded view |

---

## 15. Error States

### 15.1 Network Errors

**During Intent Processing:**
```yaml
visual: Subtle shake of expanded sheet
message: "I'm having trouble hearing you right now. Try again in a moment?"
actions:
  - "Try again"
  - "Never mind"
recovery: Auto-retry 3 times with exponential backoff
```

**During Voice Input:**
```yaml
visual: Voice indicator turns amber
message: "I didn't catch that. The connection seems slow."
actions:
  - "Try again"
  - "Type instead"
recovery: Fall back to text input
```

### 15.2 Misunderstood Intent

```yaml
trigger: NLP confidence < 0.5
visual: None (just conversation)
message: "I'm not sure I understood. Did you mean {best_guess}, or something else?"
actions:
  - "{best_guess}" (chip)
  - "{second_guess}" (chip)
  - "Something else"
recovery: User clarifies, retry parsing
```

### 15.3 Empty States

**No Rooms:**
```yaml
context: "Your Rooms (0 spaces)"
message: "Your space awaits. Shall we walk your first room together?"
actions:
  - "Walk a room" (primary)
  - "Maybe later"
```

**No Table Items:**
```yaml
context: "Your Table (empty)"
message: "Your table is clear, ready for pieces that speak to you. Want to see what's surfaced?"
actions:
  - "Show me" (primary)
  - "Not yet"
```

**No Emergences:**
```yaml
context: "Nothing new"
message: "Nothing has surfaced yet. The best pieces take time to find. Check back soon."
actions:
  - "My rooms"
  - "My table"
```

---

## 16. Implementation Checklist

### 16.1 Phase 1: Core Companion

- [ ] Create `CompanionOverlay` SwiftUI view
- [ ] Implement `StrataMarkView` with animations
- [ ] Build state machine (`CompanionStateMachine`)
- [ ] Implement pull gesture with physics
- [ ] Create collapsed state layout
- [ ] Create expanded state layout
- [ ] Add spring animations for transitions
- [ ] Implement haptic feedback
- [ ] Test on all iPhone sizes

### 16.2 Phase 2: Context System

- [ ] Create `CompanionContext` model
- [ ] Build context observer for screen changes
- [ ] Implement context bar UI
- [ ] Create quick actions system
- [ ] Build context-specific action configs
- [ ] Test context preservation across navigation

### 16.3 Phase 3: Conversation

- [ ] Implement message bubble components
- [ ] Create conversation view with scroll
- [ ] Build text input bar
- [ ] Add typing indicator
- [ ] Implement conversation persistence
- [ ] Test conversation state management

### 16.4 Phase 4: Intent Navigation

- [ ] Build NLP intent parser
- [ ] Create intent → screen mapping
- [ ] Implement navigation transitions
- [ ] Add clarification dialogue system
- [ ] Create fuzzy matching for piece references
- [ ] Test all navigation paths

### 16.5 Phase 5: Voice Input

- [ ] Implement long-press gesture recognizer
- [ ] Integrate Speech framework
- [ ] Build voice input UI state
- [ ] Add visual feedback during recording
- [ ] Implement cancel gesture (drag away)
- [ ] Test with various accents/noise

### 16.6 Phase 6: Notifications

- [ ] Create notification types and models
- [ ] Implement pulsing state
- [ ] Build notification reveal flow
- [ ] Integrate push notifications
- [ ] Add notification timing logic
- [ ] Test notification → expansion flow

### 16.7 Phase 7: Polish

- [ ] Accessibility audit
- [ ] Reduced motion alternatives
- [ ] Dynamic type testing
- [ ] Performance optimization
- [ ] Memory leak testing
- [ ] Edge case handling
- [ ] Error state implementation

---

## Appendix A: Quick Reference

### A.1 Dimensions

| Element | Value |
|---------|-------|
| Collapsed height | 80px |
| Expanded height | 400px |
| Max expanded height | 70% screen |
| Pull threshold | 150px |
| Quick actions threshold | 100px |
| Handle width | 36px |
| Handle height | 4px |
| Corner radius | 24px |
| Strata Mark width | 20px |
| Strata Mark height | 14px |

### A.2 Colors

| Element | Color |
|---------|-------|
| Background | White @ 95% |
| Handle | Clay Beige @ 40% |
| Strata Line 1 | Mocha Brown |
| Strata Line 2 | Clay Beige |
| Strata Line 3 | Clay Beige @ 50% |
| Context bar | Soft Cream |
| Notification dot | Clay Beige |
| Input background | Soft Cream |

### A.3 Typography

| Element | Font |
|---------|------|
| Hint text | Inter 10pt |
| Context label | Inter 11pt |
| Message (Patina) | Playfair Italic 14pt |
| Message (User) | Inter 14pt |
| Quick action | Inter Medium 12pt |
| Input placeholder | Inter 13pt |

### A.4 Animations

| Animation | Duration | Curve |
|-----------|----------|-------|
| Breathing | 3s | ease-in-out |
| Pulsing | 1.5s | ease-in-out |
| Expand/Collapse | ~400ms | spring(0.4, 0.8) |
| Quick action appear | 200ms | ease-out |
| Navigation | 400ms | ease-in-out |

---

*Patina — Where Time Adds Value*

**Document Version:** 1.0.0  
**Specification Status:** Implementation Ready  
**Last Updated:** January 2026
