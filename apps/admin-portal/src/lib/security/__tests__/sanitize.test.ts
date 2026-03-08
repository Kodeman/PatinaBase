/**
 * Security Sanitization Tests
 *
 * Tests for XSS prevention and input sanitization
 *
 * @jest-environment jsdom
 */

import {
  sanitizeInput,
  sanitizeHtml,
  detectSuspiciousInput,
  validateLength,
  sanitizeSearchQuery,
  sanitizeFilterValue,
  MAX_SEARCH_LENGTH,
  MAX_FILTER_LENGTH,
} from '../sanitize';

describe('Input Sanitization', () => {
  describe('sanitizeInput', () => {
    it('should remove script tags', () => {
      const malicious = '<script>alert("XSS")</script>Hello';
      const result = sanitizeInput(malicious);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
      expect(result).toBe('Hello');
    });

    it('should remove onerror handlers', () => {
      const malicious = '<img src=x onerror="alert(1)">';
      const result = sanitizeInput(malicious);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    it('should remove onload handlers', () => {
      const malicious = '<body onload="maliciousCode()">';
      const result = sanitizeInput(malicious);
      expect(result).not.toContain('onload');
      expect(result).not.toContain('maliciousCode');
    });

    it('should remove javascript: protocol', () => {
      const malicious = '<a href="javascript:alert(1)">Click</a>';
      const result = sanitizeInput(malicious);
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('alert');
    });

    it('should remove iframe tags', () => {
      const malicious = '<iframe src="http://evil.com"></iframe>';
      const result = sanitizeInput(malicious);
      expect(result).not.toContain('<iframe');
      expect(result).not.toContain('evil.com');
    });

    it('should remove eval calls', () => {
      const malicious = '<img src=x onerror="eval(atob(\'YWxlcnQoMSk=\'))">';
      const result = sanitizeInput(malicious);
      expect(result).not.toContain('eval');
    });

    it('should handle normal text', () => {
      const normal = 'Hello World';
      const result = sanitizeInput(normal);
      expect(result).toBe('Hello World');
    });

    it('should handle empty string', () => {
      const result = sanitizeInput('');
      expect(result).toBe('');
    });

    it('should trim whitespace', () => {
      const result = sanitizeInput('  Hello  ');
      expect(result).toBe('Hello');
    });

    it('should enforce length limits', () => {
      const long = 'a'.repeat(300);
      const result = sanitizeInput(long, 200);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('should strip all HTML tags', () => {
      const html = '<p>Hello</p><div>World</div>';
      const result = sanitizeInput(html);
      expect(result).toBe('HelloWorld');
    });
  });

  describe('sanitizeHtml', () => {
    it('should allow safe HTML tags', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>');
    });

    it('should remove dangerous tags', () => {
      const html = '<p>Hello</p><script>alert(1)</script>';
      const result = sanitizeHtml(html);
      expect(result).not.toContain('<script>');
      expect(result).toContain('<p>');
    });

    it('should allow safe links', () => {
      const html = '<a href="https://example.com">Link</a>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<a');
      expect(result).toContain('href');
    });

    it('should remove javascript: links', () => {
      const html = '<a href="javascript:alert(1)">Click</a>';
      const result = sanitizeHtml(html);
      expect(result).not.toContain('javascript:');
    });
  });

  describe('detectSuspiciousInput', () => {
    it('should detect script tags', () => {
      expect(detectSuspiciousInput('<script>')).toBe(true);
      expect(detectSuspiciousInput('</script>')).toBe(true);
      expect(detectSuspiciousInput('<SCRIPT>')).toBe(true);
    });

    it('should detect onerror handlers', () => {
      expect(detectSuspiciousInput('onerror=')).toBe(true);
      expect(detectSuspiciousInput('onerror =')).toBe(true);
    });

    it('should detect onload handlers', () => {
      expect(detectSuspiciousInput('onload=')).toBe(true);
    });

    it('should detect javascript: protocol', () => {
      expect(detectSuspiciousInput('javascript:')).toBe(true);
      expect(detectSuspiciousInput('JAVASCRIPT:')).toBe(true);
    });

    it('should detect iframe tags', () => {
      expect(detectSuspiciousInput('<iframe')).toBe(true);
    });

    it('should detect eval calls', () => {
      expect(detectSuspiciousInput('eval(')).toBe(true);
    });

    it('should not flag normal text', () => {
      expect(detectSuspiciousInput('normal text')).toBe(false);
      expect(detectSuspiciousInput('hello world')).toBe(false);
    });

    it('should not flag empty string', () => {
      expect(detectSuspiciousInput('')).toBe(false);
    });
  });

  describe('validateLength', () => {
    it('should validate short strings', () => {
      expect(validateLength('hello', 10)).toBe(true);
    });

    it('should reject long strings', () => {
      expect(validateLength('a'.repeat(300), 200)).toBe(false);
    });

    it('should handle exact length', () => {
      expect(validateLength('a'.repeat(100), 100)).toBe(true);
    });
  });

  describe('sanitizeSearchQuery', () => {
    it('should sanitize search queries', () => {
      const query = '<script>alert(1)</script>sofa';
      const result = sanitizeSearchQuery(query);
      expect(result).not.toContain('<script>');
      expect(result).toBe('sofa');
    });

    it('should enforce search length limit', () => {
      const long = 'a'.repeat(300);
      const result = sanitizeSearchQuery(long);
      expect(result.length).toBeLessThanOrEqual(MAX_SEARCH_LENGTH);
    });
  });

  describe('sanitizeFilterValue', () => {
    it('should sanitize filter values', () => {
      const value = '<img src=x onerror=alert(1)>Category';
      const result = sanitizeFilterValue(value);
      expect(result).not.toContain('onerror');
      expect(result).toBe('Category');
    });

    it('should enforce filter length limit', () => {
      const long = 'a'.repeat(300);
      const result = sanitizeFilterValue(long);
      expect(result.length).toBeLessThanOrEqual(MAX_FILTER_LENGTH);
    });
  });

  describe('XSS Attack Vectors', () => {
    const attackVectors = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      'javascript:alert(1)',
      '<iframe src="javascript:alert(1)">',
      '<body onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
      '<select onfocus=alert(1) autofocus>',
      '<textarea onfocus=alert(1) autofocus>',
      '<marquee onstart=alert(1)>',
      '<details open ontoggle=alert(1)>',
      '<form><button formaction=javascript:alert(1)>',
    ];

    attackVectors.forEach((attack) => {
      it(`should sanitize: ${attack.slice(0, 50)}...`, () => {
        const result = sanitizeInput(attack);
        expect(result).not.toContain('alert');
        expect(result).not.toContain('javascript:');
        expect(result).not.toMatch(/on\w+\s*=/i);
      });
    });
  });
});
