'use client';

import { useState } from 'react';
import { Button, Input, Alert } from '@patina/design-system';

interface BusinessInfo {
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  website: string;
  bio: string;
}

export function BusinessTab() {
  const [info, setInfo] = useState<BusinessInfo>({
    businessName: '',
    businessPhone: '',
    businessAddress: '',
    website: '',
    bio: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (field: keyof BusinessInfo, value: string) => {
    setInfo((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // TODO: Wire up to actual backend endpoint for business info
      // For now, simulate save
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to save business info');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-gray-900">Business Information</h2>
      <p className="mt-1 text-sm text-gray-600">
        Manage your business profile and branding
      </p>

      {error && (
        <Alert variant="destructive" className="mt-4">
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mt-4">
          Business information saved successfully!
        </Alert>
      )}

      <div className="mt-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Business Name</label>
            <Input
              type="text"
              value={info.businessName}
              onChange={(e) => handleChange('businessName', e.target.value)}
              placeholder="Your Design Studio"
              className="mt-1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Business Phone</label>
            <Input
              type="tel"
              value={info.businessPhone}
              onChange={(e) => handleChange('businessPhone', e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Business Address</label>
          <textarea
            value={info.businessAddress}
            onChange={(e) => handleChange('businessAddress', e.target.value)}
            rows={3}
            placeholder="123 Design Street, Suite 100&#10;San Francisco, CA 94102"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Website</label>
          <Input
            type="url"
            value={info.website}
            onChange={(e) => handleChange('website', e.target.value)}
            placeholder="https://yourdesignstudio.com"
            className="mt-1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Bio</label>
          <textarea
            value={info.bio}
            onChange={(e) => handleChange('bio', e.target.value)}
            rows={4}
            placeholder="Tell clients about your design philosophy and experience..."
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
          />
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setInfo({
              businessName: '',
              businessPhone: '',
              businessAddress: '',
              website: '',
              bio: '',
            })}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
