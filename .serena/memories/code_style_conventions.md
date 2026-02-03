# Code Style and Conventions

## TypeScript
- Strict mode enabled
- Use explicit types for function parameters and return values
- Prefer `type` over `interface` for simple type aliases
- Use Zod for runtime validation

## React Components
- Functional components only (no class components)
- Use React 19 features (Server Components, concurrent features)
- Props typing with `React.ComponentProps<>` for extending native elements

## shadcn/ui Patterns
- Components use `data-slot` attributes for styling hooks
- Use `cva` (class-variance-authority) for component variants
- Use `cn()` from `@/lib/utils` for conditional className merging
- Radix UI primitives for accessibility

## Path Aliases
```
@/* → ./* (e.g., @/components, @/lib/utils, @/hooks)
```

## Database (Drizzle)
- All tenant tables require `tenant_id UUID NOT NULL` with RLS policy
- Use `cosineDistance()` for vector similarity queries
- HNSW indexes created AFTER bulk data load
- Idempotent ingestion via `content_hash` + `ON CONFLICT DO NOTHING`

## Inngest Patterns
- Wrap each agent step in `step.run()` for durability
- Use `step.sleep()` for rate limiting between API calls
- Concurrency limits: 5 analyses, 3 embedding batches
- AI SDK 6 `generateObject()` for structured LLM output

## Styling (Tailwind CSS v4)
- Use `@theme inline` syntax
- Colors use oklch color space via CSS variables
- Dark mode via `.dark` class with `@custom-variant dark (&:is(.dark *))`
- Semantic color variables: `--primary`, `--secondary`, `--muted`, etc.

## File Organization
- `app/` - Next.js App Router pages and layouts
- `db/` - Drizzle schema and queries
- `inngest/` - Inngest client and pipeline functions
- `agents/` - AI SDK 6 agent definitions
- `lib/` - Core utilities
- `components/` - UI components
- `test/` - Test setup and helpers
