# User Story: First Launch — Threshold to Walk

> **Module:** iOS Mobile App
> **Status:** Active
> **Started:** 2026-01
> **Completed:** —
>
> *Story ID: PAT-101 | Epic: Onboarding & First Experience | Priority: P0*

---

## Story Statement

**As a** first-time Patina user,  
**I want to** quickly move from opening the app into walking my first room,  
**So that** I experience Patina's magic immediately rather than answering questions before seeing value.

---

## Context & Rationale

### The Problem with Conversation-First

Traditional onboarding asks users to invest time answering questions before delivering value. This creates friction:

- Users don't know what they're answering questions *for*
- Abstract style questions feel disconnected from their actual space
- Drop-off risk is highest before the "aha moment"

### The Walk-First Philosophy

By inverting the flow, we:

1. **Deliver value immediately** — Users see AR magic in their own space within 60 seconds
2. **Ground conversation in reality** — Style questions emerge from what Patina observes in their actual room
3. **Build trust through competence** — Patina proves it "sees" their space before asking personal questions
4. **Create natural dialogue** — Conversation happens *during* the walk, not before it

### The New Mental Model

```
OLD: Tell us about yourself → We'll show you things
NEW: Let's see your space together → Now I understand you
```

---

## User Flow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   APP LAUNCH                                                        │
│       │                                                             │
│       ▼                                                             │
│   ┌─────────────────┐                                               │
│   │    THRESHOLD    │  "Every room tells a story"                   │
│   │   (Hold 2s)     │  Companion: Hidden                            │
│   └────────┬────────┘                                               │
│            │                                                        │
│            ▼                                                        │
│   ┌─────────────────┐                                               │
│   │  WALK INVITATION │  "Shall we walk your space together?"        │
│   │   (5 seconds)    │  Companion: First appearance                 │
│   └────────┬────────┘                                               │
│            │                                                        │
│            ▼                                                        │
│   ┌─────────────────┐                                               │
│   │ CAMERA PERMISSION│  System prompt (if needed)                   │
│   └────────┬────────┘                                               │
│            │                                                        │
│            ▼                                                        │
│   ┌─────────────────┐                                               │
│   │    THE WALK     │  AR scanning with woven conversation          │
│   │  (2-4 minutes)  │  Companion: Narrating + observing             │
│   └────────┬────────┘                                               │
│            │                                                        │
│            ▼                                                        │
│   ┌─────────────────┐                                               │
│   │  WALK COMPLETE  │  "I'm beginning to understand..."             │
│   │                 │  Style insights revealed                      │
│   └────────┬────────┘                                               │
│            │                                                        │
│            ▼                                                        │
│   ┌─────────────────┐                                               │
│   │ FIRST EMERGENCE │  Piece surfaces based on room + observations  │
│   └─────────────────┘                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Flow Specification

### Scene 1: The Threshold

**Duration:** Until user completes hold gesture (~2-3 seconds interaction)

**Screen State:**
- Full-screen atmospheric scene (room at current time of day)
- Subtle light animation (rays shifting slowly)
- No UI chrome, no navigation, no Companion

**Visual Elements:**
```
┌─────────────────────────────────┐
│                                 │
│     [Atmospheric room scene     │
│      with shifting light]       │
│                                 │
│                                 │
│       "Every room               │
│        tells a story."          │
│                                 │
│                                 │
│          ◯                      │
│    [Hold to begin]              │
│                                 │
└─────────────────────────────────┘
```

**Interaction:**
- User touches and holds anywhere on screen
- Progress ring fills around Strata Mark over 2 seconds
- Haptic pulse at 50% and 100%
- On completion: dissolve transition to Walk Invitation

**Companion State:** `hidden`

**Copy:**
- Main text: "Every room tells a story."
- Instruction: "Hold gently to begin"

**Audio:** None (ambient silence creates presence)

---

### Scene 2: Walk Invitation

**Duration:** 5-8 seconds (auto-advances or user taps)

