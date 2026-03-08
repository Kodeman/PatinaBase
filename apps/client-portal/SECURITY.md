# Security Configuration - Client Portal

## Overview

This document describes the security configuration for the Patina Client Portal, including Content Security Policy (CSP), CORS settings, and other security headers.

## Content Security Policy (CSP)

### Current Configuration

The CSP is configured in `next.config.js` and includes the following directives:

#### Script Sources (`script-src`)
```
'self' 'unsafe-eval' 'unsafe-inline' https://static.cloudflareinsights.com
```

**Rationale:**
- `'self'` - Allow scripts from the same origin
- `'unsafe-eval'` - Required for React Native WebView compatibility and service worker support
- `'unsafe-inline'` - Needed for inline scripts in mobile context
- `https://static.cloudflareinsights.com` - Cloudflare Insights analytics beacon

**Security Note:** While `'unsafe-eval'` and `'unsafe-inline'` reduce security, they are currently necessary for the mobile-first architecture. Consider implementing nonce-based CSP for improved security.

#### Connect Sources (`connect-src`)

**Development:**
```
'self' http://localhost:* ws://localhost:*
http://192.168.1.36:* ws://192.168.1.36:*
http://192.168.1.16:* ws://192.168.1.16:*
http://127.0.0.1:* ws://127.0.0.1:*
https://cloudflareinsights.com
```

**Production:**
```
'self' https://api.patina.cloud wss://api.patina.cloud
https://*.patina.cloud wss://*.patina.cloud
https://*.identity.oraclecloud.com
https://objectstorage.*.oraclecloud.com
https://cloudflareinsights.com
```

**Rationale:**
- Development allows local network access for testing
- Production restricts to Patina infrastructure and Cloudflare Insights
- WebSocket connections enabled for real-time features
- Oracle Cloud services enabled for authentication and object storage

#### Other Directives

| Directive | Value | Purpose |
|-----------|-------|---------|
| `default-src` | `'self'` | Fallback for unspecified directives |
| `style-src` | `'self' 'unsafe-inline'` | Allow inline styles (required for mobile) |
| `img-src` | `'self' data: https: blob:` | Allow images from various sources |
| `font-src` | `'self' data:` | Allow fonts from same origin and data URIs |
| `media-src` | `'self' blob:` | Allow media from same origin and blob URLs |
| `object-src` | `'none'` | Block plugins (Flash, Java, etc.) |
| `base-uri` | `'self'` | Restrict `<base>` tag to same origin |
| `form-action` | `'self'` | Restrict form submissions to same origin |
| `frame-ancestors` | `'none'` | Prevent clickjacking (no iframe embedding) |
| `block-all-mixed-content` | - | Block HTTP resources on HTTPS pages |
| `upgrade-insecure-requests` | - | Upgrade HTTP to HTTPS (production only) |

## CORS Configuration

### Cross-Origin Resource Sharing Headers

| Header | Development | Production |
|--------|-------------|------------|
| `Access-Control-Allow-Origin` | `*` | `https://*.patina.cloud` |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, DELETE, OPTIONS` | Same |
| `Access-Control-Allow-Headers` | `X-Requested-With, Content-Type, Authorization` | Same |
| `Access-Control-Max-Age` | `86400` (24 hours) | Same |

**Rationale:**
- Development allows all origins for easier testing
- Production restricts to Patina subdomains only
- Preflight requests cached for 24 hours to reduce overhead

## Additional Security Headers

### X-Frame-Options
```
DENY
```
Prevents the page from being embedded in iframes, protecting against clickjacking attacks.

### X-Content-Type-Options
```
nosniff
```
Prevents MIME type sniffing, forcing browsers to respect declared content types.

### X-XSS-Protection
```
1; mode=block
```
Enables browser XSS filtering and blocks page rendering if attack detected. (Legacy header, CSP provides better protection)

### Referrer-Policy
```
strict-origin-when-cross-origin
```
Sends full referrer for same-origin requests, only origin for cross-origin HTTPS requests, and no referrer for HTTP downgrades.

### Permissions-Policy
```
camera=(self), microphone=(self), geolocation=(self), payment=(self)
```
Restricts browser features to same origin only, preventing malicious third-party scripts from accessing sensitive APIs.

### Strict-Transport-Security (Production Only)
```
max-age=31536000; includeSubDomains; preload
```
Enforces HTTPS for 1 year, including all subdomains. The `preload` directive enables HSTS preload list inclusion.

## Cloudflare Insights Integration

### Purpose
Cloudflare Insights provides:
- Real User Monitoring (RUM) data
- Performance metrics
- Core Web Vitals tracking
- Error monitoring

### Security Considerations

The Cloudflare Insights beacon:
1. **Script Location**: `https://static.cloudflareinsights.com/beacon.min.js`
2. **Data Endpoint**: `https://cloudflareinsights.com/__beacon/v1`
3. **Privacy**: No personally identifiable information (PII) is collected
4. **Content Integrity**: Delivered via Cloudflare's global CDN with automatic HTTPS

### Implementation

The beacon script is automatically injected by Cloudflare when the domain is proxied through their network. No manual script tags are required in the HTML.

