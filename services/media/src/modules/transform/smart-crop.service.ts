import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

export interface FocalPoint {
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  confidence: number; // 0-1
}

export interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SmartCropResult {
  buffer: Buffer;
  region: CropRegion;
  focalPoint: FocalPoint;
}

export interface CropOptions {
  width: number;
  height: number;
  focalPoint?: FocalPoint;
  aspectRatio?: number;
  strategy?: 'attention' | 'entropy' | 'center' | 'focal';
}

@Injectable()
export class SmartCropService {
  private readonly logger = new Logger(SmartCropService.name);

  /**
   * Perform smart crop using various strategies
   */
  async smartCrop(buffer: Buffer, options: CropOptions): Promise<SmartCropResult> {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Unable to read image dimensions');
    }

    // Detect focal point if not provided
    const focalPoint = options.focalPoint || (await this.detectFocalPoint(buffer, metadata));

    // Calculate crop region
    const region = this.calculateCropRegion(metadata, options, focalPoint);

    this.logger.log(
      `Smart cropping ${metadata.width}x${metadata.height} to ${options.width}x${options.height} ` +
        `at focal point (${(focalPoint.x * 100).toFixed(1)}%, ${(focalPoint.y * 100).toFixed(1)}%)`,
    );

    // Perform the crop
    const cropped = await sharp(buffer)
      .extract({
        left: Math.round(region.left),
        top: Math.round(region.top),
        width: Math.round(region.width),
        height: Math.round(region.height),
      })
      .resize(options.width, options.height, {
        fit: 'cover',
        position: 'centre',
      })
      .toBuffer();

