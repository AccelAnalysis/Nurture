# Nurture Brand System

**Status:** canonical foundation  
**Version:** 0.1.0  
**Updated:** 2026-09-04

This directory is the shared source of truth for Nurture visual identity across web, mobile-web, native, marketing, and future app builds. The system keeps the Accel Analysis blue-to-cyan family while giving Nurture its own unmistakable ribbon **N** and a restrained glass material language.

## 1. Design direction

Nurture should feel **clear, capable, calm, human, and forward-moving**. It follows Apple Human Interface Guidelines as a design reference: content is primary, familiar interaction patterns stay familiar, branding is used with restraint, accessibility is built in, and visual effects support hierarchy rather than compete with it.

The requested glassmorphism direction is implemented as **functional glass** inspired by Apple's Liquid Glass principles:

- Use glass primarily for navigation, floating controls, compact inspectors, overlays, and other interface chrome.
- Keep dense content surfaces, tables, forms, and reading areas comparatively quiet and opaque.
- Avoid coloring every control; reserve the brand accent for the action or state that needs emphasis.
- Always provide a legible opaque fallback for reduced-transparency, increased-contrast, or unsupported `backdrop-filter` environments.
- Let content show through glass only when the resulting contrast stays reliable in both light and dark appearance.

## 2. Logo

### Primary mark

`brand/logo/nurture-n.svg` is the canonical Nurture mark. It translates the Accel Analysis folded-ribbon language into a direct **N** using the same deep-blue → electric-blue → cyan family.

Use the gradient mark on neutral or quiet backgrounds. Use `brand/logo/nurture-n-mono.svg` when color reproduction is limited or a single-color mark is required.

### Clear space

Maintain clear space around the mark equal to at least **25% of the mark's visible width**. Do not let text, borders, icons, or other high-contrast graphics enter that area.

### Minimum size

- Recommended digital size: **28 px or larger**.
- Absolute small-format floor: **20 px**, only when the mark remains visually clear.
- App-header / navigation use: typically **28–36 px**.

### Do not

- Rotate, skew, stretch, outline, or rearrange the N.
- Substitute arbitrary gradients or unrelated brand colors.
- Place the gradient mark on a visually noisy background without a neutral or glass container.
- Add permanent drop shadows, glows, bevels, or text inside the mark.
- Repeat the logo as decoration throughout product screens; branding must defer to the task and content.

### App icon guidance

For future native Apple packaging, use the N as the simple central symbol and construct the final icon in Apple's current Icon Composer / app-icon workflow so system materials, depth, and appearance variants remain platform-correct. Do not bake an iOS-style outer mask into the canonical logo asset.

## 3. Color

The primary ramp was sampled from the supplied Accel Analysis mark and normalized into reusable Nurture tokens.

| Token | Hex | Role |
|---|---:|---|
| Navy 900 | `#011A87` | Deep brand depth, gradients, large decorative fields |
| Blue 800 | `#0135B6` | Brand depth and dark gradient transitions |
| Blue 700 | `#0151E0` | Strong interactive / hover state |
| Blue 600 | `#0264EC` | **Primary action accent** |
| Blue 500 | `#027AF4` | Bright brand color; large graphics and non-text emphasis |
| Azure 400 | `#0391FB` | Focus and luminous highlight |
| Cyan 300 | `#03A9FD` | Gradient transition / data emphasis |
| Cyan 200 | `#05C3FD` | Bright endpoint / visual lift |

`#0264EC` is the preferred light-mode filled-button color because white text has approximately **5.2:1** contrast against it. `#027AF4` is intentionally not the default white-text button color because that pairing is below the 4.5:1 WCAG AA target used by Apple's accessibility guidance for standard-size text.

### Neutrals

| Token | Light | Dark |
|---|---:|---:|
| Background | `#F8FAFC` | `#07111F` |
| Surface | `#FFFFFF` | `#0F1B2D` |
| Primary text | `#0F172A` | `#F8FAFC` |
| Secondary text | `#475569` | `#CBD5E1` |
| Tertiary text | `#64748B` | `#94A3B8` |
| Border | `#E2E8F0` | `#334155` |

Status colors are semantic, not decorative. Never rely on color alone to communicate success, warning, error, selection, or pipeline state; pair color with text, shape, iconography, or another redundant cue.

## 4. Typography

