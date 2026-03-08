import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import Vibrant from 'node-vibrant';

export interface ImageClassification {
  type: 'product' | 'lifestyle' | 'texture' | 'pattern' | 'unknown';
  confidence: number;
  features: {
    hasText: boolean;
    hasFaces: boolean;
    hasProducts: boolean;
    complexity: number;
    colorfulness: number;
  };
}

export interface TextDetectionResult {
  hasText: boolean;
  textRegions: TextRegion[];
  confidence: number;
}

export interface TextRegion {
  text?: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

export interface FaceDetectionResult {
  hasFaces: boolean;
  faces: Face[];
  privacyConcern: boolean;
}

export interface Face {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  landmarks?: {
    leftEye?: { x: number; y: number };
    rightEye?: { x: number; y: number };
    nose?: { x: number; y: number };
    mouth?: { x: number; y: number };
  };
}

export interface ColorAnalysis {
  dominantColors: string[];
  palette: {
    vibrant?: string;
    muted?: string;
    darkVibrant?: string;
    darkMuted?: string;
    lightVibrant?: string;
    lightMuted?: string;
  };
  colorfulness: number;
  averageBrightness: number;
  temperature: 'warm' | 'cool' | 'neutral';
}

@Injectable()
export class ImageAnalysisService {
  private readonly logger = new Logger(ImageAnalysisService.name);

  constructor(private config: ConfigService) {}

