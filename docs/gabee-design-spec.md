# Gabee — Design & Brand Spec v0.1

Implementation-ready companion to **product-spec-v0.1 §15**. The product spec holds the *why*; this file holds the *how* — concrete tokens, components, and asset exports for the coding agent and any designer.

**Brand essence:** a warm, calm, trustworthy **robot bee** — a friendly guide, *not* an attention casino. One mascot does quadruple duty: brand mark, the letter **g**, app icon, and in-app companion.

---

## 1. Logo & wordmark

**Concept** — the robot bee *is* the letter "g" in **gabee**.

- **Wordmark**: "abee" set in **Mulish 800**; the "g" is a bespoke double-storey bee following the closed-loop "g" of **Open Sans** (geometric reference only — not a loaded webfont).
- **Construction**:
  - Head diameter = lowercase **"a"**, aligned on the x-height (the g's upper bowl).
  - Abdomen = **same size as the head**, sitting as the descender below the baseline (the g's lower loop).
  - Two **antennae** above the head with **cyan ball tips**.
  - Two dark **stripes** on the abdomen.
- **Wordmark has no wings** (keeps the lockup compact).
- **Clear space**: keep a margin ≥ the bee's head diameter on all sides.
- **Minimum width**: wordmark ≥ 96px; below that, use the icon (mascot) instead.

**Do / Don't**
- Do keep the body honey, eyes/antenna-tips cyan, visor + outlines ink.
- Don't recolour the body, stretch the lockup, add a sad/angry face, or place the ochre module colour directly behind the logo (too close to honey).

---

## 2. Mascot, standalone logo & app icon

- **Standalone logo / mascot / app icon** = full bee **with wings** (light-cyan `#BBEAF2` ellipses behind the body).
- **App icon**: winged bee centred on an ink `#20242E` rounded-square (radius `--radius-xl`).
- **Favicon / ≤ 16px**: use a **wingless** variant so the silhouette stays legible.

---

## 3. Expression system

The **logo face is fixed and robotic** (dark visor + two neutral cyan dots) on all brand surfaces. **In-app, the visor is a screen**: body/wings/antennae/stripes never move — only the cyan content of the visor changes.

| Token | Situation | Visor expression | Triggered by (analytics event, ref product §9.3) |
|---|---|---|---|
| `bee/idle` | Idle / home | two calm dots `••` | default |
| `bee/correct` | Correct answer | smiling eyes `◠◠` | answer correct |
| `bee/celebrate` | Level complete | star eyes `✦✦` | `code_level_solved` / level cleared |
| `bee/encourage` | After a wrong answer | supportive **wink** | answer wrong |
| `bee/focus` | Question on screen | dots looking up | question shown |

- **Wrong-answer state is encouraging — never sad or shaming** (ref product §6.3).
- **Motion**: cross-fade/morph the visor content over `--motion-base` (200ms), ease-out. Celebration may be slightly longer but **must not flash or strobe**. Respect `prefers-reduced-motion` (swap to instant state change).
- Extendable later: idle blink, screen pulse while the voiceover speaks — without touching the body.

---

## 4. Colour system

Colour is a **wayfinding** device, not a symbol. Each module keeps its colour permanently; tiles **always pair colour with an icon + label**, so colour is reinforcement, never the only cue (covers colour-blind users).

### 4.1 Module colours

| Token | Module | Colour | Hex | Text on it |
|---|---|---|---|---|
| `--module-numbers` | Numbers | Blue | `#1F6FEB` | white |
| `--module-words` | Words | Magenta | `#D6336C` | white |
| `--module-keyboard` | Keyboard | Ochre | `#C99A0E` | **ink** |
| `--module-code` | Code | Violet | `#7B2FF7` | white |
| `--module-translation` | Translation | Terracotta | `#C75D28` | white |

### 4.2 Brand & interface

| Token | Role | Hex | Text on it |
|---|---|---|---|
| `--color-brand` | Brand (honey) | `#FFB400` | **ink** |
| `--color-ink` | Text / visor / outlines | `#20242E` | white |
| `--color-accent` | Accent / bee eyes | `#2BD4E6` | **ink** |
| `--color-wing` | Wings | `#BBEAF2` | ink |
| `--surface` | Page surface | `#FFFFFF` | ink |
| `--surface-muted` | Muted panel | `#F7F8FA` | ink |
| `--border` | Hairline / divider | `#E6E8EE` | — |
| `--text` | Primary text | `#20242E` | — |
| `--text-muted` | Secondary text | `#6B7280` | — |

### 4.3 Feedback (reserved — never a module colour)

| Token | Meaning | Hex |
|---|---|---|
| `--feedback-correct` | Correct | `#3F7A2E` |
| `--feedback-retry` | Try again | `#E5322B` |

### 4.4 Usage rules & watch-points

- **Red & green are feedback only** — never module identity. Keeps right/wrong unambiguous and avoids a red+green colour-blind clash between modules.
- **Honey is the brand.** Ochre (Keyboard) is the closest hue; verify legibility next to the bee and desaturate toward olive (~`#B8901C`) if it muddies.
- **Cyan is the accent/eyes**, not a module colour.
- The "correct" celebration may lean on **honey + the star-eye bee** rather than green alone.
- **Text-on-colour**: use **ink** on honey, ochre, cyan; **white** on blue, magenta, violet, terracotta, green, red.

---

## 5. Typography

- **Mulish** — primary typeface: wordmark ("abee", 800) **and all UI**. Rounded, friendly, legible at large sizes.
- **Open Sans** — reference for the bespoke "g" glyph only (not loaded as a webfont).
- Weights in use: 400 (body), 600 (labels/UI), 700 (subheads), 800 (display/wordmark).

**Type scale** (kid-facing minimum body = 18px; generous line-height):

| Token | Use | Size / line-height | Weight |
|---|---|---|---|
| `text-display` | Hero / wordmark | 56 / 60 | 800 |
| `text-h1` | Screen title | 36 / 44 | 800 |
| `text-h2` | Section | 28 / 36 | 700 |
| `text-h3` | Card title | 22 / 30 | 700 |
| `text-body-lg` | Kid prompts | 20 / 30 | 600 |
| `text-body` | Body | 18 / 28 | 400 |
| `text-label` | Buttons / labels | 16 / 24 | 600 |
| `text-caption` | Captions | 14 / 20 | 600 |

In any UI numerals, ensure `1 / l / I` and `0 / O` stay distinguishable.

---

## 6. Design tokens

### 6.1 Radius (rounded, generous)

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 8px | chips, small inputs |
| `--radius-md` | 14px | inputs, small cards |
| `--radius-lg` | 20px | buttons, cards |
| `--radius-xl` | 28px | module tiles, app icon |
| `--radius-pill` | 9999px | pills, the bee's visor |

### 6.2 Spacing (4px base)

`--space-1:4` · `--space-2:8` · `--space-3:12` · `--space-4:16` · `--space-5:20` · `--space-6:24` · `--space-8:32` · `--space-10:40` · `--space-12:48` · `--space-16:64`

### 6.3 Elevation (soft, low-contrast)

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(32,36,46,.06)` |
| `--shadow-md` | `0 6px 16px rgba(32,36,46,.10)` |
| `--shadow-lg` | `0 12px 32px rgba(32,36,46,.12)` |

### 6.4 Motion

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120ms | hovers, taps |
| `--motion-base` | 200ms | expression morph, transitions |
| `--motion-slow` | 320ms | celebration enter |
| `--easing` | `cubic-bezier(.2,.8,.2,1)` | default ease-out |

Always honour `prefers-reduced-motion`: no parallax, no looping attention-grabbers, no flashing.

### 6.5 CSS custom properties (drop-in `:root`)

```css
:root {
  /* brand & ui */
  --color-brand:#FFB400; --color-ink:#20242E; --color-accent:#2BD4E6; --color-wing:#BBEAF2;
  --surface:#FFFFFF; --surface-muted:#F7F8FA; --border:#E6E8EE; --text:#20242E; --text-muted:#6B7280;
  /* modules */
  --module-numbers:#1F6FEB; --module-words:#D6336C; --module-keyboard:#C99A0E;
  --module-code:#7B2FF7; --module-translation:#C75D28;
  /* feedback */
  --feedback-correct:#3F7A2E; --feedback-retry:#E5322B;
  /* radius */
  --radius-sm:8px; --radius-md:14px; --radius-lg:20px; --radius-xl:28px; --radius-pill:9999px;
  /* elevation */
  --shadow-sm:0 1px 2px rgba(32,36,46,.06);
  --shadow-md:0 6px 16px rgba(32,36,46,.10);
  --shadow-lg:0 12px 32px rgba(32,36,46,.12);
  /* motion */
  --motion-fast:120ms; --motion-base:200ms; --motion-slow:320ms;
  --easing:cubic-bezier(.2,.8,.2,1);
}
```

### 6.6 Tailwind theme mapping (excerpt)

```js
// tailwind.config — theme.extend
colors: {
  brand:'#FFB400', ink:'#20242E', accent:'#2BD4E6', wing:'#BBEAF2',
  module:{ numbers:'#1F6FEB', words:'#D6336C', keyboard:'#C99A0E', code:'#7B2FF7', translation:'#C75D28' },
  feedback:{ correct:'#3F7A2E', retry:'#E5322B' },
},
borderRadius:{ sm:'8px', md:'14px', lg:'20px', xl:'28px' },
fontFamily:{ sans:['Mulish','system-ui','sans-serif'] },
```

---

## 7. Component guidance

- **Module tile** — `--radius-xl`, large, themed with its module colour; always shows **icon + label** + (optionally) the bee. One module colour per screen context.
- **Primary button** — `--radius-lg`, large target, honey or the active module colour, ink/white text per the contrast rule, `--shadow-md`.
- **Bee companion** — persistent guide; map its expression to events per §3. Sits near the question/feedback area; never blocks content.
- **Feedback**
  - *Correct*: `--feedback-correct` accent **+ honey + star-eye bee**, brief positive copy.
  - *Try again*: `--feedback-retry` accent **+ wink bee**, gentle copy, **no penalty, no shaming** (ref product §6.3).

---

## 8. UI principles

- **Rounded everything**; soft shapes echo the bee.
- **Large targets, calm spacing**, one primary action per screen.
- **One module colour per context**; bee + honey + ink stay constant for cohesion.
- **No dark patterns** — no FOMO, no streak-guilt, no red-dot nagging (ref product §6.3); gamification stays content-neutral (ref product §6.1).
- **Desktop-first** (keyboard + mouse are learning objectives), but rounded/large enough to stay touch-friendly.

---

## 9. Accessibility

- **Contrast**: follow the text-on-colour rule (§4.4); target WCAG AA for body text. Ochre & cyan require ink text.
- **Never colour-only**: every module/feedback state also carries an icon + label/copy.
- **Target size**: ≥ 44px minimum; **≥ 56px recommended** for this age group.
- **Motion**: honour `prefers-reduced-motion`; no flashing/strobing.
- **Legible numerals/letters** in UI (`1/l/I`, `0/O`).

---

## 10. Asset export checklist

| Asset | Format | Notes |
|---|---|---|
| Wordmark | SVG | no wings; ink + honey + cyan |
| Mascot / standalone logo | SVG | **with wings** |
| App icon | SVG + PNG 1024 / 512 / 192 | winged bee on ink rounded-square |
| Apple touch icon | PNG 180 | winged, ink bg |
| Favicon | PNG/ICO 32 / 16 | **wingless** variant |
| Splash screen | SVG/PNG | bee + wordmark, surface or ink bg |
| Expression sheet | SVG (per state) or sprite | 5 visor states from §3 |
| Colour swatches | — | tokens from §4 |

---

*Source of truth for narrative & rationale: product-spec-v0.1 §15. Keep both files in sync if the identity changes.*
