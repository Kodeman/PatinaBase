import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import type {
  ExtractedProductData,
  Project,
  StyleArchetype,
  UUID,
  PageMode,
  PageModeSignals,
  VendorSummaryForCapture,
  VendorCaptureInput,
  ExtractedVendorData,
  VendorMatchConfidence,
  MarketPosition,
  ProductionModel,
} from '@patina/shared';

import { supabase } from './lib/supabase';
import { scorePageMode, detectModeFromUrl } from './lib/mode-detection';
import { validateProductCapture } from './lib/capture-validation';
import { usePortalSession } from './hooks/use-portal-session';
import { ModeToggle } from './components/ModeToggle';
import { AuthScreen } from './components/AuthScreen';
import { ProductCaptureForm } from './components/ProductCaptureForm';
import { VendorCaptureForm } from './components/VendorCaptureForm';

import { identifyUser, resetAnalytics, extensionEvents } from './lib/analytics';
import { UpdateBanner } from './components/UpdateBanner';

import './style.css';

// Existing product type for duplicate detection
interface ExistingProduct {
  id: string;
  name: string;
  images: string[];
  price_retail: number | null;
  captured_at: string;
  vendor: { name: string } | null;
}

// Existing vendor type for duplicate detection
interface ExistingVendor {
  id: string;
  name: string;
  website: string | null;
  created_at: string;
}

// Auto-dismiss timeout in seconds (0 = disabled)
const AUTO_DISMISS_SECONDS = 0; // Disabled by default, user can enable in settings