  /**
   * Classify image type (product vs lifestyle vs texture)
   */
  async classifyImage(buffer: Buffer): Promise<ImageClassification> {
    try {
      const metadata = await sharp(buffer).metadata();
      const stats = await sharp(buffer).stats();

      // Extract features
      const complexity = await this.calculateComplexity(buffer, stats);
      const colorfulness = this.calculateColorfulness(stats);
      const hasText = await this.quickTextDetection(buffer);
      const symmetry = await this.detectSymmetry(buffer);
      const edgeDensity = await this.calculateEdgeDensity(buffer);

      // Classification logic based on features
      let type: ImageClassification['type'] = 'unknown';
      let confidence = 0.5;

      // Product images tend to be:
      // - High symmetry
      // - Clean backgrounds (low complexity)
      // - Centered composition
      if (symmetry > 0.7 && complexity < 0.4 && edgeDensity > 0.3) {
        type = 'product';
        confidence = 0.8;
      }
      // Lifestyle images tend to be:
      // - Complex scenes
      // - Natural composition
      // - Variable lighting
      else if (complexity > 0.6 && symmetry < 0.5) {
        type = 'lifestyle';
        confidence = 0.75;
      }
      // Texture/pattern images:
      // - High repetition
      // - High edge density
      // - Low semantic content
      else if (edgeDensity > 0.6 && symmetry > 0.5) {
        type = complexity > 0.5 ? 'pattern' : 'texture';
        confidence = 0.7;
      }

      this.logger.log(
        `Classified image as ${type} (confidence: ${(confidence * 100).toFixed(1)}%)`,
      );

      return {
        type,
        confidence,
        features: {
          hasText,
          hasFaces: false, // Placeholder - requires ML model
          hasProducts: type === 'product',
          complexity,
          colorfulness,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to classify image: ${error.message}`);
      return {
        type: 'unknown',
        confidence: 0,
        features: {
          hasText: false,
          hasFaces: false,
          hasProducts: false,
          complexity: 0,
          colorfulness: 0,
        },
      };
    }
  }

  /**
   * Detect text in image for compliance
   */
  async detectText(buffer: Buffer): Promise<TextDetectionResult> {
    try {
      // Quick heuristic-based text detection
      const hasText = await this.quickTextDetection(buffer);

      // For production, integrate with OCR service:
      // - Google Cloud Vision API
      // - AWS Textract
      // - Azure Computer Vision
      // - Tesseract.js

      this.logger.log(`Text detection result: ${hasText ? 'Text detected' : 'No text'}`);

      return {
        hasText,
        textRegions: [],
        confidence: hasText ? 0.7 : 0.9,
      };
    } catch (error) {
      this.logger.error(`Failed to detect text: ${error.message}`);
      return {
        hasText: false,
        textRegions: [],
        confidence: 0,
      };
    }
  }

  /**
   * Quick heuristic-based text detection using edge patterns
   */
  private async quickTextDetection(buffer: Buffer): Promise<boolean> {
    try {
      // Convert to grayscale and apply edge detection
      const edges = await sharp(buffer)
        .resize(512, 512, { fit: 'inside' })
        .greyscale()
        .normalise()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1], // Sobel X
        })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Analyze edge patterns - text has characteristic horizontal/vertical patterns
      const pixels = edges.data;
      const width = edges.info.width;
      const height = edges.info.height;

      let strongEdgeCount = 0;
      const threshold = 128;

      for (let i = 0; i < pixels.length; i++) {
        if (pixels[i] > threshold) {
          strongEdgeCount++;
        }
      }

      const edgeRatio = strongEdgeCount / pixels.length;

      // Text typically has 10-30% strong edges in a specific pattern
      return edgeRatio > 0.1 && edgeRatio < 0.35;
    } catch (error) {
      this.logger.error(`Quick text detection failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Detect faces for privacy compliance
   */
  async detectFaces(buffer: Buffer): Promise<FaceDetectionResult> {
    try {
      // Placeholder for face detection integration
      // In production, integrate with:
      // - AWS Rekognition
      // - Azure Face API
      // - Google Cloud Vision
      // - face-api.js (client-side)

      this.logger.warn('Face detection not implemented - using placeholder');

      return {
        hasFaces: false,
        faces: [],
        privacyConcern: false,
      };
    } catch (error) {
      this.logger.error(`Failed to detect faces: ${error.message}`);
      return {
        hasFaces: false,
        faces: [],
        privacyConcern: false,
      };
    }
  }

  /**
   * Analyze color palette and properties
   */
  async analyzeColors(buffer: Buffer): Promise<ColorAnalysis> {
    try {
      const [palette, stats] = await Promise.all([
        Vibrant.from(buffer).getPalette(),
        sharp(buffer).stats(),
      ]);

      // Extract dominant colors
      const dominantColors: string[] = [];
      if (palette.Vibrant?.hex) dominantColors.push(palette.Vibrant.hex);
      if (palette.DarkVibrant?.hex) dominantColors.push(palette.DarkVibrant.hex);
      if (palette.LightVibrant?.hex) dominantColors.push(palette.LightVibrant.hex);

      // Calculate colorfulness
      const colorfulness = this.calculateColorfulness(stats);

      // Calculate average brightness
      const avgBrightness =
        stats.channels.reduce((sum, ch) => sum + ch.mean, 0) / stats.channels.length / 255;

      // Determine color temperature
      const temperature = this.determineColorTemperature(palette);

      return {
        dominantColors,
        palette: {
          vibrant: palette.Vibrant?.hex,
          muted: palette.Muted?.hex,
          darkVibrant: palette.DarkVibrant?.hex,
          darkMuted: palette.DarkMuted?.hex,
          lightVibrant: palette.LightVibrant?.hex,
          lightMuted: palette.LightMuted?.hex,
        },
        colorfulness,
        averageBrightness: avgBrightness,
        temperature,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze colors: ${error.message}`);
      return {
        dominantColors: [],
        palette: {},
        colorfulness: 0,
        averageBrightness: 0.5,
        temperature: 'neutral',
      };
    }
  }

  /**
   * Calculate image complexity (useful for compression decisions)
   */
  private async calculateComplexity(buffer: Buffer, stats?: sharp.Stats): Promise<number> {
    try {
      if (!stats) {
        stats = await sharp(buffer).stats();
      }

      // Complexity based on color variance and channel standard deviation
      const avgStdDev = stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length;

      // Normalize to 0-1 range (typical stddev range is 0-128 for 8-bit images)
      const complexity = Math.min(avgStdDev / 80, 1);

      return complexity;
    } catch (error) {
      this.logger.error(`Failed to calculate complexity: ${error.message}`);
      return 0.5;
    }
  }

  /**
   * Calculate colorfulness metric
   */
  private calculateColorfulness(stats: sharp.Stats): number {
    if (stats.channels.length < 3) return 0;

    // Calculate colorfulness using standard deviation of color channels
    const rStdDev = stats.channels[0].stdev;
    const gStdDev = stats.channels[1].stdev;
    const bStdDev = stats.channels[2].stdev;

    const avgStdDev = (rStdDev + gStdDev + bStdDev) / 3;

    // Normalize to 0-1 range
    return Math.min(avgStdDev / 100, 1);
  }

  /**
   * Determine color temperature (warm/cool/neutral)
   */
  private determineColorTemperature(
    palette: Awaited<ReturnType<typeof Vibrant.prototype.getPalette>>,
  ): 'warm' | 'cool' | 'neutral' {
    // Analyze dominant color's RGB values
    const vibrant = palette.Vibrant?.rgb;
    if (!vibrant) return 'neutral';

    const [r, g, b] = vibrant;

    // Calculate color temperature based on R vs B ratio
    const warmth = (r - b) / 255;

    if (warmth > 0.15) return 'warm';
    if (warmth < -0.15) return 'cool';
    return 'neutral';
  }

  /**
   * Detect image symmetry
   */
  private async detectSymmetry(buffer: Buffer): Promise<number> {
    try {
      const small = await sharp(buffer)
        .resize(128, 128, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixels = small.data;
      const width = small.info.width;
      const height = small.info.height;

      // Check vertical symmetry
      let symmetryScore = 0;
      let comparisons = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width / 2; x++) {
          const leftIdx = y * width + x;
          const rightIdx = y * width + (width - 1 - x);

          const diff = Math.abs(pixels[leftIdx] - pixels[rightIdx]);
          symmetryScore += 1 - diff / 255;
          comparisons++;
        }
      }

      return symmetryScore / comparisons;
    } catch (error) {
      this.logger.error(`Failed to detect symmetry: ${error.message}`);
      return 0;
    }
  }

  /**
   * Calculate edge density (useful for classification)
   */
  private async calculateEdgeDensity(buffer: Buffer): Promise<number> {
    try {
      const edges = await sharp(buffer)
        .resize(256, 256, { fit: 'inside' })
        .greyscale()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
        })
        .raw()
        .toBuffer();

      let strongEdges = 0;
      const threshold = 100;

      for (const pixel of edges) {
        if (pixel > threshold) strongEdges++;
      }

      return strongEdges / edges.length;
    } catch (error) {
      this.logger.error(`Failed to calculate edge density: ${error.message}`);
      return 0;
    }
  }

  /**
   * Comprehensive image analysis
   */
  async analyzeImage(buffer: Buffer): Promise<{
    classification: ImageClassification;
    textDetection: TextDetectionResult;
    faceDetection: FaceDetectionResult;
    colorAnalysis: ColorAnalysis;
  }> {
    const [classification, textDetection, faceDetection, colorAnalysis] = await Promise.all([
      this.classifyImage(buffer),
      this.detectText(buffer),
      this.detectFaces(buffer),
      this.analyzeColors(buffer),
    ]);

    return {
      classification,
      textDetection,
      faceDetection,
      colorAnalysis,
    };
  }

  /**
   * Check if image meets quality standards
   */
  async validateImageQuality(buffer: Buffer, minWidth = 800, minHeight = 600): Promise<{
    valid: boolean;
    issues: string[];
    metrics: {
      width: number;
      height: number;
      sharpness: number;
      brightness: number;
      contrast: number;
    };
  }> {
    const issues: string[] = [];

    const metadata = await sharp(buffer).metadata();
    const stats = await sharp(buffer).stats();

    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // Check dimensions
    if (width < minWidth || height < minHeight) {
      issues.push(
        `Image too small: ${width}x${height} (minimum: ${minWidth}x${minHeight})`,
      );
    }

    // Calculate quality metrics
    const sharpness = stats.sharpness || 0;
    const brightness =
      stats.channels.reduce((sum, ch) => sum + ch.mean, 0) / stats.channels.length / 255;
    const contrast =
      stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length / 255;

    // Check sharpness
    if (sharpness < 0.3) {
      issues.push('Image appears blurry or out of focus');
    }

    // Check brightness
    if (brightness < 0.15) {
      issues.push('Image is too dark');
    } else if (brightness > 0.85) {
      issues.push('Image is too bright (possible overexposure)');
    }

    // Check contrast
    if (contrast < 0.15) {
      issues.push('Image has low contrast');
    }

    return {
      valid: issues.length === 0,
      issues,
      metrics: {
        width,
        height,
        sharpness,
        brightness,
        contrast,
      },
    };
  }
}
