# DESIGN.md — `click` Studio Metronome Design System

> This file follows the [DESIGN.md convention](https://github.com/VoltAgent/awesome-design-md) introduced by Google Stitch. AI agents and human contributors should read this before generating UI. **It is the single source of truth for visual style.**
>
> Tokens declared here are mirrored in `packages/web/src/styles/tokens.css`. If you propose a new color, font, or spacing value, add it here first, then propagate it to the CSS file.

## 1. Visual Theme & Atmosphere

**Theme name**: Studio Metronome.

**Mood**: precise, tactile, confident, quiet, rhythmic, instrumental.

Dark-first, high-contrast, monospace timing display. Inspired by studio hardware (Boss DB-series, Korg KDM) and modern DAW dark themes (Ableton Live, Logic Pro). The beat indicator should feel *physical* — like an LED matrix or a mechanical pendulum. Animation is reserved for events that are simultaneously audible. Silence is the default state; chrome never competes with the pulse.

**Density**: spacious. The BPM number is the visual anchor; everything else orbits it with generous whitespace.

**Philosophy**: a metronome is a tool, not entertainment. The UI exists to serve a musician practicing for hours. Nothing distracts; nothing fatigues; nothing surprises.

## 2. Color Palette & Roles

All colors are CSS custom properties defined in `packages/web/src/styles/tokens.css`. They are switched by `prefers-color-scheme` and `[data-theme]`.

### Dark theme (default)

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0A0A0B` | App background |
| `--surface` | `#141416` | Cards, panels |
| `--surface-elevated` | `#1C1C20` | Modals, popovers |
| `--border` | `#27272A` | Subtle dividers |
| `--text-primary` | `#FAFAF9` | Headings, BPM display |
| `--text-secondary` | `#A1A1AA` | Labels |
| `--text-muted` | `#71717A` | Hints, disabled |
| `--primary` | `#FB923C` | Play CTA, accent (warm amber = "on") |
| `--primary-hover` | `#FDBA74` | Hover, focus ring |
| `--beat-on` | `#FB923C` | Active beat dot |
| `--beat-accent` | `#FBBF24` | Downbeat (beat 1) |
| `--beat-off` | `#3F3F46` | Inactive beat dot |
| `--danger` | `#F87171` | Stop, destructive |
| `--success` | `#4ADE80` | Save confirmation |

### Light theme

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#FAFAF9` | App background |
| `--surface` | `#FFFFFF` | Cards, panels |
| `--surface-elevated` | `#F5F5F4` | Modals, popovers |
| `--border` | `#E7E5E4` | Subtle dividers |
| `--text-primary` | `#0A0A0B` | Headings, BPM display |
| `--text-secondary` | `#52525B` | Labels |
| `--text-muted` | `#A1A1AA` | Hints, disabled |
| `--primary` | `#F97316` | Play CTA, accent |
| `--primary-hover` | `#EA580C` | Hover, focus ring |
| `--beat-on` | `#F97316` | Active beat dot |
| `--beat-accent` | `#F59E0B` | Downbeat (beat 1) |
| `--beat-off` | `#D4D4D8` | Inactive beat dot |
| `--danger` | `#EF4444` | Stop, destructive |
| `--success` | `#22C55E` | Save confirmation |

**Rationale**: warm amber primary evokes analog hardware LEDs without aggression. The slight warm bias against near-black reduces eye strain in long practice sessions. Beat-on and beat-accent are deliberately distinct so beat 1 is unambiguous at a glance.

## 3. Typography Rules

System fonts only — zero network requests, PWA-friendly, instant load.

```css
--font-display: ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace;
--font-ui: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
```

### Type scale (rem-based, 1rem = 16px)

| Token | Size | Weight | Family | Usage |
|---|---|---|---|---|
| `--type-bpm` | `clamp(5rem, 18vw, 11rem)` | 700 | display | Primary BPM display |
| `--type-bpm-unit` | `1.25rem` | 500 | ui | "BPM" label |
| `--type-h1` | `1.75rem` | 600 | ui | Page title |
| `--type-h2` | `1.25rem` | 600 | ui | Section headings |
| `--type-body` | `1rem` | 400 | ui | Controls, labels |
| `--type-small` | `0.875rem` | 400 | ui | Metadata, hints |
| `--type-mono` | `1rem` | 500 | display | Tap BPM, time signature |

**All numeric displays must use `font-variant-numeric: tabular-nums`** so digit changes don't cause horizontal layout shift. This is critical for the BPM display, which updates frequently.

## 4. Component Stylings

### BpmDisplay
- Very large monospace, tabular numerals
- "BPM" label below in `--text-secondary`, ~1/8 the height
- Click to enter edit mode (becomes `<input type="number">`); blur or Enter commits
- States: `idle`, `editing`, `flashing` (brief highlight on programmatic change)
- Keyboard: `↑`/`↓` nudge by 1, `Shift+↑`/`Shift+↓` nudge by 10

### PlayButton
- Circular, **88×88px desktop, 96×96px touch**
- Icon-only: play triangle / stop square (inline SVG, `aria-label="Play"`/`"Stop"`)
- Background `--primary`, icon `--bg`
- States: `idle`, `hover` (slight `--primary-hover`), `active` (pulses on each beat), `focus` (2px ring `--primary-hover`)
- Animation: on each beat event, scale `1.0 → 1.04 → 1.0` over 80ms (CSS transform, GPU-accelerated, no layout)

### TapTempoButton
- Rectangular, **min 120×64px**
- Label "TAP" in `--font-display`
- Live BPM estimate shown smaller below the label while the tap window is active
- Flashes `--primary` for 80ms on each tap
- Resets visually after 2 s of inactivity

### TimeSignaturePicker
- Two stacked numbers (4/4, 3/4, 6/8) in `--font-display`
- Click cycles through presets, or opens menu on long-press / second click
- **Min 64×64px**

### BeatIndicator
- Row of circular dots, one per beat in the measure
- Downbeat (beat 1) dot is **20px**, others **14px**, accents use `--beat-accent`
- Current beat glows briefly (`box-shadow` + `background: --beat-on`) for ~120ms
- User-toggled accents show a small caret above the dot
- Click any dot to toggle its accent

### BpmControls
- Slider track 4px, thumb 24px (with **48px invisible padding for hit target**)
- Range 30-300, step 1
- Plus/minus buttons on each side, min 44×44px
- Keyboard: `←`/`→` ±1, `PageUp`/`PageDown` ±10

### VolumeSlider
- Same style as BpmControls slider
- Mute toggle on the left (speaker icon)

### SoundPicker
- Segmented control: Click / Beep / Wood / Cowbell
- Active segment uses `--primary` background, `--bg` text
- Each segment **min 56px height**

### Inputs (generic)
- Border: 1px `--border`
- Focus: 2px `--primary`
- Border radius: `--radius-md` (8px)
- Padding: 12px 16px

## 5. Layout Principles

### Spacing scale (4px base)

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 48px;
--space-8: 64px;
--space-9: 96px;
```

### Border radius

```css
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 16px;
--radius-full: 9999px;
```

### Main layout

- Single column, **max-width 560px**, centered
- Vertical flow: BpmDisplay → BeatIndicator → PlayButton → BpmControls → TapTempoButton → TimeSig → SoundPicker → Volume
- BpmDisplay has `--space-7` below
- Mobile: full-width with 16px gutters
- Desktop: content capped at 560px in viewport center

Use CSS Grid for multi-element clusters; Flexbox for vertical stacking. Avoid absolute positioning except for tooltips/popovers.

## 6. Depth & Elevation

```css
--shadow-1: 0 1px 2px 0 rgb(0 0 0 / 0.30);
--shadow-2: 0 4px 8px -2px rgb(0 0 0 / 0.40);
--shadow-3: 0 12px 24px -6px rgb(0 0 0 / 0.50);
```

### Hierarchy
- `--bg` — flat
- `--surface` with `--shadow-1` — cards
- `--surface-elevated` with `--shadow-2` — modals, dropdowns
- `--primary` button: `--shadow-2` at rest, `--shadow-3` on hover

**Do not** apply shadows to the BPM display or BeatIndicator — they should feel flat and direct.

## 7. Do's and Don'ts

### Do
- Treat the BPM number as the visual anchor
- Use tabular numerals everywhere digits appear
- Animate only things that correlate to audible beats
- Prefer opacity and transform animations over layout changes
- Honor `prefers-reduced-motion` to disable non-essential animation
- Use semantic HTML (`<button>`, `<input type="range">`, `<output>`)
- Use ARIA roles and labels for screen readers
- Provide keyboard equivalents for every mouse-only interaction

### Don't
- Use gradients on functional controls (distracting during practice)
- Animate the background
- Use emoji in the UI (the app is instrumental; emoji break the aesthetic)
- Use font sizes smaller than 14px on mobile
- Cause horizontal scroll on any supported viewport
- Use `alert()`, `confirm()`, or any blocking native dialog
- Introduce a new color, font, or spacing without proposing it here first
- Use a CSS framework (Tailwind, Bootstrap) — tokens are the source of truth

## 8. Responsive Behavior

### Breakpoints

```css
--bp-sm: 480px;
--bp-md: 768px;
--bp-lg: 1024px;
```

### Touch targets
**Minimum 44×44px** per WCAG 2.1 AA. Most controls target 56-96px for confidence.

### Below 480px
- BpmDisplay uses `clamp` for fluid sizing
- PlayButton grows to 96px
- Controls stack vertically with full width

### Landscape phone
Ensure BpmDisplay + PlayButton + BeatIndicator are visible without scroll. Respect `safe-area-inset-*`.

### Reduced motion
`@media (prefers-reduced-motion: reduce)` disables the PlayButton beat-pulse animation and the BeatIndicator glow. The visual change is instant rather than animated; the underlying state still updates.

## 9. Agent Prompt Guide

When generating any UI code for `click`:

- **Read tokens from `packages/web/src/styles/tokens.css`.** Never hardcode colors, sizes, or shadows.
- **Use system fonts** from `--font-ui` / `--font-display`. Do not load webfonts.
- **All interactive elements must have visible focus states** using `--primary-hover`.
- **All icon-only buttons must have `aria-label`.** Screen readers come first.
- **Animations must respect `@media (prefers-reduced-motion: reduce)`.**
- **Mobile-first**: write base styles for the smallest viewport, layer up via `@media (min-width: ...)`.
- **Never introduce a new color or token.** Propose an addition to this file in a PR first, then update `tokens.css`.
- **Never add a CSS dependency.** Custom properties + plain CSS are sufficient.

### Quick color reference

- Primary action: `var(--primary)` / hover `var(--primary-hover)`
- Background: `var(--bg)` → `var(--surface)` → `var(--surface-elevated)`
- Text: `var(--text-primary)` / `var(--text-secondary)` / `var(--text-muted)`
- Beat dots: `var(--beat-off)` (idle) / `var(--beat-on)` (active) / `var(--beat-accent)` (downbeat)
- Destructive: `var(--danger)`
- Success: `var(--success)`

### Ready-to-use prompts

> "Build a Solid component called X for `click`. Read the design tokens from `packages/web/src/styles/tokens.css` and the conventions in `DESIGN.md`. Use system fonts, semantic HTML, ARIA labels, and respect `prefers-reduced-motion`. Mobile-first, touch targets ≥ 44px, focus states visible."
