# Client Portal Security Documentation

Welcome to the Client Portal security documentation. This README provides an overview of all security-related documentation and guides you to the right resource for your needs.

---

## 📚 Documentation Index

### For Developers

1. **[SECURITY_QUICK_REFERENCE.md](./SECURITY_QUICK_REFERENCE.md)** ⭐ START HERE
   - Quick reference for day-to-day development
   - CSP cheat sheet
   - Common patterns and solutions
   - Useful commands

2. **[SECURITY.md](./SECURITY.md)**
   - Comprehensive security documentation
   - Detailed CSP configuration explanation
   - Security best practices
   - Testing procedures
   - Compliance considerations

3. **[CSP_BEFORE_AFTER.md](./CSP_BEFORE_AFTER.md)**
   - Visual comparison of recent CSP changes
   - Before/after configurations
   - Verification steps

### For Security/DevOps

1. **[SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md)** ⭐ PRE-DEPLOYMENT
   - Pre-deployment security audit checklist
   - 15 major security categories
   - Sign-off section
   - Compliance verification

2. **[CSP_FIX_SUMMARY.md](./CSP_FIX_SUMMARY.md)**
   - Recent security changes summary
   - Impact assessment
   - Rollback procedures
   - Testing verification

3. **[scripts/test-security-headers.sh](./scripts/test-security-headers.sh)**
   - Automated security testing script
   - Run via `pnpm security:test`

---

## 🚀 Quick Start

### New to the Project?

1. Read **[SECURITY_QUICK_REFERENCE.md](./SECURITY_QUICK_REFERENCE.md)** (5 minutes)
2. Run security tests: `pnpm security:test`
3. Bookmark this README for future reference

### Before Adding External Resources?

1. Check **[SECURITY_QUICK_REFERENCE.md](./SECURITY_QUICK_REFERENCE.md)** → "Adding New External Resources"
2. Update CSP configuration
3. Run `pnpm security:test`
4. Document changes in **[SECURITY.md](./SECURITY.md)**

### Before Deploying to Production?

1. Complete **[SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md)**
2. Run `pnpm security:test:prod`
3. Review **[CSP_FIX_SUMMARY.md](./CSP_FIX_SUMMARY.md)** for recent changes
4. Get security team sign-off

---

## 🔍 Find What You Need

| I want to... | Go to... |
|--------------|----------|
| Understand current security configuration | [SECURITY.md](./SECURITY.md) |
| Fix a CSP violation | [SECURITY_QUICK_REFERENCE.md](./SECURITY_QUICK_REFERENCE.md) → Common CSP Violations |
| Add a new external script | [SECURITY_QUICK_REFERENCE.md](./SECURITY_QUICK_REFERENCE.md) → Adding New External Resources |
| Prepare for deployment | [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) |
| Understand recent changes | [CSP_FIX_SUMMARY.md](./CSP_FIX_SUMMARY.md) or [CSP_BEFORE_AFTER.md](./CSP_BEFORE_AFTER.md) |
| Test security headers | Run `pnpm security:test` |
| Review Cloudflare Insights setup | [SECURITY.md](./SECURITY.md) → Cloudflare Insights Integration |
| Handle a security incident | [SECURITY.md](./SECURITY.md) → Incident Response |
| Understand CORS configuration | [SECURITY.md](./SECURITY.md) → CORS Configuration |
| Learn about compliance | [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) → Compliance |

---

## 🛡️ Current Security Posture

### Strengths ✅

- ✅ Strong Content Security Policy (CSP)
- ✅ HTTP Strict Transport Security (HSTS) enabled
- ✅ All standard security headers implemented
- ✅ CORS properly restricted in production
- ✅ Cloudflare Insights integrated for monitoring
- ✅ Automated security testing
- ✅ Comprehensive security documentation

### Known Limitations ⚠️

- ⚠️ `'unsafe-eval'` and `'unsafe-inline'` in CSP (required for mobile compatibility)
- ⚠️ Consider implementing nonce-based CSP in future
- ⚠️ Consider adding Subresource Integrity (SRI) for external scripts

See [SECURITY.md](./SECURITY.md) for detailed security analysis.

---

## 🧪 Testing

### Run Security Tests

```bash
# Test development environment
pnpm security:test

# Test production environment
pnpm security:test:prod

# Audit dependencies for vulnerabilities
pnpm security:audit

# Fix dependency vulnerabilities automatically
pnpm security:audit:fix
```

### Manual Testing

```bash
# Verify config is valid
node -e "require('./next.config.js')"

# Check headers in development
curl -I http://localhost:3002 | grep -i "content-security-policy"

# Check headers in production
curl -I https://client.patina.cloud | grep -i "content-security-policy"
```

### Online Security Scanners

