# GitHub Actions Efficiency Improvements

> **Status:** ✅ COMPLETE (audited 2026-02-04)
> Caching and concurrency controls added to workflows.

**Date:** 2026-02-02
**Status:** Design approved
**Goal:** Speed and efficiency - faster CI runs, better caching, avoiding redundant work

## Context

Current workflows:
- `test.yml` - CI (test + lint) on push/PR to main
- `claude.yml` - Interactive Claude (@claude mentions)
- `claude-code-review.yml` - Automated PR code review

Pain points identified:
- No concurrency controls (duplicate runs on rapid updates)
- Only pnpm cache used (missing ESLint, Vitest caches)
- Code review runs even when tests fail
- Review path filters miss `app/` and `components/`

## Design

### 1. Concurrency Controls

Add to all three workflows to cancel stale runs:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true  # false for claude.yml
```

| Workflow | cancel-in-progress | Rationale |
|----------|-------------------|-----------|
| test.yml | true | New push supersedes old |
| claude.yml | false | Don't cancel active @claude requests |
| claude-code-review.yml | true | New push supersedes old review |

### 2. Caching Additions

#### ESLint Cache

```yaml
- uses: actions/cache@v4
  with:
    path: .eslintcache
    key: eslint-${{ runner.os }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
    restore-keys: eslint-${{ runner.os }}-

- name: Run linter
  run: pnpm lint --cache --cache-location .eslintcache
```

#### Vitest Cache

```yaml
- uses: actions/cache@v4
  with:
    path: node_modules/.vite
    key: vitest-${{ runner.os }}-${{ hashFiles('src/**/*.ts', 'src/**/*.tsx') }}
    restore-keys: vitest-${{ runner.os }}-
```

### 3. Code Review Depends on Tests

Change `claude-code-review.yml` trigger from `pull_request` to `workflow_run`:

```yaml
on:
  workflow_run:
    workflows: ["Test"]
    types: [completed]

jobs:
  claude-review:
    if: |
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'pull_request'
```

This ensures code review only runs after tests pass.

### 4. Expanded Path Filters

Update `claude-code-review.yml` to include all TypeScript directories:

```yaml
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "components/**/*.ts"
  - "components/**/*.tsx"
```

### 5. Timeout Limits

Add safety timeouts to prevent runaway jobs:

```yaml
jobs:
  test:
    timeout-minutes: 10
```

## Not Included (YAGNI)

- **Parallel test/lint jobs**: Test suite runs in ~15s. Parallelizing would double compute for ~2-3s wall-clock savings.
- **Reusable workflows**: Overkill for 3 workflows. Adds indirection without significant DRY benefit.
- **Next.js build cache**: Vercel handles builds. No need to duplicate in GitHub Actions.
- **Matrix testing**: Single Node version (22) is sufficient for this project.

## Implementation Plan

1. Update `test.yml`:
   - Add concurrency block
   - Add ESLint cache step
   - Add Vitest cache step
   - Update lint command to use cache
   - Add timeout

2. Update `claude.yml`:
   - Add concurrency block (cancel-in-progress: false)

3. Update `claude-code-review.yml`:
   - Change trigger to workflow_run
   - Add logic to extract PR context from workflow_run
   - Expand path filters
   - Add concurrency block
   - Add timeout

## Expected Impact

- **Duplicate runs**: Eliminated (concurrency controls)
- **Lint time**: ~30-50% faster on incremental (ESLint cache)
- **Wasted reviews**: Eliminated (dependency on tests)
- **Coverage**: Improved (expanded path filters)
