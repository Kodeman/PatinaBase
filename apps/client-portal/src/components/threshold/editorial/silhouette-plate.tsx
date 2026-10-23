'use client';

import type { ReactNode } from 'react';

import { silhouetteCaption } from '@/lib/editorial/caption';

import {
  PieceSilhouette,
  silhouetteCategory,
  type SilhouetteCategory,
} from '../instruments/piece-silhouette';
import { PlateCaption } from './plate';

const CATEGORIES: readonly SilhouetteCategory[] = ['bed', 'chair', 'table', 'case', 'light', 'textile'];

export function silhouetteFor(name: string, kind?: string | null, category?: string | null): SilhouetteCategory {
  const explicit = CATEGORIES.find((c) => c === kind);
  // The reader's generic 'case' for an unknown category must not hide a named bed.
  if (explicit && explicit !== 'case') return explicit;
  return silhouetteCategory(name, category);
}

export interface SilhouettePlateProps {
  name: string;
  silhouetteKind?: string | null;
  category?: string | null;
  /** "Picture did not load." when this stands in for a failed photograph. */
  note?: string | null;
  className?: string;
  children?: ReactNode;
}

/** The drawn footprint: before a photograph exists, or when one fails to load. */
export function SilhouettePlate({ name, silhouetteKind, category, note, className, children }: SilhouettePlateProps) {
  return (
    <figure
      className={['ed-plate', 'ed-silhouette', className].filter(Boolean).join(' ')}
      data-plate="silhouette"
      data-never-dim=""
    >
      <div className="ed-plate__frame ed-stock">
        <div className="ed-silhouette__drawing">
          <PieceSilhouette category={silhouetteFor(name, silhouetteKind, category)} />
        </div>
      </div>
      {children}
      <PlateCaption caption={silhouetteCaption(name)} note={note ?? 'Photograph to follow.'} />
    </figure>
  );
}
