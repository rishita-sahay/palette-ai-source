# Palette AI

Colours in. Design systems out. First pass of the MVP described in `Palette_AI_PRD_v1.0`, styled with the Nestly design system.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 205 tests (Vitest), no API key needed
npm run build      # type-check + production build into dist/
```

Stack: React 18 + TypeScript + Vite, Tailwind CSS v4 (CSS-first `@theme` in `src/index.css`, no `tailwind.config.js`),
shadcn-style primitives on Radix (`src/components/ui`), Culori for all colour maths, Zustand with an undo/redo
history, LocalStorage. Everything runs client-side except one serverless route (`api/interpret.ts`) for AI interpretation.

## What works

One flow: start from a colour or a brief, and land on a single page with the palette, every shade and a live
preview. Four top tabs:

- **Preview** — colour cards (colour picker, HEX / RGB / HSL switch, copy, lock, drag to reorder, duplicate, delete, add), six
  harmony modes, regenerate unlocked. Every colour gets its 11-step OKLCH scale (50–950) automatically, shown as a
  row: strictly monotonic lightness, hue drift within 5°, gamut-mapped by chroma reduction. Select a colour or a
  shade to edit it beside the preview; "Adjust" on a row opens its curve, chroma and hue-shift controls. Success,
  warning, error and info scales are added with the first palette. The live preview is a mock app painted with the
  role tokens, with a light/dark switch and an AA contrast check for every text/background pair it uses.
  A brief is read by an AI model when the server has an API key (see "AI interpretation" below); otherwise the
  keyword lookup (`src/lib/colour-engine/prompt-keywords.ts`) runs and the UI labels the result "Keyword fallback used".
- **Code** — CSS variables, Tailwind v4 `@theme`, structured JSON, with or without role tokens. Preview, copy,
  download. Every output is re-read by a validator (`src/lib/validation/export-validators.ts`) and download is
  disabled if it fails.
- **Guide** — where each colour goes, the step to use for fills, borders and text, the best text colour on every
  shade, and do/don't rules. Built by `src/lib/guide` from fixed rules and WCAG contrast maths; no AI model writes it.
- **Brandkit** — a one-page A4 brand sheet (palette, shades, role tokens) as PDF or PNG, made in the browser.
  The preview, the PNG and the PDF are drawn from the same list of operations (`src/lib/brandkit`).

**Role tokens** (`src/lib/tokens/roles.ts`): background, surface, text, text-muted, border, primary, on-primary,
primary-soft, on-primary-soft, accent, on-accent and the feedback colours. Light roles point at scale steps chosen
by contrast. Dark roles are not copies: `src/lib/colour-engine/dark.ts` rebuilds each one from the palette in OKLCH
with a rule per kind of role (grounds, text, brand fills, tints, status), keeps the hue, and refines lightness until
every intended text/background pair reaches 4.5:1. The strategy (depth, elevation, chroma kept, neutral tint) comes
from the AI reading of the brief via `src/lib/interpretation/dark-strategy.ts`, or a default when there is none.

- **Workspace** — autosave to LocalStorage, undo/redo (Ctrl/⌘ Z, Ctrl/⌘ Shift Z), corrupted-data recovery.

## AI interpretation

A brief such as "a rainy evening, nostalgic, slightly melancholic but comforting" is interpreted by a model into
structured targets, resolved against a reference database, and passed to the colour engine. The model never outputs
colour values. Full description: `docs/INTERPRETATION.md`. Comparison with the keyword interpreter: `docs/EVALUATION.md`.

Works without any setup: everything else in the app, and briefs via the labelled keyword fallback.

Needs an API key, from either Anthropic (console.anthropic.com) or Google AI Studio (Gemini). Set whichever one
you have — only one is required:

1. Local: copy `.env.example` to `.env.local`, set `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`, run `npm run dev`.
2. Vercel: push the repo to GitHub, import it in Vercel (framework preset "Vite"), add the same variable under
   Settings → Environment Variables, deploy. `api/interpret.ts` becomes the serverless function automatically.

If both keys are set, Anthropic runs by default; set `AI_PROVIDER=gemini` to use Gemini instead. `AI_MODEL` overrides
the default model for whichever provider is active (`claude-haiku-5-5` for Anthropic, `gemini-3.8-flash` for Gemini).

Keys are read only on the server. Never give them a `VITE_` prefix and never commit `.env.local`. A key pasted into
a chat message or committed to a repo should be treated as exposed — rotate it (regenerate a fresh one and delete
the old one) in the provider's console.

Dataset licences and attribution: `data/PROVENANCE.md`.

## Not built yet

Editing the role-token mapping by hand (it is derived from the scales), custom themes beyond light and dark,
AAA and APCA checks.

Deferred by design: auth, collaboration, cloud sync, DTCG export, image-to-palette.

## Structure (PRD §23.2)

```
src/
  types/                 shared interfaces (PRD §24)
  lib/                   pure, UI-free logic
    colour-engine/       parse/convert, gamut, scale, harmony, palette, prompt-keywords
    contrast/            WCAG 2.2 ratio + classification
    tokens/              role tokens for light and dark, contrast pairs
    guide/               rule-based usage guide
    brandkit/            brand sheet layout, PDF writer, canvas renderer
    interpretation/      AI brief interpretation (see docs/INTERPRETATION.md)
    exporters/           css, tailwind-v4, json
    validation/          names (slug + DTCG-safe), export validators
  store/                 Zustand store, undo/redo, LocalStorage adapter
  components/            ui/ layout/ palette/ colour-scales/ preview/ interpretation/ exports/
  pages/                 PreviewPage, CodePage, GuidePage, BrandkitPage
tests/                   engine, interpretation, keyword-regression, workspace
```

## Scale algorithm, briefly

1. Base → OKLCH. The base keeps its exact value and sits on the step whose target lightness is closest.
2. Lightness per step comes from a named curve, remapped on each side of the base so the ramp stays monotonic.
3. Chroma follows an envelope that peaks in the mid-tones and falls toward 50 and 950.
4. Hue is held; an optional shift (±30° max) is spread across the ramp and is zero at the base.
5. Each step is brought into sRGB by reducing chroma only. OKLCH is stored at full precision; rounding happens
   only on display/export (HEX 6-digit; OKLCH as L% 2 dp, C 4 dp, H 2 dp).
