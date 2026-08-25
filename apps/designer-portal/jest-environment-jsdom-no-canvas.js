/**
 * Custom Jest environment that extends jsdom but prevents canvas from loading
 */

const JSDOMEnvironment = require('jest-environment-jsdom').TestEnvironment;

/**
 * Mock canvas module at the require level before jsdom initializes
 */
class JSDOMEnvironmentNoCanvas extends JSDOMEnvironment {
  constructor(config, context) {
    // Pin the timezone this jsdom realm resolves Date/Intl against, so
    // date-only assertions are deterministic on any host/CI runner
    // (CI's runner TZ is UTC; a developer's machine can be anything).
    //
    // Several suites are authored against a negative-offset zone on
    // purpose — their comments spell out "America/Chicago" explicitly,
    // since that's the zone the day-vs-moment bugs they guard against are
    // actually visible in (src/lib/document/__tests__/format.test.ts,
    // mark-signed-sheet.test.tsx + its __tests__ variant,
    // trade-scope-detail.test.tsx). This must run here, before
    // `super(config, context)` constructs the jsdom Window: once a jsdom
    // realm resolves its default ICU timezone (at Window construction),
    // that resolution is cached for the realm's lifetime — a later
    // `process.env.TZ` mutation from a setupFile or a test's own
    // `beforeEach` (several of the suites above already try this) no
    // longer has anywhere to take effect. Confirmed empirically: setting
    // TZ in jest.polyfills.js (a setupFile, which runs inside the
    // already-constructed environment) left Date/Intl reporting the
    // ambient runner TZ; setting it here, before super(), is what
    // actually reaches the realm's Date/Intl.
    process.env.TZ = 'America/Chicago';

    // Intercept canvas loading before jsdom initializes
    const Module = require('module');
    const originalRequire = Module.prototype.require;

    Module.prototype.require = function (id) {
      if (id === 'canvas') {
        // Return a mock canvas implementation
        return {
          createCanvas: (width, height) => ({
            width: width || 300,
            height: height || 150,
            getContext: () => ({
              fillRect: () => {},
              clearRect: () => {},
              getImageData: (x, y, w, h) => ({ data: new Array(w * h * 4) }),
              putImageData: () => {},
              createImageData: () => [],
              setTransform: () => {},
              drawImage: () => {},
              save: () => {},
              fillText: () => {},
              restore: () => {},
              beginPath: () => {},
              moveTo: () => {},
              lineTo: () => {},
              closePath: () => {},
              stroke: () => {},
              translate: () => {},
              scale: () => {},
              rotate: () => {},
              arc: () => {},
              fill: () => {},
              measureText: () => ({ width: 0 }),
              transform: () => {},
              rect: () => {},
              clip: () => {},
            }),
            toBuffer: () => Buffer.from(''),
            toDataURL: () => 'data:image/png;base64,',
          }),
          loadImage: () => Promise.resolve({ src: '', width: 0, height: 0 }),
          Image: class MockImage {
            constructor() {
              this.src = '';
              this.width = 0;
              this.height = 0;
            }
          },
          Canvas: class MockCanvas {
            constructor(width, height) {
              this.width = width || 300;
              this.height = height || 150;
            }
          },
        };
      }
      return originalRequire.apply(this, arguments);
    };

    super(config, context);
  }

  async setup() {
    await super.setup();

    // Also add canvas mock to global scope for any code that might reference it
    if (this.global) {
      this.global.HTMLCanvasElement = class HTMLCanvasElement {
        getContext() {
          return {
            fillRect: () => {},
            clearRect: () => {},
            getImageData: () => ({ data: [] }),
          };
        }
      };
    }
  }
}

module.exports = JSDOMEnvironmentNoCanvas;
