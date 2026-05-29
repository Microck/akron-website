# Akron Website

Single-page landing site for [Akron](https://github.com/Microck/Akron) — a Celeste mod. Live at [akron.micr.dev](https://akron.micr.dev/).

The site features a preloader animation, an orbiting link system (Docs, Discord, GameBanana, GitHub), and a responsive background with resolution-aware image loading.

## Tech Stack

- **React 19** + **TypeScript** — UI layer
- **Vite** — build tool and dev server
- **Bun** — package manager
- **Vercel** — deployment with rewrites for docs, R2 assets, and map packs

## Getting Started

```sh
bun install
bun run dev
```

The dev server starts at `http://127.0.0.1:5173/`.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Vite dev server on `127.0.0.1` |
| `bun run build` | Type-check (`tsc -b`) and production build |
| `bun run preview` | Preview production build locally |

## Project Structure

```
├── public/
│   ├── assets/          # Images (backgrounds, icons, logo, button sprite)
│   └── fonts/           # Renogare typeface
├── src/
│   ├── assets/          # Inline SVG preloader logo
│   ├── main.tsx         # App entry — landing page with preloader + orbit links
│   ├── styles.css       # All styles (animations, responsive breakpoints)
│   └── vite-env.d.ts    # Vite type declarations
├── index.html           # HTML shell with OG/Twitter meta tags
├── vercel.json          # Vercel rewrites (docs → Mintlify, assets → R2)
└── vite.config.ts       # Vite config with React plugin
```

## Architecture

### Preloader

On load, a 2.1-second preloader animation plays:
1. SVG logo outline draws in (1.5s stroke dash animation)
2. Logo fills with color (0.78s clip-path reveal)
3. Preloader fades out (0.82s)

The preloader waits for both `window.load` and the minimum timer before transitioning.

### Orbit System

Four navigation links (Docs, Discord, GameBanana, GitHub) orbit continuously around the Akron logo. On hover or focus, they snap to cardinal positions (top, right, bottom, left). Each icon counter-rotates to stay upright.

### Responsive Backgrounds

The site loads resolution-appropriate backgrounds using CSS `image-set()` with 1x/2x variants at five breakpoints:

| Viewport | Background |
|----------|-----------|
| < 700px | 960px (1x) / 1920px (2x) |
| 700–1099px | 1440px (1x) / 2560px (2x) |
| 1100–1799px | 1920px (1x) / full (2x) |
| 1800–2599px | 2560px (1x) / full (2x) |
| ≥ 2600px | full resolution |

### Vercel Rewrites

The `vercel.json` configures proxy routes:
- `/docs/*` → Mintlify documentation site
- `/catalog/*`, `/maps/*`, `/submissions/*` → Cloudflare R2 storage
- `/llms.txt`, `/llms-full.txt` → LLM-readable documentation

## License

Private repository. All rights reserved.
