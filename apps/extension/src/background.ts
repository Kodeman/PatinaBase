/**
 * Background service worker for Patina extension
 * Handles messaging, offline queue, keyboard shortcuts, and context menus
 */

import { Storage } from '@plasmohq/storage';
import type { QuickCaptureRequest, VendorSelection, VendorCaptureInput } from '@patina/shared';
import { supabase } from './lib/supabase';
import { checkForUpdate } from './lib/update-checker';

// Initialize storage
const storage = new Storage({ area: 'local' });

// Vendor data for queue items
interface QueuedVendorData {
  manufacturer: VendorSelection | null;
  retailer: VendorSelection | null;
}

// Where the capture is intended to land. 'project' = legacy
// project_products workflow; 'proposal' = persisted as a real product
// AND a proposal_captures row that already targets a specific
// proposal/room/category; 'inbox' = persisted as a real product (or
// stub) AND a proposal_captures row in 'inbox' status.
export type CaptureSaveTarget = 'project' | 'proposal' | 'inbox';

// Queue item interface - supports both product and vendor captures
interface QueuedCapture {
  id: string;
  type: 'product' | 'vendor';
  data: QuickCaptureRequest;
  vendors?: QueuedVendorData;         // Vendor selections for product capture
  vendorData?: VendorCaptureInput;    // Direct vendor data for vendor-only capture
  projectId?: string | null;          // Project to add the product to
  styleIds?: string[];                // Style assignments for the product
  note?: string | null;               // Note for project_products
  // Wave 2 — Proposal/Inbox targeting
  proposalId?: string | null;
  scopeRoomId?: string | null;
  ffeCategorySlug?: string | null;
  saveTarget?: CaptureSaveTarget;     // Defaults to 'project' for legacy items
  attempts: number;
  lastAttempt: string | null;
  createdAt: string;
}

const QUEUE_KEY = 'capture_queue_v2';
const LEGACY_QUEUE_KEY = 'capture_queue';

// ─── Queue Management ─────────────────────────────────────────────────────────

async function getQueue(): Promise<QueuedCapture[]> {
  const queue = await storage.get<QueuedCapture[]>(QUEUE_KEY);
  return queue || [];
}

async function saveQueue(queue: QueuedCapture[]): Promise<void> {
  await storage.set(QUEUE_KEY, queue);
  await updateBadge();
}

interface AddToQueueOptions {
  type: 'product' | 'vendor';
  vendors?: QueuedVendorData;
  vendorData?: VendorCaptureInput;
  projectId?: string | null;
  styleIds?: string[];
  note?: string | null;
  // Wave 2
  proposalId?: string | null;
  scopeRoomId?: string | null;
  ffeCategorySlug?: string | null;
  saveTarget?: CaptureSaveTarget;
}

async function addToQueue(capture: QuickCaptureRequest, options: AddToQueueOptions = { type: 'product' }): Promise<string> {
  const queue = await getQueue();
  const id = crypto.randomUUID();

  queue.push({
    id,
    type: options.type,
    data: capture,
    vendors: options.vendors,
    vendorData: options.vendorData,
    projectId: options.projectId,
    styleIds: options.styleIds,
    note: options.note,
    proposalId: options.proposalId ?? null,
    scopeRoomId: options.scopeRoomId ?? null,
    ffeCategorySlug: options.ffeCategorySlug ?? null,
    saveTarget: options.saveTarget ?? 'project',
    attempts: 0,
    lastAttempt: null,
    createdAt: new Date().toISOString(),
  });

  await saveQueue(queue);
  return id;
}

/**
 * One-time migration for the capture_queue → capture_queue_v2 storage key.
 * Legacy entries get `saveTarget='project'` and the new optional fields
 * default to null. Idempotent: if no legacy queue exists or the migration
 * already ran, this is a no-op.
 */
async function migrateLegacyQueueIfNeeded(): Promise<void> {
  // If v2 already exists, skip. We don't merge older rows — the legacy
  // worker would still own them.
  const existingV2 = await storage.get<QueuedCapture[]>(QUEUE_KEY);
  if (existingV2 && existingV2.length > 0) {
    await storage.remove(LEGACY_QUEUE_KEY);
    return;
  }

  const legacy = await storage.get<Array<Partial<QueuedCapture>>>(LEGACY_QUEUE_KEY);
  if (!legacy || legacy.length === 0) {
    await storage.remove(LEGACY_QUEUE_KEY);
    return;
  }

  const migrated: QueuedCapture[] = legacy.map((item) => ({
    id: item.id ?? crypto.randomUUID(),
    type: (item.type as 'product' | 'vendor') ?? 'product',
    data: item.data as QuickCaptureRequest,
    vendors: item.vendors,
    vendorData: item.vendorData,
    projectId: item.projectId ?? null,
    styleIds: item.styleIds,
    note: item.note ?? null,
    proposalId: null,
    scopeRoomId: null,
    ffeCategorySlug: null,
    saveTarget: 'project',
    attempts: item.attempts ?? 0,
    lastAttempt: item.lastAttempt ?? null,
    createdAt: item.createdAt ?? new Date().toISOString(),
  }));

  await storage.set(QUEUE_KEY, migrated);
  await storage.remove(LEGACY_QUEUE_KEY);
}

