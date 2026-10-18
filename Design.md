---
name: Spotify
url: https://open.spotify.com/
colors:
  primary: '#1ed760'
  primary-hover: '#1db954' # (inferred from common Spotify green hover)
  primary-active: '#169942' # (inferred from common Spotify green active)
  background: '#121212'
  background-elevated: '#1f1f1f'
  background-highlight: '#2a2a2a'
  background-darkest: '#000000'
  text-primary: '#ffffff'
  text-secondary: '#b3b3b3'
  text-accent: '#9e9eff'
  text-negative: '#f3727f'
  border-dark: '#3b3b3b'
  focus-ring: 'rgb(54, 115, 212)'
  surface-gradient-start: '#8e69a3'
  surface-gradient-mid: '#c02030' # (inferred from screenshot)
  surface-gradient-end: '#183060'
typography:
  display:
    family: 'SpotifyMixUITitle'
    size: 24px
    weight: 400
    line-height: 1.2
  heading:
    family: 'SpotifyMixUITitle'
    size: 16px
    weight: 700
    line-height: 1.5
  body:
    family: 'SpotifyMixUI'
    size: 16px
    weight: 400
    line-height: 1.5
  body-small:
    family: 'SpotifyMixUI'
    size: 14px
    weight: 400
    line-height: 1.5
  caption:
    family: 'SpotifyMixUI'
    size: 12px
    weight: 400
    line-height: 1.5
  code:
    family: 'Times New Roman'
    size: 13px
    weight: 400
    line-height: 1.5
spacing:
  base: 4px
  scale: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48]
radius:
  sm: 2px
  md: 4px
  lg: 6px
  full: 9999px
elevation:
  card: 'rgba(0, 0, 0, 0.3) 0px 8px 8px 0px'
  overlay: 'rgba(0, 0, 0, 0.5) 0px 8px 24px 0px'
  modal-backdrop: '0 4px 12px 0 rgba(0,0,0,0.3)' # (from cssVariables --encore-overlay-box-shadow)
motion:
  duration-fast: '150ms'
  duration-base: '200ms'
  duration-medium: '300ms'
  duration-slow: '400ms'
  easing-standard: 'cubic-bezier(0.4, 0, 0.2, 1)' # (inferred)
  easing-decelerate: 'cubic-bezier(0, 0, .2, 1)'
  easing-ease-in: 'ease-in'
components:
  button-primary:
    bg: '{colors.primary}'
    text: '{colors.background-darkest}'
    radius: '{radius.full}'
    padding: '12px 24px'
  card:
    bg: '{colors.background-elevated}'
    radius: '{radius.lg}'
    shadow: '{elevation.card}'
  input:
    bg: '{colors.background-elevated}'
    text: '{colors.text-primary}'
    border: '1px solid {colors.border-dark}'
    radius: '{radius.sm}'
    padding: '12px 16px'
---

# Design System Inspired by Spotify

## Project typography choice

For music together, use **Pretendard Variable** for Korean text, headings, buttons, forms, and playlist content. Use **Outfit** as a restrained accent for the English wordmark and section labels such as `NOW PLAYING` and `SHARED PLAYLIST`. This project choice replaces the `SpotifyMixUI` and `SpotifyMixUITitle` family names in the reference below; those fonts are not bundled with the app. Keep the system font fallbacks in `public/design.css` when web fonts are unavailable. Load Pretendard's variable dynamic subset and Outfit through the stylesheets in `public/index.html`.

## 1. Visual Theme & Atmosphere
Spotify's design system is characterized by a deep, immersive dark mode aesthetic, primarily leveraging a `#121212` background contrasted with crisp `#ffffff` text and vibrant `#1ed760` accents. The interface is highly organized into distinct content sections, utilizing ample `32px` padding and a clean grid structure to present album art and artist profiles. Subtle CSS animations detected across the platform contribute to a fluid user experience, particularly on hover interactions and state changes.

