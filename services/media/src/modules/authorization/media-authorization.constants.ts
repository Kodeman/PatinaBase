export const MEDIA_READ_PERMISSIONS = [
  'media.read.own',
  'media.read.org',
  'media.manage.own',
  'media.manage.org',
  'media.admin.all',
] as const;

export const MEDIA_MANAGE_PERMISSIONS = [
  'media.manage.own',
  'media.manage.org',
  'media.admin.all',
] as const;

export const MEDIA_ADMIN_PERMISSION = 'media.admin.all' as const;