**Purpose:** 
- Companion's first appearance
- Set expectation for what's about to happen
- Warm transition before camera permission

**Screen State:**
- Background softens/blurs slightly
- Companion fades in from bottom
- Single message from Patina

**Visual Elements:**
```
┌─────────────────────────────────┐
│                                 │
│     [Softened background]       │
│                                 │
│                                 │
│                                 │
│                                 │
│                                 │
│                                 │
├─────────────────────────────────┤
│  ═══════════════════            │
│    ═══════════════              │  ← Strata Mark fades in
│      ═══════════                │
│                                 │
│  "Shall we walk your space      │
│   together? I'd love to see     │
│   where you live."              │
│                                 │
│  [Let's walk]      [Not yet]    │
└─────────────────────────────────┘
```

**Companion State:** `expanded` (partial — message only, no input field)

**Companion Message:**
```
"Shall we walk your space together? 
 I'd love to see where you live."
```

**Actions:**
| Button | Behavior |
|--------|----------|
| "Let's walk" (primary) | → Camera permission (or Walk if granted) |
| "Not yet" | → Soft landing (room list, empty state) |

**Transition:**
- If "Let's walk": Check camera permission status
  - If not determined: Show system permission prompt
  - If granted: Transition directly to Walk
  - If denied: Show gentle explanation + settings link
- If "Not yet": Transition to empty Room List with Companion message

**Animation:**
- Companion slides up from bottom (spring, 400ms)
- Message fades in (200ms delay after Companion)
- Buttons fade in (100ms delay after message)

---

### Scene 3: Camera Permission

**Duration:** System-controlled

**Trigger:** Only shown if permission not yet determined

**Screen State:**
- Walk Invitation remains visible (dimmed)
- System permission dialog overlays

**Pre-Permission Context (shown before system dialog):**
```
┌─────────────────────────────────┐
│                                 │
│     [Softened background]       │
│                                 │
│                                 │
│         📷                      │
│                                 │
│   "To walk together, I'll       │
│    need to see through your     │
│    camera. I only look at       │
│    the shape of your space —    │
│    nothing personal."           │
│                                 │
│       [Continue]                │
│                                 │
│  Privacy: What Patina sees →    │
│                                 │
└─────────────────────────────────┘
```

**Copy:**
- Main: "To walk together, I'll need to see through your camera. I only look at the shape of your space — nothing personal."
- Link: "Privacy: What Patina sees →" (opens privacy explanation)

**After Permission Granted:**
- Transition immediately to Walk
- No confirmation screen (momentum matters)

**After Permission Denied:**
```
Companion message:
"No problem. When you're ready to walk, I'll be here. 
 You can enable camera access in Settings anytime."

Actions:
[Open Settings]  [Explore first]
```

---

### Scene 4: The Walk (First-Time Variant)

**Duration:** 2-4 minutes typical

**Purpose:**
- Capture room geometry via RoomPlan
- Weave in observational conversation
- Build style understanding through what Patina "notices"
- Create emotional connection through narration

**Screen State:**
- Full-screen AR camera view
- Minimal UI overlay
- Companion narration appears as floating text
- Subtle progress indication

#### 4.1 Walk Opening

**First 10 seconds after AR initializes:**

```
┌─────────────────────────────────┐
│ 9:41                    ●●● ⚡  │
│                                 │
│                                 │
│     [AR Camera View]            │
│                                 │
│                                 │
│                                 │
│                                 │
│   ┌─────────────────────────┐   │
│   │  "Let's begin. Move      │   │
│   │   slowly — I want to     │   │
│   │   take this in."         │   │
│   └─────────────────────────┘   │
│                                 │
│          ═══════════            │
│            ═══════              │
│              ═══                │
└─────────────────────────────────┘
```

**Narration Sequence (Opening):**
```
[0s]   "Let's begin."
[2s]   "Move slowly — I want to take this in."
[6s]   [Silence - user begins moving]
```

#### 4.2 Observation Phase

