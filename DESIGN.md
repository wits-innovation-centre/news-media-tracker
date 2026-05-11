---
name: Wits Funding Platform
colors:
  # Badge-derived base swatches
  badge-gold-deep: "#B3823F"
  badge-gold-light: "#CFA86D"
  badge-blue: "#132D67"
  badge-silver-light: "#AFB0AB"
  badge-silver-dark: "#949692"

  # Creamy academic field
  parchment-50: "#FCF7EC"
  parchment-100: "#F7EFD9"
  parchment-200: "#EEDDB7"

  # Semantic surfaces (warm-first inversion)
  background: "#FCF7EC"
  on-background: "#1F283D"
  surface: "#F7EFD9"
  surface-container-low: "#F2E6CB"
  surface-container: "#EEDDB7"
  surface-container-high: "#E9D3AB"
  surface-container-highest: "#E3CAA0"
  on-surface: "#1F283D"
  on-surface-variant: "#444C5F"

  # Role tokens
  primary: "#CFA86D"
  on-primary: "#132D67"
  primary-container: "#B3823F"
  on-primary-container: "#FCF7EC"

  secondary: "#AFB0AB"
  on-secondary: "#132D67"
  secondary-container: "#949692"
  on-secondary-container: "#FCF7EC"

  accent: "#132D67"
  on-accent: "#FCF7EC"
  accent-container: "#1E3C86"
  on-accent-container: "#FCF7EC"

  destructive: "#B3261E"
  on-destructive: "#FFFFFF"
  destructive-container: "#F9DEDC"
  on-destructive-container: "#410E0B"

  muted: "#E7D8B8"
  muted-foreground: "#5E6575"

  border: "#C9B99A"
  input: "#C9B99A"
  ring: "#132D67"

  # Sidebar roles
  sidebar-background: "#F2E6CB"
  sidebar-foreground: "#2A3550"
  sidebar-primary: "#132D67"
  sidebar-primary-foreground: "#FCF7EC"
  sidebar-accent: "#EEDDB7"
  sidebar-accent-foreground: "#132D67"
  sidebar-border: "#C9B99A"
  sidebar-ring: "#132D67"

  parchment: "#FCF7EC"

  # Banner stripe stops
  banner-top: "#CFA86D"
  banner-mid: "#F7EFD9"
  banner-bottom: "#132D67"

typography:
  display-lg:
    fontFamily: Cinzel
    fontSize: 60px
    fontWeight: "700"
    lineHeight: 68px
    letterSpacing: 0.01em
  display-md:
    fontFamily: Cinzel
    fontSize: 48px
    fontWeight: "700"
    lineHeight: 56px
    letterSpacing: 0.01em
  headline-lg:
    fontFamily: Cormorant Garamond
    fontSize: 36px
    fontWeight: "600"
    lineHeight: 42px
    letterSpacing: 0.005em
  headline-md:
    fontFamily: Cormorant Garamond
    fontSize: 28px
    fontWeight: "600"
    lineHeight: 34px
  headline-sm:
    fontFamily: Cormorant Garamond
    fontSize: 22px
    fontWeight: "600"
    lineHeight: 28px
  title-lg:
    fontFamily: Source Serif 4
    fontSize: 20px
    fontWeight: "600"
    lineHeight: 28px
  title-md:
    fontFamily: Source Serif 4
    fontSize: 17px
    fontWeight: "600"
    lineHeight: 24px
  body-lg:
    fontFamily: Source Serif 4
    fontSize: 17px
    fontWeight: "400"
    lineHeight: 28px
  body-md:
    fontFamily: Source Serif 4
    fontSize: 15px
    fontWeight: "400"
    lineHeight: 24px
  body-sm:
    fontFamily: Source Serif 4
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  label-lg:
    fontFamily: Cinzel
    fontSize: 15px
    fontWeight: "600"
    lineHeight: 20px
    letterSpacing: 0.03em
  label-md:
    fontFamily: Cinzel
    fontSize: 13px
    fontWeight: "600"
    lineHeight: 18px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Cinzel
    fontSize: 12px
    fontWeight: "600"
    lineHeight: 16px
    letterSpacing: 0.05em

rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.625rem
  lg: 0.75rem
  xl: 1rem
  "2xl": 1.25rem
  full: 9999px

spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  "2xl": 32px
  "3xl": 40px
  container-padding: 32px
  container-max-width: 1400px
  section-gap: 16px
  card-padding: 24px
  card-gap: 12px

