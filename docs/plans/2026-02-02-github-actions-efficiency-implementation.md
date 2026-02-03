# GitHub Actions Efficiency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Optimize GitHub Actions for speed and efficiency by adding concurrency controls, caching, and smart dependencies.

**Architecture:** Modify three existing workflow files - no new files needed. Add concurrency blocks to prevent duplicate runs, ESLint/Vitest caches to speed incremental runs, and make code review depend on test success.

**Tech Stack:** GitHub Actions YAML, actions/cache@v4

---

### Task 1: Add Concurrency and Caching to test.yml

**Files:**
- Modify: `.github/workflows/test.yml`

**Step 1: Add concurrency block after the `on:` trigger**

Insert after line 18 (after `paths-ignore` block):

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Step 2: Add timeout to the job**

Change line 21-22 from:
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
```

To:
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
```

**Step 3: Add Vitest cache step after install**

Insert after line 47 (`pnpm install` step):

```yaml
      - name: Cache Vitest
        uses: actions/cache@v4
        with:
          path: node_modules/.vite
          key: vitest-${{ runner.os }}-${{ hashFiles('src/**/*.ts', 'src/**/*.tsx') }}
          restore-keys: vitest-${{ runner.os }}-
```

**Step 4: Add ESLint cache step before lint**

Insert after the "Run tests" step:

```yaml
      - name: Cache ESLint
        uses: actions/cache@v4
        with:
          path: .eslintcache
          key: eslint-${{ runner.os }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
          restore-keys: eslint-${{ runner.os }}-
```

**Step 5: Update lint command to use cache**

Change:
```yaml
      - name: Run linter
        run: pnpm lint
```

To:
```yaml
      - name: Run linter
        run: pnpm lint --cache --cache-location .eslintcache
```

**Step 6: Verify YAML syntax**

Run: `cat .github/workflows/test.yml | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('Valid YAML')"`

Expected: `Valid YAML`

**Step 7: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "perf(ci): add concurrency controls and caching to test workflow

- Add concurrency group to cancel duplicate runs
- Add Vitest cache for faster test reruns
- Add ESLint cache for faster lint reruns
- Add 10-minute timeout as safety net"
```

---

### Task 2: Add Concurrency to claude.yml

**Files:**
- Modify: `.github/workflows/claude.yml`

**Step 1: Add concurrency block after the `on:` trigger**

Insert after line 11 (after `pull_request_review` trigger):

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false
```

Note: `cancel-in-progress: false` because we don't want to cancel active @claude requests.

**Step 2: Verify YAML syntax**

Run: `cat .github/workflows/claude.yml | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('Valid YAML')"`

Expected: `Valid YAML`

**Step 3: Commit**

```bash
git add .github/workflows/claude.yml
git commit -m "perf(ci): add concurrency controls to Claude Code workflow

- Add concurrency group to prevent parallel runs on same ref
- Keep cancel-in-progress: false to avoid canceling active requests"
```

---

### Task 3: Update claude-code-review.yml Trigger and Dependencies

**Files:**
- Modify: `.github/workflows/claude-code-review.yml`

**Step 1: Replace the entire file**

The trigger mechanism changes significantly (from `pull_request` to `workflow_run`), so replace the entire file:

```yaml
name: Claude Code Review

on:
  workflow_run:
    workflows: ["Test"]
    types: [completed]

concurrency:
  group: ${{ github.workflow }}-${{ github.event.workflow_run.head_branch }}
  cancel-in-progress: true

jobs:
  claude-review:
    # Only run if tests passed and this was a PR
    if: |
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}
          fetch-depth: 1

      - name: Get PR number
        id: pr
        uses: actions/github-script@v7
        with:
          script: |
            const pulls = await github.rest.pulls.list({
              owner: context.repo.owner,
              repo: context.repo.repo,
              head: `${context.repo.owner}:${context.payload.workflow_run.head_branch}`,
              state: 'open'
            });
            if (pulls.data.length > 0) {
              return pulls.data[0].number;
            }
            return null;
          result-encoding: string

      - name: Check for TypeScript changes
        id: changes
        if: steps.pr.outputs.result != 'null'
        uses: actions/github-script@v7
        with:
          script: |
            const files = await github.rest.pulls.listFiles({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: ${{ steps.pr.outputs.result }}
            });
            const patterns = [
              /^src\/.*\.tsx?$/,
              /^app\/.*\.tsx?$/,
              /^components\/.*\.tsx?$/
            ];
            const hasChanges = files.data.some(f =>
              patterns.some(p => p.test(f.filename))
            );
            return hasChanges;
          result-encoding: string

      - name: Run Claude Code Review
        if: steps.pr.outputs.result != 'null' && steps.changes.outputs.result == 'true'
        id: claude-review
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          plugin_marketplaces: 'https://github.com/anthropics/claude-code.git'
          plugins: 'code-review@claude-code-plugins'
          prompt: '/code-review:code-review ${{ github.repository }}/pull/${{ steps.pr.outputs.result }}'
```

**Step 2: Verify YAML syntax**

Run: `cat .github/workflows/claude-code-review.yml | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('Valid YAML')"`

Expected: `Valid YAML`

**Step 3: Commit**

```bash
git add .github/workflows/claude-code-review.yml
git commit -m "perf(ci): make code review depend on test success

- Change trigger from pull_request to workflow_run
- Only run review after Test workflow passes
- Add concurrency controls to cancel stale reviews
- Expand path filters to include app/ and components/
- Add 15-minute timeout as safety net
- Add PR number extraction from workflow_run context"
```

---

### Task 4: Final Verification

**Step 1: Verify all workflows have valid YAML**

Run:
```bash
for f in .github/workflows/*.yml; do
  echo "Checking $f..."
  cat "$f" | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin)" && echo "  Valid" || echo "  INVALID"
done
```

Expected: All files show "Valid"

**Step 2: Review the changes**

Run: `git log --oneline -3`

Expected: Three commits for each workflow update

**Step 3: Push branch for PR**

Run: `git push -u origin brainstorm/github-actions-improvements`

---

## Verification After Merge

After merging to main:
1. Create a test PR with a TypeScript change
2. Verify Test workflow runs first
3. Verify Code Review workflow triggers after Test passes
4. Push a second commit quickly - verify first run is canceled
