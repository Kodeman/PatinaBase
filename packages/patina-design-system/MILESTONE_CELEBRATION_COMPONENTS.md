# Milestone & Celebration Components

**Team Charlie - Milestone Moments and Celebration Features**

Transform project milestones into memorable, celebratory moments that make clients feel special and engaged throughout their interior design journey.

---

## Overview

This collection of components creates emotionally engaging milestone experiences with smooth animations, delightful interactions, and celebration sequences that make every achievement feel like a victory.

---

## Components

### 1. MilestoneCard

A rich card component for displaying project milestones with celebration effects and rich media integration.

**Features:**
- Three size variants (compact, standard, hero)
- Elevation levels (subtle, elevated, floating)
- Status-based styling (completed, active, upcoming, blocked)
- Rich media integration with progress photos
- Designer notes section
- Metrics display
- Action buttons
- Progress tracking
- Celebration effects

**Usage:**

```tsx
import { MilestoneCard } from '@patina/design-system'

<MilestoneCard
  title="Design Approval"
  description="Review and approve the final design concepts"
  status="active"
  size="hero"
  elevation="floating"
  date={new Date()}
  icon={<Sparkles className="h-5 w-5" />}
  completionPercentage={75}
  metrics={[
    { label: 'Days Active', value: '12' },
    { label: 'Team Members', value: '3' }
  ]}
  progressPhotos={photos}
  designerNote={{
    author: 'Sarah Johnson',
    avatar: '/avatar.jpg',
    message: 'Excited about this direction!',
    timestamp: new Date()
  }}
  primaryAction={{
    label: 'Approve Design',
    onClick: handleApprove
  }}
  celebrationType="confetti"
/>
```

**Props:**
- `title` - Card title (required)
- `description` - Card description
- `status` - 'completed' | 'active' | 'upcoming' | 'blocked'
- `size` - 'compact' | 'standard' | 'hero'
- `elevation` - 'subtle' | 'elevated' | 'floating'
- `date` - Milestone date
- `icon` - Header icon
- `completionPercentage` - Progress (0-100)
- `metrics` - Array of metrics to display
- `progressPhotos` - Array of progress photos
- `designerNote` - Designer note object
- `primaryAction` - Primary action button
- `secondaryActions` - Array of secondary actions
- `celebrationType` - 'confetti' | 'sparkle' | 'pulse' | 'none'

---

### 2. Confetti

Celebratory confetti burst animation for milestone completions.

**Features:**
- Configurable particle count
- Custom colors
- Animation intensity levels
- Duration control
- Completion callback

**Usage:**

```tsx
import { Confetti } from '@patina/design-system'

<Confetti
  count={50}
  duration={3000}
  intensity="high"
  colors={['#10b981', '#8b5cf6', '#f59e0b']}
  onComplete={() => console.log('Celebration complete!')}
/>
```

**Props:**
- `count` - Number of confetti pieces (default: 50)
- `duration` - Animation duration in ms (default: 3000)
- `colors` - Array of color strings
- `intensity` - 'low' | 'medium' | 'high'
- `onComplete` - Callback when animation completes

---

### 3. Sparkles

Magical sparkle effect for achievement moments.

**Features:**
- Configurable particle count
- Size variants
- Custom colors
- Animation speed control
- Continuous or one-shot animation

**Usage:**

```tsx
import { Sparkles } from '@patina/design-system'

<Sparkles count={20} size="lg" continuous>
  <div>Sparkly content</div>
</Sparkles>
```

**Props:**
- `count` - Number of sparkles (default: 12)
- `size` - 'sm' | 'md' | 'lg'
- `colors` - Array of color strings
- `speed` - 'slow' | 'normal' | 'fast'
- `continuous` - Loop animation (default: true)
- `duration` - Cycle duration in ms (default: 2000)

---

### 4. CelebrationSequence

Orchestrates celebration moments with animations and messages.

**Features:**
- Multiple celebration types
- Stage-based animation sequence
- Confetti and sparkle effects
- Customizable messages
- Backdrop overlay
- Completion callbacks

**Usage:**

