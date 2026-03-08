/**
 * DebugPanel Component
 *
 * Development tool for monitoring API calls, errors, and performance metrics.
 * Only renders when NEXT_PUBLIC_DEBUG_MODE=true.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Activity } from 'lucide-react';

interface DebugInfo {
  renderCount: number;
  apiCalls: ApiCall[];
  errors: ErrorInfo[];
  performance: PerformanceInfo;
  buildInfo: BuildInfo;
}

interface ApiCall {
  id: string;
  method: string;
  url: string;
  status: number;
  duration: number;
  timestamp: number;
}

interface ErrorInfo {
  id: string;
  message: string;
  stack?: string;
  timestamp: number;
}

interface PerformanceInfo {
  memoryUsage: number;
  loadTime: number;
  fps: number;
}

interface BuildInfo {
  env: string;
  debugMode: boolean;
  debugExpiry: string;
  version: string;
}

export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'network' | 'performance' | 'errors'>('info');
  const [isMounted, setIsMounted] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    renderCount: 0,
    apiCalls: [],
    errors: [],
    performance: {
      memoryUsage: 0,
      loadTime: 0,
      fps: 60,
    },
    buildInfo: {
      env: process.env.NEXT_PUBLIC_ENV || 'unknown',
      debugMode: process.env.NEXT_PUBLIC_DEBUG_MODE === 'true',
      debugExpiry: process.env.NEXT_PUBLIC_DEBUG_EXPIRY || 'never',
      version: process.env.NEXT_PUBLIC_VERSION || '1.0.0',
    },
  });

  // Check if debug mode is enabled
  const isDebugEnabled = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Check for debug query parameter
  useEffect(() => {
    if (!isMounted) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'true') {
      setIsOpen(true);
    }
  }, [isMounted]);

  // Intercept fetch to log API calls
  useEffect(() => {
    if (!isDebugEnabled) return;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const [url, options] = args;
      const method = options?.method || 'GET';

      try {
        const response = await originalFetch(...args);
        const duration = performance.now() - startTime;

        setDebugInfo(prev => ({
          ...prev,
          apiCalls: [
            {
              id: Math.random().toString(36).substring(7),
              method,
              url: url.toString(),
              status: response.status,
              duration,
              timestamp: Date.now(),
            },
            ...prev.apiCalls.slice(0, 49), // Keep last 50 calls
          ],
        }));

        return response;
      } catch (error) {
        const duration = performance.now() - startTime;
        setDebugInfo(prev => ({
          ...prev,
          apiCalls: [
            {
              id: Math.random().toString(36).substring(7),
              method,
              url: url.toString(),
              status: 0,
              duration,
              timestamp: Date.now(),
            },
            ...prev.apiCalls.slice(0, 49),
          ],
        }));
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [isDebugEnabled]);

  // Track render count
  useEffect(() => {
    if (!isDebugEnabled) return;
    setDebugInfo(prev => ({ ...prev, renderCount: prev.renderCount + 1 }));
  }, [isDebugEnabled]);

  // Track performance metrics
  useEffect(() => {
    if (!isDebugEnabled) return;

    const updatePerformance = () => {
      if ('memory' in performance && (performance as any).memory) {
        const memory = (performance as any).memory;
        setDebugInfo(prev => ({
          ...prev,
          performance: {
            ...prev.performance,
            memoryUsage: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          },
        }));
      }
    };

    const interval = setInterval(updatePerformance, 1000);
    return () => clearInterval(interval);
  }, [isDebugEnabled]);

  // Capture errors
  useEffect(() => {
    if (!isDebugEnabled) return;

    const handleError = (event: ErrorEvent) => {
      setDebugInfo(prev => ({
        ...prev,
        errors: [
          {
            id: Math.random().toString(36).substring(7),
            message: event.message,
            stack: event.error?.stack,
            timestamp: Date.now(),
          },
          ...prev.errors.slice(0, 19), // Keep last 20 errors
        ],
      }));
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [isDebugEnabled]);

  // Check debug expiry
  const checkExpiry = useCallback(() => {
    const expiry = process.env.NEXT_PUBLIC_DEBUG_EXPIRY;
    if (expiry && new Date() > new Date(expiry)) {
      console.warn('⚠️ Debug mode has expired. Please redeploy with updated configuration.');
      return true;
    }
    return false;
  }, []);

  // Don't render anything until mounted to prevent hydration mismatch
  if (!isMounted || !isDebugEnabled) return null;

  const isExpired = checkExpiry();

  return (
    <>
      {/* Debug Mode Warning Banner */}
      {process.env.NEXT_PUBLIC_SHOW_DEBUG_WARNING === 'true' && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-black px-4 py-2 text-center z-50">
          <span className="font-semibold">
            {process.env.NEXT_PUBLIC_DEBUG_WARNING_MESSAGE || '🔧 Debug Mode Active'}
          </span>
          {isExpired && <span className="ml-2 text-red-800">⚠️ EXPIRED - Please Redeploy</span>}
        </div>
      )}

      {/* Debug Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 bg-purple-600 text-white rounded-full p-3 shadow-lg hover:bg-purple-700 z-50"
        title="Toggle Debug Panel"
      >
        <Activity className="w-6 h-6" />
        {debugInfo.errors.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {debugInfo.errors.length}
          </span>
        )}
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white shadow-2xl z-50 max-h-96 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center px-4 py-2 bg-gray-800">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-3 py-1 rounded ${activeTab === 'info' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
              >
                Info
              </button>
              <button
                onClick={() => setActiveTab('network')}
                className={`px-3 py-1 rounded ${activeTab === 'network' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
              >
                Network ({debugInfo.apiCalls.length})
              </button>
              <button
                onClick={() => setActiveTab('performance')}
                className={`px-3 py-1 rounded ${activeTab === 'performance' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
              >
                Performance
              </button>
              <button
                onClick={() => setActiveTab('errors')}
                className={`px-3 py-1 rounded ${activeTab === 'errors' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
              >
                Errors ({debugInfo.errors.length})
              </button>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-gray-700 p-1 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            {activeTab === 'info' && (
              <div className="space-y-2">
                <p>Environment: <span className="text-green-400">{debugInfo.buildInfo.env}</span></p>
                <p>Debug Mode: <span className={isExpired ? 'text-red-400' : 'text-green-400'}>
                  {isExpired ? 'EXPIRED' : 'Active'}
                </span></p>
                <p>Expiry: <span className="text-yellow-400">{debugInfo.buildInfo.debugExpiry}</span></p>
                <p>Render Count: <span className="text-blue-400">{debugInfo.renderCount}</span></p>
                <p>Version: <span className="text-gray-400">{debugInfo.buildInfo.version}</span></p>
              </div>
            )}

            {activeTab === 'network' && (
              <div className="space-y-1">
                {debugInfo.apiCalls.length === 0 ? (
                  <p className="text-gray-500">No API calls yet</p>
                ) : (
                  debugInfo.apiCalls.map(call => (
                    <div key={call.id} className="flex justify-between text-sm border-b border-gray-800 pb-1">
                      <span className="font-mono">
                        <span className={`mr-2 ${call.method === 'GET' ? 'text-green-400' : 'text-yellow-400'}`}>
                          {call.method}
                        </span>
                        <span className="text-gray-400">{call.url}</span>
                      </span>
                      <span className="flex gap-2">
                        <span className={call.status >= 400 ? 'text-red-400' : 'text-green-400'}>
                          {call.status || 'ERR'}
                        </span>
                        <span className="text-gray-500">{call.duration.toFixed(0)}ms</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'performance' && (
              <div className="space-y-2">
                <p>Memory Usage: <span className="text-yellow-400">{debugInfo.performance.memoryUsage} MB</span></p>
                <p>FPS: <span className="text-green-400">{debugInfo.performance.fps}</span></p>
                <p>Load Time: <span className="text-blue-400">{debugInfo.performance.loadTime}ms</span></p>
                <p>React Mode: <span className="text-purple-400">
                  {process.env.NODE_ENV === 'development' ? 'Development' : 'Production'}
                </span></p>
              </div>
            )}

            {activeTab === 'errors' && (
              <div className="space-y-2">
                {debugInfo.errors.length === 0 ? (
                  <p className="text-gray-500">No errors captured</p>
                ) : (
                  debugInfo.errors.map(error => (
                    <div key={error.id} className="border border-red-800 rounded p-2 text-sm">
                      <p className="text-red-400 font-semibold">{error.message}</p>
                      {error.stack && (
                        <pre className="text-xs text-gray-500 mt-1 overflow-x-auto">{error.stack}</pre>
                      )}
                      <p className="text-xs text-gray-600 mt-1">
                        {new Date(error.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default DebugPanel;