elevation:
  sm: "0 1px 2px 0 rgba(19, 45, 103, 0.06)"
  DEFAULT: "0 1px 3px 0 rgba(19, 45, 103, 0.12), 0 1px 2px -1px rgba(19, 45, 103, 0.10)"
  md: "0 4px 8px -2px rgba(19, 45, 103, 0.16), 0 2px 4px -2px rgba(19, 45, 103, 0.12)"
  card: "0 20px 34px -24px rgba(19, 45, 103, 0.20)"
  banner: "0 16px 30px -20px rgba(19, 45, 103, 0.28)"
  lg: "0 10px 40px rgba(19, 45, 103, 0.10)"

motion:
  duration-fast: 150ms
  duration-DEFAULT: 200ms
  duration-slow: 300ms
  easing-DEFAULT: ease-out
  easing-in-out: ease-in-out
  accordion-down: "accordion-down 200ms ease-out"
  accordion-up: "accordion-up 200ms ease-out"

components:
  nav-bar:
    background: "linear-gradient(to bottom, #CFA86D 0%, #F7EFD9 88%, #132D67 88%, #132D67 100%)"
    textColor: "{colors.accent}"
    typography: "{typography.title-lg}"
    shadow: "{elevation.banner}"
    height: 64px
    padding: 16px
    position: fixed

  card-funding-default:
    backgroundColor: "{colors.surface}"
    borderColor: "rgba(19, 45, 103, 0.28)"
    rounded: "{rounded.lg}"
    padding: "{spacing.card-padding}"
    shadow: "{elevation.sm}"
    transition: "shadow 200ms ease-out, border-color 200ms ease-out, background-color 200ms ease-out"

  card-funding-hover:
    borderColor: "{colors.accent}"
    shadow: "{elevation.md}"
    backgroundColor: "#F2E6CB"

  card-funding-selected:
    backgroundColor: "#EEDDB7"
    borderColor: "{colors.accent}"
    shadow: "{elevation.md}"

  card-funding-expired:
    backgroundColor: "#E6DFC9"
    borderColor: "{colors.badge-silver-dark}"
    opacity: "0.60"

  card-title-chip:
    backgroundColor: "{colors.primary}"
    borderColor: "rgba(19, 45, 103, 0.22)"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    typography: "{typography.headline-sm}"
    padding: "8px 16px"

  badge-grade:
    backgroundColor: "rgba(19, 45, 103, 0.12)"
    textColor: "{colors.accent}"
    borderColor: "rgba(19, 45, 103, 0.24)"
    rounded: "{rounded.full}"
    typography: "{typography.label-sm}"
    padding: "2px 8px"

  badge-grade-inactive:
    backgroundColor: "transparent"
    textColor: "#6B7280"
    borderColor: "#949692"

  chip-deadline:
    backgroundColor: "{colors.primary-container}"
    borderColor: "rgba(19, 45, 103, 0.30)"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.md}"
    typography: "{typography.body-sm}"
    padding: "8px"

  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    padding: "10px 24px"
    height: 40px
    transition: "background-color 200ms ease-out"

  button-primary-hover:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"

  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    padding: "10px 24px"
    height: 40px

  button-accent-hover:
    backgroundColor: "{colors.accent-container}"

  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    borderColor: "{colors.border}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    height: 40px

  button-ghost-hover:
    backgroundColor: "rgba(19, 45, 103, 0.08)"
    textColor: "{colors.accent}"

  button-icon-circular:
    backgroundColor: "rgba(19, 45, 103, 0.16)"
    borderColor: "rgba(19, 45, 103, 0.28)"
    rounded: "{rounded.full}"
    size: 45px
    shadow: "{elevation.lg}"
    padding: "10px"

  input-field:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.on-surface}"
    borderColor: "{colors.border}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.lg}"
    height: 40px
    padding: "8px 12px 8px 40px"
    placeholderColor: "{colors.muted-foreground}"

  input-field-focus:
    borderColor: "{colors.accent}"
    ring: "2px solid rgba(19, 45, 103, 0.35)"

  card-filter-panel:
    backgroundColor: "#F2E6CB"
    borderColor: "rgba(19, 45, 103, 0.24)"
    rounded: "{rounded.DEFAULT}"
    maxWidth: 350px

  dropdown-menu:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.DEFAULT}"
    shadow: "{elevation.md}"
    minWidth: 224px

  dropdown-separator:
    backgroundColor: "rgba(19, 45, 103, 0.18)"

  checkbox-filter:
    backgroundColor: "rgba(19, 45, 103, 0.12)"
    rounded: "{rounded.sm}"

  checkbox-filter-hover:
    backgroundColor: "{colors.accent}"

  separator:
    backgroundColor: "rgba(19, 45, 103, 0.16)"
    height: 1px

  sidebar:
    backgroundColor: "{colors.sidebar-background}"
    textColor: "{colors.sidebar-foreground}"
    borderColor: "{colors.sidebar-border}"
    width: 256px

  sidebar-item-active:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-accent-foreground}"
    rounded: "{rounded.DEFAULT}"

  banner:
    background: "linear-gradient(to bottom, #CFA86D 0%, #F7EFD9 84%, #132D67 84%, #132D67 100%)"
    textColor: "{colors.accent}"
    shadow: "{elevation.banner}"
    padding: "16px"
    height: 64px