**During scanning (triggered by detected features):**

The Companion makes contextual observations based on what RoomPlan detects. These observations serve dual purposes:
1. Guide the user's scanning behavior
2. Begin building style understanding

**Observation Triggers & Responses:**

| Detection | Patina Says | Style Signal |
|-----------|-------------|--------------|
| Tall ceiling (>9ft) | "Tall ceilings... that opens possibilities." | Appreciates vertical space |
| Multiple windows | "Light from more than one direction. That's something special." | Values natural light |
| Large open area | "Room to breathe here. I like that." | Prefers open layouts |
| Corner nook | "I see a corner that wants something." | Notices intimate spaces |
| Hardwood visible | "Real wood floors. They've seen some life." | Appreciates natural materials |
| Bookshelf detected | "Books. Always a good sign." | Intellectual, layered |
| Fireplace | "A fireplace. The room has a heart." | Values warmth, gathering |
| Large window | "That window is doing a lot of work in here." | Light-focused |

**Observation Display:**
```
┌─────────────────────────────────┐
│                                 │
│   [AR View - wall detected]     │
│                                 │
│         ┌─ - - - - - -┐         │
│         :   WALL      :  ←───── Detection highlight
│         :  DETECTED   :         (subtle dashed line)
│         └─ - - - - - -┘         │
│                                 │
│   ┌─────────────────────────┐   │
│   │  "Light from more than   │   │
│   │   one direction. That's  │   │
│   │   something special."    │   │
│   └─────────────────────────┘   │
│                                 │
│          ═══════════            │
│            ═══════              │
│              ═══                │
└─────────────────────────────────┘
```

**Pacing Rules:**
- Minimum 8 seconds between observations
- Maximum 3 observations per minute
- Observations fade after 4 seconds
- Never interrupt user movement with urgent prompts

#### 4.3 Conversational Moments

**At natural pauses (user stops moving for >3 seconds), Patina may ask:**

These questions are woven into the walk, not a separate quiz:

```
[After ~45 seconds, if user pauses]
"This room — is it where you spend your mornings, or evenings?"
   [Mornings]  [Evenings]  [Both]

[After observing window light]
"That light... do you like it soft and diffused, or do you 
 let the sun pour in?"
   [Soft]  [Pour in]  [Depends on mood]

[After detecting seating area]  
"When you imagine yourself here, truly relaxed — 
 are you sitting up or sinking in?"
   [Sitting up]  [Sinking in]

[After ~2 minutes]
"What word comes to mind for this space? Not what it is, 
 but what you want it to feel like."
   [Text input field]
```

**Question Display:**
```
┌─────────────────────────────────┐
│                                 │
│   [AR View continues]           │
│                                 │
│                                 │
│                                 │
│                                 │
│                                 │
├─────────────────────────────────┤
│                                 │
│  "When you imagine yourself     │
│   here, truly relaxed —         │
│   are you sitting up or         │
│   sinking in?"                  │
│                                 │
│  [Sitting up]    [Sinking in]   │
│                                 │
│          ═══════════            │
│            ═══════              │
│              ═══                │
└─────────────────────────────────┘
```

**Question Rules:**
- Maximum 3 questions during first walk
- Questions only appear when user is stationary
- User can ignore (will fade after 10s)
- Answering is optional but enriches recommendations

#### 4.4 Guidance Prompts

**When user needs direction:**

| Situation | Patina Says |
|-----------|-------------|
| Stuck in one spot (>15s) | "Try moving toward that corner — I'm curious about it." |
| Scanning too fast | "Slower... I want to really see this." |
| Missing a wall | "I haven't seen that side yet. Mind turning?" |
| Good progress | "We're getting somewhere. Keep going." |
| Almost complete | "Nearly there. Just a bit more of that area." |

#### 4.5 Progress Indication

**No percentage shown.** Instead, organic indicators:

