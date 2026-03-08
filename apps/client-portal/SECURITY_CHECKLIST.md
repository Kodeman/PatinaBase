# Security Audit Checklist - Client Portal

## Overview

This checklist should be reviewed before each production deployment and during security audits.

**Last Reviewed:** 2025-10-31
**Reviewer:** Security Team
**Next Review:** Quarterly (or before major releases)

---

## 1. Content Security Policy (CSP)

### Script Sources
- [ ] `'self'` is included in script-src
- [ ] External script domains are explicitly whitelisted
- [ ] Cloudflare Insights beacon domain is allowed (`static.cloudflareinsights.com`)
- [ ] Consider removing `'unsafe-eval'` if not required
- [ ] Consider removing `'unsafe-inline'` and implementing nonce-based CSP
- [ ] No inline event handlers in HTML (onClick, onLoad, etc.)

### Connection Sources
- [ ] API endpoints are explicitly whitelisted in connect-src
- [ ] WebSocket connections are properly configured (wss://)
- [ ] Cloudflare Insights endpoint is allowed (`cloudflareinsights.com`)
- [ ] Third-party analytics/monitoring endpoints are documented
- [ ] No wildcards used in production connect-src

### Other Directives
- [ ] `object-src 'none'` blocks plugins (Flash, Java)
- [ ] `frame-ancestors 'none'` prevents clickjacking
- [ ] `base-uri 'self'` restricts base tag
- [ ] `form-action 'self'` restricts form submissions
- [ ] `upgrade-insecure-requests` enabled in production
- [ ] `block-all-mixed-content` enabled

### Testing
- [ ] No CSP violations in browser console
- [ ] CSP tested with online evaluators (csp-evaluator.withgoogle.com)
- [ ] All legitimate resources load correctly
- [ ] CSP reporting endpoint configured (optional but recommended)

---

## 2. CORS Configuration

### Development
- [ ] CORS allows localhost and local network IPs
- [ ] Development CORS policy is NOT used in production

### Production
- [ ] CORS restricted to Patina domains only (`*.patina.cloud`)
- [ ] No wildcard (`*`) origin in production
- [ ] Allowed methods are explicitly listed
- [ ] Allowed headers are explicitly listed
- [ ] Credentials flag is properly configured
- [ ] Preflight cache time is reasonable (24 hours)

### Testing
- [ ] CORS allows legitimate cross-origin requests
- [ ] CORS blocks unauthorized domains
- [ ] Preflight requests work correctly

---

## 3. Security Headers

### X-Frame-Options
- [ ] Set to `DENY` to prevent clickjacking
- [ ] No pages need to be embedded in iframes
- [ ] Tested with iframe embedding attempt

### X-Content-Type-Options
- [ ] Set to `nosniff`
- [ ] Prevents MIME type sniffing
- [ ] Content-Type headers are accurate

### X-XSS-Protection
- [ ] Set to `1; mode=block`
- [ ] Legacy protection for older browsers
- [ ] Modern CSP provides primary XSS protection

### Referrer-Policy
- [ ] Set to `strict-origin-when-cross-origin`
- [ ] Protects privacy while allowing same-origin debugging
- [ ] No sensitive data in URLs

### Permissions-Policy
- [ ] Camera access restricted to self
- [ ] Microphone access restricted to self
- [ ] Geolocation access restricted to self
- [ ] Payment API access restricted to self
- [ ] Unused features are disabled

### Strict-Transport-Security (HSTS)
- [ ] Enabled in production only
- [ ] `max-age` set to at least 1 year (31536000 seconds)
- [ ] `includeSubDomains` directive included
- [ ] `preload` directive included for HSTS preload list
- [ ] Domain submitted to HSTS preload list (optional)

---

## 4. Cloudflare Configuration

### General Settings
- [ ] Cloudflare proxy enabled (orange cloud)
- [ ] SSL/TLS mode set to "Full (strict)"
- [ ] Automatic HTTPS Rewrites enabled
- [ ] Always Use HTTPS enabled
- [ ] Opportunistic Encryption enabled

### Cloudflare Insights
- [ ] Web Analytics enabled in Cloudflare dashboard
- [ ] Beacon script loads without CSP violations
- [ ] Analytics data visible in Cloudflare dashboard
- [ ] No personally identifiable information (PII) collected
- [ ] Privacy policy mentions Cloudflare analytics

### Security Features
- [ ] Bot Fight Mode configured
- [ ] Challenge Passage duration configured
- [ ] Browser Integrity Check enabled
- [ ] Hotlink Protection enabled (if needed)
- [ ] Rate Limiting rules configured

### Firewall Rules
- [ ] Geographic restrictions configured (if needed)
- [ ] IP access rules configured (if needed)
- [ ] User Agent blocking rules configured (if needed)
- [ ] Known bot patterns blocked

---

## 5. Authentication & Authorization

### NextAuth Configuration
- [ ] JWT secret is strong and randomly generated
- [ ] JWT secret is stored securely (environment variable)
- [ ] Session cookies are HTTP-only
- [ ] Session cookies are Secure (HTTPS only)
- [ ] Session cookies have SameSite=Lax or Strict
- [ ] Session timeout is reasonable (24 hours default)
- [ ] Refresh token rotation enabled

### Password Policy
- [ ] Minimum password length enforced (12+ characters)
- [ ] Password complexity requirements enforced
- [ ] Common passwords blocked
- [ ] Password reuse prevented
- [ ] Leaked password detection enabled

### Multi-Factor Authentication
- [ ] MFA available for all users
- [ ] TOTP support implemented
- [ ] Backup codes generated
- [ ] SMS fallback configured (optional)
- [ ] Recovery process documented

---

## 6. Data Protection

### Encryption in Transit
- [ ] HTTPS enforced via HSTS
- [ ] TLS 1.2+ required (no TLS 1.0/1.1)
- [ ] Strong cipher suites configured
- [ ] Certificate is valid and trusted
- [ ] Certificate expires in >30 days

### Encryption at Rest
- [ ] Database encryption enabled
- [ ] File storage encryption enabled (Oracle Object Storage)
- [ ] Backup encryption enabled
- [ ] Key management documented

### Sensitive Data Handling
- [ ] No sensitive data in URLs or query parameters
- [ ] No sensitive data in logs
- [ ] Credit card data never stored locally (tokenized)
- [ ] Personal data minimized and justified
- [ ] Data retention policies documented

---

## 7. API Security

### Endpoint Protection
- [ ] All endpoints require authentication (except public routes)
- [ ] Authorization checks on every request
- [ ] Rate limiting configured per endpoint
- [ ] Request size limits enforced
- [ ] File upload size limits enforced

### Input Validation
- [ ] All inputs validated on server side
- [ ] Type checking with Zod schemas
- [ ] SQL injection prevented (Prisma parameterized queries)
- [ ] XSS prevented (React escaping + CSP)
- [ ] Path traversal prevented
- [ ] SSRF prevented (no user-controlled URLs)

### Output Encoding
- [ ] HTML entities escaped
- [ ] JSON properly encoded
- [ ] No raw SQL queries in responses
- [ ] Error messages don't leak sensitive info

---

## 8. Dependency Security

### Package Management
- [ ] `pnpm audit` run regularly
- [ ] Critical vulnerabilities resolved
- [ ] Vulnerable packages updated or replaced
- [ ] Automated dependency updates enabled (Renovate/Dependabot)

### Supply Chain Security
- [ ] Package-lock.json committed to repository
- [ ] Packages downloaded from official npm registry only
- [ ] No suspicious packages in dependencies
- [ ] Subresource Integrity (SRI) for CDN resources

---

## 9. Logging & Monitoring

### Application Logging
- [ ] Security events logged (login, logout, failed attempts)
- [ ] Error logging configured
- [ ] Log aggregation configured
- [ ] Sensitive data not logged (passwords, tokens, PII)

### Monitoring
- [ ] Uptime monitoring configured
- [ ] Performance monitoring configured (Cloudflare Insights)
- [ ] Error tracking configured (Sentry/similar)
- [ ] Alerting configured for critical issues

### Audit Trail
- [ ] User actions logged
- [ ] Admin actions logged
- [ ] Logs retained per compliance requirements
- [ ] Log access restricted to authorized personnel

---

## 10. Incident Response

### Preparation
- [ ] Incident response plan documented
- [ ] Security contacts identified
- [ ] Escalation procedures defined
- [ ] Backup and recovery procedures tested

### Detection
- [ ] Security monitoring active
- [ ] Alerting configured
- [ ] Log analysis procedures defined
- [ ] Vulnerability disclosure policy published

### Response
- [ ] Incident response playbooks created
- [ ] Communication templates prepared
- [ ] Backup restoration procedures documented
- [ ] Post-incident review process defined

---

## 11. Mobile-Specific Security

### Progressive Web App (PWA)
- [ ] Service worker uses HTTPS only
- [ ] Service worker caches only trusted content
- [ ] Service worker updated regularly
- [ ] Cache poisoning prevented

### WebView Security (if applicable)
- [ ] JavaScript execution restricted
- [ ] File access restricted
- [ ] Geolocation access controlled
- [ ] Camera/microphone access controlled

---

## 12. Compliance

### GDPR (if applicable)
- [ ] Privacy policy published and accessible
- [ ] Cookie consent obtained
- [ ] Data processing agreements signed
- [ ] Right to erasure implemented
- [ ] Data portability implemented
- [ ] Privacy by design principles followed

### PCI-DSS (if handling payments)
- [ ] Payment forms use HTTPS
- [ ] Credit card data never stored
- [ ] PCI-compliant payment processor used (Stripe/etc)
- [ ] Quarterly scans completed
- [ ] Penetration testing completed annually

### Other Regulations
- [ ] CCPA compliance verified (California users)
- [ ] HIPAA compliance verified (health data)
- [ ] SOC 2 controls implemented (enterprise customers)

---

## 13. Build & Deployment Security

### Build Process
- [ ] Build runs in isolated environment
- [ ] Environment variables not exposed in client bundle
- [ ] Source maps disabled in production
- [ ] Console logs removed in production
- [ ] Debug mode disabled in production

### Deployment
- [ ] Secrets managed securely (not in git)
- [ ] Infrastructure as Code reviewed
- [ ] Blue-green deployment or canary releases
- [ ] Rollback procedure documented
- [ ] Post-deployment smoke tests run

---

## 14. Testing

### Security Testing
- [ ] Automated security tests run in CI/CD
- [ ] SAST (Static Application Security Testing) configured
- [ ] DAST (Dynamic Application Security Testing) run periodically
- [ ] Dependency scanning automated
- [ ] Container scanning (if using Docker)

### Manual Testing
- [ ] Security headers verified (`pnpm security:test`)
- [ ] CORS tested with various origins
- [ ] Authentication flows tested
- [ ] Authorization boundaries tested
- [ ] Error handling tested

### External Testing
- [ ] Penetration testing conducted annually
- [ ] Bug bounty program active (optional)
- [ ] Security audit by third party (annually)

---

## 15. Documentation

### Security Documentation
- [ ] SECURITY.md file up to date
- [ ] Security testing guide documented
- [ ] Incident response plan documented
- [ ] Architecture security review documented

### Developer Training
- [ ] Secure coding guidelines shared with team
- [ ] OWASP Top 10 training completed
- [ ] Security champion identified
- [ ] Regular security awareness training

---

## Automated Testing Commands

```bash
# Run security header tests (development)
pnpm security:test

# Run security header tests (production)
pnpm security:test:prod

# Audit dependencies for vulnerabilities
pnpm security:audit

# Fix dependency vulnerabilities
pnpm security:audit:fix

# Full test suite
pnpm test && pnpm test:e2e && pnpm security:test
```

---

## Sign-Off

**Auditor Name:** _____________________
**Date:** _____________________
**Signature:** _____________________

**Critical Issues Found:** _____
**High Priority Issues:** _____
**Medium Priority Issues:** _____
**Low Priority Issues:** _____

**Approved for Production:** [ ] Yes [ ] No

**Comments:**
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [Cloudflare Security Best Practices](https://developers.cloudflare.com/fundamentals/basic-tasks/protect-your-site/)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
