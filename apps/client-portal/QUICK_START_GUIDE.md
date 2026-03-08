# Client Portal - Quick Start Guide

**For:** Development teams building on Team Alpha's foundation
**Last Updated:** October 6, 2025

---

## 5-Minute Setup

### 1. Navigate to Client Portal
```bash
cd /home/middle/patina/apps/client-portal
```

### 2. Install Dependencies (from monorepo root)
```bash
cd ../..
pnpm install
cd apps/client-portal
```

### 3. Copy Environment File
```bash
cp .env.example .env.local
```

### 4. Start Development Server
```bash
pnpm dev
```

### 5. Open Browser
```
http://localhost:3010
```

### 6. Sign In (Development Mode)
- **Email:** Any email (e.g., `client@patina.com`)
- **Password:** Any password
- **Auto-assigned role:** Client

**You're ready to build!**

---

## Quick Reference

### Common Commands

```bash
# Development
pnpm dev              # Start dev server (port 3010)
pnpm build            # Build for production
pnpm start            # Start production server

# Code Quality
pnpm lint             # Run linter
pnpm type-check       # TypeScript validation
pnpm lint:fix         # Auto-fix linting issues

# Clean
pnpm clean            # Remove .next directory
```

### Environment Variables

**Required (Development):**
```bash
NEXTAUTH_SECRET=dev-secret-key-change-in-production
NEXTAUTH_URL=http://localhost:3010
```

**Optional (connects to backend):**
```bash
NEXT_PUBLIC_PROJECTS_API_URL=http://localhost:3016
NEXT_PUBLIC_MEDIA_API_URL=http://localhost:3014
NEXT_PUBLIC_COMMS_API_URL=http://localhost:3017
NEXT_PUBLIC_WS_URL=http://localhost:3016
NEXT_PUBLIC_WS_NAMESPACE=/projects
```

> **Note:** WebSocket real-time features require additional setup. See [WEBSOCKET_SETUP.md](./WEBSOCKET_SETUP.md) for details.

---

## File Structure Reference

```
src/
├── app/                          # Next.js 15 App Router
│   ├── (dashboard)/             # Dashboard routes (Team Foxtrot added)
│   ├── api/auth/                # NextAuth API
│   ├── auth/                    # Auth pages
│   ├── project/[id]/            # Project routes
│   │   ├── page.tsx            # 👈 Timeline (Team Bravo)
│   │   ├── milestone/          # 👈 Milestone detail (Team Charlie)
│   │   └── approval/           # 👈 Approval theater (Team Delta)
│   ├── projects/                # Projects list
│   ├── notifications/           # Notification center
│   ├── settings/               # Settings page
│   ├── layout.tsx              # Root layout
│   └── globals.css             # Global styles
│
├── components/
│   ├── layout/                  # Layout components
│   │   ├── client-header.tsx   # Main navigation
│   │   ├── client-footer.tsx   # Footer
│   │   └── client-layout.tsx   # Main wrapper
│   ├── ui/                      # Base UI components
│   │   ├── loading-spinner.tsx
│   │   ├── error-boundary.tsx
│   │   └── notification-badge.tsx
│   ├── project/                 # 👈 Add your project components here
│   ├── timeline/                # 👈 Add timeline components here
│   ├── mobile/                  # 👈 Mobile components (Team Foxtrot)
│   └── providers.tsx            # Global providers
│
├── hooks/
│   └── use-websocket.ts        # WebSocket React hooks
│
├── lib/
│   ├── auth.ts                  # NextAuth config
│   ├── env.ts                   # Environment config
│   ├── websocket.ts             # WebSocket client
│   ├── api-client.ts            # API services
│   ├── react-query.ts           # React Query config
│   └── utils.ts                 # Utility functions
│
└── types/                       # 👈 Add your TypeScript types here
```

---

## Integration Examples

### Add a New Component

