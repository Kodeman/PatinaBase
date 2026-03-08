'use client';

import { Box, Video, Rotate3D, View, Eye } from 'lucide-react';
import { Badge } from '@patina/design-system';
import { cn } from '@/lib/utils';

interface MediaBadgesProps {
  has3D?: boolean;
  arSupported?: boolean;
  hasVideo?: boolean;
  has360?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'overlay' | 'inline';
}

/**
 * Media capability badges for products
 * Shows AR, 3D, Video, and 360° view indicators
 */
export function MediaBadges({
  has3D,
  arSupported,
  hasVideo,
  has360,
  className,
  size = 'md',
  variant = 'inline',
}: MediaBadgesProps) {
  const badges = [];

  if (arSupported) {
    badges.push({
      key: 'ar',
      icon: View,
      label: 'AR View',
      color: 'purple' as const,
      tooltip: 'View in your space with AR',
    });
  }

  if (has3D) {
    badges.push({
      key: '3d',
      icon: Box,
      label: '3D Model',
      color: 'blue' as const,
      tooltip: 'Interactive 3D model available',
    });
  }

  if (hasVideo) {
    badges.push({
      key: 'video',
      icon: Video,
      label: 'Video',
      color: 'green' as const,
      tooltip: 'Product video available',
    });
  }

  if (has360) {
    badges.push({
      key: '360',
      icon: Rotate3D,
      label: '360° View',
      color: 'orange' as const,
      tooltip: '360° product view',
    });
  }

  if (badges.length === 0) return null;

  const sizeClasses = {
    sm: 'text-xs gap-1',
    md: 'text-sm gap-1.5',
    lg: 'text-base gap-2',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  };

  return (
    <div
      className={cn(
        'flex flex-wrap gap-2',
        variant === 'overlay' && 'absolute top-2 left-2 z-10',
        className
      )}
    >
      {badges.map((badge) => {
        const Icon = badge.icon;
        return (
          <Badge
            key={badge.key}
            variant={variant === 'overlay' ? 'solid' : 'subtle'}
            color={badge.color}
            className={cn(
              'flex items-center',
              sizeClasses[size],
              variant === 'overlay' && 'shadow-lg backdrop-blur-sm'
            )}
            title={badge.tooltip}
          >
            <Icon className={iconSizes[size]} />
            <span>{badge.label}</span>
          </Badge>
        );
      })}
    </div>
  );
}

/**
 * Compact media icons (icons only, no labels)
 */
export function MediaIcons({
  has3D,
  arSupported,
  hasVideo,
  has360,
  className,
  size = 'md',
}: Omit<MediaBadgesProps, 'variant'>) {
  const icons = [];

  if (arSupported) {
    icons.push({
      key: 'ar',
      icon: View,
      tooltip: 'AR View Available',
      color: 'text-purple-600',
    });
  }

  if (has3D) {
    icons.push({
      key: '3d',
      icon: Box,
      tooltip: '3D Model Available',
      color: 'text-blue-600',
    });
  }

  if (hasVideo) {
    icons.push({
      key: 'video',
      icon: Video,
      tooltip: 'Video Available',
      color: 'text-green-600',
    });
  }

  if (has360) {
    icons.push({
      key: '360',
      icon: Rotate3D,
      tooltip: '360° View Available',
      color: 'text-orange-600',
    });
  }

  if (icons.length === 0) return null;

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {icons.map((icon) => {
        const Icon = icon.icon;
        return (
          <div
            key={icon.key}
            className={cn(
              'rounded-full p-1 bg-background/80 backdrop-blur-sm',
              icon.color
            )}
            title={icon.tooltip}
          >
            <Icon className={sizeClasses[size]} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * AR View button component
 */
export function ARViewButton({
  onClick,
  className,
  disabled = false,
}: {
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
        'bg-gradient-to-r from-purple-600 to-blue-600 text-white',
        'hover:from-purple-700 hover:to-blue-700',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'shadow-lg hover:shadow-xl',
        className
      )}
    >
      <View className="h-5 w-5" />
      <span>View in Your Space</span>
    </button>
  );
}

/**
 * 3D Model viewer button
 */
export function ThreeDViewButton({
  onClick,
  className,
  disabled = false,
}: {
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
        'bg-gradient-to-r from-blue-600 to-cyan-600 text-white',
        'hover:from-blue-700 hover:to-cyan-700',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'shadow-lg hover:shadow-xl',
        className
      )}
    >
      <Box className="h-5 w-5" />
      <span>View 3D Model</span>
    </button>
  );
}

/**
 * 360° View button
 */
export function View360Button({
  onClick,
  className,
  disabled = false,
}: {
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
        'bg-gradient-to-r from-orange-600 to-red-600 text-white',
        'hover:from-orange-700 hover:to-red-700',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'shadow-lg hover:shadow-xl',
        className
      )}
    >
      <Rotate3D className="h-5 w-5" />
      <span>360° View</span>
    </button>
  );
}
