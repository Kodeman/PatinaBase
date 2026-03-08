'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateClient } from '@/hooks/use-clients';
import { Card } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Input } from '@patina/design-system';
import { Textarea } from '@patina/design-system';
import { Label } from '@patina/design-system';
import { ArrowLeft, Save, UserPlus } from 'lucide-react';
import Link from 'next/link';

export default function NewClientPage() {
  const router = useRouter();
  const createClient = useCreateClient();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address';
    }
    if (formData.phone && !/^[\d\s\-\(\)]+$/.test(formData.phone)) {
      newErrors.phone = 'Invalid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      const addressString = [
        formData.address,
        formData.city,
        formData.state,
        formData.zip,
      ]
        .filter(Boolean)
        .join(', ');

      await createClient.mutateAsync({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone || undefined,
        address: addressString ? { full: addressString } : undefined,
        metadata: {
          notes: formData.notes || undefined,
        },
      });

      router.push('/clients');
    } catch (error) {
      console.error('Failed to create client:', error);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/clients">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clients
          </Button>
        </Link>

        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
            <UserPlus className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              New Client
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Add a new client to your portfolio
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card className="p-6">
          {/* Personal Information */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Personal Information</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label required>First Name</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  state={errors.firstName ? "error" : "default"}
                  placeholder="John"
                />
                {errors.firstName && <p className="mt-1 text-sm text-destructive">{errors.firstName}</p>}
              </div>
              <div>
                <Label required>Last Name</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  state={errors.lastName ? "error" : "default"}
                  placeholder="Smith"
                />
                {errors.lastName && <p className="mt-1 text-sm text-destructive">{errors.lastName}</p>}
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
            <div className="grid gap-4">
              <div>
                <Label required>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  state={errors.email ? "error" : "default"}
                  placeholder="john.smith@example.com"
                />
                {errors.email && <p className="mt-1 text-sm text-destructive">{errors.email}</p>}
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  state={errors.phone ? "error" : "default"}
                  placeholder="+1 (555) 123-4567"
                />
                {errors.phone && <p className="mt-1 text-sm text-destructive">{errors.phone}</p>}
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Address</h2>
            <div className="grid gap-4">
              <div>
                <Label>Street Address</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="123 Main Street"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>City</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    placeholder="San Francisco"
                  />
                </div>
                <div>
                  <Label>State</Label>
                  <Input
                    value={formData.state}
                    onChange={(e) => handleChange('state', e.target.value)}
                    placeholder="CA"
                  />
                </div>
                <div>
                  <Label>ZIP Code</Label>
                  <Input
                    value={formData.zip}
                    onChange={(e) => handleChange('zip', e.target.value)}
                    placeholder="94102"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Notes</h2>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Add any notes about this client..."
              rows={4}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Link href="/clients">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={createClient.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {createClient.isPending ? 'Creating...' : 'Create Client'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
