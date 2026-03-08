# @patina/utils

Shared utility functions for the Patina monorepo. Provides common helpers for string manipulation, validation, formatting, async operations, and more.

## Installation

```bash
pnpm add @patina/utils
```

## Usage

```typescript
import {
  slugify,
  retry,
  formatPrice,
  isEmail,
  generateToken
} from '@patina/utils';

// Generate URL-safe slug
const slug = slugify('Premium Leather Sofa'); // "premium-leather-sofa"

// Retry with exponential backoff
const result = await retry(
  () => unstableApiCall(),
  { maxAttempts: 3, initialDelay: 1000 }
);

// Format currency
const price = formatPrice(99.99, 'USD'); // "$99.99"

// Validate email
if (isEmail(userInput)) {
  // Send email
}

// Generate secure token
const token = generateToken(32); // 64-char hex string
```

## API Reference

### String Utilities (`string.ts`)

#### `capitalize(str: string): string`
Capitalizes the first letter of a string.

```typescript
capitalize('hello world'); // "Hello world"
```

#### `slugify(str: string): string`
Converts a string to a URL-safe slug.

```typescript
slugify('Premium Leather Sofa!'); // "premium-leather-sofa"
slugify('  Multiple   Spaces  '); // "multiple-spaces"
```

**Features:**
- Lowercases input
- Removes special characters
- Converts spaces/underscores to hyphens
- Trims leading/trailing hyphens

#### `camelCase(str: string): string`
Converts a string to camelCase.

```typescript
camelCase('user profile name'); // "userProfileName"
camelCase('USER_PROFILE_NAME'); // "userProfileName"
```

#### `kebabCase(str: string): string`
Converts a string to kebab-case.

```typescript
kebabCase('UserProfileName'); // "user-profile-name"
kebabCase('user_profile_name'); // "user-profile-name"
```

#### `snakeCase(str: string): string`
Converts a string to snake_case.

```typescript
snakeCase('UserProfileName'); // "user_profile_name"
snakeCase('user-profile-name'); // "user_profile_name"
```

---

### Format Utilities (`format.ts`)

#### `formatCurrency(amount: number, currency?: string): string`
Formats a number as currency using Intl.NumberFormat.

```typescript
formatCurrency(1234.56); // "$1,234.56"
formatCurrency(1234.56, 'EUR'); // "€1,234.56"
```

#### `formatNumber(value: number): string`
Formats a number with thousand separators.

```typescript
formatNumber(1234567); // "1,234,567"
```

#### `formatPercentage(value: number, decimals?: number): string`
Formats a number as a percentage.

```typescript
formatPercentage(45.678); // "46%"
formatPercentage(45.678, 2); // "45.68%"
```

#### `truncate(str: string, length: number, suffix?: string): string`
Truncates a string to a maximum length.

```typescript
truncate('This is a long description', 10); // "This is..."
truncate('Short', 10); // "Short"
truncate('Long text', 8, '…'); // "Long t…"
```

---

### Currency Utilities (`currency.ts`)

Specialized currency and pricing functions for e-commerce.

#### `formatPrice(amount: number, currency?: string, locale?: string): string`
Formats price with proper currency symbol and precision.

```typescript
formatPrice(99.99); // "$99.99"
formatPrice(99.99, 'CAD', 'en-CA'); // "CA$99.99"
formatPrice(99.5, 'USD'); // "$99.50" (always 2 decimals)
```

#### `parsePrice(priceString: string): number | null`
Extracts numeric price from a formatted string.

```typescript
parsePrice('$1,234.56'); // 1234.56
parsePrice('USD 99.99'); // 99.99
parsePrice('invalid'); // null
```

#### `isValidPrice(amount: number): boolean`
Validates that a price is a valid non-negative number.

```typescript
isValidPrice(99.99); // true
isValidPrice(-10); // false
isValidPrice(NaN); // false
isValidPrice(Infinity); // false
```

#### `roundPrice(amount: number): number`
Rounds to 2 decimal places (for database storage).

```typescript
roundPrice(99.999); // 100.00
roundPrice(99.994); // 99.99
```

#### `applyDiscount(amount: number, discountPercent: number): number`
Applies percentage discount to a price.

```typescript
applyDiscount(100, 10); // 90.00
applyDiscount(99.99, 25); // 74.99
```

**Throws:** Error if discount percentage is not between 0 and 100.

#### `applyDiscountAmount(amount: number, discountAmount: number): number`
Subtracts a fixed discount amount.

```typescript
applyDiscountAmount(100, 15); // 85.00
applyDiscountAmount(10, 20); // 0.00 (won't go negative)
```

#### `calculateTax(amount: number, taxRate: number): number`
Calculates tax amount.

```typescript
calculateTax(100, 0.08); // 8.00
calculateTax(99.99, 0.0825); // 8.25
```

