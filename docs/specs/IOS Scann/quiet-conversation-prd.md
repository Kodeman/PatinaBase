# PRD: The Quiet Conversation — Room Scan & Style Discovery Redesign

**Product:** Patina iOS App  
**Feature:** Room Scan + Style Discovery Flow  
**Version:** 2.0 (Redesign)  
**Author:** Patina Product Team  
**Date:** April 2026  
**Status:** Ready for Implementation  
**Target Agent:** Claude Code  

---

## 1. Executive Summary

### 1.1 What This Is

A complete redesign of the Patina iOS app's room scanning and style discovery experience. The current design interleaves style quiz questions with the RoomPlan scanning session, creating jarring pauses and cognitive dissonance. This redesign separates the two activities into a sequential flow: an unbroken scan followed by a post-scan style conversation and a style profile reveal.

### 1.2 Design Name

**"The Quiet Conversation"** — the experience is structured as three movements: The Walk (scan), The Conversation (style discovery), and The Reveal (style profile output).

### 1.3 Core Design Principle

**Separate the body from the mind.** Scanning is a physical act requiring spatial awareness. Style discovery is an emotional act requiring aesthetic reflection. They should not compete for the user's attention simultaneously.

### 1.4 Key Innovation: The Whisper Bar

A single-line text element at the bottom of the scan view that replaces progress ribbons, coaching overlays, percentage indicators, and state labels. It speaks in Playfair Display italic — a warm guide, not a command interface.

---

## 2. Technical Context

### 2.1 Platform & Framework

- **Platform:** iOS 17+
- **Language:** Swift 5.9+
- **UI Framework:** SwiftUI
- **AR Framework:** RoomPlan API (RoomCaptureSession, RoomCaptureView)
- **AR Rendering:** RealityKit (for post-scan AR placement, not part of this PRD)
- **Device Requirement:** iPhone 12 Pro or later (LiDAR-equipped) for full scan experience
- **Fallback:** Non-LiDAR devices get manual room entry + identical style conversation

### 2.2 Dependencies

- **Supabase Auth:** User must be authenticated before entering scan flow
- **Aesthete Engine API:** POST endpoint for style profile scoring
- **Object Storage (R2/Minio):** For USDZ mesh upload
- **PostHog:** Analytics event tracking

### 2.3 Monorepo Context

This feature lives in the iOS app package within the `strata` Turborepo monorepo. The Aesthete Engine API endpoint is served by the FastAPI sidecar service. Room scan data is stored in Supabase PostgreSQL with mesh files in Cloudflare R2.

---

## 3. User Flow Architecture

### 3.1 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTRY POINT                               │
│  Home Screen → "Scan a Room" button                          │
│  OR: Onboarding completion → first scan prompt               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─── LiDAR Check ───┐                                      │
│  │                    │                                      │
│  ▼ YES               ▼ NO                                   │
│                                                              │
│  MOVEMENT 1:          FALLBACK:                              │
│  The Walk             Manual Room Entry                      │
│  ┌──────────┐         ┌──────────────┐                       │
│  │ Threshold │         │ Room Type     │                      │
│  │ (0%)      │         │ Dimensions    │                      │
│  │    ↓      │         │ Windows/Doors │                      │
│  │ Early     │         └──────┬───────┘                       │
│  │ (0-25%)   │                │                               │
│  │    ↓      │                │                               │
│  │ Mid       │                │                               │
│  │ (25-55%)  │                │                               │
│  │    ↓      │                │                               │
│  │ Late      │                │                               │
│  │ (55-90%)  │                │                               │
│  │    ↓      │                │                               │
│  │ Complete  │                │                               │
│  │ (90-100%) │                │                               │
│  └──────┬───┘                │                               │
│         │                    │                               │
│         ▼                    ▼                               │
│  ┌──────────────────────────────┐                            │
│  │ TRANSITION: The Soft Landing │ ← 1.2s non-interactive     │
│  │ "Now let's talk about you."  │                            │
│  └──────────────┬───────────────┘                            │
│                 ▼                                            │
│  MOVEMENT 2: The Conversation                                │
│  ┌──────────────────────┐                                    │
│  │ Q1: Visual Resonance  │ ← Image grid, single select      │
│  │          ↓             │                                   │
│  │ Q2: Lifestyle Reality  │ ← Text pills, multi-select      │
│  │          ↓             │                                   │
│  │ Q3: Material Connection│ ← Swatch grid, select ≤3        │
│  │          ↓             │                                   │
│  │ Q4: Investment         │ ← Type list, single select      │
│  │          ↓             │                                   │
│  │ Q5: The Priority       │ ← Card stack, single select     │
│  └──────────┬─────────────┘                                  │
│             ▼                                                │
│  ┌───────────────────────────────┐                           │
│  │ PAUSE: "Let me think..."     │ ← 1.2s + API call         │
│  └──────────────┬────────────────┘                           │
│                 ▼                                            │
│  MOVEMENT 3: The Reveal                                      │
│  ┌──────────────────────┐                                    │
│  │ Named Aesthetic       │                                    │
│  │ Spectrum Visualization│                                    │
│  │ Style Tags            │                                    │
│  │ CTA: See What Fits    │                                    │
│  └──────────┬────────────┘                                   │
│             ▼                                                │
│  ┌──────────────────────┐                                    │
│  │ Floor Plan Preview    │                                    │
│  │ Confirm or Rescan     │                                    │
│  └──────────┬────────────┘                                   │
│             ▼                                                │
│  → Recommendations View (separate PRD)                       │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Edge Case Flows

```
During The Walk:
  Low Light detected    → Whisper adapts, scan auto-pauses, torch toggle appears
  Movement too fast     → Whisper adapts, haptic warning, persists until stable
  Feature loss          → Whisper adapts, brief coaching arrow
  Room too large        → Whisper adapts, boundary indicator, section scan mode
  30s idle              → Whisper adapts, "Finish with this" / "Keep going" options
  Pause button tapped   → Frosted overlay: Resume / Finish / Start Over
  App backgrounded      → Scan session preserved for 60s, then auto-saved
  Network offline       → Scan works offline, upload queued, style questions work offline
```

---

## 4. Screen Specifications