```typescript
// src/components/timeline/timeline-segment.tsx
'use client';

import { useRealtimeProject } from '@/hooks/use-websocket';
import { projectService } from '@/lib/api-client';

interface TimelineSegmentProps {
  projectId: string;
  segmentId: string;
}

export function TimelineSegment({ projectId, segmentId }: TimelineSegmentProps) {
  // Real-time updates
  useRealtimeProject(projectId);

  // Fetch data
  const { data, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'timeline', segmentId],
    queryFn: () => projectService.getTimeline(projectId),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="timeline-segment">
      {/* Your component UI */}
    </div>
  );
}
```

### Use WebSocket Events

```typescript
'use client';

import { useWebSocketEvent } from '@/hooks/use-websocket';

export function MilestoneCard({ milestoneId }: { milestoneId: string }) {
  // Listen for milestone completion
  useWebSocketEvent('milestone_completed', (data) => {
    if (data.milestoneId === milestoneId) {
      // Show celebration animation
      showCelebration();
    }
  });

  return <div>Milestone Card</div>;
}
```

### Fetch API Data

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { projectService } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query';

export function ProjectTimeline({ projectId }: { projectId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.timeline(projectId),
    queryFn: () => projectService.getTimeline(projectId),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return <Timeline data={data} />;
}
```

### Submit Data

```typescript
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectService } from '@/lib/api-client';

export function ApprovalButton({ projectId, approvalId }: Props) {
  const queryClient = useQueryClient();

  const { mutate, isLoading } = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') =>
      projectService.submitApproval(projectId, approvalId, decision),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'approvals'],
      });
    },
  });

  return (
    <button
      onClick={() => mutate('approved')}
      disabled={isLoading}
    >
      Approve
    </button>
  );
}
```

---

## Team-Specific Starting Points

### Team Bravo (Timeline Experience)

**Start Here:**
```
src/app/project/[id]/page.tsx
```

**Create:**
```
src/components/timeline/
├── immersive-timeline.tsx      # Main timeline component
├── timeline-segment.tsx        # Individual segment
├── scroll-progress.tsx         # Progress indicator
└── parallax-layer.tsx          # Parallax effects
```

**Use These Hooks:**
```typescript
import { useRealtimeProject } from '@/hooks/use-websocket';
import { projectService } from '@/lib/api-client';
```

### Team Charlie (Milestones & Celebrations)

**Start Here:**
```
src/app/project/[id]/milestone/[milestoneId]/page.tsx
```

**Create:**
```
src/components/milestone/
├── milestone-card.tsx          # Milestone display
├── celebration-animation.tsx   # Confetti, sparkles
├── progress-gallery.tsx        # Photo gallery
└── achievement-badge.tsx       # Achievement display
```

**Use These Hooks:**
```typescript
import { useRealtimeMilestones } from '@/hooks/use-websocket';
import { projectService, mediaService } from '@/lib/api-client';
```

### Team Delta (Approval Workflows)

**Start Here:**
```
src/app/project/[id]/approval/[approvalId]/page.tsx
```

**Create:**
```
src/components/approval/
├── approval-theater.tsx        # Full-screen approval
├── before-after-slider.tsx     # Comparison view
├── cost-visualizer.tsx         # Cost breakdown
└── decision-form.tsx           # Approval form
```

**Use These Hooks:**
```typescript
import { useRealtimeApprovals } from '@/hooks/use-websocket';
import { projectService } from '@/lib/api-client';
```

---

## Common Patterns

### Protected Page (Client Role)

```typescript
// src/app/my-page/page.tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function MyPage() {
  const session = await auth();

  if (!session) {
    redirect('/auth/signin');
  }

  if (!session.user.roles.includes('client')) {
    redirect('/auth/error?error=AccessDenied');
  }

  return <div>Protected content</div>;
}
```

### Loading State

```typescript
import { LoadingSpinner, LoadingScreen } from '@/components/ui/loading-spinner';

// Inline spinner
<LoadingSpinner size="md" message="Loading project..." />

