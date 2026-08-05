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

/**
 * Format a CALENDAR DATE — a day somebody wrote on a page — without letting a
 * timezone move it.
 *
 * Two shapes arrive here and both mean "a day", not "a moment":
 *
 *   '2026-01-15'             a bare date, as the paper rails store the day the
 *                            client signed (metadata.paperSignedOn)
 *   '2026-01-15T00:00:00Z'   a date cast to timestamptz at midnight UTC, as
 *                            record_paper_trade_acceptance stores acceptance
 *                            (accepted_at = p_paper_signed_on::timestamptz)
 *
 * Fed to a timezone-aware formatter west of UTC, BOTH render the day before —
 * `new Date('2026-01-15')` is parsed as UTC midnight by spec, and the midnight
 * timestamp is UTC midnight outright. A client in Chicago reading "signed
 * January 14" when they signed on the 15th is the document lying about the one
 * fact it exists to record.
 *
 * So the date component is taken literally: a bare date is split and rebuilt as
 * local noon (immune to DST in either direction), and a timestamp is formatted
 * in UTC, which is the zone its day was written in.
 *
 * The formatters are built per call rather than hoisted to module scope on
 * purpose: an `Intl.DateTimeFormat` freezes the ambient timezone at
 * CONSTRUCTION, so a hoisted one would answer for whatever zone the module
 * happened to load in — which is exactly the class of bug this function exists
 * to close, and it would also make the zone untestable.
 */
export const formatCalendarDate = (value?: string | null) => {
  if (!value) return undefined;

  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (bare) {
    const [, year, month, day] = bare;
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(Number(year), Number(month) - 1, Number(day), 12));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
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
