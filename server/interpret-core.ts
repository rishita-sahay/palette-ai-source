// Server-side interpretation: validates the request, calls the model with a forced tool schema,
// validates the reply, caches it. Framework-free so the Vercel function, the Vite dev middleware
// and the tests all call the same code. The API key never leaves this file's process.
import {
  envelopeJsonSchema, SCHEMA_VERSION, validateEnvelope, validateRequest,
  type InterpretErrorCode, type InterpretFailure, type InterpretRequest, type InterpretSuccess,
} from '../src/lib/interpretation/schema.js';
import { PROMPT_VERSION, SYSTEM_PROMPT } from './system-prompt.js';

export type Provider = 'anthropic' | 'gemini' | 'groq';
/** Kept for anything that imported the old single-provider constant; reflects the Anthropic default. */
export const PROVIDER: Provider = 'anthropic';
export const DEFAULT_MODEL = 'claude-haiku-5-5';
export const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash';
// Groq is OpenAI-compatible and free. This model supports tool calling and is fast.
export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-20b';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Groq's OpenAI-compatible endpoint. Overridable (AI_BASE_URL) so OpenRouter or any other
// OpenAI-compatible host can reuse this same code path later.
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TOOL_NAME = 'record_interpretation';
// Gemini 3.x Flash defaults to "high" thinking, which adds tens of seconds of latency. This is a
// fill-the-fields extraction task, not a reasoning one, so we ask for the lowest thinking level.
// Override with GEMINI_THINKING_LEVEL ("minimal" | "low" | "medium" | "high") if a model needs it.
const DEFAULT_GEMINI_THINKING_LEVEL = 'low';
const DEFAULT_TIMEOUT_MS = 20_000;
const CACHE_LIMIT = 200;
const RATE_LIMIT = { windowMs: 60_000, max: 20 };

export interface ServerEnv {
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  /** Optional. When more than one key is set, picks which to use ('anthropic' | 'gemini' | 'groq'). Defaults to the first key present, in that order. */
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  AI_TIMEOUT_MS?: string;
  /** Gemini only. "minimal" | "low" | "medium" | "high". Lower is faster. Defaults to "low". */
  GEMINI_THINKING_LEVEL?: string;
  /** OpenAI-compatible providers (groq) only. Overrides the base chat-completions URL, e.g. for OpenRouter. */
  AI_BASE_URL?: string;
}

interface ResolvedProvider {
  provider: Provider;
  apiKey?: string;
  model: string;
}

/** Which provider runs, and with which model/key — based on AI_PROVIDER and whichever key(s) are present. */
function resolveProvider(env: ServerEnv): ResolvedProvider {
  const requested = env.AI_PROVIDER?.trim().toLowerCase();
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const groqKey = env.GROQ_API_KEY?.trim();
  const model = env.AI_MODEL?.trim();
  if (requested === 'groq' || (!requested && !anthropicKey && !geminiKey && groqKey)) {
    return { provider: 'groq', apiKey: groqKey, model: model || GROQ_DEFAULT_MODEL };
  }
  if (requested === 'gemini' || (!requested && !anthropicKey && geminiKey)) {
    return { provider: 'gemini', apiKey: geminiKey, model: model || GEMINI_DEFAULT_MODEL };
  }
  return { provider: 'anthropic', apiKey: anthropicKey, model: model || DEFAULT_MODEL };
}

/**
 * Gemini's function-declaration schema is an OpenAPI subset: no $ref/$defs, no additionalProperties,
 * no min/max-style keywords. This inlines $refs and keeps only what Gemini accepts, so the same Zod
 * schema that drives Anthropic's forced tool-use also drives Gemini's forced function call.
 */
