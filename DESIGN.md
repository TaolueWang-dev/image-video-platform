# Image Video Platform UI Design Plan

## 1. Design Choice

### Chosen reference

- Primary reference: `claude`
- Secondary reference: `stripe`

### Why this fits

This project is not a pure payment site and not a pure developer tool. It is a Chinese-first AI workbench that combines:

- text-to-image generation
- text-to-video task tracking
- recharge and payment operations

The best fit is therefore a hybrid direction:

- use `claude` for the overall brand feeling, page atmosphere, typography hierarchy, and dark product surfaces
- use `stripe` selectively for payment-state clarity, operational cards, and denser structured data blocks

`cursor` scored well in the matcher, but it is too developer-tool oriented for this product. It would make the project feel more like an IDE than a consumer-facing AI generation workspace.

## 2. Core Product Positioning

This UI should feel like:

- an AI creation console
- a lightweight operations dashboard
- a product that is warm and editorial, not cyberpunk

This UI should not feel like:

- a dark hacker tool
- a generic SaaS admin template
- a fintech-first payment site

## 3. Visual Direction

### Overall mood

Warm canvas pages with dark embedded product panels.

The public-facing layer should feel calm, premium, and readable. The working areas should feel focused and tool-like, but still belong to the same visual system.

### Style summary

- warm cream backgrounds
- dark charcoal product panels
- coral primary actions
- serif-like display headlines paired with clean sans-serif UI text
- restrained shadows instead of neon glow
- rounded cards, but not overly soft pill-heavy shapes

## 4. Design Tokens

### Colors

#### Page foundation

- `--canvas: #faf9f5`
- `--canvas-soft: #f5f0e8`
- `--surface-card: #efe9de`
- `--hairline: #e6dfd8`
- `--hairline-soft: #ebe6df`

#### Text

- `--ink: #141413`
- `--body: #3d3d3a`
- `--body-strong: #252523`
- `--muted: #6c6a64`
- `--muted-soft: #8e8b82`

#### Primary brand accent

- `--primary: #cc785c`
- `--primary-active: #a9583e`
- `--on-primary: #ffffff`

#### Dark product surfaces

- `--surface-dark: #181715`
- `--surface-dark-elevated: #252320`
- `--surface-dark-soft: #1f1e1b`
- `--on-dark: #faf9f5`
- `--on-dark-soft: #a09d96`

#### Semantic accents

- `--accent-teal: #5db8a6`
- `--accent-amber: #e8a55a`
- `--success: #5db872`
- `--warning: #d4a017`
- `--error: #c64545`

### Typography

#### Display

Use an editorial Chinese-friendly serif or serif-like title face for large headings.

- Hero title: 48px to 64px
- Section title: 28px to 36px
- Tight line-height
- Slight negative letter spacing where appropriate

Suggested fallback stack:

```css
font-family: "Source Han Serif SC", "Noto Serif SC", serif;
```

#### UI and body

Use a clean sans-serif for controls, descriptions, labels, and supporting text.

- Body: 14px to 16px
- Labels: 13px to 14px
- Buttons: 14px

Suggested fallback stack:

```css
font-family: "Noto Sans SC", "PingFang SC", "Helvetica Neue", sans-serif;
```

#### Code and IDs

Use monospace for:

- model ids
- task ids
- callback payload snippets
- payment link or QR raw values

Suggested fallback stack:

```css
font-family: "JetBrains Mono", ui-monospace, monospace;
```

### Radius

- `--radius-sm: 6px`
- `--radius-md: 8px`
- `--radius-lg: 12px`
- `--radius-xl: 16px`

Avoid oversized capsule buttons and highly rounded admin-template shapes.

### Shadow

Use restrained warm shadows, not luminous tech glow.

Suggested treatment:

```css
box-shadow: 0 18px 40px rgba(20, 20, 19, 0.08);
```

For dark product panels:

```css
box-shadow: 0 24px 50px rgba(20, 20, 19, 0.18);
```

## 5. Layout Principles

### Global shell

