import { capitalize, slugify, camelCase, kebabCase, snakeCase } from './string';

describe('String Utilities', () => {
  describe('capitalize', () => {
    it('should capitalize first letter and lowercase the rest', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('HELLO')).toBe('Hello');
      expect(capitalize('hELLO')).toBe('Hello');
    });

    it('should handle single character strings', () => {
      expect(capitalize('a')).toBe('A');
      expect(capitalize('Z')).toBe('Z');
    });

    it('should handle empty strings', () => {
      expect(capitalize('')).toBe('');
    });

    it('should handle strings with multiple words', () => {
      expect(capitalize('hello world')).toBe('Hello world');
      expect(capitalize('HELLO WORLD')).toBe('Hello world');
    });

    it('should handle strings with numbers', () => {
      expect(capitalize('hello123')).toBe('Hello123');
      expect(capitalize('123hello')).toBe('123hello');
    });

    it('should handle special characters', () => {
      expect(capitalize('!hello')).toBe('!hello');
      expect(capitalize('hello!')).toBe('Hello!');
    });
  });

  describe('slugify', () => {
    it('should convert strings to URL-friendly slugs', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Hello  World')).toBe('hello-world');
      expect(slugify('  Hello World  ')).toBe('hello-world');
    });

    it('should remove special characters', () => {
      expect(slugify('Hello, World!')).toBe('hello-world');
      expect(slugify('Hello@World#Test')).toBe('helloworldtest');
      expect(slugify('Hello & World')).toBe('hello-world');
    });

    it('should handle multiple spaces and dashes', () => {
      expect(slugify('Hello   World')).toBe('hello-world');
      expect(slugify('Hello---World')).toBe('hello-world');
      expect(slugify('Hello - World')).toBe('hello-world');
    });

    it('should remove leading and trailing dashes', () => {
      expect(slugify('-Hello-')).toBe('hello');
      expect(slugify('---Hello---')).toBe('hello');
    });

    it('should handle underscores', () => {
      expect(slugify('Hello_World')).toBe('hello-world');
      expect(slugify('Hello__World')).toBe('hello-world');
    });

    it('should handle numbers', () => {
      expect(slugify('Product 123')).toBe('product-123');
      expect(slugify('Version 2.0')).toBe('version-20');
    });

    it('should handle empty strings', () => {
      expect(slugify('')).toBe('');
      expect(slugify('   ')).toBe('');
    });

    it('should handle strings with only special characters', () => {
      expect(slugify('!@#$%^&*()')).toBe('');
      expect(slugify('---')).toBe('');
    });
  });

  describe('camelCase', () => {
    it('should convert strings to camelCase', () => {
      expect(camelCase('hello world')).toBe('helloWorld');
      expect(camelCase('Hello World')).toBe('helloWorld');
      expect(camelCase('HELLO WORLD')).toBe('hELLOWORLD'); // All caps becomes camelCase with first lower
    });

    it('should handle already camelCase strings', () => {
      expect(camelCase('helloWorld')).toBe('helloWorld');
      expect(camelCase('HelloWorld')).toBe('helloWorld');
    });

    it('should handle multiple words', () => {
      expect(camelCase('hello world test')).toBe('helloWorldTest');
      expect(camelCase('the quick brown fox')).toBe('theQuickBrownFox');
    });

    it('should handle single words', () => {
      expect(camelCase('hello')).toBe('hello');
      expect(camelCase('HELLO')).toBe('hELLO'); // Single all-caps word
    });

    it('should remove multiple spaces', () => {
      expect(camelCase('hello  world  test')).toBe('helloWorldTest');
    });

    it('should handle empty strings', () => {
      expect(camelCase('')).toBe('');
    });

    it('should handle strings with numbers', () => {
      expect(camelCase('hello world 123')).toBe('helloWorld123');
    });
  });

  describe('kebabCase', () => {
    it('should convert strings to kebab-case', () => {
      expect(kebabCase('hello world')).toBe('hello-world');
      expect(kebabCase('Hello World')).toBe('hello-world');
      expect(kebabCase('HELLO WORLD')).toBe('hello-world');
    });

    it('should convert camelCase to kebab-case', () => {
      expect(kebabCase('helloWorld')).toBe('hello-world');
      expect(kebabCase('helloWorldTest')).toBe('hello-world-test');
    });

    it('should convert PascalCase to kebab-case', () => {
      expect(kebabCase('HelloWorld')).toBe('hello-world');
      expect(kebabCase('HelloWorldTest')).toBe('hello-world-test');
    });

    it('should handle snake_case', () => {
      expect(kebabCase('hello_world')).toBe('hello-world');
      expect(kebabCase('hello_world_test')).toBe('hello-world-test');
    });

    it('should handle multiple spaces', () => {
      expect(kebabCase('hello  world')).toBe('hello-world');
    });

    it('should handle already kebab-case strings', () => {
      expect(kebabCase('hello-world')).toBe('hello-world');
    });

    it('should handle empty strings', () => {
      expect(kebabCase('')).toBe('');
    });

    it('should handle acronyms', () => {
      expect(kebabCase('XMLHttpRequest')).toBe('xmlhttp-request');
      expect(kebabCase('getHTTPResponse')).toBe('get-httpresponse');
    });
  });

  describe('snakeCase', () => {
    it('should convert strings to snake_case', () => {
      expect(snakeCase('hello world')).toBe('hello_world');
      expect(snakeCase('Hello World')).toBe('hello_world');
      expect(snakeCase('HELLO WORLD')).toBe('hello_world');
    });

    it('should convert camelCase to snake_case', () => {
      expect(snakeCase('helloWorld')).toBe('hello_world');
      expect(snakeCase('helloWorldTest')).toBe('hello_world_test');
    });

    it('should convert PascalCase to snake_case', () => {
      expect(snakeCase('HelloWorld')).toBe('hello_world');
      expect(snakeCase('HelloWorldTest')).toBe('hello_world_test');
    });

    it('should handle kebab-case', () => {
      expect(snakeCase('hello-world')).toBe('hello_world');
      expect(snakeCase('hello-world-test')).toBe('hello_world_test');
    });

    it('should handle multiple spaces', () => {
      expect(snakeCase('hello  world')).toBe('hello_world');
    });

    it('should handle already snake_case strings', () => {
      expect(snakeCase('hello_world')).toBe('hello_world');
    });

    it('should handle empty strings', () => {
      expect(snakeCase('')).toBe('');
    });

    it('should handle acronyms', () => {
      expect(snakeCase('XMLHttpRequest')).toBe('xmlhttp_request');
      expect(snakeCase('getHTTPResponse')).toBe('get_httpresponse');
    });

    it('should handle mixed formats', () => {
      expect(snakeCase('helloWorld-test case')).toBe('hello_world_test_case');
    });
  });
});
