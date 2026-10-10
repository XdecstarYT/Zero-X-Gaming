# NextX Engine

What every NextX title (YourGov, Zero City, and what comes next) is built on, shared so each new
game starts where the last one finished. The NextX app (`/nextx`,
`src/components/nextx/NextXApp.tsx`) runs on it too.

- **Liquid Glass** (`glass.tsx`): surfaces that bend what's behind them at the rim like a thick
  lens (an SVG displacement filter used as a backdrop filter, Chromium), split the colours a touch
  at the edge, and catch a highlight that follows the pointer. `GlassDefs({ prefix })` puts the
  lens filters on the page (`#<prefix>-lg`, `#<prefix>-lg-bar`); `trackSheen(root, selector)` moves
  the highlights; `canRefract()` says whether the browser can bend. YourGov uses it with the `yg`
  prefix (`games/yourgov/ui/glass.tsx`); the NextX app with `nx` (`.nx-glass`, `.nx-btn`,
  `.nx-capsule` in `globals.css`). Zero City's glass (`games/zero-city/ui/glass.tsx`) is the
  original it grew from.
- **Photoreal backdrops** (`backdrops.ts`, load lazily): the titles' own renderers running as a
  living background. `mountBackdrop("country", host)` is YourGov's country (terrain, a physical
  sky, a sea with surf, clouds) turning in the sun; `mountBackdrop("city", host)` is Zero City's
  island city (PBR buildings, roads, trees, image-based light, ACES grading) orbiting at golden
  hour. Quality is picked for the device; a still camera for people who prefer less motion.
- **Powered by** (`PoweredBy.tsx`): the mark on each title's title screen, linking to the app.
