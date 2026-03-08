'use client';

import { useState } from 'react';
import { useUpdateProfile } from '@/hooks/use-profile';
import { Button, Alert } from '@patina/design-system';

interface NotificationPrefs {
  email: {
    newMessages: boolean;
    proposalUpdates: boolean;
    orderConfirmations: boolean;
    weeklyDigest: boolean;
  };
  push: {
    realTimeMessages: boolean;
    taskReminders: boolean;
  };
}

const defaultPrefs: NotificationPrefs = {
  email: {
    newMessages: true,
    proposalUpdates: true,
    orderConfirmations: false,
    weeklyDigest: false,
  },
  push: {
    realTimeMessages: true,
    taskReminders: false,
  },
};

export function NotificationsTab() {
  const updateProfile = useUpdateProfile();
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleToggle = (category: 'email' | 'push', key: string) => {
    setPrefs((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: !prev[category][key as keyof typeof prev.email],
      },
    }));
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);

    try {
      await updateProfile.mutateAsync({ notifPrefs: prefs });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to update preferences');
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
      <p className="mt-1 text-sm text-gray-600">
        Choose how you want to be notified
      </p>

      {error && (
        <Alert variant="destructive" className="mt-4">
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mt-4">
          Preferences saved successfully!
        </Alert>
      )}

      <div className="mt-6 space-y-6">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Email Notifications</h3>
          <div className="mt-4 space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={prefs.email.newMessages}
                onChange={() => handleToggle('email', 'newMessages')}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-3 text-sm text-gray-700">New client messages</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={prefs.email.proposalUpdates}
                onChange={() => handleToggle('email', 'proposalUpdates')}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-3 text-sm text-gray-700">Proposal status updates</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={prefs.email.orderConfirmations}
                onChange={() => handleToggle('email', 'orderConfirmations')}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-3 text-sm text-gray-700">Order confirmations</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={prefs.email.weeklyDigest}
                onChange={() => handleToggle('email', 'weeklyDigest')}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-3 text-sm text-gray-700">Weekly activity summary</span>
            </label>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-sm font-medium text-gray-900">Push Notifications</h3>
          <div className="mt-4 space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={prefs.push.realTimeMessages}
                onChange={() => handleToggle('push', 'realTimeMessages')}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-3 text-sm text-gray-700">Real-time messages</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={prefs.push.taskReminders}
                onChange={() => handleToggle('push', 'taskReminders')}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-3 text-sm text-gray-700">Task reminders</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6">
          <Button
            variant="outline"
            onClick={() => setPrefs(defaultPrefs)}
          >
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </div>
    </div>
  );
}
