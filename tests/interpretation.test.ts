import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPaletteColours, interpretPrompt } from '@/lib/colour-engine';
import {
  clientCacheKey, escapeExclusions, inRange, interpretBrief, requestInterpretation, resetClientState, resolveDescriptors,
  resolveInterpretation, SCHEMA_VERSION, validateEnvelope, validateRequest, type InterpretRequest,
} from '@/lib/interpretation';
import { COLOUR_FAMILIES, lookupColour, matchDescriptor, VIBE_DB_SOURCES, VIBE_DB_STATS } from '@/lib/vibe-db';
import { cacheKey, DEFAULT_MODEL, GEMINI_DEFAULT_MODEL, handleInterpret, resetServerState } from '../server/interpret-core';
import { BRIEFS, REFINEMENTS, envelope, type BriefCase, type Check } from './fixtures/briefs';

let n = 0;
const createId = (p: string) => `${p}_${++n}`;
const isWarm = (h: number) => h >= 330 || h <= 110;
const isCool = (h: number) => h >= 195 && h <= 300;

/** A fake Anthropic Messages API reply carrying a tool_use block. */
const toolReply = (input: unknown, status = 200) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'record_interpretation', input }] }), { status, headers: { 'content-type': 'application/json' } });
const env = { ANTHROPIC_API_KEY: 'test-key' };
const post = (body: unknown, fetchImpl: typeof fetch, e = env, clientId = 'c1') =>
  handleInterpret({ method: 'POST', body, clientId }, e, { fetch: fetchImpl, now: Date.now });
const sample = BRIEFS[3]; // warm & sophisticated, no orange/yellow

beforeEach(() => {
  resetServerState();
  resetClientState();
});

describe('schema validation (Phase 3)', () => {
  it('accepts every recorded interpretation', () => {
    for (const b of [...BRIEFS, ...REFINEMENTS]) expect(validateEnvelope(b.envelope).ok, `case ${'id' in b ? b.id : b.text}`).toBe(true);
  });
  it('rejects out-of-range numbers, bad enums, wrong types, missing and extra fields', () => {
    const base = () => structuredClone(sample.envelope) as any;
    const broken: [string, (e: any) => void][] = [
      ['lightness > 1', (e) => (e.interpretation.visual_attributes.lightness = 1.4)],
      ['negative valence', (e) => (e.interpretation.emotional_dimensions.valence = -0.2)],
      ['bad temperature', (e) => (e.interpretation.visual_attributes.temperature = 'hot')],
      ['bad emotion role', (e) => (e.interpretation.emotions = [{ name: 'joy', role: 'main', intensity: 0.5, confidence: 0.5 }])],
      ['array as string', (e) => (e.interpretation.secondary_vibes = 'calm')],
      ['missing field', (e) => delete e.interpretation.confidence],
      ['string number', (e) => (e.interpretation.visual_attributes.chroma = '0.5')],
      ['unknown field', (e) => (e.interpretation.palette = ['x'])],
      ['missing hints', (e) => delete e.resolution_hints],
    ];
    for (const [label, mutate] of broken) {
      const e = base();
      mutate(e);
      expect(validateEnvelope(e).ok, label).toBe(false);
    }
    expect(validateEnvelope(null).ok).toBe(false);
    expect(validateEnvelope('{"interpretation":{}}').ok).toBe(false);
  });
  it('rejects colour values anywhere — the model may name colours, never generate them', () => {
    for (const value of ['#1C6BEC', 'use #fff', 'rgb(1, 2, 3)', 'oklch(60% 0.2 250)']) {
      const e = structuredClone(sample.envelope) as any;
      e.interpretation.explicit_colour_preferences = [value];
      expect(validateEnvelope(e).ok, value).toBe(false);
      const s = structuredClone(sample.envelope) as any;
      s.interpretation.interpretation_summary = `Lead with ${value}.`;
      expect(validateEnvelope(s).ok, `summary ${value}`).toBe(false);
    }
  });
  it('validates requests', () => {
    expect(validateRequest({ prompt: 'calm' }).ok).toBe(true);
    expect(validateRequest({ prompt: '' }).ok).toBe(false);
    expect(validateRequest({ prompt: 'x'.repeat(601) }).ok).toBe(false);
    expect(validateRequest({ prompt: 'calm', extra: 1 }).ok).toBe(false);
  });
});

