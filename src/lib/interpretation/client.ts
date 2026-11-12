import {
  SCHEMA_VERSION, validateEnvelope,
  type InterpretErrorCode, type InterpretRequest, type InterpretSuccess,
} from './schema';

/** Browser side of the interpretation call: status check, request, re-validation, and a small local cache. */

const ENDPOINT = '/api/interpret';
const CACHE_KEY = 'palette-ai:interpretations:v1';
const CACHE_LIMIT = 40;
// The browser's own abort timer. Must be at least as long as the server's AI_TIMEOUT_MS, or the browser
// gives up before the model answers. Overridable at build time with VITE_REQUEST_TIMEOUT_MS; defaults to 30s,
// which is plenty once Gemini thinking is set low (the slow first calls were the model "thinking", not the network).
const REQUEST_TIMEOUT_MS = Number((import.meta as any).env?.VITE_REQUEST_TIMEOUT_MS) > 0
  ? Number((import.meta as any).env.VITE_REQUEST_TIMEOUT_MS)
  : 30_000;

export interface ClientDeps {
  fetch: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
}
const defaultDeps = (): ClientDeps => {
  let storage: ClientDeps['storage'] = null;
  try {
    storage = globalThis.localStorage ?? null;
  } catch {
    storage = null;
  }
  return { fetch: globalThis.fetch.bind(globalThis), storage };
};

export type InterpretResult = { ok: true; data: InterpretSuccess } | { ok: false; code: InterpretErrorCode; message: string };

/** Plain-language reason shown to the user whenever the keyword fallback takes over. */
export const FALLBACK_REASONS: Record<InterpretErrorCode, string> = {
  no_credentials: 'AI interpretation isn’t set up on this deployment (no API key on the server).',
  unavailable: 'The AI service isn’t available here.',
  network: 'The AI service couldn’t be reached.',
  timeout: 'The AI service took too long to answer.',
  rate_limited: 'The AI service is busy (rate limit reached).',
  overloaded: 'The AI model is temporarily overloaded. Please try again in a moment.',
  provider_error: 'The AI provider returned an error.',
  invalid_response: 'The AI reply didn’t pass validation, so it wasn’t used.',
  bad_request: 'The brief couldn’t be sent for interpretation.',
};

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** Cache identity: prompt + full refinement context + model + schema version. A refinement can never collide with a fresh brief. */
export function clientCacheKey(request: InterpretRequest, model: string): string {
  return JSON.stringify([
    SCHEMA_VERSION, model, normalise(request.prompt),
    request.context ? [normalise(request.context.original_prompt), request.context.refinements.map(normalise), request.context.previous_interpretation, request.context.current_targets] : null,
  ]);
}

function readCache(deps: ClientDeps): Record<string, InterpretSuccess> {
  try {
    return JSON.parse(deps.storage?.getItem(CACHE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function writeCache(deps: ClientDeps, cache: Record<string, InterpretSuccess>) {
  try {
    const keys = Object.keys(cache);
    for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT))) delete cache[k];
    deps.storage?.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* cache is a convenience; ignore storage failures */
  }
}

export interface AiStatus {
  available: boolean;
  model: string | null;
}
let statusPromise: Promise<AiStatus> | null = null;
export function resetClientState() {
  statusPromise = null;
}

/** Asks the server once per session whether AI interpretation is configured, and which model it uses. */
export function getAiStatus(deps: ClientDeps = defaultDeps()): Promise<AiStatus> {
  statusPromise ??= (async () => {
    try {
      const response = await deps.fetch(ENDPOINT, { method: 'GET' });
      if (!response.ok) return { available: false, model: null };
      const body = await response.json();
      return { available: body?.available === true, model: typeof body?.model === 'string' ? body.model : null };
    } catch {
      return { available: false, model: null };
    }
  })();
  return statusPromise;
}

export async function requestInterpretation(request: InterpretRequest, deps: ClientDeps = defaultDeps()): Promise<InterpretResult> {
  const status = await getAiStatus(deps);
  if (!status.model) return { ok: false, code: 'unavailable', message: FALLBACK_REASONS.unavailable };
  if (!status.available) return { ok: false, code: 'no_credentials', message: FALLBACK_REASONS.no_credentials };

  const key = clientCacheKey(request, status.model);
  const cache = readCache(deps);
  if (cache[key]) return { ok: true, data: { ...cache[key], meta: { ...cache[key].meta, cached: true } } };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await deps.fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    let body: any;
    try {
      body = await response.json();
    } catch {
      return { ok: false, code: 'invalid_response', message: FALLBACK_REASONS.invalid_response };
    }
    if (!response.ok) {
      const code: InterpretErrorCode = body?.error?.code && body.error.code in FALLBACK_REASONS ? body.error.code : 'provider_error';
      return { ok: false, code, message: FALLBACK_REASONS[code] };
    }
    // Validate again in the browser: nothing unvalidated reaches the resolver or the colour engine.
    const envelope = validateEnvelope({ interpretation: body?.interpretation, resolution_hints: body?.resolution_hints });
    if (!envelope.ok || typeof body?.meta?.model !== 'string') return { ok: false, code: 'invalid_response', message: FALLBACK_REASONS.invalid_response };
    const data: InterpretSuccess = { interpretation: envelope.data.interpretation, resolution_hints: envelope.data.resolution_hints, meta: { ...body.meta, cached: false } };
    cache[key] = data;
    writeCache(deps, cache);
    return { ok: true, data };
  } catch (e) {
    const code: InterpretErrorCode = (e as Error)?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, code, message: FALLBACK_REASONS[code] };
  } finally {
    clearTimeout(timer);
  }
}