#### `calculateOrderTotal(subtotal, tax, shipping?, discount?): number`
Calculates complete order total.

```typescript
calculateOrderTotal(100, 8.25, 10, 5); // 113.25
// Formula: subtotal + tax + shipping - discount
```

#### `centsToDollars(cents: number): number`
Converts cents to dollars (for Stripe integration).

```typescript
centsToDollars(9999); // 99.99
```

#### `dollarsToCents(dollars: number): number`
Converts dollars to cents (for Stripe integration).

```typescript
dollarsToCents(99.99); // 9999
```

#### `formatPriceRange(min: number, max: number, currency?, locale?): string`
Formats a price range.

```typescript
formatPriceRange(99, 199); // "$99.00 - $199.00"
formatPriceRange(100, 100); // "$100.00"
```

#### `classifyBudgetBand(amount: number): BudgetBand`
Classifies a price into budget bands.

```typescript
classifyBudgetBand(500); // "starter"
classifyBudgetBand(3000); // "moderate"
classifyBudgetBand(10000); // "comfort"
classifyBudgetBand(30000); // "premium"
classifyBudgetBand(75000); // "luxury"
```

**Budget Bands:**
- `starter`: $0 - $999
- `moderate`: $1,000 - $4,999
- `comfort`: $5,000 - $14,999
- `premium`: $15,000 - $49,999
- `luxury`: $50,000+

#### `getBudgetBandRange(band: BudgetBand): { min: number; max: number | null }`
Gets the price range for a budget band.

```typescript
getBudgetBandRange('moderate'); // { min: 1000, max: 4999 }
getBudgetBandRange('luxury'); // { min: 50000, max: null }
```

#### Currency Constants

```typescript
SUPPORTED_CURRENCIES // ['USD', 'CAD', 'EUR', 'GBP', 'AUD']
type SupportedCurrency = 'USD' | 'CAD' | 'EUR' | 'GBP' | 'AUD'

isValidCurrencyCode('USD'); // true (ISO-4217 format)
isSupportedCurrency('USD'); // true
isSupportedCurrency('JPY'); // false
```

---

### Validation Utilities (`validation.ts`)

#### `isEmail(value: string): boolean`
Validates email address format.

```typescript
isEmail('user@example.com'); // true
isEmail('invalid'); // false
```

#### `isPhone(value: string): boolean`
Validates phone number format (international).

```typescript
isPhone('+1-555-123-4567'); // true
isPhone('555 123 4567'); // true
isPhone('invalid'); // false
```

#### `isURL(value: string): boolean`
Validates URL format.

```typescript
isURL('https://example.com'); // true
isURL('not-a-url'); // false
```

#### `isEmpty(value: unknown): boolean`
Checks if a value is empty.

```typescript
isEmpty(null); // true
isEmpty(''); // true
isEmpty('  '); // true
isEmpty([]); // true
isEmpty({}); // true
isEmpty('hello'); // false
isEmpty([1, 2, 3]); // false
```

#### `isUUID(value: string): boolean`
Validates UUID v1-v5 format.

```typescript
isUUID('550e8400-e29b-41d4-a716-446655440000'); // true
isUUID('invalid-uuid'); // false
```

---

### Date Utilities (`date.ts`)

#### `formatDate(date: Date, format?: 'short' | 'long' | 'iso'): string`
Formats a date in various formats.

```typescript
formatDate(new Date('2024-01-15')); // "01/15/2024"
formatDate(new Date('2024-01-15'), 'long'); // "January 15, 2024"
formatDate(new Date('2024-01-15'), 'iso'); // "2024-01-15T00:00:00.000Z"
```

#### `isDateInPast(date: Date): boolean`
Checks if a date is in the past.

```typescript
isDateInPast(new Date('2020-01-01')); // true
isDateInPast(new Date('2030-01-01')); // false
```

#### `isDateInFuture(date: Date): boolean`
Checks if a date is in the future.

```typescript
isDateInFuture(new Date('2030-01-01')); // true
isDateInFuture(new Date('2020-01-01')); // false
```

#### `addDays(date: Date, days: number): Date`
Adds days to a date.

```typescript
addDays(new Date('2024-01-01'), 7); // 2024-01-08
addDays(new Date('2024-01-01'), -7); // 2023-12-25
```

#### `subtractDays(date: Date, days: number): Date`
Subtracts days from a date.

```typescript
subtractDays(new Date('2024-01-15'), 5); // 2024-01-10
```

---

### Retry Utilities (`retry.ts`)

Async operation retry with exponential backoff.

#### `retry<T>(fn: () => Promise<T>, options?): Promise<T>`
Retries a function with exponential backoff.

