# How a brief becomes a palette

Palette AI reads a natural-language brief with an AI model, resolves what it understood against a
reference database, and hands numeric targets to the existing OKLCH colour engine. The model never
produces a colour value. When the model is not available, the original keyword interpreter runs
instead and the UI says so.

```
brief ─▶ (1) AI interpretation        server/   POST /api/interpret → validated JSON (words + 0–1 targets)
      ─▶ (2) descriptor resolution    src/lib/interpretation/descriptor-resolver.ts  → database entries + "unresolved"
      ─▶ (3) attribute resolution     src/lib/interpretation/attribute-resolver.ts   → final visual targets
      ─▶ (4) engine adapter           src/lib/interpretation/engine-adapter.ts       → seed parameters
      ─▶ existing colour engine       src/lib/colour-engine/                         → seeds, scales, gamut mapping
```

Steps 2–4 are pure functions that run in the browser. Each step lives in its own module and has its own tests.

## 1. AI interpretation (server side)

| File | Role |
|---|---|
| `api/interpret.ts` | Vercel Serverless Function. `POST` interprets; `GET` reports whether a key is configured. |
| `server/interpret-core.ts` | Framework-free handler: request validation, model call, reply validation, cache, rate limit. |
| `server/system-prompt.ts` | Instructions for the model. Bump `PROMPT_VERSION` when you change them. |
| `server/vite-dev-plugin.ts` | Mounts the same handler under `npm run dev` and `npm run preview`. |

- **Provider:** either the Anthropic Messages API or the Google Gemini `generateContent` API, both called with `fetch`
  (no SDK). Which one runs is decided by `resolveProvider()` in `server/interpret-core.ts`: whichever of
  `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` is set runs; if both are set, Anthropic runs unless `AI_PROVIDER=gemini`.
  Default model is `claude-haiku-5-5` for Anthropic or `gemini-2.0-flash` for Gemini; override either with `AI_MODEL`.
- **Structured output:** the model must answer by calling one tool/function whose input schema is generated from the
  Zod schema (`envelopeJsonSchema()`). Anthropic is forced to it with `tool_choice`; Gemini is forced to it with
  `function_calling_config: { mode: 'ANY' }`. Gemini's function-parameter schema is an OpenAPI subset with no
  `$ref`/`$defs`/`additionalProperties`, so `sanitizeForGemini()` inlines refs and drops unsupported keywords before
  the same Zod-derived schema is handed to it — both providers are constrained by the identical field set either way.
- **Validation:** the reply is validated with Zod on the server and again in the browser. Unknown fields, out-of-range
  numbers, wrong enum values and wrong types are rejected. Any string containing a HEX / rgb() / hsl() / oklch()
  value is rejected, so the model cannot smuggle colours in.
- **Prompt injection:** the brief is passed as data. The system prompt tells the model to treat instructions inside a
  brief as part of the brief. The only thing a reply can affect is a set of bounded numbers and short phrases.

### Environment variables

Set these in `.env.local` for development and in Vercel → Settings → Environment Variables for production.
None has a `VITE_` prefix, so none is bundled into browser code.

| Name | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | one of these two | Without either key, the app runs in labelled keyword-fallback mode. |
| `GEMINI_API_KEY` | one of these two | Used instead of Anthropic when `ANTHROPIC_API_KEY` is absent, or when `AI_PROVIDER=gemini`. |
| `AI_PROVIDER` | no | `anthropic` or `gemini`. Only needed when both keys are set and you want Gemini. |
| `AI_MODEL` | no | Model id. Default `claude-haiku-5-5` (Anthropic) or `gemini-2.0-flash` (Gemini). |
| `AI_TIMEOUT_MS` | no | Model timeout. Default 20000. |

### Schema

`src/lib/interpretation/schema.ts` holds the Phase 3 schema exactly as specified, plus a small sibling object:

- `interpretation` — the specified fields; every number is 0–1; `temperature` is one of five values; emotion `role` is `primary` or `secondary`.
- `resolution_hints` — `explicit_attributes` (which of temperature / lightness / chroma / contrast / hue the person stated outright)
  and `changed_attributes` (for refinements). Kept outside the interpretation so the core schema is unchanged.

Operational metadata is separate again (`InterpretationMeta` in `src/types`): `mode` (`ai` | `refined` | `fallback`),
`provider`, `model`, `schemaVersion`, `dbVersion`, `cached`, `fallbackReason`.

## 2. Descriptor resolution

`resolveDescriptors()` takes the vibes, emotions, aesthetic and sensory phrases and matches each to a database entry by
id, synonym, simple stem ("nostalgic" → nostalgia) or contained phrase ("rainy evening" → rainy).

- Anything in `negative_constraints` is resolved first and marked **avoided**. An avoided concept can never come back
  in as a positive association, whatever other field mentions it.
- Phrases with no match are returned as **unresolved** and shown to the user. No association is invented for them.
- Each match gets a weight: aesthetic 1.0, primary emotion 0.8, vibe 0.7, secondary emotion 0.5, sensory 0.4, multiplied by stated intensity.

## 3. Attribute resolution

Priority, highest first:

1. Explicit colour instructions and exclusions.
2. Visual requirements the person stated outright (`explicit_attributes`).
3. The model's reading of the whole brief.
4. Emotion and mood associations from the database.
5. Sensory associations from the database.
6. Engine defaults.

Rules that follow from it:

- **Stated values are used as given.** Associations are not consulted for them.
- **Associations only nudge.** For an unstated value, compatible associations (all within 0.30 of the contextual value)
  pull it by at most 30%.