The visual identity is reinforced by the consistent application of rounded corners, with `9999px` radius for primary buttons and avatars, and `6px` for content cards, contributing to a modern and approachable feel. A distinctive gradient banner, transitioning from `#8e69a3` to `#183060`, appears at the bottom of the screen, providing a unique visual anchor for promotional content. Iconography is predominantly monochrome, using `#ffffff` for clarity against the dark backdrop, with the Spotify green often reserved for interactive elements like play buttons.

**Key Characteristics**
- Dark interface with `#121212` background.
- Vibrant `#1ed760` green for primary actions.
- `SpotifyMixUI` font for clear readability.
- Consistent `9999px` rounded buttons.
- Generous `32px` spacing for content separation.
- Subtle CSS animations for interactive feedback.
- Gradient banner from `#8e69a3` to `#183060`.

## 2. Color Palette & Roles
Spotify's color palette is built around a dark theme, utilizing a core green accent for interactivity and a nuanced grayscale for structure and text.

-   **Primary**
    -   `primary: #1ed760` — The iconic Spotify Green, used for primary call-to-action buttons, active states, and interactive elements like play icons.
    -   `primary-hover: #1db954` — A slightly darker shade of Spotify Green, applied to primary buttons on hover for visual feedback.
    -   `primary-active: #169942` — An even darker green, indicating a pressed state for primary interactive elements.
-   **Accent Colors**
    -   `text-accent: #9e9eff` — A light purple-blue, used sparingly for specific text highlights or secondary interactive elements.
    -   `surface-gradient-start: #8e69a3` — The starting purple hue of the promotional banner gradient at the bottom of the screen.
    -   `surface-gradient-mid: #c02030` — A mid-point red hue within the promotional banner gradient, inferred from the screenshot.
    -   `surface-gradient-end: #183060` — The ending dark blue hue of the promotional banner gradient.
-   **Interactive**
    -   `focus-ring: rgb(54, 115, 212)` — A bright blue used for accessible focus outlines around interactive elements.
-   **Neutral Scale**
    -   `background: #121212` — The dominant dark background color for the main content area and overall application.
    -   `background-elevated: #1f1f1f` — A slightly lighter dark gray, used for card backgrounds, sidebars, and other elevated content containers.
    -   `background-highlight: #2a2a2a` — A subtle highlight gray, often used for hover states on non-primary interactive elements or subtle dividers.
    -   `background-darkest: #000000` — Pure black, used for the top navigation bar and sometimes as a deeper shadow or background for specific sections.
    -   `text-primary: #ffffff` — Pure white, used for primary text, headings, and icons against dark backgrounds.
    -   `text-secondary: #b3b3b3` — A muted light gray, used for secondary text, metadata, and less prominent information.
    -   `text-negative: #f3727f` — A soft red, designated for error messages or negative feedback.
    -   `border-dark: #3b3b3b` — A dark gray, used for subtle borders on inputs, dividers, or outlines on dark surfaces.

## 3. Typography Rules
Spotify's typography emphasizes clarity and readability within its dark interface, using two primary font families to establish a clear hierarchy.

-   **Font Family**:
    -   Primary: `SpotifyMixUI`, `Helvetica Neue`, `helvetica`, `arial`, `Hiragino Sans`, `Hiragino Kaku Gothic ProN`, `Meiryo`, `MS Gothic`, `Apple Color Emoji`, `Segoe` (sans-serif system stack)
    -   Headings: `SpotifyMixUITitle`, `CircularSp-Arab`, `CircularSp-Hebr`, `CircularSp-Cyrl`, `CircularSp-Grek`, `CircularSp-Deva`, `Helvetica Neue`, (sans-serif system stack)
    -   Monospace: `Times New Roman`, `serif` (fallback for code or specific content)
