# Phikila brand assets

Generated vector artwork for the Phikila School Management System. Everything
here is derived from a single 64×64 geometric grid, so every size stays
pixel-aligned.

## The mark

A **shield** (trust, safeguarding, reliable administration) contains an **open
book** (education), with a **verification badge** on the lower right (checked,
accurate records) and a **gold bookmark** on the spine (the active record). No
graduation cap, no literal circuitry.

The book is the dominant shape in the silhouette, which is what keeps the icon
readable at 16px — at that size the rim and bookmark drop away and the book +
badge carry the identity.

## Colour

| Role | Hex | Use |
| --- | --- | --- |
| Navy | `#0F2A47` | Primary. Shield, wordmark, primary buttons |
| Navy deep | `#0A1E34` | App tile, sidebar, dark backgrounds |
| Navy lifted | `#1B3E63` | Shield **on dark backgrounds only**, so it does not merge |
| Emerald | `#12A47C` | Verification badge on light backgrounds |
| Emerald light | `#2BC194` | Badge/rim on dark backgrounds, focus ring |
| Gold | `#E0A93B` | Accent only — the spine bookmark. Never for text |
| White | `#FFFFFF` | Book pages, reversed wordmark |

Flat colour only. No gradients, no 3D, no drop shadows on the mark.

## Typography

Inter (600/700). `PHIKILA` is set in 700 with wide tracking; the secondary line
`SCHOOL MANAGEMENT SYSTEM` is 600, uppercase, tracked and scaled so both lines
share the same optical width. In the SVG lockups the type is **converted to
outlines**, so the files render identically without the font installed.

## Files

### Logos
| File | Use |
| --- | --- |
| `logo-horizontal-light.svg` | Primary lockup on light backgrounds |
| `logo-horizontal-dark.svg` | Primary lockup on dark backgrounds |
| `logo-stacked-light.svg` / `-dark.svg` | Narrow/centred placements |
| `mark.svg` | Symbol, light backgrounds |
| `mark-on-dark.svg` | Symbol, dark backgrounds (lifted shield) |
| `mark-mono-navy.svg` / `mark-mono-white.svg` | One-colour: print, embroidery, watermarks |
| `app-icon.svg` | Rounded app tile |

### Icons
`favicon.ico` (16/32/48 multi-resolution) and `favicon.svg` sit in
`public/`. This folder holds `favicon-{16..512}.png`, `apple-touch-icon.png`
(180, opaque tile — iOS ignores alpha), `maskable-icon-512.png` (extra padding
for Android's circular crop), `app-icon-{192,512}.png`, and `og-image.png`
(1200×630 social card).

## In the application

The React app does **not** load these files for UI chrome. `src/components/Logo.tsx`
inlines the same geometry so the logo is crisp at any size, adapts to
light/dark, and costs no network request on first paint. Use:

```tsx
<Logo size={34} tone="dark" />        // mark + wordmark
<LogoMark size={26} />                // symbol only (decorative)
<LogoMark size={40} title="Phikila" /> // symbol as the only branding
```

## Clear space and minimum sizes

Keep clear space of at least half the mark's height on all sides. Minimum
sizes: **16px** for the favicon, **24px** for the mark in UI, **120px** wide
for the horizontal lockup.

## Don't

- Recolour the mark outside the palette above, or use gold for the shield
- Use the light-background mark on navy (use `mark-on-dark.svg`)
- Stretch, rotate, outline, or add effects to the mark
- Re-typeset the wordmark in another face, or change the two-line relationship
- Place the lockup on a busy photograph

## Regenerating

Artwork is generated from source, not hand-edited. See `frontend/brand/` for
the build scripts (`build.mjs` draws the vectors, `export.mjs` rasterises the
icon set and writes the multi-resolution `.ico`).
