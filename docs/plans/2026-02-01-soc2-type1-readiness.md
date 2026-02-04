# SOC 2 Type I Readiness Plan

> **Status:** ⚠️ PARTIAL (audited 2026-02-04)
> Audit infrastructure present. Missing: 10 policy documents, evidence collection.

**Date:** 2026-02-01
**Status:** Design Complete
**Scope:** Security + Confidentiality Trust Services Criteria
**Context:** Solo developer, Vercel + Neon managed infrastructure
**Driver:** Enterprise sales enablement + proactive credibility

---

## Executive Summary

This plan outlines the path to SOC 2 Type I certification for VibeDocs. Type I validates that security controls are *designed* correctly at a point in time. The scope includes Security (mandatory) and Confidentiality (relevant for legal document handling).

**Key advantages:**
- Managed infrastructure (Vercel, Neon) means inherited controls
- Audit logging schema already exists
- Multi-tenancy with RLS already implemented
- Auth.js with RBAC in place

**Primary gaps:**
- No written security policies
- Audit logs not being populated
- No MFA for email/password users
- No formal incident response plan
- Vendor SOC 2 reports not collected

**Estimated timeline:** 3-4 months to audit-ready
**Estimated audit cost:** $10,000-25,000

---

## What SOC 2 Type I Actually Requires

SOC 2 isn't a technical checklist—it's proving you have documented controls that an auditor can verify.

| Layer | What Auditor Checks | Current State |
|-------|---------------------|---------------|
| **Policies** | Written documents describing security program | Not created |
| **Technical Controls** | Systems that enforce policies | Partially in place |
| **Evidence** | Proof controls exist and work | Audit schema ready |

For Type I, the auditor validates controls are *designed* correctly. They review policies, inspect systems, and interview the operator.

---

## Phase 1: Policy Documents

Create these written policies. For a solo developer, each can be 2-5 pages.

### 1.1 Information Security Policy (Master)

**Purpose:** Sets the tone and scope for the entire security program.

**Contents:**
- Scope: What systems and data are covered (VibeDocs application, all user data)
- Roles: Security responsibilities (you wear all hats as solo developer)
- Principles: Defense in depth, least privilege, secure by default
- References: Pointers to all other policies
- Review cadence: Annual review commitment

**Template structure:**
```
1. Purpose
2. Scope
3. Roles and Responsibilities
4. Security Principles
5. Policy Framework (list of sub-policies)
6. Exceptions Process
7. Enforcement
8. Review and Updates
```

### 1.2 Access Control Policy

**Purpose:** Defines who gets access to what and how.

**Contents:**
- Authentication requirements (MFA required for admin access)
- Authorization model (RBAC: owner, admin, member, viewer)
- Password requirements (NIST 800-63B compliant)
- Session management (timeout, concurrent limits)
- Access provisioning/deprovisioning process
- Quarterly access review requirement
- Privileged access management

**Technical references:**
- `src/lib/dal.ts` - verifySession, withTenant, requireRole
- `src/db/schema/organizations.ts` - role definitions
- Auth.js configuration

### 1.3 Data Classification Policy

**Purpose:** Categorizes data and defines handling rules.

**Classification levels for VibeDocs:**

| Level | Description | Examples | Handling |
|-------|-------------|----------|----------|
| **Public** | No restrictions | Marketing content, docs | No special handling |
| **Internal** | Business use only | System configs, metrics | Access logging |
| **Confidential** | Sensitive business data | User NDAs, analyses, PII | Encryption, audit logging, access control |
| **Restricted** | Highest sensitivity | Auth credentials, API keys | Encryption, minimal access, no logs |

**Data inventory:**
- User uploaded NDAs → Confidential
- Analysis results → Confidential
- User PII (email, name) → Confidential
- Audit logs → Internal
- Reference corpus (CUAD, templates) → Internal

### 1.4 Data Retention & Disposal Policy

**Purpose:** Defines how long data is kept and how it's deleted.

**Retention schedule:**

