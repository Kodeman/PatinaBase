/**
 * Mock canvas module to avoid native dependency issues in tests
 * Provides stub implementations for canvas and image functionality
 */

class MockCanvas {
  constructor(width, height) {
    this.width = width || 300;
    this.height = height || 150;
  }

  getContext() {
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: (x, y, w, h) => ({
        data: new Array(w * h * 4)
      }),
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
    };
  }

  toBuffer() {
    return Buffer.from('');
  }

  toDataURL() {
    return 'data:image/png;base64,';
  }
}

class MockImage {
  constructor() {
    this.src = '';
    this.width = 0;
    this.height = 0;
  }
}

module.exports = {
  createCanvas: (width, height) => new MockCanvas(width, height),
  loadImage: () => Promise.resolve(new MockImage()),
  Image: MockImage,
  Canvas: MockCanvas,
};
