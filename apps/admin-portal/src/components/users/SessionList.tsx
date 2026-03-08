'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LogOut, Monitor, Smartphone, AlertCircle } from 'lucide-react';
import { useUserSessions, useRevokeAllSessions } from '@/hooks/use-users';
import { RevokeSessionDialog } from './RevokeSessionDialog';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface SessionListProps {
  userId: string;
}

interface Session {
  id: string;
  userId: string;
  userAgent?: string;
  ipHash?: string;
  lastActivityAt: string;
  createdAt: string;
  expiresAt: string;
}

function parseUserAgent(userAgent?: string) {
  if (!userAgent) {
    return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  }

  // Simple user agent parsing
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(userAgent);

  let browser = 'Unknown';
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Edge')) browser = 'Edge';

  let os = 'Unknown';
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';

  const device = isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop';

  return { browser, os, device };
}

export function SessionList({ userId }: SessionListProps) {
  const { data: sessions, isLoading, error } = useUserSessions(userId);
  const revokeAllSessions = useRevokeAllSessions();
  const [selectedSession, setSelectedSession] = useState<{
    sessionId: string;
    deviceInfo: string;
  } | null>(null);

  const handleRevokeAll = async () => {
    if (!confirm('Are you sure you want to revoke all sessions? The user will be logged out from all devices.')) {
      return;
    }

    try {
      await revokeAllSessions.mutateAsync(userId);
      toast.success('All sessions revoked successfully');
    } catch (error) {
      toast.error('Failed to revoke sessions');
      console.error('Revoke all sessions error:', error);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Loading sessions...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load sessions. Please try again.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const sessionList = sessions || [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>
                Manage the user's active sessions across all devices
              </CardDescription>
            </div>
            {sessionList.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevokeAll}
                disabled={revokeAllSessions.isPending}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {revokeAllSessions.isPending ? 'Revoking...' : 'Revoke All'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sessionList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active sessions found
            </div>
          ) : (
            <div className="space-y-4">
              {sessionList.map((session: Session) => {
                const { browser, os, device } = parseUserAgent(session.userAgent);
                const deviceInfo = `${browser} on ${os} (${device})`;

                return (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="rounded-full bg-primary/10 p-2">
                        {device === 'Mobile' || device === 'Tablet' ? (
                          <Smartphone className="h-5 w-5 text-primary" />
                        ) : (
                          <Monitor className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{deviceInfo}</span>
                          <Badge variant="outline" className="text-xs">
                            {device}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {session.ipHash && (
                            <span>IP: {session.ipHash.substring(0, 12)}...</span>
                          )}
                          <span>
                            Last active{' '}
                            {formatDistanceToNow(new Date(session.lastActivityAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelectedSession({ sessionId: session.id, deviceInfo })
                      }
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Revoke
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSession && (
        <RevokeSessionDialog
          userId={userId}
          sessionId={selectedSession.sessionId}
          deviceInfo={selectedSession.deviceInfo}
          open={!!selectedSession}
          onOpenChange={(open) => !open && setSelectedSession(null)}
        />
      )}
    </>
  );
}
