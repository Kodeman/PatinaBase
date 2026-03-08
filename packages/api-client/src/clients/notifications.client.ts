/**
 * Notifications API Client
 * Handles notifications and user preferences
 */

import { BaseApiClient } from '../base-client';
import { ApiClientConfig } from '../types';

export class NotificationsApiClient extends BaseApiClient {
  constructor(config: ApiClientConfig) {
    super(config);
  }

  async getNotifications(limit = 50) {
    return this.get('/notifications', {
      params: { limit },
    });
  }

  async markAsRead(notificationId: string) {
    return this.patch(`/notifications/${notificationId}/read`);
  }

  async markAllAsRead() {
    return this.patch('/notifications/read-all');
  }

  async getPreferences() {
    return this.get('/preferences');
  }

  async updatePreferences(preferences: unknown) {
    return this.put('/preferences', preferences);
  }
}
