# MindfulBite — Dark Mode Redesign Brief (for Claude Design)

## The app
MindfulBite is a calm, premium wellness app: nutrition tracking, an AI coach ("Sage"), mood, and sleep. It runs inside a phone frame. The visual language is **warm, editorial, and calm** — soft surfaces, a single clean sans font (Hanken Grotesk), bold headings, gold accent, generous spacing, rounded 22px cards.

## What we love (keep this feeling)
The **light mode** is exactly the mood we want — see `light-mode-home.png` and `light-mode-nutrition.png`:
- Warm cream background, near-white cards, soft shadows
- Muted **gold** accent (`oklch(0.56 0.10 85)`)
- Warm dark-brown text, calm and uncluttered
It reads "calm, clean, trustworthy." We want the **dark mode to feel like the *nighttime sibling* of this** — same calm, same warmth — NOT a harsh black.

## The problem
The current dark mode is a near-black warm charcoal (`#1A1714`) with gold. It feels harsh and "luxury/casino," not calm wellness. **Redesign the dark theme only.**

## Direction: "Forest Calm" (preferred)
A soft, **deep desaturated green-charcoal** base that echoes our leaf brand 🌿, lifted off pure black so it's gentle at night, with the gold accent kept (gold-on-deep-green = calm-luxe). Keep it desaturated — a "very dark warm-neutral with a faint green soul," NOT a saturated green.

## Design tokens (OKLCH — the app retunes off these)

### Light theme (reference — already loved, do not change)
```
--bg            oklch(0.955 0.007 85)   /* warm cream */
--surface       oklch(0.995 0.004 88)   /* near-white card */
--surface-2     oklch(0.93 0.007 85)
--line          rgba(40,32,20,0.09)
--text          oklch(0.27 0.012 70)    /* warm dark brown */
--text-muted    oklch(0.46 0.012 72)
--text-dim      oklch(0.60 0.01 75)
--accent        oklch(0.56 0.10 85)     /* muted gold */
--on-accent     #ffffff
```

### Proposed dark theme — "Forest Calm" (design/refine this)
```
--bg            oklch(0.21 0.016 155)   /* soft deep green-charcoal, not black */
--surface       oklch(0.255 0.02 155)   /* clearly elevated card */
--surface-2     oklch(0.31 0.022 155)   /* nested chips / inputs */
--line          rgba(255,255,255,0.08)
--text          oklch(0.94 0.01 150)    /* soft off-white, faint warmth */
--text-muted    oklch(0.74 0.012 150)
--text-dim      oklch(0.58 0.012 150)
--ring-track    rgba(255,255,255,0.09)
--accent        oklch(0.82 0.10 88)     /* warm gold — pops on green */
--on-accent     oklch(0.22 0.03 85)
--card-shadow   0 1px 2px rgba(0,0,0,0.30)
```

### Alternative dark — "Warm Stone" (if green feels too much)
```
--bg            oklch(0.215 0.012 70)    /* soft warm espresso-charcoal */
--surface       oklch(0.26 0.013 70)
--surface-2     oklch(0.31 0.014 70)
--text          oklch(0.95 0.008 85)
--accent        oklch(0.82 0.10 88)
```

## What to produce
Mock up the **dark theme** across these screens so we can compare to the light versions:
1. **Home / Today** — greeting, calorie ring + macro bars card, sleep/mood stat chips, Sage coach nudge, meal-plan link, Water/Weight/Cycle quick-track row, bottom tab bar with center camera FAB
2. **Nutrition** — big calorie number, macro donut rings, weekly bar chart, meals list
3. **Coach (Sage)** — chat bubbles (assistant = surface, user = gold)

## Fidelity / constraints
- Keep the EXACT layout, spacing, radii (22px cards), and the single-font + bold-heading system from the light mode. **Only the color palette changes.**
- Gold accent stays the one accent color.
- Ensure text contrast is comfortable (WCAG AA) on the new dark surfaces.
- Cards must read as clearly elevated above the bg (the current dark mode's bg/surface are too close).
- Output the final palette as OKLCH tokens so we can drop them straight into the app's ThemeContext.
