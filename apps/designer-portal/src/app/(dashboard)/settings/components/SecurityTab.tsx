'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useChangePassword } from '@/hooks/use-profile';
import { useSessions, useRevokeSession, useRevokeAllSessions } from '@/hooks/use-sessions';
import { useMfaFactors, useUnenrollMfa } from '@patina/supabase';
import { Button, Input, Alert, Badge } from '@patina/design-system';
import { Monitor, Trash2, Shield, ShieldCheck, ShieldAlert, Smartphone } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { MfaEnrollDialog } from './MfaEnrollDialog';

export function SecurityTab() {
  const { signOut } = useAuth();
  const changePassword = useChangePassword();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const revokeSession = useRevokeSession();
  const revokeAllSessions = useRevokeAllSessions();
  const { factors, isLoading: mfaLoading, hasMfaEnabled } = useMfaFactors();
  const unenrollMfa = useUnenrollMfa();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [mfaEnrollOpen, setMfaEnrollOpen] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaSuccess, setMfaSuccess] = useState<string | null>(null);

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 12) {
      setPasswordError('Password must be at least 12 characters');
      return;
    }

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await revokeSession.mutateAsync(sessionId);
    } catch (err: any) {
      console.error('Failed to revoke session:', err);
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      await revokeAllSessions.mutateAsync();
    } catch (err: any) {
      console.error('Failed to revoke all sessions:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Password Change Section */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
        <p className="mt-1 text-sm text-gray-600">
          Update your password to keep your account secure
        </p>

        {passwordError && (
          <Alert variant="destructive" className="mt-4">
            {passwordError}
          </Alert>
        )}

        {passwordSuccess && (
          <Alert variant="success" className="mt-4">
            Password changed successfully!
          </Alert>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Current Password</label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1"
              placeholder="Enter current password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">New Password</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1"
              placeholder="Enter new password (min 12 characters)"
            />
            <p className="mt-1 text-xs text-gray-500">
              Must contain uppercase, lowercase, number, and special character
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1"
              placeholder="Confirm new password"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleChangePassword}
              disabled={changePassword.isPending || !currentPassword || !newPassword}
            >
              {changePassword.isPending ? 'Changing...' : 'Change Password'}
            </Button>
          </div>
        </div>
      </div>

      {/* Active Sessions Section */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Active Sessions</h2>
            <p className="mt-1 text-sm text-gray-600">
              Manage your active sessions across devices
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevokeAllSessions}
            disabled={revokeAllSessions.isPending}
          >
            Sign Out All Others
          </Button>
        </div>

        <div className="mt-4">
          {sessionsLoading ? (
            <p className="text-sm text-gray-500">Loading sessions...</p>
          ) : sessions && sessions.length > 0 ? (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-md border p-4"
                >
                  <div className="flex items-center gap-3">
                    <Monitor className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {session.deviceInfo?.browser || 'Unknown Device'}
                      </p>
                      <p className="text-xs text-gray-500">
                        Last active: {formatDate(new Date(session.lastUsedAt))}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={revokeSession.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No active sessions found</p>
          )}
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {hasMfaEnabled ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-500" />
            )}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Two-Factor Authentication
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {hasMfaEnabled
                  ? 'Your account is protected with two-factor authentication'
                  : 'Add an extra layer of security to your account'}
              </p>
            </div>
          </div>
          <Badge variant={hasMfaEnabled ? 'default' : 'secondary'}>
            {hasMfaEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>

        {mfaError && (
          <Alert variant="destructive" className="mt-4">
            {mfaError}
          </Alert>
        )}

        {mfaSuccess && (
          <Alert variant="success" className="mt-4">
            {mfaSuccess}
          </Alert>
        )}

        <div className="mt-4">
          {mfaLoading ? (
            <p className="text-sm text-gray-500">Loading MFA status...</p>
          ) : factors.length > 0 ? (
            <div className="space-y-3">
              {factors
                .filter((f) => f.status === 'verified')
                .map((factor) => (
                  <div
                    key={factor.id}
                    className="flex items-center justify-between rounded-md border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {factor.friendlyName || 'Authenticator App'}
                        </p>
                        <p className="text-xs text-gray-500">
                          Added {formatDate(new Date(factor.createdAt))}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setMfaError(null);
                        setMfaSuccess(null);
                        try {
                          await unenrollMfa.mutateAsync({
                            factorId: factor.id,
                          });
                          setMfaSuccess(
                            'Two-factor authentication has been disabled.'
                          );
                          // Reload to refresh factor list
                          window.location.reload();
                        } catch (err: any) {
                          setMfaError(
                            err.message ||
                              'Failed to disable two-factor authentication'
                          );
                        }
                      }}
                      disabled={unenrollMfa.isPending}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      {unenrollMfa.isPending ? 'Disabling...' : 'Disable'}
                    </Button>
                  </div>
                ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-dashed p-4">
              <Shield className="h-5 w-5 text-gray-400" />
              <p className="text-sm text-gray-500">
                No authenticator app configured. Set up two-factor
                authentication to secure your account.
              </p>
            </div>
          )}
        </div>

        {!hasMfaEnabled && (
          <Button className="mt-4" onClick={() => setMfaEnrollOpen(true)}>
            Set Up Two-Factor Authentication
          </Button>
        )}

        <MfaEnrollDialog
          open={mfaEnrollOpen}
          onOpenChange={setMfaEnrollOpen}
          onSuccess={() => {
            setMfaSuccess(
              'Two-factor authentication has been enabled successfully.'
            );
            // Reload to refresh factor list
            window.location.reload();
          }}
        />
      </div>

      {/* Sign Out Current Session */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Sign Out</h2>
        <p className="mt-1 text-sm text-gray-600">
          Sign out of your current session
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={signOut}
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
}