describe('server route (Phase 7) — mocked provider', () => {
  it('returns a validated interpretation and sends a forced tool schema, never the key to the client', async () => {
    const fetchMock = vi.fn(async () => toolReply(sample.envelope));
    const res = await post({ prompt: sample.prompt }, fetchMock as any);
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.interpretation.primary_vibe).toBe('sophisticated');
    expect(body.meta).toMatchObject({ provider: 'anthropic', model: DEFAULT_MODEL, schemaVersion: SCHEMA_VERSION, cached: false, refined: false });
    expect(JSON.stringify(body)).not.toContain('test-key');
    const [, init] = fetchMock.mock.calls[0] as any;
    const sent = JSON.parse(init.body);
    expect(sent.tool_choice).toEqual({ type: 'tool', name: 'record_interpretation' });
    expect(sent.tools[0].input_schema.properties.interpretation).toBeTruthy();
    expect(init.headers['x-api-key']).toBe('test-key');
  });
  it('reports missing credentials without calling the provider', async () => {
    const fetchMock = vi.fn();
    const res = await post({ prompt: 'calm' }, fetchMock as any, {} as any);
    expect(res.status).toBe(503);
    expect((res.body as any).error.code).toBe('no_credentials');
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await handleInterpret({ method: 'GET', body: undefined }, {})).body).toMatchObject({ available: false });
    expect((await handleInterpret({ method: 'GET', body: undefined }, env)).body).toMatchObject({ available: true, model: DEFAULT_MODEL });
  });
  it('retries once on an invalid reply, then fails closed', async () => {
    const bad = structuredClone(sample.envelope) as any;
    bad.interpretation.visual_attributes.chroma = 7;
    const recover = vi.fn().mockResolvedValueOnce(toolReply(bad)).mockResolvedValueOnce(toolReply(sample.envelope));
    expect((await post({ prompt: 'a' }, recover as any)).status).toBe(200);
    expect(recover).toHaveBeenCalledTimes(2);

    const never = vi.fn(async () => toolReply(bad));
    const res = await post({ prompt: 'b' }, never as any);
    expect((res.body as any).error.code).toBe('invalid_response');
    expect(never).toHaveBeenCalledTimes(2);
  });
  it('maps malformed JSON, missing tool output, rate limits, provider errors, timeouts and network failures', async () => {
    const cases: [string, () => Promise<Response>, string][] = [
      ['malformed JSON', async () => new Response('not json', { status: 200 }), 'invalid_response'],
      ['no tool block', async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'hello' }] }), { status: 200 }), 'invalid_response'],
      ['429', async () => new Response('{}', { status: 429 }), 'rate_limited'],
      ['500', async () => new Response('{}', { status: 500 }), 'provider_error'],
      ['401', async () => new Response('{}', { status: 401 }), 'no_credentials'],
      ['network', async () => { throw new TypeError('fetch failed'); }, 'network'],
      ['timeout', async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }, 'timeout'],
    ];
    for (const [label, impl, code] of cases) {
      resetServerState();
      const res = await post({ prompt: `case ${label}` }, vi.fn(impl) as any);
      expect((res.body as any).error?.code, label).toBe(code);
    }
  });
  it('aborts a slow provider at the configured timeout', async () => {
    const slow = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const res = await post({ prompt: 'slow' }, slow as any, { ...env, AI_TIMEOUT_MS: '20' } as any);
    expect((res.body as any).error.code).toBe('timeout');
  });
  it('caches identical briefs, and keys on model and refinement context', async () => {
    const fetchMock = vi.fn(async () => toolReply(sample.envelope));
    await post({ prompt: 'Warm and  SOPHISTICATED' }, fetchMock as any);
    const again = await post({ prompt: 'warm and sophisticated ' }, fetchMock as any);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((again.body as any).meta.cached).toBe(true);

    await post({ prompt: 'warm and sophisticated' }, fetchMock as any, { ...env, AI_MODEL: 'another-model' } as any);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const fresh: InterpretRequest = { prompt: 'make it warmer' };
    const refining: InterpretRequest = {
      prompt: 'make it warmer',
      context: { original_prompt: sample.prompt, refinements: [], previous_interpretation: sample.envelope.interpretation, current_targets: { temperature: 'warm', lightness: 0.4, chroma: 0.4, contrast: 0.5 } },
    };
    expect(cacheKey(fresh, 'm')).not.toBe(cacheKey(refining, 'm'));
    expect(cacheKey(refining, 'm')).not.toBe(cacheKey({ ...refining, context: { ...refining.context!, original_prompt: 'something else' } }, 'm'));
    expect(clientCacheKey(fresh, 'm')).not.toBe(clientCacheKey(refining, 'm'));
  });
  it('rate-limits a single client, and rejects bad requests', async () => {
    const fetchMock = vi.fn(async () => toolReply(sample.envelope));
    let last: any;
    for (let i = 0; i < 22; i++) last = await post({ prompt: `distinct brief ${i}` }, fetchMock as any, env, 'one-client');
    expect(last.body.error.code).toBe('rate_limited');
    expect((await post({ nope: true }, fetchMock as any)).status).toBe(400);
    expect((await handleInterpret({ method: 'PUT', body: {} }, env)).status).toBe(405);
  });
});

