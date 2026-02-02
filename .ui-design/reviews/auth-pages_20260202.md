# Design Review: Auth Pages

**Review ID:** auth-pages_20260202
**Reviewed:** 2026-02-02
**Target:** `app/(auth)/` (layout, login, signup, forgot-password, reset-password)
**Focus:** Visual Design, Usability
**Platform:** Responsive (Desktop + Mobile)

## Summary

The auth flow is well-structured with good animations and clear user feedback. However, **the pages don't use the new violet/teal brand colors**—they're still using hardcoded amber/slate/emerald values. Several accessibility issues need attention, particularly around button tap targets and screen reader support.

**Issues Found:** 14

| Severity | Count |
|----------|-------|
| Critical | 2 |
| Major | 4 |
| Minor | 4 |
| Suggestions | 4 |

---

## Critical Issues

### Issue 1: Password toggle buttons lack accessible labels

**Severity:** Critical
**Location:** `login/page.tsx:229-239`, `signup/page.tsx:243-253`, `reset-password/page.tsx:229-239, 271-281`
**Category:** Usability/Accessibility

**Problem:**
The password visibility toggle buttons have no `aria-label`, making them inaccessible to screen reader users.

**Impact:**
Screen reader users cannot understand what the button does. WCAG 2.1 Level A failure (1.1.1 Non-text Content).

**Recommendation:**
Add descriptive aria-label that changes based on state.

**Code Example:**
```tsx
// Before
<button
  type="button"
  onClick={() => setShowPassword(!showPassword)}
  className="absolute right-3 top-1/2 ..."
>

// After
<button
  type="button"
  onClick={() => setShowPassword(!showPassword)}
  aria-label={showPassword ? "Hide password" : "Show password"}
  className="absolute right-3 top-1/2 ..."
>
```

---

### Issue 2: OAuth buttons lack loading state for assistive technology

**Severity:** Critical
**Location:** `login/page.tsx:116-169`
**Category:** Usability/Accessibility

**Problem:**
When OAuth buttons are loading, only the visual icon changes. Screen reader users receive no feedback that authentication is in progress.

**Impact:**
Users relying on assistive technology may click multiple times or think the action failed.

**Recommendation:**
Add `aria-busy` and visually hidden loading text.

**Code Example:**
```tsx
// Before
<Button
  variant="outline"
  disabled={!!oauthLoading}
>
  {oauthLoading === "google" ? (
    <Loader2 className="h-5 w-5 animate-spin" />
  ) : (
    // ...
  )}
</Button>

// After
<Button
  variant="outline"
  disabled={!!oauthLoading}
  aria-busy={oauthLoading === "google"}
>
  {oauthLoading === "google" ? (
    <>
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="sr-only">Signing in with Google...</span>
    </>
  ) : (
    // ...
  )}
</Button>
```

---

## Major Issues

### Issue 3: Brand colors not using design system tokens

**Severity:** Major
**Location:** `layout.tsx:12-76`
**Category:** Visual Design

**Problem:**
The auth layout uses hardcoded amber/slate colors instead of the new violet/teal brand palette:
- Line 12: `bg-slate-950` (should use neutral tokens)
- Line 25: `bg-amber-500/10` (should use violet)
- Line 32-33, 44, 62: amber colors throughout

**Impact:**
Brand inconsistency. The new design system won't apply to auth pages.

**Recommendation:**
Replace amber with violet brand colors:

```tsx
// Before
<div className="... bg-amber-500/10 border border-amber-500/20 ...">
  <FileText className="w-5 h-5 text-amber-400" />

// After
<div className="... bg-violet-500/10 border border-violet-500/20 ...">
  <FileText className="w-5 h-5 text-violet-400" />
```

**Files affected:** `layout.tsx` (logo, orbs, headline, bullets, testimonial avatar)

---

### Issue 4: Password toggle tap target too small for mobile

**Severity:** Major
**Location:** `login/page.tsx:229`, `signup/page.tsx:243`, `reset-password/page.tsx:229, 271`
**Category:** Usability

**Problem:**
The password visibility toggle uses `p-1` padding, resulting in ~28x28px tap target. Mobile guidelines recommend minimum 44x44px.

**Impact:**
Mobile users may have difficulty tapping the button accurately, leading to frustration.

**Recommendation:**
Increase padding or use explicit dimensions:

```tsx
// Before
<button
  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground ..."
>

// After
<button
  className="absolute right-1 top-1/2 -translate-y-1/2 p-3 text-muted-foreground ..."
>
```

---

### Issue 5: Signup page missing GitHub OAuth option

**Severity:** Major
**Location:** `signup/page.tsx:150-178`
**Category:** Usability

**Problem:**
Login page offers both Google and GitHub OAuth, but signup only offers Google. This creates inconsistency and may confuse users who prefer GitHub.

**Impact:**
Users who want to sign up with GitHub must first go to login, then realize they need to create an account differently.

**Recommendation:**
Add GitHub OAuth button to signup page, matching the login page pattern.

