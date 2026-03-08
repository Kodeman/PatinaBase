/**
 * Test setup for DOMPurify
 * Creates a minimal DOM environment for sanitization tests
 */

import { JSDOM } from 'jsdom';

// Create a minimal DOM for DOMPurify
const { window } = new JSDOM('<!DOCTYPE html>');

// Make window and document global for DOMPurify
global.window = window as any;
global.document = window.document as any;
