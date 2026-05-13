---
name: News Media Tracker
colors:
  badge-gold-deep: '#8C6C3A'
  badge-gold-light: '#D8AD68'
  badge-blue: '#132D67'
  badge-silver-light: '#B9C0CA'
  badge-silver-dark: '#7A8595'

  background: '#0B1020'
  on-background: '#F4EFE6'
  surface: '#11182A'
  surface-container-low: '#131D31'
  surface-container: '#172337'
  surface-container-high: '#1D2A41'
  surface-container-highest: '#233353'
  on-surface: '#F7F2E8'
  on-surface-variant: '#B1BBCB'

  primary: '#D8AD68'
  on-primary: '#0B1020'
  primary-container: '#8C6C3A'
  on-primary-container: '#FFF4DA'

  secondary: '#B9C0CA'
  on-secondary: '#0B1020'
  secondary-container: '#344155'
  on-secondary-container: '#EEF3F8'

  accent: '#8FAEFF'
  on-accent: '#0B1020'
  accent-container: '#132D67'
  on-accent-container: '#EEF2FF'

  destructive: '#D66B66'
  on-destructive: '#0B1020'
  destructive-container: '#3A1716'
  on-destructive-container: '#FFDAD8'

  muted: '#182436'
  muted-foreground: '#93A0B4'

  border: '#2B3952'
  input: '#2B3952'
  ring: '#8FAEFF'

  sidebar-background: '#0F1726'
  sidebar-foreground: '#E7ECF5'
  sidebar-primary: '#D8AD68'
  sidebar-primary-foreground: '#0B1020'
  sidebar-accent: '#16233A'
  sidebar-accent-foreground: '#E7ECF5'
  sidebar-border: '#27344B'
  sidebar-ring: '#8FAEFF'

  parchment: '#11182A'

  banner-top: '#D8AD68'
  banner-mid: '#1B2740'
  banner-bottom: '#132D67'

  surface-dim: '#0B1020'
  surface-bright: '#1F2B41'
  surface-container-lowest: '#090F1C'
  inverse-surface: '#F4EFE6'
  inverse-on-surface: '#0B1020'
  outline: '#73809A'
  outline-variant: '#33415A'
  surface-tint: '#D8AD68'
  inverse-primary: '#7A5A24'
  tertiary: '#AFC3FF'
  on-tertiary: '#0B1020'
  tertiary-container: '#1D335F'
  on-tertiary-container: '#DCE6FF'
  error: '#FF7E7A'
  on-error: '#0B1020'
  error-container: '#551B1A'
  on-error-container: '#FFE5E3'
  primary-fixed: '#E4C38D'
  primary-fixed-dim: '#D8AD68'
  on-primary-fixed: '#2A1A00'
  on-primary-fixed-variant: '#5E430D'
  secondary-fixed: '#CBD2DB'
  secondary-fixed-dim: '#AAB5C5'
  on-secondary-fixed: '#101722'
  on-secondary-fixed-variant: '#364155'
  tertiary-fixed: '#D8E1FF'
  tertiary-fixed-dim: '#AFC3FF'
  on-tertiary-fixed: '#06122F'
  on-tertiary-fixed-variant: '#27407B'
  surface-variant: '#1A2436'

typography:
  display-lg:
    fontFamily: Cinzel
    fontSize: 60px
    fontWeight: '700'
    lineHeight: 68px
    letterSpacing: 0.01em
  display-md:
    fontFamily: Cinzel
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: 0.01em
  headline-lg:
    fontFamily: Cormorant Garamond
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 42px
    letterSpacing: 0.005em
  headline-md:
    fontFamily: Cormorant Garamond
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
  headline-sm:
    fontFamily: Cormorant Garamond
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  title-lg:
    fontFamily: Source Serif 4
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Source Serif 4
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Source Serif 4
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Source Serif 4
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Source Serif 4
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Cinzel
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.03em
  label-md:
    fontFamily: Cinzel
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Cinzel
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em

rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.625rem
  lg: 0.75rem
  xl: 1rem
  '2xl': 1.25rem
  full: 9999px

spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  '2xl': 32px
  '3xl': 40px
  container-padding: 32px
  container-max-width: 1400px
  section-gap: 16px
  card-padding: 24px
  card-gap: 12px

elevation:
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.35)'
  DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.42), 0 1px 2px -1px rgba(0, 0, 0, 0.35)'
  md: '0 4px 8px -2px rgba(0, 0, 0, 0.46), 0 2px 4px -2px rgba(0, 0, 0, 0.38)'
  card: '0 20px 34px -24px rgba(0, 0, 0, 0.65)'
  banner: '0 16px 30px -20px rgba(19, 45, 103, 0.48)'
  lg: '0 10px 40px rgba(0, 0, 0, 0.44)'

motion:
  duration-fast: 150ms
  duration-DEFAULT: 200ms
  duration-slow: 300ms
  easing-DEFAULT: ease-out
  easing-in-out: ease-in-out
  accordion-down: 'accordion-down 200ms ease-out'
  accordion-up: 'accordion-up 200ms ease-out'

components:
  nav-bar:
    background: 'linear-gradient(to bottom, #0F1726 0%, #11182A 82%, #132D67 82%, #132D67 100%)'
    textColor: '{colors.on-surface}'
    typography: '{typography.title-lg}'
    shadow: '{elevation.banner}'
    height: 56px
    padding: 12px
    position: fixed

  card-funding-default:
    backgroundColor: '{colors.surface}'
    borderColor: 'rgba(143, 174, 255, 0.18)'
    rounded: '{rounded.lg}'
    padding: '{spacing.card-padding}'
    shadow: '{elevation.sm}'
    transition: 'shadow 200ms ease-out, border-color 200ms ease-out, background-color 200ms ease-out'

  card-funding-hover:
    borderColor: '{colors.accent}'
    shadow: '{elevation.md}'
    backgroundColor: '#162033'

  card-funding-selected:
    backgroundColor: '#172337'
    borderColor: '{colors.accent}'
    shadow: '{elevation.md}'

  card-funding-expired:
    backgroundColor: '#12192A'
    borderColor: '{colors.badge-silver-dark}'
    opacity: '0.65'

  card-title-chip:
    backgroundColor: '{colors.primary}'
    borderColor: 'rgba(143, 174, 255, 0.22)'
    textColor: '{colors.on-primary}'
    rounded: '{rounded.md}'
    typography: '{typography.headline-sm}'
    padding: '8px 16px'

  badge-grade:
    backgroundColor: 'rgba(143, 174, 255, 0.16)'
    textColor: '{colors.accent}'
    borderColor: 'rgba(143, 174, 255, 0.24)'
    rounded: '{rounded.full}'
    typography: '{typography.label-sm}'
    padding: '2px 8px'

  badge-grade-inactive:
    backgroundColor: 'transparent'
    textColor: '#91A0B8'
    borderColor: '{colors.badge-silver-dark}'

  chip-deadline:
    backgroundColor: '{colors.primary-container}'
    borderColor: 'rgba(143, 174, 255, 0.28)'
    textColor: '{colors.on-primary-container}'
    rounded: '{rounded.md}'
    typography: '{typography.body-sm}'
    padding: '8px'

  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label-md}'
    rounded: '{rounded.lg}'
    padding: '10px 24px'
    height: 40px
    transition: 'background-color 200ms ease-out'

  button-primary-hover:
    backgroundColor: '{colors.primary-fixed-dim}'
    textColor: '{colors.on-primary}'

  button-accent:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    typography: '{typography.label-md}'
    rounded: '{rounded.lg}'
    padding: '10px 24px'
    height: 40px

  button-accent-hover:
    backgroundColor: '{colors.accent-container}'
    textColor: '{colors.on-accent-container}'

  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.on-surface}'
    borderColor: '{colors.border}'
    typography: '{typography.label-md}'
    rounded: '{rounded.lg}'
    height: 40px

  button-ghost-hover:
    backgroundColor: 'rgba(143, 174, 255, 0.08)'
    textColor: '{colors.on-surface}'

  button-icon-circular:
    backgroundColor: 'rgba(143, 174, 255, 0.14)'
    borderColor: 'rgba(143, 174, 255, 0.28)'
    rounded: '{rounded.full}'
    size: 45px
    shadow: '{elevation.lg}'
    padding: '10px'

  input-field:
    backgroundColor: '{colors.surface-container-low}'
    textColor: '{colors.on-surface}'
    borderColor: '{colors.border}'
    typography: '{typography.body-lg}'
    rounded: '{rounded.lg}'
    height: 40px
    padding: '8px 12px 8px 40px'
    placeholderColor: '{colors.muted-foreground}'

  input-field-focus:
    borderColor: '{colors.accent}'
    ring: '2px solid rgba(143, 174, 255, 0.35)'

  card-filter-panel:
    backgroundColor: '{colors.surface-container-low}'
    borderColor: 'rgba(143, 174, 255, 0.20)'
    rounded: '{rounded.DEFAULT}'
    maxWidth: 350px

  dropdown-menu:
    backgroundColor: '{colors.surface}'
    borderColor: '{colors.border}'
    rounded: '{rounded.DEFAULT}'
    shadow: '{elevation.md}'
    minWidth: 224px

  dropdown-separator:
    backgroundColor: 'rgba(255, 255, 255, 0.10)'

  checkbox-filter:
    backgroundColor: 'rgba(143, 174, 255, 0.14)'
    rounded: '{rounded.sm}'

  checkbox-filter-hover:
    backgroundColor: '{colors.accent}'

  separator:
    backgroundColor: 'rgba(255, 255, 255, 0.10)'
    height: 1px

  sidebar:
    backgroundColor: '{colors.sidebar-background}'
    textColor: '{colors.sidebar-foreground}'
    borderColor: '{colors.sidebar-border}'
    width: 256px

  sidebar-item-active:
    backgroundColor: '{colors.sidebar-accent}'
    textColor: '{colors.sidebar-accent-foreground}'
    rounded: '{rounded.DEFAULT}'

  banner:
    background: 'linear-gradient(to bottom, #D8AD68 0%, #1B2740 84%, #132D67 84%, #132D67 100%)'
    textColor: '{colors.on-primary}'
    shadow: '{elevation.banner}'
    padding: '16px'
    height: 56px
