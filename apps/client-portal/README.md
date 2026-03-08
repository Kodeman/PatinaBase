# Patina Client Portal - Mobile-First Experience

A high-performance, mobile-optimized client portal for tracking custom home furnishing projects.

## Features

### Mobile-First Architecture
- Touch-optimized gestures (swipe, pinch-to-zoom, long-press)
- Pull-to-refresh functionality
- Haptic feedback
- Bottom navigation
- Progressive Web App (PWA) support

### Timeline Experience
- Scroll-driven animations
- Interactive milestone cards
- Real-time status updates
- Media galleries with touch gestures
- Progress tracking

### Offline Support
- Service Worker for offline functionality
- Automatic request queueing
- Sync when connection restored
- Offline indicators

### Camera Integration
- Photo/video capture
- Direct upload from device
- Gallery selection
- Permission handling

### Performance Optimizations
- Lazy loading images
- Code splitting
- Virtual scrolling
- Reduced motion support
- Web Vitals monitoring

### Notifications
- In-app notifications
- Push notification support
- Toast notifications
- Sound/vibration preferences

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 8+

### Installation

```bash
cd apps/client-portal
pnpm install
```

### Development

```bash
pnpm dev
```

The app will be available at `http://localhost:3002`

### Build

```bash
pnpm build
pnpm start
```

## Performance Targets

- LCP (Largest Contentful Paint): < 2.5s
- FID (First Input Delay): < 100ms
- CLS (Cumulative Layout Shift): < 0.1
- TTI (Time to Interactive): < 3.5s
- Lighthouse Score: 90+

## Testing Performance

### Lighthouse (Mobile)
```bash
pnpm lighthouse:mobile
```

### Lighthouse (Desktop)
```bash
pnpm lighthouse
```

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── timeline/          # Timeline page
│   │   ├── notifications/     # Notifications page
│   │   └── profile/          # Profile page
│   ├── layout.tsx            # Root layout
│   └── globals.css           # Global styles
├── components/
│   ├── mobile/               # Mobile-specific components
│   │   ├── mobile-timeline-card.tsx
│   │   ├── mobile-approval-sheet.tsx
│   │   └── touch-optimized-gallery.tsx
│   ├── camera/               # Camera components
│   │   └── camera-capture.tsx
│   ├── layout/               # Layout components
│   │   └── bottom-navigation.tsx
│   ├── notifications/        # Notification system
│   │   └── notification-system.tsx
│   └── ui/                   # UI components
│       ├── lazy-image.tsx
│       └── floating-action-button.tsx
├── hooks/
│   ├── use-touch-gestures.ts
│   ├── use-offline.ts
│   ├── use-pull-to-refresh.ts
│   └── use-performance.ts
└── lib/                      # Utilities

```

## Mobile Features

### Touch Gestures
- Swipe left/right: Navigate between items
- Long press: Quick actions menu
- Pinch to zoom: Image galleries
- Double tap: Expand content
- Pull down: Refresh content

### Offline Mode
- Automatic offline detection
- Queue actions when offline
- Auto-sync when online
- Offline indicators

### Camera Integration
- Take photos in-app
- Direct upload to timeline
- Gallery access
- Permission management

## Architecture Decisions

### Next.js 15
- React Server Components
- App Router
- Image Optimization
- Automatic code splitting

### Framer Motion
- Smooth animations
- Touch gesture support
- Layout animations
- Scroll-driven effects

### PWA Support
- Service Worker caching
- Offline functionality
- Install prompt
- App-like experience

### Performance
- Lazy loading with Intersection Observer
- Virtual scrolling for long lists
- Image optimization with Next/Image
- Code splitting by route

## Browser Support

- iOS Safari 14+
- Chrome Mobile 90+
- Samsung Internet 14+
- Firefox Mobile 88+

## License

Proprietary - Patina Platform