function sanitizeForGemini(node: unknown, defs: Record<string, unknown>): unknown {
  if (Array.isArray(node)) return node.map((n) => sanitizeForGemini(n, defs));
  if (!node || typeof node !== 'object') return node;
  const obj = node as Record<string, unknown>;
  if (typeof obj.$ref === 'string') {
    const key = obj.$ref.replace(/^#\/\$defs\//, '').replace(/^#\/definitions\//, '');
    const target = defs[key];
    return target ? sanitizeForGemini(target, defs) : {};
  }
  const out: Record<string, unknown> = {};
  const type = Array.isArray(obj.type) ? (obj.type as string[]).find((t) => t !== 'null') ?? (obj.type as string[])[0] : obj.type;
  if (type) out.type = type;
  if (typeof obj.description === 'string') out.description = obj.description;
  if (obj.enum) out.enum = obj.enum;
  if (obj.items) out.items = sanitizeForGemini(obj.items, defs);
  if (obj.properties && typeof obj.properties === 'object') {
    out.properties = Object.fromEntries(
      Object.entries(obj.properties as Record<string, unknown>).map(([k, v]) => [k, sanitizeForGemini(v, defs)]),
    );
  }
  if (Array.isArray(obj.required)) out.required = obj.required;
  return out;
}

function geminiFunctionParameters(): Record<string, unknown> {
  const schema = envelopeJsonSchema() as Record<string, unknown>;
  const defs = (schema.$defs ?? schema.definitions ?? {}) as Record<string, unknown>;
  return sanitizeForGemini({ ...schema, $defs: undefined, definitions: undefined }, defs) as Record<string, unknown>;
}
export interface Deps {
  fetch: typeof fetch;
  now: () => number;
}
export interface CoreResponse {
  status: number;
  body: InterpretSuccess | InterpretFailure | { available: boolean; provider: string; model: string };
}

const fail = (status: number, code: InterpretErrorCode, message: string): CoreResponse => ({ status, body: { error: { code, message } } });

// Best-effort in-memory state. On serverless this lives per warm instance; the browser keeps its own cache too.
const cache = new Map<string, InterpretSuccess>();
const hits = new Map<string, number[]>();
export function resetServerState() {
  cache.clear();
  hits.clear();
}

export function normalisePrompt(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Identical brief + identical conversation + same provider/model/schema/prompt version → same key. A refinement always has a different key from a fresh brief. */
export function cacheKey(request: InterpretRequest, model: string, provider: Provider = PROVIDER): string {
  return JSON.stringify([
    SCHEMA_VERSION, PROMPT_VERSION, provider, model, normalisePrompt(request.prompt),
    request.context ? [normalisePrompt(request.context.original_prompt), request.context.refinements.map(normalisePrompt), request.context.previous_interpretation, request.context.current_targets] : null,
  ]);
}

function userMessage(request: InterpretRequest): string {
  if (!request.context) return `Brief:\n${request.prompt}`;
  const c = request.context;
  return [
    `Original brief:\n${c.original_prompt}`,
    c.refinements.length ? `Earlier refinements, in order:\n${c.refinements.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : '',
    `Previous interpretation (JSON):\n${JSON.stringify(c.previous_interpretation)}`,
    `Current resolved targets (JSON):\n${JSON.stringify(c.current_targets)}`,
    `New refinement:\n${request.prompt}`,
  ].filter(Boolean).join('\n\n');
}

type ProviderResult = { ok: true; input: unknown } | { ok: false; status: number; code: InterpretErrorCode; message: string };

async function withTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Logs a provider's error body to the server console (the terminal running the dev server, or the
 * Vercel function logs) so a 4xx/5xx is debuggable. Never returns the body to the browser: callers
 * still answer with a generic message, so nothing provider-specific — never the key — reaches a user.
 */
async function logProviderError(provider: Provider, model: string, response: Response): Promise<void> {
  let detail = '';
  try {
    detail = (await response.clone().text()).slice(0, 800);
  } catch {
    detail = '(could not read error body)';
  }
  console.error(`[interpret] ${provider} error ${response.status} (model "${model}"): ${detail}`);
}

async function callAnthropic(request: InterpretRequest, apiKey: string, model: string, timeoutMs: number, deps: Deps): Promise<ProviderResult> {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const response = await deps.fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          temperature: 0,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage(request) }],
          // Structured output: the model must answer by calling this tool, whose input is our schema.
          tools: [{ name: TOOL_NAME, description: 'Record the structured interpretation of the brief.', input_schema: envelopeJsonSchema() }],
          tool_choice: { type: 'tool', name: TOOL_NAME },
        }),
      });
      if (response.status === 429) return { ok: false, status: 429, code: 'rate_limited', message: 'The AI provider is rate-limiting requests.' };
      if (response.status === 401 || response.status === 403) {
        await logProviderError('anthropic', model, response);
        return { ok: false, status: 503, code: 'no_credentials', message: 'The AI provider rejected the configured API key.' };
      }
      if (response.status === 503 || response.status === 500) {
        await logProviderError('anthropic', model, response);
        return { ok: false, status: 503, code: 'overloaded', message: 'The AI model is temporarily overloaded.' };
      }
      if (!response.ok) {
        await logProviderError('anthropic', model, response);
        return { ok: false, status: 502, code: 'provider_error', message: `The AI provider returned an error (${response.status}).` };
      }
      let payload: any;
      try {
        payload = await response.json();
      } catch {
        return { ok: false, status: 502, code: 'invalid_response', message: 'The AI provider returned a reply that was not JSON.' };
      }
      const block = Array.isArray(payload?.content) ? payload.content.find((b: any) => b?.type === 'tool_use' && b?.name === TOOL_NAME) : null;
      if (!block) return { ok: false, status: 502, code: 'invalid_response', message: 'The model did not return a structured interpretation.' };
      return { ok: true, input: block.input };
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, status: 504, code: 'timeout', message: 'The AI provider took too long to answer.' };
    console.error(`[interpret] anthropic request threw (model "${model}"): ${(e as Error)?.message ?? e}`);
    return { ok: false, status: 502, code: 'network', message: 'Could not reach the AI provider.' };
  }
}

let geminiParametersCache: Record<string, unknown> | undefined;
function getGeminiParameters(): Record<string, unknown> {
  if (!geminiParametersCache) geminiParametersCache = geminiFunctionParameters();
  return geminiParametersCache;
}

async function callGemini(request: InterpretRequest, apiKey: string, model: string, timeoutMs: number, thinkingLevel: string, deps: Deps): Promise<ProviderResult> {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const url = `${GEMINI_API_URL_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await deps.fetch(url, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userMessage(request) }] }],
          tools: [
            {
              function_declarations: [
                { name: TOOL_NAME, description: 'Record the structured interpretation of the brief.', parameters: getGeminiParameters() },
              ],
            },
          ],
          // Structured output: force the model to answer only by calling this function, mirroring Anthropic's forced tool_choice.
          tool_config: { function_calling_config: { mode: 'ANY', allowed_function_names: [TOOL_NAME] } },
          // thinkingLevel keeps Gemini 3.x Flash from spending tens of seconds "thinking" on a simple extraction.
          generationConfig: { temperature: 0, thinkingConfig: { thinkingLevel } },
        }),
      });
      if (response.status === 429) return { ok: false, status: 429, code: 'rate_limited', message: 'The AI provider is rate-limiting requests.' };
      if (response.status === 401 || response.status === 403) {
        await logProviderError('gemini', model, response);
        return { ok: false, status: 503, code: 'no_credentials', message: 'The AI provider rejected the configured API key.' };
      }
      if (response.status === 503 || response.status === 500) {
        await logProviderError('gemini', model, response);
        return { ok: false, status: 503, code: 'overloaded', message: 'The AI model is temporarily overloaded.' };
      }
      if (!response.ok) {
        await logProviderError('gemini', model, response);
        return { ok: false, status: 502, code: 'provider_error', message: `The AI provider returned an error (${response.status}).` };
      }
      let payload: any;
      try {
        payload = await response.json();
      } catch {
        return { ok: false, status: 502, code: 'invalid_response', message: 'The AI provider returned a reply that was not JSON.' };
      }
      const parts = payload?.candidates?.[0]?.content?.parts;
      const call = Array.isArray(parts) ? parts.find((p: any) => p?.functionCall?.name === TOOL_NAME) : null;
      if (!call) {
        // A blocked prompt or an empty candidate lands here; log why so it is debuggable from the terminal.
        console.error('[interpret] gemini returned no function call:', JSON.stringify(payload?.promptFeedback ?? payload?.candidates?.[0]?.finishReason ?? payload).slice(0, 800));
        return { ok: false, status: 502, code: 'invalid_response', message: 'The model did not return a structured interpretation.' };
      }
      return { ok: true, input: call.functionCall.args };
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, status: 504, code: 'timeout', message: 'The AI provider took too long to answer.' };
    console.error(`[interpret] gemini request threw (model "${model}"): ${(e as Error)?.message ?? e}`);
    return { ok: false, status: 502, code: 'network', message: 'Could not reach the AI provider.' };
  }
}