    return {
      buffer: cropped,
      region,
      focalPoint,
    };
  }

  /**
   * Detect focal point using attention-based algorithm
   */
  async detectFocalPoint(buffer: Buffer, metadata: sharp.Metadata): Promise<FocalPoint> {
    try {
      // Get image statistics to detect areas of interest
      const stats = await sharp(buffer).stats();

      // Create saliency map using edge detection
      const saliencyMap = await this.generateSaliencyMap(buffer, metadata);

      // Find region with highest saliency
      const focalPoint = this.findMaxSaliencyPoint(saliencyMap, metadata);

      this.logger.log(
        `Detected focal point at (${(focalPoint.x * 100).toFixed(1)}%, ${(focalPoint.y * 100).toFixed(1)}%) ` +
          `with confidence ${(focalPoint.confidence * 100).toFixed(1)}%`,
      );

      return focalPoint;
    } catch (error) {
      this.logger.error(`Failed to detect focal point: ${error.message}`);
      // Fallback to center
      return { x: 0.5, y: 0.5, confidence: 0.5 };
    }
  }

  /**
   * Generate saliency map using edge detection and contrast
   */
  private async generateSaliencyMap(
    buffer: Buffer,
    metadata: sharp.Metadata,
  ): Promise<number[][]> {
    const width = metadata.width!;
    const height = metadata.height!;

    // Resize to smaller size for faster processing
    const processingWidth = Math.min(width, 256);
    const processingHeight = Math.min(height, 256);

    // Apply edge detection using Sobel filter
    const edges = await sharp(buffer)
      .resize(processingWidth, processingHeight, { fit: 'fill' })
      .greyscale()
      .normalise()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], // Laplacian kernel
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Convert to 2D array
    const saliencyMap: number[][] = [];
    for (let y = 0; y < processingHeight; y++) {
      const row: number[] = [];
      for (let x = 0; x < processingWidth; x++) {
        const idx = y * processingWidth + x;
        row.push(edges.data[idx] || 0);
      }
      saliencyMap.push(row);
    }

    return saliencyMap;
  }

  /**
   * Find point with maximum saliency using grid search
   */
  private findMaxSaliencyPoint(
    saliencyMap: number[][],
    metadata: sharp.Metadata,
  ): FocalPoint {
    const height = saliencyMap.length;
    const width = saliencyMap[0]?.length || 0;

    if (width === 0 || height === 0) {
      return { x: 0.5, y: 0.5, confidence: 0 };
    }

    const gridSize = 8; // Divide image into 8x8 grid
    const cellWidth = width / gridSize;
    const cellHeight = height / gridSize;

    let maxSaliency = 0;
    let maxX = width / 2;
    let maxY = height / 2;

    // Calculate average saliency for each grid cell
    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const startX = Math.floor(gx * cellWidth);
        const startY = Math.floor(gy * cellHeight);
        const endX = Math.min(Math.floor((gx + 1) * cellWidth), width);
        const endY = Math.min(Math.floor((gy + 1) * cellHeight), height);

        let cellSum = 0;
        let cellCount = 0;

        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            cellSum += saliencyMap[y][x];
            cellCount++;
          }
        }

        const cellAvg = cellSum / cellCount;

        // Apply rule of thirds weighting
        const ruleOfThirdsWeight = this.getRuleOfThirdsWeight(gx, gy, gridSize);
        const weightedSaliency = cellAvg * ruleOfThirdsWeight;

        if (weightedSaliency > maxSaliency) {
          maxSaliency = weightedSaliency;
          maxX = (startX + endX) / 2;
          maxY = (startY + endY) / 2;
        }
      }
    }

    // Normalize confidence based on max saliency value
    const confidence = Math.min(maxSaliency / 255, 1);

    return {
      x: maxX / width,
      y: maxY / height,
      confidence,
    };
  }

  /**
   * Get weight based on rule of thirds composition
   */
  private getRuleOfThirdsWeight(gx: number, gy: number, gridSize: number): number {
    // Grid positions aligned with rule of thirds get higher weight
    const oneThird = gridSize / 3;
    const twoThirds = (2 * gridSize) / 3;

    const xWeight =
      gx >= oneThird - 1 && gx <= oneThird + 1
        ? 1.5
        : gx >= twoThirds - 1 && gx <= twoThirds + 1
          ? 1.5
          : 1.0;

    const yWeight =
      gy >= oneThird - 1 && gy <= oneThird + 1
        ? 1.5
        : gy >= twoThirds - 1 && gy <= twoThirds + 1
          ? 1.5
          : 1.0;

    return xWeight * yWeight;
  }

  /**
   * Calculate optimal crop region based on focal point
   */
  private calculateCropRegion(
    metadata: sharp.Metadata,
    options: CropOptions,
    focalPoint: FocalPoint,
  ): CropRegion {
    const sourceWidth = metadata.width!;
    const sourceHeight = metadata.height!;
    const targetWidth = options.width;
    const targetHeight = options.height;

    // Calculate target aspect ratio
    const targetAspect = targetWidth / targetHeight;
    const sourceAspect = sourceWidth / sourceHeight;

    let cropWidth: number;
    let cropHeight: number;

    if (sourceAspect > targetAspect) {
      // Source is wider - crop width
      cropHeight = sourceHeight;
      cropWidth = cropHeight * targetAspect;
    } else {
      // Source is taller - crop height
      cropWidth = sourceWidth;
      cropHeight = cropWidth / targetAspect;
    }

    // Center crop around focal point
    let left = focalPoint.x * sourceWidth - cropWidth / 2;
    let top = focalPoint.y * sourceHeight - cropHeight / 2;

    // Constrain to image bounds
    left = Math.max(0, Math.min(left, sourceWidth - cropWidth));
    top = Math.max(0, Math.min(top, sourceHeight - cropHeight));

    return {
      left,
      top,
      width: cropWidth,
      height: cropHeight,
    };
  }

  /**
   * Generate multiple crops for different aspect ratios
   */
  async generateMultipleCrops(
    buffer: Buffer,
    crops: Array<{ name: string; width: number; height: number }>,
    focalPoint?: FocalPoint,
  ): Promise<Map<string, SmartCropResult>> {
    const results = new Map<string, SmartCropResult>();

    const metadata = await sharp(buffer).metadata();
    const detectedFocalPoint = focalPoint || (await this.detectFocalPoint(buffer, metadata));

    for (const crop of crops) {
      try {
        const result = await this.smartCrop(buffer, {
          width: crop.width,
          height: crop.height,
          focalPoint: detectedFocalPoint,
        });
        results.set(crop.name, result);
      } catch (error) {
        this.logger.error(`Failed to generate crop ${crop.name}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Detect faces in image (placeholder for face detection integration)
   */
  async detectFaces(buffer: Buffer): Promise<FocalPoint[]> {
    // TODO: Integrate with face detection service (e.g., AWS Rekognition, Azure Face API)
    this.logger.warn('Face detection not implemented - using fallback');
    return [];
  }

  /**
   * Entropy-based crop (finds most "interesting" region)
   */
  async entropyCrop(buffer: Buffer, options: CropOptions): Promise<SmartCropResult> {
    const metadata = await sharp(buffer).metadata();

    // Calculate entropy map
    const entropyMap = await this.calculateEntropyMap(buffer, metadata);

    // Find region with highest entropy
    const focalPoint = this.findMaxEntropyPoint(entropyMap, metadata);

    // Use standard smart crop with entropy-based focal point
    return this.smartCrop(buffer, {
      ...options,
      focalPoint,
    });
  }

  /**
   * Calculate entropy map for image
   */
  private async calculateEntropyMap(
    buffer: Buffer,
    metadata: sharp.Metadata,
  ): Promise<number[][]> {
    const width = Math.min(metadata.width || 256, 256);
    const height = Math.min(metadata.height || 256, 256);

    // Get pixel data
    const data = await sharp(buffer)
      .resize(width, height, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = data.data;
    const windowSize = 16; // Entropy calculation window

    const entropyMap: number[][] = [];

    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) {
        // Calculate local entropy in window around this pixel
        const entropy = this.calculateLocalEntropy(pixels, x, y, width, height, windowSize);
        row.push(entropy);
      }
      entropyMap.push(row);
    }

    return entropyMap;
  }

  /**
   * Calculate local entropy in a window
   */
  private calculateLocalEntropy(
    pixels: Buffer,
    cx: number,
    cy: number,
    width: number,
    height: number,
    windowSize: number,
  ): number {
    const histogram = new Array(256).fill(0);
    let count = 0;

    const halfWindow = Math.floor(windowSize / 2);

    for (let y = Math.max(0, cy - halfWindow); y < Math.min(height, cy + halfWindow); y++) {
      for (let x = Math.max(0, cx - halfWindow); x < Math.min(width, cx + halfWindow); x++) {
        const idx = (y * width + x) * 3; // Assuming RGB
        const gray = Math.floor(
          (pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114),
        );
        histogram[gray]++;
        count++;
      }
    }

    // Calculate Shannon entropy
    let entropy = 0;
    for (const freq of histogram) {
      if (freq > 0) {
        const p = freq / count;
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  /**
   * Find point with maximum entropy
   */
  private findMaxEntropyPoint(
    entropyMap: number[][],
    metadata: sharp.Metadata,
  ): FocalPoint {
    const height = entropyMap.length;
    const width = entropyMap[0]?.length || 0;

    if (width === 0 || height === 0) {
      return { x: 0.5, y: 0.5, confidence: 0 };
    }

    let maxEntropy = 0;
    let maxX = width / 2;
    let maxY = height / 2;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const entropy = entropyMap[y][x];
        if (entropy > maxEntropy) {
          maxEntropy = entropy;
          maxX = x;
          maxY = y;
        }
      }
    }

    // Normalize entropy to confidence (max Shannon entropy for 8-bit is 8)
    const confidence = Math.min(maxEntropy / 8, 1);

    return {
      x: maxX / width,
      y: maxY / height,
      confidence,
    };
  }

  /**
   * Generate art-directed crops with manual focal points
   */
  async artDirectedCrop(
    buffer: Buffer,
    crops: Array<{
      name: string;
      width: number;
      height: number;
      focalPoint: FocalPoint;
    }>,
  ): Promise<Map<string, SmartCropResult>> {
    const results = new Map<string, SmartCropResult>();

    for (const crop of crops) {
      try {
        const result = await this.smartCrop(buffer, crop);
        results.set(crop.name, result);
      } catch (error) {
        this.logger.error(`Failed to generate art-directed crop ${crop.name}: ${error.message}`);
      }
    }

    return results;
  }
}