| Data Type | Retention Period | Disposal Method |
|-----------|------------------|-----------------|
| User accounts | Until deletion requested + 30 days | Soft delete, then hard delete |
| Uploaded NDAs | Until user deletes + 30 days | Soft delete, purge from blob storage |
| Analysis results | Same as source NDA | Cascade delete with NDA |
| Audit logs | 7 years (compliance) | Automated purge after retention |
| Session data | 30 days after expiry | Automatic cleanup |
| Backups | 30 days rolling | Neon automatic rotation |

**Legal hold process:** Suspend deletion if notified of litigation.

**Technical references:**
- `softDelete` column helper in `src/db/_columns.ts`
- Neon backup retention settings

### 1.5 Encryption Policy

**Purpose:** Defines encryption standards for data protection.

**Requirements:**

| Context | Standard | Implementation |
|---------|----------|----------------|
| Data in transit | TLS 1.2+ | Vercel enforces HTTPS |
| Data at rest (DB) | AES-256 | Neon encryption |
| Data at rest (files) | AES-256 | Vercel Blob encryption |
| Password storage | bcrypt (cost 12+) | `src/lib/password.ts` |
| API keys/secrets | Not stored in code | Environment variables |

**Key management:**
- Neon manages database encryption keys
- Vercel manages blob storage encryption keys
- Auth secrets rotated annually

### 1.6 Change Management Policy

**Purpose:** Ensures changes are reviewed and approved.

**Process:**
1. All code changes via GitHub Pull Request
2. PR requires passing CI (lint, tests)
3. Self-review checklist for solo developer:
   - [ ] Security implications considered
   - [ ] No secrets in code
   - [ ] Tests added/updated
   - [ ] Audit logging for new data changes
4. Merge to main triggers Vercel deployment
5. Production changes logged in deployment history

**Emergency changes:**
- Direct commits allowed for security hotfixes
- Must be documented in incident log within 24 hours
- Retroactive PR created for review

**Technical references:**
- GitHub branch protection rules
- Vercel deployment logs
- `.github/workflows/` CI configuration

### 1.7 Incident Response Plan

**Purpose:** Defines how to detect, respond to, and recover from security incidents.

**Incident severity levels:**

| Level | Description | Examples | Response Time |
|-------|-------------|----------|---------------|
| **Critical** | Active breach, data exfiltration | Unauthorized data access, credential leak | Immediate |
| **High** | Significant vulnerability | RCE, SQL injection discovered | 4 hours |
| **Medium** | Limited impact issue | Minor vulnerability, failed attacks | 24 hours |
| **Low** | Minimal risk | Informational finding | 1 week |

**Response phases:**

1. **Detection**
   - Monitor audit logs for anomalies
   - Review Vercel/Neon alerts
   - User reports

2. **Triage**
   - Assess severity
   - Determine scope of impact
   - Document initial findings

3. **Containment**
   - Revoke compromised credentials
   - Block malicious IPs
   - Disable affected features if needed

4. **Eradication**
   - Fix root cause
   - Patch vulnerabilities
   - Deploy fixes

5. **Recovery**
   - Restore normal operations
   - Verify fix effectiveness
   - Monitor for recurrence

6. **Post-Incident**
   - Document timeline and actions
   - Conduct root cause analysis
   - Update controls to prevent recurrence
   - Notify affected users if required

**Contact list:**
- Primary: [Your contact info]
- Vercel support: support@vercel.com
- Neon support: support@neon.tech
- Legal counsel: [TBD if needed]

**Breach notification:**
- Users: Within 72 hours of confirmed breach affecting their data
- Regulators: As required by applicable law (GDPR: 72 hours)

### 1.8 Vendor Management Policy

**Purpose:** Ensures third-party services meet security requirements.

**Vendor assessment criteria:**
- SOC 2 Type II report (required for data processors)
- Encryption in transit and at rest
- Access controls and audit logging
- Incident response capabilities
- Data processing agreement / DPA

**Vendor inventory:**

