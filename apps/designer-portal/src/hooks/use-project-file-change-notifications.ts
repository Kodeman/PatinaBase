'use client';

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInboxNotifications,
  useInboxNotificationsRealtime,
  type InboxNotification,
} from '@patina/supabase';

export const PROJECT_FILE_CHANGED_TYPE = 'project_file_changed';

export interface ProjectFileChangeNotification {
  id: string;
  eventKey: string;
  projectId: string;
  projectName: string;
  fileId: string;
  fileName: string;
  actorId: string | null;
  actorName: string;
  occurredAt: string;
  readAt: string | null;
}

const metadataString = (
  metadata: InboxNotification['metadata'],
  key: string,
): string | null => {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

export function selectProjectFileChangeNotifications(
  notifications: readonly InboxNotification[],
  projectId: string | null,
): ProjectFileChangeNotification[] {
  if (!projectId) return [];

  const eventKeys = new Set<string>();
  const selected: ProjectFileChangeNotification[] = [];

  for (const notification of notifications) {
    if (notification.type !== PROJECT_FILE_CHANGED_TYPE) continue;
    const metadata = notification.metadata ?? {};
    if (metadataString(metadata, 'project_id') !== projectId) continue;

    const fileId = metadataString(metadata, 'file_id');
    const fileName = metadataString(metadata, 'file_name');
    if (!fileId || !fileName) continue;

    const occurredAt =
      metadataString(metadata, 'occurred_at') ?? notification.created_at;
    const eventKey =
      metadataString(metadata, 'event_key') ?? `${fileId}:${occurredAt}`;
    if (eventKeys.has(eventKey)) continue;
    eventKeys.add(eventKey);

    selected.push({
      id: notification.id,
      eventKey,
      projectId,
      projectName:
        metadataString(metadata, 'project_name') ?? 'Untitled project',
      fileId,
      fileName,
      actorId: metadataString(metadata, 'actor_id'),
      actorName: metadataString(metadata, 'actor_name') ?? 'A teammate',
      occurredAt,
      readAt: metadataString(metadata, 'read_at'),
    });
  }

  return selected;
}

export function useProjectFileChangeNotifications(projectId: string | null) {
  useInboxNotificationsRealtime();
  const query = useInboxNotifications({ limit: 100 });
  const data = useMemo(
    () => selectProjectFileChangeNotifications(query.data ?? [], projectId),
    [projectId, query.data],
  );
  return { ...query, data };
}

export function useMarkProjectFileChangeRead() {
  const queryClient = useQueryClient();
  return useCallback(
    async (notificationId: string) => {
      const response = await fetch('/api/inbox/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [notificationId] }),
      });
      if (!response.ok) {
        throw new Error(`Mark read failed (${response.status})`);
      }
      await queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
    [queryClient],
  );
}
