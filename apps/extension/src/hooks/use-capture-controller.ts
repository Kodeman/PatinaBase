/**
 * Capture controller — the side-effect engine behind the panel. Ports the
 * legacy sidepanel effects (auth, tab-URL tracking, extraction with content
 * script + executeScript fallback, exact-URL dedup, vendor auto-link) and
 * dispatches into the capture reducer instead of calling 50 setState fns.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ExtractedProductData,
  MarketPosition,
  ProductionModel,
  VendorSummaryForCapture,
} from '@patina/shared';
import { supabase } from '../lib/supabase';
import { detectModeFromUrl } from '../lib/mode-detection';
import { bestProductMatch } from '../lib/product-similarity';
import { ocrTextToFields } from '../lib/ocr';

interface PendingIntent {
  kind: 'capture-page' | 'capture-image' | 'capture-selection';
  srcUrl?: string;
  selectionText?: string;
  pageUrl?: string;
}
import { identifyUser, resetAnalytics, extensionEvents } from '../lib/analytics';
import { usePortalSession } from './use-portal-session';
import { useCapture, useCaptureDispatch } from '../state/CaptureProvider';

export interface CaptureController {
  refresh: () => void;
  switchToVendor: () => void;
  switchToProduct: () => void;
  portalChecking: boolean;
  currentUrl: string;
}

export function useCaptureController(): CaptureController {
  const dispatch = useCaptureDispatch();
  const state = useCapture();
  const portalSession = usePortalSession();

  const [currentUrl, setCurrentUrl] = useState('');
  const [intentReady, setIntentReady] = useState(false);
  const previousUrlRef = useRef('');
  const nonceRef = useRef(0);
  const exactMatchedRef = useRef(false);
  const intentRef = useRef<PendingIntent | null>(null);
  const dupeWarnings = state.prefs.dupeWarnings;
  const signedIn = state.session.status === 'signed-in';

  // Read any context-menu / shortcut intent once on mount.
  useEffect(() => {
    try {
      chrome.storage.session.get('patina_pending_intent', (r) => {
        intentRef.current = (r?.patina_pending_intent as PendingIntent) ?? null;
        chrome.storage.session.remove('patina_pending_intent');
        setIntentReady(true);
      });
    } catch {
      setIntentReady(true);
    }
  }, []);

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let prevUser: string | null = null;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        prevUser = session.user.id;
        identifyUser(session.user.id, { emailDomain: session.user.email?.split('@')[1] });
        dispatch({ type: 'SESSION_RESOLVED', user: session.user });
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        if (!prevUser) {
          identifyUser(session.user.id, { emailDomain: session.user.email?.split('@')[1] });
        }
        prevUser = session.user.id;
        dispatch({ type: 'SESSION_RESOLVED', user: session.user });
      } else if (prevUser) {
        prevUser = null;
        resetAnalytics();
        dispatch({ type: 'SIGNED_OUT' });
      }
    });
    return () => subscription.unsubscribe();
  }, [dispatch]);

  // Once the portal cookie has settled with no session, fall to signed-out.
  useEffect(() => {
    if (!portalSession.isChecking && state.session.status === 'checking') {
      dispatch({ type: 'SESSION_RESOLVED', user: null });
    }
  }, [portalSession.isChecking, state.session.status, dispatch]);

  useEffect(() => {
    extensionEvents.open();
  }, []);

  // ── Tab-URL tracking ──────────────────────────────────────────────────────
  useEffect(() => {
    const onUpdate = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.url) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id === tabId) setCurrentUrl(info.url!);
        });
      }
    };
    const onActivated = (a: chrome.tabs.TabActiveInfo) => {
      chrome.tabs.get(a.tabId, (tab) => tab.url && setCurrentUrl(tab.url));
    };
    chrome.tabs.onUpdated.addListener(onUpdate);
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) setCurrentUrl(tabs[0].url);
    });
    return () => {
      chrome.tabs.onUpdated.removeListener(onUpdate);
      chrome.tabs.onActivated.removeListener(onActivated);
    };
  }, []);

  // ── Extraction helpers ────────────────────────────────────────────────────
  const checkDuplicate = useCallback(
    async (url: string) => {
      try {
        const { data } = await supabase
          .from('products')
          .select('id, name, images, price_retail, captured_at, vendors(name)')
          .eq('source_url', url)
          .single();
        if (data) {
          exactMatchedRef.current = true;
          extensionEvents.duplicateDetected('product');
          dispatch({
            type: 'DUPLICATE_MATCHED',
            match: {
              id: data.id,
              name: data.name,
              imageUrl: Array.isArray(data.images) ? data.images[0] ?? null : null,
              priceRetail: data.price_retail,
              capturedAt: data.captured_at,
            },
            confidence: 1,
          });
        }
      } catch {
        /* no duplicate */
      }
    },
    [dispatch]
  );

  // Near-match (D1): only when no exact-URL hit and warnings are on.
  const checkNearMatch = useCallback(
    async (data: ExtractedProductData) => {
      if (!dupeWarnings || exactMatchedRef.current || !data.productName) return;
      const firstToken = data.productName.split(/\s+/)[0];
      if (!firstToken) return;
      try {
        const { data: rows } = await supabase
          .from('products')
          .select('id, name, price_retail, vendor_id')
          .is('deleted_at', null)
          .ilike('name', `%${firstToken}%`)
          .limit(50);
        if (exactMatchedRef.current || !rows?.length) return;
        const best = bestProductMatch(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            priceRetail: r.price_retail,
            vendorId: r.vendor_id,
          })),
          { name: data.productName, priceCents: data.price?.value ?? null, vendorId: null }
        );
        if (best && best.score >= 0.85) {
          extensionEvents.duplicateDetected('product');
          dispatch({
            type: 'DUPLICATE_MATCHED',
            match: {
              id: best.candidate.id,
              name: best.candidate.name,
              imageUrl: null,
              priceRetail: best.candidate.priceRetail,
              capturedAt: null,
            },
            confidence: best.score,
          });
        }
      } catch {
        /* best-effort */
      }
    },
    [dispatch, dupeWarnings]
  );

  const loadVendorSuggestions = useCallback(
    async (manufacturerName: string | null, sourceUrl: string) => {
      let hostname = '';
      try {
        hostname = new URL(sourceUrl).hostname.replace(/^www\./, '');
      } catch {
        /* invalid */
      }
      const toSummary = (v: {
        id: string; name: string; logo_url: string | null; website: string | null;
        market_position: string | null; production_model: string | null; primary_category: string | null;
      }): VendorSummaryForCapture => ({
        id: v.id, name: v.name, logoUrl: v.logo_url, website: v.website,
        marketPosition: v.market_position as MarketPosition | null,
        productionModel: v.production_model as ProductionModel | null,
        primaryCategory: v.primary_category, rating: null, reviewCount: 0,
      });
      try {
        let domainResults: VendorSummaryForCapture[] = [];
        if (hostname) {
          const { data } = await supabase
            .from('vendors')
            .select('id, name, logo_url, website, market_position, production_model, primary_category')
            .ilike('website', `%${hostname}%`)
            .limit(10);
          if (data) domainResults = data.map(toSummary);
        }
        let nameResults: VendorSummaryForCapture[] = [];
        if (manufacturerName) {
          const { data } = await supabase
            .from('vendors')
            .select('id, name, logo_url, website, market_position, production_model, primary_category')
            .ilike('name', `%${manufacturerName}%`)
            .limit(10);
          if (data) nameResults = data.map(toSummary);
        }
        if (domainResults.length > 0) {
          const exact = domainResults.find((v) => {
            if (!v.website) return false;
            try {
              const h = new URL(v.website.startsWith('http') ? v.website : `https://${v.website}`)
                .hostname.replace(/^www\./, '');
              return h === hostname;
            } catch {
              return false;
            }
          });
          dispatch({ type: 'VENDOR_SET', role: 'retailer', vendor: exact ?? domainResults[0], confidence: exact ? 'exact' : 'high' });
        }
        if (manufacturerName && nameResults.length > 0) {
          const lower = manufacturerName.toLowerCase();
          const exact = nameResults.find((v) => v.name.toLowerCase() === lower);
          dispatch({ type: 'VENDOR_SET', role: 'manufacturer', vendor: exact ?? nameResults[0], confidence: exact ? 'exact' : 'high' });
        }
      } catch {
        /* suggestions are optional */
      }
    },
    [dispatch]
  );

  const onExtracted = useCallback(
    (data: ExtractedProductData) => {
      dispatch({ type: 'EXTRACTION_SUCCESS', data });
      loadVendorSuggestions(data.manufacturer, data.url);
      checkNearMatch(data);
    },
    [dispatch, loadVendorSuggestions, checkNearMatch]
  );

  const extractDirectly = useCallback(
    async (nonce: number) => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (nonce !== nonceRef.current) return;
        if (!tab?.id || !tab?.url) {
          dispatch({ type: 'EXTRACTION_ERROR', error: 'Cannot access current tab' });
          return;
        }
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            let title: string | null = null;
            for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
              try {
                const data = JSON.parse(script.textContent || '');
                const find = (obj: unknown): { name?: string } | null => {
                  if (!obj || typeof obj !== 'object') return null;
                  const o = obj as Record<string, unknown>;
                  if (o['@type'] === 'Product') return o as { name?: string };
                  if (Array.isArray(obj)) for (const i of obj) { const r = find(i); if (r) return r; }
                  if (Array.isArray(o['@graph'])) for (const i of o['@graph'] as unknown[]) { const r = find(i); if (r) return r; }
                  return null;
                };
                const p = find(data);
                if (p?.name) { title = p.name as string; break; }
              } catch { /* invalid */ }
            }
            if (!title) {
              title = document.querySelector('h1')?.textContent?.trim() ||
                document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                document.title;
            }
            let price: { value: number; currency: string; raw: string } | null = null;
            const mp = document.querySelector('meta[property="product:price:amount"]')?.getAttribute('content');
            if (mp) { const v = parseFloat(mp); if (!isNaN(v) && v > 0) price = { value: Math.round(v * 100), currency: 'USD', raw: mp }; }
            const images: Array<{ url: string; score: number; width: number; height: number; alt: string }> = [];
            const seen = new Set<string>();
            for (const img of document.querySelectorAll('img')) {
              const w = img.naturalWidth || img.width || 0;
              const h = img.naturalHeight || img.height || 0;
              const src = img.getAttribute('data-src') || img.src;
              if (!src || src.startsWith('data:') || seen.has(src)) continue;
              if (w >= 200 && h >= 200) { seen.add(src); images.push({ url: src, score: 50, width: w, height: h, alt: img.alt || '' }); }
            }
            const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
            if (og && !seen.has(og)) { seen.add(og); images.push({ url: og, score: 35, width: 0, height: 0, alt: '' }); }
            images.sort((a, b) => b.score - a.score);
            const desc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
              document.querySelector('meta[name="description"]')?.getAttribute('content') || null;
            return { productName: title, description: desc, price, images: images.slice(0, 10), url: window.location.href };
          },
        });
        if (nonce !== nonceRef.current) return;
        const data = results[0]?.result;
        if (data) {
          onExtracted({
            ...data,
            description: data.description || null,
            dimensions: null,
            materials: [],
            colors: null,
            finish: null,
            availableColors: null,
            manufacturer: null,
            extractedAt: new Date().toISOString(),
            confidence: data.images?.length > 0 && data.productName ? 'medium' : 'low',
          } as ExtractedProductData);
        } else {
          dispatch({ type: 'EXTRACTION_ERROR', error: 'Failed to extract product data' });
        }
      } catch {
        if (nonce === nonceRef.current) {
          dispatch({ type: 'EXTRACTION_ERROR', error: 'Failed to extract product data' });
        }
      }
    },
    [dispatch, onExtracted]
  );

  const runProductExtraction = useCallback(
    (url: string) => {
      const nonce = ++nonceRef.current;
      exactMatchedRef.current = false;
      dispatch({ type: 'EXTRACTION_START', url, entry: 'toolbar' });
      extensionEvents.extractionStart('product');
      checkDuplicate(url);
      chrome.runtime.sendMessage({ type: 'EXTRACT_REQUEST' }, (response) => {
        if (nonce !== nonceRef.current) return;
        if (chrome.runtime.lastError) {
          extractDirectly(nonce);
          return;
        }
        if (response?.success && response?.data) {
          onExtracted(response.data as ExtractedProductData);
        } else {
          extractDirectly(nonce);
        }
      });
    },
    [dispatch, checkDuplicate, extractDirectly, onExtracted]
  );

  // ── Drive extraction on URL change (consuming any entry intent first) ─────
  useEffect(() => {
    if (!signedIn || !currentUrl || !intentReady) return;
    if (currentUrl === previousUrlRef.current) return;
    previousUrlRef.current = currentUrl;

    const intent = intentRef.current;
    intentRef.current = null; // consume — subsequent navigations extract normally

    if (intent?.kind === 'capture-image' && intent.srcUrl) {
      dispatch({ type: 'IMAGE_CAPTURED', sourceUrl: currentUrl, imageUrl: intent.srcUrl });
      return;
    }
    if (intent?.kind === 'capture-selection' && intent.selectionText) {
      dispatch({ type: 'MANUAL_START', url: currentUrl });
      const fields = ocrTextToFields(intent.selectionText);
      if (fields.name) dispatch({ type: 'FIELD_EDIT', field: 'name', value: fields.name });
      if (fields.price)
        dispatch({ type: 'FIELD_EDIT', field: 'price', value: (fields.price.value / 100).toFixed(2) });
      if (fields.materials?.length)
        dispatch({ type: 'FIELD_EDIT', field: 'materials', value: fields.materials });
      return;
    }

    const mode = detectModeFromUrl(currentUrl);
    if (mode.mode === 'vendor') {
      dispatch({ type: 'NAV', screen: 'vendor' });
    } else {
      runProductExtraction(currentUrl);
    }
  }, [signedIn, currentUrl, intentReady, dispatch, runProductExtraction]);

  const refresh = useCallback(() => {
    if (currentUrl) {
      previousUrlRef.current = currentUrl;
      runProductExtraction(currentUrl);
    }
  }, [currentUrl, runProductExtraction]);

  const switchToVendor = useCallback(() => dispatch({ type: 'NAV', screen: 'vendor' }), [dispatch]);
  const switchToProduct = useCallback(() => {
    if (currentUrl) {
      previousUrlRef.current = currentUrl;
      runProductExtraction(currentUrl);
    }
  }, [currentUrl, runProductExtraction]);

  return {
    refresh,
    switchToVendor,
    switchToProduct,
    portalChecking: portalSession.isChecking,
    currentUrl,
  };
}
