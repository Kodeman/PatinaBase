/**
 * URL Value Object
 *
 * Immutable value object representing a validated URL.
 * Provides URL parsing, validation, and manipulation capabilities.
 */

export class InvalidURLError extends Error {
  constructor(url: string, reason?: string) {
    super(reason ? `Invalid URL "${url}": ${reason}` : `Invalid URL "${url}"`);
    this.name = 'InvalidURLError';
  }
}

export interface URLComponents {
  protocol: string;
  hostname: string;
  port?: string;
  pathname: string;
  search: string;
  hash: string;
}

export class Url {
  private static readonly PROTOCOL_REGEX = /^https?:\/\//i;

  private constructor(private readonly value: string) {
    this.validate();
  }

  private validate(): void {
    if (!this.value || this.value.trim().length === 0) {
      throw new InvalidURLError(this.value, 'URL cannot be empty');
    }

    try {
      // Use native URL constructor for validation
      new URL(this.value);
    } catch {
      throw new InvalidURLError(this.value, 'Malformed URL');
    }
  }

  /**
   * Get the full URL
   */
  getValue(): string {
    return this.value;
  }

  /**
   * Get protocol (e.g., "https:", "http:")
   */
  getProtocol(): string {
    return new URL(this.value).protocol;
  }

  /**
   * Get hostname (e.g., "example.com")
   */
  getHostname(): string {
    return new URL(this.value).hostname;
  }

  /**
   * Get port (empty string if not specified)
   */
  getPort(): string {
    return new URL(this.value).port;
  }

  /**
   * Get pathname (e.g., "/path/to/page")
   */
  getPathname(): string {
    return new URL(this.value).pathname;
  }

  /**
   * Get search/query string (e.g., "?key=value")
   */
  getSearch(): string {
    return new URL(this.value).search;
  }

  /**
   * Get hash/fragment (e.g., "#section")
   */
  getHash(): string {
    return new URL(this.value).hash;
  }

  /**
   * Get origin (protocol + hostname + port)
   */
  getOrigin(): string {
    return new URL(this.value).origin;
  }

  /**
   * Get all URL components
   */
  getComponents(): URLComponents {
    const url = new URL(this.value);
    return {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    };
  }

  /**
   * Get query parameters as object
   */
  getQueryParams(): Record<string, string> {
    const params: Record<string, string> = {};
    const searchParams = new URL(this.value).searchParams;

    searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return params;
  }

  /**
   * Check if URL uses HTTPS
   */
  isSecure(): boolean {
    return this.getProtocol() === 'https:';
  }

  /**
   * Check if URL is HTTP or HTTPS
   */
  isHttp(): boolean {
    const protocol = this.getProtocol();
    return protocol === 'http:' || protocol === 'https:';
  }

  /**
   * Check if URL is on the same domain
   */
  isSameDomain(other: Url): boolean {
    return this.getHostname() === other.getHostname();
  }

  /**
   * Check if URL is on the same origin (protocol + domain + port)
   */
  isSameOrigin(other: Url): boolean {
    return this.getOrigin() === other.getOrigin();
  }

  /**
   * Add or update query parameter
   */
  withQueryParam(key: string, value: string): Url {
    const url = new URL(this.value);
    url.searchParams.set(key, value);
    return new Url(url.toString());
  }

  /**
   * Remove query parameter
   */
  withoutQueryParam(key: string): Url {
    const url = new URL(this.value);
    url.searchParams.delete(key);
    return new Url(url.toString());
  }

  /**
   * Set hash/fragment
   */
  withHash(hash: string): Url {
    const url = new URL(this.value);
    url.hash = hash.startsWith('#') ? hash : `#${hash}`;
    return new Url(url.toString());
  }

  /**
   * Remove hash/fragment
   */
  withoutHash(): Url {
    const url = new URL(this.value);
    url.hash = '';
    return new Url(url.toString());
  }

  /**
   * Convert to HTTPS if HTTP
   */
  toSecure(): Url {
    if (this.getProtocol() === 'http:') {
      const url = new URL(this.value);
      url.protocol = 'https:';
      return new Url(url.toString());
    }
    return this;
  }

  /**
   * Check if two URLs are equal
   */
  equals(other: Url): boolean {
    return this.value === other.value;
  }

  /**
   * Check if URLs are equal (ignoring hash)
   */
  equalsIgnoreHash(other: Url): boolean {
    return this.withoutHash().equals(other.withoutHash());
  }

  /**
   * Check if URLs are equal (ignoring query params)
   */
  equalsIgnoreQuery(other: Url): boolean {
    const url1 = new URL(this.value);
    const url2 = new URL(other.value);

    url1.search = '';
    url2.search = '';

    return url1.toString() === url2.toString();
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    return this.value;
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): string {
    return this.value;
  }

  /**
   * Factory method to create URL value object
   */
  static create(url: string): Url {
    const trimmed = url.trim();
    return new Url(trimmed);
  }

  /**
   * Create URL with automatic HTTPS if no protocol specified
   */
  static createWithDefaultProtocol(url: string, defaultProtocol: 'http' | 'https' = 'https'): Url {
    const trimmed = url.trim();

    if (!Url.PROTOCOL_REGEX.test(trimmed)) {
      return new Url(`${defaultProtocol}://${trimmed}`);
    }

    return new Url(trimmed);
  }

  /**
   * Create URL or return null if invalid
   */
  static createOrNull(url: string): Url | null {
    try {
      return Url.create(url);
    } catch {
      return null;
    }
  }

  /**
   * Validate URL without creating instance
   */
  static isValid(url: string): boolean {
    try {
      Url.create(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse query string into object
   */
  static parseQueryString(query: string): Record<string, string> {
    const params: Record<string, string> = {};
    const searchParams = new URLSearchParams(query);

    searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return params;
  }

  /**
   * Build query string from object
   */
  static buildQueryString(params: Record<string, string | number | boolean>): string {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      searchParams.set(key, String(value));
    });

    return searchParams.toString();
  }

  /**
   * Join URL path segments
   */
  static joinPath(...segments: string[]): string {
    return segments
      .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
      .filter((segment) => segment.length > 0)
      .join('/');
  }

  /**
   * Combine base URL with path
   */
  static combine(base: string, ...paths: string[]): Url {
    const baseUrl = new URL(base);
    const path = Url.joinPath(baseUrl.pathname, ...paths);
    baseUrl.pathname = `/${path}`;
    return new Url(baseUrl.toString());
  }
}
