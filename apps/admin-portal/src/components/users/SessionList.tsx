'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Monitor, Smartphone, AlertCircle } from 'lucide-react';
import { useUserSessions } from '@/hooks/use-users';
import { formatDistanceToNow } from 'date-fns';

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

// A "Revoke All" button used to sit in this header. It had no working
// backend: the installed supabase-js (@supabase/auth-js 2.98.0) exposes no
// admin-side, userId-scoped session invalidation — GoTrueAdminApi.signOut
// takes the target session's own JWT, which the admin portal never holds.
// Rather than keep a control that 404s on every click, the surface is now
// read-only and says so.
export function SessionList({ userId }: SessionListProps) {
  const { data: sessions, isLoading, error } = useUserSessions(userId);

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
          <div>
            <CardTitle>Active Sessions</CardTitle>
            <CardDescription>
              The user&apos;s active sessions across all devices
            </CardDescription>
            <p className="mt-2 text-xs text-muted-foreground">
              View only — the auth backend supports no admin-side session
              revocation, so sessions can&apos;t be ended from here.
            </p>
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
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
