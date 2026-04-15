import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const authEvents = {
  login: (method: string) => track('login', { method, platform: 'admin' }),
  logout: () => track('logout', { platform: 'admin' }),
};

export const adminEvents = {
  userManagementView: (view: string) => track('admin_user_management_view', { view }),
  userInvite: (role: string) => track('admin_user_invite', { role }),
  userRoleChange: (userId: string, newRole: string) =>
    track('admin_user_role_change', { user_id: userId, new_role: newRole }),
  productApprove: (productId: string) => track('admin_product_approve', { product_id: productId }),
  productReject: (productId: string) => track('admin_product_reject', { product_id: productId }),
  vendorApprove: (vendorId: string) => track('admin_vendor_approve', { vendor_id: vendorId }),
  vendorReject: (vendorId: string) => track('admin_vendor_reject', { vendor_id: vendorId }),
  exportData: (exportType: string, recordCount: number) =>
    track('admin_export_data', { export_type: exportType, record_count: recordCount }),
  dashboardView: (dashboardName: string) => track('admin_dashboard_view', { dashboard: dashboardName }),
};

export const navEvents = {
  ctaClick: (ctaText: string, location: string) =>
    track('nav_cta_click', { cta_text: ctaText, location, platform: 'admin' }),
};
