# Security Quick Reference - Client Portal

Quick reference for developers working on the Client Portal.

---

## CSP Cheat Sheet

### What Can Load Where?

| Resource Type | Development | Production |
|--------------|-------------|------------|
| **Scripts** | ✅ Same origin<br>✅ Inline scripts<br>✅ Cloudflare Insights | Same as dev |
| **Styles** | ✅ Same origin<br>✅ Inline styles | Same as dev |
| **Images** | ✅ Same origin<br>✅ Data URIs<br>✅ Any HTTPS<br>✅ Blob URLs | Same as dev |
| **Fonts** | ✅ Same origin<br>✅ Data URIs | Same as dev |
| **API Calls** | ✅ Same origin<br>✅ localhost:*<br>✅ Local network<br>✅ Cloudflare | ✅ Same origin<br>✅ api.patina.cloud<br>✅ *.patina.cloud<br>✅ Oracle Cloud<br>✅ Cloudflare |
| **WebSockets** | ✅ ws://localhost:*<br>✅ ws://local network | ✅ wss://api.patina.cloud<br>✅ wss://*.patina.cloud |
| **Media** | ✅ Same origin<br>✅ Blob URLs | Same as dev |
| **Iframes** | ❌ Blocked | ❌ Blocked |
| **Objects/Plugins** | ❌ Blocked | ❌ Blocked |

---

## Adding New External Resources

### Adding a New Script Source

1. **Evaluate necessity:** Can you self-host instead?
2. **Check domain:** Is it from a trusted CDN?
3. **Update CSP:**
   ```javascript
   // In next.config.js
   "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://trusted-cdn.com"
   ```
4. **Test:** Run `pnpm security:test`
5. **Document:** Add to SECURITY.md

### Adding a New API Endpoint

1. **Update connect-src:**
   ```javascript
   // Production connect-src
   "connect-src 'self' ... https://new-api.example.com"
   ```
2. **Update CORS:** If cross-origin, ensure CORS is configured
3. **Test:** Verify in browser console
4. **Document:** Update API documentation

### Adding a New Image Source

Images from any HTTPS source are allowed by default (`img-src 'self' data: https: blob:`).

If you need HTTP images in development, update:
```javascript
"img-src 'self' data: http: https: blob:"
```

---

## Common CSP Violations & Fixes

### Error: Refused to load script

```
Refused to load the script 'https://example.com/script.js'
because it violates CSP directive "script-src 'self'"
```

**Fix:** Add domain to script-src:
```javascript
"script-src 'self' 'unsafe-eval' 'unsafe-inline' https://example.com"
```

### Error: Refused to connect to

```
Refused to connect to 'https://api.example.com'
because it violates CSP directive "connect-src 'self'"
```

**Fix:** Add domain to connect-src:
```javascript
// Development
isDevelopment
  ? "connect-src 'self' ... https://api.example.com"
  : "connect-src 'self' ... https://api.example.com"
```

### Error: Refused to execute inline script

```
Refused to execute inline script because it violates CSP directive
"script-src 'self'"
```

**Fix:** We allow inline scripts via `'unsafe-inline'`. If this error occurs:
1. Check if CSP is correctly configured
2. Consider moving script to external file
3. For future: implement nonce-based CSP

---

## Testing Security Changes

### Before Committing

```bash
# Verify config is valid
cd apps/client-portal
node -e "require('./next.config.js')"

# Run security tests
pnpm security:test
```

### After Deployment

```bash
# Test production headers
pnpm security:test:prod

# Check for vulnerabilities
pnpm security:audit
```

### Manual Testing

1. **Open browser DevTools → Console**
2. **Look for CSP violations** (red errors)
3. **Check Network tab** for blocked requests
4. **Verify functionality** works as expected

---

## CORS Quick Reference

### Current CORS Policy

**Development:** Allow all origins (`*`)

**Production:** Allow only Patina domains (`https://*.patina.cloud`)

### Adding Cross-Origin Requests

1. **Determine if needed:** Same-origin requests don't need CORS
2. **Update server:** Ensure API server allows your origin
3. **Update CSP connect-src:** Add domain if different from origin
4. **Test:** Use browser DevTools Network tab

