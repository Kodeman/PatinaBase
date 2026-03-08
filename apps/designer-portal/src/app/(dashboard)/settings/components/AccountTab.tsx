'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button, Alert } from '@patina/design-system';
import { AlertTriangle } from 'lucide-react';

export function AccountTab() {
  const { user } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      // TODO: Wire up to actual backend endpoint for account deletion
      // This should trigger the privacy/delete workflow
      await new Promise((resolve) => setTimeout(resolve, 1000));
      alert('Account deletion request submitted. You will receive a confirmation email.');
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Failed to request account deletion:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Information */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Account Settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Manage your account preferences and settings
        </p>

        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-gray-900">User ID</h3>
            <p className="mt-1 text-sm text-gray-600 font-mono">{user?.id}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-900">Account Type</h3>
            <p className="mt-1 text-sm text-gray-600">Professional Designer Account</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-900">Account Status</h3>
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-lg border-2 border-red-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-red-600">Danger Zone</h2>
            <p className="mt-1 text-sm text-gray-600">
              Actions in this section are irreversible. Please proceed with caution.
            </p>

            <div className="mt-4 rounded-md bg-red-50 p-4">
              <h3 className="text-sm font-medium text-red-800">Delete Account</h3>
              <p className="mt-2 text-sm text-red-700">
                Once you delete your account, there is no going back. All your data including
                projects, proposals, and client relationships will be permanently removed.
              </p>

              {showDeleteConfirm ? (
                <div className="mt-4 space-y-3">
                  <Alert variant="destructive">
                    Are you sure? This action cannot be undone.
                  </Alert>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteAccount}
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Deleting...' : 'Yes, Delete My Account'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="destructive"
                  className="mt-4"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete Account
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