- [Mozilla Observatory](https://observatory.mozilla.org/)
- [Security Headers](https://securityheaders.com/)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)

---

## 📋 Recent Changes

### 2025-10-31: Cloudflare Insights CSP Fix

**What Changed:**
- Added Cloudflare Insights to CSP whitelist
- Enhanced CORS configuration
- Added HSTS header for production
- Created comprehensive security documentation
- Implemented automated security testing

**Why:**
- Cloudflare Insights beacon was being blocked by CSP
- Needed better security documentation
- Wanted automated security validation

**Impact:**
- ✅ Cloudflare Insights now works correctly
- ✅ Improved security monitoring capabilities
- ✅ Better CORS configuration
- ✅ Stronger security posture with HSTS

See [CSP_FIX_SUMMARY.md](./CSP_FIX_SUMMARY.md) for full details.

---

## 🆘 Getting Help

### For Security Questions

- **Email:** security@patina.cloud
- **Slack:** #security channel (internal)
- **Emergency:** Use PagerDuty for production security incidents

### For Documentation Issues

- **Create Issue:** Open issue in project repository
- **Email:** devops@patina.cloud
- **Slack:** #devops channel (internal)

### For CSP/CORS Issues

1. Check [SECURITY_QUICK_REFERENCE.md](./SECURITY_QUICK_REFERENCE.md) first
2. Review browser console for specific errors
3. Run `pnpm security:test` to verify configuration
4. Ask in #security channel if still stuck

---

## 📖 External Resources

### Content Security Policy
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Cheat Sheet (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [CSP Reference](https://content-security-policy.com/)

### Security Best Practices
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)

### Cloudflare
- [Cloudflare Insights Documentation](https://developers.cloudflare.com/analytics/web-analytics/)
- [Cloudflare Security](https://developers.cloudflare.com/fundamentals/basic-tasks/protect-your-site/)

---

## 🔄 Maintenance

### Regular Reviews

- **Weekly:** Review security test results
- **Monthly:** Review dependency vulnerabilities
- **Quarterly:** Complete security checklist and update documentation
- **Annually:** External security audit and penetration testing

### Updating Documentation

When making security changes:

1. Update relevant documentation files
2. Update this README if adding new docs
3. Run security tests to verify changes
4. Get security team review
5. Document in [CSP_FIX_SUMMARY.md](./CSP_FIX_SUMMARY.md) or similar

---

## 📝 Documentation Structure

```
apps/client-portal/
├── SECURITY_README.md              ← You are here (index)
├── SECURITY_QUICK_REFERENCE.md     ← Quick reference for developers
├── SECURITY.md                     ← Comprehensive security docs
├── SECURITY_CHECKLIST.md           ← Pre-deployment checklist
├── CSP_FIX_SUMMARY.md             ← Recent CSP changes summary
├── CSP_BEFORE_AFTER.md            ← Visual comparison of changes
└── scripts/
    └── test-security-headers.sh   ← Automated security tests
```

---

## 🎯 Best Practices

### When Developing

1. ✅ Test locally with `pnpm security:test` before committing
2. ✅ Document any new external resources in SECURITY.md
3. ✅ Review CSP violations in browser console regularly
4. ✅ Use SECURITY_QUICK_REFERENCE.md for common patterns
5. ✅ Never commit secrets to git (use environment variables)

### When Deploying

1. ✅ Complete SECURITY_CHECKLIST.md before production deployment
2. ✅ Run `pnpm security:test:prod` after deployment
3. ✅ Monitor for CSP violations in production
4. ✅ Verify Cloudflare Insights is collecting data
5. ✅ Review security scanner results

### When Troubleshooting

1. ✅ Check browser console for specific errors
2. ✅ Review SECURITY_QUICK_REFERENCE.md for common issues
3. ✅ Run `pnpm security:test` to verify configuration
4. ✅ Check recent changes in CSP_FIX_SUMMARY.md
5. ✅ Ask in #security channel if still stuck

---

## 📊 Metrics & Monitoring

### Security Metrics Tracked

- CSP violation rate
- Failed authentication attempts
- Dependency vulnerabilities count
- Security header compliance score
- API error rates
- Cloudflare threat score

### Where to Find Metrics

- **Cloudflare Insights:** Web Analytics dashboard
- **Security Headers:** securityheaders.com scan results
- **Dependency Vulnerabilities:** `pnpm security:audit`
- **Application Logs:** Centralized logging system

---

## 🔐 Security Principles

This application follows these security principles:

1. **Defense in Depth:** Multiple layers of security controls
2. **Least Privilege:** Minimal permissions by default
3. **Fail Secure:** Failures don't compromise security
4. **Separation of Concerns:** Security at every layer
5. **Zero Trust:** Never trust, always verify
6. **Privacy by Design:** User privacy considered from the start
7. **Shift Left:** Security integrated early in development

See [SECURITY.md](./SECURITY.md) for detailed implementation.

---

## 🚨 Emergency Contacts

### Production Incidents

- **PagerDuty:** (for on-call engineer)
- **Security Team:** security@patina.cloud
- **DevOps Team:** devops@patina.cloud

### Business Hours Support

- **Slack:** #security or #devops
- **Email:** See above

### After Hours

- **Use PagerDuty** for critical production issues
- **Email security@patina.cloud** for non-critical issues

---

## 📅 Changelog

### 2025-10-31
- ✨ Initial security documentation structure
- ✨ Fixed Cloudflare Insights CSP violations
- ✨ Added automated security testing
- ✨ Created comprehensive security guides
- ✨ Enhanced CORS configuration
- ✨ Added HSTS header for production

---

## 📄 License & Compliance

This application's security configuration is designed to comply with:

- ✅ OWASP Top 10 security standards
- ✅ NIST Cybersecurity Framework
- ✅ GDPR (for EU users)
- ✅ CCPA (for California users)
- ✅ PCI-DSS (if handling payments)

See [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) → Compliance section for details.

---

**Last Updated:** 2025-10-31
**Document Owner:** Security Team
**Review Frequency:** Quarterly
