/**
 * Core Web Vitals Tracking
 *
 * Tracks and reports Core Web Vitals (LCP, FID, CLS, TTFB, FCP, INP)
 */

export interface WebVitalsMetric {
  name: 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType: string;
}

export interface WebVitalsConfig {
  /**
   * Callback to send metrics to analytics backend
   */
  onMetric: (metric: WebVitalsMetric) => void;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Report all changes or only final values
   */
  reportAllChanges?: boolean;
}

/**
 * Thresholds for Web Vitals ratings (based on web.dev recommendations)
 */
const THRESHOLDS = {
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  FID: { good: 100, poor: 300 },
  INP: { good: 200, poor: 500 },
  LCP: { good: 2500, poor: 4000 },
  TTFB: { good: 800, poor: 1800 },
};

/**
 * Get rating based on metric value
 */
function getRating(metricName: WebVitalsMetric['name'], value: number): WebVitalsMetric['rating'] {
  const threshold = THRESHOLDS[metricName];
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Initialize Web Vitals tracking
 *
 * This is a browser-only function. Use dynamic import in Next.js:
 * ```ts
 * import('web-vitals').then(({ onCLS, onFID, onLCP, onFCP, onTTFB, onINP }) => {
 *   initWebVitals({ onMetric: sendToAnalytics });
 * });
 * ```
 */
export function initWebVitals(config: WebVitalsConfig): void {
  const { onMetric, debug = false, reportAllChanges = false } = config;

  // This function should only run in the browser
  if (typeof window === 'undefined') {
    console.warn('Web Vitals can only be tracked in the browser');
    return;
  }

  const handleMetric = (metric: any) => {
    const webVital: WebVitalsMetric = {
      name: metric.name,
      value: metric.value,
      rating: getRating(metric.name, metric.value),
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType || 'navigate',
    };

    if (debug) {
      console.log('[Web Vitals]', webVital);
    }

    onMetric(webVital);
  };

  // Dynamically import web-vitals library
  // Note: web-vitals must be installed in the consuming package
  import('web-vitals').then((module: any) => {
    const { onCLS, onLCP, onFCP, onTTFB, onINP } = module;
    onCLS(handleMetric, { reportAllChanges });
    onLCP(handleMetric, { reportAllChanges });
    onFCP(handleMetric, { reportAllChanges });
    onTTFB(handleMetric);
    if (onINP) {
      onINP(handleMetric, { reportAllChanges });
    }
  }).catch((error: any) => {
    console.error('Failed to load web-vitals library:', error);
  });
}

/**
 * Send Web Vitals to analytics backend
 */
export function sendWebVitalsToAnalytics(metric: WebVitalsMetric, endpoint: string = '/api/analytics/web-vitals'): void {
  // Only run in browser
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }

  const body = JSON.stringify({
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    url: window.location.pathname,
    timestamp: Date.now(),
  });

  // Use sendBeacon if available (doesn't block page unload)
  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, body);
  } else {
    // Fallback to fetch with keepalive
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch((error) => {
      console.error('Failed to send Web Vitals:', error);
    });
  }
}

/**
 * Track custom performance metric
 */
export function trackCustomMetric(name: string, value: number, context?: Record<string, any>): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

  const body = JSON.stringify({
    metric: name,
    value,
    context,
    url: window.location.pathname,
    timestamp: Date.now(),
  });

  const endpoint = '/api/analytics/custom-metrics';

  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, body);
  } else {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

/**
 * Performance observer for long tasks
 */
export function observeLongTasks(callback: (entries: any[]) => void): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list: any) => {
      callback(list.getEntries());
    });

    observer.observe({ entryTypes: ['longtask' as any] });
  } catch (error) {
    console.error('Failed to observe long tasks:', error);
  }
}

/**
 * Performance observer for layout shifts
 */
export function observeLayoutShifts(callback: (entries: any[]) => void): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list: any) => {
      callback(list.getEntries());
    });

    observer.observe({ entryTypes: ['layout-shift' as any] });
  } catch (error) {
    console.error('Failed to observe layout shifts:', error);
  }
}

/**
 * Get navigation timing metrics
 */
export function getNavigationTiming(): Record<string, number> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!window.performance || !(window.performance as any).timing) {
    return null;
  }

  const timing = (window.performance as any).timing;
  const navigationStart = timing.navigationStart;

  return {
    // DNS lookup
    dnsLookup: timing.domainLookupEnd - timing.domainLookupStart,

    // TCP connection
    tcpConnection: timing.connectEnd - timing.connectStart,

    // Request time
    requestTime: timing.responseStart - timing.requestStart,

    // Response time
    responseTime: timing.responseEnd - timing.responseStart,

    // DOM processing
    domProcessing: timing.domComplete - timing.domLoading,

    // DOM content loaded
    domContentLoaded: timing.domContentLoadedEventEnd - navigationStart,

    // Page load
    pageLoad: timing.loadEventEnd - navigationStart,
  };
}

/**
 * Get resource timing metrics
 */
export function getResourceTiming(): any[] {
  if (typeof window === 'undefined') {
    return [];
  }

  if (!window.performance || !window.performance.getEntriesByType) {
    return [];
  }

  return window.performance.getEntriesByType('resource') as any[];
}

/**
 * Measure API request performance
 */
export function measureApiRequest(url: string, startTime: number, endTime: number): void {
  const duration = endTime - startTime;

  trackCustomMetric('api_request_duration', duration, {
    url,
    slow: duration > 1000,
  });
}