-   **Hierarchy**:
    -   **Display/H1**: `SpotifyMixUITitle` `24px` `400` · line-height `1.2` · tracking `none` · Used for prominent section titles like "Trending songs".
    -   **H2**: `SpotifyMixUITitle` `16px` `700` · line-height `1.5` · tracking `none` · Used for sidebar titles such as "Your Library".
    -   **Body**: `SpotifyMixUI` `16px` `400` · line-height `1.5` · tracking `none` · Standard text for paragraphs and general content.
    -   **Body Small**: `SpotifyMixUI` `14px` `400` · line-height `1.5` · tracking `none` · Used for secondary information, descriptions, and smaller interactive labels.
    -   **Caption**: `SpotifyMixUI` `12px` `400` · line-height `1.5` · tracking `none` · For metadata, timestamps, and subtle contextual information.
    -   **Code/Mono**: `Times New Roman` `13px` `400` · line-height `1.5` · tracking `none` · (Inferred, used for specific technical text or as a fallback).
-   **Principles**
    -   **Legibility on Dark**: Prioritize high contrast text colors (`#ffffff`, `#b3b3b3`) against dark backgrounds (`#121212`, `#1f1f1f`) to ensure readability in a low-light UI.
    -   **Clear Hierarchy**: Utilize `SpotifyMixUITitle` for all headings to establish a strong visual hierarchy, reserving `SpotifyMixUI` for body and smaller text.
    -   **Consistent Line-Height**: Maintain a consistent line-height of `1.5` for body and caption text to improve scanning and comprehension.
    -   **Purposeful Weight**: Employ `700` weight sparingly for emphasis in headings (e.g., "Your Library") and `400` for general content.

## 4. Component Stylings

### Buttons

#### Primary Button
A prominent, fully rounded button with a vibrant green background and dark text, used for primary calls-to-action.
```css
.button-primary {
  background-color: var(--color-primary, #1ed760);
  color: var(--color-background-darkest, #000000);
  font-family: var(--typography-body-family, 'SpotifyMixUI'), sans-serif;
  font-size: 16px;
  font-weight: 700;
  padding: 12px 24px;
  border: none;
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  transition: background-color var(--motion-duration-base, 200ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1)), transform var(--motion-duration-base, 200ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1));
}

.button-primary:hover {
  background-color: var(--color-primary-hover, #1db954); /* inferred from common Spotify green hover */
  transform: scale(1.04); /* from cssVariables --encore-button-hover-scale */
}

.button-primary:active {
  background-color: var(--color-primary-active, #169942); /* inferred from common Spotify green active */
  transform: scale(1);
}

.button-primary:disabled {
  background-color: var(--color-primary, #1ed760);
  opacity: 0.7; /* inferred from screenshot */
  cursor: not-allowed;
  transform: scale(1);
}
```

#### Secondary Button
A dark button with white text and a subtle border, used for secondary actions like "Create playlist" or "Browse podcasts".
```css
.button-secondary {
  background-color: var(--color-background-elevated, #1f1f1f);
  color: var(--color-text-primary, #ffffff);
  font-family: var(--typography-body-family, 'SpotifyMixUI'), sans-serif;
  font-size: 16px;
  font-weight: 400;
  padding: 12px 24px;
  border: 1px solid var(--color-border-dark, #3b3b3b); /* inferred from screenshot */
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  transition: background-color var(--motion-duration-base, 200ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1)), border-color var(--motion-duration-base, 200ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1));
}

.button-secondary:hover {
  background-color: var(--color-background-highlight, #2a2a2a); /* inferred from screenshot */
  border-color: var(--color-text-primary, #ffffff); /* inferred from screenshot */
}

.button-secondary:active {
  background-color: var(--color-background, #121212); /* inferred from screenshot */
  border-color: var(--color-text-primary, #ffffff);
}

.button-secondary:disabled {
  background-color: var(--color-background-elevated, #1f1f1f);
  color: var(--color-text-secondary, #b3b3b3);
  border-color: var(--color-border-dark, #3b3b3b);
  opacity: 0.5; /* inferred from screenshot */
  cursor: not-allowed;
}
```

