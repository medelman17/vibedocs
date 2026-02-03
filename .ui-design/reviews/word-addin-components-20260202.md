# Design Review: Word Add-in Components

**Review ID:** word-addin-components-20260202
**Reviewed:** 2026-02-02
**Target:** `app/(word-addin)/word-addin/taskpane/components/`
**Focus:** Visual design, usability, code quality

## Summary

The Word Add-in components are well-structured but have several deviations from the VibeDocs design system. The main issues are hardcoded Tailwind colors instead of design tokens, duplicated type definitions, and missing use of brand colors (violet/teal).

**Issues Found:** 12

- Critical: 0
- Major: 4
- Minor: 5
- Suggestions: 3

---

## Major Issues

### Issue 1: Hardcoded Colors Instead of Design Tokens

**Severity:** Major
**Location:** Multiple files
**Category:** Visual

**Problem:**
Components use hardcoded Tailwind colors like `text-green-600`, `text-yellow-500`, `text-red-600` instead of the semantic design tokens defined in `brand-palette.css`:
- `--success-500` for green/standard
- `--warning-500` for yellow/cautious
- `--error-500` for red/aggressive

**Files affected:**
- `ClauseCard.tsx:17-33` - riskBadgeConfig uses `bg-green-100`, `bg-yellow-100`, `bg-red-100`
- `ClauseDetail.tsx:19-36` - same hardcoded colors
- `RiskGauge.tsx:17-37` - hardcoded hex values in strokeColor
- `GapAnalysis.tsx:22-35` - priority badges with hardcoded colors
- `AnalyzeButton.tsx:186-194` - success/error states with hardcoded colors

**Impact:**
- Inconsistent with main app's color palette
- Harder to maintain brand consistency
- Dark mode may not work correctly with oklch tokens

**Recommendation:**
Use CSS custom properties for semantic colors:

```tsx
// Before
const riskBadgeConfig: Record<RiskLevel, { label: string; className: string }> = {
  standard: {
    label: "Standard",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  // ...
}

// After - use design tokens
const riskBadgeConfig: Record<RiskLevel, { label: string; className: string }> = {
  standard: {
    label: "Standard",
    className: "bg-success-50 text-success-600 dark:bg-success-500/20 dark:text-success-400",
  },
  cautious: {
    label: "Cautious",
    className: "bg-warning-50 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400",
  },
  aggressive: {
    label: "Aggressive",
    className: "bg-error-50 text-error-600 dark:bg-error-500/20 dark:text-error-400",
  },
  unknown: {
    label: "Unknown",
    className: "bg-muted text-muted-foreground",
  },
}
```

---

### Issue 2: Duplicated RiskLevel Type and Config

**Severity:** Major
**Location:** `ClauseCard.tsx`, `ClauseDetail.tsx`, `RiskGauge.tsx`
**Category:** Code Quality

**Problem:**
The `RiskLevel` type and `riskBadgeConfig` / `riskLevelConfig` are duplicated across three components:
- `ClauseCard.tsx:11-33`
- `ClauseDetail.tsx:14-47`
- `RiskGauge.tsx:8-37`

Each file defines its own version with slightly different implementations (some use `strokeColor`, some use `className`).

**Impact:**
- Maintenance burden (fix in 3 places)
- Risk of drift between implementations
- Violates DRY principle

**Recommendation:**
Centralize in the shared types file created in the plan:

```typescript
// src/types/word-addin.ts (add to existing)
export const RISK_BADGE_CONFIG: Record<RiskLevel, {
  label: string
  className: string
  strokeColor: string
}> = {
  standard: {
    label: "Standard",
    className: "bg-success-50 text-success-600 dark:bg-success-500/20 dark:text-success-400",
    strokeColor: "var(--success-500)",
  },
  cautious: {
    label: "Cautious",
    className: "bg-warning-50 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400",
    strokeColor: "var(--warning-500)",
  },
  aggressive: {
    label: "Aggressive",
    className: "bg-error-50 text-error-600 dark:bg-error-500/20 dark:text-error-400",
    strokeColor: "var(--error-500)",
  },
  unknown: {
    label: "Unknown",
    className: "bg-muted text-muted-foreground",
    strokeColor: "var(--neutral-400)",
  },
}
```

---

### Issue 3: Missing Brand Colors in Header

**Severity:** Major
**Location:** `TaskPaneShell.tsx:21`
**Category:** Visual

**Problem:**
The header uses generic `bg-primary` which maps to the brand violet. However, the logo icon uses the same primary color, missing an opportunity to use the teal accent for visual interest.

**Impact:**
- Underutilizes the two-color brand palette
- Looks less distinctive compared to main app

**Recommendation:**
Consider using teal accent for the icon background:

```tsx
// Before
<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
  <FileText className="h-4 w-4 text-primary-foreground" />
</div>

// After - use secondary/teal for differentiation
<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--teal-500)]">
  <FileText className="h-4 w-4 text-white" />
</div>
```

---

### Issue 4: Duplicated formatCategory Helper

