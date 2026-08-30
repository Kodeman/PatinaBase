/**
 * Background service worker for Patina extension
 * Handles messaging, keyboard shortcuts, and context menus
 */

import { supabase } from './lib/supabase';

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
      await setPendingIntent({ kind: 'capture-page', pageUrl: tab.url });
      chrome.sidePanel.open({ tabId: tab.id });
    }
  }
});

// ─── Context Menu ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(details => {
  // Make clicking extension icon open side panel instead of popup
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Create targeted context menus (page / image / selection)
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'patina-capture-page', title: 'Capture page with Patina', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'patina-capture-image', title: 'Capture this image', contexts: ['image'] });
    chrome.contextMenus.create({ id: 'patina-capture-selection', title: 'Capture selection as product', contexts: ['selection'] });
  });

  // First install — open the onboarding tab (O1–O4).
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('tabs/onboarding.html') });
  }
});

// sidePanel.open() can't carry params, so the chosen entry hands its intent off
// out-of-band via chrome.storage.session; the panel reads + clears it on mount.
async function setPendingIntent(intent: Record<string, unknown>): Promise<void> {
  try {
    await chrome.storage.session.set({ patina_pending_intent: { ...intent, ts: Date.now() } });
  } catch (err) {
    console.warn('[background] could not set capture intent', err);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'patina-capture-image') {
    await setPendingIntent({ kind: 'capture-image', srcUrl: info.srcUrl, pageUrl: tab.url });
  } else if (info.menuItemId === 'patina-capture-selection') {
    await setPendingIntent({ kind: 'capture-selection', selectionText: info.selectionText, pageUrl: tab.url });
  } else {
    await setPendingIntent({ kind: 'capture-page', pageUrl: tab.url });
  }
  chrome.sidePanel.open({ tabId: tab.id });
});

// ─── Session Refresh ──────────────────────────────────────────────────────────

// Manifest V3 doesn't allow setInterval in service workers.
chrome.alarms?.create('refresh-token', { periodInMinutes: 30 });

chrome.alarms?.onAlarm?.addListener(async alarm => {
  if (alarm.name === 'refresh-token') {
    // Proactively refresh the Supabase session in the SW so a capture started
    // from a context menu still has a valid JWT when the sidepanel opens.
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
