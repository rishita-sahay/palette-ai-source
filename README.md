# Palette AI

Colours in. Design systems out. First pass of the MVP described in `Palette_AI_PRD_v1.0`, styled with the Nestly design system.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine, contrast and exporter tests (Vitest)
npm run build      # type-check + production build into dist/
```

Stack: React 18 + TypeScript + Vite, Tailwind CSS v4 (CSS-first `@theme` in `src/index.css`, no `tailwind.config.js`),
shadcn-style primitives on Radix (`src/components/ui`), Culori for all colour maths, Zustand with an undo/redo
history, LocalStorage. Everything runs client-side except one serverless route (`api/interpret.ts`) for AI interpretation.

## What works in this pass

- **Palette Studio** — palette from a base colour (HEX / RGB / HSL / picker) or from a brief. A brief is read by an
  AI model when the server has an API key (see "AI interpretation" below); otherwise the keyword lookup
  (`src/lib/colour-engine/prompt-keywords.ts`) runs and the UI labels the result "Keyword fallback used". Per-colour edit, lock/unlock, regenerate unlocked only, drag to reorder, duplicate, delete,
  add, rename, six harmony modes computed in OKLCH hue.
- **Colour Scale Generator** — 11-step OKLCH scale (50–950) per family: strictly monotonic lightness, hue drift
  within 5°, chroma reduced at the extremes, gamut-mapped by chroma reduction (Culori `clampChroma`). Edit and lock
  individual shades, change the base, three lightness curves, chroma and hue-shift controls, live component preview.
  Default feedback families (success, warning, error, info) plus custom families.
- **Developer Export** — CSS variables, Tailwind v4 `@theme`, structured JSON. Preview, copy, download. Every output
  is re-read by a validator (`src/lib/validation/export-validators.ts`) and download is disabled if it fails.
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
the default model for whichever provider is active (`claude-haiku-5-5` for Anthropic, `gemini-2.0-flash` for Gemini).

Keys are read only on the server. Never give them a `VITE_` prefix and never commit `.env.local`. A key pasted into
a chat message or committed to a repo should be treated as exposed — rotate it (regenerate a fresh one and delete
the old one) in the provider's console.

Dataset licences and attribution: `data/PROVENANCE.md`.

## Not built yet

Token Manager (semantic tokens), Theme Studio (light/dark mappings + preview), Accessibility dashboard.
The WCAG 2.2 contrast maths is already in `src/lib/contrast` and is used by the inspectors.

Deferred by design: auth, collaboration, cloud sync, DTCG export, image-to-palette.

## Structure (PRD §23.2)

```
src/
  types/                 shared interfaces (PRD §24)
  lib/                   pure, UI-free logic
    colour-engine/       parse/convert, gamut, scale, harmony, palette, prompt-keywords
    contrast/            WCAG 2.2 ratio + classification
    exporters/           css, tailwind-v4, json
    validation/          names (slug + DTCG-safe), export validators
  store/                 Zustand store, undo/redo, LocalStorage adapter
  components/            ui/ layout/ palette/ colour-scales/ exports/ (+ tokens/ themes/ accessibility/ reserved)
  pages/                 PaletteStudio, ColourScales, DeveloperExport, ComingNext
tests/                   engine.test.ts
```

## Scale algorithm, briefly

1. Base → OKLCH. The base keeps its exact value and sits on the step whose target lightness is closest.
2. Lightness per step comes from a named curve, remapped on each side of the base so the ramp stays monotonic.
3. Chroma follows an envelope that peaks in the mid-tones and falls toward 50 and 950.
4. Hue is held; an optional shift (±30° max) is spread across the ramp and is zero at the base.
5. Each step is brought into sRGB by reducing chroma only. OKLCH is stored at full precision; rounding happens
   only on display/export (HEX 6-digit; OKLCH as L% 2 dp, C 4 dp, H 2 dp).
