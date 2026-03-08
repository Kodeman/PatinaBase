/**
 * Content script for product data extraction
 * Runs in the context of web pages to extract product information
 */

import type { PlasmoCSConfig } from 'plasmo';
import { extractProductData, extractQuickPreview, extractVendorData, detectPageModeSignals } from '../lib/extraction';
import type { ExtractedProductData, ExtractedVendorData, PageModeSignals } from '@patina/shared';

// Plasmo content script configuration
export const config: PlasmoCSConfig = {
  matches: ['https://*/*', 'http://*/*'],
  run_at: 'document_idle',
};

// Message types for communication with popup/background
interface ExtractRequest {
  type: 'EXTRACT_FULL' | 'EXTRACT_QUICK' | 'EXTRACT_VENDOR' | 'DETECT_MODE';
}

interface ExtractResponse {
  type: 'EXTRACTION_RESULT' | 'VENDOR_EXTRACTION_RESULT' | 'MODE_DETECTION_RESULT';
  data: ExtractedProductData | Partial<ExtractedProductData> | ExtractedVendorData | PageModeSignals;
  success: boolean;
  error?: string;
}

/**
 * Handle extraction requests from popup or background script
 */
chrome.runtime.onMessage.addListener(
  (
    message: ExtractRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtractResponse) => void
  ) => {
    if (message.type === 'EXTRACT_FULL') {
      // Full extraction (async)
      extractProductData(window.location.href)
        .then(data => {
          sendResponse({
            type: 'EXTRACTION_RESULT',
            data,
            success: true,
          });
        })
        .catch(error => {
          sendResponse({
            type: 'EXTRACTION_RESULT',
            data: {} as ExtractedProductData,
            success: false,
            error: error instanceof Error ? error.message : 'Extraction failed',
          });
        });

      // Return true to indicate async response
      return true;
    }

    if (message.type === 'EXTRACT_QUICK') {
      // Quick preview extraction (sync)
      try {
        const data = extractQuickPreview(window.location.href);
        sendResponse({
          type: 'EXTRACTION_RESULT',
          data,
          success: true,
        });
      } catch (error) {
        sendResponse({
          type: 'EXTRACTION_RESULT',
          data: {},
          success: false,
          error: error instanceof Error ? error.message : 'Quick extraction failed',
        });
      }

      return false; // Sync response
    }

    if (message.type === 'EXTRACT_VENDOR') {
      // Vendor data extraction (sync)
      try {
        const data = extractVendorData();
        sendResponse({
          type: 'VENDOR_EXTRACTION_RESULT',
          data,
          success: true,
        });
      } catch (error) {
        sendResponse({
          type: 'VENDOR_EXTRACTION_RESULT',
          data: {} as ExtractedVendorData,
          success: false,
          error: error instanceof Error ? error.message : 'Vendor extraction failed',
        });
      }

      return false; // Sync response
    }

    if (message.type === 'DETECT_MODE') {
      // Page mode detection via DOM signals (sync)
      try {
        const signals = detectPageModeSignals();
        sendResponse({
          type: 'MODE_DETECTION_RESULT',
          data: signals,
          success: true,
        });
      } catch (error) {
        sendResponse({
          type: 'MODE_DETECTION_RESULT',
          data: {
            hasProductSchema: false,
            hasAddToCart: false,
            hasPrice: false,
            isAboutPage: false,
            hasOrganizationSchema: false,
          } satisfies PageModeSignals,
          success: false,
          error: error instanceof Error ? error.message : 'Mode detection failed',
        });
      }

      return false; // Sync response
    }

    return false;
  }
);

/**
 * Notify that content script is ready
 */
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: window.location.href });
