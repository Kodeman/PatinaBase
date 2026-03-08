# ApprovalTheater Component

## Overview

The `ApprovalTheater` component creates a full-screen, immersive approval experience for client decisions. It provides a focused environment with clear information presentation, smooth animations, and comprehensive decision-making tools.

## Features

- ✅ **Full-screen & Modal Modes** - Choose between immersive fullscreen or centered modal
- ✅ **Blur Backdrop** - Configurable backdrop effects (blur, dim, none)
- ✅ **Before/After Comparison** - Side-by-side visual comparison
- ✅ **Cost Impact Visualization** - Integrated cost breakdown display
- ✅ **Timeline Impact** - Show project timeline changes
- ✅ **Designer Recommendations** - Visual indicators for suggested actions
- ✅ **Alternative Options** - Display alternative choices
- ✅ **Digital Signature** - Capture approval signatures
- ✅ **Keyboard Navigation** - Full keyboard support with Escape to close
- ✅ **Smooth Animations** - Framer Motion powered transitions

## Installation

```bash
# Already included in @patina/design-system
import { ApprovalTheater } from '@patina/design-system'
```

## Basic Usage

```tsx
import { useState } from 'react'
import { ApprovalTheater } from '@patina/design-system'

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false)

  const approval = {
    id: 'approval-1',
    title: 'Living Room Design Proposal',
    description: 'Modern minimalist redesign',
    type: 'design',
    status: 'pending',
    costImpact: {
      amount: 15000,
      currency: '$',
    },
    recommendedAction: 'approve'
  }

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Review Approval
      </button>

      <ApprovalTheater
        open={isOpen}
        onOpenChange={setIsOpen}
        approval={approval}
        onApprove={(id) => console.log('Approved:', id)}
      />
    </>
  )
}
```

## Props

### ApprovalTheaterProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | - | Controls modal visibility |
| `onOpenChange` | `(open: boolean) => void` | - | Called when modal state changes |
| `approval` | `ApprovalItem` | - | Approval item data |
| `mode` | `'fullscreen' \| 'modal'` | `'fullscreen'` | Display mode |
| `backdrop` | `'blur' \| 'dim' \| 'none'` | `'blur'` | Backdrop style |
| `onApprove` | `(id: string, signature?: string) => void` | - | Approval handler |
| `onRequestChanges` | `(id: string, changes: any) => void` | - | Change request handler |
| `onStartDiscussion` | `(id: string) => void` | - | Discussion handler |
| `onSaveForLater` | `(id: string) => void` | - | Save for later handler |
| `className` | `string` | - | Additional CSS classes |

### ApprovalItem Interface

```typescript
interface ApprovalItem {
  id: string
  title: string
  description: string
  type: 'design' | 'material' | 'timeline' | 'budget' | 'change-order'
  status: 'pending' | 'approved' | 'rejected' | 'discussion'

  // Visual content
  beforeImage?: string
  afterImage?: string
  images?: string[]

  // Impact analysis
  costImpact?: {
    amount: number
    currency: string
    breakdown?: CostBreakdownItem[]
  }

  timelineImpact?: {
    days: number
    newDeadline?: Date
    affectedMilestones?: string[]
  }

  // Guidance
  alternatives?: Alternative[]
  designerNote?: string
  recommendedAction?: 'approve' | 'discuss' | 'consider-alternative'
}
```

## Examples

### Fullscreen Mode with Blur Backdrop

```tsx
<ApprovalTheater
  open={isOpen}
  onOpenChange={setIsOpen}
  approval={approval}
  mode="fullscreen"
  backdrop="blur"
  onApprove={handleApprove}
/>
```

### Modal Mode with Dim Backdrop

```tsx
<ApprovalTheater
  open={isOpen}
  onOpenChange={setIsOpen}
  approval={approval}
  mode="modal"
  backdrop="dim"
  onApprove={handleApprove}
/>
```

### With Before/After Comparison

