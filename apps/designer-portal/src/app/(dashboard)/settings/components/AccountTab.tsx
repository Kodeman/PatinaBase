'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button, Alert } from '@patina/design-system';
import { AlertTriangle, Download } from 'lucide-react';

export function AccountTab() {
  const { user } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<{
    id: string;
    status: string;
    scheduledFor?: string;
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Check for existing deletion request on mount
  useEffect(() => {
    fetch('/api/me/delete-account')
      .then((res) => res.json())
      .then((res) => {
        if (res.data?.status === 'pending') {
          setDeletionStatus(res.data);
        }
      })
      .catch(() => {});
  }, []);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch('/api/me/delete-account', { method: 'POST' });
      const data = await res.json();
      if (data.data) {
        setDeletionStatus(data.data);
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      console.error('Failed to request account deletion:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDeletion = async () => {
    try {
      await fetch('/api/me/delete-account', { method: 'DELETE' });
      setDeletionStatus(null);
    } catch (err) {
      console.error('Failed to cancel deletion:', err);
    }
  };

  const handleRequestDataExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/me/data-export', { method: 'POST' });
      const data = await res.json();
      setExportStatus(data.data?.message ?? 'Export requested');
    } catch (err) {
      console.error('Failed to request data export:', err);
    } finally {
      setIsExporting(false);
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

      {/* Data Export */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Data Export</h2>
        <p className="mt-1 text-sm text-gray-600">
          Request a copy of all your data. This includes your profile, projects,
          proposals, and other account information.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRequestDataExport}
            disabled={isExporting}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Requesting...' : 'Request Data Export'}
          </Button>
          {exportStatus && (
            <span className="text-sm text-green-600">{exportStatus}</span>
          )}
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

              {deletionStatus?.status === 'pending' ? (
                <div className="mt-4 space-y-3">
                  <Alert variant="error">
                    Account deletion scheduled for{' '}
                    {new Date(deletionStatus.scheduledFor!).toLocaleDateString()}.
                    You can cancel before then.
                  </Alert>
                  <Button variant="outline" onClick={handleCancelDeletion}>
                    Cancel Deletion Request
                  </Button>
                </div>
              ) : showDeleteConfirm ? (
                <div className="mt-4 space-y-3">
                  <Alert variant="error">
                    Are you sure? Your account will be scheduled for deletion in 30 days.
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
                      {isDeleting ? 'Submitting...' : 'Yes, Delete My Account'}
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
