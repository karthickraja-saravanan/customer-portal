# E2B Template - Next.js Pages Router

This template provides a Next.js 15 Pages Router environment with shadcn/ui components for the AlgorithmShift code builder.

## Template Information

- **Template ID**: `usxtwy9s44vkg3nw3xil`
- **Template Name**: `as-nextjs-pages-router`
- **Stack**: Next.js 15 + React 19 + TypeScript + Tailwind + shadcn/ui

## Rebuilding the Template

Use the E2B CLI v2:

```bash
cd apps/e2b-template
e2b template build
```

This rebuilds the existing template (ID is stored in `e2b.toml`).

## Template Configuration

- **`e2b.Dockerfile`** - Docker build instructions
- **`e2b.toml`** - E2B configuration (template ID, build settings)

## Backend Integration

Update your backend `.env`:

```bash
E2B_TEMPLATE_ID=usxtwy9s44vkg3nw3xil
```

## Structure

```
e2b-template/
├── e2b.Dockerfile       # Docker build (E2B v2)
├── e2b.toml            # Template config (auto-generated)
├── pages/              # Next.js Pages Router
├── components/         # shadcn/ui components
├── styles/             # Global CSS (Tailwind)
├── lib/                # Utilities
└── hooks/              # React hooks
```

## Legacy Files (No Longer Used)

- `template.ts.legacy` - Old v1 programmatic build
- `build.dev.ts.legacy` - Old v1 dev build script
- `build.prod.ts.legacy` - Old v1 prod build script

These files used the deprecated E2B v1 API and are kept for reference only.

## Pages Router Only

This template uses **Next.js Pages Router exclusively**. There is no `app/` directory to avoid confusion with App Router.

For App Router support, create a separate template.