```tsx
import { CelebrationSequence } from '@patina/design-system'

<CelebrationSequence
  type="approval"
  isActive={showCelebration}
  message="Design Approved!"
  subtitle="Great choice! Moving to the next phase."
  duration={4000}
  showConfetti
  showSparkles
  onComplete={() => setShowCelebration(false)}
/>
```

**Props:**
- `type` - 'approval' | 'completion' | 'achievement' | 'custom'
- `isActive` - Show the celebration
- `message` - Main message text
- `subtitle` - Additional context
- `duration` - Sequence duration in ms (default: 4000)
- `showConfetti` - Enable confetti (default: true)
- `showSparkles` - Enable sparkles (default: true)
- `showBackdrop` - Show backdrop overlay (default: true)
- `onComplete` - Callback when sequence completes

---

### 5. ProgressPhotography

Gallery component for displaying project progress photos with before/during/after views.

**Features:**
- Grid and timeline view modes
- Category filtering (before/during/after)
- Lightbox modal with keyboard navigation
- Swipeable gallery
- Touch gesture support
- Timestamps and captions

**Usage:**

```tsx
import { ProgressPhotography } from '@patina/design-system'

<ProgressPhotography
  photos={progressPhotos}
  defaultView="timeline"
  enableLightbox
  enableFiltering
  showTimestamps
  columns={3}
/>
```

**Props:**
- `photos` - Array of photo objects (required)
- `defaultView` - 'grid' | 'carousel' | 'timeline'
- `enableLightbox` - Enable lightbox on click (default: true)
- `enableFiltering` - Enable category filters (default: true)
- `showTimestamps` - Show photo timestamps (default: true)
- `columns` - Grid columns: 2 | 3 | 4 (default: 3)
- `onPhotoClick` - Callback when photo is clicked

---

### 6. ComparisonSlider

Interactive before/after image comparison slider.

**Features:**
- Horizontal and vertical orientation
- Draggable slider handle
- Touch support
- Multiple aspect ratios
- Custom labels
- Keyboard accessible

**Usage:**

```tsx
import { ComparisonSlider } from '@patina/design-system'

<ComparisonSlider
  beforeImage="/before.jpg"
  afterImage="/after.jpg"
  beforeLabel="Before"
  afterLabel="After"
  initialPosition={50}
  aspectRatio="video"
  orientation="horizontal"
/>
```

**Props:**
- `beforeImage` - Before image URL (required)
- `afterImage` - After image URL (required)
- `beforeAlt` - Alt text for before image
- `afterAlt` - Alt text for after image
- `beforeLabel` - Label for before state
- `afterLabel` - Label for after state
- `initialPosition` - Slider position 0-100 (default: 50)
- `aspectRatio` - 'square' | 'video' | 'wide' | 'portrait'
- `showLabels` - Show labels (default: true)
- `orientation` - 'horizontal' | 'vertical'

---

### 7. VideoPlayer

Custom video player with controls and fullscreen support.

**Features:**
- Custom controls
- Play/pause functionality
- Volume control
- Fullscreen mode
- Progress bar
- Time display
- Auto-hide controls

**Usage:**

```tsx
import { VideoPlayer } from '@patina/design-system'

<VideoPlayer
  src="/video.mp4"
  poster="/thumbnail.jpg"
  showControls
  aspectRatio="video"
  onEnd={() => console.log('Video ended')}
/>
```

**Props:**
- `src` - Video source URL (required)
- `poster` - Poster image URL
- `autoPlay` - Auto play (default: false)
- `loop` - Loop video (default: false)
- `muted` - Muted by default (default: false)
- `showControls` - Show controls (default: true)
- `aspectRatio` - 'video' | 'square' | 'wide'
- `onEnd` - Callback when video ends

---

### 8. MediaCarousel

Carousel component for displaying images and videos.

**Features:**
- Auto-play with interval
- Navigation arrows
- Pagination dots
- Thumbnail navigation
- Touch swipe support
- Keyboard navigation
- Loop mode

**Usage:**

```tsx
import { MediaCarousel } from '@patina/design-system'

<MediaCarousel
  items={mediaItems}
  autoPlay={5000}
  showNavigation
  showPagination
  showThumbnails
  loop
  aspectRatio="video"
/>
```

