/**
 * Communications Types (Messages, Notifications, Threads)
 */

export type MessageStatus = 'sent' | 'delivered' | 'read';
export type NotificationStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'read';
export type NotificationType = 'push' | 'email' | 'sms';
export type NotificationChannel = 'ios' | 'android' | 'web' | 'email' | 'sms';
export type NotificationCategory = 'proposals' | 'orders' | 'projects' | 'teaching' | 'messages' | 'system';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Thread {
  id: string;
  proposalId?: string;
  projectId?: string;
  participants: string[]; // User IDs
  title?: string;
  status: 'active' | 'archived' | 'closed';
  metadata?: Record<string, unknown>;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  threadId: string;
  authorId: string;
  text?: string;
  attachments?: MessageAttachment[];
  status: MessageStatus;
  readBy?: MessageRead[];
  replyToId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageAttachment {
  key: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface MessageRead {
  userId: string;
  readAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  category: NotificationCategory;
  title?: string;
  body: string;
  payload?: Record<string, unknown>;
  status: NotificationStatus;
  error?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  expiresAt?: Date;
  priority: NotificationPriority;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  email: boolean;
  push: boolean;
  sms: boolean;
  quietHours?: QuietHours;
  categories: Record<NotificationCategory, boolean>;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuietHours {
  start: string; // HH:MM
  end: string; // HH:MM
  timezone: string;
}

export interface DeviceToken {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  device?: Record<string, unknown>;
  active: boolean;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// DTOs
export interface CreateThreadDTO {
  proposalId?: string;
  projectId?: string;
  participants: string[];
  title?: string;
}

export interface SendMessageDTO {
  threadId: string;
  authorId: string;
  text?: string;
  attachments?: MessageAttachment[];
  replyToId?: string;
}

export interface CreateNotificationDTO {
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  category: NotificationCategory;
  title?: string;
  body: string;
  payload?: Record<string, unknown>;
  priority?: NotificationPriority;
  expiresAt?: Date;
}

export interface ThreadWithMessages extends Thread {
  messages: Message[];
}
