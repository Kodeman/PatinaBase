/**
 * Background service worker for Patina extension
 * Handles messaging, offline queue, keyboard shortcuts, and context menus
 */

import { Storage } from '@plasmohq/storage';
import type { QuickCaptureRequest, VendorSelection, VendorCaptureInput } from '@patina/shared';
import { supabase } from './lib/supabase';

// Initialize storage
const storage = new Storage({ area: 'local' });

// Vendor data for queue items
interface QueuedVendorData {
  manufacturer: VendorSelection | null;
  retailer: VendorSelection | null;
}

// Queue item interface - supports both product and vendor captures
interface QueuedCapture {
  id: string;
  type: 'product' | 'vendor';
  data: QuickCaptureRequest;
  vendors?: QueuedVendorData;         // Vendor selections for product capture
  vendorData?: VendorCaptureInput;    // Direct vendor data for vendor-only capture
  attempts: number;
  lastAttempt: string | null;
  createdAt: string;
}

const QUEUE_KEY = 'capture_queue';

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
    attempts: 0,
    lastAttempt: null,
    createdAt: new Date().toISOString(),
  });

  await saveQueue(queue);
  return id;
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

        const { error } = await supabase.from('products').insert({
          name: captureData.title || 'Untitled Product',
          description: captureData.description || null,
          source_url: captureData.url,
          images: captureData.images || [],
          price_retail: priceRetail,
          captured_by: session.user.id,
          captured_at: new Date().toISOString(),
        });

        if (error) throw error;
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

  // Initialize badge
  updateBadge();
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
  updateBadge();
  syncQueue();
});

// Periodic sync using alarms (Manifest V3 doesn't allow setInterval in service workers)
chrome.alarms?.create('sync-queue', { periodInMinutes: 5 });

chrome.alarms?.onAlarm?.addListener(alarm => {
  if (alarm.name === 'sync-queue') {
    syncQueue();
  }
});

export {};