- **No averaging across a contradiction.** If any matched association disagrees with the contextual value by more than
  0.30, the contextual value is kept whole and the UI notes that associations pointed elsewhere.
  ("Nostalgic but bright and colourful" stays bright and colourful.)
- **Avoided descriptors push away.** "Bold, not childish" moves contrast and chroma further from what "childish" looks
  like, in the direction the value already sits, unless the person fixed that value.
- **Hue:** named colours first, then hue families the model inferred, then the best-scoring database association
  (research-backed hues outrank inferred ones of similar weight; a warm-neutral or cool-neutral reading halves hues on
  the other side), then a default for the temperature.
- **Exclusions always win.** "No orange" excludes the whole orange hue range. A hue that lands in an excluded range is
  moved to the nearest hue that is at least 10° clear of it and still fits the temperature. The engine applies the same
  guard to every accent and to regenerated colours.
- **Harmony:** higher contrast and energy spread hues further apart (analogous → split-complementary → complementary / triadic).
- Constraints that were understood but cannot be enforced yet (for example "no grey") are listed as **unapplied**, never dropped silently.

## 4. Engine hand-off

`targetsToSeedParams()` maps lightness 0–1 to anchor L 0.36–0.82 and chroma 0–1 to anchor C 0.03–0.25, and passes
hue, harmony and neutral tint through. Two optional engine parameters were added to `palette.ts`:
`excludedHues` and `accentLightnessOffset`. Both default to off; with them off, engine output is byte-identical to
before (`tests/keyword-regression.*` checks this against a baseline taken from the pre-AI source).

## Fallback

`generateFromBrief()` in the store tries the AI path and, if it is not available, runs the unchanged keyword
interpreter. The result is always labelled:

| Situation | What the user sees |
|---|---|
| No server (static hosting) | "The AI service isn't available here." |
| No API key | "AI interpretation isn't set up on this deployment." |
| Timeout, rate limit, provider error, network failure | A sentence naming which. |
| Reply failed validation twice | "The AI reply didn't pass validation, so it wasn't used." |

In each case an amber "Keyword fallback used" notice sits above the palette's interpretation panel, with the reason.
A refinement of an AI-read palette that cannot reach the model leaves the palette unchanged and says why, because
re-reading the conversation with keywords would discard the context.

## Caching

- **Server:** in-memory, keyed by schema version + prompt version + model + normalised prompt + full refinement context.
  On serverless this lasts for the life of a warm instance.
- **Browser:** LocalStorage, last 40 interpretations, keyed by schema version + model + normalised prompt + refinement context.
- A refinement includes the previous interpretation in its key, so it can never return a result cached for a fresh brief.
- Database-dependent steps (2–4) are not cached. They are recomputed each time, so a new database version takes effect immediately.
- Normalisation is lower-casing and whitespace collapsing only.

## Refinement

The palette stores a `BriefRecord`: the original prompt (verbatim), every refinement in order, the latest validated
interpretation, the resolved targets and the metadata. A refinement sends all of that to the model with an instruction to
change only what was asked. Locked colours are kept; unlocked colours are re-derived from the new targets.

## Vibe Intelligence Database

Built by `npm run build:db` (`scripts/build-vibe-db.mjs`) into `src/lib/vibe-db/vibe-db.generated.json`.
Every record carries a `source` id and an evidence `tier`. See `data/PROVENANCE.md` for licences and attribution.

| Tier | Meaning | Where it comes from |
|---|---|---|
| `research` | Aggregated from a peer-reviewed open dataset | 7 emotion → colour associations from the colour–emotion survey |
| `editorial` | Assigned by a dataset's publisher | Emotion Dictionary (402 emotions, valence, arousal, neighbours, colour); palette moods and collection keywords |
| `inferred` | Written or derived by Palette AI | 70 curated vibe / aesthetic / sensory descriptors; lightness / chroma / contrast tendencies derived from valence and arousal |
| `reference` | Vocabulary only | 210 named colours → hue |
| `stated` | The user said it | Runtime only |

What is deliberately not done:

- The Emotion Dictionary's one-HEX-per-emotion values are stored as `editorialColour` and are **not** used to pick hues.
- No dominance values are invented; the dictionary has none. Dominance exists only as the model's per-brief reading.
- The palette dataset is 88% red / orange / yellow dominant and 83% tagged "refined". It is kept as reference examples and is not used to map moods to hues.
- The survey's participant-level rows are never stored. `scripts/aggregate-survey.py` writes only cue, colour and count.

To extend the database: add rows to `data/curated/vibes.json` (leave a value `null` rather than guess), or add a
source to the build script with its own `source` id and tier, then run `npm run build:db`.

## Testing

```bash
npm test          # 150 tests, no API key needed (model replies are mocked)
npm run eval      # keyword vs AI comparison over 32 prompts using recorded interpretations → docs/EVALUATION.md
npm run eval:live # same prompts against the real model (needs ANTHROPIC_API_KEY or GEMINI_API_KEY)
```

`tests/interpretation.test.ts` covers schema validation, server error handling (timeout, 429, 5xx, bad JSON, missing
tool call, retry), caching, database lookup, conflict resolution, exclusions through to generated colours,
fallback activation and refinement context — for both the Anthropic and Gemini provider paths, including which one
is chosen when both keys are present. The UI flow was checked in a browser with a mocked route, not by an automated
test. `tests/fixtures/briefs.ts` holds the 32 prompts and 2 refinements with recorded interpretations; these are
hand-written stand-ins for model output.
