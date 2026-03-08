'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface UserProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  profile?: {
    displayName: string | null;
    avatarUrl: string | null;
    locale: string | null;
    timezone: string | null;
    notifPrefs: Record<string, any> | null;
  };
  roles: Array<{ role: { name: string } }>;
}

export interface UpdateProfileDto {
  displayName?: string;
  avatarUrl?: string;
  locale?: string;
  timezone?: string;
  notifPrefs?: Record<string, any>;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

/**
 * Fetch current user profile
 */
async function fetchProfile(): Promise<UserProfile> {
  const res = await fetch('/api/me');
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to fetch profile');
  }
  return res.json();
}

/**
 * Update user profile
 */
async function updateProfile(data: UpdateProfileDto): Promise<UserProfile> {
  const res = await fetch('/api/me/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to update profile');
  }
  return res.json();
}

/**
 * Change user password
 */
async function changePassword(data: ChangePasswordDto): Promise<{ success: boolean; message?: string }> {
  const res = await fetch('/api/me/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to change password');
  }
  return res.json();
}

/**
 * Update user avatar
 */
async function updateAvatar(avatarUrl: string): Promise<{ success: boolean }> {
  const res = await fetch('/api/me/avatar', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatarUrl }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to update avatar');
  }
  return res.json();
}

/**
 * Hook to fetch and manage user profile
 */
export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    staleTime: 1000 * 60, // 1 minute
    retry: 2,
  });
}

/**
 * Hook to update user profile
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

/**
 * Hook to change user password
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: changePassword,
  });
}

/**
 * Hook to update user avatar
 */
export function useUpdateAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAvatar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
