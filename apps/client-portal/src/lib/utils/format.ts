import { formatDistanceToNow, parseISO } from 'date-fns';

import type { MilestoneStatus } from '../../types/project';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export const formatDate = (value?: string) => {
  if (!value) {
    return undefined;
  }

  try {
    return dateFormatter.format(parseISO(value));
  } catch (error) {
    return undefined;
  }
};

export const formatRelativeTime = (value?: string) => {
  if (!value) {
    return undefined;
  }

  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true });
  } catch (error) {
    return undefined;
  }
};

export const formatStatusLabel = (status: MilestoneStatus) => {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'in_progress':
      return 'In Progress';
    case 'attention':
      return 'Needs Attention';
    case 'blocked':
      return 'Blocked';
    default:
      return 'Upcoming';
  }
};

export const statusAccentClass = (status: MilestoneStatus) => {
  switch (status) {
    case 'completed':
      return 'text-patina-sage';
    case 'in_progress':
      return 'text-patina-clay';
    case 'attention':
      return 'text-patina-terracotta';
    case 'blocked':
      return 'text-patina-terracotta';
    default:
      return 'text-patina-aged-oak';
  }
};

export const statusDotClass = (status: MilestoneStatus) => {
  switch (status) {
    case 'completed':
      return 'bg-patina-sage';
    case 'in_progress':
      return 'bg-patina-clay';
    case 'attention':
      return 'bg-patina-terracotta';
    case 'blocked':
      return 'bg-patina-terracotta';
    default:
      return 'bg-patina-pearl';
  }
};

export const formatPercentage = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0%';
  }

  return `${Math.round(value)}%`;
};

export const formatCurrency = (value?: number, currency = 'USD') => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
};

export const getInitials = (name?: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};
