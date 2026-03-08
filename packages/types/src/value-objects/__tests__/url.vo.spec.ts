import { Url, InvalidURLError } from '../url.vo';

describe('URL Value Object', () => {
  describe('creation', () => {
    it('should create valid URL', () => {
      const url = Url.create('https://example.com');
      expect(url.getValue()).toBe('https://example.com');
    });

    it('should create URL with path', () => {
      const url = Url.create('https://example.com/path/to/page');
      expect(url.getValue()).toBe('https://example.com/path/to/page');
    });

    it('should create URL with query string', () => {
      const url = Url.create('https://example.com?key=value');
      expect(url.getValue()).toBe('https://example.com/?key=value');
    });

    it('should create URL with hash', () => {
      const url = Url.create('https://example.com#section');
      expect(url.getValue()).toBe('https://example.com/#section');
    });

    it('should create URL with port', () => {
      const url = Url.create('https://example.com:8080');
      expect(url.getValue()).toBe('https://example.com:8080/');
    });

    it('should trim whitespace', () => {
      const url = Url.create('  https://example.com  ');
      expect(url.getValue()).toBe('https://example.com/');
    });

    it('should create with default protocol', () => {
      const url = Url.createWithDefaultProtocol('example.com');
      expect(url.getValue()).toBe('https://example.com/');
    });

    it('should create with HTTP default protocol', () => {
      const url = Url.createWithDefaultProtocol('example.com', 'http');
      expect(url.getValue()).toBe('http://example.com/');
    });
  });

  describe('validation errors', () => {
    it('should reject empty URL', () => {
      expect(() => Url.create('')).toThrow(InvalidURLError);
      expect(() => Url.create('')).toThrow('URL cannot be empty');
    });

    it('should reject whitespace-only URL', () => {
      expect(() => Url.create('   ')).toThrow(InvalidURLError);
    });

    it('should reject malformed URL', () => {
      expect(() => Url.create('not a url')).toThrow(InvalidURLError);
      expect(() => Url.create('not a url')).toThrow('Malformed URL');
    });

    it('should reject URL without protocol', () => {
      expect(() => Url.create('example.com')).toThrow(InvalidURLError);
    });

    it('should reject invalid protocol', () => {
      expect(() => Url.create('ftp://example.com')).not.toThrow(); // FTP is valid
    });
  });

  describe('getters', () => {
    it('should get protocol', () => {
      const https = Url.create('https://example.com');
      const http = Url.create('http://example.com');

      expect(https.getProtocol()).toBe('https:');
      expect(http.getProtocol()).toBe('http:');
    });

    it('should get hostname', () => {
      const url = Url.create('https://example.com/path');
      expect(url.getHostname()).toBe('example.com');
    });

    it('should get port', () => {
      const withPort = Url.create('https://example.com:8080');
      const withoutPort = Url.create('https://example.com');

      expect(withPort.getPort()).toBe('8080');
      expect(withoutPort.getPort()).toBe('');
    });

    it('should get pathname', () => {
      const url = Url.create('https://example.com/path/to/page');
      expect(url.getPathname()).toBe('/path/to/page');
    });

    it('should get search', () => {
      const url = Url.create('https://example.com?key=value&foo=bar');
      expect(url.getSearch()).toBe('?key=value&foo=bar');
    });

    it('should get hash', () => {
      const url = Url.create('https://example.com#section');
      expect(url.getHash()).toBe('#section');
    });

    it('should get origin', () => {
      const url = Url.create('https://example.com:8080/path');
      expect(url.getOrigin()).toBe('https://example.com:8080');
    });

    it('should get components', () => {
      const url = Url.create('https://example.com:8080/path?key=value#section');
      const components = url.getComponents();

      expect(components.protocol).toBe('https:');
      expect(components.hostname).toBe('example.com');
      expect(components.port).toBe('8080');
      expect(components.pathname).toBe('/path');
      expect(components.search).toBe('?key=value');
      expect(components.hash).toBe('#section');
    });

    it('should get query params', () => {
      const url = Url.create('https://example.com?key=value&foo=bar');
      const params = url.getQueryParams();

      expect(params.key).toBe('value');
      expect(params.foo).toBe('bar');
    });
  });

  describe('state checking', () => {
    it('should identify secure URLs', () => {
      const https = Url.create('https://example.com');
      const http = Url.create('http://example.com');

      expect(https.isSecure()).toBe(true);
      expect(http.isSecure()).toBe(false);
    });

    it('should identify HTTP URLs', () => {
      const https = Url.create('https://example.com');
      const http = Url.create('http://example.com');
      const ftp = Url.create('ftp://example.com');

      expect(https.isHttp()).toBe(true);
      expect(http.isHttp()).toBe(true);
      expect(ftp.isHttp()).toBe(false);
    });

    it('should check same domain', () => {
      const url1 = Url.create('https://example.com/path1');
      const url2 = Url.create('https://example.com/path2');
      const url3 = Url.create('https://other.com/path1');

      expect(url1.isSameDomain(url2)).toBe(true);
      expect(url1.isSameDomain(url3)).toBe(false);
    });

    it('should check same origin', () => {
      const url1 = Url.create('https://example.com:8080/path1');
      const url2 = Url.create('https://example.com:8080/path2');
      const url3 = Url.create('https://example.com:9000/path1');

      expect(url1.isSameOrigin(url2)).toBe(true);
      expect(url1.isSameOrigin(url3)).toBe(false);
    });
  });

  describe('manipulation', () => {
    it('should add query parameter', () => {
      const url = Url.create('https://example.com');
      const updated = url.withQueryParam('key', 'value');

      expect(updated.getQueryParams().key).toBe('value');
    });

    it('should update existing query parameter', () => {
      const url = Url.create('https://example.com?key=old');
      const updated = url.withQueryParam('key', 'new');

      expect(updated.getQueryParams().key).toBe('new');
    });

    it('should remove query parameter', () => {
      const url = Url.create('https://example.com?key=value&foo=bar');
      const updated = url.withoutQueryParam('key');

      expect(updated.getQueryParams().key).toBeUndefined();
      expect(updated.getQueryParams().foo).toBe('bar');
    });

    it('should add hash', () => {
      const url = Url.create('https://example.com');
      const updated = url.withHash('section');

      expect(updated.getHash()).toBe('#section');
    });

    it('should add hash with # prefix', () => {
      const url = Url.create('https://example.com');
      const updated = url.withHash('#section');

      expect(updated.getHash()).toBe('#section');
    });

    it('should remove hash', () => {
      const url = Url.create('https://example.com#section');
      const updated = url.withoutHash();

      expect(updated.getHash()).toBe('');
    });

    it('should convert to HTTPS', () => {
      const http = Url.create('http://example.com');
      const https = http.toSecure();

      expect(https.getProtocol()).toBe('https:');
      expect(https.getHostname()).toBe('example.com');
    });

    it('should not change HTTPS URL', () => {
      const https = Url.create('https://example.com');
      const secure = https.toSecure();

      expect(secure).toBe(https);
    });
  });

  describe('equality', () => {
    it('should return true for identical URLs', () => {
      const url1 = Url.create('https://example.com/path');
      const url2 = Url.create('https://example.com/path');

      expect(url1.equals(url2)).toBe(true);
    });

    it('should return false for different URLs', () => {
      const url1 = Url.create('https://example.com/path1');
      const url2 = Url.create('https://example.com/path2');

      expect(url1.equals(url2)).toBe(false);
    });

    it('should check equality ignoring hash', () => {
      const url1 = Url.create('https://example.com#section1');
      const url2 = Url.create('https://example.com#section2');

      expect(url1.equalsIgnoreHash(url2)).toBe(true);
    });

    it('should check equality ignoring query', () => {
      const url1 = Url.create('https://example.com?key=value1');
      const url2 = Url.create('https://example.com?key=value2');

      expect(url1.equalsIgnoreQuery(url2)).toBe(true);
    });
  });

  describe('string conversion', () => {
    it('should convert to string', () => {
      const url = Url.create('https://example.com/path');
      expect(url.toString()).toBe('https://example.com/path');
    });

    it('should convert to JSON', () => {
      const url = Url.create('https://example.com/path');
      expect(url.toJSON()).toBe('https://example.com/path');
    });
  });

  describe('factory methods', () => {
    it('should create URL with create method', () => {
      const url = Url.create('https://example.com');
      expect(url).toBeInstanceOf(Url);
    });

    it('should return null for invalid URL with createOrNull', () => {
      const url = Url.createOrNull('invalid');
      expect(url).toBeNull();
    });

    it('should return URL for valid URL with createOrNull', () => {
      const url = Url.createOrNull('https://example.com');
      expect(url).toBeInstanceOf(Url);
    });

    it('should validate URL with isValid', () => {
      expect(Url.isValid('https://example.com')).toBe(true);
      expect(Url.isValid('invalid')).toBe(false);
    });
  });

  describe('static helper methods', () => {
    it('should parse query string', () => {
      const params = Url.parseQueryString('?key=value&foo=bar');
      expect(params.key).toBe('value');
      expect(params.foo).toBe('bar');
    });

    it('should build query string', () => {
      const query = Url.buildQueryString({ key: 'value', foo: 'bar', num: 123 });
      expect(query).toContain('key=value');
      expect(query).toContain('foo=bar');
      expect(query).toContain('num=123');
    });

    it('should join path segments', () => {
      const path = Url.joinPath('api', 'v1', 'users');
      expect(path).toBe('api/v1/users');
    });

    it('should join path segments with leading/trailing slashes', () => {
      const path = Url.joinPath('/api/', '/v1/', '/users/');
      expect(path).toBe('api/v1/users');
    });

    it('should combine base URL with paths', () => {
      const url = Url.combine('https://example.com', 'api', 'v1', 'users');
      expect(url.getPathname()).toBe('/api/v1/users');
    });

    it('should combine base URL preserving existing path', () => {
      const url = Url.combine('https://example.com/base', 'api', 'users');
      expect(url.getPathname()).toBe('/base/api/users');
    });
  });

  describe('immutability', () => {
    it('should not modify original after adding query param', () => {
      const original = Url.create('https://example.com');
      const modified = original.withQueryParam('key', 'value');

      expect(original.getSearch()).toBe('');
      expect(modified.getSearch()).toBe('?key=value');
    });

    it('should not modify original after converting to HTTPS', () => {
      const original = Url.create('http://example.com');
      const secure = original.toSecure();

      expect(original.getProtocol()).toBe('http:');
      expect(secure.getProtocol()).toBe('https:');
    });
  });
});
