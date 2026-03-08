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
      return 'bg-emerald-200 text-emerald-900 border-emerald-300';
    case 'in_progress':
      return 'bg-sky-200 text-sky-900 border-sky-300';
    case 'attention':
      return 'bg-amber-200 text-amber-900 border-amber-300';
    case 'blocked':
      return 'bg-rose-200 text-rose-900 border-rose-300';
    default:
      return 'bg-stone-200 text-stone-900 border-stone-300';
  }
};

export const statusDotClass = (status: MilestoneStatus) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500';
    case 'in_progress':
      return 'bg-sky-500';
    case 'attention':
      return 'bg-amber-500';
    case 'blocked':
      return 'bg-rose-500';
    default:
      return 'bg-stone-400';
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