#### Ghost Button
A text-only button with a transparent background, typically used for navigation or less prominent actions like "Premium" or "Sign up".
```css
.button-ghost {
  background-color: transparent;
  color: var(--color-text-secondary, #b3b3b3);
  font-family: var(--typography-body-family, 'SpotifyMixUI'), sans-serif;
  font-size: 16px;
  font-weight: 400;
  padding: 8px 16px; /* inferred from screenshot */
  border: none;
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  transition: color var(--motion-duration-fast, 150ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1)), background-color var(--motion-duration-fast, 150ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1));
}

.button-ghost:hover {
  color: var(--color-text-primary, #ffffff);
  background-color: var(--color-background-highlight, #2a2a2a); /* inferred from screenshot */
}

.button-ghost:active {
  color: var(--color-text-primary, #ffffff);
  background-color: var(--color-background-elevated, #1f1f1f); /* inferred from screenshot */
}

.button-ghost:disabled {
  color: var(--color-text-secondary, #b3b3b3);
  opacity: 0.5; /* inferred from screenshot */
  cursor: not-allowed;
}
```

### Cards & Containers

#### Standard Card
A dark gray container with rounded corners, used for displaying album art, artist profiles, or other content blocks. On hover, it subtly elevates with a shadow.
```css
.card {
  background-color: var(--color-background-elevated, #1f1f1f);
  color: var(--color-text-primary, #ffffff);
  border-radius: var(--radius-lg, 6px);
  padding: var(--spacing-scale-4, 16px); /* inferred from screenshot */
  box-shadow: none;
  transition: box-shadow var(--motion-duration-medium, 300ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1));
}

.card:hover {
  box-shadow: var(--elevation-card, rgba(0, 0, 0, 0.3) 0px 8px 8px 0px);
}
```

#### Bottom Promotional Banner
A full-width container at the bottom of the viewport, featuring a distinct purple-to-blue gradient background and a subtle upward shadow.
```css
.promotional-banner {
  background: linear-gradient(90deg, var(--color-surface-gradient-start, #8e69a3) 0%, var(--color-surface-gradient-mid, #c02030) 50%, var(--color-surface-gradient-end, #183060) 100%); /* inferred from screenshot */
  color: var(--color-text-primary, #ffffff);
  padding: var(--spacing-scale-4, 16px) var(--spacing-scale-6, 24px); /* inferred from screenshot */
  border-radius: var(--radius-md, 4px); /* inferred from screenshot */
  box-shadow: 0 -2px 10px rgba(0,0,0,0.3); /* inferred from screenshot */
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-scale-4, 16px);
}
```

### Inputs & Forms

#### Text Input
A dark input field with light text, featuring a subtle border and a distinct blue focus ring for accessibility.
```css
.input-text {
  background-color: var(--color-background-elevated, #1f1f1f);
  color: var(--color-text-primary, #ffffff);
  font-family: var(--typography-body-family, 'SpotifyMixUI'), sans-serif;
  font-size: 16px;
  font-weight: 400;
  padding: 12px 16px;
  border: 1px solid var(--color-border-dark, #3b3b3b);
  border-radius: var(--radius-sm, 2px);
  outline: none;
  transition: border-color var(--motion-duration-fast, 150ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1)), box-shadow var(--motion-duration-fast, 150ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1));
}

.input-text::placeholder {
  color: var(--color-text-secondary, #b3b3b3);
}

.input-text:focus {
  border-color: var(--color-focus-ring, rgb(54, 115, 212));
  box-shadow: 0 0 0 2px var(--color-focus-ring, rgb(54, 115, 212)); /* inferred from screenshot */
  outline: 5px solid var(--color-focus-ring, rgb(54, 115, 212)); /* from pseudoStates.focus */
}

.input-text:disabled {
  background-color: var(--color-background-elevated, #1f1f1f);
  color: var(--color-text-secondary, #b3b3b3);
  border-color: var(--color-border-dark, #3b3b3b);
  cursor: not-allowed;
  opacity: 0.6; /* inferred from screenshot */
}
```