/**
 * Groq (and any OpenAI-compatible host) via the Chat Completions API with forced tool calling.
 * The tool's parameters are standard JSON Schema — OpenAI-compatible APIs accept $ref/$defs, so the
 * raw envelope schema is used as-is (no Gemini-style flattening needed).
 */
async function callGroq(request: InterpretRequest, apiKey: string, model: string, timeoutMs: number, baseUrl: string, deps: Deps): Promise<ProviderResult> {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const response = await deps.fetch(baseUrl, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage(request) },
          ],
          tools: [{ type: 'function', function: { name: TOOL_NAME, description: 'Record the structured interpretation of the brief.', parameters: envelopeJsonSchema() } }],
          tool_choice: { type: 'function', function: { name: TOOL_NAME } },
        }),
      });
      if (response.status === 429) return { ok: false, status: 429, code: 'rate_limited', message: 'The AI provider is rate-limiting requests.' };
      if (response.status === 401 || response.status === 403) {
        await logProviderError('groq', model, response);
        return { ok: false, status: 503, code: 'no_credentials', message: 'The AI provider rejected the configured API key.' };
      }
      if (response.status === 503 || response.status === 500) {
        await logProviderError('groq', model, response);
        return { ok: false, status: 503, code: 'overloaded', message: 'The AI model is temporarily overloaded.' };
      }
      if (!response.ok) {
        await logProviderError('groq', model, response);
        return { ok: false, status: 502, code: 'provider_error', message: `The AI provider returned an error (${response.status}).` };
      }
      let payload: any;
      try {
        payload = await response.json();
      } catch {
        return { ok: false, status: 502, code: 'invalid_response', message: 'The AI provider returned a reply that was not JSON.' };
      }
      const toolCall = payload?.choices?.[0]?.message?.tool_calls?.find((c: any) => c?.function?.name === TOOL_NAME);
      if (!toolCall) {
        console.error('[interpret] groq returned no tool call:', JSON.stringify(payload?.choices?.[0]?.finish_reason ?? payload).slice(0, 800));
        return { ok: false, status: 502, code: 'invalid_response', message: 'The model did not return a structured interpretation.' };
      }
      // OpenAI-compatible tool arguments arrive as a JSON string.
      let args: unknown;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        return { ok: false, status: 502, code: 'invalid_response', message: 'The model returned tool arguments that were not valid JSON.' };
      }
      return { ok: true, input: args };
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, status: 504, code: 'timeout', message: 'The AI provider took too long to answer.' };
    console.error(`[interpret] groq request threw (model "${model}"): ${(e as Error)?.message ?? e}`);
    return { ok: false, status: 502, code: 'network', message: 'Could not reach the AI provider.' };
  }
}

