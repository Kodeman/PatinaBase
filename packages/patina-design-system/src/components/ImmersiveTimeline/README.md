# Immersive Timeline Components

A comprehensive scroll-driven timeline experience engine for creating engaging, interactive project timelines with progressive disclosure, animations, and performance optimizations.

## Features

✨ **Scroll-Driven Animations** - Reveal content as users scroll
🎯 **Progressive Disclosure** - Load content only when needed
⚡ **60fps Performance** - Optimized with RAF and virtual scrolling
📱 **Touch & Gesture Support** - Swipe navigation on mobile
⌨️ **Keyboard Navigation** - Arrow keys and vim-style shortcuts
♿ **Fully Accessible** - WCAG 2.1 AAA compliant
🎨 **Highly Customizable** - Themeable with Tailwind CSS
📊 **Progress Tracking** - Fixed position progress indicator
🖼️ **Lazy Loading** - Optimized image and content loading
🌊 **Parallax Effects** - Create depth with parallax layers

## Installation

The components are part of `@patina/design-system`:

```bash
npm install @patina/design-system
```

## Quick Start

```tsx
import { ImmersiveTimeline, TimelineSegmentData } from '@patina/design-system'

const segments: TimelineSegmentData[] = [
  {
    id: '1',
    type: 'milestone',
    status: 'completed',
    title: 'Project Started',
    description: 'Initial consultation completed',
    date: new Date('2024-01-15'),
  },
  {
    id: '2',
    type: 'approval',
    status: 'active',
    title: 'Design Approval',
    description: 'Awaiting client approval',
  },
  {
    id: '3',
    type: 'task',
    status: 'upcoming',
    title: 'Installation',
    description: 'Scheduled for next month',
  },
]

export default function Timeline() {
  return (
    <ImmersiveTimeline
      segments={segments}
      showProgress
      enableKeyboardNav
      layout="wide"
    />
  )
}
```

## Components

### ImmersiveTimeline

Main container component with scroll tracking and navigation.

```tsx
<ImmersiveTimeline
  segments={segments}
  showProgress={true}
  progressPosition="fixed-right"
  enableKeyboardNav={true}
  layout="wide"
  spacing="comfortable"
  segmentSize="standard"
  onSegmentChange={(segment) => console.log('Active:', segment)}
  renderSegment={(segment) => <CustomSegment {...segment} />}
/>
```

### TimelineSegment

Individual timeline entry with status-based styling.

```tsx
<TimelineSegment
  segment={{
    id: '1',
    type: 'milestone',
    status: 'completed',
    title: 'Phase Complete',
    description: 'All tasks finished',
  }}
  size="standard"
  expandable={true}
  onExpand={(id) => console.log('Expanded:', id)}
/>
```

### ScrollProgressIndicator

Fixed position progress tracker.

```tsx
<ScrollProgressIndicator
  position="fixed-right"
  size="md"
  segments={markers}
  showPercentage
  height={60}
  onSegmentClick={(segment) => scrollTo(segment)}
/>
```

### ContentReveal

Scroll-triggered animation wrapper.

```tsx
<ContentReveal
  animation="slideUp"
  easing="spring"
  triggerPoint="standard"
  delay={100}
  triggerOnce={true}
>
  <YourContent />
</ContentReveal>
```

### ParallaxLayer

Creates parallax scrolling effects.

```tsx
<ParallaxLayer speed={0.5} direction="vertical">
  <BackgroundImage />
</ParallaxLayer>
```

### LazyImage

Optimized lazy-loading image.

```tsx
<LazyImage
  src="/image.jpg"
  alt="Description"
  placeholder="/placeholder.jpg"
  aspectRatio={16/9}
  objectFit="cover"
/>
```

### ProgressiveContent

Defers content rendering until visible.

```tsx
<ProgressiveContent
  loadingStrategy="viewport"
  minHeight={300}
  placeholder={<Spinner />}
>
  <HeavyComponent />
</ProgressiveContent>
```

## Hooks

### useScrollProgress

```tsx
const { scrollY, scrollPercentage, direction, velocity } = useScrollProgress({
  throttle: 16
})
```

### useIntersectionReveal