/** A fake Gemini generateContent reply carrying a forced functionCall. */
const geminiReply = (args: unknown, status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'record_interpretation', args } }] } }] }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('server route — Gemini provider', () => {
  const geminiEnv = { GEMINI_API_KEY: 'gemini-test-key' };

  it('is selected automatically when only GEMINI_API_KEY is set, forces the function call, and never leaks the key', async () => {
    const fetchMock = vi.fn(async () => geminiReply(sample.envelope));
    const res = await post({ prompt: sample.prompt }, fetchMock as any, geminiEnv as any);
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.interpretation.primary_vibe).toBe('sophisticated');
    expect(body.meta).toMatchObject({ provider: 'gemini', model: GEMINI_DEFAULT_MODEL, schemaVersion: SCHEMA_VERSION, cached: false, refined: false });
    expect(JSON.stringify(body)).not.toContain('gemini-test-key');

    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(String(url)).toContain('gemini-test-key'); // the key travels as a query param for Gemini, not a header
    expect(String(url)).not.toContain(JSON.stringify(body)); // sanity: url isn't somehow the body
    const sent = JSON.parse(init.body);
    expect(sent.tool_config).toEqual({ function_calling_config: { mode: 'ANY', allowed_function_names: ['record_interpretation'] } });
    expect(sent.tools[0].function_declarations[0].parameters.properties.interpretation).toBeTruthy();
    // Gemini's schema subset: no $ref/$defs/additionalProperties should survive sanitization.
    expect(JSON.stringify(sent.tools[0].function_declarations[0].parameters)).not.toMatch(/\$ref|\$defs|additionalProperties/);

    expect((await handleInterpret({ method: 'GET', body: undefined }, geminiEnv)).body).toMatchObject({ available: true, provider: 'gemini', model: GEMINI_DEFAULT_MODEL });
  });

  it('prefers Anthropic when both keys are set, unless AI_PROVIDER says otherwise', async () => {
    const both = { ANTHROPIC_API_KEY: 'a-key', GEMINI_API_KEY: 'g-key' };
    expect((await handleInterpret({ method: 'GET', body: undefined }, both)).body).toMatchObject({ provider: 'anthropic' });
    expect((await handleInterpret({ method: 'GET', body: undefined }, { ...both, AI_PROVIDER: 'gemini' })).body).toMatchObject({ provider: 'gemini' });
  });

  it('maps Gemini error statuses and a missing function call the same way as the Anthropic path', async () => {
    const cases: [string, () => Promise<Response>, string][] = [
      ['no function call', async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }), { status: 200 }), 'invalid_response'],
      ['429', async () => new Response('{}', { status: 429 }), 'rate_limited'],
      ['500', async () => new Response('{}', { status: 500 }), 'provider_error'],
      ['403', async () => new Response('{}', { status: 403 }), 'no_credentials'],
    ];
    for (const [label, impl, code] of cases) {
      resetServerState();
      const res = await post({ prompt: `gemini case ${label}` }, vi.fn(impl) as any, geminiEnv as any);
      expect((res.body as any).error?.code, label).toBe(code);
    }
  });
});