#### Form Label
Standard white text label for form fields, ensuring clear association with inputs.
```css
.form-label {
  color: var(--color-text-primary, #ffffff);
  font-family: var(--typography-body-family, 'SpotifyMixUI'), sans-serif;
  font-size: 14px;
  font-weight: 400;
  margin-bottom: var(--spacing-scale-1, 4px); /* inferred from screenshot */
  display: block;
}
```

#### Checkbox/Radio
Custom-styled checkbox/radio with a dark background and a vibrant green checked state.
```css
.checkbox-container {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.checkbox-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.checkbox-custom {
  width: 20px; /* inferred from screenshot */
  height: 20px; /* inferred from screenshot */
  border: 1px solid var(--color-border-dark, #3b3b3b);
  border-radius: var(--radius-sm, 2px);
  background-color: var(--color-background-elevated, #1f1f1f);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--motion-duration-base, 200ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1)), border-color var(--motion-duration-base, 200ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1));
}

.checkbox-input:checked + .checkbox-custom {
  background-color: rgb(29, 185, 84); /* from pseudoStates.checked */
  border-color: rgb(29, 185, 84);
}

.checkbox-input:hover:not(:disabled) + .checkbox-custom {
  border-color: var(--color-primary, #1ed760); /* inferred from screenshot */
}

.checkbox-input:checked:hover:not(:disabled) + .checkbox-custom {
  background-color: rgb(30, 215, 96); /* from pseudoStates.checked */
  border-color: rgb(30, 215, 96);
}

.checkbox-input:disabled + .checkbox-custom {
  background-color: var(--color-background-elevated, #1f1f1f);
  border-color: var(--color-border-dark, #3b3b3b);
  opacity: 0.6; /* inferred from screenshot */
  cursor: not-allowed;
}
```

### Navigation

#### Top Navigation Bar
The main header bar, featuring a dark background, search input, and user actions.
```css
.top-navigation-bar {
  background-color: var(--color-background-darkest, #000000);
  color: var(--color-text-primary, #ffffff);
  padding: var(--spacing-scale-4, 16px) var(--spacing-scale-6, 24px); /* inferred from screenshot */
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px; /* inferred from screenshot */
  position: sticky;
  top: 0;
  z-index: 5; /* inferred from screenshot */
}
```

#### Navigation Link
Links used within the main navigation, typically in the sidebar or top bar, with a muted default state and a bright white hover/active state.
```css
.nav-link {
  color: var(--color-text-secondary, #b3b3b3);
  font-family: var(--typography-body-family, 'SpotifyMixUI'), sans-serif;
  font-size: 16px;
  font-weight: 400;
  text-decoration: none;
  padding: var(--spacing-scale-2, 8px) var(--spacing-scale-3, 12px); /* inferred from screenshot */
  border-radius: var(--radius-sm, 2px); /* inferred from screenshot */
  transition: color var(--motion-duration-fast, 150ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1)), background-color var(--motion-duration-fast, 150ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1));
}

.nav-link:hover {
  color: var(--color-text-primary, #ffffff);
  background-color: var(--color-background-highlight, #2a2a2a); /* inferred from screenshot */
}

.nav-link.active,
.nav-link[aria-current="page"] {
  color: var(--color-text-primary, #ffffff);
  font-weight: 700; /* inferred from screenshot */
  background-color: var(--color-background-elevated, #1f1f1f); /* inferred from screenshot */
}
```

