'use client';

import { Avatar, AvatarGroup, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@patina/design-system';
import { Wifi, WifiOff, Users } from 'lucide-react';
import type { PresenceInfo, ConnectionQuality } from '@/lib/projects-websocket';

interface CollaborationPresenceProps {
  presence: PresenceInfo[];
  isConnected: boolean;
  connectionQuality: ConnectionQuality | null;
  className?: string;
}

function getConnectionColor(quality: ConnectionQuality | null, isConnected: boolean): string {
  if (!isConnected) return 'text-gray-400';
  if (!quality) return 'text-gray-400';
  switch (quality.status) {
    case 'excellent':
    case 'good':
      return 'text-green-500';
    case 'fair':
      return 'text-yellow-500';
    case 'poor':
      return 'text-red-500';
    default:
      return 'text-gray-400';
  }
}

function getConnectionLabel(quality: ConnectionQuality | null, isConnected: boolean): string {
  if (!isConnected) return 'Disconnected';
  if (!quality) return 'Connecting...';
  switch (quality.status) {
    case 'excellent':
      return `Connected (${quality.latencyMs}ms)`;
    case 'good':
      return `Good connection (${quality.latencyMs}ms)`;
    case 'fair':
      return `Fair connection (${quality.latencyMs}ms)`;
    case 'poor':
      return `Poor connection (${quality.latencyMs}ms)`;
    default:
      return 'Unknown';
  }
}

/**
 * Shows online collaborators and connection quality for real-time project collaboration.
 */
export function CollaborationPresence({
  presence,
  isConnected,
  connectionQuality,
  className,
}: CollaborationPresenceProps) {
  const WifiIcon = isConnected ? Wifi : WifiOff;
  const connectionColor = getConnectionColor(connectionQuality, isConnected);
  const connectionLabel = getConnectionLabel(connectionQuality, isConnected);

  return (
    <TooltipProvider>
      <div className={`flex items-center gap-3 ${className ?? ''}`}>
        {/* Connection status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className={`flex items-center gap-1.5 ${connectionColor}`}>
              <WifiIcon className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{connectionLabel}</p>
          </TooltipContent>
        </Tooltip>

        {/* Online users */}
        {presence.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 cursor-default">
                <AvatarGroup max={4} size="xs" spacing="tight">
                  {presence.map((p) => (
                    <Avatar
                      key={p.userId}
                      name={p.userId.slice(0, 8)}
                      size="xs"
                      status="online"
                    />
                  ))}
                </AvatarGroup>
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  <Users className="h-3 w-3 inline mr-1" />
                  {presence.length} online
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {presence.length} collaborator{presence.length !== 1 ? 's' : ''} online
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {presence.length === 0 && isConnected && (
          <span className="text-xs text-gray-400 dark:text-gray-500">Only you</span>
        )}
      </div>
    </TooltipProvider>
  );
}