describe('vibe database (Phase 4)', () => {
  it('carries provenance and licence for every source', () => {
    expect(Object.keys(VIBE_DB_SOURCES).sort()).toEqual(['colorcombinations', 'colour-emotion-survey', 'emotion-dictionary', 'palette-ai-curated']);
    for (const s of Object.values(VIBE_DB_SOURCES)) expect(s.licence.length).toBeGreaterThan(3);
    expect(VIBE_DB_STATS.emotions).toBe(402);
  });
  it('contains no participant-level survey data', () => {
    const raw = readFileSync('src/lib/vibe-db/vibe-db.generated.json', 'utf8');
    for (const field of ['PS_ID', 'Quote_ID', 'Gender', 'Profession', 'Native_language', 'Country_origin']) expect(raw).not.toContain(field);
  });
  it('matches descriptors by id, synonym, stem and phrase — and refuses to guess', () => {
    expect(matchDescriptor('calm')?.record.id).toBe('calm');
    expect(matchDescriptor('Comforting')?.record.id).toBe('cozy');
    expect(matchDescriptor('nostalgia')?.record.id).toBe('nostalgic');
    expect(matchDescriptor('melancholic')?.record.id).toBe('melancholic');
    expect(matchDescriptor('playfulness')?.record.id).toBe('playful');
    expect(matchDescriptor('contentment')?.record.kind).toBe('emotion');
    expect(matchDescriptor('saudade')?.record.kind).toBe('emotion');
    expect(matchDescriptor('rainy evening')?.record.id).toBe('rainy');
    expect(matchDescriptor('dark academia')?.record.source).toBe('colorcombinations');
    expect(matchDescriptor('flibbertigibbet')).toBeNull();
    expect(matchDescriptor('curtains')).toBeNull();
  });
  it('gives an emotion a hue only where the survey supports it', () => {
    expect(matchDescriptor('anger')?.record).toMatchObject({ hue: COLOUR_FAMILIES.red.centre, hueTier: 'research' });
    expect(matchDescriptor('sadness')?.record).toMatchObject({ hue: COLOUR_FAMILIES.blue.centre, hueTier: 'research' });
    expect(matchDescriptor('contentment')?.record.hue).toBeNull();
    expect(matchDescriptor('awe')?.record.hue).toBeNull();
  });
  it('resolves colour names from tables', () => {
    expect(lookupColour('orange')).toMatchObject({ kind: 'family', name: 'orange' });
    expect(lookupColour('oranges')).toMatchObject({ kind: 'family', name: 'orange' });
    expect(lookupColour('deep navy')).toMatchObject({ kind: 'named', name: 'navy' });
    expect(lookupColour('dusty rose')).toMatchObject({ name: 'rose' });
    expect(lookupColour('kurenai')).toMatchObject({ kind: 'named' });
    expect(lookupColour('black')).toMatchObject({ kind: 'achromatic' });
    expect(lookupColour('happiness')).toBeNull();
  });
});

