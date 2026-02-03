---
name: clean-worktree
description: Safely remove a git worktree and its associated branches. Use when done with a feature branch worktree. Prevents shell breakage by ensuring correct CWD.
disable-model-invocation: true
allowed-tools: Bash
---

# Clean Worktree Skill

Safely remove worktree: $ARGUMENTS

## Pre-flight Checks

1. **Identify the main repo root** (not a worktree):
   ```bash
   git rev-parse --path-format=absolute --git-common-dir | sed 's/\/.git$//'
   ```

2. **Change to main repo FIRST** (CRITICAL - prevents shell breakage):
   ```bash
   cd <main-repo-path>
   ```

3. **List current worktrees** to confirm target exists:
   ```bash
   git worktree list
   ```

## Workflow

1. **Check if branch was merged** (look for squash merge):
   ```bash
   git log main --oneline --grep="<branch-name>" | head -3
   # Or check commits not in main:
   git log main..<branch-name> --oneline
   ```

2. **If merged, proceed with cleanup**:
   ```bash
   # Remove worktree
   git worktree remove <worktree-path>

   # Delete local branch
   git branch -d <branch-name>

   # Delete remote branch (if exists)
   git push origin --delete <branch-name>
   ```

3. **If NOT merged, confirm with user** before proceeding:
   - Show unmerged commits
   - Ask if they want to merge first or discard

4. **Verify cleanup**:
   ```bash
   git worktree list
   git branch -a | grep <branch-name>
   ```

## Safety Rules

- **NEVER** run `git worktree remove` while CWD is inside the worktree
- **ALWAYS** cd to main repo before any removal commands
- **ALWAYS** check merge status before deleting branches
- Use `git branch -d` (safe delete) not `-D` (force delete)

## Common Patterns

### Worktree was squash-merged via PR
```bash
# Check for squash merge
git log main --oneline --grep="<PR-title-or-branch>" | head -1

# If found, safe to delete everything
cd <main-repo>
git worktree remove .worktrees/<name>
git branch -d feature/<name>
git push origin --delete feature/<name>
```

### Worktree has unmerged work
```bash
# Show what would be lost
git log main..feature/<name> --oneline

# User must explicitly confirm before using -D
```
