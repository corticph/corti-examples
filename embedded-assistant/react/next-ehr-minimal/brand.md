You are refactoring this app to match Corti's internal design system. Apply the following brand guidelines exactly. Do not invent colours, fonts, or spacing values — only use what is specified below.

────────────────────────────────────────────────
COLOUR TOKENS
────────────────────────────────────────────────
Add the following CSS custom properties to your global stylesheet (globals.css or equivalent). These must exist in both :root (light mode) and .dark (dark mode).

:root {
  /* Backgrounds & Text */
  --background: 0 0% 100%;
  --foreground: 0 0% 6%;

  /* Surfaces */
  --card: 0 0% 100%;
  --card-foreground: 0 0% 6%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 6%;

  /* Brand & Accents */
  --primary: 0 0% 6%;
  --primary-foreground: 0 0% 100%;
  --secondary: 0 0% 100%;
  --secondary-foreground: 0 0% 6%;
  --accent: 0 0% 98%;
  --accent-foreground: 222 47% 11%;

  /* Muted */
  --muted: 0 0% 98%;
  --muted-foreground: 0 0% 41%;

  /* Feedback */
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;

  /* Primitives */
  --border: 0 0% 93%;
  --input: 0 0% 90%;
  --ring: 215 16% 47%;
  --radius: 0.5rem;

  /* Sidebar */
  --sidebar-background: 0 0% 98%;
  --sidebar-foreground: 240 5% 37%;
  --sidebar-primary: 0 0% 1%;
  --sidebar-primary-foreground: 0 0% 95%;
  --sidebar-accent: 0 0% 94%;
  --sidebar-accent-foreground: 0 0% 1%;
  --sidebar-border: 0 0% 78%;
  --sidebar-ring: 0 0% 35%;

  /* Semantic States */
  --variant-error-bg: 0 100% 97%;
  --variant-error-border: 0 93% 86%;
  --variant-error-text: 0 72% 37%;
  --variant-info-bg: 210 100% 97%;
  --variant-info-border: 210 100% 88%;
  --variant-info-text: 215 60% 23%;
  --variant-success-bg: 142 76% 97%;
  --variant-success-border: 142 61% 86%;
  --variant-success-text: 142 70% 28%;
  --variant-warning-bg: 38 100% 96%;
  --variant-warning-border: 38 94% 84%;
  --variant-warning-text: 30 92% 34%;

  /* Charts */
  --chart-1: 265 65% 46%;
  --chart-2: 204 86% 49%;

  /* ✦ Corti Signature Brand Colour */
  --corti-lime: 77 94% 53%;
  --corti-lime-foreground: 0 0% 6%;
}

.dark {
  --background: 0 0% 6%;
  --foreground: 0 0% 90%;
  --card: 0 0% 10%;
  --card-foreground: 0 0% 90%;
  --popover: 0 0% 10%;
  --popover-foreground: 0 0% 90%;
  --primary: 0 0% 100%;
  --primary-foreground: 0 0% 6%;
  --secondary: 0 0% 16%;
  --secondary-foreground: 0 0% 90%;
  --accent: 0 0% 16%;
  --accent-foreground: 0 0% 90%;
  --muted: 0 0% 16%;
  --muted-foreground: 0 0% 65%;
  --destructive: 0 72% 50%;
  --destructive-foreground: 0 0% 100%;
  --border: 0 0% 25%;
  --input: 0 0% 25%;
  --ring: 0 0% 100%;
  --sidebar-background: 0 0% 12%;
  --sidebar-foreground: 0 0% 90%;
  --sidebar-primary: 0 0% 100%;
  --sidebar-primary-foreground: 0 0% 6%;
  --sidebar-accent: 0 0% 16%;
  --sidebar-accent-foreground: 0 0% 90%;
  --sidebar-border: 0 0% 25%;
  --sidebar-ring: 0 0% 100%;
  --variant-error-bg: 0 60% 9%;
  --variant-error-border: 0 52% 28%;
  --variant-error-text: 0 68% 82%;
  --variant-info-bg: 222 67% 10%;
  --variant-info-border: 222 51% 28%;
  --variant-info-text: 210 20% 85%;
  --variant-success-bg: 150 40% 8%;
  --variant-success-border: 150 35% 28%;
  --variant-success-text: 140 36% 80%;
  --variant-warning-bg: 60 100% 6%;
  --variant-warning-border: 60 100% 18%;
  --variant-warning-text: 48 96% 78%;
  --chart-1: 264 97% 62%;
  --chart-2: 203 100% 60%;
  --corti-lime: 77 94% 53%;
  --corti-lime-foreground: 0 0% 6%;
}

