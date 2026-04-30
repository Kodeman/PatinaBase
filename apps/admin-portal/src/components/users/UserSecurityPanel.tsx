'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { useUserMfa, useToggleUserMfaEnforced } from '@/hooks/use-admin-user-mfa';

interface Props {
  userId: string;
}

export function UserSecurityPanel({ userId }: Props) {
  const { data, isLoading, isError, error } = useUserMfa(userId);
  const toggle = useToggleUserMfaEnforced(userId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Multi-factor authentication
          </CardTitle>
          <CardDescription>
            Per-user MFA factor inventory and platform-enforced enrollment requirement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load MFA state: {(error as Error)?.message ?? 'unknown error'}
              </AlertDescription>
            </Alert>
          ) : isLoading || !data ? (
            <p className="text-sm text-muted-foreground">Loading MFA state…</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">Enforce MFA at sign-in</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-lg">
                    When on, the admin portal middleware will redirect this user to MFA
                    enrollment if they have no verified factor or are signed in at AAL1.
                    Toggling this is recorded in the audit log.
                  </p>
                </div>
                <Switch
                  checked={data.enforced}
                  disabled={toggle.isPending}
                  onCheckedChange={(v) => toggle.mutate(v)}
                />
              </div>

              {data.enforced && !data.hasVerifiedFactor && (
                <Alert>
                  <ShieldAlert className="h-4 w-4" />
                  <AlertDescription>
                    MFA is enforced but this user has no verified factor. They will be
                    redirected to enrollment on next sign-in.
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <p className="font-medium mb-3">Verified factors</p>
                {data.factors.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldOff className="h-4 w-4" />
                    No factors enrolled.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.factors.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between border rounded-md px-4 py-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{f.type}</span>
                            <Badge
                              variant={f.status === 'verified' ? 'default' : 'secondary'}
                              className="capitalize"
                            >
                              {f.status}
                            </Badge>
                          </div>
                          {f.friendlyName && (
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {f.friendlyName}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Enrolled {formatDateTime(f.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