---

## Brand and Style

This app keeps the Wits badge language, but the working surface is dark by default.
The goal is not a generic dark theme. It should feel like a night shift research
register: quiet, authoritative, and still visibly tied to the gold and blue brand.

Use the dark canvas as the field, then reserve gold for priority actions and blue
for focus, relationships, and system emphasis. Silver and blue-gray neutrals carry
most structural surfaces so the interface stays legible without becoming sterile.

The design source of truth remains the monorepo root DESIGN.md. This app-specific
layer only narrows that system to the actual News Media Tracker surface.
Mockups are directional. Implementation owns the real route structure, data shape,
and component constraints.

## Application Scope

The app opens directly into the working queue. There is no separate marketing or
landing page in the product experience.

The main screen is a single workspace with three modes:

- Form mode for annotation and capture
- Graph mode for relationship inspection
- Table mode for dense review and scanning

The queue of unannotated articles stays visible as the entry point. Selecting a
queue item activates the form. Graph and table are alternate views of the same
underlying records, not separate destinations.

Configuration belongs outside the main workspace, in settings or administration.
Do not bring the configuration surface into the core annotation flow unless the
user explicitly asks for it.

## Workspace Rules

The top bar should stay minimal. It only needs to hold the product identity, the
mode switch, search or filter controls, sync state, and the settings entry.
Avoid filling it with extra navigation that fragments the workflow.