Reference all colours via hsl(var(--token-name)) in Tailwind or inline styles. Never hardcode hex values.

────────────────────────────────────────────────
TYPOGRAPHY
────────────────────────────────────────────────
Two font families only:

1. Inter — all UI text, labels, headings, body copy.
   Load from Google Fonts: weights 400, 600, 700, 800, 900.

2. IBM Plex Mono — all numeric data, currency values, metric figures,
   monospace inputs, code snippets, IDs.
   Load from Google Fonts: weights 400, 500, 700.

No other font families are permitted. Apply IBM Plex Mono via
font-family: 'IBM Plex Mono', monospace wherever a number, currency
amount, or metric value is displayed.

────────────────────────────────────────────────
COMPONENT RULES
────────────────────────────────────────────────

Border radius:
  Default: rounded-lg (var(--radius) = 0.5rem)
  Pills/badges: rounded-full
  Inputs: rounded-md

Cards:
  bg: hsl(var(--card))
  text: hsl(var(--card-foreground))
  border: 1px solid hsl(var(--border))
  No drop shadows. No gradients. Flat surfaces only.

Buttons — primary CTA:
  bg: hsl(var(--primary))
  text: hsl(var(--primary-foreground))
  hover: opacity-90

Buttons — secondary/ghost:
  bg: transparent
  border: 1px solid hsl(var(--border))
  text: hsl(var(--foreground))

Signature accent (use sparingly — highlights, active states, key CTAs):
  bg: hsl(var(--corti-lime))
  text: hsl(var(--corti-lime-foreground))
  This is the electric lime (#b8f818). It is the only brand colour.
  Do not use it as a background for large surfaces.

Semantic state chips/banners (use the variant tokens above):
  Error   → variant-error-bg / variant-error-border / variant-error-text
  Info    → variant-info-bg / variant-info-border / variant-info-text
  Success → variant-success-bg / variant-success-border / variant-success-text
  Warning → variant-warning-bg / variant-warning-border / variant-warning-text

Tables:
  Header row: bg hsl(var(--muted)), text hsl(var(--muted-foreground)), font-weight 600
  Data cells: font-family IBM Plex Mono for all numeric columns
  Row hover: subtle bg shift (opacity-5 on foreground)
  Borders: 1px solid hsl(var(--border))

Sidebar (if present):
  bg: hsl(var(--sidebar-background))
  nav items: hsl(var(--sidebar-foreground))
  active item: hsl(var(--sidebar-primary)) with hsl(var(--sidebar-primary-foreground)) text
  active item may use hsl(var(--corti-lime)) as a left-border accent (3px)
  border-right: 1px solid hsl(var(--sidebar-border))

Charts (if using Recharts or similar):
  Series 1: hsl(var(--chart-1))  — purple
  Series 2: hsl(var(--chart-2))  — blue
  Positive/growth: hsl(var(--corti-lime))
  Negative/loss: hsl(var(--destructive))
  Grid lines: hsl(var(--border))
  Tick labels: IBM Plex Mono, hsl(var(--muted-foreground))

────────────────────────────────────────────────
ICONS
────────────────────────────────────────────────
Use Lucide React exclusively. No other icon libraries.
Size: 16px for inline/table icons, 20px for buttons, 24px for headings.
Colour: always inherit from the surrounding text token — never hardcode.

────────────────────────────────────────────────
DARK MODE
────────────────────────────────────────────────
The app must support both light and dark mode using the .dark class
on the root <html> element (next-themes pattern). Every colour used
must reference a CSS variable that has both a :root and .dark definition
from the token list above. Never hardcode colours that only work on
a white or dark background.

────────────────────────────────────────────────
WHAT NOT TO DO
────────────────────────────────────────────────
✗ No hardcoded hex or rgb colour values anywhere in the UI
✗ No Tailwind colour utilities (bg-blue-500, text-gray-700, etc.) —
  use CSS variable tokens instead
✗ No gradients, drop-shadows, or blur effects on surfaces
✗ No font families other than Inter and IBM Plex Mono
✗ No icon libraries other than Lucide React
✗ No border-radius above rounded-xl unless it is a pill/avatar
✗ Do not use --corti-lime as a large background surface