async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter(item => item.id !== id);
  await saveQueue(filtered);
}

async function updateBadge(): Promise<void> {
  const queue = await getQueue();
  const count = queue.length;

  if (count > 0) {
    await chrome.action.setBadgeText({ text: String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#D4A574' }); // Patina warm color
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

// ─── Queue Sync ───────────────────────────────────────────────────────────────

async function syncQueue(): Promise<void> {
  const queue = await getQueue();
  if (queue.length === 0) return;

  // Check auth — need a valid session to submit
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  // Sort queue: vendor-only captures first, then products
  // This ensures vendors are created before products that reference them
  const sortedQueue = [...queue].sort((a, b) => {
    if (a.type === 'vendor' && b.type === 'product') return -1;
    if (a.type === 'product' && b.type === 'vendor') return 1;
    return 0;
  });

  const remaining: QueuedCapture[] = [];

  for (const item of sortedQueue) {
    try {
      if (!navigator.onLine) {
        remaining.push(item);
        continue;
      }

      item.attempts++;
      item.lastAttempt = new Date().toISOString();

      if (item.type === 'vendor' && item.vendorData) {
        // Submit vendor capture directly
        const { error } = await supabase.from('vendors').insert({
          name: item.vendorData.name,
          website: item.vendorData.website,
          logo_url: item.vendorData.logoUrl || null,
          market_position: item.vendorData.marketPosition || null,
          production_model: item.vendorData.productionModel || null,
          primary_category: item.vendorData.primaryCategory || null,
          contact_info: {
            email: item.vendorData.contactEmail || null,
            phone: item.vendorData.contactPhone || null,
          },
          social_links: {
            instagram: item.vendorData.instagram || null,
            pinterest: item.vendorData.pinterest || null,
            facebook: item.vendorData.facebook || null,
          },
          notes: item.vendorData.notes || null,
        });

        if (error) throw error;
        // Success — don't add to remaining
      } else if (item.type === 'product') {
        // Submit product capture
        const captureData = item.data;
        const priceRetail = captureData.price
          ? Math.round(parseFloat(captureData.price) * 100)
          : null;
        const target: CaptureSaveTarget = item.saveTarget ?? 'project';

        // Drafts only need a stub when targeting an inbox without a real
        // product page. Otherwise treat the row as a fully published product.
        const productStatus = target === 'inbox' && !captureData.url ? 'draft' : 'published';

        const { data: product, error } = await supabase.from('products').insert({
          name: captureData.title || 'Untitled Product',
          description: captureData.description || null,
          source_url: captureData.url,
          images: captureData.images || [],
          price_retail: priceRetail,
          captured_by: session.user.id,
          captured_at: new Date().toISOString(),
          status: productStatus,
          // Three-layer catalog (migration 00152). Queue-drained captures
          // land in the personal library, owned by the signed-in user.
          // Mirrors the sync-save path in `payloads.ts`.
          layer: 'personal',
          owner_user_id: session.user.id,
        }).select('id').single();

        if (error) throw error;

        // Add style assignments if specified — same for all targets.
        if (item.styleIds && item.styleIds.length > 0 && product) {
          const styleInserts = item.styleIds.map((styleId, index) => ({
            product_id: product.id,
            style_id: styleId,
            confidence: 1.0,
            is_primary: index === 0,
            source: 'manual',
            assigned_by: session.user.id,
          }));
          await supabase.from('product_styles').insert(styleInserts);
        }

        if (target === 'project') {
          // Legacy path — add to project if specified.
          if (item.projectId && product) {
            await supabase.from('project_products').insert({
              project_id: item.projectId,
              product_id: product.id,
              notes: item.note || null,
            });
          }
        } else if (product && (target === 'proposal' || target === 'inbox')) {
          // Wave 2 — write a proposal_captures row with the right targeting.
          const allTargeted =
            !!item.proposalId && !!item.scopeRoomId && !!item.ffeCategorySlug;
          const captureStatus = target === 'proposal' && allTargeted ? 'assigned' : 'inbox';

          await supabase.from('proposal_captures').insert({
            designer_id: session.user.id,
            product_id: product.id,
            proposal_id: item.proposalId ?? null,
            scope_room_id: item.scopeRoomId ?? null,
            ffe_category_slug: item.ffeCategorySlug ?? null,
            source_url: captureData.url,
            raw_payload: {
              name: captureData.title ?? null,
              description: captureData.description ?? null,
              price_retail_cents: priceRetail,
              note: item.note ?? null,
            },
            thumbnail_url: captureData.images?.[0] ?? null,
            status: captureStatus,
          });
        }
        // Success — don't add to remaining
      }
    } catch {
      // Keep failed items in queue (max 3 attempts)
      if (item.attempts < 3) {
        remaining.push(item);
      }
    }
  }

  await saveQueue(remaining);
}

// ─── Message Handling ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'EXTRACT_REQUEST':
      // Forward to content script
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tabId = tabs[0]?.id;
        if (!tabId) {
          sendResponse({ success: false, error: 'No active tab' });
          return;
        }

        chrome.tabs.sendMessage(
          tabId,
          { type: 'EXTRACT_FULL' },
          response => {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse(response);
            }
          }
        );
      });
      return true; // Async response

    case 'EXTRACT_VENDOR_REQUEST':
      // Forward vendor extraction to content script
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tabId = tabs[0]?.id;
        if (!tabId) {
          sendResponse({ success: false, error: 'No active tab' });
          return;
        }

        chrome.tabs.sendMessage(
          tabId,
          { type: 'EXTRACT_VENDOR' },
          response => {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse(response);
            }
          }
        );
      });
      return true; // Async response

    case 'DETECT_MODE_REQUEST':
      // Forward mode detection to content script
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tabId = tabs[0]?.id;
        if (!tabId) {
          sendResponse({ success: false, error: 'No active tab' });
          return;
        }

        chrome.tabs.sendMessage(
          tabId,
          { type: 'DETECT_MODE' },
          response => {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse(response);
            }
          }
        );
      });
      return true; // Async response

    case 'QUEUE_ADD':
      addToQueue(message.data, {
        type: message.itemType || 'product',
        vendors: message.vendors,
        vendorData: message.vendorData,
        projectId: message.projectId,
        styleIds: message.styleIds,
        note: message.note,
        proposalId: message.proposalId ?? null,
        scopeRoomId: message.scopeRoomId ?? null,
        ffeCategorySlug: message.ffeCategorySlug ?? null,
        saveTarget: message.saveTarget,
      }).then(id => {
        sendResponse({ success: true, queueId: id });
      });
      return true;

    case 'QUEUE_REMOVE':
      removeFromQueue(message.queueId).then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'QUEUE_STATUS':
      getQueue().then(queue => {
        sendResponse({ count: queue.length, items: queue });
      });
      return true;

    case 'CONTENT_SCRIPT_READY':
      // Content script is ready, can now extract
      return false;
  }

  return false;
});