| Vendor | Service | Data Access | SOC 2 Status | Review Date |
|--------|---------|-------------|--------------|-------------|
| Vercel | Hosting | Application code, logs | Yes | [TBD] |
| Neon | Database | All user data | Yes | [TBD] |
| Anthropic | LLM API | NDA content (transient) | Yes | [TBD] |
| Voyage AI | Embeddings | NDA content (transient) | [Check] | [TBD] |
| GitHub | Source control | Code, CI secrets | Yes | [TBD] |
| Resend | Email | User emails | [Check] | [TBD] |

**Review cadence:** Annual review of all vendors, or upon contract renewal.

### 1.9 Acceptable Use Policy

**Purpose:** Defines rules for system users.

**For end users:**
- Use the service only for lawful purposes
- Do not attempt to access other users' data
- Do not upload malware or malicious content
- Report security issues to [security contact]

**For administrators (you):**
- Access production data only when necessary
- Log all administrative actions
- Do not share credentials
- Use MFA for all administrative access

**Monitoring disclosure:**
- User activity is logged for security and compliance
- Stated in Terms of Service / Privacy Policy

### 1.10 Business Continuity Plan

**Purpose:** Ensures recovery from disasters.

**Recovery objectives:**

| Metric | Target | Justification |
|--------|--------|---------------|
| **RPO** (Recovery Point Objective) | 24 hours | Neon daily backups |
| **RTO** (Recovery Time Objective) | 4 hours | Redeploy from git + restore DB |

**Backup strategy:**
- **Database:** Neon automatic daily backups, 30-day retention
- **Code:** GitHub (inherently versioned)
- **Blob storage:** Vercel Blob (check backup policy)
- **Secrets:** Documented in secure location (1Password, etc.)

**Recovery procedures:**

1. **Application failure:**
   - Vercel auto-redeploys from main branch
   - Manual: `vercel --prod` to force redeploy

2. **Database failure:**
   - Neon automatic failover
   - Manual: Restore from backup via Neon dashboard

3. **Complete disaster (all services):**
   - Provision new Neon database
   - Restore from most recent backup
   - Update environment variables
   - Redeploy to Vercel
   - Verify functionality
   - Notify users of any data loss

**Testing:** Annual recovery test (restore backup to test environment).

---

## Phase 2: Technical Controls

Implement these controls in the codebase.

### 2.1 Audit Log Population

**Current state:** Schema exists (`src/db/schema/audit.ts`), not populated.

**Implementation:**

Option A: Application middleware
```typescript
// src/lib/audit.ts
export async function logAuditEvent(params: {
  tenantId: string
  tableName: string
  recordId: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  userId?: string
  ipAddress?: string
}) {
  await db.insert(auditLogs).values({
    ...params,
    performedAt: new Date(),
  })
}
```

Option B: Database triggers (more reliable, but harder to maintain)

**Tables to audit:**
- `documents` - all operations
- `analyses` - all operations
- `comparisons` - all operations
- `generated_ndas` - all operations
- `organizations` - membership changes
- `users` - profile updates, deletions

**Priority:** High - this is core compliance evidence.

### 2.2 MFA for Email/Password Users

**Current state:** OAuth users get MFA from provider, email/password users don't have MFA.

**Options:**

1. **Require OAuth only** (simplest)
   - Remove email/password option
   - All users authenticate via Google/GitHub which have MFA

2. **Add TOTP** (standard)
   - Add `totp_secret` column to users
   - Add setup/verify flow
   - Use `otpauth` or `speakeasy` library

3. **Add WebAuthn/Passkeys** (modern)
   - Passwordless option
   - More complex implementation

**Recommendation:** Option 1 for MVP compliance, add TOTP later if needed.

**If implementing TOTP:**
```typescript
// Schema addition
totpSecret: text("totp_secret"), // encrypted
totpVerifiedAt: timestamp("totp_verified_at"),

// Enforcement in dal.ts
if (user.authMethod === 'credentials' && !user.totpVerifiedAt) {
  redirect('/setup-mfa')
}
```

### 2.3 Failed Login Tracking + Lockout

**Current state:** No tracking of failed attempts.

**Implementation:**