```
┌─────────────────────────────────┐
│                                 │
│   [AR View]                     │
│                                 │
│                         ┌─────┐ │
│                         │ ◐   │ │  ← Organic progress
│                         │     │ │     (fills like water)
│                         └─────┘ │
│                                 │
└─────────────────────────────────┘
```

**Progress States:**
- Empty circle: Just started
- Quarter filled: Getting started
- Half filled: Good progress
- Three-quarters: Almost there
- Full + glow: Complete

**Progress never goes backward** (even if tracking is lost temporarily)

#### 4.6 Walk Completion

**Trigger:** RoomPlan indicates sufficient coverage (>85%)

**Sequence:**

```
[Detection complete]
┌─────────────────────────────────┐
│                                 │
│   [AR View freezes briefly]     │
│                                 │
│                                 │
│                                 │
│       ✓                         │
│                                 │
│   "I think I have it."          │
│                                 │
│                                 │
│                                 │
└─────────────────────────────────┘
[Hold for 2 seconds]

[Transition to Walk Complete]
```

---

### Scene 5: Walk Complete

**Duration:** 15-30 seconds

**Purpose:**
- Celebrate completion
- Reveal what Patina learned (style signals)
- Transition to first Emergence

**Screen State:**
- AR view fades to soft room visualization (abstract/artistic)
- Companion expanded with reflection

**Visual:**
```
┌─────────────────────────────────┐
│                                 │
│   [Soft visualization of        │
│    scanned room - abstract      │
│    shapes, warm tones]          │
│                                 │
│                                 │
│                                 │
├─────────────────────────────────┤
│                                 │
│  "I'm beginning to understand   │
│   this space — and you."        │
│                                 │
│  You value natural light.       │
│  You like room to breathe.      │
│  Warmth matters to you.         │
│                                 │
│  "Something's already surfacing │
│   that might belong here."      │
│                                 │
│       [Show me]                 │
│                                 │
│          ═══════════            │
│            ═══════              │
│              ═══                │
└─────────────────────────────────┘
```

**Companion Message:**
```
"I'm beginning to understand this space — and you."

[Style Insights appear as bullet points]
• You value natural light.
• You like room to breathe.
• Warmth matters to you.

"Something's already surfacing that might belong here."
```

**Style Insights:**
These are derived from:
1. Room features detected (windows → light, high ceilings → openness)
2. Answers to walk questions (if any)
3. Behavioral signals (what user lingered on)

**Insights are phrased as observations, not labels:**
| Internal Signal | Displayed As |
|-----------------|--------------|
| natural_light: high | "You value natural light." |
| openness: high | "You like room to breathe." |
| warmth: high | "Warmth matters to you." |
| texture: high | "You notice texture." |
| minimalist: high | "You prefer things pared down." |
| layered: high | "You like layers and stories." |

**Action:**
- "Show me" → Transition to First Emergence

---

### Scene 6: First Emergence

**Duration:** User-controlled

**Purpose:**
- Deliver first recommendation based on room + style signals
- Prove that Patina "gets it"
- Establish emergence pattern

**Screen State:**
- Piece floats in from blur
- Story-first presentation
- Stay/Drift actions

**Visual:**
```
┌─────────────────────────────────┐
│                                 │
│                                 │
│          [Piece image           │
│           floating,             │
│           slightly              │
│           rotating]             │
│                                 │
│       THOS. MOSER               │
│       Edo Lounge Chair          │
│                                 │
│   "Hand-shaped cherry, made     │
│    to hold morning light."      │
│                                 │
│                                 │
│   ○ Invite to stay              │
│   ○ Let it drift                │
│                                 │
│          ═══════════            │
│            ═══════              │
│              ═══                │
└─────────────────────────────────┘
```

**Companion Context:**
```
Context bar: "For your [Room Name]"
```

**If user pulls up Companion:**
```
"This caught my attention for your space. The cherry 
 will only get warmer with time — and that corner 
 by the window would show it off beautifully."

Quick Actions:
[Why this piece?]  [See in my room]  [Similar pieces]
```

