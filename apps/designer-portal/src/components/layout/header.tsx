'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Menu, Bell } from 'lucide-react';
import { Button, UserStatusMenu, type UserPresenceStatus } from '@patina/design-system';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { session, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [status, setStatus] = useState<UserPresenceStatus>('online');

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
      setIsSigningOut(false);
    }
  }, [signOut]);

  const handleStatusChange = useCallback((newStatus: UserPresenceStatus) => {
    setStatus(newStatus);
    // Future: persist status to localStorage or sync via WebSocket
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      <div className="flex flex-1 items-center gap-4">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Patina Designer Portal</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
          <span className="sr-only">Notifications</span>
        </Button>

        {session?.user && (
          <UserStatusMenu
            user={session.user}
            status={status}
            onStatusChange={handleStatusChange}
            onSignOut={handleSignOut}
            isSigningOut={isSigningOut}
          />
        )}
      </div>
    </header>
  );
}