function Popup() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const portalSession = usePortalSession();

  // Extraction state
  const [extractedData, setExtractedData] = useState<ExtractedProductData | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState('');

  // Form state
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<UUID | null>(null);
  const [isPersonalCatalog, setIsPersonalCatalog] = useState(true);
  const [selectedStyleIds, setSelectedStyleIds] = useState<UUID[]>([]);
  const [note, setNote] = useState('');

  // Data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [styles, setStyles] = useState<StyleArchetype[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Capture state
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureSuccess, setCaptureSuccess] = useState(false);
  const [captureError, setCaptureError] = useState('');

  // Track user interaction for auto-dismiss
  const [hasInteracted, setHasInteracted] = useState(false);

  // Capture mode state
  const [captureMode, setCaptureMode] = useState<PageMode>('product');
  const [autoDetectedMode, setAutoDetectedMode] = useState(false);

  // Vendor state (manufacturer = who makes it, retailer = where captured)
  const [manufacturer, setManufacturer] = useState<VendorSummaryForCapture | null>(null);
  const [manufacturerConfidence, setManufacturerConfidence] = useState<VendorMatchConfidence>('low');
  const [retailer, setRetailer] = useState<VendorSummaryForCapture | null>(null);
  const [retailerConfidence, setRetailerConfidence] = useState<VendorMatchConfidence>('low');
  const [vendorSuggestions, setVendorSuggestions] = useState<VendorSummaryForCapture[]>([]);

  // Vendor selection UI state
  const [showManufacturerSelector, setShowManufacturerSelector] = useState(false);
  const [showRetailerSelector, setShowRetailerSelector] = useState(false);
  const [showManufacturerForm, setShowManufacturerForm] = useState(false);
  const [showRetailerForm, setShowRetailerForm] = useState(false);

  // Vendor-only capture state
  const [extractedVendorData, setExtractedVendorData] = useState<ExtractedVendorData | null>(null);

  // Navigation tracking state
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const previousUrlRef = useRef<string>('');
  const extractionNonceRef = useRef(0);

  // Duplicate detection state
  const [existingProduct, setExistingProduct] = useState<ExistingProduct | null>(null);
  const [existingVendor, setExistingVendor] = useState<ExistingVendor | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthLoading(false);
      // Identify user for analytics on initial load
      if (session?.user) {
        const emailDomain = session.user.email?.split('@')[1];
        identifyUser(session.user.id, { emailDomain });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const prev = user;
      setUser(session?.user ?? null);
      // Identify on sign-in, reset on sign-out
      if (session?.user && !prev) {
        const emailDomain = session.user.email?.split('@')[1];
        identifyUser(session.user.id, { emailDomain });
      } else if (!session?.user && prev) {
        resetAnalytics();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Track sidepanel opened (once on mount)
  useEffect(() => {
    extensionEvents.open();
  }, []);

  // Navigation tracking - listen for tab URL changes
  useEffect(() => {
    const handleTabUpdate = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      // Only track URL changes for the current window's active tab
      if (changeInfo.url) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id === tabId) {
            setCurrentUrl(changeInfo.url!);
          }
        });
      }
    };

    // Also listen for when user switches tabs
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab.url) {
          setCurrentUrl(tab.url);
        }
      });
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    chrome.tabs.onActivated.addListener(handleTabActivated);

    // Get initial URL — do NOT set previousUrlRef here so Effect 3
    // detects the URL change and triggers extraction on first mount.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        setCurrentUrl(tabs[0].url);
      }
    });

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
      chrome.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, []);

  // Detect capture mode using DOM signals via content script, with URL fallback
  const detectCaptureMode = useCallback((url: string) => {
    // Set URL-based fallback immediately so the UI doesn't flicker
    const urlResult = detectModeFromUrl(url);
    setCaptureMode(urlResult.mode);
    setAutoDetectedMode(urlResult.autoDetected);

    // Request DOM-based signals from the content script (async, overrides URL result)
    chrome.runtime.sendMessage({ type: 'DETECT_MODE_REQUEST' }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        // Content script not available — keep URL-based result
        return;
      }

      const signals = response.data as PageModeSignals;
      const { mode } = scorePageMode(signals);

      // DOM signals are stronger than URL patterns, so override
      setCaptureMode(mode);
      setAutoDetectedMode(true);
    });
  }, []);

  // Check for existing product (duplicate detection)
  const checkForExistingProduct = useCallback(async (url: string) => {
    if (!url) return;

    setIsCheckingDuplicate(true);
    try {
      const { data } = await supabase
        .from('products')
        .select('id, name, images, price_retail, captured_at, vendors(name)')
        .eq('source_url', url)
        .single();

      if (data) {
        // Extract vendor properly (Supabase returns it as an object when using FK relation)
        const vendorRaw = data.vendors as unknown;
        let vendorData: { name: string } | null = null;
        if (vendorRaw && typeof vendorRaw === 'object' && 'name' in vendorRaw) {
          vendorData = { name: (vendorRaw as { name: string }).name };
        }

        const existingProductData: ExistingProduct = {
          id: data.id,
          name: data.name,
          images: data.images,
          price_retail: data.price_retail,
          captured_at: data.captured_at,
          vendor: vendorData,
        };
        setExistingProduct(existingProductData);
        extensionEvents.duplicateDetected('product');
        // Pre-fill form with existing data
        setProductName(data.name || '');
        setPrice(data.price_retail ? (data.price_retail / 100).toFixed(2) : '');
      } else {
        setExistingProduct(null);
      }
    } catch {
      // No existing product found
      setExistingProduct(null);
    } finally {
      setIsCheckingDuplicate(false);
    }
  }, []);

  // Check for existing vendor (duplicate detection by website)
  const checkForExistingVendor = useCallback(async (url: string) => {
    if (!url) return;

    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const { data } = await supabase
        .from('vendors')
        .select('id, name, website, created_at')
        .ilike('website', `%${hostname}%`)
        .limit(1)
        .single();

      if (data) {
        setExistingVendor(data);
        extensionEvents.duplicateDetected('vendor');
      } else {
        setExistingVendor(null);
      }
    } catch {
      setExistingVendor(null);
    }
  }, []);

  // Reset form state for new page
  const resetFormState = useCallback(() => {
    setProductName('');
    setPrice('');
    setSelectedImageIndex(0);
    setNote('');
    setSelectedStyleIds([]);
    setManufacturer(null);
    setRetailer(null);
    setManufacturerConfidence('low');
    setRetailerConfidence('low');
    setShowManufacturerSelector(false);
    setShowRetailerSelector(false);
    setShowManufacturerForm(false);
    setShowRetailerForm(false);
    setCaptureSuccess(false);
    setCaptureError('');
    setExtractionError('');
    setExistingProduct(null);
    setExistingVendor(null);
    setExtractedData(null);
    setExtractedVendorData(null);
    setHasInteracted(false);
  }, []);

  // Re-extract when URL changes
  useEffect(() => {
    if (!user || !currentUrl) return;

    // Skip if URL hasn't actually changed
    if (currentUrl === previousUrlRef.current) return;
    previousUrlRef.current = currentUrl;

    // Reset form state for new page
    resetFormState();

    // Auto-detect mode based on URL
    detectCaptureMode(currentUrl);

    // Check for existing product and vendor
    checkForExistingProduct(currentUrl);
    checkForExistingVendor(currentUrl);

    // Trigger extraction with nonce to discard stale responses
    const nonce = ++extractionNonceRef.current;
    setIsExtracting(true);
    setExtractionError('');
    extensionEvents.extractionStart(captureMode);

    chrome.runtime.sendMessage({ type: 'EXTRACT_REQUEST' }, (response) => {
      if (nonce !== extractionNonceRef.current) return; // stale

      if (chrome.runtime.lastError) {
        extractDirectly(nonce);
        return;
      }

      if (response?.success && response?.data) {
        handleExtractionResult(response.data);
      } else {
        extractDirectly(nonce);
      }
    });
  }, [currentUrl, user, resetFormState, detectCaptureMode, checkForExistingProduct, checkForExistingVendor]);

  // Load projects and styles when authenticated
  useEffect(() => {
    if (!user) return;

    setIsLoadingData(true);

    Promise.all([
      supabase
        .from('projects')
        .select('id, name, status, notes, created_at, updated_at')
        .eq('status', 'active')
        .order('name'),
      supabase
        .from('styles')
        .select('id, name, description, visual_markers, is_archetype, display_order, color_hex')
        .eq('is_archetype', true)
        .order('display_order'),
    ])
      .then(([projectsRes, stylesRes]) => {
        if (projectsRes.data) {
          setProjects(projectsRes.data.map(p => ({
            id: p.id,
            name: p.name,
            status: p.status,
            notes: p.notes,
            clientProfileId: null,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
          })));
        }
        if (stylesRes.data) {
          setStyles(stylesRes.data.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            visualMarkers: s.visual_markers || [],
            parentId: null,
            isArchetype: s.is_archetype,
            displayOrder: s.display_order,
            colorHex: s.color_hex,
            iconName: null,
            createdAt: '',
            updatedAt: '',
          })));
        }
      })
      .finally(() => setIsLoadingData(false));
  }, [user]);

  // Initial extraction when popup opens (only if URL already set)
  // Note: Main extraction logic is now in the URL change effect above

  const extractDirectly = async (nonce?: number) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (nonce != null && nonce !== extractionNonceRef.current) return; // stale

      if (!tab?.id || !tab?.url) {
        if (nonce == null || nonce === extractionNonceRef.current) {
          setExtractionError('Cannot access current tab');
          setIsExtracting(false);
        }
        return;
      }

      // Execute extraction script
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Simple extraction for fallback
          const title = document.querySelector('h1')?.textContent?.trim() ||
                       document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                       document.title;

          const images = Array.from(document.querySelectorAll('img'))
            .filter(img => img.naturalWidth >= 200 && img.naturalHeight >= 200)
            .map(img => ({
              url: img.src,
              score: 50,
              width: img.naturalWidth,
              height: img.naturalHeight,
              alt: img.alt || '',
            }))
            .slice(0, 10);

          const priceEl = document.querySelector('[class*="price"]');
          const priceText = priceEl?.textContent?.match(/\$[\d,]+\.?\d{0,2}/)?.[0];

          const descEl = document.querySelector('meta[property="og:description"]') ||
                         document.querySelector('meta[name="description"]');
          const description = descEl?.getAttribute('content') || null;

          return {
            productName: title,
            description,
            price: priceText ? {
              value: Math.round(parseFloat(priceText.replace(/[$,]/g, '')) * 100),
              currency: 'USD',
              raw: priceText,
            } : null,
            images,
            url: window.location.href,
          };
        },
      });

      if (nonce != null && nonce !== extractionNonceRef.current) return; // stale

      const data = results[0]?.result;
      if (data) {
        handleExtractionResult({
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
      }
    } catch (err) {
      if (nonce != null && nonce !== extractionNonceRef.current) return; // stale
      setExtractionError('Failed to extract product data');
      extensionEvents.extractionError(captureMode, 'direct_extraction_failed');
    } finally {
      if (nonce == null || nonce === extractionNonceRef.current) {
        setIsExtracting(false);
      }
    }
  };

  const handleExtractionResult = (data: ExtractedProductData) => {
    setExtractedData(data);
    setProductName(data.productName || '');
    setPrice(data.price ? (data.price.value / 100).toFixed(2) : '');
    setSelectedImageIndex(0);
    setIsExtracting(false);

    // Track successful extraction
    const fieldCount = [
      data.productName,
      data.price,
      data.description,
      data.dimensions,
      data.materials?.length,
      data.colors?.length,
      data.images?.length,
    ].filter(Boolean).length;
    extensionEvents.extractionComplete(captureMode, fieldCount);

    // Load vendor suggestions based on extracted manufacturer/URL
    loadVendorSuggestions(data.manufacturer, data.url);
  };

  // Query vendors table, auto-link matches, and populate suggestions
  const loadVendorSuggestions = useCallback(async (manufacturerName: string | null, sourceUrl: string) => {
    try {
      let hostname = '';
      try {
        hostname = new URL(sourceUrl).hostname.replace(/^www\./, '');
      } catch { /* invalid url */ }

      const toSummary = (v: {
        id: string; name: string; logo_url: string | null; website: string | null;
        market_position: string | null; production_model: string | null; primary_category: string | null;
      }): VendorSummaryForCapture => ({
        id: v.id, name: v.name, logoUrl: v.logo_url, website: v.website,
        marketPosition: v.market_position as MarketPosition | null, productionModel: v.production_model as ProductionModel | null,
        primaryCategory: v.primary_category, rating: null, reviewCount: 0,
      });

      // --- Query 1: domain match → retailer ---
      let domainResults: VendorSummaryForCapture[] = [];
      if (hostname) {
        const { data } = await supabase
          .from('vendors')
          .select('id, name, logo_url, website, market_position, production_model, primary_category')
          .ilike('website', `%${hostname}%`)
          .limit(10);
        if (data) domainResults = data.map(toSummary);
      }

      // --- Query 2: name match → manufacturer ---
      let nameResults: VendorSummaryForCapture[] = [];
      if (manufacturerName) {
        const { data } = await supabase
          .from('vendors')
          .select('id, name, logo_url, website, market_position, production_model, primary_category')
          .ilike('name', `%${manufacturerName}%`)
          .limit(10);
        if (data) nameResults = data.map(toSummary);
      }

      // --- Auto-link retailer (domain match) ---
      if (domainResults.length > 0) {
        // Exact hostname match first, then substring
        const exactMatch = domainResults.find(v => {
          if (!v.website) return false;
          try {
            const vendorHost = new URL(v.website.startsWith('http') ? v.website : `https://${v.website}`).hostname.replace(/^www\./, '');
            return vendorHost === hostname;
          } catch { return false; }
        });
        if (exactMatch) {
          setRetailer(exactMatch);
          setRetailerConfidence('exact');
        } else {
          setRetailer(domainResults[0]);
          setRetailerConfidence('high');
        }
      }

      // --- Auto-link manufacturer (name match) ---
      if (manufacturerName && nameResults.length > 0) {
        const lowerMfr = manufacturerName.toLowerCase();
        const exactMatch = nameResults.find(v => v.name.toLowerCase() === lowerMfr);
        if (exactMatch) {
          setManufacturer(exactMatch);
          setManufacturerConfidence('exact');
        } else {
          // Substring match → high confidence
          setManufacturer(nameResults[0]);
          setManufacturerConfidence('high');
        }
      }

      // --- Deduplicate and combine for dropdown suggestions ---
      const seen = new Set<string>();
      const combined: VendorSummaryForCapture[] = [];
      for (const v of [...domainResults, ...nameResults]) {
        if (!seen.has(v.id)) {
          seen.add(v.id);
          combined.push(v);
        }
      }
      setVendorSuggestions(combined);
    } catch {
      // Non-critical — suggestions are optional
    }
  }, []);

  // Search vendors by name (for VendorSelector typeahead)
  const searchVendors = useCallback(async (query: string): Promise<VendorSummaryForCapture[]> => {
    try {
      const { data } = await supabase
        .from('vendors')
        .select('id, name, logo_url, website, market_position, production_model, primary_category')
        .ilike('name', `%${query}%`)
        .limit(20);

      if (!data) return [];
      return data.map(v => ({
        id: v.id, name: v.name, logoUrl: v.logo_url, website: v.website,
        marketPosition: v.market_position as MarketPosition | null, productionModel: v.production_model as ProductionModel | null,
        primaryCategory: v.primary_category, rating: null, reviewCount: 0,
      }));
    } catch {
      return [];
    }
  }, []);

  // Extract vendor data when in vendor mode
  const extractVendorFromPage = useCallback(() => {
    setIsExtracting(true);
    setExtractionError('');

    chrome.runtime.sendMessage({ type: 'EXTRACT_VENDOR_REQUEST' }, (response) => {
      setIsExtracting(false);
      if (chrome.runtime.lastError) {
        // Vendor extraction is optional - form still works without it
        return;
      }
      if (response?.success && response?.data) {
        setExtractedVendorData(response.data as ExtractedVendorData);
      }
    });
  }, []);

  // Trigger vendor extraction when switching to vendor mode
  useEffect(() => {
    if (!user || !currentUrl) return;
    if (captureMode === 'vendor' && !extractedVendorData) {
      extractVendorFromPage();
    }
  }, [captureMode, user, currentUrl, extractedVendorData, extractVendorFromPage]);

  // Compute product validation (reactive to form changes)
  const productValidation = useMemo(() => {
    if (!extractedData) return null;
    return validateProductCapture({
      productName,
      price,
      sourceUrl: extractedData.url,
      imageCount: extractedData.images.length,
      confidence: extractedData.confidence,
    });
  }, [extractedData, productName, price]);

  const handleStyleToggle = (styleId: UUID) => {
    setHasInteracted(true);
    setSelectedStyleIds(prev =>
      prev.includes(styleId)
        ? prev.filter(id => id !== styleId)
        : [...prev, styleId]
    );
  };

  // Create vendor inline and return the ID
  const createVendorInline = async (vendorData: VendorCaptureInput): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .insert({
          name: vendorData.name,
          website: vendorData.website,
          logo_url: vendorData.logoUrl || null,
          hero_image_url: vendorData.heroImageUrl || null,
          market_position: vendorData.marketPosition || null,
          production_model: vendorData.productionModel || null,
          primary_category: vendorData.primaryCategory || null,
          contact_info: {
            email: vendorData.contactEmail || null,
            phone: vendorData.contactPhone || null,
          },
          social_links: {
            instagram: vendorData.instagram || null,
            pinterest: vendorData.pinterest || null,
            facebook: vendorData.facebook || null,
          },
          founded_year: vendorData.foundedYear || null,
          headquarters_city: vendorData.headquartersCity || null,
          headquarters_state: vendorData.headquartersState || null,
          brand_story: vendorData.story || null,
          ownership: vendorData.ownershipType || null,
          made_in: vendorData.madeIn || null,
          notes: vendorData.notes || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Insert certifications into the junction table
      if (data && vendorData.certifications && vendorData.certifications.length > 0) {
        const certRows = vendorData.certifications.map(cert => ({
          vendor_id: data.id,
          certification_type: cert,
        }));
        await supabase.from('vendor_certifications').insert(certRows);
      }

      return data?.id || null;
    } catch (err) {
      console.error('Failed to create vendor:', err);
      return null;
    }
  };

  const handleCapture = async () => {
    if (!user || !extractedData) return;

    setHasInteracted(true);
    setIsCapturing(true);
    setCaptureError('');

    try {
      const selectedImage = extractedData.images[selectedImageIndex];
      const images = selectedImage
        ? [selectedImage.url, ...extractedData.images.filter((_, i) => i !== selectedImageIndex).map(img => img.url)]
        : extractedData.images.map(img => img.url);

      // Resolve manufacturer ID (existing or create new)
      let vendorId: string | null = null;
      if (manufacturer) {
        vendorId = manufacturer.id;
      }

      // Resolve retailer ID (existing or create new)
      let retailerId: string | null = null;
      if (retailer) {
        retailerId = retailer.id;
      }

      // Insert product with vendor_id (manufacturer)
      // Note: retailer_id support requires migration 00011_add_retailer_id.sql to be applied
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          name: productName || extractedData.productName || 'Untitled Product',
          description: extractedData.description || null,
          source_url: extractedData.url,
          images: images.slice(0, 10),
          price_retail: price ? Math.round(parseFloat(price) * 100) : null,
          materials: extractedData.materials || [],
          colors: extractedData.colors?.map(c => c.name) || null,
          finish: extractedData.finish?.name || null,
          available_colors: extractedData.availableColors || null,
          dimensions: extractedData.dimensions ? {
            width: extractedData.dimensions.width,
            height: extractedData.dimensions.height,
            depth: extractedData.dimensions.depth,
            seatHeight: extractedData.dimensions.seatHeight,
            seatDepth: extractedData.dimensions.seatDepth,
            seatWidth: extractedData.dimensions.seatWidth,
            armHeight: extractedData.dimensions.armHeight,
            backHeight: extractedData.dimensions.backHeight,
            legHeight: extractedData.dimensions.legHeight,
            clearance: extractedData.dimensions.clearance,
            unit: extractedData.dimensions.unit,
          } : null,
          vendor_id: vendorId,
          retailer_id: retailerId,
          captured_by: user.id,
          captured_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (productError) throw productError;

      // Add to project if selected
      if (selectedProjectId && product) {
        await supabase.from('project_products').insert({
          project_id: selectedProjectId,
          product_id: product.id,
          notes: note || null,
        });
      }

      // Add style assignments
      if (selectedStyleIds.length > 0 && product) {
        const styleInserts = selectedStyleIds.map((styleId, index) => ({
          product_id: product.id,
          style_id: styleId,
          confidence: 1.0,
          is_primary: index === 0,
          source: 'manual',
          assigned_by: user.id,
        }));
        await supabase.from('product_styles').insert(styleInserts);
      }

      setCaptureSuccess(true);
      extensionEvents.productCapture({
        hasImages: (extractedData.images?.length ?? 0) > 0,
        hasPrice: !!price,
        confidence: extractedData.confidence || 'unknown',
        captureMethod: 'new',
      });
    } catch (err) {
      // Handle various error formats (Error, Supabase PostgrestError, unknown)
      let errorMessage = 'Capture failed';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object') {
        // Supabase errors have message, details, hint properties
        const e = err as { message?: string; details?: string; hint?: string; code?: string };
        errorMessage = e.message || e.details || e.hint || JSON.stringify(err);
        if (e.code) errorMessage = `[${e.code}] ${errorMessage}`;
      }
      console.error('Capture error:', err);
      setCaptureError(errorMessage);
    } finally {
      setIsCapturing(false);
    }
  };

  // Handle updating an existing product
  const handleUpdate = async () => {
    if (!user || !existingProduct || !extractedData) return;

    setHasInteracted(true);
    setIsCapturing(true);
    setCaptureError('');

    try {
      const selectedImage = extractedData.images[selectedImageIndex];
      const images = selectedImage
        ? [selectedImage.url, ...extractedData.images.filter((_, i) => i !== selectedImageIndex).map(img => img.url)]
        : extractedData.images.map(img => img.url);

      // Resolve vendor IDs
      const vendorId = manufacturer?.id || null;
      const retailerId = retailer?.id || null;

      const { error: updateError } = await supabase
        .from('products')
        .update({
          name: productName || extractedData.productName || 'Untitled Product',
          description: extractedData.description || null,
          images: images.slice(0, 10),
          price_retail: price ? Math.round(parseFloat(price) * 100) : null,
          materials: extractedData.materials || [],
          colors: extractedData.colors?.map(c => c.name) || null,
          finish: extractedData.finish?.name || null,
          available_colors: extractedData.availableColors || null,
          dimensions: extractedData.dimensions ? {
            width: extractedData.dimensions.width,
            height: extractedData.dimensions.height,
            depth: extractedData.dimensions.depth,
            seatHeight: extractedData.dimensions.seatHeight,
            seatDepth: extractedData.dimensions.seatDepth,
            seatWidth: extractedData.dimensions.seatWidth,
            armHeight: extractedData.dimensions.armHeight,
            backHeight: extractedData.dimensions.backHeight,
            legHeight: extractedData.dimensions.legHeight,
            clearance: extractedData.dimensions.clearance,
            unit: extractedData.dimensions.unit,
          } : null,
          vendor_id: vendorId,
          retailer_id: retailerId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingProduct.id);

      if (updateError) throw updateError;

      // Update project assignment if needed
      if (selectedProjectId) {
        // Check if already in project
        const { data: existingAssignment } = await supabase
          .from('project_products')
          .select('id')
          .eq('project_id', selectedProjectId)
          .eq('product_id', existingProduct.id)
          .single();

        if (!existingAssignment) {
          await supabase.from('project_products').insert({
            project_id: selectedProjectId,
            product_id: existingProduct.id,
            notes: note || null,
          });
        }
      }

      // Update style assignments
      if (selectedStyleIds.length > 0) {
        // Remove existing styles
        await supabase.from('product_styles').delete().eq('product_id', existingProduct.id);

        // Add new styles
        const styleInserts = selectedStyleIds.map((styleId, index) => ({
          product_id: existingProduct.id,
          style_id: styleId,
          confidence: 1.0,
          is_primary: index === 0,
          source: 'manual',
          assigned_by: user.id,
        }));
        await supabase.from('product_styles').insert(styleInserts);
      }

      setCaptureSuccess(true);
      extensionEvents.productCapture({
        hasImages: (extractedData?.images?.length ?? 0) > 0,
        hasPrice: !!price,
        confidence: extractedData?.confidence || 'unknown',
        captureMethod: 'update',
      });
    } catch (err) {
      let errorMessage = 'Update failed';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object') {
        const e = err as { message?: string; details?: string; hint?: string; code?: string };
        errorMessage = e.message || e.details || e.hint || JSON.stringify(err);
        if (e.code) errorMessage = `[${e.code}] ${errorMessage}`;
      }
      console.error('Update error:', err);
      setCaptureError(errorMessage);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSignOut = async () => {
    resetAnalytics();
    await supabase.auth.signOut();
  };

  // Manual refresh — re-extract the current page without requiring a URL change
  const handleManualRefresh = useCallback(() => {
    if (!currentUrl || isExtracting) return;

    resetFormState();
    detectCaptureMode(currentUrl);
    checkForExistingProduct(currentUrl);
    checkForExistingVendor(currentUrl);

    const nonce = ++extractionNonceRef.current;
    setIsExtracting(true);
    setExtractionError('');
    extensionEvents.extractionStart(captureMode);

    chrome.runtime.sendMessage({ type: 'EXTRACT_REQUEST' }, (response) => {
      if (nonce !== extractionNonceRef.current) return;

      if (chrome.runtime.lastError) {
        extractDirectly(nonce);
        return;
      }

      if (response?.success && response?.data) {
        handleExtractionResult(response.data);
      } else {
        extractDirectly(nonce);
      }
    });
  }, [currentUrl, isExtracting, resetFormState, detectCaptureMode, checkForExistingProduct, checkForExistingVendor]);

  // Handle saving a vendor in vendor mode
  const handleVendorSave = async (vendorData: VendorCaptureInput) => {
    if (!user) return;

    setHasInteracted(true);
    setIsCapturing(true);
    setCaptureError('');

    try {
      const { data: vendor, error } = await supabase
        .from('vendors')
        .insert({
          name: vendorData.name,
          website: vendorData.website,
          logo_url: vendorData.logoUrl || null,
          hero_image_url: vendorData.heroImageUrl || null,
          market_position: vendorData.marketPosition || null,
          production_model: vendorData.productionModel || null,
          primary_category: vendorData.primaryCategory || null,
          contact_info: {
            email: vendorData.contactEmail || null,
            phone: vendorData.contactPhone || null,
          },
          social_links: {
            instagram: vendorData.instagram || null,
            pinterest: vendorData.pinterest || null,
            facebook: vendorData.facebook || null,
          },
          founded_year: vendorData.foundedYear || null,
          headquarters_city: vendorData.headquartersCity || null,
          headquarters_state: vendorData.headquartersState || null,
          brand_story: vendorData.story || null,
          ownership: vendorData.ownershipType || null,
          made_in: vendorData.madeIn || null,
          notes: vendorData.notes || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Insert certifications into the junction table
      if (vendor && vendorData.certifications && vendorData.certifications.length > 0) {
        const certRows = vendorData.certifications.map(cert => ({
          vendor_id: vendor.id,
          certification_type: cert,
        }));
        await supabase.from('vendor_certifications').insert(certRows);
      }

      setCaptureSuccess(true);
      extensionEvents.vendorCapture({
        hasLogo: !!vendorData.logoUrl,
        hasContactInfo: !!(vendorData.contactEmail || vendorData.contactPhone),
      });
    } catch (err) {
      let errorMessage = 'Failed to save vendor';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object') {
        const e = err as { message?: string; details?: string; hint?: string; code?: string };
        errorMessage = e.message || e.details || e.hint || JSON.stringify(err);
        if (e.code) errorMessage = `[${e.code}] ${errorMessage}`;
      }
      console.error('Vendor save error:', err);
      setCaptureError(errorMessage);
    } finally {
      setIsCapturing(false);
    }
  };

  // Loading state
  if (isAuthLoading || portalSession.isChecking) {
    return (
      <div className="w-full min-w-[320px] max-w-[600px] h-screen p-4 bg-patina-off-white font-body">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-patina-clay-beige/30 rounded w-1/3" />
          <div className="h-48 bg-patina-clay-beige/20 rounded" />
          <div className="h-10 bg-patina-clay-beige/30 rounded" />
        </div>
      </div>
    );
  }

  // Not signed in — show QR-first auth screen
  if (!user) {
    return <AuthScreen />;
  }

  // Quick Capture Modal
  return (
    <div className="w-full min-w-[320px] max-w-[600px] h-screen flex flex-col bg-patina-off-white font-body" onClick={() => setHasInteracted(true)}>
      {/* Update banner for self-hosted beta */}
      <UpdateBanner />

      {/* Header */}
      <header className="px-4 py-3 border-b border-patina-clay-beige/30 shadow-patina-sm">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-display font-medium text-patina-mocha-brown">
            {captureMode === 'product' ? 'Capture Product' : 'Capture Vendor'}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={isExtracting || !currentUrl}
              title="Re-extract page data"
              className="p-1 text-patina-mocha-brown hover:text-patina-charcoal disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg
                className={`w-4 h-4 ${isExtracting ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M20.015 4.356v4.992" />
              </svg>
            </button>
            <button
              onClick={handleSignOut}
              className="text-xs text-patina-mocha-brown hover:text-patina-charcoal"
            >
              Sign out
            </button>
          </div>
        </div>
        <ModeToggle
          mode={captureMode === 'ambiguous' ? 'product' : captureMode}
          onModeChange={(mode) => {
            const previousMode = captureMode;
            setHasInteracted(true);
            setCaptureMode(mode);
            extensionEvents.modeSwitch(previousMode, mode, false);
          }}
          autoDetected={autoDetectedMode}
        />
      </header>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* Error display */}
        {(extractionError || captureError) && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">{extractionError || captureError}</p>
          </div>
        )}

        {/* Already captured indicator */}
        {existingProduct && !isExtracting && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-800">Already in catalog</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Captured {new Date(existingProduct.captured_at).toLocaleDateString()}
                  {existingProduct.vendor?.name && ` • ${existingProduct.vendor.name}`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isExtracting && (
          <div className="py-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-patina-mocha-brown border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-patina-mocha-brown">Extracting product data...</p>
          </div>
        )}

        {/* Extracted content - Product mode */}
        {!isExtracting && extractedData && captureMode === 'product' && (
          <ProductCaptureForm
            extractedData={extractedData}
            userId={user?.id || null}
            productName={productName}
            setProductName={setProductName}
            price={price}
            setPrice={setPrice}
            selectedImageIndex={selectedImageIndex}
            setSelectedImageIndex={setSelectedImageIndex}
            selectedProjectId={selectedProjectId}
            setSelectedProjectId={setSelectedProjectId}
            isPersonalCatalog={isPersonalCatalog}
            setIsPersonalCatalog={setIsPersonalCatalog}
            selectedStyleIds={selectedStyleIds}
            onStyleToggle={handleStyleToggle}
            note={note}
            setNote={setNote}
            projects={projects}
            styles={styles}
            isLoadingData={isLoadingData}
            setHasInteracted={setHasInteracted}
            manufacturer={manufacturer}
            setManufacturer={setManufacturer}
            manufacturerConfidence={manufacturerConfidence}
            setManufacturerConfidence={setManufacturerConfidence}
            showManufacturerSelector={showManufacturerSelector}
            setShowManufacturerSelector={setShowManufacturerSelector}
            showManufacturerForm={showManufacturerForm}
            setShowManufacturerForm={setShowManufacturerForm}
            retailer={retailer}
            setRetailer={setRetailer}
            retailerConfidence={retailerConfidence}
            setRetailerConfidence={setRetailerConfidence}
            showRetailerSelector={showRetailerSelector}
            setShowRetailerSelector={setShowRetailerSelector}
            showRetailerForm={showRetailerForm}
            setShowRetailerForm={setShowRetailerForm}
            vendorSuggestions={vendorSuggestions}
            createVendorInline={createVendorInline}
            searchVendors={searchVendors}
            validation={productValidation}
          />
        )}

        {/* Existing vendor indicator */}
        {existingVendor && captureMode === 'vendor' && !isExtracting && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-800">Vendor already in catalog</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  &ldquo;{existingVendor.name}&rdquo; was added {new Date(existingVendor.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Vendor mode form */}
        {!isExtracting && captureMode === 'vendor' && (
          <VendorCaptureForm
            extractedVendorData={extractedVendorData}
            currentUrl={currentUrl}
            onSave={handleVendorSave}
            isSaving={isCapturing}
            saveSuccess={captureSuccess}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-patina-clay-beige/30 bg-patina-off-white">
        {captureMode === 'vendor' ? (
          <button
            type="submit"
            form="vendor-form"
            onClick={() => {
              // Trigger form submission via the form's onSubmit
              const form = document.querySelector('form');
              if (form) form.requestSubmit();
            }}
            disabled={isCapturing}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
              captureSuccess
                ? 'bg-patina-success text-white shadow-patina-md'
                : 'bg-patina-mocha-brown text-white hover:bg-patina-charcoal shadow-patina-md hover:shadow-patina-lg'
            } disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`}
          >
            {isCapturing ? 'Saving...' : captureSuccess ? '✓ Vendor Saved!' : 'Save Vendor'}
          </button>
        ) : (
          <button
            onClick={existingProduct ? handleUpdate : handleCapture}
            disabled={isCapturing || isExtracting || !extractedData || (productValidation != null && !productValidation.isValid)}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
              captureSuccess
                ? 'bg-patina-success text-white shadow-patina-md'
                : existingProduct
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-patina-md hover:shadow-patina-lg'
                : 'bg-patina-mocha-brown text-white hover:bg-patina-charcoal shadow-patina-md hover:shadow-patina-lg'
            } disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`}
          >
            {isCapturing
              ? (existingProduct ? 'Updating...' : 'Saving...')
              : captureSuccess
              ? (existingProduct ? '✓ Updated!' : '✓ Saved to Catalog!')
              : existingProduct
              ? 'Update Product'
              : 'Save to Catalog'}
          </button>
        )}
      </div>
    </div>
  );
}

export default Popup;