#### Dropdown Menu
(Not explicitly visible in screenshot, but inferred from common UI patterns)
A dark, elevated container for menu items, with subtle padding and rounded corners.
```css
.dropdown-menu {
  background-color: var(--color-background-elevated, #1f1f1f);
  color: var(--color-text-primary, #ffffff);
  border-radius: var(--radius-md, 4px);
  padding: var(--spacing-scale-1, 4px);
  box-shadow: var(--elevation-overlay, rgba(0, 0, 0, 0.5) 0px 8px 24px 0px);
  min-width: 180px; /* inferred from common practice */
  z-index: 3;
}

.dropdown-menu-item {
  display: block;
  padding: var(--spacing-scale-2, 8px) var(--spacing-scale-3, 12px);
  color: var(--color-text-primary, #ffffff);
  text-decoration: none;
  font-family: var(--typography-body-family, 'SpotifyMixUI'), sans-serif;
  font-size: 14px;
  border-radius: var(--radius-sm, 2px);
  transition: background-color var(--motion-duration-fast, 150ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1));
}

.dropdown-menu-item:hover {
  background-color: var(--color-background-highlight, #2a2a2a);
}
```

### Links

#### Standard Link
A muted gray link, typically for secondary information or navigation, turning white on hover.
```css
.link-standard {
  color: var(--color-text-secondary, #b3b3b3);
  text-decoration: none;
  transition: color var(--motion-duration-fast, 150ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1));
}

.link-standard:hover {
  color: var(--color-text-primary, #ffffff);
  text-decoration: underline; /* inferred from common practice */
}

.link-standard:visited {
  color: var(--color-text-secondary, #b3b3b3); /* inferred, no specific visited style observed */
}
```

#### Secondary Link
A white link used for "Show all" actions, changing to Spotify Green on hover.
```css
.link-secondary {
  color: var(--color-text-primary, #ffffff);
  text-decoration: none;
  font-weight: 700; /* inferred from screenshot */
  transition: color var(--motion-duration-fast, 150ms) var(--motion-easing-standard, cubic-bezier(0.4, 0, 0.2, 1));
}

.link-secondary:hover {
  color: var(--color-primary, #1ed760);
  text-decoration: underline; /* inferred from common practice */
}

.link-secondary:visited {
  color: var(--color-text-primary, #ffffff); /* inferred, no specific visited style observed */
}
```

### Badges
(none observed in source)

## 5. Layout Principles

-   **Spacing System**: Spotify employs a `4px` base unit for its spacing system, creating a predictable and harmonious layout.
    -   Base `4px` → `0, 4, 8, 12, 16, 20, 24, 32, 40, 48`
    -   `0px`: No spacing, for tightly grouped elements.
    -   `4px`: Smallest increment, for spacing between icon and text, or very tight element groups.
    -   `8px`: Minor spacing, for padding within small components, or between closely related items.
    -   `12px`: Standard small spacing, for padding within buttons or input fields.
    -   `16px`: Medium spacing, for padding around cards, or between list items.
    -   `20px`: Slightly larger spacing, for internal component separation.
    -   `24px`: Section padding, horizontal gutters, or significant vertical separation.
    -   `32px`: Generous section padding, major vertical content breaks, or sidebar margins.
    -   `40px`: Larger content separation.
    -   `48px`: Maximum common spacing, for large content blocks or page margins.
-   **Grid & Container** *(Suggested — not measured)*: _Note: container widths and column counts are not extracted from the source. The values below are reasonable defaults inferred from the visible layout density._
    -   Max Width: `1440px` (inferred from screenshot viewport)
    -   Columns: `12` (inferred)
    -   Gutter: `24px` (inferred)
    -   Section Padding: `32px` (inferred)
-   **Whitespace Philosophy**: Spotify utilizes ample dark whitespace to create a sense of focus and calm, allowing content (especially album art and artist images) to breathe and stand out. This generous padding and margin strategy prevents visual clutter, making the interface easy to navigate despite the rich media content.
-   **Border Radius Scale**:
    -   `sm: 2px` — Minimal rounding for subtle elements like input fields.
    -   `md: 4px` — Standard rounding for general containers and interactive elements.
    -   `lg: 6px` — More pronounced rounding for larger cards and content blocks.
    -   `full: 9999px` — Complete pill-shape for primary buttons, avatars, and certain interactive icons.