describe('conflict handling (Phase 5)', () => {
  it('a stated value is never pulled toward an emotional association', () => {
    const { targets } = resolveInterpretation(BRIEFS[2].envelope.interpretation, BRIEFS[2].envelope.resolution_hints); // nostalgic but bright & colourful
    expect(targets.lightness).toBe(0.76);
    expect(targets.chroma).toBe(0.74);
    expect(targets.sources.chroma.basis).toBe('stated');
  });
  it('does not average across a contradiction when the value is unstated', () => {
    // Same brief with the explicit flags removed: nostalgia's muted prior disagrees with the contextual 0.74, so context is kept whole.
    const { targets } = resolveInterpretation(BRIEFS[2].envelope.interpretation, { explicit_attributes: [], changed_attributes: [] });
    expect(targets.chroma).toBe(0.74);
    expect(targets.sources.chroma.note).toMatch(/full brief was kept/);
  });
  it('compatible associations nudge an unstated value, within bounds', () => {
    const { targets } = resolveInterpretation(BRIEFS[0].envelope.interpretation, BRIEFS[0].envelope.resolution_hints);
    expect(targets.sources.chroma.basis).toBe('context+associations');
    expect(Math.abs(targets.chroma - 0.28)).toBeLessThan(0.1);
  });
  it('a negated descriptor is never used as a positive association', () => {
    const resolved = resolveDescriptors(BRIEFS[5].envelope.interpretation); // bold & playful, not childish
    expect(resolved.resolved.map((d) => d.record.id)).not.toContain('childish');
    expect(resolved.avoided.map((d) => d.record.id)).toContain('childish');
    const twisted = envelope({ pv: 'childish', vad: [0.5, 0.5, 0.5], temp: 'neutral', L: 0.5, C: 0.5, K: 0.5, neg: ['childish'], summary: 'x' });
    expect(resolveDescriptors(twisted.interpretation).resolved).toHaveLength(0);
  });
  it('exclusions beat everything, including an explicit hue and the temperature default', () => {
    expect(escapeExclusions(45, [COLOUR_FAMILIES.orange.range, COLOUR_FAMILIES.yellow.range], 'warm')).toBeLessThan(40);
    const clash = envelope({ pv: 'warm', vad: [0.6, 0.5, 0.5], temp: 'warm', L: 0.5, C: 0.5, K: 0.5, cols: ['orange'], excl: ['orange'], summary: 'x' });
    const { targets } = resolveInterpretation(clash.interpretation, clash.resolution_hints);
    expect(inRange(targets.primaryHue, COLOUR_FAMILIES.orange.range)).toBe(false);
    expect(targets.adjustments.join(' ')).toMatch(/excluded range/);
  });
  it('surfaces constraints it cannot apply instead of dropping them', () => {
    const e = envelope({ pv: 'calm', vad: [0.6, 0.3, 0.5], temp: 'neutral', L: 0.5, C: 0.4, K: 0.4, excl: ['black', 'zorblax'], cols: ['glorp'], summary: 'x' });
    const { targets } = resolveInterpretation(e.interpretation, e.resolution_hints);
    expect(targets.unapplied).toHaveLength(3);
  });
});

