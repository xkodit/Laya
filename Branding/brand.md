# Laya — Brand System (locked 2026-05-21)

Single source of truth for Laya's visual identity. Update this file when anything changes.

---

## Logos

Three variants in this folder:

| File | Use |
|---|---|
| `LAYA LOGO - RGB.png` | Full-color logo. Default for marketing, landing page, light backgrounds. |
| `LAYA LOGO BLACK - 1 COLOR.png` | Black monochrome. Use on light backgrounds where the full-color version is too busy (favicons, headers, print). |
| `LAYA LOGO WHITE - 1 COLOR.png` | White monochrome. Use on dark backgrounds (dark mode chrome, hero overlays). |

**Notes:**
- All PNGs are transparent-background. Drop on any color.
- Mark + wordmark are combined in every file. If we need them separated later, request from designer.
- SVG versions are TODO when designer can provide. PNG is fine for v1.

---

## Colors

### Brand palette (locked)

| Token | Hex | Usage |
|---|---|---|
| `--brand-indigo` | `#2F00B9` | Primary brand. CTAs, links, focused states, accent surfaces. |
| `--brand-gold` | `#E8BF3C` | Accent. Highlights, badges, hover states, illustration support. |
| `--brand-black` | `#000000` | Text, outlines, max-contrast surfaces. |

### Derived neutrals (for shadcn / Tailwind)

For Tailwind / shadcn config, use the brand palette as the `primary` token and pair with shadcn's default `neutral` scale for greys. We can refine these once the design takes shape in practice.

```ts
// tailwind.config.ts (sketch)
theme: {
  extend: {
    colors: {
      brand: {
        indigo: '#2F00B9',
        gold:   '#E8BF3C',
      },
    },
  },
}
```

Light mode uses `--brand-indigo` as `primary`, white as background, neutral-900 as foreground.
Dark mode uses `--brand-indigo` lightened ~10–15% (e.g., `#5733E0`) for adequate contrast on dark surfaces, neutral-950 as background, white as foreground.

---

## Typography

**Font family: Plus Jakarta Sans** (Google Fonts) — used for everything (display, body, UI).

### Weights to load

| Weight | Use |
|---|---|
| 400 (Regular) | Body copy, default UI text |
| 500 (Medium) | Buttons, labels, navigation |
| 600 (SemiBold) | Subheadings, emphasized UI |
| 700 (Bold) | Headings, hero text |
| 800 (ExtraBold) | Logo-adjacent display (closest match to the wordmark) |

### Loading

Via `next/font/google` in `app/layout.tsx`:

```ts
import { Plus_Jakarta_Sans } from 'next/font/google'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
})
```

`latin-ext` is required for French diacritics (é, à, ç, etc.).

---

## Personality cues (visual ↔ behavioral)

Visual identity should reinforce Laya's persona (warm friend-with-expertise, vous default, mirrors user's register):

- **Indigo + gold** = confidence + warmth. Indigo dominates (trust, depth); gold accents (warmth, attention).
- **Rounded, chunky wordmark** = approachable, not corporate-bland. Matches the persona's no-corporate-hedging directive.
- **Mark = community around a central person** = the salarié supported by the law (and by Laya). Use the mark deliberately at empathy moments — e.g., welcome screens, "Laya is here to help" states.

---

## Don'ts

- Don't stretch or recolor the mark.
- Don't put the full-color logo on indigo-or-gold backgrounds — use the 1-color variants there.
- Don't pair Laya's wordmark with a competing display font in the same view (use Plus Jakarta Sans throughout).
- Don't use the mark without enough breathing room — pad by at least 1× the mark's height in all directions.