```typescript
const result = await retry(
  () => fetch('https://api.example.com/data'),
  {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    shouldRetry: (error, attempt) => {
      // Custom retry logic
      return error.statusCode >= 500;
    },
    onRetry: (error, attempt, delay) => {
      console.log(`Retry ${attempt} after ${delay}ms`);
    }
  }
);
```

**Options:**
- `maxAttempts`: Maximum retry attempts (default: 3)
- `initialDelay`: Initial delay in ms (default: 1000)
- `maxDelay`: Maximum delay in ms (default: 30000)
- `backoffMultiplier`: Delay multiplier (default: 2)
- `shouldRetry`: Custom function to determine if retry should occur
- `onRetry`: Callback before each retry

**Backoff calculation:** delay = min(initialDelay * multiplier^(attempt-1), maxDelay) ± 25% jitter

#### `sleep(ms: number): Promise<void>`
Async sleep utility.

```typescript
await sleep(1000); // Wait 1 second
```

#### `shouldRetryHttpError(error: unknown, attempt: number): boolean`
Default retry logic for HTTP errors.

```typescript
// Retries on:
// - 5xx server errors
// - 429 rate limit
// - Network errors
```

#### `CircuitBreaker`
Circuit breaker pattern for fault tolerance.

```typescript
const breaker = new CircuitBreaker(5, 30000); // 5 failures, 30s timeout

try {
  const result = await breaker.execute(() => unreliableService());
} catch (error) {
  if (error.message === 'Circuit breaker is open') {
    // Service is temporarily unavailable
  }
}

breaker.getState(); // 'closed' | 'open' | 'half-open'
breaker.getFailures(); // Number of consecutive failures
breaker.reset(); // Manually reset circuit
```

**States:**
- `closed`: Normal operation
- `open`: Too many failures, rejecting calls
- `half-open`: Testing if service recovered

---

### Crypto Utilities (`crypto.ts`)

Cryptographic and hashing functions.

#### `generateToken(length?: number): string`
Generates a secure random token.

```typescript
generateToken(); // 64-char hex string (32 bytes)
generateToken(16); // 32-char hex string (16 bytes)
```

#### `generateUUID(): string`
Generates a UUID v4.

```typescript
generateUUID(); // "550e8400-e29b-41d4-a716-446655440000"
```

#### `generateIdentifierSuffix(length?, alphabet?): string`
Generates a random alphanumeric suffix for IDs.

```typescript
generateIdentifierSuffix(); // "A3F9K2" (6 chars)
generateIdentifierSuffix(8); // "2H7JK9M1" (8 chars)
```

#### `sha256(input: string): string`
Computes SHA-256 hash.

```typescript
sha256('hello world'); // "b94d27b9934d3e08..."
```

#### `sha512(input: string): string`
Computes SHA-512 hash.

```typescript
sha512('hello world'); // "309ecc489c12d6eb..."
```

#### `hmacSha256(data: string, secret: string): string`
Creates HMAC-SHA256 signature.

```typescript
const signature = hmacSha256('message', 'secret-key');
```

#### `verifyHmac(data: string, signature: string, secret: string): boolean`
Verifies HMAC signature (timing-safe).

```typescript
const isValid = verifyHmac('message', signature, 'secret-key');
```

#### `timingSafeEqual(a: string, b: string): boolean`
Timing-safe string comparison (prevents timing attacks).

```typescript
timingSafeEqual(userToken, expectedToken);
```

#### `hashSensitiveData(input: string): string`
One-way hash for sensitive data (email, phone) indexing.

```typescript
hashSensitiveData('user@example.com'); // SHA-256 hash
```

#### `maskString(input: string, visibleStart?, visibleEnd?): string`
Masks a string for display/logging.

```typescript
maskString('1234567890', 4, 4); // "1234**7890"
maskString('secret', 2, 2); // "se**et"
```

#### `maskEmail(email: string): string`
Masks an email address.

```typescript
maskEmail('user@example.com'); // "us**@example.com"
```

#### `maskCardNumber(cardNumber: string): string`
Masks a credit card number.

```typescript
maskCardNumber('4111 1111 1111 1111'); // "************1111"
```

#### `generateIdempotencyKey(data: Record<string, unknown>): string`
Generates a deterministic idempotency key from an object.

```typescript
const key = generateIdempotencyKey({ userId: '123', amount: 100 });
// Same input always produces same key
```

---

### Error Utilities (`error.ts`)

Custom error classes and error handling.

#### Error Classes

```typescript
// Base error
class PatinaError extends Error {
  constructor(message, code, statusCode?, details?)
}

// Specific errors
class ValidationError extends PatinaError // 400
class NotFoundError extends PatinaError // 404
class UnauthorizedError extends PatinaError // 401
class ForbiddenError extends PatinaError // 403
class ConflictError extends PatinaError // 409
class RateLimitError extends PatinaError // 429
class ServiceUnavailableError extends PatinaError // 503
```

