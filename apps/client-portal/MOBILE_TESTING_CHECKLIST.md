# Mobile Testing Checklist - Client Portal

## Pre-Testing Setup

- [ ] Install on iOS device (Safari)
- [ ] Install on Android device (Chrome)
- [ ] Test on tablet (iPad, Android tablet)
- [ ] Configure local network access
- [ ] Enable remote debugging

## Touch Gestures

### Swipe Gestures
- [ ] Swipe left on timeline card (navigate next)
- [ ] Swipe right on timeline card (navigate previous)
- [ ] Swipe up on notification (dismiss)
- [ ] Swipe down on notification (expand)
- [ ] Gallery swipe navigation (left/right)

### Pinch Gestures
- [ ] Pinch to zoom in gallery (1x to 3x)
- [ ] Pinch to zoom out (3x to 1x)
- [ ] Smooth scaling during pinch
- [ ] Reset zoom on image change

### Tap Gestures
- [ ] Single tap to open card detail
- [ ] Double tap to expand content
- [ ] Double tap to zoom (2x)
- [ ] Long press for quick actions (500ms)
- [ ] Tap accuracy on small targets

### Pull to Refresh
- [ ] Pull down gesture detection
- [ ] Visual indicator rotation
- [ ] Haptic feedback on threshold
- [ ] Smooth animation
- [ ] Data refresh completes

## Navigation

### Bottom Navigation
- [ ] All tabs accessible
- [ ] Active state visual indicator
- [ ] Smooth transitions
- [ ] Safe area insets (iOS)
- [ ] Tab bar stays fixed at bottom

### Page Transitions
- [ ] Dashboard loads quickly
- [ ] Timeline scrolls smoothly
- [ ] Notifications update in real-time
- [ ] Profile loads user data
- [ ] Back button works correctly

## Timeline

### Milestone Cards
- [ ] Cards animate on scroll into view
- [ ] Status colors display correctly
- [ ] Progress bars update smoothly
- [ ] Media previews load lazy
- [ ] Dates format correctly

### Interactions
- [ ] Tap card opens detail
- [ ] Swipe to navigate between cards
- [ ] Long press shows quick actions
- [ ] Media gallery opens on image tap
- [ ] Share functionality works

## Approval System

### Approval Sheet
- [ ] Sheet slides up from bottom
- [ ] Drag handle works
- [ ] Swipe down to dismiss
- [ ] Images load in grid
- [ ] Cost/timeline display correctly

### Actions
- [ ] Approve button triggers success
- [ ] Request changes opens form
- [ ] Change message validates
- [ ] Haptic feedback on approve
- [ ] Sheet closes after action

## Camera

### Photo Capture
- [ ] Permission request appears
- [ ] Camera preview works
- [ ] Capture button responsive
- [ ] Preview shows captured image
- [ ] Retake functionality works
- [ ] Confirm uploads photo

### Video Capture (if implemented)
- [ ] Video recording starts/stops
- [ ] Timer displays correctly
- [ ] Preview plays video
- [ ] Video uploads successfully

## Notifications

### In-App Notifications
- [ ] Toast appears on action
- [ ] Auto-dismiss after 5s
- [ ] Swipe to dismiss works
- [ ] Multiple toasts stack
- [ ] Action buttons work
- [ ] Haptic feedback on appear

### Notification Center
- [ ] Unread badge displays
- [ ] Notifications load
- [ ] Mark as read works
- [ ] Tap opens relevant page
- [ ] Delete/clear works

## Offline Functionality

### Offline Detection
- [ ] Offline indicator appears
- [ ] Queue count displays
- [ ] Actions queue when offline
- [ ] Online indicator appears
- [ ] Queue processes on reconnect

### Cached Content
- [ ] Timeline loads from cache
- [ ] Images display from cache
- [ ] Static pages work offline
- [ ] Service worker active
- [ ] Cache updates on online

## Performance

### Loading
- [ ] Initial load < 3s
- [ ] Page transitions instant
- [ ] Images load progressively
- [ ] Skeleton loaders show
- [ ] No layout shift (CLS < 0.1)

### Scrolling
- [ ] Smooth 60fps scroll
- [ ] No janky animations
- [ ] Virtual scroll (if implemented)
- [ ] Pull-to-refresh smooth
- [ ] Momentum scroll natural

### Animations
- [ ] Card reveal animations smooth
- [ ] Sheet slide animations 60fps
- [ ] Gallery transitions smooth
- [ ] Loading spinners smooth
- [ ] Reduced motion respected

## PWA Features