---

## Brand and Style

This visual system is intentionally inverted around the Wits badge: warm parchment
and golden tones form the field, while deep blue and silver operate as accents,
structure, and authority signals.

The emotional target is academic legacy. The interface should feel like a modern
research register set on archival paper: ceremonial, trusted, and quietly prestigious.
The color mood is warm and human first, not sterile. Blue appears as decisive
punctuation in controls, focus states, and key hierarchy markers.

## Colors

The palette uses the badge swatches below as the source of truth:

- Deep gold: #B3823F
- Light gold: #CFA86D
- Heraldic blue: #132D67
- Light silver: #AFB0AB
- Dark silver: #949692

These values are remapped into role-based tokens with a warm-first hierarchy:

- Primary and primary-container are golden (#CFA86D and #B3823F).
- Background and surface family are creamy parchment values (#FCF7EC through #E3CAA0).
- Accent is blue (#132D67) for interactive emphasis.
- Silver supports neutrals, borders, and subdued states.

Use opacity variants of accent blue for hover and low-emphasis overlays:

- rgba(19, 45, 103, 0.08) for ghost hover
- rgba(19, 45, 103, 0.12) for chips and check states
- rgba(19, 45, 103, 0.28) for borders that need stronger definition

## Typography

Typography should evoke institutional legacy and regality.

- Display and ceremonial labels: Cinzel
- Headlines: Cormorant Garamond
- Reading text and form content: Source Serif 4

This stack balances gravitas with readability:

- Cinzel carries formal authority for banners, labels, and large moments.
- Cormorant Garamond gives headings editorial elegance.
- Source Serif 4 keeps long-form descriptions and form guidance clear and comfortable.

Avoid geometric modern sans styles for primary identity moments.

## Layout and Spacing

The layout remains a two-panel master-detail structure at desktop width:

- Left panel: scrollable listing and control area.
- Right panel: detailed reading and action context.
- Fixed top bar: 64px height.

Spacing follows a 4px base unit. Common operational spacing:

- 12px for compact rhythm inside dense card metadata
- 16px for row and control separation
- 24px for card body padding

## Elevation and Depth

Depth is produced by blue-tinted ambient shadow over warm surfaces.

- Background layer: #FCF7EC
- Card layer: #F7EFD9
- Emphasis layer: #EEDDB7 with accent borders

Shadows are soft and wide, never harsh black. This keeps the system feeling
archival and tactile instead of digital-neon.

## Shapes

Corners are conservative and institutional:

- Default interactive radius: 0.75rem
- Inner chips: 0.625rem
- Full pills only for small categorization badges and circular icon controls

Do not apply full-pill geometry to major CTA blocks.

## Components

### Navigation Bar

The navigation bar uses a warm-to-blue ceremonial band:

- Gold and parchment dominate the bar face.
- A blue rule anchors the lower edge.
- Typography reads in blue for a crest-like signature quality.

### Funding Card

Cards are warm parchment containers with blue edge logic:

- Default: warm surface with low blue border
- Hover: stronger blue border and slightly deepened warm background
- Selected: deeper parchment and clear blue emphasis

### Buttons

- Primary buttons are gold with blue text.
- Accent buttons are blue with parchment text.
- Ghost buttons keep transparent backgrounds and blue text.

### Inputs and Search

Inputs sit on creamy parchment fields with silver-gold borders.
Focus rings are blue, not gold, to align interactive emphasis to accent tone.

### Tags and Badges

Grade badges use blue-tinted translucent fills over warm cards.
Inactive badges shift toward silver-neutral states.

### Dropdowns and Panels

Floating panels use warm surfaces and blue separators, maintaining continuity
with the parchment field while preserving contrast.

### Toasts and System Messaging

System feedback should inherit warm neutrals by default and reserve blue for
informational emphasis and destructive red only for true error states.