## 6. Depth & Elevation
Spotify uses subtle shadows and a clear z-index hierarchy to create depth on its dark interface, highlighting interactive elements and overlays without being overly distracting.

-   **Flat (z-0)**: `none` — Default state for most static content and background elements.
-   **Content (z-1)**: `none` — Standard content blocks like cards, which gain a shadow on hover.
-   **Interactive (z-2)**: `rgba(0, 0, 0, 0.3) 0px 8px 8px 0px` — Used for hovered cards or active interactive components to give a subtle lift.
-   **Overlay (z-3)**: `rgba(0, 0, 0, 0.5) 0px 8px 24px 0px` — Applied to dropdowns, tooltips, and other temporary overlays.
-   **Sidebar (z-4)**: `0 4px 12px 0 rgba(0,0,0,0.3)` — The left sidebar, appearing above main content.
-   **Modal (z-5)**: `0 4px 12px 0 rgba(0,0,0,0.3)` — For modal dialogs and full-screen overlays, ensuring they are always on top.

**Shadow Philosophy**: Shadows are primarily used to indicate interactivity and hierarchy on hover or for elevated components. They are dark and diffused, seamlessly blending with the dark background to provide depth without harsh lines, making elements appear to float slightly above the main interface.

## 7. Do's and Don'ts

### Do's
-   Use `{colors.primary}` (`#1ed760`) for primary call-to-action buttons like "Create playlist".
-   Ensure body text in `{colors.text-primary}` (`#ffffff`) on `{colors.background}` (`#121212`) maintains AAA contrast (18.73:1).
-   Apply `{radius.full}` (`9999px`) to all interactive buttons for a consistent rounded aesthetic.
-   Maintain `{spacing.scale[8]}` (`32px`) as the primary vertical padding between major content sections.
-   Use `{colors.text-secondary}` (`#b3b3b3`) for secondary information, like artist names below album titles.
-   Set prominent section titles, such as "Trending songs", in `SpotifyMixUITitle 24px 400`.
-   Utilize `{colors.background-elevated}` (`#1f1f1f`) for card backgrounds to provide visual separation from the main `{colors.background}`.
-   Apply `{motion.duration-medium}` (`300ms`) with `{motion.easing-ease-in}` for smooth transitions on interactive elements.
-   Use `{colors.focus-ring}` (`rgb(54, 115, 212)`) with a `5px` outline for all `:focus` states on interactive elements.
-   Ensure navigation links use `{colors.text-secondary}` (`#b3b3b3`) by default, changing to `{colors.text-primary}` (`#ffffff`) on hover.

### Don'ts
-   Avoid using `{colors.primary}` (`#1ed760`) for large blocks of text due to poor contrast on light backgrounds (2.44:1 fails AA on `#f8f8f8`).
-   Do not introduce any spacing values outside the defined `{spacing.scale}` (e.g., 10px or 18px).
-   Never use `SpotifyMixUI` for display headings; reserve `SpotifyMixUITitle` for this purpose to maintain brand hierarchy.
-   Do not introduce additional shadow styles beyond the defined `{elevation.card}` or `{elevation.overlay}`.
-   Avoid placing `{colors.text-secondary}` (`#b3b3b3`) on `{colors.background-elevated}` (`#1f1f1f`) for critical information, as its contrast ratio is lower (7.03:1).
-   Do not use sharp corners; adhere to the `{radius.md}` (`4px`) or `{radius.lg}` (`6px`) for most container elements.
-   Do not animate elements with durations shorter than `{motion.duration-fast}` (`150ms`) unless for critical feedback.
-   Avoid using `{colors.text-accent}` (`#9e9eff`) for general body text, reserving it for specific highlights.
-   Do not use `text-decoration: underline` for standard links by default; apply it only on hover.
-   Avoid using `{colors.text-negative}` (`#f3727f`) for non-error messages to prevent user confusion.

## 8. Responsive Behavior *(Suggested — not measured)*
_Note: breakpoints below are industry-standard recommendations, not measurements from the source. Adjust to the brand's actual media queries when implementing._

