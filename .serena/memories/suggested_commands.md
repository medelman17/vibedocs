# Suggested Commands

## Development
```bash
pnpm dev          # Start Next.js dev server (http://localhost:3000)
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # Run ESLint
```

## Database (Drizzle)
```bash
pnpm db:push      # Push schema changes to database
pnpm db:generate  # Generate migration files
pnpm db:studio    # Open Drizzle Studio GUI
```

## Adding Components
```bash
# shadcn/ui components
pnpm dlx shadcn@latest add <component-name>

# AI SDK Elements
pnpm dlx shadcn@latest add <component-name> -r @ai-elements
```

## System Utilities (Darwin/macOS)
```bash
git status        # Check git status
git diff          # View changes
ls -la            # List files with details
find . -name "*.ts" -type f  # Find TypeScript files
grep -r "pattern" --include="*.ts"  # Search in TypeScript files
```

## Package Management
```bash
pnpm install      # Install dependencies
pnpm add <pkg>    # Add a dependency
pnpm add -D <pkg> # Add a dev dependency
```