**Props:**
- `items` - Array of media items (required)
- `autoPlay` - Auto-play interval in ms (0 to disable)
- `showNavigation` - Show arrows (default: true)
- `showPagination` - Show dots (default: true)
- `showThumbnails` - Show thumbnails (default: false)
- `loop` - Loop carousel (default: true)
- `aspectRatio` - 'video' | 'square' | 'wide'
- `onItemChange` - Callback when item changes

---

### 9. AchievementBadge

Display achievement badges and progress.

**Features:**
- Multiple achievement types
- Tier levels (bronze, silver, gold, platinum)
- Unlocked/locked states
- Progress tracking
- Sparkle effects
- Size variants

**Usage:**

```tsx
import { AchievementBadge } from '@patina/design-system'

<AchievementBadge
  title="First Approval"
  description="Approved your first design"
  type="approval"
  tier="gold"
  unlocked
  showSparkles
  earnedDate={new Date()}
/>
```

**Props:**
- `title` - Achievement title (required)
- `description` - Achievement description
- `type` - 'milestone' | 'approval' | 'completion' | 'excellence' | 'speed' | 'collaboration'
- `size` - 'sm' | 'md' | 'lg'
- `tier` - 'bronze' | 'silver' | 'gold' | 'platinum'
- `earnedDate` - Date earned
- `showSparkles` - Enable sparkle effect (default: false)
- `progress` - Progress percentage for locked achievements
- `unlocked` - Is unlocked (default: true)

---

### 10. DesignerMessage

Display designer communications (text, voice, video).

**Features:**
- Multiple message types (text, voice, video)
- Audio player for voice notes
- Video player for video messages
- Avatar and role display
- Expandable long messages
- Timestamp display

**Usage:**

```tsx
import { DesignerMessage } from '@patina/design-system'

<DesignerMessage
  designerName="Sarah Johnson"
  designerAvatar="/avatar.jpg"
  designerRole="Lead Designer"
  type="text"
  message="I'm excited about this design direction!"
  timestamp={new Date()}
/>
```

**Props:**
- `designerName` - Designer name (required)
- `designerAvatar` - Avatar URL
- `designerRole` - Role/title
- `type` - 'text' | 'voice' | 'video'
- `message` - Text message content
- `mediaUrl` - Media URL for voice/video
- `timestamp` - Message timestamp (required)
- `expanded` - Show full message initially (default: false)
- `onPlay` - Callback when media is played

---

### 11. ProjectCompletionCelebration

Epic celebration sequence for project completion.

**Features:**
- Before/after showcase
- Project statistics
- Achievement display
- Team credits
- Sharing options
- Multi-stage animation
- Full-screen takeover

**Usage:**

```tsx
import { ProjectCompletionCelebration } from '@patina/design-system'

<ProjectCompletionCelebration
  isActive={showCelebration}
  projectName="Living Room Redesign"
  beforeImage="/before.jpg"
  afterImage="/after.jpg"
  stats={{
    duration: 90,
    milestonesCompleted: 12,
    approvalsReceived: 8,
    photosShared: 47
  }}
  team={teamMembers}
  onComplete={() => setShowCelebration(false)}
  onShare={handleShare}
  onTestimonial={handleTestimonial}
/>
```

**Props:**
- `isActive` - Show celebration (required)
- `projectName` - Project name (required)
- `beforeImage` - Before image URL
- `afterImage` - After image URL
- `stats` - Project statistics object
- `team` - Array of team members
- `duration` - Sequence duration in ms (default: 8000)
- `onComplete` - Callback when celebration completes
- `onShare` - Callback for share button
- `onTestimonial` - Callback for testimonial button

---

## Design Patterns

### Celebration Timing

```tsx
// On milestone completion
const handleMilestoneComplete = () => {
  setShowCelebration(true)

  // Auto-dismiss after duration
  setTimeout(() => {
    setShowCelebration(false)
    navigateToNextStep()
  }, 4000)
}
```

### Progressive Enhancement

```tsx
// Check for reduced motion preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

<MilestoneCard
  celebrationType={prefersReducedMotion ? 'none' : 'confetti'}
/>
```

### Responsive Design

```tsx
// Adapt component size to viewport
const isMobile = useMediaQuery('(max-width: 768px)')

<MilestoneCard
  size={isMobile ? 'compact' : 'standard'}
  elevation={isMobile ? 'subtle' : 'floating'}
/>
```

