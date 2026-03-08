'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useUpdateProfile } from '@/hooks/use-profile';
import { UserAvatar } from '@/components/auth/user-avatar';
import { Button, Input, Alert } from '@patina/design-system';

export function ProfileTab() {
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();

  const [displayName, setDisplayName] = useState(user?.name || '');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    setError(null);
    setSuccess(false);

    try {
      await updateProfile.mutateAsync({ displayName });
      setSuccess(true);
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
      <p className="mt-1 text-sm text-gray-600">
        Update your account profile information
      </p>

      {error && (
        <Alert variant="destructive" className="mt-4">
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mt-4">
          Profile updated successfully!
        </Alert>
      )}

      <div className="mt-6 space-y-6">
        <div className="flex items-center gap-6">
          <UserAvatar size="xl" />
          <div>
            <button className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50">
              Change Avatar
            </button>
            <p className="mt-2 text-xs text-gray-500">
              JPG, GIF or PNG. Max size of 2MB.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            {isEditing ? (
              <Input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1"
              />
            ) : (
              <p className="mt-1 text-sm text-gray-900">{user?.name || 'Not set'}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <p className="mt-1 text-sm text-gray-600">{user?.email}</p>
            <p className="mt-1 text-xs text-gray-500">
              Email cannot be changed. Contact support for assistance.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Role</label>
          <div className="mt-1 flex gap-2">
            {user?.roles?.map((role) => (
              <span
                key={role}
                className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800"
              >
                {role}
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setDisplayName(user?.name || '');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              Edit Profile
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
