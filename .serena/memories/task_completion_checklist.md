# Task Completion Checklist

When completing a task, run the following checks:

## 1. Code Quality
```bash
pnpm lint         # Run ESLint - fix any errors
pnpm build        # Ensure production build succeeds
```

## 2. Type Safety
- Ensure no TypeScript errors (strict mode)
- Run `pnpm build` to catch type issues

## 3. Database Changes (if applicable)
```bash
pnpm db:push      # Push schema changes
# or
pnpm db:generate  # Generate migrations for review
```

## 4. Component Changes (if applicable)
- Ensure components follow shadcn/ui patterns
- Use `data-slot` attributes where appropriate
- Test dark mode if styling was changed

## 5. Before Committing
- Review changes with `git diff`
- Stage relevant files (avoid committing .env files)
- Write descriptive commit message

## 6. Testing
```bash
pnpm test         # Run Vitest unit tests (704 tests)
pnpm test:e2e     # Run E2E tests (Playwright) - when applicable
```

## Files to Never Commit
- `.env.local` and other `.env*` files (except `.env.example`)
- `.serena/cache/` and `.serena/memories/` (user-specific)
- `node_modules/`
- `.next/`
- `.turbo/`

## Files That ARE Committed
- `.serena/project.yml` (shared project config)
- `drizzle/` (database migrations)
- `.claude/` (except `settings.local.json`)