**Usage:**

```typescript
import { NotFoundError, ValidationError } from '@patina/utils';

// Not found
throw new NotFoundError('Product', productId);
// Error: "Product with id abc123 not found"

// Validation error
throw new ValidationError('Invalid email', { field: 'email' });

// With details
throw new ConflictError('Email already exists', {
  email: 'user@example.com'
});
```

#### Error Helper Functions

```typescript
// Check if error is a PatinaError
isPatinaError(error); // boolean

// Extract error message safely
getErrorMessage(error); // string

// Convert unknown error to PatinaError
toPatinaError(error); // PatinaError

// Wrap async function with error handling
const safeFn = wrapAsync(async () => {
  // Your code
});
```

**JSON Serialization:**

```typescript
const error = new ValidationError('Invalid input', { field: 'email' });
console.log(error.toJSON());
// {
//   error: {
//     name: 'ValidationError',
//     message: 'Invalid input',
//     code: 'VALIDATION_ERROR',
//     statusCode: 400,
//     details: { field: 'email' }
//   }
// }
```

---

## Usage Patterns

### Unique Slug Generation

For generating unique slugs with database deduplication:

```typescript
import { slugify } from '@patina/utils';

async function createUniqueSlug(title: string, existingCheck: (slug: string) => Promise<boolean>) {
  let slug = slugify(title);
  let suffix = 1;

  while (await existingCheck(slug)) {
    slug = `${slugify(title)}-${suffix}`;
    suffix++;
  }

  return slug;
}

// Usage with Prisma
const slug = await createUniqueSlug('My Product', async (slug) => {
  const existing = await prisma.product.findUnique({ where: { slug } });
  return !!existing;
});
```

### Robust API Calls

```typescript
import { retry, shouldRetryHttpError } from '@patina/utils';

const data = await retry(
  () => fetch('https://api.example.com/data').then(r => r.json()),
  {
    maxAttempts: 3,
    shouldRetry: shouldRetryHttpError,
    onRetry: (error, attempt, delay) => {
      logger.warn(`API call failed, retry ${attempt} in ${delay}ms`, { error });
    }
  }
);
```

### Price Calculations

```typescript
import {
  roundPrice,
  calculateTax,
  applyDiscount,
  calculateOrderTotal
} from '@patina/utils';

const subtotal = roundPrice(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
const discounted = applyDiscount(subtotal, discountPercent);
const tax = calculateTax(discounted, taxRate);
const shipping = 10.00;
const total = calculateOrderTotal(discounted, tax, shipping, 0);
```

### Secure Token Generation

```typescript
import { generateToken, hmacSha256, verifyHmac } from '@patina/utils';

// Generate password reset token
const resetToken = generateToken(32);

// Create API signature
const signature = hmacSha256(requestBody, apiSecret);

// Verify webhook signature
if (!verifyHmac(webhookBody, receivedSignature, webhookSecret)) {
  throw new UnauthorizedError('Invalid signature');
}
```

---

## Development

```bash
cd packages/utils

# Build package
pnpm build

# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Type checking
pnpm type-check

# Lint
pnpm lint
```

## Testing

All utilities have comprehensive test coverage:

```typescript
import { slugify, isEmail, retry } from '@patina/utils';

describe('String utilities', () => {
  it('should slugify strings correctly', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });
});
```

Run tests:
```bash
pnpm test
pnpm test:coverage
```

## Contributing

When adding new utilities:

1. **Add function to appropriate file** in `src/`
   - Use existing files when possible
   - Create new file for new categories

2. **Export from `index.ts`**
   ```typescript
   export * from './my-utilities';
   ```

3. **Add comprehensive tests**
   - Unit tests for all functions
   - Edge cases and error conditions
   - Example usage in tests

4. **Add JSDoc comments** for IDE autocomplete
   ```typescript
   /**
    * Converts a string to kebab-case
    * @param str - Input string
    * @returns Kebab-cased string
    * @example
    * kebabCase('HelloWorld') // "hello-world"
    */
   export function kebabCase(str: string): string { ... }
   ```

5. **Update this README** with:
   - Function signature
   - Description
   - Parameters
   - Return type
   - Examples

6. **Ensure no external dependencies** unless absolutely necessary
   - Keep the package lightweight
   - Use Node.js built-ins when possible

## Best Practices

- **Pure functions**: All utilities should be pure (no side effects)
- **Type safety**: Full TypeScript typing with generics where appropriate
- **Error handling**: Throw meaningful errors with context
- **Performance**: Optimize for common cases
- **Documentation**: JSDoc for all public APIs
- **Testing**: 100% code coverage for critical utilities

## License

Proprietary - Patina Platform