```typescript
// Schema addition to users or separate table
loginAttempts: integer("login_attempts").default(0),
lockedUntil: timestamp("locked_until"),
lastFailedLogin: timestamp("last_failed_login"),
```

**Logic:**
- Track failed attempts per email
- Lock account after 5 failed attempts in 15 minutes
- Lockout duration: 15 minutes (exponential backoff optional)
- Reset counter on successful login
- Log all failed attempts to audit log

**Rate limit by IP as well** to prevent distributed attacks.

### 2.4 API Rate Limiting

**Current state:** Inngest has rate limits for background jobs, no API route limiting.

**Implementation options:**

1. **Vercel Edge Config + middleware** (built-in)
2. **Upstash Redis rate limiter** (recommended for flexibility)
3. **In-memory with `next-rate-limit`** (simpler, single-instance only)

**Recommended limits:**

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/*` | 10 requests | 1 minute |
| `/api/documents` (upload) | 20 requests | 1 hour |
| `/api/analyses` | 60 requests | 1 minute |
| General API | 100 requests | 1 minute |

**Implementation with Upstash:**
```typescript
// src/lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "1 m"),
})

// In API routes or middleware
const { success } = await ratelimit.limit(identifier)
if (!success) {
  return new Response("Too Many Requests", { status: 429 })
}
```

### 2.5 Dependency Scanning

**Current state:** No automated vulnerability scanning.

**Implementation:**

1. **Enable Dependabot** (GitHub native)
   ```yaml
   # .github/dependabot.yml
   version: 2
   updates:
     - package-ecosystem: "npm"
       directory: "/"
       schedule:
         interval: "weekly"
       open-pull-requests-limit: 10
   ```

2. **Add `pnpm audit` to CI**
   ```yaml
   # In .github/workflows/ci.yml
   - name: Security audit
     run: pnpm audit --audit-level=high
   ```

3. **Optional: Add Snyk or Socket.dev** for deeper analysis

### 2.6 Password Policy Verification

**Current state:** `validatePassword()` exists in `src/lib/password.ts`.

**NIST 800-63B requirements:**
- Minimum 8 characters (NIST says 8, many orgs use 12)
- Check against breach databases (Have I Been Pwned)
- No composition rules (uppercase/special chars not required by NIST)
- No password hints
- No periodic rotation requirements

**Implementation:**
```typescript
import { pwnedPassword } from 'hibp'

export async function validatePassword(password: string): Promise<{
  valid: boolean
  errors: string[]
}> {
  const errors: string[] = []

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters")
  }

  // Check against breach database
  const breachCount = await pwnedPassword(password)
  if (breachCount > 0) {
    errors.push("This password has appeared in data breaches")
  }

  return { valid: errors.length === 0, errors }
}
```

### 2.7 Session Timeout + Concurrent Session Limits

**Current state:** Database sessions via Auth.js, no explicit timeout.

**Implementation:**

1. **Session timeout** (add to Auth.js config):
   ```typescript
   // src/lib/auth.ts
   session: {
     strategy: "database",
     maxAge: 8 * 60 * 60, // 8 hours
     updateAge: 1 * 60 * 60, // Refresh every hour
   }
   ```

2. **Concurrent session limit:**
   - Query sessions table on login
   - If > 3 active sessions, invalidate oldest
   - Or: prompt user to choose which to keep

3. **Idle timeout** (optional, client-side):
   - Track last activity
   - Warn at 7 minutes idle
   - Logout at 8 minutes idle

### 2.8 Security Headers

**Current state:** Vercel provides some defaults.

**Verify/add in `next.config.js` or `vercel.json`:**

```typescript
// next.config.js
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains'
  },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
  },
]

module.exports = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}
```

### 2.9 Error Message Sanitization

**Current state:** Custom error classes exist in `src/lib/errors.ts`.

**Verify:**
- Production errors don't expose stack traces
- Database errors don't expose schema details
- Validation errors don't reveal field existence for auth

**Implementation check:**
```typescript
// In error handling middleware
if (process.env.NODE_ENV === 'production') {
  // Sanitize internal errors
  if (error instanceof DatabaseError) {
    return { error: "An internal error occurred" }
  }
}
```

---

## Phase 3: Evidence Collection

### 3.1 Vendor SOC 2 Reports

Request these via trust portals:

| Vendor | Trust Portal | Report Type Needed |
|--------|--------------|-------------------|
| Vercel | [vercel.com/trust](https://vercel.com/trust) | SOC 2 Type II |
| Neon | [neon.tech/trust](https://neon.tech/trust) | SOC 2 Type II |
| Anthropic | [trust.anthropic.com](https://trust.anthropic.com) | SOC 2 Type II |
| Voyage AI | Check website or email security@ | SOC 2 Type II |
| GitHub | [github.com/security](https://github.com/security) | SOC 2 Type II |
| Resend | Check website | SOC 2 Type II (if available) |

**Store reports in:** Secure location (not git), reference in vendor inventory.

### 3.2 Access Review Process

**Quarterly tasks:**

1. **GitHub:**
   - Screenshot of organization members
   - Review and remove unused access
   - Document any changes

2. **Vercel:**
   - Screenshot of team members
   - Review project access
   - Document any changes

3. **Neon:**
   - Screenshot of project members
   - Review database roles
   - Document any changes

4. **Application:**
   - Export organization members list
   - Review for inactive users
   - Document any removals

**Template for access review:**
```markdown
## Access Review - Q1 2026

**Date:** 2026-01-15
**Reviewer:** [Your name]

### GitHub
- Members: [list]
- Changes: None / Removed [user] - reason

### Vercel
- Members: [list]
- Changes: None / Removed [user] - reason

### Neon
- Members: [list]
- Changes: None / Removed [user] - reason

### Application Admin Users
- Reviewed [X] organizations
- Changes: None / Removed [user] - reason

**Sign-off:** [Signature/date]
```

### 3.3 Incident Tracking Log

Create a spreadsheet or Notion database:

| Column | Description |
|--------|-------------|
| Incident ID | INC-001, INC-002, etc. |
| Date Detected | When discovered |
| Severity | Critical/High/Medium/Low |
| Description | What happened |
| Impact | Who/what was affected |
| Root Cause | Why it happened |
| Resolution | How it was fixed |
| Date Resolved | When closed |
| Lessons Learned | Preventive measures |

**Even if no incidents occur:** Document "No security incidents in period" for each quarter.

### 3.4 Audit Log Evidence

Prepare export capability:

```typescript
// API endpoint for audit log export
// GET /api/admin/audit-logs/export?start=2026-01-01&end=2026-01-31

export async function GET(request: Request) {
  const { role } = await requireRole(['owner'])

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  const logs = await db
    .select()
    .from(auditLogs)
    .where(and(
      eq(auditLogs.tenantId, tenantId),
      gte(auditLogs.performedAt, new Date(start)),
      lte(auditLogs.performedAt, new Date(end))
    ))
    .orderBy(desc(auditLogs.performedAt))

  // Return as CSV or JSON
  return new Response(JSON.stringify(logs), {
    headers: { 'Content-Type': 'application/json' }
  })
}
```

### 3.5 Vulnerability Scan Evidence

Save CI artifacts showing:
- `pnpm audit` results (clean or remediated)
- Dependabot status
- Any manual penetration testing results

---

## Phase 4: Audit Preparation

### 4.1 Auditor Selection

**Startup-friendly SOC 2 auditors:**

| Firm | Notes | Approximate Cost |
|------|-------|------------------|
| Prescient Assurance | Startup focus, fast | $10,000-15,000 |
| Johanson Group | Good for first-timers | $12,000-18,000 |
| Sensiba San Filippo | Tech company experience | $15,000-20,000 |
| A-LIGN | Larger, more structured | $18,000-25,000 |
| Drata/Vanta + auditor | Compliance platform + audit | Platform fee + audit fee |

**Compliance platforms (optional but helpful):**
- Drata
- Vanta
- Secureframe
- Sprinto

These automate evidence collection and provide policy templates. Cost: $10,000-20,000/year but reduce manual work significantly.

### 4.2 Readiness Assessment

Before formal audit:

1. Complete all policies (Phase 1)
2. Implement critical technical controls (Phase 2)
3. Collect vendor SOC 2 reports (Phase 3)
4. Run mock access review
5. Self-assess against control checklist

**Readiness checklist:**

- [ ] All 10 policies written and approved
- [ ] Audit logging operational
- [ ] MFA enforced or OAuth-only
- [ ] Rate limiting implemented
- [ ] Dependency scanning in CI
- [ ] Security headers verified
- [ ] Vendor SOC 2 reports collected (at least Vercel, Neon)
- [ ] Access review completed once
- [ ] Incident log created (even if empty)
- [ ] Backup recovery tested once

### 4.3 Audit Timeline

| Week | Activity |
|------|----------|
| 1 | Kick-off call with auditor |
| 2-3 | Document review (policies, procedures) |
| 3-4 | Technical review (system configurations) |
| 4 | Interviews (auditor asks questions about controls) |
| 5 | Draft report review |
| 6 | Final report issued |

---

## Execution Checklist

### Phase 1: Policies (Priority: High)
- [ ] Write Information Security Policy
- [ ] Write Access Control Policy
- [ ] Write Data Classification Policy
- [ ] Write Data Retention & Disposal Policy
- [ ] Write Encryption Policy
- [ ] Write Change Management Policy
- [ ] Write Incident Response Plan
- [ ] Write Vendor Management Policy
- [ ] Write Acceptable Use Policy
- [ ] Write Business Continuity Plan
- [ ] Create policy document repository (docs/policies/ or separate repo)

### Phase 2: Technical Controls (Priority: High)
- [ ] Implement audit log population middleware
- [ ] Enforce MFA or OAuth-only authentication
- [ ] Add failed login tracking + account lockout
- [ ] Implement API rate limiting
- [ ] Add Dependabot configuration
- [ ] Add `pnpm audit` to CI pipeline
- [ ] Verify password policy meets NIST 800-63B
- [ ] Configure session timeout (8 hours)
- [ ] Add security headers to Next.js config
- [ ] Verify error messages don't expose sensitive info

### Phase 3: Evidence Collection (Priority: Medium)
- [ ] Request Vercel SOC 2 report
- [ ] Request Neon SOC 2 report
- [ ] Request Anthropic SOC 2 report
- [ ] Check Voyage AI compliance status
- [ ] Request GitHub SOC 2 report
- [ ] Check Resend compliance status
- [ ] Create access review template
- [ ] Complete first access review
- [ ] Create incident tracking log
- [ ] Build audit log export endpoint
- [ ] Run and save first vulnerability scan

### Phase 4: Audit (Priority: After Phases 1-3)
- [ ] Research and select auditor
- [ ] Schedule readiness assessment (optional)
- [ ] Complete readiness self-assessment
- [ ] Remediate any gaps
- [ ] Schedule formal Type I audit
- [ ] Complete audit
- [ ] Receive SOC 2 Type I report

---

## Cost Summary

| Item | Estimated Cost |
|------|----------------|
| Auditor (Type I) | $10,000-25,000 |
| Compliance platform (optional) | $10,000-20,000/year |
| Upstash Redis (rate limiting) | $0-10/month |
| Engineer time | ~80-120 hours |

**Minimum path:** Policies + technical controls + auditor = ~$15,000 + your time

---

## Post-Certification

After receiving Type I report:

1. **Share with customers:** Provide under NDA via trust portal
2. **Plan for Type II:** 6-12 month observation period, then Type II audit
3. **Maintain controls:** Quarterly access reviews, annual policy reviews
4. **Monitor continuously:** Keep audit logs, incident tracking up to date

---

## References

- [AICPA SOC 2 Guide](https://www.aicpa.org/soc2)
- [NIST 800-63B Password Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [Vercel Trust Center](https://vercel.com/trust)
- [Neon Trust Center](https://neon.tech/trust)