// Full screen
<LoadingScreen message="Preparing your timeline..." />
```

### Error Handling

```typescript
import { ErrorBoundary } from '@/components/ui/error-boundary';

<ErrorBoundary fallback={<CustomError />}>
  <YourComponent />
</ErrorBoundary>
```

### Responsive Design

```typescript
// Use Tailwind responsive classes
<div className="
  flex flex-col        // Mobile (default)
  md:flex-row         // Tablet (≥768px)
  lg:grid lg:grid-cols-3  // Desktop (≥1024px)
">
  Content
</div>
```

### Animations

```typescript
// Use Tailwind animation classes
<div className="animate-fade-in-up">
  Appears with animation
</div>

// Or Framer Motion
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6 }}
>
  Content
</motion.div>
```

---

## Styling Guide

### Design System Colors

```scss
// Timeline colors
timeline-past: #94a3b8      // Completed
timeline-present: #6366f1   // Active
timeline-future: #e0e7ff    // Upcoming

// Celebration colors
celebration-achievement: #10b981
celebration-approval: #8b5cf6
celebration-completion: #f59e0b
```

### Common Classes

```scss
// Containers
.container              // Max-width container with padding

// Cards
.bg-card .border .rounded-lg .p-6

// Buttons
.bg-primary .text-primary-foreground
.hover:bg-primary/90 .transition-colors

// Text
.text-foreground        // Primary text
.text-muted-foreground  // Secondary text
.font-heading           // Playfair Display
.font-body              // Inter
```

---

## Testing Your Work

### Manual Testing

```bash
# 1. Start dev server
pnpm dev

# 2. Open browser
http://localhost:3010

# 3. Test on different devices
# - Desktop (> 1024px)
# - Tablet (768-1024px)
# - Mobile (< 768px)

# 4. Test features
# - Authentication
# - Navigation
# - WebSocket connection
# - API calls
# - Responsive design
```

### Browser DevTools

```javascript
// Check WebSocket connection
// Open Console and run:
window.wsClient = require('@/lib/websocket').wsClient;
wsClient.isConnected(); // Should return true

// Monitor events
wsClient.on('project_update', (data) => {
  console.log('Project updated:', data);
});
```

---

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3010
lsof -ti:3010 | xargs kill -9

# Or use different port
pnpm dev -- -p 3011
```

### TypeScript Errors

```bash
# Clear cache and rebuild
rm -rf .next
pnpm type-check
pnpm build
```

### WebSocket Connection Issues

The Client Portal uses a stub WebSocket implementation by default. Real-time features are disabled but the app works without errors.

To enable real-time features, see the comprehensive guide:
```bash
# Read the setup guide
cat WEBSOCKET_SETUP.md

# Or open in your editor
code WEBSOCKET_SETUP.md
```

Quick summary:
1. Install `socket.io-client`
2. Update WebSocket client to use Socket.IO
3. Start projects service on port 3016
4. Enable real-time updates in `.env.local`

### Authentication Issues

```bash
# Clear session
# Delete cookies in browser DevTools

# Or restart server
# Ctrl+C then pnpm dev
```

---

## Getting Help

### Documentation
- **Main README**: `/apps/client-portal/README.md`
- **Implementation Summary**: `/CLIENT_PORTAL_IMPLEMENTATION_SUMMARY.md`
- **Delivery Report**: `/TEAM_ALPHA_DELIVERY_REPORT.md`

### Code Examples
- Look at existing pages in `src/app/`
- Check component patterns in `src/components/`
- Review hooks in `src/hooks/`

### Team Alpha Contacts
- See delivery report for handoff documentation
- Review integration examples for each team

---

## Next Steps

1. ✅ Complete this quick start
2. ✅ Review team-specific starting point above
3. ✅ Create your component directory
4. ✅ Start building!

**Good luck building amazing features!**

---

*Last Updated: October 6, 2025 - Team Alpha*