```tsx
const approval = {
  id: 'approval-1',
  title: 'Kitchen Renovation',
  type: 'design',
  status: 'pending',
  beforeImage: '/images/kitchen-before.jpg',
  afterImage: '/images/kitchen-after.jpg',
  // ... other props
}

<ApprovalTheater
  open={isOpen}
  onOpenChange={setIsOpen}
  approval={approval}
/>
```

### With Cost Impact

```tsx
const approval = {
  id: 'approval-1',
  title: 'Kitchen Renovation',
  type: 'design',
  status: 'pending',
  costImpact: {
    amount: 25000,
    currency: '$',
    breakdown: [
      { label: 'Cabinets', amount: 15000 },
      { label: 'Appliances', amount: 8000 },
      { label: 'Labor', amount: 2000 },
    ],
  },
  // ... other props
}
```

### With Timeline Impact

```tsx
const approval = {
  id: 'approval-1',
  title: 'Kitchen Renovation',
  type: 'design',
  status: 'pending',
  timelineImpact: {
    days: 5,
    newDeadline: new Date('2025-12-01'),
    affectedMilestones: ['Installation', 'Final Inspection'],
  },
  // ... other props
}
```

### With Designer Recommendations

```tsx
const approval = {
  id: 'approval-1',
  title: 'Kitchen Renovation',
  type: 'design',
  status: 'pending',
  designerNote: 'This design maximizes storage while maintaining an open feel',
  recommendedAction: 'approve',
  // ... other props
}
```

### With Alternative Options

```tsx
const approval = {
  id: 'approval-1',
  title: 'Kitchen Renovation',
  type: 'design',
  status: 'pending',
  alternatives: [
    {
      id: 'alt-1',
      title: 'Budget-Friendly Option',
      description: 'Similar design with laminate instead of marble',
      costDifference: -5000,
      timelineDifference: -3,
    },
    {
      id: 'alt-2',
      title: 'Premium Option',
      description: 'Include custom cabinetry and built-in appliances',
      costDifference: 8000,
      timelineDifference: 7,
    },
  ],
  // ... other props
}
```

## Keyboard Navigation

- `Escape` - Close the approval theater
- `Tab` - Navigate between interactive elements
- `Enter` - Activate buttons
- `Arrow Keys` - Navigate tabs

## Accessibility

The component is fully accessible with:

- ARIA labels on all interactive elements
- Keyboard navigation support
- Focus management (traps focus within modal)
- Screen reader announcements
- High contrast mode support
- Reduced motion support

## Styling

The component uses Tailwind CSS and can be customized via the `className` prop:

```tsx
<ApprovalTheater
  className="custom-approval-theater"
  approval={approval}
  open={isOpen}
  onOpenChange={setIsOpen}
/>
```

## Animation Details

- **Entry:** 300ms spring animation with opacity and scale
- **Exit:** 200ms ease-out with opacity and scale
- **Tab Switch:** 200ms slide transition
- **Backdrop:** 200ms fade in/out

## Best Practices

1. **Always provide a title and description** for context
2. **Include cost impact** when relevant to help decision-making
3. **Add designer notes** to provide professional guidance
4. **Show before/after images** for visual comparisons
5. **Provide alternatives** when applicable
6. **Handle all callback events** for complete user flows

## Related Components

- [`CostVisualizer`](../CostVisualizer/README.md) - Budget impact visualization
- [`ChangeRequestForm`](../ChangeRequestForm/README.md) - Change request interface
- [`ApprovalDiscussion`](../ApprovalDiscussion/README.md) - Real-time chat
- [`ApprovalCelebration`](../ApprovalCelebration/README.md) - Success celebration

## Troubleshooting

### Issue: Theater not opening
**Solution:** Ensure `open` prop is set to `true`

### Issue: Backdrop not visible
**Solution:** Check z-index conflicts and backdrop prop value

### Issue: Images not loading
**Solution:** Verify image URLs are accessible and CORS is configured

### Issue: Animations choppy
**Solution:** Ensure Framer Motion is properly installed

## Support

For issues or questions:
- Check the [Storybook documentation](http://localhost:6006)
- Review [TypeScript definitions](./ApprovalTheater.tsx)
- See [test examples](./ApprovalTheater.test.tsx)
