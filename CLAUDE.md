# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start development server (http://localhost:3000)
pnpm build        # Production build
pnpm lint         # Run ESLint
pnpm start        # Start production server
```

## Architecture

### Stack
- **Next.js 16** with App Router (RSC enabled)
- **React 19** with TypeScript (strict mode)
- **Tailwind CSS v4** using `@theme inline` syntax with oklch colors
- **pnpm** workspace

### Component Libraries
- **shadcn/ui** (new-york style): Base UI components in `components/ui/`
- **AI SDK Elements**: AI-specific components from `ai-sdk.dev` registry in `components/ai-elements/`

### Path Aliases
```
@/*  →  ./*  (e.g., @/components, @/lib/utils, @/hooks)
```

### Key Directories
- `app/` - Next.js App Router pages and layouts
- `components/ui/` - shadcn/ui primitives (Button, Dialog, etc.)
- `components/ai-elements/` - AI interface components (Message, CodeBlock, Terminal, etc.)
- `lib/utils.ts` - Utility functions including `cn()` for className merging
- `hooks/` - Custom React hooks

## Conventions

### Component Patterns
- UI components use `data-slot` attributes for styling hooks
- Use `cva` (class-variance-authority) for component variants
- Prefer Radix UI primitives via shadcn for accessible components
- Use `cn()` from `@/lib/utils` for conditional classNames

### Adding Components
```bash
# shadcn/ui components
pnpm dlx shadcn@latest add <component-name>

# AI Elements
pnpm dlx shadcn@latest add <component-name> -r @ai-elements
```

### Styling
- Colors use CSS variables with oklch color space (see `app/globals.css`)
- Dark mode via `.dark` class with `@custom-variant dark (&:is(.dark *))`
- Theming through semantic variables: `--primary`, `--secondary`, `--muted`, etc.
