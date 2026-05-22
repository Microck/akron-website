# Akron Landing Page Spec

## Goal

Build a single-page landing site for Akron at `akron.micr.dev`.

The page should match the supplied visual direction: a centered Akron logo, two text buttons under it, and four orbiting icons around the central content. The background uses the provided full-viewport image.

## Project Location

The site lives in this repository:

```text
/home/ubuntu/workspace/akron-website
```

The existing Akron mod repository at `/home/ubuntu/workspace/celeste-megahack` is not the site implementation location.

## Stack

- Vite
- React
- TypeScript
- Static build output deployed to Vercel

Vite is preferred because the site is intended to remain a small static landing page. Next.js is not needed for the current scope.

## Deployment

- Production domain: `akron.micr.dev`
- Host: Vercel
- Build output: Vite static `dist/`

No server routes are required for the first version.

## Page Scope

The first version is one fixed first-viewport composition.

Included:

- Centered Akron logo
- Two text-only buttons below the logo
- Four orbiting icon links around the logo/buttons
- Provided full-viewport background image
- Background image is not darkened by an overlay.
- Basic static metadata
- Favicon from the supplied assets

Excluded:

- Header
- Footer
- Navigation bar
- Marketing copy
- Scroll sections
- Analytics
- Cookie/privacy banner
- Placeholder pages for future routes

## Layout

The visible page should fit in one viewport without intentional scrolling.

Desktop layout:

- Akron logo centered in the viewport
- `Download` and `Olympus` buttons centered below the logo
- Button row outer edges aligned with the logo width
- Four icon links orbiting around the central logo/button group
- Icons remain upright while their positions orbit

Mobile layout:

- Preserve the same composition
- Scale down the logo, orbit radius, icon size, and button spacing so the orbit fits inside the viewport
- Keep buttons side by side when practical
- Stack buttons only when the viewport is too narrow to fit them cleanly

## Animation

Use an orbiting icon animation based on the Magic UI Orbiting Circles pattern:

```text
https://magicui.design/docs/components/orbiting-circles
```

Animation requirements:

- The four icons orbit around the central content.
- The orbit path is not visually drawn. Do not render a ring or circle around the content.
- Icons stay visually upright during orbiting.
- The orbit should spin regardless of `prefers-reduced-motion`.
- The reduced-motion preference is intentionally not honored for this page.

## Assets

Use the supplied archive:

```text
https://files.catbox.moe/uejbge.rar
```

Extract and commit the needed assets under:

```text
public/assets/
```

Use clean kebab-case filenames:

| Source file | Repo filename | Purpose |
| --- | --- | --- |
| `akronlogonoborders.png` | `akron-logo.png` | Main centered logo |
| `akronfavicon.png` | `akron-favicon.png` | Favicon and metadata image if useful |
| `docsicon.png` | `docs-icon.png` | Docs orbit icon |
| `discordclean.png` | `discord-icon.png` | Discord orbit icon |
| `gamebananalogo.png` | `gamebanana-icon.png` | GameBanana orbit icon |
| `github_logo_icon_229278.png` | `github-icon.png` | GitHub orbit icon |
| `yaa86106m6i7h0sx.png` | `button-sprite.png` | Install button surface |
| `58c1rr.png` | `background.png` | Full-page background |

Known dimensions from the supplied archive:

| Asset | Dimensions |
| --- | --- |
| `akron-logo.png` | `1254x1304` |
| `button-sprite.png` | `1104x307` |
| `background.png` | `3344x1882` |
| `akronfavicon.png` | `960x960` |
| `docsicon.png` | `942x942` |
| `discord (2).png` | `512x512` |
| `github_logo_icon_229278.png` | `512x512` |
| `gamebanana-icon.png` | `197x197` |

The orbit icon assets are PNGs; the logo, button sprite, and background use their native non-square aspect ratios.

## Link Contract

Main buttons:

| Label | Initial target | Final intent |
| --- | --- | --- |
| `Download` | `/download` | Raw Akron zip download from GitHub releases |
| `Olympus` | `/olympus` | Everest/Olympus one-click install link |

Orbit icons:

| Icon | Initial target | Final intent |
| --- | --- | --- |
| Docs notebook | `/docs` | Akron docs at `akron.micr.dev/docs` |
| Discord | `/discord` | Discord server invite |
| GameBanana banana | `/gamebanana` | GameBanana link page |
| GitHub | `https://github.com/Microck/Akron` | Akron repository |

The internal placeholder paths should be allowed to 404 until they are wired. Do not create placeholder pages for them in the first version.

## Button Behavior

- Buttons are text-only.
- Button labels are exactly `Download` and `Olympus`.
- Buttons should look clickable even though their initial targets are placeholder paths.
- Do not disable the buttons.
- Buttons use a muted brown base near `#85443c`.
- Buttons use square corners, not squircle or pill corners.
- Button text uses Renogare, the main Celeste font listed by GameFontLibrary.
- Button text is large and uses the logo's dark brown `#7f4038`.
- Button surface uses the provided pixel button sprite, with text placed on top.
- Button corners remain transparent; do not add rectangular shadows, outlines, or fills behind the sprite.

## Visual Direction

Reference image:

```text
https://files.catbox.moe/mwo9vo.jpg
```

Use the reference for composition, not as an exact pixel target.

Visual requirements:

- Logo-only visible branding
- No visible `Akron` text label outside the logo
- Provided full-viewport background image
- Clean centered composition
- Orbit icons should be clearly clickable
- Orbit icons are image-only, without visible square boxes behind them.
- Main logo and orbit icons have no drop shadows.
- Logo layers are scaled to `1.15`.
- Outlines are off.
- Main logo is rendered as clipped lower and upper layers.
- Orbit icons layer above the lower logo layer, below the upper logo layer, and below the buttons.
- No visible orbit ring
- Avoid extra explanatory text

## Metadata

Add basic static metadata only:

- Page title: `Akron`
- Short description for search/link previews
- Favicon
- Simple Open Graph/Twitter metadata if the Vite setup supports it without extra complexity

Do not add analytics, tracking scripts, or cookie/privacy UI in the first version.

## Verification Requirements

Implementation is not complete until these checks pass:

1. Install dependencies with the repo's selected package manager.
2. Run the Vite production build.
3. Start a local dev server.
4. Verify the rendered page in a browser.
5. Capture screenshots at desktop and mobile widths.
6. Confirm the rendered page shows:
   - Centered logo
   - `Download` and `Olympus` buttons
   - Four orbiting icons
   - Provided background image
   - No header, footer, nav, or extra copy
7. Confirm link targets in the rendered DOM:
   - `/download`
   - `/olympus`
   - `/docs`
   - `/discord`
   - `/gamebanana`
   - `https://github.com/Microck/Akron`

## Open Placeholders

These are intentionally unresolved for the first version:

- Final GitHub release asset URL for `Download`
- Final Olympus one-click install URL
- Final Discord invite URL
- Final GameBanana page URL
When these are available, update the relevant link targets or Vercel redirects without changing the central page composition.