- top navigation on warm canvas
- main content constrained to a centered container
- large section rhythm
- alternating light sections and dark functional surfaces

### Information hierarchy

- brand and route understanding first
- current account and system state second
- action area third
- historical records and ops context fourth

### Component philosophy

- cards should feel structured, not decorative
- status badges should be compact and legible
- forms should be quiet and subordinate to the main task
- result cards should feel more important than input controls

## 6. Page Plans

### Home

#### Role

A landing page merged with a lightweight workbench overview.

#### Structure

1. Top nav
2. Hero split layout
3. Account and system stats strip
4. Three route cards
5. Right-side ops summary column

#### Hero direction

Left side:

- large editorial headline
- short explanation of the platform
- primary CTA to image generation
- secondary CTAs to video and recharge

Right side:

- dark product preview card
- show account balance, recent task snapshot, and route summary

#### What to emphasize

- “一个地方管理图像、视频与充值”
- product clarity over technical novelty

### Image Page

#### Role

The primary creative workspace.

#### Structure

1. Shared top nav
2. Large dark thread panel on warm canvas
3. History stream
4. Follow-up context card
5. Sticky composer area

#### Interaction tone

The thread should feel like a creative session, not a support chat log.

#### Visual priorities

- generated images are the visual hero
- prompt history is secondary but still legible
- follow-up editing context should be obvious and tactile

### Video Page

#### Role

An operational generation flow where creation and task tracking are equally important.

#### Structure

1. Shared top nav
2. Intro header with status summary
3. Dark task thread panel
4. Sticky composer

#### Visual priorities

- current task status card near the top
- task metadata should be structured and easy to scan
- successful video result cards should be visually heavier than text-only updates

### Recharge Page

#### Role

A focused payment and balance operation page.

#### Structure

1. Shared top nav
2. Intro block
3. Balance and order metric strip
4. Main recharge form
5. Payment receipt/result card
6. Sidebar for account summary and recent orders

#### Borrow from Stripe

- cleaner metric cards
- tighter spacing for payment metadata
- stronger visual distinction between pending, paid, and failed states
- more structured receipt presentation

## 7. Component Mapping To Current Project

The current repo already has the right page split. The design change should preserve that structure.

### Existing files

- `public/index.html`
- `public/image.html`
- `public/video.html`
- `public/recharge.html`
- `public/styles.css`
- `public/app.js`

### What changes conceptually

- keep the multi-page architecture
- replace the current cold dark “cyber” palette with a warm editorial palette
- keep existing JS interactions and data flow
- redesign the visual system and information grouping around the current DOM structure

## 8. What To Borrow Literally

From `claude`:

- cream page background
- deep charcoal product panels
- coral CTA color
- editorial display hierarchy
- warm human-centered product tone

From `stripe`:

- compact metric card clarity
- stronger status and receipt formatting
- better payment-oriented information grouping

## 9. What To Adapt

Do not copy the reference brands directly.

Adaptations needed for this project:

- make the product more Chinese reading-friendly
- reduce long-form marketing copy
- prioritize task state, account state, and recent records
- let image and video outputs carry more visual weight than marketing illustrations
- let recharge stay operational, not luxury-fintech branded

## 10. Anti-Goals

Avoid these directions:

- neon gradients as the dominant brand system
- glassmorphism-heavy overlays
- oversized pill navigation everywhere
- developer IDE aesthetics dominating the product
- dark mode as the only identity

## 11. Implementation Priority

If this moves into code later, implement in this order:

1. Replace global tokens in `public/styles.css`
2. Rework typography and button hierarchy
3. Redesign home hero and route cards
4. Unify image/video thread panel styling
5. Refine recharge page with Stripe-like receipt clarity
6. Tune mobile spacing and stacking

## 12. Success Criteria

The redesign is successful if:

- the product reads as an AI creation platform first
- image/video/recharge feel like one system rather than three disconnected tools
- the UI feels calmer, warmer, and more premium than the current version
- payment information becomes clearer without taking over the whole brand
- the existing workflow remains intact while the visual identity becomes more intentional