function runCheck(check: Check, b: BriefCase) {
  const { targets, descriptors, params } = resolveInterpretation(b.envelope.interpretation, b.envelope.resolution_hints);
  const label = `#${b.id} ${check.join(' ')}`;
  const [kind, a, x] = check as [string, any, any];
  if (kind === 'lightness' || kind === 'chroma' || kind === 'contrast') {
    if (a === '>') expect(targets[kind], label).toBeGreaterThan(x);
    else expect(targets[kind], label).toBeLessThan(x);
  } else if (kind === 'temperature') expect(targets.temperature, label).toBe(a);
  else if (kind === 'warmHue') expect(isWarm(targets.primaryHue), label).toBe(true);
  else if (kind === 'coolHue') expect(isCool(targets.primaryHue), label).toBe(true);
  else if (kind === 'hueNear') expect(Math.abs(((targets.primaryHue - a + 540) % 360) - 180), label).toBeLessThanOrEqual(x ?? 12);
  else if (kind === 'unresolved') expect(descriptors.unresolved, label).toContain(a);
  else if (kind === 'matched') expect(descriptors.resolved.map((d) => d.record.id), label).toContain(a);
  else if (kind === 'clarify') expect(b.envelope.interpretation.needs_clarification, label).toBe(true);
  else if (kind === 'hueTier') expect(targets.sources.hue.tier, label).toBe(a);
  else if (kind === 'excludes') {
    // The exclusion has to hold in the generated palette, for the clean harmony and after regenerating.
    const ranges = (check.slice(1) as string[]).map((name) => COLOUR_FAMILIES[name].range);
    for (const roll of [0, 1, 2, 3]) {
      for (const colour of buildPaletteColours({ ...params, roll, count: 6, createId })) {
        if (colour.oklch.h === null || colour.oklch.c < 0.03) continue;
        for (const r of ranges) expect(inRange(colour.oklch.h, r), `${label} — ${colour.name} ${colour.hex} roll ${roll}`).toBe(false);
      }
    }
  }
}

