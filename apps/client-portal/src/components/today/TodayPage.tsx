'use client';

import { useQuery } from '@tanstack/react-query';

import { useRooms } from '@patina/supabase';
// F3 — client-portal Today migrated to ambient help-system per spec §9.2.
// SectionIntro on "For your rooms" + a no-rooms empty state copy fallback.
// Voice: hospitality-oriented, second-person ("your phone", "snap").
import { SectionIntro, SurfaceKeys } from '@patina/help-system';

import { StoryCard, type DailyStory } from './StoryCard';
import { RoomFeedSection } from './RoomFeedSection';

interface TodayPageProps {
  userId: string;
}

interface StoryResponse {
  story: DailyStory | null;
  is_read: boolean;
}

async function fetchStory(): Promise<StoryResponse> {
  const res = await fetch('/api/stories/today');
  if (!res.ok) throw new Error('Failed to load story');
  return (await res.json()) as StoryResponse;
}

interface RoomRow {
  id: string;
  name: string | null;
  type: string | null;
}

export function TodayPage({ userId }: TodayPageProps) {
  const { data: storyData, isLoading: storyLoading } = useQuery({
    queryKey: ['story-today'],
    queryFn: fetchStory,
  });
  const { data: rooms = [], isLoading: roomsLoading } = useRooms({ userId });

  const story = storyData?.story ?? null;

  return (
    <div className="mt-8 space-y-8">
      {storyLoading ? (
        <p className="type-body-small text-[var(--text-muted)]">Loading today&rsquo;s story…</p>
      ) : story ? (
        <StoryCard story={story} />
      ) : null}

      <section>
        <h2 className="font-heading text-base text-[var(--text-primary)]">For your rooms</h2>
        <SectionIntro
          surfaceKey={SurfaceKeys.ClientPortal.Home.RoomsFeedIntro}
          fallback="Picks tailored to each room you’ve captured."
          className="mt-1 type-body-small max-w-prose"
        />
        {roomsLoading ? (
          <p className="mt-3 type-body-small text-[var(--text-muted)]">Loading rooms…</p>
        ) : rooms.length === 0 ? (
          // Consumer voice: explain how to fix the empty state warmly, no
          // jargon. The "Capture" path lives in the Patina iOS app.
          <p className="mt-3 type-body-small text-[var(--text-muted)]">
            Capture a room with the Patina iOS app and tailored picks will show up here.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {(rooms as RoomRow[]).map((r) => (
              <RoomFeedSection
                key={r.id}
                roomId={r.id}
                roomName={r.name ?? r.type ?? 'Room'}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
