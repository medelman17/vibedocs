# GitHub Issue Conventions

## Tagging

When creating GitHub issues via `gh issue create`, **always tag `@claude`** at the end of the issue body.

Example:
```bash
gh issue create --title "Fix bug X" --body "$(cat <<'EOF'
## Problem
...

## Solution
...

---
@claude
EOF
)"
```

## Why

This allows the Claude Code GitHub Action to automatically pick up issues and work on them when triggered.

## Labels

Common labels used:
- `bug` - Something isn't working
- `enhancement` - New feature or improvement
- `documentation` - Documentation updates

Note: Check available labels before using - some labels like `critical` may not exist.
