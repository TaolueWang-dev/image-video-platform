---
name: Luminous Forge
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#424754'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#727785'
  outline-variant: '#c2c6d6'
  surface-tint: '#005ac2'
  primary: '#0058be'
  on-primary: '#ffffff'
  primary-container: '#2170e4'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#5c5f61'
  on-secondary: '#ffffff'
  secondary-container: '#e0e3e5'
  on-secondary-container: '#626567'
  tertiary: '#4648d4'
  on-tertiary: '#ffffff'
  tertiary-container: '#6063ee'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#e0e3e5'
  secondary-fixed-dim: '#c4c7c9'
  on-secondary-fixed: '#191c1e'
  on-secondary-fixed-variant: '#444749'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h1:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  h2:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  container-max: 1280px
  gutter: 24px
---

## Brand & Style

This design system transitions the brand from a rigid, industrial identity to one that is welcoming, ethereal, and human-centric. The visual direction is a blend of **Soft Minimalism** and **Glassmorphism**, emphasizing clarity and breathability. 

The goal is to reduce cognitive load by eliminating unnecessary lines and heavy containers. The interface should feel like a premium digital workspace—open, light, and responsive to the user. Visual "pressure" is mitigated through high-key backgrounds and intentional negative space, creating an atmosphere of calm productivity.

## Colors

The palette is anchored by "Electric Cerulean," a more vibrant and energetic blue than traditional corporate navy. This is supported by a foundation of soft whites and subtle warm grays to prevent the interface from feeling cold or clinical.

- **Primary:** A vibrant, welcoming blue used for actions and key brand moments.
- **Secondary/Surface:** Soft whites and "Paper" grays used for large background areas to create a layered, airy effect.
- **Accents:** Occasional use of soft indigos to provide depth without adding visual noise.
- **Functional:** Success, Warning, and Error states utilize desaturated versions of their respective hues to maintain the soft aesthetic.

## Typography

The typography system prioritizes legibility and a friendly tone. **Plus Jakarta Sans** is used for headings; its slightly wider proportions and open apertures feel modern and optimistic. **Inter** is used for all functional body text and UI labels due to its exceptional readability and neutral, professional character.

- **Scale:** Generous vertical rhythm with increased line-heights (1.6x for body) to enhance the "airy" feel.
- **Contrast:** Headings use a deep charcoal rather than pure black to maintain softness.

## Layout & Spacing

This design system utilizes a **Fixed-Fluid Hybrid Grid**. Content is centered within a maximum container width to maintain focus, while background elements bleed to the edges.

The spacing philosophy follows a strict 8px geometric progression, but with a preference for the larger end of the scale. Padding within components should feel "oversized" compared to traditional enterprise software. Margins between major sections should be expansive (48px to 80px) to signify a premium, editorial-inspired layout.

## Elevation & Depth

Visual hierarchy is achieved through **Ambient Shadows** and **Tonal Layering** rather than borders.

- **Shadows:** Use extremely diffused, low-opacity shadows (e.g., `box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.04)`). Shadows should feel like a natural glow rather than a hard drop.
- **Glassmorphism:** Use subtle backdrop blurs (12px - 20px) on floating elements like navigation bars or modals to maintain a sense of context and depth.
- **Borders:** Reserved only for interactive states (focus) or extremely subtle separation using 1px strokes in light warm grays (#F1F5F9).

## Shapes

The shape language is defined by significant corner rounding. By using a "Rounded" (Level 2) approach, the UI sheds the aggressive sharpness of corporate software.

- **Standard Elements:** Buttons and input fields use a 0.5rem (8px) radius.
- **Containers:** Cards and modals use a 1.5rem (24px) radius to emphasize the "soft container" look.
- **Icons:** Should feature rounded terminals and consistent stroke weights to match the typeface.

## Components

- **Buttons:** High-contrast primary buttons with white text on the vibrant blue. Secondary buttons use a light blue ghost style or a subtle warm gray background. Hover states should involve a gentle upward "lift" via shadow expansion rather than a color darken.
- **Cards:** No borders. Use a pure white surface against a #F8FAFC background, paired with a soft ambient shadow. Internal padding should be 24px minimum.
- **Inputs:** Use a soft-gray filled background that transitions to a white background with a primary blue glow on focus.
- **Chips/Badges:** Pill-shaped with low-contrast background tints (e.g., 10% opacity of the status color) and high-contrast text.
- **Progressive Disclosure:** Use smooth transitions for accordions and dropdowns to reinforce the liquid, modern feel.
- **Navigation:** A floating "Island" style navigation bar with a subtle backdrop blur is recommended for high-tier landing pages.