### CORS Preflight Requests

For requests with:
- Custom headers (e.g., `Authorization`)
- Methods other than GET/POST
- Content-Type other than form data

The browser sends a preflight OPTIONS request. Our config caches these for 24 hours.

---

## Security Header Quick Reference

| Header | Value | What It Does |
|--------|-------|--------------|
| **Content-Security-Policy** | (see above) | Controls what resources can load |
| **X-Frame-Options** | DENY | Prevents clickjacking |
| **X-Content-Type-Options** | nosniff | Prevents MIME sniffing |
| **X-XSS-Protection** | 1; mode=block | Legacy XSS protection |
| **Referrer-Policy** | strict-origin-when-cross-origin | Controls referrer header |
| **Permissions-Policy** | camera=(self) ... | Restricts browser APIs |
| **HSTS** (prod only) | max-age=31536000 | Forces HTTPS |
| **Access-Control-Allow-Origin** | * (dev) / *.patina.cloud (prod) | CORS policy |

---

## Common Mistakes to Avoid

### ❌ DON'T: Use wildcard in production CSP

```javascript
// BAD - allows any domain!
"script-src *"
```

### ✅ DO: Explicitly list trusted domains

```javascript
// GOOD - only trusted domains
"script-src 'self' https://trusted-cdn.com"
```

---

### ❌ DON'T: Disable CSP entirely

```javascript
// BAD - removes all protection!
// (commented out CSP configuration)
```

### ✅ DO: Adjust CSP for specific needs

```javascript
// GOOD - keeps protection, adds exceptions
"script-src 'self' 'unsafe-inline' https://needed-script.com"
```

---

### ❌ DON'T: Add external resources without review

```javascript
// BAD - untrusted source
"script-src 'self' http://random-cdn.com"
```

### ✅ DO: Review and document external resources

```javascript
// GOOD - documented, trusted source
// Google Analytics (documented in SECURITY.md)
"script-src 'self' https://www.google-analytics.com"
```

---

### ❌ DON'T: Commit secrets to git

```javascript
// BAD - secret in config!
const apiKey = "sk_live_abc123...";
```

### ✅ DO: Use environment variables

```javascript
// GOOD - secret in environment
const apiKey = process.env.API_KEY;
```

---

## Emergency Procedures

### CSP Breaking Production

1. **Quick fix:** Temporarily disable problematic directive
   ```javascript
   // Temporarily add to allow resource
   "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*"
   ```

2. **Deploy fix** immediately

3. **Review and tighten** in next deployment

### Security Incident

1. **Notify security team:** security@patina.cloud
2. **Check logs** for suspicious activity
3. **Follow incident response plan** (see SECURITY.md)
4. **Document findings** for post-mortem

---

## Useful Commands

```bash
# Security testing
pnpm security:test              # Test dev environment
pnpm security:test:prod         # Test production
pnpm security:audit             # Check dependencies
pnpm security:audit:fix         # Fix vulnerabilities

# Development
pnpm dev                        # Start dev server
pnpm build                      # Build for production
pnpm start                      # Start production server

# Verify config
node -e "require('./next.config.js')"

# Check headers locally
curl -I http://localhost:3002 | grep -i "content-security-policy"

# Check headers in production
curl -I https://client.patina.cloud | grep -i "content-security-policy"
```

---

## Online Tools

### Security Scanners
- [Mozilla Observatory](https://observatory.mozilla.org/)
- [Security Headers](https://securityheaders.com/)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)

### CSP Generators
- [CSP Generator](https://report-uri.com/home/generate)
- [CSP Builder](https://csper.io/builder)

### CORS Testing
- [Test CORS](https://www.test-cors.org/)

---

## Resources

- [SECURITY.md](./SECURITY.md) - Comprehensive security docs
- [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) - Pre-deployment checklist
- [CSP_FIX_SUMMARY.md](./CSP_FIX_SUMMARY.md) - Recent CSP changes
- [MDN CSP Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP Secure Headers](https://owasp.org/www-project-secure-headers/)

---

## Questions?

- **Security questions:** security@patina.cloud
- **Slack:** #security channel
- **Documentation:** See SECURITY.md for detailed info