### 4.1 Screen 01: The Threshold

**Purpose:** Camera fade-in. The scan begins.

**Layout:**
- Full-screen AR camera view via `RoomCaptureView` embedded in SwiftUI `ZStack`
- Dynamic Island area clear
- Status bar: white text (dark mode)
- Whisper Bar anchored to bottom

**Visual Specifications:**
- Camera feed has 5% Clay Beige (#A3927C) color overlay applied via `Color.clay.opacity(0.05)` over the entire AR view
- Background transition: 0.8s fade from solid black to live camera, `easeOut`
- No grain effect, no floating particles (removed from v1 spec — too heavy for initial load)

**Whisper Bar State:**
- Text: "Let's walk your room together."
- Sub-text: "Move slowly to begin"
- Background: Off-White at 95% opacity, 24px backdrop blur
- Corner radius: 24px top-left, 24px top-right, 0 bottom
- Padding: 20px horizontal, 20px top, 38px bottom (accounts for home indicator)
- Text: Playfair Display 17px Regular Italic, color Charcoal
- Sub: DM Mono 10px, uppercase, 0.06em tracking, color Clay

**Behavior:**
- `RoomCaptureSession` is initialized but not running
- Session begins automatically when ARKit detects device movement (acceleration > threshold)
- No "Start Scan" button — movement IS the trigger
- ARCoachingOverlay is suppressed (`coachingOverlay.activatesAutomatically = false`)

**Haptics:** None — stillness before motion

**Analytics Event:**
```swift
Analytics.track("scan_threshold_entered", properties: [
    "device_model": UIDevice.current.model,
    "has_lidar": true,
    "room_context": previousRoomType ?? "unknown"
])
```

---

### 4.2 Screens 02–06: The Walk (Scan States)

**Purpose:** Unbroken room scan with evolving Whisper Bar guidance.

**Shared Layout (all scan states):**
- Full-screen AR view (RoomCaptureView)
- Scan HUD: top-left, below Dynamic Island (60px from top, 20px from left)
- Scan Controls: top-right, aligned with HUD (60px from top, 20px from right)
- Whisper Bar: bottom-anchored (same spec as Threshold)

**Scan HUD Component:**
```
┌─────────────────────────────┐
│  [Progress Ring] [Label]     │  ← 36px ring + mono label
└─────────────────────────────┘
```
- Progress Ring: 36px diameter, 2.5px stroke
  - Track: Clay at 25% opacity
  - Fill: Clay at 100%, animated clockwise
  - At 100%: crossfade to checkmark icon (0.3s)
- Label: DM Mono 10px, uppercase, color white at 60% opacity
  - States: "Scanning" (0–89%) → percentage at 25/50/75 thresholds → "Complete" (100%)

**Scan Controls Component:**
```
┌─────────┐  ┌─────────┐
│    ⏸    │  │    ?    │
└─────────┘  └─────────┘
```
- 36px diameter circles
- Background: white at 12% opacity, 10px backdrop blur
- Border: white at 10% opacity, 1px
- Icon: SF Symbol, white at 70%, 14px
- Pause: `pause.fill` — opens Pause Menu overlay
- Help: `questionmark` — triggers brief coaching animation (reshow wall-tracking arrows for 3s)

**AR Geometry Overlay:**
Detected planes rendered as faint lines and fills overlaid on the AR view.

| Element | Specification |
|---------|---------------|
| Wall lines | 1px, Clay at 20% opacity (unconfirmed) / 40% (confirmed) |
| Corner dots | 8px diameter, Clay fill, 16px glow (box-shadow equivalent), 2.4s pulse animation |
| Floor plane fill | Clay at 3% opacity over detected floor area |
| Furniture outlines | Dashed, 1px, Clay at 15% opacity |

**Whisper Bar Progression:**

| Progress | Text | Haptic | Sub-text |
|----------|------|--------|----------|
| 0% (Threshold) | "Let's walk your room together." | None | "Move slowly to begin" |
| ~15% | "That's it. Nice and slow." | `.soft` | "Keep moving · Walls detected" |
| ~35% | "Beautiful. Step toward the window now." | None | "35% captured · Keep going" |
| ~55% | "I can see this room taking shape." | `.soft` | "50% captured · Keep going" |
| ~75% | "Almost there. Just the far corner." | None | "75% captured" |
| ~90% | "Perfect. Let me take one more look…" | `.medium` | "Finalizing" |
| 100% | "Your room is captured. Now let's talk about you." | `.success` (UINotificationFeedbackGenerator) | "Scan complete · Style discovery begins" |

**Whisper Text Transition:**
- Crossfade animation: 0.4s ease-in-out
- Old text fades out while new text fades in simultaneously
- Text should never "snap" — always animate

**Progress-to-Text Mapping Logic:**
```swift
struct WhisperState {
    let progress: Float // 0.0 - 1.0
    let text: String
    let subtext: String
    let haptic: HapticType?
    
    static func forProgress(_ p: Float) -> WhisperState {
        switch p {
        case 0..<0.10:
            return WhisperState(progress: p, text: "Let's walk your room together.", subtext: "Move slowly to begin", haptic: nil)
        case 0.10..<0.25:
            return WhisperState(progress: p, text: "That's it. Nice and slow.", subtext: "Keep moving · Walls detected", haptic: .soft)
        case 0.25..<0.45:
            return WhisperState(progress: p, text: "Beautiful. Step toward the window now.", subtext: "\(Int(p*100))% captured · Keep going", haptic: nil)
        case 0.45..<0.65:
            return WhisperState(progress: p, text: "I can see this room taking shape.", subtext: "\(Int(p*100))% captured · Keep going", haptic: .soft)
        case 0.65..<0.85:
            return WhisperState(progress: p, text: "Almost there. Just the far corner.", subtext: "\(Int(p*100))% captured", haptic: nil)
        case 0.85..<0.95:
            return WhisperState(progress: p, text: "Perfect. Let me take one more look…", subtext: "Finalizing", haptic: .medium)
        default:
            return WhisperState(progress: p, text: "Your room is captured. Now let's talk about you.", subtext: "Scan complete · Style discovery begins", haptic: .success)
        }
    }
}
```

**Important:** The haptic should fire ONCE per threshold crossing, not continuously. Track which thresholds have fired in a `Set<Float>`.

**RoomPlan Session Configuration:**
```swift
let config = RoomCaptureSession.Configuration()
// Do NOT enable:
// - config.isCoachingEnabled (we use Whisper Bar instead)
// Session runs continuously — no pause/resume
```

**Scan Quality Threshold:** Session auto-completes when `progress >= 0.95` for 2 consecutive seconds. This prevents premature completion from momentary progress spikes.

---

### 4.3 Screens 05–07: Edge Case States

**Purpose:** Graceful handling of scan issues without breaking the flow.

#### 4.3.1 Low Light (<50 lux)

**Detection:** `ARFrame.lightEstimate.ambientIntensity < 50`

**Behavior:**
1. Scan auto-pauses (`roomCaptureSession.pause()` — this is the ONLY acceptable pause in the flow)
2. Whisper Bar text changes: "Try a light switch — I'll wait."
3. Edge Toast appears above Whisper Bar with torch toggle
4. On adequate light restored OR torch enabled, scan auto-resumes

**Edge Toast Component:**
```
┌─────────────────────────────────────────┐
│  [💡]  Let's brighten things up          │
│        The room needs a bit more light.  │
│        Toggle flashlight →               │
└─────────────────────────────────────────┘
```
- Position: absolute, bottom 120px, left/right 20px
- Background: Off-White at 95%, 16px backdrop blur
- Border radius: 16px
- Padding: 16px 20px
- Icon: 32px circle, amber tint background
- Title: Playfair Display 15px Medium
- Body: Inter 12px Regular, color Mocha
- Action: Inter 12px SemiBold, color Charcoal

#### 4.3.2 Movement Too Fast

**Detection:** ARFrame tracking state degrades, or RoomCaptureSession reports tracking quality below threshold

**Behavior:**
1. Scan continues but may produce lower quality data
2. Whisper Bar text changes: "Easy does it. The room isn't going anywhere."
3. HUD label changes to "Slow down" in Terracotta color
4. Haptic: `.rigid` warning
5. Persists until tracking stabilizes, then whisper returns to normal progression

#### 4.3.3 Feature Loss

**Detection:** ARCamera.trackingState == .limited(reason: .insufficientFeatures)

**Behavior:**
1. Whisper Bar: "Point toward something with texture — a bookshelf, a rug."
2. Brief directional arrow animation (3s) pointing toward nearest textured surface if detectable
3. Auto-clears when tracking resumes

#### 4.3.4 Room Too Large

**Detection:** Detected floor area exceeds 30ft × 30ft (RoomPlan limitation)

**Behavior:**
1. Whisper Bar: "That's a lot of space. Let's focus on this area first."
2. Soft boundary indicator: faint circle on floor plane showing recommended scan zone
3. Enable section-by-section scanning — each section saves as a sub-room linked to the parent

#### 4.3.5 Idle (>30 seconds no movement)

**Detection:** No significant device movement for 30 seconds (accelerometer)

**Behavior:**
1. Whisper Bar: "Still here. Take your time."
2. After 5 more seconds, Whisper Bar expands with two buttons:
   - "Finish with this" (primary, Charcoal) — accepts partial scan, transitions to Conversation
   - "Keep going" (secondary, bordered) — dismisses, continues scan
3. Sub-text: "30 seconds idle"

### 4.4 Screen 08: Pause Menu Overlay

**Trigger:** Pause button (⏸) tapped during scan

**Layout:**
- Full-screen frosted overlay: Charcoal at 92%, 20px backdrop blur
- Content vertically centered, 32px horizontal padding
- Title: Playfair Display 28px Regular, color Off-White
- Options: Inter 16px Regular, color Pearl, separated by 1px dividers at Clay 20%
- Destructive option: Terracotta color

**Options:**
1. **"Resume Scanning"** — dismisses overlay, session continues
2. **"Finish With What We Have"** — accepts partial scan data, transitions to Soft Landing → Conversation
3. **"Start Over"** (destructive) — clears session, returns to Threshold

**Dismiss:** Tap outside options area or swipe down

---

### 4.5 Screen 09: The Soft Landing (Transition)

**Purpose:** 1.2-second non-interactive transition between Walk and Conversation.

**Animation Sequence:**
```
T=0.0s:  Final whisper ("Your room is captured...") visible
T=0.2s:  AR geometry fades out (0.3s duration)
T=0.4s:  Transition text fades in: "Now let's talk about you."
         Playfair Display 22px Italic, Charcoal, centered, 80% opacity
T=0.4s:  Background begins crossfade: AR view → Off-White (0.8s duration)
T=0.8s:  Scan HUD and controls fade out
T=1.0s:  Transition text begins fade out (0.2s)
T=1.2s:  Q1 (Visual Resonance) slides up from bottom (0.4s, spring easing)
```

**Background Processing (concurrent):**
- Room scan USDZ mesh data begins uploading to R2 storage
- Room metadata (dimensions, features) POSTs to API
- These run in background — user sees no loading indicators

**Haptics:** None — complete stillness during transition

---

### 4.6 Screens 10–14: The Conversation (Questions 1–5)

**Shared Conversation Screen Architecture:**

```swift
struct ConversationView: View {
    @StateObject var viewModel: ConversationViewModel
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 0) {
                // Whisper top (evolves per question)
                Text(viewModel.whisperTop)
                    .font(.custom("DMMono-Regular", size: 10))
                    .tracking(0.6)
                    .textCase(.uppercase)
                    .foregroundColor(.clay)
                    .padding(.bottom, 20)
                
                // Question text
                Text(viewModel.questionText)
                    .font(.custom("PlayfairDisplay-Italic", size: 26))
                    .foregroundColor(.charcoal)
                
                // Sub-text (optional)
                if let sub = viewModel.subText {
                    Text(sub)
                        .font(.custom("Inter-Light", size: 13))
                        .foregroundColor(.agedOak)
                        .padding(.top, 8)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 66) // Below Dynamic Island
            
            // Question-specific content
            viewModel.questionView
                .padding(.top, 24)
            
            Spacer()
            
            // Footer (Continue button, if applicable)
            if viewModel.showContinueButton {
                ContinueButton(enabled: viewModel.hasValidSelection)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 42) // Above home indicator
            }
        }
        .background(Color.offWhite)
    }
}
```

**Whisper Top Text Per Question:**

| Question | Whisper Top Text |
|----------|-----------------|
| Q1 | "Your room is captured · Let's discover your style" |
| Q2 | "Keep going — you're doing great" |
| Q3 | "Almost there" |
| Q4 | "One more thought" |
| Q5 | "Last one" |

**Question Transitions:**
- Between questions: 0.3s crossfade with 20px vertical offset
- Direction: new question slides up, old slides up and fades
- Use `matchedGeometryEffect` for the whisper top text

---

#### 4.6.1 Question 1: Visual Resonance

**Question:** "Which room speaks to you?"

**Interface:** 2×2 image grid

**Specifications:**
- Grid: 2 columns, 8px gap
- Cell corner radius: 12px
- Cell aspect ratio: ~1:1 (fills available space evenly)
- Images: must be curated photographs, loaded from asset catalog or CDN
- Labels: Hidden by default. On selection, label fades in (Inter 11px SemiBold, white, text-shadow)

**Image Attribute Scoring (hidden from user):**
```swift
struct ImageAttributes {
    let warmth: Float      // -1 to 1
    let complexity: Float  // -1 to 1
    let formality: Float   // -1 to 1
    let era: Float         // -1 to 1 (negative = modern, positive = traditional)
}

let imageScores: [String: ImageAttributes] = [
    "warm_minimal":    ImageAttributes(warmth: 0.7, complexity: -0.5, formality: -0.3, era: -0.2),
    "cool_modern":     ImageAttributes(warmth: -0.6, complexity: -0.7, formality: 0.3, era: -0.8),
    "layered_comfort": ImageAttributes(warmth: 0.8, complexity: 0.6, formality: 0.5, era: 0.7),
    "curated_mix":     ImageAttributes(warmth: 0.2, complexity: 0.8, formality: -0.2, era: 0.3)
]
```

**Selection Behavior:**
- Single select
- Selected cell: 3px Charcoal ring, scale(0.97) with spring animation
- Non-selected cells: opacity reduces to 0.6
- Haptic: `.light`
- Auto-advance: 0.6s after selection, crossfade to Q2

**No Continue button** — auto-advance on selection

---

#### 4.6.2 Question 2: Lifestyle Reality

**Question:** "How do you actually live in this space?"  
**Sub-text:** "Select all that apply"

**Interface:** Tappable pill buttons in flex-wrap layout

**Options (6 pills):**

| Label | Icon | Hidden Measurements |
|-------|------|-------------------|
| "Love having people over" | 🍷 | Social orientation, durability need |
| "My quiet sanctuary" | 🧘 | Private orientation, calm aesthetic |
| "Work from this room" | 💻 | Functional need, desk space |
| "Family central" | 👨‍👩‍👧 | Durability, storage, flexibility |
| "Personal retreat" | 📚 | Personal expression, comfort |
| "Entertainment hub" | 🎬 | Media furniture, seating quantity |

**Pill Specifications:**
- Padding: 14px vertical, 18px horizontal
- Border radius: 16px
- Border: 1.5px solid Pearl
- Background (default): Soft Cream
- Background (selected): Charcoal, text Off-White, border Charcoal
- Font: Inter 14px Regular
- Icon: 18px emoji, 8px gap from text

**Selection Behavior:**
- Multi-select (toggle on/off)
- Minimum 1 selection required to enable Continue button
- Haptic: `.light` on each toggle
- Continue button: Charcoal, 52px height, 26px radius, full-width

---

#### 4.6.3 Question 3: Material Connection

**Question:** "What texture calls to you?"  
**Sub-text:** "Choose up to three"

**Interface:** 2×3 material swatch grid (full-bleed within content area)

**Swatches (6 materials):**

| Material | Background | Hidden Measurements |
|----------|------------|-------------------|
| Weathered Oak | Macro photo of aged wood grain | Natural preference, patina appreciation |
| Smooth Marble | Macro photo of marble veining | Refined preference, formality |
| Aged Leather | Macro photo of leather patina | Warmth, durability, heritage |
| Soft Linen | Macro photo of linen weave | Comfort, casualness |
| Woven Rattan | Macro photo of rattan texture | Natural, casual, tropical |
| Brushed Metal | Macro photo of brushed steel | Modern, industrial, coolness |

**Grid Specifications:**
- 2 columns, 3 rows, 3px gap
- Outer container: 16px corner radius, overflow hidden
- Each swatch fills its cell completely (no padding)
- Label: Inter 11px SemiBold, white, text-shadow, bottom-left aligned (14px padding)

**Selection Indicator:**
- Selected swatch: 3px white border with 1.5px Charcoal inset (double border effect)
- Checkmark badge: 22px circle, Charcoal background, white checkmark (11px), positioned top-right (10px inset)
- Maximum 3 selections. On 4th tap: shake animation on the 4th swatch, no selection applied

**Haptic:** `.rigid` on each selection (tactile — feels like pressing into material)

**Continue button required** (appears after ≥1 selection)

---

#### 4.6.4 Question 4: Investment Perspective

**Question:** "Let's talk about investment."  
**Sub-text:** "What feels right for this room?"

**Interface:** Vertical type-forward list

**Tiers (4 rows):**

| Name | Description | Range | Flag |
|------|-------------|-------|------|
| Thoughtful Starter | "Smart finds that punch above their price" | $500 – $2,000 | budget_starter |
| Curated Comfort | "Quality pieces that last" | $2,000 – $5,000 | budget_mid |
| Heirloom Investment | "Pieces you'll pass down" | $5,000+ | budget_premium |
| Let's Discuss | "Connect with a designer" | Designer Led | budget_designer → triggers designer lead funnel |

**Row Specifications:**
- Padding: 20px vertical
- Dividers: 1px Pearl (top and bottom borders)
- Name: Playfair Display 18px Regular, color Charcoal
- Description: Inter 12px Light, color Aged Oak, 4px margin-top
- Range: DM Mono 11px, uppercase, 0.04em tracking, color Clay, right-aligned
- Selected row: Name weight increases to 600, bottom border becomes Charcoal, filled indicator circle (20px, Charcoal) appears far right

**"Let's Discuss" row:**
- Name rendered in italic to differentiate
- If selected: `flagForDesignerLead = true` in `StyleResponseModel`
- After the Reveal, the CTA changes to "Talk to a Designer" instead of "See What Fits"

**Selection:** Single select, `.light` haptic

---

#### 4.6.5 Question 5: The Priority

**Question:** "What would change everything?"

**Interface:** Vertical card stack

**Options (4 cards — contextual to detected room type):**

**Living Room options:**

| Label | Sub-text | Hidden Measurement |
|-------|----------|--------------------|
| "A place to gather" | "Somewhere people want to sit and stay" | Social seating need |
| "A piece that anchors" | "Something that makes the room make sense" | Statement furniture need |
| "Better light" | "Warmth that changes how it feels to be here" | Lighting focus |
| "More room to breathe" | "Less clutter, more calm" | Minimalism/storage need |

**Bedroom options (alternative set):**

| Label | Sub-text |
|-------|----------|
| "A place to truly rest" | "Comfort that invites you in" |
| "A piece that anchors" | "Something that defines the room" |
| "Better light" | "Morning light, evening calm" |
| "More room to breathe" | "Space to think, space to be" |

**Card Specifications:**
- Padding: 20px vertical, 22px horizontal
- Border radius: 16px
- Border: 1.5px solid Pearl
- Background (default): Soft Cream
- Background (selected): Charcoal, text Off-White
- Label: Playfair Display 16px Regular
- Sub-text: Inter 12px Light, color Aged Oak (default) / Pearl (selected), 4px margin-top
- Vertical gap between cards: 12px

**Selection Behavior:**
- Single select
- Haptic: `.medium` (feels conclusive — this is the last question)
- Auto-advance: 0.8s after selection, transition to Contemplative Pause (no Continue button)

---

### 4.7 Screen 15: The Contemplative Pause

**Purpose:** Emotional buffer between Conversation and Reveal. Aesthete Engine API call happens here.

**Layout:**
- Full screen, Off-White background
- Content vertically and horizontally centered
- Text: "Let me think about this." — Playfair Display 20px Italic, Charcoal at 60% opacity
- Three dots below text: 4px diameter, Clay fill, 6px gap, staggered fade animation (1.5s loop, 0.3s delay between dots)

**Duration Logic:**
```swift
let apiTask = Task {
    return try await aestheteEngine.score(styleResponse)
}

// Minimum pause: 1.2 seconds
let minimumPause = Task { try await Task.sleep(nanoseconds: 1_200_000_000) }

// Wait for BOTH to complete
let (profile, _) = try await (apiTask.value, minimumPause.value)

// If API is slow, dots keep pulsing naturally
// No spinner. No progress bar. Just contemplative dots.
```

**API Call:**
```swift
// POST /api/aesthete/score
struct StyleScoreRequest: Codable {
    let userId: String
    let roomId: String
    let responses: StyleResponseModel
}

struct StyleResponseModel: Codable {
    let visualResonance: String      // "warm_minimal" | "cool_modern" | "layered_comfort" | "curated_mix"
    let lifestyleFactors: [String]   // ["entertaining", "work_from_home", ...]
    let materialPreferences: [String] // ["weathered_oak", "aged_leather", ...]  (max 3)
    let investmentTier: String       // "starter" | "mid" | "premium" | "designer"
    let priority: String             // "gathering" | "anchor" | "light" | "breathing_room"
    let flagForDesignerLead: Bool
}

struct StyleProfileResponse: Codable {
    let profileId: String
    let aestheticName: String        // "Modern Warmth"
    let spectrumValues: [Float]      // 5 values, 0-1 each
    let tags: [String]               // ["Natural Materials", "Clean Lines", ...]
    let confidence: Float            // 0-1
    let matchingProducts: Int        // Count of products matching this profile
}
```

---

### 4.8 Screen 16: The Reveal

**Purpose:** Present the Aesthete Engine's style profile output.

**Layout:**
- Full screen, Charcoal background
- Content centered vertically with CTA at bottom

**Top Section (centered):**
- Engine label: "The Aesthete Engine" — DM Mono 10px, uppercase, 0.1em tracking, Clay
- Style name: Playfair Display 42px Weight 300, Off-White, centered, line-height 1.15
  - Animation: Characters fade in sequentially (letter-by-letter), 0.8s total duration
  - This creates the "Polaroid developing" effect
- Spectrum: 5 segments, 6px height, 4px gap, 200px total width, centered
  - Colors: Clay, Sage, Dusty Blue, Terracotta, Golden Hour
  - Each segment width proportional to `spectrumValues` from API response
  - Animation: segments grow from 0 width to final width, staggered 0.1s
- Tags: Pill buttons with 1px Clay border at 35% opacity
  - Font: Inter 12px Regular, Pearl
  - Padding: 7px vertical, 16px horizontal
  - Border radius: 20px
  - 8px gap between tags
  - Animation: staggered fade-in, 0.1s delay per tag

**Bottom Section (anchored):**
- Primary CTA: "See What Fits Your Space"
  - Full-width, 56px height, 28px radius
  - Background: Clay, text Off-White
  - Font: Inter 15px Medium, 0.02em tracking
  - If `flagForDesignerLead == true`: text changes to "Talk to a Designer"
- Secondary link: "or explore your style profile →"
  - Inter 12px Regular, Aged Oak, centered, 14px margin-top
- Bottom padding: 42px (above home indicator)

**Named Aesthetics (Aesthete Engine output vocabulary):**

The API should return one of these named aesthetics based on the five-answer profile:

| Name | Primary Attributes |
|------|-------------------|
| Modern Warmth | Clean lines + natural materials + warm tones |
| Heritage Comfort | Traditional elements + layered textures + rich colors |
| Curated Minimal | Restrained palette + intentional objects + negative space |
| Natural Living | Organic materials + earth tones + casual comfort |
| Urban Refuge | Industrial touches + cozy elements + functional layout |
| Collected Character | Mixed periods + personal objects + story-rich pieces |
| Quiet Luxury | Premium materials + understated design + refined details |
| Scandinavian Soul | Light wood + white space + functional beauty |
| Artisan Modern | Handcrafted elements + modern forms + material honesty |
| Lived-In Elegance | Quality basics + soft textures + effortless beauty |
| Bold Composition | Strong color + statement pieces + confident mixing |
| Pastoral Calm | Country references + natural light + gentle textures |

---

### 4.9 Screen 17: Floor Plan Preview

**Purpose:** Validate scan accuracy before entering recommendations.

**Layout:**
- Off-White background
- Header: same Conversation header style
  - Whisper top: "Your space"
  - Question: "Here's what I see." (Playfair 22px Italic)
- Floor Plan Visualization: centered, 2D outline
  - Room outline: 2px Charcoal border, 4px corner radius
  - Dimensions: DM Mono 11px labels at edges
  - Windows: Dusty Blue accent lines on wall edges
  - Doors: Sage accent lines with arc indicator
  - Detected furniture: dashed-border rectangles, Clay at 15% fill
- Stats row: three metrics in horizontal layout
  - Value: Playfair Display 24px Medium, Charcoal
  - Label: DM Mono 9px, uppercase, Clay
  - Metrics: Square footage, Window count, Items detected
  - Separated by 1px Pearl dividers
- Action buttons:
  - Primary: "This Looks Right" — Charcoal, 52px height, 26px radius, flex: 1
  - Secondary: "Rescan" — bordered, 52px height, 26px radius, auto width

**Behavior:**
- "This Looks Right" → transitions to Recommendations view (separate feature)
- "Rescan" → returns to Threshold, clears current scan data

---

### 4.10 Screen 18: Non-LiDAR Fallback

**Purpose:** Manual room entry for devices without LiDAR.

**Detection:**
```swift
let hasLiDAR = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
```

**Layout:**
- Off-White background, Conversation header style
- Whisper top: "Tell us about your space"
- Question: "What kind of room?" (Playfair 22px Italic)

**Room Type Grid:**
- 3 columns, 8px gap
- Chips: 12px radius, 1.5px Pearl border, Soft Cream background
  - Selected: Charcoal background, Off-White text
  - Icon: 20px emoji, centered above 12px label
  - Padding: 12px vertical, 8px horizontal
- Options: Living 🛋, Bedroom 🛏, Dining 🍽, Office 💻, Kitchen 🍳, Other ✨

**Dimension Inputs:**
- Section label: "Room Dimensions" — DM Mono 10px, uppercase, Clay
- Two inputs side-by-side: Length and Width
  - Input height: 48px, 12px radius, 1.5px Pearl border, Soft Cream background
  - Font: Inter 15px Regular, Charcoal
  - Padding: 0 16px
  - Filled state: Clay border
  - Sub-label: DM Mono 9px, uppercase, Clay, 4px margin-top
  - Unit toggle: "ft" / "m" (stored in UserDefaults)

**Feature Inputs:**
- Section label: "Windows & Doors"
- Two inputs: Windows count, Doors count
- Stepper or simple numeric input

**Continue Button:** "Continue to Style Discovery" — full-width, Charcoal, 52px

**After submission:** User enters Q1 (Visual Resonance). The same five questions flow identically. Room data is submitted as structured JSON instead of USDZ mesh.

```swift
struct ManualRoomData: Codable {
    let roomType: String
    let length: Float        // in feet
    let width: Float         // in feet
    let windowCount: Int
    let doorCount: Int
    let hasLidar: Bool       // false
}
```

---

## 5. Data Models

### 5.1 RoomScanSession

```swift
struct RoomScanSession: Codable {
    let sessionId: UUID
    let userId: String
    let startedAt: Date
    let completedAt: Date?
    let scanProgress: Float          // 0.0 - 1.0
    let scanQuality: Float           // 0.0 - 1.0
    let scanMethod: ScanMethod       // .lidar or .manual
    
    // LiDAR scan data
    let meshDataUrl: String?         // R2 URL for USDZ file
    let pointCloudUrl: String?       // R2 URL for PLY file
    
    // Extracted room data (both methods)
    let dimensions: RoomDimensions
    let features: RoomFeatures
    let detectedObjects: [DetectedObject]
    
    // Device info
    let deviceModel: String
    let osVersion: String
    let hasLidar: Bool
}

enum ScanMethod: String, Codable {
    case lidar
    case manual
}

struct RoomDimensions: Codable {
    let length: Float    // meters
    let width: Float     // meters
    let height: Float?   // meters (LiDAR only)
    let area: Float      // square meters
}

struct RoomFeatures: Codable {
    let windowCount: Int
    let doorCount: Int
    let hasFireplace: Bool
    let roomType: String
}

struct DetectedObject: Codable {
    let category: String    // "sofa", "table", "chair", etc.
    let position: SIMD3<Float>
    let dimensions: SIMD3<Float>
    let confidence: Float
}
```

### 5.2 StyleProfile

```swift
struct StyleProfile: Codable {
    let profileId: String
    let userId: String
    let roomId: String
    let createdAt: Date
    
    // Raw responses
    let responses: StyleResponseModel
    
    // Aesthete Engine output
    let aestheticName: String
    let spectrumValues: [Float]      // 5 values
    let tags: [String]
    let confidence: Float
    
    // Derived attributes
    let warmth: Float                // -1 to 1
    let complexity: Float            // -1 to 1
    let formality: Float             // -1 to 1
    let era: Float                   // -1 to 1
    let budgetTier: String
    let functionalPriorities: [String]
    let materialPreferences: [String]
    let primaryNeed: String
    let flagForDesignerLead: Bool
}
```

---

## 6. Animation Specifications

### 6.1 Animation Inventory

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Threshold fade-in | 0.8s | easeOut | View appears |
| Whisper text crossfade | 0.4s | easeInOut | Progress threshold crossed |
| Corner dot pulse | 2.4s loop | easeInOut | Continuous during scan |
| AR geometry fade | 0.3s | easeOut | Plane confirmed/removed |
| Edge toast appear | 0.3s | spring(response: 0.4) | Error detected |
| Edge toast dismiss | 0.2s | easeIn | Error resolved |
| Soft Landing transition | 1.2s total | See sequence in §4.5 | Scan completes |
| Question crossfade | 0.3s | easeInOut | Question advances |
| Image selection ring | 0.2s | spring(response: 0.3) | Image tapped |
| Pill toggle | 0.15s | easeOut | Pill tapped |
| Swatch checkmark | 0.2s | spring(response: 0.3, dampingFraction: 0.7) | Swatch tapped |
| Budget indicator | 0.2s | easeOut | Row tapped |
| Priority card fill | 0.2s | easeOut | Card tapped |
| Contemplative dots | 1.5s loop | easeInOut | Continuous |
| Reveal name letters | 0.8s total | easeOut, staggered | Profile received |
| Reveal spectrum grow | 0.6s | spring(response: 0.5) | After name |
| Reveal tag fade-in | 0.3s each | easeOut, 0.1s stagger | After spectrum |
| Progress ring fill | Continuous | linear | Bound to scan progress |
| Ring → checkmark | 0.3s | spring | Progress == 100% |

### 6.2 SwiftUI Implementation Notes

Use `withAnimation` blocks, not implicit animations, for all state-driven transitions. This prevents unwanted animation cascades.

```swift
// Example: Whisper text transition
withAnimation(.easeInOut(duration: 0.4)) {
    currentWhisperText = newText
}

// Example: Reveal name letter-by-letter
ForEach(Array(aestheticName.enumerated()), id: \.offset) { index, char in
    Text(String(char))
        .opacity(revealProgress > Float(index) / Float(aestheticName.count) ? 1 : 0)
        .animation(.easeOut(duration: 0.1).delay(Double(index) * 0.05), value: revealProgress)
}
```

---

## 7. Haptic Specifications

| Context | Haptic Type | UIKit Implementation |
|---------|-------------|---------------------|
| Wall recognized (first) | Soft | `UIImpactFeedbackGenerator(style: .soft).impactOccurred()` |
| 50% progress | Soft | Same |
| 90% progress | Medium | `UIImpactFeedbackGenerator(style: .medium).impactOccurred()` |
| 100% complete | Success | `UINotificationFeedbackGenerator().notificationOccurred(.success)` |
| Movement too fast | Rigid | `UIImpactFeedbackGenerator(style: .rigid).impactOccurred()` |
| Q1 image select | Light | `UIImpactFeedbackGenerator(style: .light).impactOccurred()` |
| Q2 pill toggle | Light | Same |
| Q3 swatch select | Rigid | Rigid — feels like pressing material |
| Q4 budget select | Light | Light |
| Q5 priority select | Medium | Medium — feels conclusive |

---

## 8. Analytics Events

### 8.1 Required Events

```swift
// Scan lifecycle
"scan_threshold_entered"        // User enters scan view
"scan_started"                  // First device movement detected
"scan_progress_milestone"       // At 25%, 50%, 75% — includes milestone value
"scan_completed"                // Progress >= 95%, includes duration and quality
"scan_abandoned"                // User leaves scan without completing
"scan_paused"                   // Pause button tapped
"scan_resumed"                  // Resume from pause menu
"scan_partial_accepted"         // "Finish with what we have" selected

// Edge cases
"scan_edge_low_light"           // Low light detected
"scan_edge_fast_movement"       // Movement warning triggered
"scan_edge_feature_loss"        // Tracking lost
"scan_edge_idle"                // 30s idle reached
"scan_edge_room_too_large"      // Room exceeds limits

// Conversation lifecycle
"conversation_started"          // First question appears
"conversation_q1_answered"      // Visual Resonance — includes selection
"conversation_q2_answered"      // Lifestyle — includes selections array
"conversation_q3_answered"      // Materials — includes selections array
"conversation_q4_answered"      // Investment — includes tier
"conversation_q5_answered"      // Priority — includes selection
"conversation_completed"        // All 5 answered, includes total duration

// Reveal
"reveal_displayed"              // Style profile shown — includes aesthetic name
"reveal_cta_tapped"             // Primary CTA tapped
"reveal_profile_explored"       // Secondary "explore" link tapped

// Floor plan
"floorplan_displayed"           // Floor plan preview shown
"floorplan_accepted"            // "This Looks Right" tapped
"floorplan_rescan"              // "Rescan" tapped

// Fallback
"manual_entry_started"          // Non-LiDAR user enters manual flow
"manual_entry_completed"        // Manual dimensions submitted
```

### 8.2 Event Properties

Every event includes base context:
```swift
struct AnalyticsContext: Codable {
    let sessionId: String
    let userId: String
    let deviceModel: String
    let osVersion: String
    let appVersion: String
    let hasLidar: Bool
    let timestamp: Date
}
```

---

## 9. Accessibility

### 9.1 VoiceOver Support

- All UI elements must have proper accessibility labels
- Whisper Bar text is announced as it changes (use `AccessibilityNotification.Announcement`)
- Image grid (Q1): Each cell labeled with style name + "room photograph"
- Material swatches (Q3): Each labeled with material name
- Progress ring: Announces percentage at thresholds
- Scan guidance: Audio descriptions of coaching text

### 9.2 Dynamic Type

- All text respects Dynamic Type scaling
- Minimum touch target: 44×44pt for all interactive elements
- Layout adapts to larger text without truncation

### 9.3 Reduced Motion

- Check `UIAccessibility.isReduceMotionEnabled`
- If true: replace all animations with instant transitions
- Corner dot pulse: static (no animation)
- Reveal letter-by-letter: show all at once
- Contemplative dots: static

### 9.4 Color Contrast

- All text meets WCAG AA contrast ratios against its background
- Charcoal on Off-White: 9.5:1 ✓
- Clay on Off-White: 3.2:1 — use only for metadata, not primary content
- Off-White on Charcoal: 9.5:1 ✓

---

## 10. Performance Requirements

| Metric | Target |
|--------|--------|
| Threshold to camera visible | < 1s |
| Scan frame rate | 60fps (no drops during AR rendering) |
| Whisper text update latency | < 100ms from progress change |
| Question transition | < 300ms |
| Aesthete Engine API response | < 500ms p95 |
| Room data upload (background) | Complete before Reveal in 95% of cases |
| Memory during scan | < 300MB |
| Battery drain during 5-min scan | < 5% |

---

## 11. Testing Criteria

### 11.1 Scan Flow

- [ ] Camera fades in from black in 0.8s
- [ ] Whisper Bar shows "Let's walk your room together" initially
- [ ] Scan begins on device movement without button press
- [ ] Progress ring updates smoothly
- [ ] Whisper text transitions at correct thresholds
- [ ] Each whisper text haptic fires exactly once per threshold
- [ ] Scan completes at >= 95% progress held for 2s
- [ ] Completion triggers `.success` haptic
- [ ] AR view fades correctly during Soft Landing

### 11.2 Edge Cases

- [ ] Low light pauses scan and shows toast
- [ ] Torch toggle works from toast
- [ ] Fast movement shows warning, clears when stable
- [ ] 30s idle shows finish/continue options
- [ ] Pause menu shows 3 options
- [ ] "Finish with what we have" accepts partial scan
- [ ] "Start Over" clears session and returns to Threshold
- [ ] App backgrounding preserves session for 60s

### 11.3 Conversation

- [ ] Q1: Single select, auto-advance after 0.6s
- [ ] Q2: Multi-select, Continue enabled after 1+ selection
- [ ] Q3: Max 3 selections enforced, rigid haptic
- [ ] Q4: Single select, "Let's Discuss" flags designer lead
- [ ] Q5: Single select, auto-advance after 0.8s
- [ ] Whisper top text evolves per question
- [ ] Questions transition with crossfade animation

### 11.4 Reveal

- [ ] Contemplative pause holds minimum 1.2s
- [ ] API response arrives and is held if before 1.2s
- [ ] If API slow, dots continue naturally (no spinner)
- [ ] Style name appears letter-by-letter
- [ ] Spectrum segments animate proportionally
- [ ] Tags stagger in
- [ ] CTA text changes if designer lead flagged

### 11.5 Fallback

- [ ] Non-LiDAR devices skip directly to manual entry
- [ ] Room type grid works correctly
- [ ] Dimension inputs accept numeric values
- [ ] Unit toggle persists preference
- [ ] After manual entry, Q1-Q5 flow identically
- [ ] Reveal works the same as LiDAR path

---

## 12. File Structure

```
Sources/
  PatinaApp/
    Features/
      RoomScan/
        Views/
          ThresholdView.swift            // Screen 01
          ScanView.swift                 // Screens 02-06 (main scan)
          WhisperBarView.swift           // Shared whisper component
          ScanHUDView.swift              // Progress ring + controls
          EdgeToastView.swift            // Error state toasts
          PauseMenuView.swift            // Screen 08
          SoftLandingView.swift          // Screen 09 transition
        ViewModels/
          ScanViewModel.swift            // RoomCaptureSession management
          WhisperViewModel.swift         // Progress-to-text mapping
        
      StyleConversation/
        Views/
          ConversationContainerView.swift  // Parent container
          VisualResonanceView.swift        // Q1
          LifestyleRealityView.swift       // Q2
          MaterialConnectionView.swift     // Q3
          InvestmentPerspectiveView.swift   // Q4
          PriorityView.swift               // Q5
          ContemplativePauseView.swift      // Pause screen
        ViewModels/
          ConversationViewModel.swift       // Question flow state
        
      StyleReveal/
        Views/
          RevealView.swift                 // Screen 16
          FloorPlanPreviewView.swift       // Screen 17
        ViewModels/
          RevealViewModel.swift            // API response handling
        
      ManualEntry/
        Views/
          ManualRoomEntryView.swift         // Screen 18
        ViewModels/
          ManualEntryViewModel.swift
      
      Shared/
        Components/
          PillButton.swift                 // Reusable pill component
          SwatchCell.swift                 // Reusable swatch component
          ContinueButton.swift             // Reusable CTA button
        Models/
          RoomScanSession.swift
          StyleResponseModel.swift
          StyleProfile.swift
          WhisperState.swift
        Services/
          AestheteEngineService.swift      // API client
          RoomUploadService.swift          // Background upload
          HapticService.swift              // Centralized haptics
          AnalyticsService.swift           // Event tracking
```

---

## 13. API Endpoints

### 13.1 Room Scan Upload

```
POST /api/rooms/scans
Content-Type: multipart/form-data

Body:
  - roomId: string (UUID)
  - userId: string
  - scanMethod: "lidar" | "manual"
  - dimensions: JSON (RoomDimensions)
  - features: JSON (RoomFeatures)
  - detectedObjects: JSON (array of DetectedObject)
  - meshFile: USDZ binary (LiDAR only)
  - pointCloud: PLY binary (LiDAR only, optional)
  - deviceInfo: JSON
  - scanQuality: float

Response: 201
{
  "scanId": "uuid",
  "roomId": "uuid",
  "status": "processing",
  "estimatedCompletionMs": 2000
}
```

### 13.2 Style Profile Scoring

```
POST /api/aesthete/score
Content-Type: application/json

Body: StyleScoreRequest (see §4.7)

Response: 200
{
  "profileId": "uuid",
  "aestheticName": "Modern Warmth",
  "spectrumValues": [0.8, 0.3, 0.2, 0.5, 0.6],
  "tags": ["Natural Materials", "Clean Lines", "Warm Tones", "Lived-In"],
  "confidence": 0.87,
  "matchingProducts": 147
}
```

---

## 14. Open Questions

| Question | Impact | Owner |
|----------|--------|-------|
| Should the whisper text support localization from day one? | Copy architecture | Kody |
| Should we A/B test sequential vs. interleaved flows? | Requires both implementations | Kody |
| What happens if the user has already completed a style profile? | Skip conversation? Show "Update your style"? | Product |
| Should the Reveal show the number of matching products? | Expectation setting | Product |
| Material swatch photos — Leah's library or commission new? | Asset pipeline | Leah |
| Room type detection from scan — can RoomPlan infer this? | May eliminate Q5 room-type dependency | Engineering |

---

*End of PRD. This document is the single source of truth for the Room Scan & Style Discovery feature implementation. All design decisions reflected here supersede prior specifications in the UserJourney.md, ux-patterns.md, and iOS App Design Document.*
