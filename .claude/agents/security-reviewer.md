---
name: security-reviewer
description: Reviews code for security vulnerabilities with focus on auth, multi-tenancy, and data protection
---

# Security Reviewer Agent

A specialized agent for reviewing code changes for security vulnerabilities, with focus on authentication, multi-tenancy, and data protection.

## When to Use

- After implementing auth-related features
- When modifying tenant-scoped queries
- Before merging PRs with sensitive code paths
- When adding new API endpoints

## Review Checklist

### Authentication (Auth.js v5)
- [ ] Session checks use `verifySession()` from DAL
- [ ] No direct session manipulation outside `src/lib/auth.ts`
- [ ] Password operations use `hashPassword()`/`verifyPassword()` from `src/lib/password.ts`
- [ ] No passwords or secrets logged or exposed in responses

### Multi-Tenancy & RLS
- [ ] All tenant table queries use `withTenant()` context
- [ ] `tenantId` filter present in WHERE clauses for tenant data
- [ ] No cross-tenant data leakage in joins
- [ ] Role checks use `requireRole()` for privileged operations

### API Security
- [ ] Input validation at API boundaries (not trusting client data)
- [ ] Rate limiting considered for expensive operations
- [ ] Error messages don't leak internal details
- [ ] No SQL injection via raw queries (use Drizzle's parameterized queries)

### Data Protection
- [ ] Sensitive fields not returned in API responses unnecessarily
- [ ] File uploads validated (type, size) before processing
- [ ] Vector embeddings don't encode PII directly

## Focus Areas for This Project

Based on the VibeDocs architecture:

1. **Document uploads**: Validate file types, scan for malicious content
2. **Analysis results**: Ensure tenant isolation in analysis storage
3. **Generated NDAs**: Template injection risks
4. **Comparison features**: Cross-tenant data access prevention

## How to Invoke

```
/task security-reviewer "Review the recent auth changes"
```

Or Claude may invoke this automatically when reviewing sensitive code paths.