**Actions:**

| Action | Behavior |
|--------|----------|
| Invite to stay | Piece flies to Table, celebration moment |
| Let it drift | Piece fades away gently, next emergence loads |

---

## Companion Behavior Summary

| Scene | Companion State | Behavior |
|-------|-----------------|----------|
| Threshold | Hidden | Not present — pure entry |
| Walk Invitation | Expanded (message only) | First appearance, warm invitation |
| Camera Permission | Collapsed | Supportive, reassuring |
| The Walk | Collapsed → Floating narration | Observes, asks, guides |
| Walk Complete | Expanded | Reflects, reveals insights |
| First Emergence | Collapsed | Available for questions |

---

## State Transitions

```swift
enum FirstLaunchState {
    case threshold
    case walkInvitation
    case cameraPermission
    case walkActive
    case walkComplete
    case firstEmergence
    case complete
}

// State machine transitions
threshold → walkInvitation           // On hold complete
walkInvitation → cameraPermission    // On "Let's walk" (if needed)
walkInvitation → walkActive          // On "Let's walk" (if permitted)
cameraPermission → walkActive        // On permission granted
walkActive → walkComplete            // On scan complete
walkComplete → firstEmergence        // On "Show me"
firstEmergence → complete            // On stay/drift action
```

---

## Data Captured During Flow

### Room Data
```swift
struct FirstWalkRoomData {
    let roomId: UUID
    let capturedRoom: CapturedRoom  // RoomPlan output
    let features: [DetectedFeature]
    let dimensions: RoomDimensions
    let scanDuration: TimeInterval
    let completedAt: Date
}
```

### Style Signals
```swift
struct FirstWalkStyleSignals {
    // From room features
    var naturalLight: Float       // 0-1, from window detection
    var openness: Float           // 0-1, from room volume
    var warmth: Float             // 0-1, from materials detected
    
    // From questions answered
    var timeOfDay: TimePreference?      // morning/evening/both
    var lightPreference: LightStyle?    // soft/direct
    var seatingPreference: SeatingStyle? // upright/sink-in
    var roomFeeling: String?            // free-form response
    
    // From behavior
    var lingerSpots: [CGPoint]    // Where user paused
    var scanPace: ScanPace        // slow/medium/fast
}
```

### Engagement Metrics
```swift
struct FirstLaunchMetrics {
    let thresholdHoldDuration: TimeInterval
    let walkInvitationChoice: WalkChoice // letsWalk / notYet
    let permissionResult: PermissionResult
    let walkDuration: TimeInterval
    let questionsAnswered: Int
    let questionsIgnored: Int
    let firstEmergenceAction: EmergenceAction // stay / drift
    let totalFlowDuration: TimeInterval
}
```

---

## Error Handling

### AR Tracking Lost
```
Companion narration:
"I lost my bearings for a moment. Hold still..."

[If recovered within 5s]
"There we go. Continue when ready."

[If not recovered]
"The tracking is struggling here. Try moving 
 to a better-lit area, or we can save what 
 we have so far."

Actions: [Save progress]  [Try again]
```

### Insufficient Room Coverage
```
Companion narration:
"I'd love to see a bit more before we finish. 
 Mind walking toward [direction guidance]?"

[If user taps "Done anyway"]
"I can work with what we have. Some recommendations 
 might be less precise, but let's see what surfaces."
```

### App Backgrounded During Walk
```
[On return to app]
Companion: "Welcome back. Want to pick up where we left off?"

Actions: [Continue walk]  [Start fresh]
```

### Permission Denied After Initial Ask
```
Companion: 
"I understand. When you're ready to walk together, 
 you can enable camera access in your device settings. 
 In the meantime, let me show you how this works."

→ Transition to demo/preview mode
```

---

## Acceptance Criteria