function callModel(provider: Provider, request: InterpretRequest, apiKey: string, model: string, timeoutMs: number, thinkingLevel: string, baseUrl: string, deps: Deps): Promise<ProviderResult> {
  if (provider === 'gemini') return callGemini(request, apiKey, model, timeoutMs, thinkingLevel, deps);
  if (provider === 'groq') return callGroq(request, apiKey, model, timeoutMs, baseUrl, deps);
  return callAnthropic(request, apiKey, model, timeoutMs, deps);
}

export async function handleInterpret(
  input: { method: string; body: unknown; clientId?: string },
  env: ServerEnv,
  deps: Deps = { fetch: globalThis.fetch, now: Date.now },
): Promise<CoreResponse> {
  const { provider, apiKey, model } = resolveProvider(env);
  console.error(`[interpret] handler hit: ${input.method} → provider=${provider} model="${model}" key=${apiKey ? 'present' : 'MISSING'}`);

  // GET: lets the UI ask whether AI interpretation is configured, without revealing anything else.
  if (input.method === 'GET') return { status: 200, body: { available: !!apiKey, provider, model } };
  if (input.method !== 'POST') return fail(405, 'bad_request', 'Use POST.');

  const request = validateRequest(input.body);
  if (!request.ok) return fail(400, 'bad_request', `Invalid request: ${request.errors.join('; ')}`);
  if (!apiKey) return fail(503, 'no_credentials', 'No AI credentials are configured on the server.');

  const key = cacheKey(request.data, model, provider);
  const cached = cache.get(key);
  if (cached) return { status: 200, body: { ...cached, meta: { ...cached.meta, cached: true } } };

  // Small per-client limit so a public deployment cannot be used to drain the key. Cache hits are free.
  const id = input.clientId ?? 'anonymous';
  const now = deps.now();
  const recent = (hits.get(id) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) return fail(429, 'rate_limited', 'Too many interpretation requests. Try again in a minute.');
  hits.set(id, [...recent, now]);

  const timeoutMs = Number(env.AI_TIMEOUT_MS) > 0 ? Number(env.AI_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  const thinkingLevel = env.GEMINI_THINKING_LEVEL?.trim() || DEFAULT_GEMINI_THINKING_LEVEL;
  const baseUrl = env.AI_BASE_URL?.trim() || GROQ_API_URL;
  console.error(`[interpret] calling ${provider} model "${model}"${provider === 'gemini' ? ` (thinking=${thinkingLevel})` : ''} (key ${apiKey.slice(0, 4)}…, ${apiKey.length} chars)`);
  let lastErrors: string[] = [];
  // Up to 3 attempts. Retry on a validation miss (once) and on a transient "overloaded" 503/500
  // (with a short backoff), since those clear on their own. Every other error fails fast.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await callModel(provider, request.data, apiKey, model, timeoutMs, thinkingLevel, baseUrl, deps);
    if (!result.ok) {
      const lastAttempt = attempt === MAX_ATTEMPTS - 1;
      if (result.code === 'overloaded' && !lastAttempt) {
        await sleep(300 * (attempt + 1)); // 300ms, then 600ms
        continue;
      }
      if (result.code === 'invalid_response' && attempt === 0) continue;
      return fail(result.status, result.code, result.message);
    }
    const envelope = validateEnvelope(result.input);
    if (envelope.ok) {
      const success: InterpretSuccess = {
        interpretation: envelope.data.interpretation,
        resolution_hints: envelope.data.resolution_hints,
        meta: { provider, model, schemaVersion: SCHEMA_VERSION, cached: false, refined: !!request.data.context },
      };
      cache.set(key, success);
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
      return { status: 200, body: success };
    }
    lastErrors = envelope.errors;
  }
  return fail(502, 'invalid_response', `The model's interpretation failed validation: ${lastErrors.slice(0, 3).join('; ')}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
