'use client';

import { useAuth } from '@/hooks/use-auth';

interface UserAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

export function UserAvatar({ size = 'md', showName = false, className = '' }: UserAvatarProps) {
  const { user } = useAuth();

  if (!user) return null;

  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user.email[0].toUpperCase();

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {user.image ? (
        <img
          src={user.image}
          alt={user.name || user.email}
          className={`rounded-full ${sizeClasses[size]}`}
        />
      ) : (
        <div
          className={`flex items-center justify-center rounded-full bg-blue-600 font-medium text-white ${sizeClasses[size]}`}
        >
          {initials}
        </div>
      )}
      {showName && (
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-900">{user.name || user.email}</span>
          <span className="text-xs text-gray-500">{user.email}</span>
        </div>
      )}
    </div>
  );
}
