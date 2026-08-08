import type { InboxNotification } from '@patina/supabase';
import { selectProjectFileChangeNotifications } from '../use-project-file-change-notifications';

const notification = (
  id: string,
  metadata: Record<string, unknown>,
): InboxNotification => ({
  id,
  user_id: 'designer-1',
  type: 'project_file_changed',
  channel: 'in_app',
  status: 'delivered',
  template_id: null,
  metadata,
  opened_at: null,
  clicked_at: null,
  sent_at: '2026-08-07T12:00:00.000Z',
  created_at: '2026-08-07T12:00:00.000Z',
});

describe('selectProjectFileChangeNotifications', () => {
  it('keeps the current project, deduplicates the event, and preserves display/read metadata', () => {
    const rows = [
      notification('newest', {
        event_key: 'project-document:file-1:v2',
        project_id: 'winky-loft',
        project_name: 'Winky Loft',
        file_id: 'file-1',
        file_name: 'Furniture Authorization.pdf',
        actor_id: 'teammate-1',
        actor_name: 'Morgan Lee',
        occurred_at: '2026-08-07T11:58:00.000Z',
        read_at: null,
      }),
      notification('duplicate', {
        event_key: 'project-document:file-1:v2',
        project_id: 'winky-loft',
        file_id: 'file-1',
        file_name: 'Furniture Authorization.pdf',
      }),
      notification('other-project', {
        event_key: 'project-document:file-2:v1',
        project_id: 'other-project',
        file_id: 'file-2',
        file_name: 'Other.pdf',
      }),
    ];

    expect(selectProjectFileChangeNotifications(rows, 'winky-loft')).toEqual([
      {
        id: 'newest',
        eventKey: 'project-document:file-1:v2',
        projectId: 'winky-loft',
        projectName: 'Winky Loft',
        fileId: 'file-1',
        fileName: 'Furniture Authorization.pdf',
        actorId: 'teammate-1',
        actorName: 'Morgan Lee',
        occurredAt: '2026-08-07T11:58:00.000Z',
        readAt: null,
      },
    ]);
  });
});