-   **Suggested Breakpoints**:
    -   **Mobile Small** (~375px): Primary navigation collapses to a hamburger menu; content stacks vertically.
    -   **Mobile Large** (~530px): (from `max-width: 530px`) Adjust padding to `16px`; hide secondary sidebar elements.
    -   **Tablet** (~896px): (from `max-width: 896px`) Left sidebar collapses to an icon-only view; content grid adjusts to 2-3 columns.
    -   **Desktop** (~1024px): (from `min-width: 1024px`) Full left sidebar visible; content grid expands to 4+ columns.
    -   **Desktop Large** (~1440px): Applies max content width of `1440px`; increases horizontal padding to `48px`.
-   **Touch Targets**:
    -   Interactive elements should have a minimum touch target size of `44px` by `44px` (inferred).
    -   Maintain a minimum `8px` spacing between touch targets to prevent accidental taps (inferred).
-   **Collapsing Strategy**:
    -   **Navigation**: The persistent left sidebar transitions to a compact icon-only view on tablets and a hamburger menu on smaller mobile screens.
    -   **Cards**: Content cards (albums, artists) reflow from a multi-column grid to 1-2 columns on smaller viewports.
    -   **Typography**: Display headings (`24px`) may scale down to `20px` on mobile to fit screen width.
    -   **Padding**: Horizontal page padding reduces from `32px` to `16px` on mobile to maximize content area.
    -   **Forms**: Input fields maintain their height but may become full-width on mobile.
    -   **Spacing**: Vertical spacing between major sections remains generous, but smaller `8px` gaps may reduce to `4px` where density is critical.

## 9. Agent Prompt Guide

-   **Quick Color Reference**
    -   primary: `#1ed760`
    -   primary-hover: `#1db954`
    -   primary-active: `#169942`
    -   background: `#121212`
    -   background-elevated: `#1f1f1f`
    -   background-highlight: `#2a2a2a`
    -   background-darkest: `#000000`
    -   text-primary: `#ffffff`
    -   text-secondary: `#b3b3b3`
    -   text-accent: `#9e9eff`
    -   text-negative: `#f3727f`
    -   border-dark: `#3b3b3b`
    -   focus-ring: `rgb(54, 115, 212)`
    -   surface-gradient-start: `#8e69a3`
    -   surface-gradient-mid: `#c02030`
    -   surface-gradient-end: `#183060`

-   **Iteration Guide**
    1.  Always use `{colors.primary}` (`#1ed760`) for main call-to-action buttons.
    2.  Set all body text to `SpotifyMixUI 16px 400` with `{colors.text-primary}` (`#ffffff`).
    3.  Apply `{spacing.scale[8]}` (`32px`) for major vertical content separation.
    4.  Ensure all interactive buttons have `{radius.full}` (`9999px`) for rounded corners.
    5.  Default card backgrounds are `{colors.background-elevated}` (`#1f1f1f`) with `{radius.lg}` (`6px`).
    6.  Primary buttons should have a height of `48px` (inferred) and `{padding: 12px 24px}`.
    7.  Input fields must include a `5px` `{colors.focus-ring}` (`rgb(54, 115, 212)`) outline on focus.
    8.  Navigation links default to `{colors.text-secondary}` (`#b3b3b3`) and turn `{colors.text-primary}` (`#ffffff`) on hover.
    9.  Use `{elevation.overlay}` (`rgba(0, 0, 0, 0.5) 0px 8px 24px 0px`) for all dropdowns and popovers.
    10. The bottom promotional banner uses a `90deg` linear gradient from `{colors.surface-gradient-start}` to `{colors.surface-gradient-end}`.
    11. On mobile, collapse the left sidebar into an icon-only view or hamburger menu.
    12. Ensure `{colors.text-primary}` (`#ffffff`) on `{colors.background}` (`#121212`) passes AAA contrast (18.73:1).
