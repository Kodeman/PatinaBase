import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackgroundRemovalConfig } from './background-removal.config';
import {
  BackgroundRemovalSourceError,
  BackgroundRemovalStorageError,
} from './background-removal.errors';
import { readResponseBuffer } from './response-buffer';

const BOARD_BUCKET = 'proposal-mood-boards';

function encodedObjectPath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function validObjectSegments(parts: string[]): boolean {
  return (
    parts.length > 0 &&
    parts.every(
      (part) =>
        part.length > 0 &&
        part !== '.' &&
        part !== '..' &&
        !part.includes('/') &&
        !part.includes('\\') &&
        !part.includes('\0'),
    )
  );
}

@Injectable()
export class SupabaseBoardStorageService {
  private readonly supabaseUrl: string | null;
  private readonly serviceRoleKey: string | null;

  constructor(
    config: ConfigService,
    private readonly policy: BackgroundRemovalConfig,
  ) {
    this.supabaseUrl = config.get<string>('SUPABASE_URL')?.replace(/\/$/, '') || null;
    this.serviceRoleKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim() || null;
  }

  parseCanonicalPublicUrl(source: string): string | null {
    if (!this.supabaseUrl) return null;
    const bare = source.trim().replace(/^\/+/, '');
    if (!/^https?:\/\//i.test(bare)) {
      const objectPath = bare.startsWith(`${BOARD_BUCKET}/`)
        ? bare.slice(BOARD_BUCKET.length + 1)
        : bare;
      return validObjectSegments(objectPath.split('/')) ? objectPath : null;
    }
    try {
      const base = new URL(this.supabaseUrl);
      const candidate = new URL(source);
      if (
        candidate.origin !== base.origin ||
        candidate.username ||
        candidate.password ||
        candidate.hash
      ) {
        return null;
      }
      const basePath = base.pathname.replace(/\/$/, '');
      const prefixes = [
        `${basePath}/storage/v1/object/public/${BOARD_BUCKET}/`,
        `${basePath}/storage/v1/object/authenticated/${BOARD_BUCKET}/`,
        `${basePath}/storage/v1/object/sign/${BOARD_BUCKET}/`,
        `${basePath}/storage/v1/render/image/public/${BOARD_BUCKET}/`,
        `${basePath}/storage/v1/render/image/authenticated/${BOARD_BUCKET}/`,
        `${basePath}/storage/v1/render/image/sign/${BOARD_BUCKET}/`,
      ];
      const prefix = prefixes.find((value) => candidate.pathname.startsWith(value));
      if (!prefix) return null;
      const rawParts = candidate.pathname.slice(prefix.length).split('/');
      const parts = rawParts.map((part) => decodeURIComponent(part));
      if (!validObjectSegments(parts)) return null;
      return parts.join('/');
    } catch {
      return null;
    }
  }

  publicUrl(objectPath: string): string {
    this.assertConfigured();
    if (!validObjectSegments(objectPath.split('/'))) {
      throw new BackgroundRemovalStorageError();
    }
    return objectPath;
  }

  async readCanonicalPublicUrl(
    source: string,
  ): Promise<{ objectPath: string; publicUrl: string; bytes: Buffer; declaredMime?: string }> {
    const objectPath = this.parseCanonicalPublicUrl(source);
    if (!objectPath) throw new BackgroundRemovalSourceError();
    this.assertConfigured();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.policy.storageTimeoutMs);
    try {
      const response = await fetch(
        `${this.supabaseUrl}/storage/v1/object/${BOARD_BUCKET}/${encodedObjectPath(objectPath)}`,
        { method: 'GET', headers: this.serverHeaders(), signal: controller.signal },
      );
      if (!response.ok) throw new BackgroundRemovalSourceError();
      const bytes = await readResponseBuffer(response, this.policy.maxSourceBytes, 'storage');
      return {
        objectPath,
        publicUrl: objectPath,
        bytes,
        declaredMime: response.headers.get('content-type') ?? undefined,
      };
    } catch {
      throw new BackgroundRemovalSourceError();
    } finally {
      clearTimeout(timeout);
    }
  }

  async upload(objectPath: string, bytes: Buffer, mimeType: string): Promise<string> {
    this.assertConfigured();
    if (!validObjectSegments(objectPath.split('/'))) {
      throw new BackgroundRemovalStorageError();
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.policy.storageTimeoutMs);
    try {
      const response = await fetch(
        `${this.supabaseUrl}/storage/v1/object/${BOARD_BUCKET}/${encodedObjectPath(objectPath)}`,
        {
          method: 'POST',
          headers: {
            ...this.serverHeaders(),
            'content-type': mimeType,
            'x-upsert': 'false',
          },
          body: new Uint8Array(bytes),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new BackgroundRemovalStorageError();
      return objectPath;
    } catch (error) {
      if (error instanceof BackgroundRemovalStorageError) throw error;
      throw new BackgroundRemovalStorageError();
    } finally {
      clearTimeout(timeout);
    }
  }

  private serverHeaders(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey!,
      authorization: `Bearer ${this.serviceRoleKey}`,
    };
  }

  private assertConfigured(): void {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new BackgroundRemovalStorageError();
    }
  }
}
