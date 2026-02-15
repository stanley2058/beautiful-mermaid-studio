# Beautiful Mermaid Studio

Beautiful Mermaid Studio is a Mermaid playground built with Bun + React. It lets you write Mermaid syntax, preview it instantly, and export or share diagrams from a single UI.

Live site: https://stanley2058.github.io/beautiful-mermaid-studio/

## What it does

- Live Mermaid editing with instant preview
- Multiple render styles: `svg`, `unicode`, and `ascii`
- Built-in presets for flowchart, sequence, state, class, and ER diagrams
- Theme picker powered by `beautiful-mermaid` themes
- Interactive SVG viewport (pan, wheel zoom, fit-to-view)
- Export and copy actions for SVG, PNG (scale selectable), and ASCII
- Shareable links using compressed diagram payloads in the URL

## Tech stack

- Bun runtime and build tooling
- React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui primitives
- `beautiful-mermaid` for rendering

## Development

Install dependencies:

```bash
bun install
```

Start local development server with HMR:

```bash
bun dev
```

Build static output into `dist/`:

```bash
bun run build
```

Run production server locally:

```bash
bun start
```

## Deployment

GitHub Pages is deployed automatically from `main` via `.github/workflows/deploy-pages.yml`.

- Build artifact path: `dist/`
- Public URL: https://stanley2058.github.io/beautiful-mermaid-studio/

## Project layout

- `src/App.tsx` - main Mermaid Studio UI and interactions
- `src/lib/share-link.ts` - share-link encoding/decoding helpers
- `src/index.ts` - Bun server entry for local dev/prod serving
- `build.ts` - Bun static build script