### Threshold
- [ ] Atmospheric scene displays correctly on all device sizes
- [ ] Time-of-day lighting matches device clock
- [ ] Hold gesture registers after 2 seconds exactly
- [ ] Progress ring animation is smooth (60fps)
- [ ] Haptic feedback fires at 50% and 100%
- [ ] Transition to Walk Invitation is seamless (no flash/jump)

### Walk Invitation
- [ ] Companion fades in smoothly from bottom
- [ ] Message appears with appropriate delay
- [ ] "Let's walk" triggers permission check
- [ ] "Not yet" transitions to empty state gracefully
- [ ] Animation completes in <500ms total

### Camera Permission
- [ ] Pre-permission context displays before system prompt
- [ ] Privacy link opens modal/sheet with explanation
- [ ] Permission granted → immediate transition to Walk
- [ ] Permission denied → helpful message + settings link
- [ ] Settings link opens correct iOS settings page

### The Walk
- [ ] AR session initializes within 3 seconds
- [ ] Opening narration plays on schedule
- [ ] Observations trigger on feature detection
- [ ] Observations respect 8-second minimum spacing
- [ ] Questions appear only when user is stationary
- [ ] Questions fade after 10 seconds if ignored
- [ ] Progress indicator updates smoothly
- [ ] Guidance prompts appear at appropriate moments
- [ ] Walk completion triggers at >85% coverage
- [ ] All narration text is readable over AR view

### Walk Complete
- [ ] Transition from AR to completion view is smooth
- [ ] Style insights are derived from actual signals
- [ ] Insights display with staggered animation
- [ ] "Show me" transitions to Emergence

### First Emergence
- [ ] Piece is relevant to captured room
- [ ] Piece is relevant to detected style signals
- [ ] Stay action adds to Table correctly
- [ ] Drift action loads next emergence (or shows completion)

### Cross-Cutting
- [ ] Entire flow completes in <5 minutes typical
- [ ] No loading spinners visible to user
- [ ] All transitions feel continuous (no jarring cuts)
- [ ] Companion is present and helpful throughout
- [ ] Flow can be interrupted and resumed
- [ ] Flow works in airplane mode (with limitations)

---

## Technical Requirements

### Dependencies
- RoomPlan framework (iOS 16+)
- ARKit
- AVFoundation (camera access)
- Speech framework (optional, for future voice)
- Core Data (persistence)
- Core Haptics

### Performance Targets
| Metric | Target |
|--------|--------|
| Threshold → Walk Invitation | <500ms |
| AR session initialization | <3s |
| Observation detection latency | <500ms |
| Style signal computation | <100ms |
| First emergence generation | <2s |
| Memory usage during Walk | <300MB |
| Frame rate during Walk | 60fps |

### API Endpoints Required
```
POST /api/rooms
  - Upload captured room data
  - Returns room_id

POST /api/style-signals
  - Upload style signals from walk
  - Returns confirmation

GET /api/emergence/first?room_id={id}&signals={encoded}
  - Get first recommended piece
  - Returns piece data
```

### Offline Behavior
- Threshold: Fully offline
- Walk Invitation: Fully offline
- Walk: Fully offline (RoomPlan is on-device)
- Walk Complete: Offline (insights computed locally)
- First Emergence: Requires network (can show cached/default if offline)

---

## Design Assets Required

| Asset | Format | Notes |
|-------|--------|-------|
| Threshold background (dawn) | PNG/JPG | 1290×2796 @3x |
| Threshold background (day) | PNG/JPG | 1290×2796 @3x |
| Threshold background (dusk) | PNG/JPG | 1290×2796 @3x |
| Threshold background (night) | PNG/JPG | 1290×2796 @3x |
| Camera permission icon | SF Symbol or SVG | |
| Progress indicator states | SVG or Lottie | 5 states |
| Walk completion checkmark | Lottie | Animated |
| Room visualization (abstract) | Generated or Lottie | |
| First piece placeholder | PNG | For loading state |

---

## Copy Document

### Threshold
```
main_text: "Every room tells a story."
instruction: "Hold gently to begin"
```