// ─── Keyboard Shortcut ────────────────────────────────────────────────────────

chrome.commands?.onCommand?.addListener(async command => {
  if (command === 'capture-product') {
    // Open side panel
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.sidePanel.open({ tabId: tab.id });
    }
  }
});

// ─── Context Menu ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Make clicking extension icon open side panel instead of popup
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Create context menu
  chrome.contextMenus.create({
    id: 'capture-with-patina',
    title: 'Capture with Patina',
    contexts: ['page', 'image'],
  });

  // Migrate any pre-Wave-2 queue entries forward, then refresh the badge.
  void migrateLegacyQueueIfNeeded().then(() => {
    void updateBadge();
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture-with-patina' && tab?.id) {
    // Open side panel to capture
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// ─── Network Status ───────────────────────────────────────────────────────────

// Try to sync queue when coming online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncQueue();
  });
}

// Sync on startup
chrome.runtime.onStartup.addListener(() => {
  void migrateLegacyQueueIfNeeded().then(async () => {
    await updateBadge();
    await syncQueue();
  });
});

// Periodic sync using alarms (Manifest V3 doesn't allow setInterval in service workers)
chrome.alarms?.create('sync-queue', { periodInMinutes: 5 });
chrome.alarms?.create('check-update', { periodInMinutes: 60 });
chrome.alarms?.create('refresh-token', { periodInMinutes: 30 });

chrome.alarms?.onAlarm?.addListener(async alarm => {
  if (alarm.name === 'sync-queue') {
    // await so MV3 keeps the SW alive until the queue fully drains.
    try {
      await syncQueue();
    } catch (err) {
      console.warn('[background] sync-queue failed', err);
    }
  }
  if (alarm.name === 'check-update') {
    checkForUpdate().then(state => {
      if (state?.hasUpdate) {
        // Notify sidepanel if open
        chrome.runtime.sendMessage({ type: 'UPDATE_AVAILABLE', updateState: state }).catch(() => {
          // Sidepanel not open — that's fine, it will read cached state on next open
        });
      }
    });
  }
  if (alarm.name === 'refresh-token') {
    // Proactively refresh the Supabase session in the SW so the offline
    // capture queue still has a valid JWT when the sidepanel is closed.
    // Threshold matches GoTrue's EXPIRY_MARGIN (10 min): if the SW was
    // alive, GoTrue's autoRefreshToken already refreshed and expires_at is
    // fresh so this branch is skipped; if the SW was dormant, this alarm
    // reanimates it and performs the refresh without racing GoTrue.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const expiresAt = session.expires_at ?? 0;
    const msUntilExpiry = expiresAt * 1000 - Date.now();
    if (msUntilExpiry < 10 * 60_000) {
      try {
        await supabase.auth.refreshSession();
      } catch (err) {
        console.warn('[background] token refresh failed', err);
      }
    }
  }
});

export {};
