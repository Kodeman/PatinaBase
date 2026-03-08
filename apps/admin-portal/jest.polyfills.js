/**
 * Jest polyfills to prevent canvas native module loading
 * This file runs BEFORE jest environment is set up
 */

// Mock canvas at the module level before jsdom tries to load it
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === 'canvas') {
    return {
      createCanvas: () => ({
        getContext: () => ({}),
        toBuffer: () => Buffer.from(''),
        toDataURL: () => 'data:image/png;base64,',
      }),
      loadImage: () => Promise.resolve({ src: '', width: 0, height: 0 }),
      Image: class MockImage {},
      Canvas: class MockCanvas {},
    };
  }
  return originalRequire.apply(this, arguments);
};