```tsx
const [ref, isVisible, entry] = useIntersectionReveal({
  triggerPoint: 'standard',
  triggerOnce: true
})
```

### useScrollVelocity

```tsx
const { velocity, speed, isScrolling } = useScrollVelocity({
  slowThreshold: 50,
  fastThreshold: 200
})
```

### useParallax

```tsx
const offset = useParallax({
  speed: 0.5,
  direction: 'vertical'
})
```

### useSwipeGesture

```tsx
const ref = useSwipeGesture({
  onSwipeLeft: () => next(),
  onSwipeRight: () => prev(),
  threshold: 50
})
```

### useKeyPressCallback

```tsx
useKeyPressCallback('Escape', closeModal, {
  enabled: isOpen,
  preventDefault: true
})
```

## Examples

### Basic Timeline

```tsx
function BasicTimeline() {
  const segments = [
    {
      id: '1',
      type: 'milestone' as const,
      status: 'completed' as const,
      title: 'Started',
      date: new Date(),
    },
  ]

  return <ImmersiveTimeline segments={segments} />
}
```

### Timeline with Media

```tsx
function MediaTimeline() {
  return (
    <ImmersiveTimeline
      segments={segments}
      renderSegment={(segment) => (
        <div>
          <h2>{segment.title}</h2>
          {segment.media?.map(item => (
            <LazyImage
              key={item.id}
              src={item.url}
              alt={item.alt}
              aspectRatio={16/9}
            />
          ))}
        </div>
      )}
    />
  )
}
```

### Timeline with Parallax

```tsx
function ParallaxTimeline() {
  return (
    <div className="relative">
      <ParallaxLayer speed={0.3}>
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50 to-white" />
      </ParallaxLayer>

      <ImmersiveTimeline segments={segments} />
    </div>
  )
}
```

## Customization

### Custom Animations

Add custom reveal animations via CSS:

```css
@keyframes customReveal {
  from {
    opacity: 0;
    transform: rotateY(-90deg);
  }
  to {
    opacity: 1;
    transform: rotateY(0);
  }
}
```

### Custom Theme

Override colors in Tailwind config:

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        'timeline-completed': '#10b981',
        'timeline-active': '#6366f1',
        'timeline-upcoming': '#e0e7ff',
        'timeline-blocked': '#94a3b8',
      },
    },
  },
}
```

### Custom Segment Renderer

```tsx
<ImmersiveTimeline
  segments={segments}
  renderSegment={(segment) => (
    <MyCustomSegment {...segment} />
  )}
/>
```

## Performance

### Optimization Tips

1. **Use LazyImage** for all images
2. **Enable Progressive Content** for heavy components
3. **Throttle scroll handlers** (default: 16ms)
4. **Use Virtual Scrolling** for 50+ segments
5. **Provide image aspect ratios** to prevent layout shift

### Bundle Size

- ImmersiveTimeline: ~12KB
- Hooks: ~4KB
- Supporting components: ~8KB
- **Total: ~24KB (gzipped)**

## Accessibility

### Keyboard Shortcuts

- `↑`/`↓` - Navigate segments
- `J`/`K` - Vim-style navigation
- `Home`/`End` - First/last segment
- `Esc` - Close expanded content

### Screen Reader Support

All components include proper ARIA labels and semantic HTML.

### Reduced Motion

Automatically respects `prefers-reduced-motion` setting.

## Browser Support

- Chrome/Edge: Latest 2 versions ✅
- Firefox: Latest 2 versions ✅
- Safari: Latest 2 versions ✅
- iOS Safari: 13+ ✅
- Chrome Mobile: Latest ✅

## TypeScript

Full TypeScript support with comprehensive type definitions.

```typescript
import type {
  TimelineSegmentData,
  TimelineSegmentMarker,
  MediaAsset,
  ScrollProgress,
  ParallaxOffset,
} from '@patina/design-system'
```

## Testing

```typescript
import { render, screen } from '@testing-library/react'
import { ImmersiveTimeline } from '@patina/design-system'

test('renders timeline', () => {
  render(<ImmersiveTimeline segments={mockSegments} />)
  expect(screen.getByText('Project Started')).toBeInTheDocument()
})
```

## License

MIT

## Credits

Built by Team Bravo for Patina Design System