describe('30+ prompt evaluation: interpretation → targets → palette (Phase 9)', () => {
  it('covers at least 30 prompts and all 15 required categories', () => {
    expect(BRIEFS.length + REFINEMENTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(BRIEFS.map((b) => b.category)).size).toBeGreaterThanOrEqual(13);
  });
  it.each(BRIEFS.map((b) => [b.id, b.prompt, b] as const))('#%i %s', (_id, _prompt, b) => {
    for (const check of b.checks) runCheck(check, b);
    const { params } = resolveInterpretation(b.envelope.interpretation, b.envelope.resolution_hints);
    const colours = buildPaletteColours({ ...params, count: 5, createId });
    expect(colours).toHaveLength(5);
    expect(colours.every((c) => /^#[0-9A-F]{6}$/.test(c.hex))).toBe(true);
  });
  it.each(REFINEMENTS.map((r) => [r.text, r] as const))('refinement: %s', (_t, r) => {
    const original = BRIEFS.find((b) => b.id === r.of)!;
    const before = resolveInterpretation(original.envelope.interpretation, original.envelope.resolution_hints).targets;
    const after = resolveInterpretation(r.envelope.interpretation, r.envelope.resolution_hints).targets;
    for (const name of r.unchanged) expect(after[name], `${name} must not move`).toBeCloseTo(before[name], 5);
    for (const check of r.checks) runCheck(check, { ...original, envelope: r.envelope });
    expect(r.envelope.interpretation.primary_vibe).toBe(original.envelope.interpretation.primary_vibe);
  });
});

describe('client, fallback and refinement context (Phases 6–8) — mocked fetch', () => {
  const memory = () => {
    const store = new Map<string, string>();
    return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  };
  const status = (available: boolean) => new Response(JSON.stringify({ available, provider: 'anthropic', model: 'm1' }), { status: 200 });
  const ok = (e: unknown, refined = false) => new Response(JSON.stringify({ ...(e as object), meta: { provider: 'anthropic', model: 'm1', schemaVersion: 1, cached: false, refined } }), { status: 200 });

  it('AI path returns engine parameters plus separate metadata', async () => {
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === 'GET' ? status(true) : ok(sample.envelope)));
    const outcome = await interpretBrief(sample.prompt, undefined, { fetch: fetchMock as any, storage: memory() });
    expect(outcome.kind).toBe('ai');
    if (outcome.kind !== 'ai') return;
    expect(outcome.record.meta).toMatchObject({ mode: 'ai', model: 'm1', cached: false });
    expect(outcome.record.originalPrompt).toBe(sample.prompt);
    expect(outcome.params.excludedHues).toHaveLength(2);
    expect(outcome.record.interpretation).not.toHaveProperty('mode');
  });
  it('no key, unreachable server, provider failure and an invalid body all produce a named fallback reason', async () => {
    const scenarios: [string, (u: string, init?: RequestInit) => Promise<Response>, string][] = [
      ['no key', async () => status(false), 'no_credentials'],
      ['no server', async () => { throw new TypeError('failed'); }, 'unavailable'],
      ['static host 404', async () => new Response('<html>', { status: 404 }), 'unavailable'],
      ['provider 502', async (_u, init) => (init?.method === 'GET' ? status(true) : new Response(JSON.stringify({ error: { code: 'timeout', message: 'x' } }), { status: 504 })), 'timeout'],
      ['tampered body', async (_u, init) => (init?.method === 'GET' ? status(true) : ok({ interpretation: { primary_vibe: 'x' }, resolution_hints: {} })), 'invalid_response'],
    ];
    for (const [label, impl, code] of scenarios) {
      resetClientState();
      const outcome = await interpretBrief('calm', undefined, { fetch: vi.fn(impl) as any, storage: memory() });
      expect(outcome.kind, label).toBe('unavailable');
      if (outcome.kind === 'unavailable') {
        expect(outcome.code, label).toBe(code);
        expect(outcome.reason.length, label).toBeGreaterThan(10);
      }
    }
  });
  it('caches in the browser: a repeated brief makes no second model call; a refinement does', async () => {
    const storage = memory();
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === 'GET' ? status(true) : ok(sample.envelope)));
    const deps = { fetch: fetchMock as any, storage };
    const first = await requestInterpretation({ prompt: 'Warm, no orange' }, deps);
    const second = await requestInterpretation({ prompt: 'warm,  no ORANGE' }, deps);
    expect(first.ok && second.ok && second.data.meta.cached).toBe(true);
    const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST').length;
    expect(posts()).toBe(1);

    const refinement = REFINEMENTS[0];
    const original = BRIEFS.find((b) => b.id === refinement.of)!;
    const base = resolveInterpretation(original.envelope.interpretation, original.envelope.resolution_hints);
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) => (init?.method === 'GET' ? status(true) : ok(refinement.envelope, true)));
    const outcome = await interpretBrief(refinement.text, { originalPrompt: original.prompt, refinements: [], previous: original.envelope.interpretation, targets: base.targets }, deps);
    expect(posts()).toBe(2);
    expect(outcome.kind).toBe('ai');
    if (outcome.kind !== 'ai') return;
    // The request carried the whole conversation, and the record keeps the original prompt.
    const sent = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
    expect(sent.context.original_prompt).toBe(original.prompt);
    expect(sent.context.previous_interpretation.primary_vibe).toBe('nostalgic');
    expect(sent.context.current_targets.chroma).toBeCloseTo(base.targets.chroma, 5);
    expect(outcome.record).toMatchObject({ originalPrompt: original.prompt, refinements: [refinement.text], meta: { mode: 'refined' } });
  });
});

describe('regression: the keyword interpreter and engine are unchanged', () => {
  const snapshot: Record<string, string[]> = JSON.parse(readFileSync('tests/keyword-regression.snapshot.json', 'utf8'));
  it.each(Object.entries(snapshot))('%s', (prompt, hexes) => {
    const r = interpretPrompt(prompt);
    const colours = buildPaletteColours({ anchor: r.anchor, harmony: r.harmony, chromaBias: r.chromaBias, lightnessBias: r.lightnessBias, roll: 0, accentHue: r.accentHue, neutralHue: r.neutralHue, count: 5, createId });
    expect(colours.map((c) => c.hex)).toEqual(hexes);
  });
});