### Walk Invitation
```
message: "Shall we walk your space together? I'd love to see where you live."
primary_action: "Let's walk"
secondary_action: "Not yet"
```

### Camera Permission
```
context: "To walk together, I'll need to see through your camera. I only look at the shape of your space — nothing personal."
continue_button: "Continue"
privacy_link: "Privacy: What Patina sees"
denied_message: "No problem. When you're ready to walk, I'll be here. You can enable camera access in Settings anytime."
denied_primary: "Open Settings"
denied_secondary: "Explore first"
```

### Walk Narration
```
opening_1: "Let's begin."
opening_2: "Move slowly — I want to take this in."

# Observations (see table in 4.2)

guidance_stuck: "Try moving toward that corner — I'm curious about it."
guidance_fast: "Slower... I want to really see this."
guidance_missing: "I haven't seen that side yet. Mind turning?"
guidance_progress: "We're getting somewhere. Keep going."
guidance_almost: "Nearly there. Just a bit more of that area."

completion: "I think I have it."
```

### Walk Questions
```
time_of_day: "This room — is it where you spend your mornings, or evenings?"
time_options: ["Mornings", "Evenings", "Both"]

light_style: "That light... do you like it soft and diffused, or do you let the sun pour in?"
light_options: ["Soft", "Pour in", "Depends on mood"]

seating_style: "When you imagine yourself here, truly relaxed — are you sitting up or sinking in?"
seating_options: ["Sitting up", "Sinking in"]

room_feeling: "What word comes to mind for this space? Not what it is, but what you want it to feel like."
```

### Walk Complete
```
headline: "I'm beginning to understand this space — and you."
transition: "Something's already surfacing that might belong here."
action: "Show me"
```

### First Emergence
```
context_label: "For your {room_name}"
stay_action: "Invite to stay"
drift_action: "Let it drift"
```

---

## Testing Scenarios

### Happy Path
1. Launch app first time
2. Hold to cross threshold
3. Tap "Let's walk"
4. Grant camera permission
5. Complete walk (~2 min)
6. View style insights
7. See first emergence
8. Invite piece to stay
9. **Expected:** Piece appears on Table, user in main app

### Permission Denied
1. Launch app first time
2. Hold to cross threshold
3. Tap "Let's walk"
4. Deny camera permission
5. **Expected:** Helpful message, option to open Settings or explore

### "Not Yet" Path
1. Launch app first time
2. Hold to cross threshold
3. Tap "Not yet"
4. **Expected:** Empty Room List with Companion invitation to walk later

### Interrupted Walk
1. Start walk
2. Background app mid-walk
3. Return to app
4. **Expected:** Option to continue or start fresh

### Minimal Engagement
1. Complete walk without answering any questions
2. **Expected:** Style insights based on room features only, emergence still works

### Slow Device
1. Complete flow on iPhone 12 mini
2. **Expected:** All animations at 60fps, no dropped frames

---

## Open Questions

1. **Question frequency:** Is 3 questions during walk the right number? Need to test.
2. **Emergence timing:** Should first emergence be instant or build anticipation?
3. **"Not yet" path:** How aggressively do we prompt to walk later?
4. **Skip option:** Should there be a way to skip directly to browsing without walking?
5. **Multiple rooms:** If user has more than one room in mind, when do we offer to walk another?

---

## Appendix: Narration Timing

```
WALK TIMELINE (typical 2:30 walk)

0:00  "Let's begin."
0:02  "Move slowly — I want to take this in."
0:06  [Silence - user starts moving]
0:15  [First observation based on detection]
0:30  [Second observation]
0:45  [User pauses - question appears]
0:55  [User answers or question fades]
1:00  [Observation or guidance]
1:15  [Silence]
1:30  [User pauses - second question]
1:45  [Observation]
2:00  [Progress encouragement]
2:15  [Final observation]
2:25  "Nearly there."
2:30  "I think I have it."
```

---

*Story written for Patina iOS Development Team*  
*January 2026*