---

### Issue 6: Hardcoded RGB values in password strength indicator

**Severity:** Major
**Location:** `signup/page.tsx:67-68`, `reset-password/page.tsx:67-68`
**Category:** Visual Design

**Problem:**
Password requirement checkmarks use hardcoded RGB values in motion animations:
```tsx
backgroundColor: passed ? "rgb(16 185 129)" : "rgb(239 68 68)"
```

**Impact:**
These colors won't update if design tokens change, and they don't respect dark mode properly.

**Recommendation:**
Use CSS custom properties via style prop or Tailwind classes:

```tsx
// Option 1: CSS variable
style={{ backgroundColor: passed ? 'var(--success-500)' : 'var(--error-500)' }}

// Option 2: Tailwind with motion
className={cn(
  "w-4 h-4 rounded-full flex items-center justify-center",
  passed ? "bg-success" : "bg-error"
)}
```

---

## Minor Issues

### Issue 7: Mobile logo uses different color than desktop

**Severity:** Minor
**Location:** `layout.tsx:89-96`
**Category:** Visual Design

**Problem:**
Desktop logo uses amber (`bg-amber-500/10`, `text-amber-400`), but mobile logo uses `primary` (now violet). This creates inconsistent branding between breakpoints.

**Recommendation:**
Align both logos to use the same brand treatment.

---

### Issue 8: Typography inconsistency - serif font in sans-serif design

**Severity:** Minor
**Location:** `layout.tsx:42`
**Category:** Visual Design

**Problem:**
The headline uses `font-serif` but the design system specifies Geist (sans-serif). This causes fallback to system serif fonts, which may look inconsistent across platforms.

**Recommendation:**
Either remove `font-serif` or add a serif font to the design system if intentional.

---

### Issue 9: Success/error states use emerald/red instead of semantic tokens

**Severity:** Minor
**Location:** `login/page.tsx:92-93`, `signup/page.tsx:38-42, 77-79`
**Category:** Visual Design

**Problem:**
Success states use `emerald-500/10`, error states use `red-500`. These should use the design system's semantic tokens (`--success-*`, `--error-*`).

**Recommendation:**
Replace with design system tokens:
```tsx
// Before
className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700"

// After
className="bg-success/10 border border-success/20 text-success"
```

---

### Issue 10: Spacing value `space-y-5` not in compact scale

**Severity:** Minor
**Location:** `login/page.tsx:185`, `signup/page.tsx:193`, etc.
**Category:** Visual Design

**Problem:**
Forms use `space-y-5` (20px), but the compact spacing scale is: 2, 4, 6, 8, 12, 16, 24, 32. The value 20px isn't in the scale.

**Recommendation:**
Use `space-y-4` (16px) or `space-y-6` (24px) to align with the design system.

---

## Suggestions

### Suggestion 1: Add "Remember me" option to login

**Location:** `login/page.tsx`
**Category:** Usability

Adding a "Remember me" checkbox is a common auth pattern that users expect. Consider adding between password field and submit button.

---

### Suggestion 2: Collapse password requirements after all pass

**Location:** `signup/page.tsx:258-266`, `reset-password/page.tsx:244-252`
**Category:** Usability

Once all password requirements are satisfied, the full list becomes visual noise. Consider collapsing to a simple "✓ Password meets all requirements" message.

---

### Suggestion 3: Add focus-visible ring enhancement

**Location:** All interactive elements
**Category:** Usability/Accessibility

The current `outline-ring/50` (50% opacity) may not be visible enough for users with low vision, especially on light backgrounds. Consider using full opacity or a more prominent focus style.

---

### Suggestion 4: Duplicate PasswordStrength component should be shared

**Location:** `signup/page.tsx:23-89`, `reset-password/page.tsx:23-89`
**Category:** Code Quality (noted for context)

The `PasswordStrength` component and `PASSWORD_REQUIREMENTS` constant are duplicated. Extract to a shared component.

---

## Positive Observations

- **Excellent animation work** — Staggered reveals and micro-interactions create a polished feel
- **Good loading states** — All form submissions show spinners and disable buttons
- **Proper form accessibility basics** — Labels associated with inputs, required fields marked
- **Open redirect protection** — Login validates callbackUrl to prevent attacks
- **Real-time password validation** — Immediate feedback helps users create strong passwords
- **Responsive split layout** — Left panel elegantly hidden on mobile
- **Error handling** — Clear error messages with good visual treatment
- **Suspense boundaries** — Pages using `useSearchParams` properly wrapped

---

## Next Steps

1. **Fix critical accessibility issues** (Issues 1-2) — Add aria-labels and loading announcements
2. **Update brand colors** (Issues 3, 7, 9) — Replace amber/emerald with violet/teal tokens
3. **Improve mobile tap targets** (Issue 4) — Increase password toggle button size
4. **Add GitHub to signup** (Issue 5) — Match login page OAuth options

---

*Generated by UI Design Review. Run `/ui-design:design-review` again after fixes.*