**Severity:** Major
**Location:** `ClauseCard.tsx:49-54`, `ClauseDetail.tsx:52-57`, `GapAnalysis.tsx:40-45`
**Category:** Code Quality

**Problem:**
The `formatCategory` function is copy-pasted across three files.

**Recommendation:**
Create a shared utilities file:

```typescript
// app/(word-addin)/word-addin/taskpane/lib/format.ts
export function formatCategory(category: string): string {
  return category
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}
```

---

## Minor Issues

### Issue 5: Inconsistent Button Sizing in Sign-in Screen

**Severity:** Minor
**Location:** `AuthGate.tsx:45`
**Category:** Usability

**Problem:**
The sign-in button says "Sign in with Microsoft" but this is for any OAuth provider (Google/GitHub). The button text should match the actual providers or be generic.

**Recommendation:**
```tsx
// Before
<>
  <LogIn className="h-4 w-4" />
  Sign in with Microsoft
</>

// After
<>
  <LogIn className="h-4 w-4" />
  Sign In
</>
```

---

### Issue 6: Missing Loading State Feedback in AuthGate

**Severity:** Minor
**Location:** `AuthGate.tsx:24-31`
**Category:** Usability

**Problem:**
When login fails, there's no error feedback shown to the user. The `login()` function returns a boolean but it's ignored.

**Recommendation:**
Add error state handling (already covered in Phase 2 of the plan).

---

### Issue 7: Hard-to-Read Small Text

**Severity:** Minor
**Location:** Multiple files
**Category:** Visual

**Problem:**
Several components use `text-[10px]` for badges, which is smaller than the design system's `--text-xs` (12px). This may be hard to read for some users.

**Files affected:**
- `ClauseCard.tsx:104` - `text-[10px]`
- `ClauseCard.tsx:118` - `text-[10px]`
- `GapAnalysis.tsx:107,144,184` - `text-[10px]`

**Recommendation:**
Use `text-xs` (12px) as the minimum text size:

```tsx
// Before
className="shrink-0 text-[10px] px-1.5 py-0"

// After
className="shrink-0 text-xs px-1.5 py-0"
```

---

### Issue 8: Progress Bar Height Inconsistency

**Severity:** Minor
**Location:** `ClauseCard.tsx:112-120`, `AnalyzeButton.tsx:172-177`
**Category:** Visual

**Problem:**
Progress bars use inconsistent heights:
- `ClauseCard.tsx` uses `h-1` (4px)
- `AnalyzeButton.tsx` uses `h-2` (8px)
- `ClauseDetail.tsx` uses `h-2` (8px)

**Recommendation:**
Standardize on `h-1.5` (6px) for subtle progress bars, `h-2` for prominent ones.

---

### Issue 9: Missing Hover State on RiskGauge

**Severity:** Minor
**Location:** `RiskGauge.tsx`
**Category:** Usability

**Problem:**
The RiskGauge card doesn't have a hover state or indicate interactivity, even though it could potentially be clickable for more details.

**Recommendation:**
Add subtle hover state if interactive, or ensure it's styled as non-interactive (currently fine as-is).

---

## Suggestions

### Suggestion 1: Use CSS Variables for Gauge Colors

**Location:** `RiskGauge.tsx:15-37`
**Category:** Maintainability

Instead of hardcoded hex values for SVG stroke colors, use CSS variables that work in SVG:

```tsx
// Before
strokeColor: "#16a34a", // green-600

// After
strokeColor: "var(--success-500)",
```

Note: For SVG, ensure the CSS variable is defined in a scope the SVG can access.

---

### Suggestion 2: Add Transitions to Accordion Items

**Location:** `GapAnalysis.tsx`
**Category:** Visual Polish

The accordion items would benefit from smooth transitions on expand/collapse. shadcn/ui accordion likely already has this, but verify the animation timing matches the design system's `--duration-normal` (200ms).

---

### Suggestion 3: Consider Empty State Illustration

**Location:** `GapAnalysis.tsx:76-81`
**Category:** Visual Polish

The "No gaps detected" message uses a simple checkmark icon. Consider adding a small celebratory illustration for a more polished feel.

---

## Positive Observations

- **Consistent use of shadcn/ui components** - Button, Badge, Accordion are used consistently
- **Good accessibility** - `sr-only` classes for screen readers, `focus-visible` states
- **Proper TypeScript** - All components have typed props and interfaces
- **Responsive to dark mode** - Most components include `dark:` variants
- **Good loading states** - Loader2 spinners and disabled states during async operations
- **Clear component documentation** - JSDoc comments explain purpose and usage
- **Proper use of `cn()` utility** - Conditional classNames handled consistently

---

## Next Steps

1. **Add design token integration** - Create CSS utility classes for semantic colors
2. **Centralize shared code** - Move duplicated types and utilities to shared files
3. **Update badge font sizes** - Use `text-xs` minimum
4. **Fix button text** - Make sign-in button generic

---

_Generated by UI Design Review. Issues integrated into implementation plan._
