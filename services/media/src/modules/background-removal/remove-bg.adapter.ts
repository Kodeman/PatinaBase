import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackgroundRemovalConfig } from './background-removal.config';
import { BackgroundRemovalVendorError } from './background-removal.errors';
import {
  BackgroundRemovalVendor,
  BackgroundRemovalVendorInput,
  BackgroundRemovalVendorResult,
} from './background-removal.types';
import { readResponseBuffer } from './response-buffer';

@Injectable()
export class RemoveBgAdapter implements BackgroundRemovalVendor {
  private readonly apiKey: string | null;
  private readonly apiUrl: string;
  private readonly provider: string;

  constructor(
    config: ConfigService,
    private readonly policy: BackgroundRemovalConfig,
  ) {
    this.apiKey = config.get<string>('BACKGROUND_REMOVAL_API_KEY')?.trim() || null;
    this.apiUrl =
      config.get<string>('BACKGROUND_REMOVAL_API_URL') || 'https://api.remove.bg/v1.0/removebg';
    this.provider = (config.get<string>('BACKGROUND_REMOVAL_PROVIDER') || 'removebg').toLowerCase();
  }

  isConfigured(): boolean {
    return this.provider === 'removebg' && this.apiKey !== null;
  }

  async removeBackground(
    input: BackgroundRemovalVendorInput,
  ): Promise<BackgroundRemovalVendorResult> {
    if (!this.isConfigured()) {
      throw new BackgroundRemovalVendorError();
    }

    const form = new FormData();
    form.append(
      'image_file',
      new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }),
      'source',
    );
    form.append('size', 'auto');
    form.append('format', 'png');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.policy.vendorTimeoutMs);
    try {
      // Intentionally one fetch and no retry layer: one request can consume one
      // paid vendor credit.
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'X-Api-Key': this.apiKey! },
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new BackgroundRemovalVendorError();
      }
      const mime = response.headers.get('content-type')?.split(';', 1)[0].trim();
      if (mime !== 'image/png') {
        throw new BackgroundRemovalVendorError();
      }
      const bytes = await readResponseBuffer(response, this.policy.maxSourceBytes, 'vendor');
      const rawCredits = Number(response.headers.get('x-credits-charged') ?? '1');
      return {
        bytes,
        mimeType: 'image/png',
        creditsUsed: Number.isFinite(rawCredits) && rawCredits >= 0 ? rawCredits : 1,
      };
    } catch (error) {
      if (error instanceof BackgroundRemovalVendorError) throw error;
      throw new BackgroundRemovalVendorError();
    } finally {
      clearTimeout(timeout);
    }
  }
}
