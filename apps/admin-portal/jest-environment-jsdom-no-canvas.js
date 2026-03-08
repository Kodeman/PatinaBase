/**
 * Custom Jest environment that extends jsdom but prevents canvas from loading
 */

const JSDOMEnvironment = require('jest-environment-jsdom').TestEnvironment;

/**
 * Mock canvas module at the require level before jsdom initializes
 */
class JSDOMEnvironmentNoCanvas extends JSDOMEnvironment {
  constructor(config, context) {
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
