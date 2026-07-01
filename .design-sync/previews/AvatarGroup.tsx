import * as React from 'react';
import { Avatar } from '@ds-stories/packages/patina-design-system/src/components/Avatar/Avatar';
import { AvatarGroup } from '@ds-stories/packages/patina-design-system/src/components/AvatarGroup/AvatarGroup';

// Owned preview. Same root cause as Avatar: the child Avatars render their
// initials via Radix Avatar.Fallback with delayMs=600, which the preview
// capture fires before, so initials come up blank while the storybook
// reference (captured later) shows them. We mirror the story JSX exactly and
// pass fallbackDelay={0} to each child so the initials render immediately.
// NOTE: the "+N" overflow chip is created *inside* AvatarGroup with the default
// fallbackDelay (600ms) and is not reachable from here, so on overflow stories
// (With Max/Many Users/Tight Spacing/Loose Spacing/Small Size) the "+N" circle
// may still capture blank. That residual is a component-level timing issue, not
// something an owned preview can override.
const D = 0;

export const Default = () => (
  <AvatarGroup>
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=John" name="John Doe" fallbackDelay={D} />
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jane" name="Jane Smith" fallbackDelay={D} />
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=Bob" name="Bob Johnson" fallbackDelay={D} />
  </AvatarGroup>
);

export const WithMax = () => (
  <AvatarGroup max={3}>
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=1" name="User 1" fallbackDelay={D} />
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=2" name="User 2" fallbackDelay={D} />
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=3" name="User 3" fallbackDelay={D} />
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=4" name="User 4" fallbackDelay={D} />
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=5" name="User 5" fallbackDelay={D} />
  </AvatarGroup>
);

export const ManyUsers = () => (
  <AvatarGroup max={4}>
    {Array.from({ length: 10 }, (_, i) => (
      <Avatar
        key={i}
        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`}
        name={`User ${i + 1}`}
        fallbackDelay={D}
      />
    ))}
  </AvatarGroup>
);

export const TightSpacing = () => (
  <AvatarGroup spacing="tight">
    <Avatar name="John Doe" fallbackDelay={D} />
    <Avatar name="Jane Smith" fallbackDelay={D} />
    <Avatar name="Bob Johnson" fallbackDelay={D} />
    <Avatar name="Alice Williams" fallbackDelay={D} />
  </AvatarGroup>
);

export const LooseSpacing = () => (
  <AvatarGroup spacing="loose">
    <Avatar name="John Doe" fallbackDelay={D} />
    <Avatar name="Jane Smith" fallbackDelay={D} />
    <Avatar name="Bob Johnson" fallbackDelay={D} />
    <Avatar name="Alice Williams" fallbackDelay={D} />
  </AvatarGroup>
);

export const SmallSize = () => (
  <AvatarGroup size="sm" max={3}>
    <Avatar name="John Doe" fallbackDelay={D} />
    <Avatar name="Jane Smith" fallbackDelay={D} />
    <Avatar name="Bob Johnson" fallbackDelay={D} />
    <Avatar name="Alice Williams" fallbackDelay={D} />
    <Avatar name="Charlie Brown" fallbackDelay={D} />
  </AvatarGroup>
);

export const LargeSize = () => (
  <AvatarGroup size="lg" max={3}>
    <Avatar name="John Doe" fallbackDelay={D} />
    <Avatar name="Jane Smith" fallbackDelay={D} />
    <Avatar name="Bob Johnson" fallbackDelay={D} />
    <Avatar name="Alice Williams" fallbackDelay={D} />
  </AvatarGroup>
);

export const SquareShape = () => (
  <AvatarGroup shape="square" max={3}>
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=square1" name="User 1" fallbackDelay={D} />
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=square2" name="User 2" fallbackDelay={D} />
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=square3" name="User 3" fallbackDelay={D} />
    <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=square4" name="User 4" fallbackDelay={D} />
  </AvatarGroup>
);

export const WithStatus = () => (
  <AvatarGroup max={4}>
    <Avatar name="John Doe" status="online" fallbackDelay={D} />
    <Avatar name="Jane Smith" status="busy" fallbackDelay={D} />
    <Avatar name="Bob Johnson" status="away" fallbackDelay={D} />
    <Avatar name="Alice Williams" status="offline" fallbackDelay={D} />
    <Avatar name="Charlie Brown" status="online" fallbackDelay={D} />
  </AvatarGroup>
);