---

## Animation Sequences

### Design Approval Sequence

```tsx
const DesignApprovalFlow = () => {
  const [stage, setStage] = useState('review')

  const handleApprove = () => {
    setStage('celebration')

    setTimeout(() => {
      setStage('next-steps')
    }, 3000)
  }

  return (
    <>
      {stage === 'review' && (
        <MilestoneCard
          title="Design Approval"
          primaryAction={{
            label: 'Approve',
            onClick: handleApprove
          }}
        />
      )}

      {stage === 'celebration' && (
        <CelebrationSequence
          type="approval"
          isActive
          message="Design Approved!"
        />
      )}

      {stage === 'next-steps' && (
        <MilestoneCard
          title="Next: Material Selection"
          status="active"
        />
      )}
    </>
  )
}
```

### Project Completion Sequence

```tsx
const ProjectCompletionFlow = () => {
  const [showCelebration, setShowCelebration] = useState(false)

  const handleComplete = () => {
    setShowCelebration(true)
  }

  return (
    <ProjectCompletionCelebration
      isActive={showCelebration}
      projectName="Living Room Redesign"
      beforeImage="/before.jpg"
      afterImage="/after.jpg"
      stats={projectStats}
      team={teamMembers}
      onComplete={() => {
        setShowCelebration(false)
        router.push('/testimonial')
      }}
      onShare={handleShare}
      onTestimonial={handleTestimonial}
    />
  )
}
```

---

## Accessibility

All components follow WCAG 2.1 AAA guidelines:

- **Keyboard Navigation**: Full keyboard support
- **Screen Readers**: Proper ARIA labels and live regions
- **Reduced Motion**: Respects prefers-reduced-motion
- **Focus Management**: Clear focus indicators
- **Color Contrast**: AAA compliant contrast ratios

---

## Performance

### Optimization Techniques

1. **Lazy Loading**: Components are code-split for optimal loading
2. **Image Optimization**: Progressive image loading with placeholders
3. **Animation Performance**: GPU-accelerated animations
4. **Virtual Scrolling**: For large photo galleries
5. **Debounced Events**: Touch and scroll events are optimized

### Performance Targets

- **LCP**: < 2.5s
- **FID**: < 100ms
- **CLS**: < 0.1
- **Animation FPS**: 60fps

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari 14+, Chrome Mobile 90+)

---

## Examples

### Complete Milestone Journey

```tsx
import {
  MilestoneCard,
  CelebrationSequence,
  ProgressPhotography,
  AchievementBadge,
  ProjectCompletionCelebration
} from '@patina/design-system'

const ProjectTimeline = () => {
  const [currentMilestone, setCurrentMilestone] = useState(0)
  const [showCelebration, setShowCelebration] = useState(false)

  const milestones = [
    {
      title: 'Initial Consultation',
      status: 'completed',
      photos: consultationPhotos
    },
    {
      title: 'Design Development',
      status: 'active',
      completionPercentage: 65
    },
    {
      title: 'Final Approval',
      status: 'upcoming'
    }
  ]

  return (
    <div className="space-y-6">
      {milestones.map((milestone, index) => (
        <MilestoneCard
          key={index}
          {...milestone}
          celebrationType={
            milestone.status === 'completed' ? 'sparkle' : 'none'
          }
        />
      ))}

      <ProgressPhotography
        photos={allProgressPhotos}
        defaultView="timeline"
        enableLightbox
      />

      <div className="grid md:grid-cols-2 gap-4">
        <AchievementBadge
          title="Quick Responder"
          type="speed"
          tier="gold"
          unlocked
        />
        <AchievementBadge
          title="Decisive Decision Maker"
          type="excellence"
          tier="platinum"
          unlocked
        />
      </div>
    </div>
  )
}
```

---

## Contributing

When adding new milestone or celebration features:

1. Follow the existing component patterns
2. Include comprehensive TypeScript types
3. Add Storybook stories for all variants
4. Write unit tests with vitest
5. Ensure accessibility compliance
6. Document all props and usage examples

---

## License

Part of the Patina Design System - Proprietary
