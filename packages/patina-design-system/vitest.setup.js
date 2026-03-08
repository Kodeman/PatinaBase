"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("@testing-library/jest-dom/vitest");
const react_1 = require("@testing-library/react");
const vitest_1 = require("vitest");
const axeMatchers = __importStar(require("vitest-axe/matchers"));
// Add axe matchers
vitest_1.expect.extend(axeMatchers);
// Cleanup after each test
(0, vitest_1.afterEach)(() => {
    (0, react_1.cleanup)();
});
// Suppress React act warnings in tests (known issue with Radix UI components)
const originalError = console.error;
(0, vitest_1.beforeAll)(() => {
    console.error = (...args) => {
        if (typeof args[0] === 'string' &&
            args[0].includes('was not wrapped in act')) {
            return;
        }
        originalError.call(console, ...args);
    };
});
(0, vitest_1.afterAll)(() => {
    console.error = originalError;
});
// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vitest_1.vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vitest_1.vi.fn(),
        removeListener: vitest_1.vi.fn(),
        addEventListener: vitest_1.vi.fn(),
        removeEventListener: vitest_1.vi.fn(),
        dispatchEvent: vitest_1.vi.fn(),
    })),
});
// Mock clipboard API
Object.assign(navigator, {
    clipboard: {
        writeText: vitest_1.vi.fn().mockResolvedValue(undefined),
        readText: vitest_1.vi.fn().mockResolvedValue(''),
    },
});
// Mock scrollIntoView
Element.prototype.scrollIntoView = vitest_1.vi.fn();
// Mock hasPointerCapture
HTMLElement.prototype.hasPointerCapture = vitest_1.vi.fn().mockReturnValue(false);
// Mock setPointerCapture and releasePointerCapture
HTMLElement.prototype.setPointerCapture = vitest_1.vi.fn();
HTMLElement.prototype.releasePointerCapture = vitest_1.vi.fn();
// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
    constructor() { }
    disconnect() { }
    observe() { }
    takeRecords() {
        return [];
    }
    unobserve() { }
};
// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    constructor() { }
    disconnect() { }
    observe() { }
    unobserve() { }
};
//# sourceMappingURL=vitest.setup.js.map