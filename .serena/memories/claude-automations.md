# Claude Code Automations

## Directory Structure

```
.claude/
├── settings.json           # Hooks configuration
├── settings.local.json     # User-specific permissions (gitignored)
├── skills/
│   ├── drizzle-migration/  # User-invokable
│   ├── inngest-function/   # Both can invoke
│   ├── clean-worktree/     # User-invokable (safe worktree cleanup)
│   └── error-response/     # Claude-only
└── agents/
    ├── security-reviewer.md
    └── test-writer.md

.mcp.json                   # MCP server configuration (shared)
```

## Hooks (settings.json)

| Hook | Trigger | Effect |
|------|---------|--------|
| Auto-lint | PostToolUse on Edit/Write | Runs `pnpm lint --fix` on TS/JS files |
| Block .env | PreToolUse on Edit/Write | Blocks edits to `.env*` files |

## Skills

### /drizzle-migration
- **Invocation**: User-only (`disable-model-invocation: true`)
- **Purpose**: Create Drizzle migrations following project conventions
- **Usage**: `/drizzle-migration add user preferences table`

### /inngest-function
- **Invocation**: Both (user and Claude)
- **Purpose**: Create durable Inngest workflows with rate limiting
- **Usage**: `/inngest-function create embedding batch processor`
- **Includes**: Rate limit patterns (Voyage 300 RPM, Claude 60 RPM), concurrency limits

### /clean-worktree
- **Invocation**: User-only (`disable-model-invocation: true`)
- **Purpose**: Safely remove git worktrees and associated branches
- **Usage**: `/clean-worktree <name>`

### error-response
- **Invocation**: Claude-only (`user-invocable: false`)
- **Purpose**: Automatically apply error handling conventions
- **References**: `lib/errors.ts` error classes, `lib/api-utils.ts` helpers

## Agents

### security-reviewer
- **Focus**: Auth, multi-tenancy, data protection
- **Checklist**: Session checks, tenant isolation, password handling, RLS coverage

### test-writer
- **Focus**: Generate tests following Vitest + PGlite patterns
- **Patterns**: Database tests with beforeEach, tenant isolation, error class tests

## MCP Servers (.mcp.json)

| Server | Purpose |
|--------|---------|
| `shadcn` | Component management via `npx shadcn@latest mcp` |
| `context7` | Live documentation for Drizzle, Next.js, Auth.js, Inngest |
| `serena` | Semantic code understanding and editing |

## Key Points

- `.claude/settings.local.json` is gitignored (user permissions)
- All other `.claude/` files are committed and shared with team
- Skills use `$ARGUMENTS` for user input
- Claude-only skills act as background knowledge (auto-applied)