Use the platform/system font stack. On Apple devices this resolves to San Francisco / SF Pro without bundling or redistributing Apple's font files.

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", sans-serif;
```

Recommended web scale:

| Style | Size / line height | Weight |
|---|---|---:|
| Large title | 34 / 41 px | 700 |
| Title 1 | 28 / 34 px | 700 |
| Title 2 | 22 / 28 px | 650 |
| Title 3 | 20 / 25 px | 600 |
| Headline | 17 / 22 px | 600 |
| Body | 17 / 24 px | 400 |
| Callout | 16 / 22 px | 400 |
| Subheadline | 15 / 20 px | 400 |
| Footnote | 13 / 18 px | 400 |
| Caption | 12 / 16 px | 400 |

Body content defaults to 17 px. Allow text to reflow rather than truncate as people increase browser or operating-system text size.

## 5. Glass material

Canonical glass tokens are defined in `brand/tokens.css` and `brand/tokens.json`.

- Blur: **24 px**
- Saturation: **140%**
- Light glass: `rgba(255,255,255,0.72)`
- Dark glass: `rgba(9,18,32,0.64)`
- Card radius: **20 px**
- Control radius: **14 px**
- Shadow: broad and low-opacity, never a hard floating-card shadow

Glass must express hierarchy. A screen should usually have **one material layer for chrome** and a quieter content layer beneath it, rather than nested translucent cards everywhere.

## 6. Layout and controls

- Base spacing unit: **4 px**; common rhythm: 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Default touch target: **44 × 44 px** for comfortable mobile interaction.
- Only de-emphasized, tightly constrained controls should approach the **28 × 28 px** minimum; 44 px remains the product default.
- Controls that perform the same function should use the same placement, label, icon, and interaction pattern across modules.
- Use generous whitespace and progressive disclosure instead of filling every available area.
- Desktop layouts may expand, but information density should not destroy the mobile hierarchy.

## 7. Iconography

Use simple, recognizable outline or filled symbols with consistent visual weight.

- Native Apple builds: prefer the system symbol library where licensing and platform use permit it.
- Web: use one web-licensed icon family consistently; do not mix unrelated families or imitate Apple-proprietary glyph artwork.
- Pair unfamiliar icons with labels.
- Do not use color as the only differentiator between icon states.

## 8. Motion

Motion should communicate relationship and state, not decorate the interface.

- Fast feedback: **140 ms**
- Standard transition: **220 ms**
- Deliberate transition: **320 ms**
- Standard easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`
- Respect `prefers-reduced-motion` and avoid essential information that exists only in animation.

## 9. Voice and product copy

Nurture copy is concise, direct, respectful, and action-oriented.

**Prefer:** "Add customer", "Continue", "Review details", "Payment failed — try another method".  
**Avoid:** vague labels, hype, excessive exclamation points, cleverness that obscures the action, or blaming the user for an error.

Address people directly with "you" and "your" when useful. Explain what happened, what it affects, and what they can do next.

## 10. Accessibility requirements

Every build using this system should meet these minimums:

- Standard text contrast: **4.5:1** or better; large/bold text may use the lower threshold described by current accessibility guidance.
- Visible keyboard focus for every interactive control.
- Semantically correct headings, labels, landmarks, and form relationships.
- Color never carries essential meaning alone.
- Zoom / larger text must not break essential layout or hide core actions.
- Light and dark appearances are tested independently.
- Reduced motion, increased contrast, and reduced transparency receive intentional fallbacks.

## 11. Implementation

### CSS builds

```css
@import "../brand/tokens.css";

.primary-action {
  min-height: var(--n-control-target);
  color: var(--n-on-accent);
  background: var(--n-accent);
  border-radius: var(--n-radius-control);
}

.floating-toolbar {
  border-radius: var(--n-radius-card);
}
```

Apply `.n-glass` only to intentional material surfaces and `.n-focusable` to custom focusable components when native focus presentation is insufficient.

### Non-CSS builds

Consume `brand/tokens.json` and map semantic tokens into the destination platform. Preserve semantic names (`accent`, `textPrimary`, `surface`) rather than scattering literal hex values through components.

## 12. Repository contract

```text
brand/
├── README.md                 # this guide
├── preview.html              # static visual preview
├── tokens.json               # platform-neutral canonical tokens
├── tokens.css                # CSS implementation + accessibility fallbacks
└── logo/
    ├── nurture-n.svg         # canonical gradient N
    └── nurture-n-mono.svg    # monochrome fallback
```

Changes to `brand/tokens.json` or the canonical logo should be reviewed as brand-system changes, not incidental component edits. New modules should consume these shared assets rather than creating local copies of colors, radii, glass values, or logo artwork.

## 13. Reference guidance

- Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Apple HIG — Branding: https://developer.apple.com/design/human-interface-guidelines/branding
- Apple HIG — Color: https://developer.apple.com/design/human-interface-guidelines/color
- Apple HIG — Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility
- Apple Liquid Glass overview: https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass
- Apple Fonts: https://developer.apple.com/fonts/
- Accel Analysis: https://accelanalysis.com/
