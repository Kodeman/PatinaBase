/**
 * Vitest setup — mocks for Chrome extension globals and Plasmo env vars.
 */
import { vi } from 'vitest';

// Stub Plasmo env vars
process.env.PLASMO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// Minimal chrome.* stubs so imports that reference chrome don't crash
const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    lastError: null,
    id: 'mock-extension-id',
  },
  tabs: {
    query: vi.fn(),
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
    get: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  storage: {
    // Resolve to an empty record so the Supabase client's GoTrue init (which
    // reads the session on import) doesn't reject on `result[key]` of undefined.
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
  sidePanel: {
    setOptions: vi.fn(),
    setPanelBehavior: vi.fn(),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
  },
};

Object.assign(globalThis, { chrome: chromeMock });