**CSP Requirements:**
- `script-src` must include `https://static.cloudflareinsights.com`
- `connect-src` must include `https://cloudflareinsights.com`

## Security Best Practices

### Current Security Posture

✅ **Strengths:**
- Strong CSP with most resources restricted to same origin
- HSTS enabled in production with long max-age
- Comprehensive security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- CORS properly restricted in production
- Mixed content blocked
- Automatic HTTPS upgrade in production

⚠️ **Areas for Improvement:**
- `'unsafe-eval'` and `'unsafe-inline'` in script-src reduce XSS protection
- Consider implementing CSP nonces for inline scripts
- Consider adding Subresource Integrity (SRI) for external scripts
- Consider implementing CSP reporting to monitor violations

### Recommended Security Enhancements

#### 1. Implement Nonce-Based CSP

Replace `'unsafe-inline'` with nonces for better security:

```javascript
// Generate nonce per request
const nonce = crypto.randomBytes(16).toString('base64');

// CSP with nonce
"script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com"

// Use nonce in script tags
<script nonce="${nonce}">...</script>
```

#### 2. Add Subresource Integrity (SRI)

Validate external scripts haven't been tampered with:

```html
<script
  src="https://static.cloudflareinsights.com/beacon.min.js"
  integrity="sha384-..."
  crossorigin="anonymous"
></script>
```

#### 3. Implement CSP Reporting

Monitor CSP violations to detect attacks and configuration issues:

```javascript
cspDirectives.push(
  "report-uri https://api.patina.cloud/security/csp-report",
  "report-to csp-endpoint"
);
```

#### 4. Add Security.txt

Create `public/.well-known/security.txt` for responsible disclosure:

```
Contact: security@patina.cloud
Expires: 2025-12-31T23:59:59.000Z
Encryption: https://patina.cloud/pgp-key.txt
Preferred-Languages: en
Canonical: https://client.patina.cloud/.well-known/security.txt
```

#### 5. Implement Certificate Transparency Monitoring

Monitor for unauthorized SSL certificates:
- Set up monitoring with crt.sh or Facebook's Certificate Transparency Monitor
- Add `Expect-CT` header (though deprecated, still provides value)

## Testing Security Configuration

### Browser Developer Tools

1. Open DevTools → Console
2. Look for CSP violation warnings
3. Verify no blocked resources

### Online Security Scanners

- [Mozilla Observatory](https://observatory.mozilla.org/)
- [Security Headers](https://securityheaders.com/)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)

### Manual Testing

```bash
# Test CSP headers
curl -I https://client.patina.cloud

# Test HSTS
curl -I https://client.patina.cloud | grep -i strict

# Test CORS
curl -H "Origin: https://attacker.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     https://client.patina.cloud
```

## Incident Response

### CSP Violation Detected

1. Review violation details in browser console
2. Determine if legitimate resource or attack
3. Update CSP if legitimate, investigate if attack
4. Check access logs for suspicious activity

### Security Header Misconfiguration

1. Identify affected header
2. Review `next.config.js` configuration
3. Test changes in development first
4. Deploy and verify with security scanners

### Cloudflare Insights Issues

1. Verify Cloudflare proxy is enabled for domain
2. Check CSP allows `static.cloudflareinsights.com`
3. Review Cloudflare dashboard for configuration issues
4. Contact Cloudflare support if issues persist

## Compliance Considerations

### GDPR
- Cloudflare Insights collects minimal data
- No PII is transmitted
- Users should be informed via privacy policy

### PCI-DSS (if handling payments)
- Ensure all payment forms use HTTPS
- Never log or store credit card details
- Use tokenization for card processing

### OWASP Top 10 Mitigation

| Risk | Mitigation |
|------|-----------|
| A01: Broken Access Control | Server-side authorization checks |
| A02: Cryptographic Failures | HTTPS enforced via HSTS |
| A03: Injection | CSP, input validation, parameterized queries |
| A04: Insecure Design | Security headers, defense in depth |
| A05: Security Misconfiguration | Comprehensive security headers |
| A06: Vulnerable Components | Automated dependency scanning |
| A07: Authentication Failures | NextAuth with secure session management |
| A08: Software/Data Integrity | CSP, SRI (to be implemented) |
| A09: Logging Failures | Centralized logging (to be implemented) |
| A10: SSRF | Network-level controls, input validation |

## Maintenance

### Regular Security Reviews

- **Monthly**: Review CSP violation reports (once implemented)
- **Quarterly**: Run security scanners and update configurations
- **Annually**: Complete security audit and penetration testing

### Dependency Updates

```bash
# Check for security vulnerabilities
pnpm audit

# Update dependencies
pnpm update --latest

# Rebuild and test
pnpm build && pnpm test
```

### Configuration Changes

When modifying security configuration:

1. Document changes in this file
2. Test in development environment
3. Review with security team
4. Deploy to staging first
5. Monitor for issues before production deployment

## Support

For security questions or to report vulnerabilities:
- **Email**: security@patina.cloud
- **Slack**: #security channel (internal only)
- **PagerDuty**: Security incidents (production only)

## References

- [Content Security Policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)
- [Cloudflare Insights Documentation](https://developers.cloudflare.com/analytics/web-analytics/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
