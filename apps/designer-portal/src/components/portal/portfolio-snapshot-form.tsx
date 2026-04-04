'use client';

import { useState } from 'react';
import { StyleTag } from './style-tag';

interface PortfolioSnapshotFormProps {
  initialValue?: number;
  initialDuration?: string;
  initialRooms?: string;
  initialTags?: string[];
  onSubmit?: (data: {
    headline: string;
    description: string;
    value: number;
    duration: string;
    rooms: string;
    styleTags: string[];
  }) => void;
}

export function PortfolioSnapshotForm({
  initialValue,
  initialDuration,
  initialRooms,
  initialTags = [],
}: PortfolioSnapshotFormProps) {
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState(
    initialValue ? `$${(initialValue / 100).toLocaleString()}` : ''
  );
  const [duration, setDuration] = useState(initialDuration ?? '');
  const [rooms, setRooms] = useState(initialRooms ?? '');

  const labelClass = 'mb-1.5 block type-meta-small';
  const inputClass = 'w-full rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 font-body text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]';

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className={labelClass}>Project Headline</label>
        <input
          className={inputClass}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. A Prairie Home Reimagined — Full Living Space Redesign"
        />
      </div>
      <div className="md:col-span-2">
        <label className={labelClass}>Brief Description (for portfolio card)</label>
        <textarea
          className={`${inputClass} min-h-[80px] resize-y`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="2-3 sentences capturing the transformation, the challenge, and the result."
          rows={3}
        />
      </div>
      <div>
        <label className={labelClass}>Project Value</label>
        <input className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div>
        <label className={labelClass}>Duration</label>
        <input className={inputClass} value={duration} onChange={(e) => setDuration(e.target.value)} />
      </div>
      <div>
        <label className={labelClass}>Rooms</label>
        <input className={inputClass} value={rooms} onChange={(e) => setRooms(e.target.value)} />
      </div>
      {initialTags.length > 0 && (
        <div>
          <label className={labelClass}>Style Tags</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {initialTags.map((tag) => (
              <StyleTag key={tag} label={tag} active />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