The workspace should preserve context when switching between modes:

- Queue selection remains stable
- Search and filters apply to graph and table views
- Form and graph should feel like two renderings of the same review task
- Table view may live inside the same shell or as a nearby alternative, but it
  should not introduce a separate landing path

The layout is a left queue plus right workspace composition on desktop. At smaller
sizes the queue may collapse, but the selection and mode state should remain clear.

## Dark Mode Rules

Dark mode should feel like the existing brand turned inward, not inverted by
random black surfaces. Base backgrounds sit in deep blue-black and slate values.
Cards, panels, and menus step upward by a few tonal levels rather than jumping to
pure white or flat gray.

Gold is the main warmth signal in the dark theme. Use it for primary actions,
selected titles, and the most important cues. Blue should remain the interactive
accent for focus rings, selection edges, graph relationships, and links between
records.

Avoid neon contrast, avoid purple bias, and avoid washed-out gray-on-gray panels.
The palette should stay warm enough to feel archival, but dark enough to support
long review sessions.

## Typography

Typography keeps the same formal serif structure as the root system:

- Cinzel for labels, utility chrome, and formal emphasis
- Cormorant Garamond for headlines and page hierarchy
- Source Serif 4 for form content, record text, and supporting copy

Do not switch the primary identity moments to a generic sans stack. Serif
hierarchy is part of the project language, even in dark mode.

## Elevation and Surfaces

Use blue-tinted and neutral shadows over dark surfaces. Depth should come from
tonal separation first, shadow second.

- Background is the darkest layer
- Surfaces step up gradually through panel, card, and floating-menu tones
- Active items lift through border color and subtle glow, not heavy blur

The graph canvas should feel like a dark workbench rather than a separate app.
Cards, filters, and panels should remain readable when the graph and table share
screen real estate.

## Components

### Navigation Bar

The header is a compact utility bar, not a full navigation system.
Keep it visually quiet and avoid decorative density.

### Queue

The queue is the first operational surface. It should read as a live worklist of
articles waiting for attention. Selection states must be obvious, but the visual
style should remain calm and utilitarian.

### Annotation Form

The form is the default active task once a queue item is chosen. It should feel
like a structured capture sheet, not a separate page.

### Graph View

The graph is the analysis layer for the same records. Search and filters must
continue to shape the graph, and selection should stay in sync with the form.
The graph should not feel detached from the work queue.

### Table View

The table is a compact review mode for scanning and comparing records. It can be
embedded in the same shell if that is the simplest stable implementation.

### Settings and Configuration

Settings belong behind a deliberate control and should not crowd the main shell.
Any configuration that changes application behavior should live here rather than
in the workspace header.

### Buttons and Inputs

Primary actions use gold. Secondary actions use blue or neutral outlines. Inputs
sit on dark surface containers with strong but restrained focus rings.

### Tags and Status

Use silver-gray for passive labels, gold for priority or active states, and blue
for selected or linked states. Error states should remain rare and unmistakable.

## Designer and Implementarian Contract

The designer supplies the intent, composition, and hierarchy. The implementarian
maps that intent to actual routes, data, and runtime behavior.

When mockups overstate the navigation surface, the implementation should collapse
that surface to the smallest truthful version that still preserves the intended
workflow. When the mockup omits a real operational need, the implementation should
add it without breaking the visual language.

Verify each change against the rendered result. Do not assume parity from the
mockup alone. Iterate until the active screen, the queue, and the mode switching
all read as one coherent workspace.

## Summary Rules

- No landing page.
- Queue first.
- Form, graph, and table are views, not destinations.
- Configuration stays outside the main workspace.
- Dark mode is the default visual system.
- Brand cues stay anchored to gold, blue, and silver.
