import * as React from 'react';
import { Avatar } from '@ds-stories/packages/patina-design-system/src/components/Avatar/Avatar';

// Owned preview. The Avatar component renders its initials via Radix
// Avatar.Fallback with delayMs={fallbackDelay} (default 600ms): Radix waits
// that long before mounting the fallback to avoid a flash while an image
// loads. The storybook reference capture waits long enough for the fallback to
// appear, but the design-sync preview capture fires earlier, so no-src avatars
// (Default/Sizes/Shapes/With Status) render as empty circles. We mirror the
// story JSX exactly but pass fallbackDelay={0} so the initials render on the
// first paint and the preview matches the storybook truth. Image/status stories
// are unaffected by the change (image still wins once loaded).
const D = 0;

export const Default = () => <Avatar name="John Doe" fallbackDelay={D} />;

export const WithImage = () => (
  <Avatar
    src="https://api.dicebear.com/7.x/avataaars/svg?seed=John"
    alt="John Doe"
    name="John Doe"
    fallbackDelay={D}
  />
);

export const WithStatus = () => (
  <Avatar name="John Doe" status="online" fallbackDelay={D} />
);

export const AllStatuses = () => (
  <div className="flex gap-4">
    <Avatar name="Online User" status="online" fallbackDelay={D} />
    <Avatar name="Offline User" status="offline" fallbackDelay={D} />
    <Avatar name="Busy User" status="busy" fallbackDelay={D} />
    <Avatar name="Away User" status="away" fallbackDelay={D} />
  </div>
);

export const Sizes = () => (
  <div className="flex items-center gap-4">
    <Avatar name="XS" size="xs" fallbackDelay={D} />
    <Avatar name="SM" size="sm" fallbackDelay={D} />
    <Avatar name="MD" size="md" fallbackDelay={D} />
    <Avatar name="LG" size="lg" fallbackDelay={D} />
    <Avatar name="XL" size="xl" fallbackDelay={D} />
    <Avatar name="2XL" size="2xl" fallbackDelay={D} />
  </div>
);

export const Shapes = () => (
  <div className="flex gap-4">
    <Avatar name="Circle" shape="circle" fallbackDelay={D} />
    <Avatar name="Square" shape="square" fallbackDelay={D} />
  </div>
);

export const SquareWithImage = () => (
  <Avatar
    src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jane"
    alt="Jane Doe"
    name="Jane Doe"
    shape="square"
    size="xl"
    fallbackDelay={D}
  />
);

export const LargeWithStatus = () => (
  <Avatar
    src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alice"
    alt="Alice"
    name="Alice"
    size="xl"
    status="online"
    fallbackDelay={D}
  />
);

export const FallbackInitials = () => (
  <div className="flex gap-4">
    <Avatar name="John Doe" fallbackDelay={D} />
    <Avatar name="Jane Smith" fallbackDelay={D} />
    <Avatar name="Madonna" fallbackDelay={D} />
    <Avatar name="Jean-Baptiste Zorg" fallbackDelay={D} />
  </div>
);

export const NoName = () => <Avatar fallbackDelay={D} />;

export const ImageLoadingFallback = () => (
  <Avatar src="https://invalid-url.com/avatar.jpg" name="Fallback User" fallbackDelay={D} />
);
