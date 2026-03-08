import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const authEvents = {
  login: (method: string) => track('login', { method }),
  signup: (method: string) => track('signup', { method }),
  logout: () => track('logout'),
};

export const productEvents = {
  create: (properties?: Record<string, unknown>) => track('product_create', properties),
  view: (productId: string) => track('product_view', { product_id: productId }),
  update: (productId: string) => track('product_update', { product_id: productId }),
  search: (queryLength: number, resultCount: number) =>
    track('product_search', { query_length: queryLength, result_count: resultCount }),
  filterChange: (filterType: string) =>
    track('product_filter_change', { filter_type: filterType }),
  addToProject: (productId: string) =>
    track('product_add_to_project', { product_id: productId }),
};

export const projectEvents = {
  create: (properties?: Record<string, unknown>) => track('project_create', properties),
  view: (projectId: string) => track('project_view', { project_id: projectId }),
};

export const clientEvents = {
  create: (properties?: Record<string, unknown>) => track('client_create', properties),
  view: (clientId: string) => track('client_view', { client_id: clientId }),
  interaction: (properties?: Record<string, unknown>) => track('client_interaction', properties),
};

export const vendorEvents = {
  search: (queryLength: number, resultCount: number) =>
    track('vendor_search', { query_length: queryLength, result_count: resultCount }),
  filterChange: (filterType: string) =>
    track('vendor_filter_change', { filter_type: filterType }),
  save: (vendorId: string) => track('vendor_save', { vendor_id: vendorId }),
  view: (vendorId: string) => track('vendor_view', { vendor_id: vendorId }),
};

export const teachingEvents = {
  startSession: (mode: string) => track('teaching_session_start', { mode }),
  completeSession: (mode: string) => track('teaching_session_complete', { mode }),
};

export const navEvents = {
  ctaClick: (ctaText: string, location: string) =>
    track('nav_cta_click', { cta_text: ctaText, location }),
  commandPaletteOpen: () => track('command_palette_open'),
};