### Install
- [ ] Install prompt appears
- [ ] Add to home screen works
- [ ] App icon displays correctly
- [ ] Splash screen shows
- [ ] Standalone mode works

### App Behavior
- [ ] Launches like native app
- [ ] Status bar colors correct
- [ ] Orientation locks (portrait)
- [ ] Fullscreen mode works
- [ ] Back button behaves correctly

## Accessibility

### Touch Targets
- [ ] All buttons >= 48x48px
- [ ] Adequate spacing between targets
- [ ] Visible focus states
- [ ] Active states clear
- [ ] Disabled states obvious

### Screen Reader
- [ ] All images have alt text
- [ ] ARIA labels on icons
- [ ] Headings hierarchical
- [ ] Live regions announce updates
- [ ] Form inputs labeled

### Visual
- [ ] Color contrast >= 4.5:1
- [ ] Text scalable to 200%
- [ ] Focus indicators visible
- [ ] No color-only indicators
- [ ] Dark mode (if implemented)

## Edge Cases

### Network
- [ ] Slow 3G performance
- [ ] Connection drops mid-action
- [ ] Reconnect behavior
- [ ] Timeout handling
- [ ] Error messages clear

### Data
- [ ] Empty timeline state
- [ ] No notifications state
- [ ] Large image files
- [ ] Long text truncation
- [ ] Special characters

### Device
- [ ] Small screen (iPhone SE)
- [ ] Large screen (iPad Pro)
- [ ] Landscape orientation
- [ ] Notch/safe areas
- [ ] Different aspect ratios

## Browser Compatibility

### iOS Safari
- [ ] iOS 14+
- [ ] Touch gestures work
- [ ] PWA installable
- [ ] Service worker active
- [ ] Camera permission

### Chrome Mobile
- [ ] Android 10+
- [ ] All gestures work
- [ ] PWA install
- [ ] Offline mode
- [ ] Push notifications

### Samsung Internet
- [ ] Latest version
- [ ] Basic functionality
- [ ] Touch support
- [ ] PWA features

## Performance Metrics

### Lighthouse Scores (Mobile)
- [ ] Performance: >= 90
- [ ] Accessibility: >= 95
- [ ] Best Practices: >= 90
- [ ] SEO: >= 90
- [ ] PWA: All checks pass

### Core Web Vitals
- [ ] LCP: < 2.5s
- [ ] FID: < 100ms
- [ ] CLS: < 0.1
- [ ] TTI: < 3.5s
- [ ] TTFB: < 800ms

### Bundle Size
- [ ] Initial JS: < 200KB
- [ ] Total size: < 500KB
- [ ] Images optimized
- [ ] Code split by route
- [ ] Tree shaking effective

## Security

### Permissions
- [ ] Camera permission requested
- [ ] Location permission (if used)
- [ ] Notification permission
- [ ] Clear permission denials
- [ ] Re-request flow works

### Data
- [ ] HTTPS enforced
- [ ] Tokens stored securely
- [ ] Input sanitized
- [ ] XSS prevention
- [ ] CSRF protection

## User Experience

### Feedback
- [ ] Haptic on important actions
- [ ] Visual feedback on tap
- [ ] Loading states clear
- [ ] Success confirmations
- [ ] Error messages helpful

### Flow
- [ ] Intuitive navigation
- [ ] Clear action buttons
- [ ] Consistent patterns
- [ ] Minimal steps to complete
- [ ] Easy to undo actions

## Bug Testing

### Common Issues
- [ ] Memory leaks
- [ ] Event listener cleanup
- [ ] Infinite re-renders
- [ ] State synchronization
- [ ] Race conditions

### Stress Testing
- [ ] 100+ timeline items
- [ ] Rapid gesture input
- [ ] Multiple concurrent actions
- [ ] Background/foreground
- [ ] App suspension

## Sign-Off

### Final Checks
- [ ] All critical paths tested
- [ ] No console errors
- [ ] All features documented
- [ ] Known issues logged
- [ ] Performance verified

### Approvals
- [ ] QA Team: _______________
- [ ] Product Manager: _______________
- [ ] Tech Lead: _______________
- [ ] Date: _______________

---

## Test Results Template

```
Device: iPhone 14 Pro (iOS 17.0)
Browser: Safari
Date: YYYY-MM-DD
Tester: Name

Pass Rate: XX/YY (XX%)

Critical Issues:
- Issue 1
- Issue 2

Minor Issues:
- Issue 1
- Issue 2

Notes:
- Additional observations
```

---

## Automated Testing (Future)

- [ ] Playwright mobile tests
- [ ] Jest unit tests
- [ ] Visual regression tests
- [ ] Performance regression tests
- [ ] CI/CD integration
