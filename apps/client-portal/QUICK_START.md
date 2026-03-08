# Patina Client Portal - Quick Start Guide

## Installation

```bash
cd apps/client-portal
pnpm install
```

## Development

```bash
pnpm dev
```

Visit: http://localhost:3002

## Key Features

### 1. Touch Gestures
- **Swipe left/right**: Navigate timeline
- **Long press**: Quick actions
- **Pinch**: Zoom images (1x-3x)
- **Double tap**: Expand content
- **Pull down**: Refresh

### 2. Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | Home with stats & recent updates |
| `/timeline` | Project timeline with milestones |
| `/notifications` | Alert center |
| `/profile` | User settings |

### 3. Components

#### Mobile Timeline Card
```tsx
import { MobileTimelineCard } from '@/components/mobile/mobile-timeline-card';

<MobileTimelineCard
  milestone={milestone}
  index={0}
  onTap={() => handleTap()}
/>
```

#### Approval Sheet
```tsx
import { MobileApprovalSheet } from '@/components/mobile/mobile-approval-sheet';

<MobileApprovalSheet
  isOpen={true}
  item={approvalItem}
  onApprove={handleApprove}
  onRequestChanges={handleChanges}
  onClose={handleClose}
/>
```

#### Camera Capture
```tsx
import { CameraCapture } from '@/components/camera/camera-capture';

<CameraCapture
  onCapture={(blob) => uploadPhoto(blob)}
  onClose={() => setShowCamera(false)}
  mode="photo"
/>
```

### 4. Hooks

#### Touch Gestures
```tsx
import { useTouchGestures } from '@/hooks/use-touch-gestures';

const handlers = useTouchGestures({
  onSwipeLeft: () => console.log('Next'),
  onSwipeRight: () => console.log('Previous'),
  onDoubleTap: () => console.log('Expand'),
  enableHaptic: true,
});

<div {...handlers}>Content</div>
```

#### Offline Support
```tsx
import { useOffline } from '@/hooks/use-offline';

const { isOnline, addToQueue, queueSize } = useOffline();

if (!isOnline) {
  addToQueue('approve', { id: '123' });
}
```

#### Pull to Refresh
```tsx
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

const { containerRef } = usePullToRefresh({
  onRefresh: async () => await fetchData(),
  threshold: 80,
});

<div ref={containerRef}>...</div>
```

## Testing

### Lighthouse Audit (Mobile)
```bash
pnpm lighthouse:mobile
```

### Lighthouse Audit (Desktop)
```bash
pnpm lighthouse
```

## Mobile Testing

### Local Network
```bash
# 1. Get your IP
ifconfig | grep "inet "

# 2. Open on mobile
http://192.168.x.x:3002
```

### Install as PWA
1. Open in mobile browser
2. Tap "Add to Home Screen"
3. Launch from home screen

## Performance Targets

- LCP: < 2.5s
- FID: < 100ms
- CLS: < 0.1
- Lighthouse: 90+

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000
```

## Common Tasks

### Add New Page
```bash
# Create file
touch src/app/(dashboard)/my-page/page.tsx

# Add to bottom nav
# Edit: src/components/layout/bottom-navigation.tsx
```

### Add New Gesture
```tsx
const handlers = useTouchGestures({
  onSwipeUp: () => {
    // Your logic
  },
});
```

### Add Notification
```tsx
import { useNotifications } from '@/components/notifications/notification-system';

const { addNotification } = useNotifications();

addNotification({
  type: 'success',
  title: 'Success!',
  message: 'Action completed',
  duration: 5000,
});
```

## Troubleshooting

### Camera Not Working
- Check HTTPS (required for camera API)
- Grant camera permissions
- Use real device (not simulator)

### Gestures Not Responding
- Ensure touch-action is set correctly
- Check z-index conflicts
- Test on real device

### Offline Mode Issues
- Clear service worker cache
- Unregister and re-register SW
- Check browser console for SW errors

## Browser DevTools

### Test Mobile View
1. Open Chrome DevTools (F12)
2. Click device toolbar icon
3. Select device (iPhone, Pixel, etc.)
4. Test touch gestures with mouse

### Test Offline
1. Open DevTools
2. Go to Network tab
3. Set throttling to "Offline"
4. Test offline functionality

## Support

- README: `apps/client-portal/README.md`
- Full Docs: `TEAM_FOXTROT_MOBILE_IMPLEMENTATION.md`
- Issues: Project tracker
